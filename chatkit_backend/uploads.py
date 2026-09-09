"""Private client attachments with bounded format checks, not malware scanning."""
import base64
import io
import json
import os
import re
import zipfile
from uuid import uuid4

from chatkit.agents import ThreadItemConverter
from chatkit.store import AttachmentStore, NotFoundError
from chatkit.types import FileAttachment

MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_ATTACHMENTS = 3
MAX_CONTEXT_ATTACHMENTS = 6
MAX_CLIENT_BYTES = 50 * 1024 * 1024
UPLOAD_ID = re.compile(r"^atc_[0-9a-f]{32}$")
TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".csv": "text/csv",
    ".tsv": "text/tab-separated-values",
    ".json": "application/json",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".log": "text/plain",
    ".yaml": "text/yaml",
    ".yml": "text/yaml",
    ".xml": "application/xml",
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".ts": "text/plain",
    ".py": "text/plain",
    ".sql": "text/plain",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}
OFFICE_PARTS = {".docx": "word/document.xml", ".xlsx": "xl/workbook.xml", ".pptx": "ppt/presentation.xml"}


class UploadError(Exception):
    def __init__(self, code, status=400):
        self.code = code
        self.status = status
        super().__init__(code)


def uploads_enabled():
    return os.getenv("CHATKIT_UPLOADS_ENABLED", "true").lower() == "true"


def validate_file(filename, content):
    if not isinstance(filename, str) or not 1 <= len(filename) <= 180:
        raise UploadError("upload_invalid_file")
    if any(ord(char) < 32 for char in filename) or any(char in filename for char in "/\\"):
        raise UploadError("upload_invalid_file")
    extension = os.path.splitext(filename)[1].lower()
    if extension not in TYPES:
        raise UploadError("upload_type_not_allowed", 415)
    if not 0 < len(content) <= MAX_FILE_BYTES:
        raise UploadError("upload_too_large", 413)
    valid = False
    if extension == ".pdf":
        valid = content.startswith(b"%PDF-")
    elif extension == ".png":
        valid = content.startswith(b"\x89PNG\r\n\x1a\n")
    elif extension in {".jpg", ".jpeg"}:
        valid = content.startswith(b"\xff\xd8\xff")
    elif extension == ".webp":
        valid = content.startswith(b"RIFF") and content[8:12] == b"WEBP"
    elif extension == ".gif":
        valid = content.startswith((b"GIF87a", b"GIF89a"))
    elif extension not in OFFICE_PARTS:
        try:
            text = content.decode("utf-8-sig")
            valid = not any(ord(char) < 32 and char not in "\r\n\t" for char in text) and bool(text.strip())
            if extension == ".json":
                json.loads(text)
        except (UnicodeError, ValueError, RecursionError):
            valid = False
    elif extension in OFFICE_PARTS:
        # Inspect only ZIP metadata here, without decompressing client files.
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                entries = archive.infolist()
                names = {entry.filename for entry in entries}
                valid = ("[Content_Types].xml" in names and OFFICE_PARTS[extension] in names
                         and len(entries) <= 1000
                         and sum(entry.file_size for entry in entries) <= 20 * 1024 * 1024
                         and not any(entry.flag_bits & 1 or "vbaproject" in entry.filename.lower()
                                     or ".." in entry.filename.split("/") for entry in entries))
        except (zipfile.BadZipFile, ValueError):
            pass
    if not valid:
        raise UploadError("upload_invalid_file")
    return TYPES[extension]


def attachment_metadata(row):
    # Images use a file chip, so no private preview URL is exposed to the iframe.
    return FileAttachment(id=row["id"], name=row["filename"], mime_type=row["mime_type"],
                          thread_id=row.get("thread_id"))


async def upload_file(context, filename, content):
    if not uploads_enabled():
        raise UploadError("uploads_not_configured", 503)
    mime_type = validate_file(filename, content)
    cursor = await context.db.execute("""INSERT INTO portal_chatkit_upload_attempts
        (client_id,user_id,period_start,attempts) VALUES(%s,%s,(NOW() AT TIME ZONE 'UTC')::date,1)
        ON CONFLICT(client_id,user_id,period_start) DO UPDATE
          SET attempts=portal_chatkit_upload_attempts.attempts+1
          WHERE portal_chatkit_upload_attempts.attempts < 30 RETURNING attempts""", context.scope)
    if not await cursor.fetchone():
        raise UploadError("upload_daily_limit", 429)
    identifier = "atc_" + uuid4().hex
    async with context.db.transaction():
        # Serialize storage reservations across all users of this client.
        await context.db.execute("SELECT id FROM portal_clients WHERE id=%s FOR UPDATE", (context.client_id,))
        await context.db.execute("""DELETE FROM portal_chatkit_uploads WHERE client_id=%s
            AND thread_id IS NULL AND created_at < NOW()-INTERVAL '24 hours'""", (context.client_id,))
        cursor = await context.db.execute("""SELECT COALESCE(SUM(octet_length(content)),0) AS bytes
            FROM portal_chatkit_uploads WHERE client_id=%s""", (context.client_id,))
        if (await cursor.fetchone())["bytes"] + len(content) > MAX_CLIENT_BYTES:
            raise UploadError("upload_storage_limit", 429)
        await context.db.execute("""INSERT INTO portal_chatkit_uploads
            (id,client_id,user_id,filename,mime_type,content) VALUES(%s,%s,%s,%s,%s,%s)""",
            (identifier, *context.scope, filename, mime_type, content))
    return attachment_metadata({"id": identifier, "filename": filename, "mime_type": mime_type})


async def load_upload(context, identifier, *, include_content=False):
    if not UPLOAD_ID.fullmatch(identifier):
        raise NotFoundError("Attachment not found")
    fields = "id,filename,mime_type,thread_id" + (",content" if include_content else "")
    cursor = await context.db.execute(f"""SELECT {fields} FROM portal_chatkit_uploads
        WHERE client_id=%s AND user_id=%s AND id=%s
          AND (thread_id IS NOT NULL OR created_at > NOW()-INTERVAL '24 hours')""", (*context.scope, identifier))
    row = await cursor.fetchone()
    if not row:
        raise NotFoundError("Attachment not found")
    return row


class PrivateAttachmentStore(AttachmentStore):
    async def delete_attachment(self, attachment_id, context):
        row = await load_upload(context, attachment_id)
        if row["thread_id"]:
            raise UploadError("upload_already_attached", 409)
        await context.db.execute("DELETE FROM portal_chatkit_uploads WHERE client_id=%s AND user_id=%s AND id=%s AND thread_id IS NULL",
                                 (*context.scope, attachment_id))


class AttachmentConverter(ThreadItemConverter):
    def __init__(self, context, included_ids):
        self.context = context
        self.included_ids = included_ids
        self.sent_ids = set()

    async def attachment_to_message_content(self, attachment):
        if attachment.id not in self.included_ids:
            return {"type": "input_text", "text": "[Older attachment omitted from this reply's context. Ask the user to attach it again if needed.]"}
        if attachment.id in self.sent_ids:
            return {"type": "input_text", "text": "[This attachment is already included earlier in this request.]"}
        row = await load_upload(self.context, attachment.id, include_content=True)
        if row["thread_id"] != self.context.thread_id:
            raise NotFoundError("Attachment not found")
        self.sent_ids.add(attachment.id)
        data = f"data:{row['mime_type']};base64," + base64.b64encode(bytes(row["content"])).decode()
        if row["mime_type"].startswith("image/"):
            return {"type": "input_image", "image_url": data, "detail": "auto"}
        if os.path.splitext(row["filename"])[1].lower() not in {".pdf", ".docx", ".xlsx", ".pptx", ".csv", ".tsv"}:
            # Text formats are sent as untrusted user text, never rendered as HTML
            # or executed. Bound model input independently of the storage limit.
            content = bytes(row["content"]).decode("utf-8-sig")
            if len(content) > 40000:
                content = content[:40000] + "\n[File text truncated at 40,000 characters.]"
            return {"type": "input_text", "text": f"Uploaded reference file: {row['filename']}\n{content}"}
        return {"type": "input_file", "filename": row["filename"], "file_data": data}

import base64
import hashlib
import hmac
import io
import json
import os
import sys
import time
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import app, validate_payload
from chatkit.store import NotFoundError
from chatkit.types import FileAttachment
from store import Context, PostgresStore
from uploads import (AttachmentConverter, MAX_FILE_BYTES, PrivateAttachmentStore, UploadError,
                     load_upload, upload_file, validate_file)

IDENTIFIER = "atc_" + "a" * 32
SECRET = "test-only-upload-secret-with-at-least-32-characters"


def office_file(part, *, macros=False):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr(part, "<document/>")
        if macros:
            archive.writestr("word/vbaProject.bin", "not executable test data")
    return output.getvalue()


class UploadValidationTests(unittest.TestCase):
    def test_known_text_office_and_image_formats(self):
        for filename, content in [("table.csv", b"item,total\nx,42"), ("data.json", b'{"total":42}'),
            ("readme.md", "你好".encode()), ("code.py", b"print('reference only')"),
            ("doc.docx", office_file("word/document.xml")), ("sheet.xlsx", office_file("xl/workbook.xml")),
            ("slides.pptx", office_file("ppt/presentation.xml")), ("report.pdf", b"%PDF-1.7\nexample"),
            ("image.png", b"\x89PNG\r\n\x1a\nexample"), ("photo.jpg", b"\xff\xd8\xffexample")]:
            with self.subTest(filename=filename):
                self.assertTrue(validate_file(filename, content))

    def test_mismatches_unknown_extensions_macros_and_invalid_data_are_rejected(self):
        for filename, content in [("run.exe", b"MZ"), ("unknown.xyz", b"text"), ("archive.zip", b"PK"),
            ("photo.png", b"<html>not an image</html>"), ("file.pdf", b"MZ executable"),
            ("../file.txt", b"text"), ("data.json", b"{invalid}"), ("text.txt", b"text\x00binary"),
            ("doc.docx", office_file("word/document.xml", macros=True)),
            ("fake.xlsx", office_file("word/document.xml")), ("file.txt", b"x" * (MAX_FILE_BYTES + 1))]:
            with self.subTest(filename=filename):
                with self.assertRaises(UploadError):
                    validate_file(filename, content)

    def test_protocol_allows_attachment_only_messages_but_not_arbitrary_ids_or_overrides(self):
        payload = {"type": "threads.create", "params": {"input": {
            "content": [], "attachments": [IDENTIFIER], "inference_options": {}}}}
        self.assertEqual(validate_payload(payload).params.input.attachments, [IDENTIFIER])
        for identifiers in [["file_foreign"], [IDENTIFIER, IDENTIFIER], ["atc_" + str(n) * 32 for n in range(4)]]:
            payload["params"]["input"]["attachments"] = identifiers
            with self.assertRaises(ValueError):
                validate_payload(payload)


class UploadStorageTests(unittest.IsolatedAsyncioTestCase):
    def context(self):
        db = MagicMock()
        db.execute = AsyncMock()
        db.transaction.return_value = AsyncMock()
        return Context(db, "1", "2", "", {"id": "1"}, thread_id="thr_test")

    async def test_storage_is_private_and_limits_run_before_inserting_bytes(self):
        context = self.context()
        context.db.execute.return_value.fetchone = AsyncMock(side_effect=[{"attempts": 1}, {"bytes": 0}])
        attachment = await upload_file(context, "report.csv", b"name,total\nx,42")
        self.assertEqual(attachment.type, "file")
        self.assertNotIn("content", attachment.model_dump())
        insert = context.db.execute.await_args
        self.assertEqual(insert.args[1][1:3], context.scope)
        self.assertEqual(insert.args[1][-1], b"name,total\nx,42")
        with patch.dict(os.environ, {"CHATKIT_UPLOADS_ENABLED": "false"}):
            context.db.execute.reset_mock()
            with self.assertRaises(UploadError):
                await upload_file(context, "file.txt", b"hello")
            context.db.execute.assert_not_awaited()
        context.db.execute.return_value.fetchone = AsyncMock(return_value=None)
        with self.assertRaises(UploadError) as error:
            await upload_file(context, "file.txt", b"hello")
        self.assertEqual(error.exception.code, "upload_daily_limit")
        self.assertEqual(context.db.execute.await_count, 1)

    async def test_read_bind_and_delete_reject_other_owners_and_threads(self):
        context = self.context()
        context.db.execute.return_value.fetchone = AsyncMock(return_value=None)
        with self.assertRaises(NotFoundError):
            await load_upload(context, IDENTIFIER)
        query, params = context.db.execute.await_args.args
        self.assertIn("client_id=%s AND user_id=%s", query)
        self.assertEqual(params, (*context.scope, IDENTIFIER))
        attached = {"id": IDENTIFIER, "filename": "x.txt", "mime_type": "text/plain", "thread_id": "thr_other"}
        with patch("uploads.load_upload", new_callable=AsyncMock, return_value=attached):
            with self.assertRaises(UploadError):
                await PrivateAttachmentStore().delete_attachment(IDENTIFIER, context)
        with patch("store.load_upload", new_callable=AsyncMock, return_value=attached):
            with self.assertRaises(UploadError):
                await PostgresStore().save_attachment(FileAttachment(id=IDENTIFIER, name="x.txt",
                    mime_type="text/plain", thread_id="thr_test"), context)

    async def test_converter_delivers_data_to_model_without_public_urls_or_execution(self):
        context = self.context()
        for name, mime, content, expected in [("report.pdf", "application/pdf", b"%PDF example", "input_file"),
            ("sheet.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", b"zip", "input_file"),
            ("photo.png", "image/png", b"image", "input_image"),
            ("data.json", "application/json", b'{"total":42}', "input_text"),
            ("page.html", "text/html", b"<script>untrusted()</script>", "input_text")]:
            row = {"id": IDENTIFIER, "filename": name, "mime_type": mime, "content": content, "thread_id": "thr_test"}
            attachment = FileAttachment(id=IDENTIFIER, name=name, mime_type=mime)
            converter = AttachmentConverter(context, {IDENTIFIER})
            with patch("uploads.load_upload", new_callable=AsyncMock, return_value=row) as load:
                result = await converter.attachment_to_message_content(attachment)
                self.assertEqual(result["type"], expected)
                if expected == "input_file":
                    self.assertEqual(base64.b64decode(result["file_data"].split(",", 1)[1]), content)
                elif expected == "input_image":
                    self.assertTrue(result["image_url"].startswith("data:image/"))
                else:
                    self.assertIn(content.decode(), result["text"])
                repeated = await converter.attachment_to_message_content(attachment)
                self.assertIn("already included", repeated["text"])
                load.assert_awaited_once()
            with patch("uploads.load_upload", new_callable=AsyncMock, return_value={**row, "thread_id": "thr_other"}):
                with self.assertRaises(NotFoundError):
                    await AttachmentConverter(context, {IDENTIFIER}).attachment_to_message_content(attachment)

    async def test_unsigned_and_signed_upload_endpoint(self):
        body = json.dumps({"client_id": "1", "user_id": "2", "instructions": "", "payload": {
            "filename": "report.csv", "content": base64.b64encode(b"total\n42").decode()}}).encode()
        timestamp = str(int(time.time())).encode()
        signature = hmac.new(SECRET.encode(), timestamp + b"." + body, hashlib.sha256).hexdigest().encode()

        async def post(headers):
            sent = []
            scope = {"type": "http", "asgi": {"version": "3.0", "spec_version": "2.4"},
                "http_version": "1.1", "method": "POST", "scheme": "http", "path": "/chatkit/upload",
                "raw_path": b"/chatkit/upload", "query_string": b"", "root_path": "", "headers": headers,
                "server": ("test", 80), "client": ("127.0.0.1", 1)}
            async def receive(): return {"type": "http.request", "body": body, "more_body": False}
            async def send(message): sent.append(message)
            await app(scope, receive, send)
            return sent

        db = AsyncMock()
        with patch.dict(os.environ, {"CHATKIT_BACKEND_SECRET": SECRET, "DATABASE_URL": "test-only"}), \
                patch("app.connect_database", new_callable=AsyncMock, return_value=db) as connect, \
                patch("app.load_client", new_callable=AsyncMock, return_value={"id": "1"}), \
                patch("app.upload_file", new_callable=AsyncMock, return_value=FileAttachment(
                    id=IDENTIFIER, name="report.csv", mime_type="text/csv")) as upload:
            self.assertEqual((await post([]))[0]["status"], 401)
            connect.assert_not_awaited()
            sent = await post([(b"x-chatkit-timestamp", timestamp), (b"x-chatkit-signature", signature)])
            self.assertEqual(sent[0]["status"], 200)
            self.assertEqual(upload.await_args.args[0].scope, ("1", "2"))
            self.assertEqual(upload.await_args.args[1:], ("report.csv", b"total\n42"))
            self.assertEqual(json.loads(sent[1]["body"])["id"], IDENTIFIER)


if __name__ == "__main__":
    unittest.main()

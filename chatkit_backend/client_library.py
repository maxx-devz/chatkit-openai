"""Durable, client-scoped files and links for cross-conversation retrieval."""
import io
import os
import re
import zipfile
from datetime import date
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4
from xml.etree import ElementTree

from agents import function_tool
from ai_provider import openai_hosted_client

from uploads import load_upload

LIBRARY_ID = re.compile(r"^lib_[0-9a-f]{32}$")
MAX_LIBRARY_BYTES = 100 * 1024 * 1024
TEXT_MIME_PREFIXES = ("text/", "application/json", "application/xml")
SEARCHABLE_BINARY_EXTENSIONS = {".pdf", ".docx", ".pptx"}


class LibraryError(ValueError):
    pass


def clean_text(value, maximum, label, *, required=False):
    value = value.strip() if isinstance(value, str) else ""
    if (required and not value) or len(value) > maximum or any(ord(char) < 32 and char not in "\r\n\t" for char in value):
        raise LibraryError(f"{label} is invalid")
    return value


def clean_date(value, label):
    value = clean_text(value, 10, label)
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise LibraryError(f"{label} must use YYYY-MM-DD") from error


def clean_url(value):
    value = clean_text(value, 1000, "URL", required=True)
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise LibraryError("Only normal HTTPS links without embedded credentials can be saved")
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path or "/", parsed.query, ""))


def extracted_text(row):
    if row["mime_type"].startswith(TEXT_MIME_PREFIXES):
        text = bytes(row["content"]).decode("utf-8-sig", errors="strict")
        return text[:100_000]
    return ""


def spreadsheet_text(content):
    """Extract bounded cell text from validated XLSX XML without evaluating formulas."""
    lines = []
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = ["".join(node.itertext()) for node in root]
        sheet_names = sorted(value for value in archive.namelist()
                             if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", value))
        for name in sheet_names:
            lines.append(f"[{name.rsplit('/', 1)[-1]}]")
            root = ElementTree.fromstring(archive.read(name))
            for cell in root.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c"):
                reference = cell.get("r", "cell")
                kind = cell.get("t")
                value_node = cell.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v")
                inline = cell.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}is")
                value = "".join(inline.itertext()) if inline is not None else (value_node.text if value_node is not None else "")
                if kind == "s" and value.isdigit() and int(value) < len(shared):
                    value = shared[int(value)]
                if value:
                    lines.append(f"{reference}: {value}")
                if sum(map(len, lines)) > 200_000:
                    lines.append("[Spreadsheet search text truncated]")
                    return "\n".join(lines)
    return "\n".join(lines)


def index_payload(source, title, start, end):
    extension = os.path.splitext(source["filename"])[1].lower()
    period = " to ".join(value.isoformat() for value in (start, end) if value) or "not specified"
    prefix = f"Client library title: {title}\nReporting period: {period}\nOriginal filename: {source['filename']}\n\n"
    safe_title = re.sub(r"[^A-Za-z0-9_-]+", "_", title).strip("_")[:80] or "client_document"
    suffix = f"_{start.year}" if start else ""
    if extension in SEARCHABLE_BINARY_EXTENSIONS:
        upload = io.BytesIO(bytes(source["content"]))
        upload.name = f"{safe_title}{suffix}{extension}"
        return upload
    if extension == ".xlsx":
        text = spreadsheet_text(bytes(source["content"]))
    elif source["mime_type"].startswith(TEXT_MIME_PREFIXES):
        text = bytes(source["content"]).decode("utf-8-sig", errors="strict")
    else:
        return None
    upload = io.BytesIO((prefix + text[:200_000]).encode("utf-8"))
    upload.name = f"{safe_title}{suffix}.txt"
    return upload


async def ensure_vector_store(context):
    current = (context.client.get("openai_vector_store_id") or "").strip()
    if current:
        context.config["vectorStoreId"] = current
        return current
    client = openai_hosted_client()
    if client is None:
        raise LibraryError("Semantic indexing requires a separate OpenAI API key")
    store = await client.vector_stores.create(name=f"AOC client {context.client_id} knowledge")
    async with context.db.transaction():
        cursor = await context.db.execute(
            "UPDATE portal_clients SET openai_vector_store_id=%s,updated_at=NOW() "
            "WHERE id=%s AND openai_vector_store_id IS NULL RETURNING openai_vector_store_id",
            (store.id, context.client_id),
        )
        row = await cursor.fetchone()
        if not row:
            cursor = await context.db.execute(
                "SELECT openai_vector_store_id FROM portal_clients WHERE id=%s", (context.client_id,)
            )
            row = await cursor.fetchone()
    chosen = row["openai_vector_store_id"]
    if chosen != store.id:
        await client.vector_stores.delete(store.id)
    context.client["openai_vector_store_id"] = chosen
    context.config["vectorStoreId"] = chosen
    return chosen


async def save_attachment(context, *, filename, title, description="", period_start="", period_end=""):
    title = clean_text(title, 180, "Title", required=True)
    description = clean_text(description, 4000, "Description")
    start = clean_date(period_start, "Start date")
    end = clean_date(period_end, "End date")
    if start and end and start > end:
        raise LibraryError("Start date cannot be after end date")
    candidates = []
    for identifier in context.request_attachment_ids:
        row = await load_upload(context, identifier, include_content=True)
        if row["thread_id"] == context.thread_id:
            candidates.append(row)
    if filename:
        candidates = [row for row in candidates if row["filename"].casefold() == filename.strip().casefold()]
    if len(candidates) != 1:
        available = [row["filename"] for row in candidates]
        raise LibraryError("Choose exactly one newly attached file" + (f": {', '.join(available)}" if available else ""))
    source = candidates[0]
    identifier = "lib_" + uuid4().hex
    content = bytes(source["content"])
    async with context.db.transaction():
        await context.db.execute("SELECT id FROM portal_clients WHERE id=%s FOR UPDATE", (context.client_id,))
        cursor = await context.db.execute(
            "SELECT COALESCE(SUM(octet_length(content)),0) AS bytes FROM portal_client_library "
            "WHERE client_id=%s AND content IS NOT NULL", (context.client_id,)
        )
        if (await cursor.fetchone())["bytes"] + len(content) > MAX_LIBRARY_BYTES:
            raise LibraryError("This client's permanent document library is full")
        cursor = await context.db.execute("""
            INSERT INTO portal_client_library
              (id,client_id,submitted_by,source_type,title,description,filename,mime_type,content,
               extracted_text,period_start,period_end,source_upload_id,index_status)
            VALUES (%s,%s,%s,'file',%s,%s,%s,%s,%s,%s,%s,%s,%s,'pending')
            ON CONFLICT (client_id,source_upload_id) DO NOTHING RETURNING id
        """, (identifier, *context.scope, title, description, source["filename"], source["mime_type"],
                content, extracted_text(source), start, end, source["id"]))
        inserted = await cursor.fetchone()
    if not inserted:
        return {"saved": True, "alreadySaved": True, "filename": source["filename"]}

    try:
        upload = index_payload(source, title, start, end)
        if upload is None:
            await context.db.execute(
                "UPDATE portal_client_library SET index_status='not_applicable',updated_at=NOW() "
                "WHERE client_id=%s AND id=%s", (context.client_id, identifier),
            )
            return {"saved": True, "id": identifier, "filename": source["filename"],
                    "searchStatus": "saved_not_searchable",
                    "downloadUrl": f"{context.portal_origin}/api/client-library/{identifier}"}
        store_id = await ensure_vector_store(context)
        client = openai_hosted_client()
        if client is None:
            raise LibraryError("Semantic indexing requires a separate OpenAI API key")
        indexed = await client.vector_stores.files.upload_and_poll(
            vector_store_id=store_id,
            file=upload,
            attributes={
                "library_id": identifier,
                "title": title[:512],
                "period_start": start.isoformat() if start else "",
                "period_end": end.isoformat() if end else "",
            },
        )
        await context.db.execute(
            "UPDATE portal_client_library SET openai_file_id=%s,index_status='ready',updated_at=NOW() "
            "WHERE client_id=%s AND id=%s", (indexed.id, context.client_id, identifier),
        )
        status = "ready"
    except Exception:
        await context.db.execute(
            "UPDATE portal_client_library SET index_status='failed',updated_at=NOW() WHERE client_id=%s AND id=%s",
            (context.client_id, identifier),
        )
        status = "saved_but_indexing_failed"
    return {"saved": True, "id": identifier, "filename": source["filename"], "searchStatus": status,
            "downloadUrl": f"{context.portal_origin}/api/client-library/{identifier}"}


async def save_link(context, *, url, title, description="", period_start="", period_end=""):
    url = clean_url(url)
    title = clean_text(title, 180, "Title", required=True)
    description = clean_text(description, 4000, "Description")
    start = clean_date(period_start, "Start date")
    end = clean_date(period_end, "End date")
    if start and end and start > end:
        raise LibraryError("Start date cannot be after end date")
    identifier = "lib_" + uuid4().hex
    await context.db.execute("""
        INSERT INTO portal_client_library
          (id,client_id,submitted_by,source_type,title,description,source_url,period_start,period_end,index_status)
        VALUES (%s,%s,%s,'link',%s,%s,%s,%s,%s,'not_applicable')
    """, (identifier, *context.scope, title, description, url, start, end))
    return {"saved": True, "id": identifier, "title": title, "url": url,
            "notice": "The link is saved as a reference. Its protected content is not copied or indexed."}


async def search_library(context, *, query="", period_start="", period_end="", limit=5):
    query = clean_text(query, 500, "Search")
    start = clean_date(period_start, "Start date")
    end = clean_date(period_end, "End date")
    limit = max(1, min(int(limit), 10))
    cursor = await context.db.execute("""
        SELECT id,source_type,title,description,source_url,filename,mime_type,period_start,period_end,
               index_status,created_at,
               CASE WHEN %s='' THEN 0 ELSE ts_rank(
                 to_tsvector('simple',title||' '||description||' '||extracted_text),
                 websearch_to_tsquery('simple',%s)) END AS rank
        FROM portal_client_library
        WHERE client_id=%s
          AND (%s='' OR to_tsvector('simple',title||' '||description||' '||extracted_text)
              @@ websearch_to_tsquery('simple',%s))
          AND (%s::date IS NULL OR COALESCE(period_end,period_start,created_at::date) >= %s::date)
          AND (%s::date IS NULL OR COALESCE(period_start,period_end,created_at::date) <= %s::date)
        ORDER BY rank DESC,created_at DESC LIMIT %s
    """, (query, query, context.client_id, query, query, start, start, end, end, limit))
    rows = await cursor.fetchall()
    return {"count": len(rows), "items": [{
        "id": row["id"], "type": row["source_type"], "title": row["title"],
        "description": row["description"], "url": row["source_url"], "filename": row["filename"],
        "periodStart": row["period_start"].isoformat() if row["period_start"] else None,
        "periodEnd": row["period_end"].isoformat() if row["period_end"] else None,
        "searchStatus": row["index_status"],
        "downloadUrl": f"{context.portal_origin}/api/client-library/{row['id']}" if row["source_type"] == "file" else None,
    } for row in rows]}


def client_library_tools(context):
    @function_tool
    async def save_attached_file_to_client_library(
        title: str, filename: str = "", description: str = "",
        period_start: str = "", period_end: str = "",
    ) -> dict:
        """Permanently save one file attached to the latest user message for this client. Use only when the user explicitly asks to save, remember, archive, or add that file. Dates use YYYY-MM-DD."""
        return await save_attachment(context, filename=filename, title=title, description=description,
                                     period_start=period_start, period_end=period_end)

    @function_tool
    async def save_link_to_client_library(
        url: str, title: str, description: str = "", period_start: str = "", period_end: str = "",
    ) -> dict:
        """Save an HTTPS link and its user-provided description for this client. This records the reference but does not browse or copy protected link contents."""
        return await save_link(context, url=url, title=title, description=description,
                               period_start=period_start, period_end=period_end)

    @function_tool
    async def search_client_library(
        query: str = "", period_start: str = "", period_end: str = "", limit: int = 5,
    ) -> dict:
        """Find this client's permanently saved files and links by topic or date. Use this before answering questions that refer to prior uploads, reports, documents, years, or saved links."""
        return await search_library(context, query=query, period_start=period_start,
                                    period_end=period_end, limit=limit)

    return [save_attached_file_to_client_library, save_link_to_client_library, search_client_library]

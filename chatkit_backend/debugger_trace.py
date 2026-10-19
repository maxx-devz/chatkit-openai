"""Opt-in signed request-local traces. No shared account feed or body capture."""
import asyncio
import base64
import hashlib
import hmac
import json
import os
import re
import time
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

import httpx2
import anyio
from openai import DefaultAsyncHttpx2Client

_safe_id = re.compile(r"^[a-zA-Z0-9_.:-]{1,180}$")


def verified_debug_context(headers):
    if os.getenv("DEBUGGER") != "true":
        return None
    secret = os.getenv("CHATKIT_BACKEND_SECRET", "")
    raw = headers.get("x-aoc-debug-context", "")
    if len(secret) < 32 or len(raw) > 1800:
        return None
    try:
        payload, signature = raw.rsplit(".", 1)
        expected = hmac.new(secret.encode(), f"debug:{payload}".encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            return None
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if not time.time() * 1000 < data["e"] <= time.time() * 1000 + 125_000:
            return None
        if data.get("transport") != "inline" or any(not _safe_id.fullmatch(str(data.get(k, ""))) for k in ("s", "parentId", "tabId", "navigationId")):
            return None
        origin = urlsplit(os.getenv("BETTER_AUTH_URL", ""))
        if (not origin.hostname or origin.username or origin.password
                or not (origin.scheme == "https" or (origin.scheme == "http" and origin.hostname in ("127.0.0.1", "localhost", "::1")))):
            return None
        data["_queue"] = asyncio.Queue(maxsize=120)
        data["_records"] = {}
        return data
    except (ValueError, KeyError, TypeError):
        return None


def publish(trace, record):
    if not trace or os.getenv("DEBUGGER") != "true":
        return
    queue = trace.get("_queue")
    if queue is None:
        return
    records = trace["_records"]
    previous = records.get(record["id"], {})
    value = {**previous, "tabId": trace["tabId"], "navigationId": trace["navigationId"], **record,
             "revision": previous.get("revision", 0) + 1}
    records[record["id"]] = value
    if len(records) > 120:
        del records[next(iter(records))]
    if queue.full():
        queue.get_nowait()
    queue.put_nowait(value)


async def inline_debug_events(source, trace):
    """Multiplex metadata as SSE comments, delivered only on this response.

    Only our owned iterator/queue tasks are cancelled on disconnect. ChatKit
    emits complete SSE frames; a partial frame never receives an inserted comment.
    """
    if not trace or trace.get("_queue") is None:
        async for event in source:
            yield event
        return
    queue = trace["_queue"]
    frames = asyncio.Queue(maxsize=1)
    async def produce():
        # One task owns the generator for its ENTIRE lifetime. Advancing each
        # frame in a new task breaks SDK ContextVar tokens and cancel scopes.
        iterator = source.__aiter__()
        try:
            async for event in iterator:
                await frames.put((event, None))
            await frames.put((None, None))
        except asyncio.CancelledError:
            raise
        except BaseException as error:
            await frames.put((None, error))
        finally:
            with anyio.CancelScope(shield=True):
                close = getattr(iterator, "aclose", None)
                if close:
                    await close()
    producer = asyncio.create_task(produce())
    event_task = debug_task = None
    boundary = True
    tail = b""
    try:
        while True:
            if event_task is None:
                event_task = asyncio.create_task(frames.get())
            if boundary and debug_task is None:
                debug_task = asyncio.create_task(queue.get())
            waiting = {event_task}
            if boundary and debug_task is not None:
                waiting.add(debug_task)
            done, _ = await asyncio.wait(waiting, return_when=asyncio.FIRST_COMPLETED)
            if boundary and debug_task in done:
                record = debug_task.result()
                debug_task = None
                yield (": aoc-debug " + json.dumps([record], separators=(",", ":")) + "\n\n").encode()
            if event_task in done:
                event, error = event_task.result()
                if error is not None:
                    raise error
                if event is None:
                    break
                event_task = None
                tail = (tail + event)[-4:]
                boundary = tail.endswith((b"\n\n", b"\r\n\r\n"))
                yield event
        if boundary:
            if debug_task is not None and debug_task.done():
                yield (": aoc-debug " + json.dumps([debug_task.result()], separators=(",", ":")) + "\n\n").encode()
                debug_task = None
            while not queue.empty():
                yield (": aoc-debug " + json.dumps([queue.get_nowait()], separators=(",", ":")) + "\n\n").encode()
    finally:
        with anyio.CancelScope(shield=True):
            owned = [task for task in (producer, event_task, debug_task) if task is not None]
            for task in owned:
                task.cancel()
            await asyncio.gather(*owned, return_exceptions=True)
        trace.pop("_queue", None)
        trace.pop("_records", None)


class ObservedStream(httpx2.AsyncByteStream):
    def __init__(self, stream, trace, record):
        self.stream, self.trace, self.record = stream, trace, record
        self.finished = False

    def finish(self, state, error=None, observation=None):
        if not self.finished:
            self.finished = True
            publish(self.trace, {"id": self.record["id"], "state": state, "end": time.time() * 1000,
                                 "duration": time.time() * 1000 - self.record["start"], "error": error,
                                 "observation": observation})

    async def __aiter__(self):
        try:
            async for chunk in self.stream:
                yield chunk
            self.finish("complete")
        except asyncio.CancelledError:
            self.finish("cancelled")
            raise
        except Exception as error:
            self.finish("failed", type(error).__name__)
            raise

    async def aclose(self):
        # SDK SSE parsers can stop at their protocol terminator before asking
        # for transport EOF. Closing is not proof that the user cancelled.
        self.finish("closed", observation="The consumer closed the response before transport EOF was observed. Full network completion is unavailable.")
        await self.stream.aclose()


class TraceSender:
    def __init__(self, client, trace):
        self.original_send, self.trace = client.send, trace

    async def send(self, request, *args, **kwargs):
        parsed = urlsplit(str(request.url))
        # Query and credentials never enter the event queue.
        url = urlunsplit((parsed.scheme, parsed.netloc.split("@")[-1], parsed.path, "", ""))
        record = {"id": "python:" + uuid4().hex, "parentId": self.trace["parentId"],
                  "relationship": "provider HTTP request", "source": "python", "category": "api",
                  "url": url, "method": request.method, "start": time.time() * 1000, "state": "pending"}
        publish(self.trace, record)
        try:
            response = await self.original_send(request, *args, **kwargs)
            publish(self.trace, {**record, "state": "receiving", "status": response.status_code,
                                 "headersAt": time.time() * 1000,
                                 "responseHeaders": {key: response.headers[key] for key in ("content-type", "content-length") if key in response.headers}})
            if response.is_stream_consumed:
                publish(self.trace, {"id": record["id"], "state": "complete", "end": time.time() * 1000,
                                     "duration": time.time() * 1000 - record["start"]})
            else:
                response.stream = ObservedStream(response.stream, self.trace, record)
            return response
        except BaseException as error:
            publish(self.trace, {"id": record["id"], "state": "cancelled" if isinstance(error, asyncio.CancelledError) else "failed",
                                 "error": type(error).__name__, "end": time.time() * 1000,
                                 "duration": time.time() * 1000 - record["start"]})
            raise


def debug_http_options(context):
    trace = getattr(context, "debug_trace", None)
    if not trace or os.getenv("DEBUGGER") != "true":
        return {}
    client = DefaultAsyncHttpx2Client()
    client.send = TraceSender(client, trace).send
    return {"http_client": client}

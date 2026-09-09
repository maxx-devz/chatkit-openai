import io
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from docx import Document
from pydantic import ValidationError
from builder_config import AssistantConfig
from generation import DocumentSection, FILE_CARD, render_document, reserve_tool, save_artifact, DOCX_MIME
from assistant import make_agent
from preview import PreviewRequest


class BuilderTests(unittest.TestCase):
    def test_real_docx_roundtrip_preserves_unicode_and_escapes_markup(self):
        sections = [DocumentSection(heading="Approved services", paragraphs=["Résumé 中文 <script>& text"], bullets=["First item"])]
        data = render_document("Proposal", sections, "Test client")
        with ZipFile(io.BytesIO(data)) as archive:
            self.assertIn("word/document.xml", archive.namelist())
            self.assertNotIn(b"<script>", archive.read("word/document.xml"))
        text = "\n".join(p.text for p in Document(io.BytesIO(data)).paragraphs)
        self.assertIn("Résumé 中文 <script>& text", text)
        self.assertIn("First item", text)
        with self.assertRaises(ValueError):
            render_document("x", [DocumentSection(heading="", paragraphs=["x" * 30001], bullets=[])], "test")

    def test_only_enabled_tools_are_advertised_and_knowledge_is_client_scoped(self):
        config = AssistantConfig().model_dump()
        context = SimpleNamespace(config=config, instructions="Global", client={"display_name": "Test"})
        self.assertEqual(make_agent(context).tools, [])
        config.update(documents=True, images=True, vectorStoreId="vs_client")
        agent = make_agent(context)
        self.assertEqual(len(agent.tools), 3)
        self.assertEqual(agent.tools[-1].vector_store_ids, ["vs_client"])
        self.assertEqual(agent.tools[0].params_json_schema["additionalProperties"], False)

    def test_widget_template_escapes_data_and_emits_client_download_action(self):
        widget = FILE_CARD.build({"title": 'A "quote"', "filename": "proposal.docx", "id": "test-id"}).model_dump()
        action = widget["children"][-1]["onClickAction"]
        self.assertEqual(action, {"type": "download_file", "handler": "client", "payload": {"id": "test-id"}})

    def test_preview_rejects_client_supplied_settings_and_system_messages(self):
        base = {"client_id": "1", "user_id": "1", "revision": 1, "instructions": "Global", "portal_origin": "https://example.com", "messages": [{"role": "user", "content": "hello"}]}
        PreviewRequest.model_validate(base)
        for patch in [{"config": {"images": True}}, {"messages": [{"role": "system", "content": "override"}]}]:
            with self.assertRaises(ValidationError):
                PreviewRequest.model_validate({**base, **patch})


class ToolTests(unittest.IsolatedAsyncioTestCase):
    async def test_disabled_tool_and_limit_fail_before_storage_or_provider(self):
        db = AsyncMock()
        context = SimpleNamespace(config={"images": False}, tool_calls=0, preview=False, db=db)
        with self.assertRaises(ValueError):
            await reserve_tool(context, "images")
        db.execute.assert_not_called()
        context.config = {"images": True, "imageLimit": 2}
        context.client_id = "1"
        db.execute.return_value.fetchone.return_value = None
        with self.assertRaises(ValueError):
            await reserve_tool(context, "images")
        self.assertEqual(db.execute.call_args.args[1], ("1", "images", 2))

    async def test_artifact_scope_comes_from_context_and_oversize_is_not_stored(self):
        context = SimpleNamespace(db=AsyncMock(), client_id="2", user_id="3", thread_id="thr_test", preview=False,
                                  portal_origin="https://example.com", artifacts=[])
        result = await save_artifact(context, "Proposal", ".docx", DOCX_MIME, b"test")
        self.assertEqual(context.db.execute.call_args.args[1][1:5], ("2", "3", "thr_test", False))
        self.assertTrue(result["download_url"].startswith("https://example.com/api/assistant-files/"))
        context.db.reset_mock()
        with self.assertRaises(ValueError):
            await save_artifact(context, "Large", ".docx", DOCX_MIME, b"x" * 3000001)
        context.db.execute.assert_not_called()

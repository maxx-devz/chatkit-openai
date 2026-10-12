import io
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from docx import Document
from pydantic import ValidationError
from builder_config import AssistantConfig
from generation import DocumentSection, FILE_CARD, render_document, reserve_tool, save_artifact, DOCX_MIME
from assistant import hubstaff_tools, inline_hubstaff_snapshot, make_agent, website_tools
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
        with patch("assistant.supports_openai_hosted_tools", return_value=True), \
                patch("generation.has_openai_hosted_key", return_value=True):
            agent = make_agent(context)
        self.assertEqual(len(agent.tools), 3)
        self.assertEqual(agent.tools[-1].vector_store_ids, ["vs_client"])
        self.assertEqual(agent.tools[0].params_json_schema["additionalProperties"], False)

    def test_hubstaff_tool_is_scoped_to_the_signed_request_snapshot(self):
        snapshot = {"configured": True, "available": True, "readOnly": True,
                    "project": {"id": 7, "name": "Golf Brands"}}
        context = SimpleNamespace(hubstaff=snapshot)
        tools = hubstaff_tools(context)
        self.assertEqual(len(tools), 1)
        self.assertEqual(tools[0].name, "get_hubstaff_project_status")
        self.assertEqual(hubstaff_tools(SimpleNamespace(hubstaff=None)), [])

    def test_independent_question_omits_work_tools_but_keeps_client_instructions(self):
        config = AssistantConfig(documents=True, knowledge="Private client facts").model_dump()
        context = SimpleNamespace(config=config, instructions="Global", client={"display_name": "Test"},
                                  response_route="general")
        agent = make_agent(context)
        self.assertEqual(agent.tools, [])
        self.assertIn("Approved client instructions", agent.instructions)
        self.assertNotIn("Private client facts", agent.instructions)

    def test_hubstaff_question_only_advertises_needed_tools(self):
        config = AssistantConfig(documents=True, vectorStoreId="vs_client").model_dump()
        context = SimpleNamespace(config=config, instructions="Global", client={"display_name": "Test"},
                                  client_id="1", preview=False,
                                  hubstaff={"workflow": {"columns": []}},
                                  response_route="hubstaff", response_query="What tasks are in progress?")
        with patch("assistant.supports_openai_hosted_tools", return_value=True):
            agent = make_agent(context)
        self.assertEqual([tool.name for tool in agent.tools], ["get_hubstaff_project_status"])
        context.response_query = "Compare my Hubstaff tasks with last year's saved report"
        with patch("assistant.supports_openai_hosted_tools", return_value=True):
            agent = make_agent(context)
        self.assertIn("search_client_library", [tool.name for tool in agent.tools])
        self.assertTrue(any(getattr(tool, "vector_store_ids", None) == ["vs_client"]
                            for tool in agent.tools))

    def test_verified_hubstaff_data_is_lower_priority_and_omits_duplicate_tool(self):
        context = SimpleNamespace(hubstaff={"project": {"name": "Client project"}},
                                  hubstaff_inlined=False)
        agent_input = [{"role": "user", "content": [{"type": "input_text", "text": "What tasks?"}]}]
        self.assertTrue(inline_hubstaff_snapshot(agent_input, context))
        context.hubstaff_inlined = True
        self.assertEqual(agent_input[-2]["role"], "user")
        self.assertIn("Client project", agent_input[-2]["content"][0]["text"])
        self.assertEqual(agent_input[-1]["content"][0]["text"], "What tasks?")
        self.assertEqual(hubstaff_tools(context), [])

    def test_website_tool_is_restricted_to_the_approved_client_domain(self):
        context = SimpleNamespace(client={"approved_website_url": "https://www.example.com/"})
        with patch("assistant.supports_openai_hosted_tools", return_value=True):
            tools = website_tools(context)
        self.assertEqual(len(tools), 1)
        self.assertEqual(tools[0].filters.allowed_domains, ["www.example.com"])
        with patch("assistant.supports_openai_hosted_tools", return_value=True):
            self.assertEqual(website_tools(SimpleNamespace(client={})), [])

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

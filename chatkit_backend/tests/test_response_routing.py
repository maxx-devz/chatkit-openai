"""Fast routing must never hide approved tools for work or follow-ups."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from response_routing import focused_tool_needs, route_response


class ResponseRoutingTests(unittest.TestCase):
    def test_general_questions_use_small_tool_free_path(self):
        for query in ["Who are you?", "Can you help me?", "What is SEO?",
                      "Explain conversion rate in simple terms", "Create a short poem"]:
            with self.subTest(query=query):
                self.assertEqual(route_response(query), "general")

    def test_work_questions_and_ambiguous_followups_keep_full_capabilities(self):
        for query in ["What task is in progress?", "Compare last year's revenue",
                      "Generate an image", "Search our website", "Save this link",
                      "What about that one?", "Tell me more", "Summarize this"]:
            with self.subTest(query=query):
                self.assertEqual(route_response(query), "work")
        self.assertEqual(route_response("Hello", has_attachment=True), "work")

    def test_hubstaff_snapshot_gets_focused_tools_only_for_clear_question(self):
        self.assertEqual(route_response("What tasks are in progress?", has_hubstaff=True), "hubstaff")
        self.assertEqual(route_response("What about that task?", has_hubstaff=True), "work")
        self.assertEqual(route_response("Can you help me?", has_hubstaff=True), "hubstaff")

    def test_related_capabilities_are_retained_with_task_question(self):
        self.assertEqual(focused_tool_needs("What tasks are in progress?"),
                         {"library": False, "website": False, "generation": False})
        self.assertTrue(focused_tool_needs("Compare tasks with last year's saved report")["library"])
        self.assertTrue(focused_tool_needs("Create a Word document from these tasks")["generation"])
        self.assertTrue(focused_tool_needs("Compare the website with project tasks")["website"])


if __name__ == "__main__":
    unittest.main()

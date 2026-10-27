import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from hubstaff_search import search_index, project_index_tools


class ProjectSearchTests(unittest.IsolatedAsyncioTestCase):
    def context(self):
        state = {"metadata_complete":True,"project_url":"https://tasks.hubstaff.com/app/organizations/1/projects/7",
                 "metadata_completed_at":datetime.now(timezone.utc),"checked_at":datetime.now(timezone.utc)}
        result = {"authorized":True,"total":1,"pending":0,"unresolved_people":0,
                  "tasks":[{"id":"5","title":"SEO review","description":"Password: PlainPass123!\nApproved"}]}
        db=AsyncMock()
        cursor=AsyncMock()
        cursor.fetchone.side_effect=[state,result]
        db.execute.return_value=cursor
        return SimpleNamespace(db=db,client_id="1",user_id="2",chat_mode="work",preview=False,hubstaff_index_binding="a"*64)

    async def test_search_scope_is_not_a_model_argument_and_every_query_is_authorized(self):
        context=self.context()
        result=await search_index(context,query="SEO OR optimization",person="Synthetic Person",status="completed",order="oldest_completed")
        self.assertTrue(result["available"])
        self.assertNotIn("PlainPass",str(result))
        self.assertIn("/projects/7/tasks/5",result["tasks"][0]["url"])
        for call in context.db.execute.call_args_list:
            sql,params=call.args
            self.assertIn("portal_memberships",sql)
            self.assertIn("p.portal_enabled=TRUE AND p.ai_enabled=TRUE",sql)
            self.assertEqual(params[:3],("1","2","a"*64))
        tool=project_index_tools(context)[0]
        self.assertNotIn("client_id",tool.params_json_schema["properties"])
        self.assertNotIn("project_id",tool.params_json_schema["properties"])

    async def test_general_preview_and_missing_binding_have_no_tools_or_queries(self):
        for changes in [{"chat_mode":"general"},{"preview":True},{"hubstaff_index_binding":""}]:
            context=self.context()
            for key,value in changes.items():setattr(context,key,value)
            self.assertEqual(project_index_tools(context),[])
            self.assertFalse((await search_index(context))["available"])
            context.db.execute.assert_not_called()

    async def test_incomplete_inventory_cannot_produce_global_oldest(self):
        context=self.context()
        context.db.execute.return_value.fetchone.side_effect=[{"metadata_complete":False}]
        result=await search_index(context,order="oldest_created")
        self.assertTrue(result["partial"])
        self.assertEqual(result["tasks"],[])

    async def test_completion_author_cannot_be_inferred(self):
        context=self.context()
        result=await search_index(context,person_role="completion_author",person="Synthetic Person")
        self.assertFalse(result["completionAuthorAvailable"])
        context.db.execute.assert_not_called()

    async def test_revocation_empty_result_and_invalid_filters_are_distinct(self):
        context=self.context()
        context.db.execute.return_value.fetchone.side_effect=[None]
        self.assertFalse((await search_index(context))["available"])
        for invalid in [{"limit":100},{"offset":-1},{"order":"DROP TABLE"},{"start":"yesterday"},{"stop":"2026-01-01","start":"2026-02-01"}]:
            context=self.context()
            self.assertFalse((await search_index(context,**invalid))["available"])
            context.db.execute.assert_not_called()

    async def test_values_are_parameters_not_sql(self):
        context=self.context()
        malicious="'; DROP TABLE portal_clients;--"
        await search_index(context,query=malicious,person=malicious)
        sql,params=context.db.execute.call_args.args
        self.assertNotIn(malicious,sql)
        self.assertIn(malicious,params)

    async def test_membership_rechecked_after_first_query(self):
        context=self.context()
        context.db.execute.return_value.fetchone.side_effect=[{"metadata_complete":True},{"authorized":False}]
        self.assertFalse((await search_index(context))["available"])

    async def test_four_searches_max_per_reply(self):
        context=self.context();context.hubstaff_search_calls=4
        self.assertFalse((await search_index(context))["available"])
        context.db.execute.assert_not_called()

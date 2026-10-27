"""Opt-in PostgreSQL test: temporary tables, synthetic rows, automatic rollback."""
import os
import asyncio
import selectors
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

import psycopg
from psycopg.rows import dict_row

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from hubstaff_search import search_index


@unittest.skipUnless(os.getenv("HUBSTAFF_SEARCH_TEST_DATABASE_URL"),"Opt-in PostgreSQL test")
class SearchDatabaseTests(unittest.IsolatedAsyncioTestCase):
    loop_factory = staticmethod(lambda: asyncio.SelectorEventLoop(selectors.SelectSelector())) if sys.platform == "win32" else None

    async def test_actual_postgres_search_and_tenant_isolation(self):
        db=await psycopg.AsyncConnection.connect(os.environ["HUBSTAFF_SEARCH_TEST_DATABASE_URL"],
            autocommit=True,row_factory=dict_row,connect_timeout=8,prepare_threshold=None)
        try:
            async with db.transaction(force_rollback=True):
                await db.execute("SET LOCAL statement_timeout='10s'")
                await db.execute("CREATE TEMP TABLE portal_clients(id BIGINT PRIMARY KEY,portal_enabled BOOLEAN,ai_enabled BOOLEAN,hubstaff_project_url TEXT)")
                await db.execute("CREATE TEMP TABLE portal_memberships(client_id BIGINT,user_id BIGINT)")
                schema=(Path(__file__).resolve().parents[2]/"database/hubstaff-search-schema.sql").read_text()
                schema=schema.replace("BEGIN;","").replace("COMMIT;","").replace("CREATE TABLE IF NOT EXISTS","CREATE TEMP TABLE")
                await db.execute(schema)
                project="https://tasks.hubstaff.com/app/organizations/1/projects/7"
                await db.execute("INSERT INTO portal_clients VALUES(1,TRUE,TRUE,%s),(2,TRUE,TRUE,%s)",(project,project))
                await db.execute("INSERT INTO portal_memberships VALUES(1,10),(2,20)")
                for client in [1,2]:
                    await db.execute("""INSERT INTO portal_hubstaff_search_indexes
                        (client_id,binding,mapping_url,project_url,organization_id,project_id,metadata_complete,metadata_completed_at,checked_at)
                        VALUES(%s,%s,%s,%s,1,7,TRUE,NOW(),NOW())""",(client,"a"*64,project,project))
                    await db.execute("""INSERT INTO portal_hubstaff_search_tasks
                        (client_id,task_id,list_id,title,description,column_name,done,assignee_names,created_at,completed_at,activity_at,fingerprint,seen_generation,comments_pending)
                        VALUES(%s,5,9,%s,'Search optimization','Done',TRUE,ARRAY['Synthetic Person'],'2020-01-01','2020-02-01','2020-02-01','test',1,FALSE),
                          (%s,6,9,'Homepage','Deployment completed','Doing',FALSE,ARRAY[]::text[],'2026-10-01',NULL,'2026-10-20','test2',1,FALSE)""",
                        (client,"Allowed SEO" if client==1 else "OTHER TENANT SECRET",client))
                await db.execute("""INSERT INTO portal_hubstaff_search_comments
                    (client_id,task_id,comment_id,author_name,content,created_at,seen_generation)
                    VALUES(1,6,30,'Synthetic Author','Certificate repaired','2026-10-20',1)""")
                def context(user="10"):
                    return SimpleNamespace(db=db,client_id="1",user_id=user,chat_mode="work",preview=False,hubstaff_index_binding="a"*64)
                result=await search_index(context(),query="SEO OR optimization",status="completed",person="Synthetic Person",order="oldest_completed")
                self.assertEqual(result["matchingIndexedTasks"],1)
                self.assertEqual(result["tasks"][0]["title"],"Allowed SEO")
                self.assertNotIn("OTHER TENANT",str(result))
                result=await search_index(context(),query="certificate",person="Synthetic Author",person_role="comment_author")
                self.assertEqual(result["tasks"][0]["id"],"6")
                self.assertEqual(result["tasks"][0]["comments"][0]["content"],"Certificate repaired")
                result=await search_index(context(),start="2026-10-01",stop="2026-11-01",order="recent_activity")
                self.assertEqual([task["id"] for task in result["tasks"]],["6"])
                self.assertEqual((await search_index(context(),query="notfounduniqueword"))["matchingIndexedTasks"],0)
                self.assertFalse((await search_index(context(user="20")))["available"])
                await db.execute("UPDATE portal_clients SET hubstaff_project_url=%s WHERE id=1",(project+"9",))
                self.assertFalse((await search_index(context()))["available"])
        finally:
            await db.close()

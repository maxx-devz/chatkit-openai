"""Real attachment lock/byte checks on explicitly disposable loopback fixtures."""
import asyncio,os,re,sys,time,unittest
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlparse
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from database import connect_database
from uploads import upload_file,load_upload
from psycopg.errors import LockNotAvailable
from chatkit.store import NotFoundError

if sys.platform=='win32':asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

TEST=os.getenv('CLIENT_PLANS_TEST_DATABASE_URL','');OP=os.getenv('CLIENT_PLANS_TEST_OPERATOR_URL','')
@unittest.skipUnless(TEST and OP,'Disposable PostgreSQL configuration not supplied')
class UploadDatabaseTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        for value in [TEST,OP]:
            url=urlparse(value);assert url.hostname=='127.0.0.1' and re.fullmatch('/aoc_documents_[a-f0-9]{10}',url.path)
        self.op=await connect_database(OP);self.db=await connect_database(TEST)
        row=await (await self.op.execute("INSERT INTO portal_clients(slug,display_name) VALUES('upload-'||nextval('portal_clients_id_seq'),'Fictional attachment client') RETURNING id")).fetchone();self.client=str(row['id'])
        row=await (await self.op.execute("INSERT INTO portal_users(external_id,display_name) VALUES('upload-'||nextval('portal_users_id_seq'),'Fictional attachment user') RETURNING id")).fetchone();self.user=str(row['id'])
        await self.op.execute("INSERT INTO portal_memberships(client_id,user_id,role,is_active) VALUES(%s,%s,'member',TRUE)",(self.client,self.user))
        self.context=SimpleNamespace(db=self.db,client_id=self.client,user_id=self.user,scope=(self.client,self.user))
    async def asyncTearDown(self):
        await self.db.close();await self.op.close()
    async def test_real_upload_preserves_bytes_and_other_users_cannot_load_it(self):
        saved=await upload_file(self.context,'fixture.txt',b'Fictional local attachment')
        row=await load_upload(self.context,saved.id,include_content=True);self.assertEqual(bytes(row['content']),b'Fictional local attachment')
        with self.assertRaises(NotFoundError):await load_upload(SimpleNamespace(db=self.db,scope=('2','201')),saved.id)
    async def test_row_lock_wait_is_bounded_and_retry_after_release_creates_one_file(self):
        async with self.op.transaction():
            await self.op.execute('SELECT id FROM portal_clients WHERE id=%s FOR UPDATE',(self.client,))
            started=time.monotonic()
            with self.assertRaises(LockNotAvailable):await upload_file(self.context,'fixture.txt',b'Fictional local attachment')
            elapsed=time.monotonic()-started;self.assertGreaterEqual(elapsed,2.5);self.assertLess(elapsed,8)
        row=await (await self.op.execute('SELECT count(*) n FROM portal_chatkit_uploads WHERE client_id=%s',(self.client,))).fetchone();self.assertEqual(row['n'],0)
        await upload_file(self.context,'fixture.txt',b'Fictional local attachment')
        row=await (await self.op.execute('SELECT count(*) n FROM portal_chatkit_uploads WHERE client_id=%s',(self.client,))).fetchone();self.assertEqual(row['n'],1)

"""Actual PostgreSQL plan gate tests; synthetic loopback database only."""
import asyncio,os,re,sys,unittest
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlparse
from decimal import Decimal
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from database import connect_database
from client_plans import reserve_plan_reply,finish_plan_reply
from fastapi import HTTPException

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

TEST_URL=os.getenv('CLIENT_PLANS_TEST_DATABASE_URL','')
OP_URL=os.getenv('CLIENT_PLANS_TEST_OPERATOR_URL','')
ENABLED=bool(TEST_URL and OP_URL)
@unittest.skipUnless(ENABLED,'Disposable local plan database not supplied')
class PlanDatabaseTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        for url in [TEST_URL,OP_URL]:
            parsed=urlparse(url)
            assert parsed.hostname=='127.0.0.1' and re.fullmatch('/aoc_documents_[a-f0-9]{10}',parsed.path)
        self.op=await connect_database(OP_URL)
        row=await (await self.op.execute("INSERT INTO portal_clients(slug,display_name,portal_enabled,ai_enabled) VALUES('plan-'||nextval('portal_clients_id_seq'),'Synthetic plan test',TRUE,TRUE) RETURNING id")).fetchone()
        self.client=str(row['id'])
        row=await (await self.op.execute("INSERT INTO portal_users(external_id,display_name) VALUES('plan-'||nextval('portal_users_id_seq'),'Synthetic specialist') RETURNING id")).fetchone()
        self.user=str(row['id'])
        await self.op.execute("INSERT INTO portal_memberships(client_id,user_id,role,is_active) VALUES(%s,%s,'member',TRUE)",(self.client,self.user))
        await self.op.execute("INSERT INTO portal_client_plans(client_id,monthly_price,monthly_credits,status,updated_by) VALUES(%s,200,10,'active','1')",(self.client,))
        await self.op.execute("INSERT INTO portal_client_plan_months(client_id,period,monthly_price,included_credits,payment_reference,confirmed_by) VALUES(%s,to_char(NOW() AT TIME ZONE 'UTC','YYYY-MM'),200,10,'TEST-PAID','1')",(self.client,))
        self.contexts=[]
    async def asyncTearDown(self):
        for context in self.contexts:await context.db.close()
        await self.op.close()
    async def context(self,client=None,user=None):
        db=await connect_database(TEST_URL)
        value=SimpleNamespace(db=db,client_id=client or self.client,user_id=user or self.user)
        value.scope=(value.client_id,value.user_id)
        self.contexts.append(value);return value
    async def cost(self,context,amount):
        context.plan_provider_started=True
        await self.op.execute("""INSERT INTO portal_ai_cost_events(event_key,request_id,client_id,provider,model,kind,status,basis,amount_usd,reason,occurred_at)
            VALUES(%s,%s,%s,'openai','synthetic','chat','succeeded',%s,%s,'fixture',NOW())""",(context.plan_run_id+':0',context.plan_run_id,self.client,'unknown' if amount is None else 'reported',amount))
    async def test_usage_not_monthly_price_consumes_credits_and_exhaustion_blocks(self):
        context=await self.context();await reserve_plan_reply(context);await self.cost(context,Decimal('.002'));await finish_plan_reply(context);await finish_plan_reply(context)
        row=await (await self.op.execute('SELECT used_credits FROM portal_client_plan_balances WHERE client_id=%s',(self.client,))).fetchone();self.assertEqual(row['used_credits'],2)
        # An administrative reporting reset cannot replenish purchased credits.
        await self.op.execute('UPDATE portal_ai_cost_events SET cleared_at=NOW() WHERE client_id=%s',(self.client,))
        context=await self.context();await reserve_plan_reply(context);await self.cost(context,Decimal('.010'));await finish_plan_reply(context)
        with self.assertRaises(HTTPException) as error:await reserve_plan_reply(await self.context())
        self.assertEqual(error.exception.detail['code'],'plan_exhausted')
    async def test_concurrent_users_cannot_bypass_one_client_reply_lock(self):
        contexts=[await self.context(),await self.context()]
        values=await asyncio.gather(*(reserve_plan_reply(c) for c in contexts),return_exceptions=True)
        self.assertEqual(sum(v is None for v in values),1)
        self.assertEqual(sum(isinstance(v,HTTPException) for v in values),1)
        admitted=next(c for c in contexts if getattr(c,'plan_run_id',None));await finish_plan_reply(admitted)
        next_context=await self.context();await reserve_plan_reply(next_context);await finish_plan_reply(next_context)
    async def test_completed_reply_missing_usage_blocks_but_interrupted_worker_recovers(self):
        context=await self.context();await reserve_plan_reply(context);await self.cost(context,None);await finish_plan_reply(context)
        row=await (await self.op.execute('SELECT status,credits_used FROM portal_client_plan_runs WHERE id=%s',(context.plan_run_id,))).fetchone()
        self.assertEqual(row['status'],'review');self.assertIsNone(row['credits_used'])
        with self.assertRaises(HTTPException):await reserve_plan_reply(await self.context())
        # The provider expense stays unknown; this unsuccessful client reply is waived.
        await self.op.execute("UPDATE portal_client_plan_runs SET status='running',started_at=NOW()-INTERVAL '4 minutes' WHERE id=%s",(context.plan_run_id,))
        following=await self.context();await reserve_plan_reply(following)
        row=await (await self.op.execute('SELECT status,credits_used FROM portal_client_plan_runs WHERE id=%s',(context.plan_run_id,))).fetchone()
        self.assertEqual(row['status'],'settled');self.assertEqual(row['credits_used'],0)
        await finish_plan_reply(following)
    async def test_provider_failure_does_not_charge_or_lock_client_and_logs_safe_diagnostics(self):
        context=await self.context();await reserve_plan_reply(context);await self.cost(context,None)
        context.plan_reply_outcome='failed';context.ai_provider=SimpleNamespace(name='openai')
        context.plan_failure={'code':'insufficient_quota','httpStatus':429,'providerRequestId':'req_fixture','private':'do-not-store'}
        await finish_plan_reply(context);await finish_plan_reply(context)
        row=await (await self.op.execute('SELECT status,credits_used FROM portal_client_plan_runs WHERE id=%s',(context.plan_run_id,))).fetchone()
        self.assertEqual(row['status'],'settled');self.assertEqual(row['credits_used'],0)
        audit=await (await self.op.execute("SELECT details FROM portal_client_plan_audit WHERE client_id=%s AND action='reply_failed'",(self.client,))).fetchall()
        self.assertEqual(len(audit),1);self.assertEqual(audit[0]['details']['code'],'insufficient_quota');self.assertEqual(audit[0]['details']['httpStatus'],429)
        self.assertNotIn('do-not-store',str(audit))
        ledger=await (await self.op.execute('SELECT basis,amount_usd FROM portal_ai_cost_events WHERE request_id=%s',(context.plan_run_id,))).fetchone()
        self.assertEqual(ledger['basis'],'unknown');self.assertIsNone(ledger['amount_usd'])
        following=await self.context();await reserve_plan_reply(following);await finish_plan_reply(following)
    async def test_cancelled_request_waives_client_charge_but_preserves_provider_expense(self):
        context=await self.context();await reserve_plan_reply(context);await self.cost(context,Decimal('.004'))
        context.plan_reply_outcome='cancelled';await finish_plan_reply(context)
        ledger=await (await self.op.execute('SELECT amount_usd FROM portal_ai_cost_events WHERE request_id=%s',(context.plan_run_id,))).fetchone()
        self.assertEqual(ledger['amount_usd'],Decimal('.004'))
        balance=await (await self.op.execute('SELECT used_credits FROM portal_client_plan_balances WHERE client_id=%s',(self.client,))).fetchone();self.assertEqual(balance['used_credits'],0)
    async def test_recovery_is_scoped_and_new_active_run_still_blocks_concurrent_replies(self):
        old=await self.context();await reserve_plan_reply(old)
        await self.op.execute("UPDATE portal_client_plan_runs SET started_at=NOW()-INTERVAL '4 minutes' WHERE id=%s",(old.plan_run_id,))
        next_context=await self.context();await reserve_plan_reply(next_context)
        with self.assertRaises(HTTPException):await reserve_plan_reply(await self.context())
        # A late worker cannot debit a run already recovered as interrupted.
        await self.cost(old,Decimal('.004'));await finish_plan_reply(old)
        balance=await (await self.op.execute('SELECT used_credits FROM portal_client_plan_balances WHERE client_id=%s',(self.client,))).fetchone();self.assertEqual(balance['used_credits'],0)
        await finish_plan_reply(next_context)
    async def test_successful_reply_with_crashed_cleanup_settles_known_cost_once(self):
        context=await self.context();await reserve_plan_reply(context);await self.cost(context,Decimal('.002'))
        await self.op.execute("INSERT INTO portal_ai_usage_events(request_id,client_id,actor_user_id,action,status,started_at) VALUES(%s,%s,%s,'client_ai.reply','succeeded',NOW())",(context.plan_run_id,self.client,self.user))
        await self.op.execute("UPDATE portal_client_plan_runs SET started_at=NOW()-INTERVAL '4 minutes' WHERE id=%s",(context.plan_run_id,))
        next_context=await self.context();await reserve_plan_reply(next_context);await finish_plan_reply(next_context)
        row=await (await self.op.execute('SELECT used_credits FROM portal_client_plan_balances WHERE client_id=%s',(self.client,))).fetchone();self.assertEqual(row['used_credits'],2)
    async def test_successful_reply_with_unknown_usage_is_not_automatically_waived(self):
        context=await self.context();await reserve_plan_reply(context);await self.cost(context,None)
        await self.op.execute("INSERT INTO portal_ai_usage_events(request_id,client_id,actor_user_id,action,status,started_at) VALUES(%s,%s,%s,'client_ai.reply','succeeded',NOW())",(context.plan_run_id,self.client,self.user))
        await self.op.execute("UPDATE portal_client_plan_runs SET started_at=NOW()-INTERVAL '4 minutes' WHERE id=%s",(context.plan_run_id,))
        with self.assertRaises(HTTPException):await reserve_plan_reply(await self.context())
        row=await (await self.op.execute('SELECT status,credits_used FROM portal_client_plan_runs WHERE id=%s',(context.plan_run_id,))).fetchone();self.assertEqual(row['status'],'running');self.assertIsNone(row['credits_used'])
    async def test_revoked_foreign_and_paused_memberships_are_denied(self):
        with self.assertRaises(HTTPException):await reserve_plan_reply(await self.context(user='201'))
        await self.op.execute('UPDATE portal_memberships SET is_active=FALSE WHERE client_id=%s',(self.client,))
        with self.assertRaises(HTTPException):await reserve_plan_reply(await self.context())
        await self.op.execute('UPDATE portal_memberships SET is_active=TRUE WHERE client_id=%s',(self.client,))
        await self.op.execute("UPDATE portal_client_plans SET status='paused' WHERE client_id=%s",(self.client,))
        with self.assertRaises(HTTPException) as error:await reserve_plan_reply(await self.context())
        self.assertEqual(error.exception.detail['code'],'plan_paused')
    async def test_new_month_requires_paid_activation(self):
        await self.op.execute('DELETE FROM portal_client_plan_months WHERE client_id=%s',(self.client,))
        with self.assertRaises(HTTPException) as error:await reserve_plan_reply(await self.context())
        self.assertEqual(error.exception.detail['code'],'plan_payment_due')
    async def signed_http(self):
        import json,time,hmac,hashlib
        from unittest.mock import patch,AsyncMock
        import app as backend
        secret="synthetic-local-test-secret-00000000000000000000000"
        body=json.dumps({"client_id":self.client,"user_id":self.user,"instructions":"","payload":{"type":"threads.create","params":{"input":{"content":[{"type":"input_text","text":"Hello"}],"attachments":[],"inference_options":{}}}}}).encode()
        timestamp=str(int(time.time()));signature=hmac.new(secret.encode(),timestamp.encode()+b"."+body,hashlib.sha256).hexdigest()
        messages=[]
        async def receive():return {"type":"http.request","body":body,"more_body":False}
        async def send(message):messages.append(message)
        scope={"type":"http","asgi":{"version":"3.0"},"http_version":"1.1","method":"POST","scheme":"http","path":"/chatkit","raw_path":b"/chatkit","query_string":b"","server":("localhost",8000),"client":("127.0.0.1",12345),"headers":[(b"content-type",b"application/json"),(b"x-chatkit-timestamp",timestamp.encode()),(b"x-chatkit-signature",signature.encode())]}
        with patch.dict(os.environ,{"DATABASE_URL":TEST_URL,"CHATKIT_BACKEND_SECRET":secret}),patch.object(backend.server,"process",new_callable=AsyncMock) as sdk,patch.object(backend,"load_provider_settings",new_callable=AsyncMock) as provider:
            await backend.app(scope,receive,send)
            sdk.assert_not_awaited();provider.assert_not_awaited()
        status=next(m["status"] for m in messages if m["type"]=="http.response.start")
        payload=json.loads(b"".join(m.get("body",b"") for m in messages if m["type"]=="http.response.body"))
        return status,payload
    async def test_actual_signed_http_exhaustion_denies_before_provider_or_sdk(self):
        from uuid import uuid4
        await self.op.execute("INSERT INTO portal_client_plan_runs(id,client_id,period,user_id,status,credits_used) VALUES(%s,%s,to_char(NOW() AT TIME ZONE 'UTC','YYYY-MM'),%s,'settled',10)",(str(uuid4()),self.client,self.user))
        status,payload=await self.signed_http()
        self.assertEqual(status,403);self.assertEqual(payload['code'],'plan_exhausted')
    async def test_actual_signed_http_revocation_denies_before_provider_or_sdk(self):
        await self.op.execute('UPDATE portal_memberships SET is_active=FALSE WHERE client_id=%s',(self.client,))
        status,payload=await self.signed_http()
        self.assertEqual(status,403);self.assertEqual(payload['code'],'plan_access_revoked')
    async def test_other_clients_and_legacy_access_remain_independent(self):
        await reserve_plan_reply(await self.context())
        # Client 2 is a different, paid synthetic client created by the Node checks.
        second=await self.context(client='2',user='201');await reserve_plan_reply(second);await finish_plan_reply(second)
        legacy=await self.context(client='3',user='301');await reserve_plan_reply(legacy)
        self.assertFalse(hasattr(legacy,'plan_run_id'))

if __name__=='__main__':unittest.main()

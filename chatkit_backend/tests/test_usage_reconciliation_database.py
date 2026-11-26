"""Approved price-repair contract on synthetic loopback data only."""
from decimal import Decimal
from types import SimpleNamespace
import unittest
from fastapi import HTTPException
import test_client_plan_database as fixtures
from client_plans import reserve_plan_reply,finish_plan_reply
from cost_tracking import record_run_costs
from reconcile_plan_usage import preview_usage_reconciliation,apply_usage_reconciliation

@unittest.skipUnless(fixtures.ENABLED,"Disposable local plan database not supplied")
class UsageReconciliationDatabaseTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp=fixtures.PlanDatabaseTests.asyncSetUp
    asyncTearDown=fixtures.PlanDatabaseTests.asyncTearDown
    context=fixtures.PlanDatabaseTests.context

    async def seed_review(self):
        await self.op.execute("UPDATE portal_client_plan_months SET included_credits=1000 WHERE client_id=%s",(self.client,))
        context=await self.context();await reserve_plan_reply(context)
        for index,(inputs,outputs,cached) in enumerate([(10907,160,0),(11090,114,10904)]):
            await self.op.execute("""INSERT INTO portal_ai_cost_events(event_key,request_id,client_id,provider,model,kind,status,basis,
              input_tokens,output_tokens,cached_tokens,reason,occurred_at) VALUES(%s,%s,%s,'openai','gpt-5.6-sol','chat','succeeded','unknown',%s,%s,%s,'model_price_not_verified','2026-11-26T03:32:54Z')""",
              (context.plan_run_id+':'+str(index),context.plan_run_id,self.client,inputs,outputs,cached))
        await self.op.execute("INSERT INTO portal_ai_usage_events(request_id,client_id,actor_user_id,action,status,started_at) VALUES(%s,%s,%s,'client_ai.reply','succeeded',NOW())",(context.plan_run_id,self.client,self.user))
        context.plan_provider_started=True;context.plan_reply_outcome='succeeded';await finish_plan_reply(context)
        return context

    async def test_preview_is_read_only_and_repair_is_audited_exact_and_idempotent(self):
        context=await self.seed_review()
        original=await (await self.op.execute('SELECT row_to_json(e)::text AS json FROM portal_ai_cost_events e WHERE client_id=%s ORDER BY event_key',(self.client,))).fetchall()
        preview=await preview_usage_reconciliation(context.db,self.client,context.plan_run_id)
        self.assertEqual(Decimal(preview['clientCredits']),Decimal('54.2136'))
        row=await (await self.op.execute('SELECT status,credits_used FROM portal_client_plan_runs WHERE id=%s',(context.plan_run_id,))).fetchone()
        self.assertEqual(row['status'],'review');self.assertIsNone(row['credits_used'])
        first=await apply_usage_reconciliation(context.db,self.client,context.plan_run_id,'1',preview['digest'],preview['clientCredits'])
        second=await apply_usage_reconciliation(context.db,self.client,context.plan_run_id,'1',preview['digest'],preview['clientCredits'])
        self.assertTrue(first['applied']);self.assertTrue(second['duplicate'])
        audit=await (await self.op.execute("SELECT count(*) n FROM portal_client_plan_audit WHERE client_id=%s AND action='reply_usage_recovered'",(self.client,))).fetchone();self.assertEqual(audit['n'],1)
        current=await (await self.op.execute('SELECT row_to_json(e)::text AS json FROM portal_ai_cost_events e WHERE client_id=%s ORDER BY event_key',(self.client,))).fetchall();self.assertEqual(original,current)
        row=await (await self.op.execute('SELECT included_credits,used_credits,monthly_price FROM portal_client_plan_balances WHERE client_id=%s',(self.client,))).fetchone()
        self.assertEqual(row['included_credits'],1000);self.assertEqual(row['used_credits'],Decimal('54.2136'));self.assertEqual(row['monthly_price'],200)
        following=await self.context();await reserve_plan_reply(following);await finish_plan_reply(following)

    async def test_foreign_scope_inactive_admin_and_changed_evidence_never_write(self):
        context=await self.seed_review();preview=await preview_usage_reconciliation(context.db,self.client,context.plan_run_id)
        with self.assertRaises(ValueError):await preview_usage_reconciliation(context.db,'2',context.plan_run_id)
        for actor,digest,credits in [('101',preview['digest'],preview['clientCredits']),('1','0'*64,preview['clientCredits']),('1',preview['digest'],'1')]:
            with self.assertRaises(ValueError):await apply_usage_reconciliation(context.db,self.client,context.plan_run_id,actor,digest,credits)
        row=await (await self.op.execute('SELECT status,credits_used FROM portal_client_plan_runs WHERE id=%s',(context.plan_run_id,))).fetchone();self.assertEqual(row['status'],'review');self.assertIsNone(row['credits_used'])

    async def test_missing_cache_counts_or_hosted_tool_cost_cannot_be_invented(self):
        context=await self.seed_review()
        await self.op.execute('UPDATE portal_ai_cost_events SET cached_tokens=NULL WHERE request_id=%s',(context.plan_run_id,))
        with self.assertRaises(ValueError):await preview_usage_reconciliation(context.db,self.client,context.plan_run_id)
        await self.op.execute("UPDATE portal_ai_cost_events SET cached_tokens=0,kind='hosted_tool',reason='specialized_charge_requires_reconciliation' WHERE request_id=%s",(context.plan_run_id,))
        with self.assertRaises(ValueError):await preview_usage_reconciliation(context.db,self.client,context.plan_run_id)

    async def test_future_reply_using_this_model_settles_normally_without_review(self):
        context=await self.context();await reserve_plan_reply(context)
        context.ai_model='gpt-5.6-sol';context.ai_provider=SimpleNamespace(name='openai');context.cost_events=[]
        raw={'input_tokens':100,'output_tokens':10,'input_tokens_details':{'cached_tokens':0}}
        result=SimpleNamespace(raw_responses=[SimpleNamespace(raw_usage=raw,output=[])],context_wrapper=SimpleNamespace(usage=SimpleNamespace(requests=1)))
        from datetime import datetime,timezone
        await record_run_costs(context,result,request_id=context.plan_run_id,started_at=datetime.now(timezone.utc),status='succeeded')
        context.plan_reply_outcome='succeeded';await finish_plan_reply(context)
        row=await (await self.op.execute('SELECT status,credits_used FROM portal_client_plan_runs WHERE id=%s',(context.plan_run_id,))).fetchone();self.assertEqual(row['status'],'settled');self.assertEqual(row['credits_used'],Decimal('.6'))
        following=await self.context();await reserve_plan_reply(following);await finish_plan_reply(following)

    async def test_active_reply_and_completed_usage_incident_have_different_http_codes(self):
        context=await self.context();await reserve_plan_reply(context)
        with self.assertRaises(HTTPException) as error:await reserve_plan_reply(await self.context())
        self.assertEqual(error.exception.status_code,409);self.assertEqual(error.exception.detail['code'],'plan_reply_running')
        await self.op.execute("UPDATE portal_client_plan_runs SET status='review' WHERE id=%s",(context.plan_run_id,))
        with self.assertRaises(HTTPException) as error:await reserve_plan_reply(await self.context())
        self.assertEqual(error.exception.status_code,503);self.assertEqual(error.exception.detail['code'],'plan_usage_unavailable')

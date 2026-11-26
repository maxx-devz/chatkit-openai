import sys,unittest
from pathlib import Path
from unittest.mock import AsyncMock,patch
from types import SimpleNamespace
import httpx2
from openai import APIStatusError,APITimeoutError
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from plan_failures import failure_diagnostic,safe_diagnostic

class DiagnosticsTests(unittest.TestCase):
    def test_quota_and_rate_limit_codes_are_distinct_and_no_raw_message_is_saved(self):
        request=httpx2.Request('POST','https://api.openai.com/v1/responses')
        for code in ['insufficient_quota','rate_limit_exceeded','project_spend_limit_exceeded']:
            error=APIStatusError('private-key-and-prompt',response=httpx2.Response(429,request=request,headers={'x-request-id':'req_safe'}),body={'code':code,'message':'private-key-and-prompt'})
            d=failure_diagnostic(error);self.assertEqual(d['code'],code);self.assertEqual(d['httpStatus'],429);self.assertEqual(d['providerRequestId'],'req_safe');self.assertNotIn('private-key',str(d))
        d=failure_diagnostic(APITimeoutError(request=request));self.assertEqual(d['code'],'request_timeout');self.assertNotIn('httpStatus',d)
    def test_unknown_errors_and_request_identifiers_never_become_arbitrary_logs(self):
        d=failure_diagnostic(RuntimeError('private-secret'));self.assertEqual(d,{'code':'request_failed'})
        self.assertEqual(safe_diagnostic(SimpleNamespace(plan_failure={'code':{'unsafe':'private'}}),'reply_interrupted'),{'code':'reply_interrupted'})
        d=safe_diagnostic(SimpleNamespace(plan_failure={'code':'private-secret','httpStatus':'secret','providerRequestId':'unsafe secret'}),'reply_interrupted');self.assertEqual(d,{'code':'reply_interrupted'})

class CleanupTests(unittest.IsolatedAsyncioTestCase):
    async def test_failed_accounting_does_not_prevent_separate_lease_cleanup(self):
        import app
        db=AsyncMock();context=SimpleNamespace(scope=('1','2'),debug_trace=None)
        with patch.object(app,'finish_plan_reply',new=AsyncMock(side_effect=RuntimeError('private-secret'))):
            with self.assertLogs('app',level='ERROR') as logs:await app.cleanup(db,context,'test-token')
        self.assertIn('DELETE FROM portal_chatkit_leases',db.execute.call_args.args[0]);db.close.assert_awaited_once();self.assertNotIn('private-secret',' '.join(logs.output))

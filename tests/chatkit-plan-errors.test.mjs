import test from 'node:test';
import assert from 'node:assert/strict';
import {chatKitPlanErrorMessage,safeChatKitErrorCode} from '../lib/chatkit-plan-errors.js';
test('Active replies and completed usage incidents have different actionable messages',()=>{
 assert.match(chatKitPlanErrorMessage('plan_reply_running'),/already in progress/);
 assert.match(chatKitPlanErrorMessage('plan_usage_unavailable'),/usage recording/);
 assert.doesNotMatch(chatKitPlanErrorMessage('plan_usage_unavailable'),/Wait for it/);
 assert.equal(safeChatKitErrorCode('plan_reply_running'),'plan_reply_running');
});
test('Arbitrary backend text never becomes a client message or a log code',()=>{
 for(const code of ['private secret','__proto__','constructor',undefined]){
  assert.equal(chatKitPlanErrorMessage(code),'');assert.equal(safeChatKitErrorCode(code),'backend_request_failed');
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyEmployeeTask, guidanceContextUsable, guidanceFailureReason, guidanceFingerprint, guidanceInput,
  normalizeGuidance, parseGuidanceOutput, validateGuidanceIds } from '../../lib/employee-task-guidance.js';

test('task guidance accepts only a small unique list of numeric task IDs', () => {
  assert.deepEqual(validateGuidanceIds(['1', '23']), ['1', '23']);
  for (const value of [[], ['1', '1'], ['0'], ['-1'], ['1 OR 1=1'], Array(7).fill('1')]) {
    assert.equal(validateGuidanceIds(value), null);
  }
});

test('one redacted credential comment does not block analysis of the safe discussion', () => {
  const base = { commentsAvailable: true, commentsTruncated: false, conversationTooLong: false };
  assert.equal(guidanceContextUsable({ ...base, comments: [
    { content: '[Credential-related comment redacted]', redacted: true },
    { content: 'The client still needs to provide access.', redacted: false },
  ] }), true);
  assert.equal(guidanceContextUsable({ ...base, comments: [
    { content: '[Credential-related comment redacted]', redacted: true },
  ] }), false);
  assert.equal(guidanceContextUsable({ ...base, comments: [], commentsAvailable: false }), false);
});

test('task guidance fingerprint changes with comments, model, and day', () => {
  const context = { id: '1', comments: [{ content: 'Looks good, thanks.' }] };
  const provider = { id: 'openai', model: 'example-model' };
  const original = guidanceFingerprint(context, provider, '2026-10-08');
  assert.notEqual(original, guidanceFingerprint({ ...context, comments: [{ content: 'One more fix, please.' }] }, provider, '2026-10-08'));
  assert.notEqual(original, guidanceFingerprint(context, { ...provider, model: 'another-model' }, '2026-10-08'));
  assert.notEqual(original, guidanceFingerprint(context, provider, '2026-10-09'));
});

test('task guidance rejects unsupported badges and reply claims without comments', () => {
  assert.equal(normalizeGuidance({ label: 'done' }, { comments: [] }), null);
  assert.equal(normalizeGuidance({ label: 'needs_reply' }, { comments: [] }), null);
  assert.deepEqual(normalizeGuidance({ label: 'review_for_close', badgeText: 'AOC should verify closure', reason: 'Client approved.' },
    { comments: [{ content: 'Looks good, thanks.' }] }),
  { label: 'review_for_close', badgeText: 'AOC should verify closure', reason: 'Client approved.' });
  assert.deepEqual(normalizeGuidance({ label: 'needs_reply', badgeText: 'AOC should answer the reviewer', reason: 'Reply to the latest comment.' },
    { comments: [{ author: 'You', content: 'The feature is delivered.' },
      { author: 'Participant 202', content: 'Looks good, thanks.' }] }),
  { label: 'needs_reply', badgeText: 'AOC should answer the reviewer', reason: 'Reply to the latest comment.' });
  assert.equal(normalizeGuidance({ label: 'waiting', reason: 'Waiting for confirmation.' }, { comments: [] }), null);
  assert.equal(normalizeGuidance({ label: 'waiting', badgeText: '<script>Bad</script>', reason: 'Bad.' }, { comments: [] }), null);
});

test('task guidance sends the whole ordered discussion and author roles to the model', () => {
  const input = guidanceInput({ title: 'Featured promo', status: 'In Progress', dueAt: '',
    description: 'Release to all sites', comments: [
      { createdAt: '2026-10-01', author: 'Outside AOC 5', content: 'Please release this.' },
      { createdAt: '2026-10-02', author: 'You 1', content: 'Released and ready to review.' },
      { createdAt: '2026-10-03', author: 'Outside AOC 5', content: 'Great, thank you!' },
    ] });
  assert.ok(input.indexOf('Please release this.') < input.indexOf('Released and ready to review.'));
  assert.ok(input.indexOf('Released and ready to review.') < input.indexOf('Great, thank you!'));
  assert.match(input, /Outside AOC 5/);
});

test('OpenRouter classification uses chat completions with the saved model', async () => {
  const context = { title: 'Featured promo', status: 'Doing', dueAt: '', description: '',
    comments: [{ createdAt: '2026-10-08', author: 'Outside AOC 5', content: 'Looks great, thanks.' }] };
  let request;
  const client = { chat: { completions: { create: async value => {
    request = value;
    return { choices: [{ message: { content: '{"label":"review_for_close","badgeText":"AOC should verify before closing","reason":"Latest participant approved delivery."}' } }] };
  } } } };
  assert.deepEqual(await classifyEmployeeTask(context, client, { id: 'openrouter', model: 'chosen-model' }),
    { label: 'review_for_close', badgeText: 'AOC should verify before closing', reason: 'Latest participant approved delivery.' });
  assert.equal(request.model, 'chosen-model');
  assert.deepEqual(request.reasoning, { enabled: false });
  assert.equal(request.max_completion_tokens, 500);
  assert.match(request.messages[1].content, /Looks great, thanks/);
});

test('OpenRouter-routed GPT-6 Luna uses its fast no-reasoning mode', async () => {
  let request;
  const client = { chat: { completions: { create: async value => {
    request = value;
    return { choices: [{ message: { content: '{"label":"waiting","badgeText":"External reviewer to confirm delivery","reason":"AOC requested confirmation."}' } }] };
  } } } };
  const context = { title: 'Review delivery', status: 'Doing', dueAt: '', description: '',
    comments: [{ createdAt: '2026-10-08', author: 'AOC team 2', content: 'Please confirm the delivery.' }] };
  assert.equal((await classifyEmployeeTask(context, client,
    { id: 'openrouter', model: 'openai/gpt-6-luna' })).badgeText,
  'External reviewer to confirm delivery');
  assert.deepEqual(request.reasoning, { effort: 'none' });
});

test('OpenAI GPT-6 Luna classification uses fast Responses mode', async () => {
  const context = { title: 'Featured promo', status: 'Doing', dueAt: '', description: '',
    comments: [{ createdAt: '2026-10-08', author: 'Outside AOC 5', content: 'Looks great, thanks.' }] };
  let request;
  const client = { responses: { create: async value => {
    request = value;
    return { output_text: '{"label":"review_for_close","badgeText":"AOC should verify before closing","reason":"Latest participant approved delivery."}' };
  } } };
  assert.deepEqual(await classifyEmployeeTask(context, client, { id: 'openai', model: 'gpt-6-luna' }),
    { label: 'review_for_close', badgeText: 'AOC should verify before closing', reason: 'Latest participant approved delivery.' });
  assert.deepEqual(request.reasoning, { effort: 'none' });
  assert.match(request.input, /Looks great, thanks/);
});

test('provider failures explain unavailable models without exposing upstream text', () => {
  assert.match(guidanceFailureReason({ status: 404,
    error: { message: 'This model is unavailable for free. Use a paid slug.' } }), /selected AI model is unavailable/i);
  assert.match(guidanceFailureReason({ status: 404,
    error: { message: 'ZDR violation (account settings)' } }), /account policy blocks/i);
  assert.match(guidanceFailureReason({ status: 429 }), /rate limiting/i);
});

test('task guidance extracts a complete decision from fenced or prefaced JSON', () => {
  const context = { comments: [{ content: 'Looks good.' }] };
  assert.deepEqual(parseGuidanceOutput('Here is the decision:\n```json\n{"label":"review_for_close","badgeText":"AOC should verify client approval","reason":"Accepted {after review}."}\n```', context),
    { label: 'review_for_close', badgeText: 'AOC should verify client approval', reason: 'Accepted {after review}.' });
  assert.deepEqual(parseGuidanceOutput('{"label":"unknown","reason":"Invalid."}\n{"label":"continue_work","badgeText":"AOC should finish the requested update","reason":"Implementation remains."}', context),
    { label: 'continue_work', badgeText: 'AOC should finish the requested update', reason: 'Implementation remains.' });
});

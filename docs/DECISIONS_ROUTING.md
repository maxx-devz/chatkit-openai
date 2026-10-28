# Optional Client Portal Decisions routing

The client chat backend can use OpenAI `POST /v1/decisions` to classify an
ambiguous **Work questions** prompt before creating the existing answer agent.
There are no UI changes. This is intent routing, not an accuracy guarantee,
authorization system, source index, or replacement for the Responses API.

## Flow and boundaries

1. The existing signed portal request resolves the authenticated client/user,
   validates the mode/thread, loads approved context and reserves the logical
   request allowance before the classifier can run.
2. Clear task/file/website/image prompts and simple greetings keep local routing.
   Ambiguous prompts can send bounded, redacted current user text (2,000
   characters) and at most two prior user messages (750 characters each) from
   that scoped thread. No tool results, company instruction bodies, source
   documents, assistant replies or attachment bytes are included. Heuristic
   redaction is not a complete secret-detection guarantee.
3. A fixed choice schema selects project, documents, website, generation,
   general, mixed or uncertain. Only a structurally valid result with confidence
   **and selected-choice probability >= 0.85** can change routing. This is a
   conservative initial policy, not a measured/calibrated accuracy rate.
4. A project choice uses the existing authorized project route; other work
   choices retain the existing approved tools. A standalone general choice can
   remove tools, but referential follow-ups keep the work path. Nothing in a
   decision can change client/project IDs, expand permissions, enable a tool,
   choose a URL, execute a write, or supply final answer text/instructions.
5. Existing answer generation, source privacy, output sanitization, read-only
   Hubstaff access and per-client tool permissions remain in effect.

General chat never calls Decisions or Hubstaff. Staff/builder previews,
OpenRouter, other selected models, history/list operations, and the Internal
Portal do not use this feature. The separate Node AOC Admin assistant is
unchanged. Routing does not make unavailable Hubstaff data available; live
prefetch still depends on the portal's existing query recognition and index.

## Configuration and fallback

- Enabled by default only for saved OpenAI configuration with the exact selected
  model ID `gpt-6-luna` and genuine OpenAI base URL. No cross-provider credentials
  or automatic model substitution.
- Server-only `OPENAI_DECISIONS_ROUTING=false` disables it. No `.env.local` values
  were changed; restart the Python backend after configuration/code changes.
- Maximum one classification call per reply, no SDK retry, 2.5-second overall
  deadline. On timeout, 429, access error, refusal, low confidence or malformed
  result, the previous local router is used. Cancellation propagates normally.
- It may add latency and one billable provider call to an ambiguous reply. It
  cannot fix an exhausted API quota or guarantee provider availability. There
  is no claim that the entire portal becomes 10x faster.
- No global result cache or shared conversation memory is introduced. Logs do
  not include classification prompts, responses, credentials or source contents.

## Usage and costs

The client allowance remains **one logical chat reply**, not two. Reported
Decisions tokens are added to that reply's usage record without modifying the
Agents SDK's raw response usage (which would double count costs).

Every attempted classification adds a separate observation to the existing
client cost ledger, including unknown usage on failed/cancelled attempts. It
uses the existing `chat` category to avoid a schema migration; its pricing JSON
identifies `endpoint: /v1/decisions`, including when the amount is unknown.
Provider-reported token counts and the dated Decisions input/cache price catalog
produce an **estimate**, not a provider invoice. Decisions output is not charged.
Missing usage or expired pricing remains unknown, not zero. Existing cost-ledger
tables/migrations are still prerequisites for spending tracking.

## Verification and remaining checks

Offline tests cover the real installed SDK HTTP serialization against a mocked
transport, eligibility, scoped bounded inputs/redaction, typed result validation,
fallbacks, cancellation, usage aggregation and separate cost accounting.
No paid/live inference, deployment, or live quota test is authorized/performed
by these tests. Real routing accuracy, confidence calibration and latency still
need approved representative evaluation; no 100% accuracy claim is made.

Official documentation reviewed 2026-10-28:

- [Decisions guide](https://developers.openai.com/api/docs/guides/decisions)
- [Create a decision](https://developers.openai.com/api/reference/resources/decisions/methods/create)

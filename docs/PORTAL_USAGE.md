# Portal AI request capacity

Open `/admin` and select **AI usage**. The panel refreshes every 15 seconds while
visible, when the browser regains focus, after an admin reply, or when **Refresh
usage** is selected.

## What the progress bars mean

The progress bars show **remaining portal requests**, not tokens or an estimated
OpenAI cash balance:

- The administrator sees the combined remaining capacity and one bar for each
  client.
- A selected client's control panel shows that client's remaining percentage.
- Each client sees a compact remaining-request bar above AOC-GPT.
- Bars begin full and decrease as requests are accepted during the UTC month.
- Changing a client's monthly request limit in `/admin` immediately changes its
  bar. Resetting usage restores that client to its configured capacity.

The request limit remains enforced by the server. It is not merely a visual
counter, and a client cannot change it from the browser.

## OpenAI status versus OpenAI credits

The administrator panel also shows the last recorded OpenAI result for the
current server API key. A successful admin request records **Available**; known
billing, quota, credential, model-access, or rate-limit failures show the
appropriate warning. Changing `OPENAI_API_KEY` begins with **Not checked** until
an admin assistant request tests the new key.

OpenAI's Agents observability data exposes best-effort token usage for recorded
turns. OpenAI explicitly states that those counts are not a final bill. A normal
project API key does not provide a supported real-time remaining-credit balance,
and there is no reliable conversion from credits to “prompts left”: models,
history, tools, files, and answer length make every request cost different.

For that reason, this portal does not manufacture an account-credit percentage.
Use the [OpenAI billing page](https://platform.openai.com/settings/organization/billing/overview)
for the account's monetary credits and billing controls. The portal progress bars
remain accurate for the request allowances AOC controls whether the configured
OpenAI project is trial-funded, prepaid, or paid.

Official reference: [OpenAI Agents observability and usage](https://developers.openai.com/api/docs/guides/agents-api/observability).

## Storage and privacy

Provider-reported token totals continue to be recorded internally for operational
diagnostics, but raw token numbers are no longer sent to or displayed in the
administrator and client usage interfaces. No prompts, replies, API keys, or
account identifiers are stored in the usage summary tables.

Other applications using the same OpenAI account are not part of this portal's
client request allowances.

## Setup

Existing installations do not need a new environment variable or database
migration for the progress bars. Keep the current environment values, restart
the local services, and deploy both services normally:

```powershell
npm run setup:check
npm run dev
```

If API status storage was never installed, run `npm run usage:migrate` once
against the target database. Builds do not run migrations automatically.

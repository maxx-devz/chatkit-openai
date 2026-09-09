# Portal usage and the shared OpenAI account

Open `/admin` and select **AI usage**. It refreshes every 15 seconds while the
page is visible, on returning to the tab, or when you click **Refresh usage**.
No new API key is needed for this view.

The page shows two independent sets of figures:

- **Current client allowances:** requests used and remaining under each client's
  monthly portal limit. Paused clients cannot use their allowance. These limits
  are not a pooled OpenAI token wallet. Existing usage is preserved, including
  the effect of any previous admin resets.
- **Recorded AI activity:** text-agent tokens and runs from client ChatKit,
  the admin assistant, and staff draft tests. A run means an attempted assistant
  reply; it can make several model calls. These totals start when the updated
  service runs, with the first recorded date shown. Earlier requests are not
  reconstructed. Month boundaries use UTC. They are independent of allowance
  resets and contain no prompt text or account identifiers.

Completed or failed runs are recorded after they finish. **Without token report**
means the provider did not return usable usage information; it does not mean the
request was free. A timeout, connection failure, or interrupted stream can leave
partial or missing usage. Logs report database recording failures. Image-model
tokens and file-search/storage/tool charges are not included in the text-agent
totals. Local and deployed services using the same database share these totals;
use a separate development database if you want production-only figures.

The admin assistant currently has no monthly portal allowance. Draft tests have
a separate limit of 20 replies per staff member per hour. Client request and
file-attempt limits remain configured per client.

## Setup and rollout

1. Keep the current `.env.local` credentials.
2. Run `npm run usage:migrate` against the database shared by the target frontend
   and Python backend. This adds one table; it does not reset anything.
3. Restart `npm run dev` locally to load the updated Python code. On Vercel,
   deploy both projects from the updated release. The frontend alone cannot
   record client/draft token usage from an older Python deployment.
4. Open `/admin` → **AI usage**. Existing client allowances appear immediately.
5. After API billing is ready, try a client reply, an admin reply, and a draft
   test. Refresh after each finishes and verify the corresponding source row.

The database configured locally was migrated during implementation. Run the
migration separately for a different preview or production database. Builds do
not run migrations automatically. If the new table is missing, the panel shows
the setup step and still displays current client allowances.

## Billing errors and API request status

The status panel now shows the **last recorded admin assistant API result**:
credits exhausted, quota/billing limit reached, temporary rate limit, credential
or model access error, incomplete response, or a successful request. Billing
errors include a direct link to OpenAI billing. The same explanation appears
inside the failed chat message, including when OpenAI fails after streaming has
started. Partial text is preserved. The retry button explains when billing or
credentials need attention first.

AI usage refreshes immediately when an admin request finishes, as well as on its
regular interval. The result is dated and scoped to the current server API key;
changing the key starts with unknown status. A successful subsequent request
replaces the warning. Refreshing the usage panel reads the stored result; it
does not query OpenAI or spend tokens. After topping up, retry your message to
verify access. A model-list request cannot verify available credits.

Rerun `npm run usage:migrate` to add the status table. The migration is safe to
repeat. No new credentials are needed. Status currently covers the admin text
assistant; Python client/draft failures are not monitored by this status panel.
It does not automatically disable the composer or block recovery retries.

Credit exhaustion and temporary throughput limits can both produce HTTP 429,
so the portal uses the provider's error code to distinguish them. Unknown errors
do not expose raw provider messages, keys, or private request contents.
[Official error-code guidance](https://developers.openai.com/api/docs/guides/error-codes).

## Why the OpenAI balance says “Amount unavailable”

You chose portal-only usage reporting for now. The billing warning comes from
actual request failures. The application does not fetch
organization-wide OpenAI costs or credit balance, and it does not need an
`OPENAI_ADMIN_KEY` for this implementation.

OpenAI documents organization Usage and Costs APIs for aggregate consumption
and spending. Those are separate from each response's token report. They should
not be treated as a fixed count of remaining prompts; request sizes, models, and
tools vary. No supported real-time remaining-credit endpoint was verified during
this implementation. Check the API Platform's usage/billing pages for the
account's billing status. An organization usage/cost connection can be added
later with appropriate organization credentials and project scoping.
[Official Usage API reference](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage).

If both Vercel services use API keys from the same OpenAI project, their calls
are billed to that project. Other apps may consume the same account's credits
without appearing in this portal's database. ChatGPT Business subscription
access is separate from API billing.

## Decisions from answer.txt

- English by default; professional, humble, attentive to available chat context.
- AOC builds, migrates, and customizes ecommerce stores, mainly Shopify,
  BigCommerce, and WooCommerce.
- Staff approve and publish instructions/tools once. Generated outputs do not
  require a separate per-file approval step under the current configuration.
- Flexible DOCX and image generation remain available when staff enable and
  publish them for a client. Client chat history stays until deleted.
- **Uploads remain disabled**, as requested, until a malware-scanning approach
  is selected. No scanner or automatic malicious-upload account blocking is
  implemented. An AI model is not a replacement for a scanner.
- Approved company/client documents have not been supplied. Google Drive and
  spreadsheet generation remain future integrations. Existing Hubstaff portal
  views do not give the ChatKit agent live Hubstaff access automatically.
- Use the existing `maxx` login for the final client acceptance test; no password
  was supplied or changed. Publishing rules for that client is a staff action.

# Approved client website access

Each client can have one administrator-approved public website. When configured,
AOC-GPT receives a hosted web-search tool whose domain filter is created on the
server from that saved setting. A client prompt cannot replace or broaden the
approved domain.

## Configure a client

1. Sign in to `/admin` as an AOC administrator.
2. Open **Client controls** and select the client.
3. In **Client integrations**, find **Approved website URL**.
4. Enter the public HTTPS base address. For example:
   - SPP: `https://abc.com`
   - CWR: `https://cwr.com`
5. Save the client settings.
6. In that client's assistant, test: `Search our approved website for the services page and cite your sources.`

The portal saves only the HTTPS origin. A value such as
`https://abc.com/about?source=portal` becomes `https://abc.com/`. Enter the base
domain (rather than only `www`) when you want the approved domain and its
subdomains to be searchable.

Clear the field and save to remove public website access for that client.

## Security boundary

- Only an AOC administrator can change the approved website.
- The backend constructs the domain filter from the database; it does not trust
  a domain supplied in a chat message.
- Only public HTTPS domain names are accepted. Localhost, IP addresses, private
  network-style names, credentials in URLs, and custom ports are rejected.
- Search results are treated as untrusted reference content, never as assistant
  instructions.
- The tool is read-only. It cannot edit the website or submit forms.

OpenAI's allowed-domain filter includes subdomains. For example, approving
`abc.com` can include `www.abc.com`. The assistant is instructed to cite the
public pages it uses.

## What this does not provide

This is public web research, not a full-site crawler or authenticated browser.
It cannot reliably read pages behind a login, private dashboards, robots or
indexing restrictions, or content that is available only after complex browser
interaction. Save private/reference files in the client's **Library** instead.
An authenticated website integration would require a separate, narrowly scoped
API or OAuth connector.

Web search is an OpenAI API tool call and may add tool-call charges. It still
uses the portal's normal client request allowance.

## Database and deployment

For an existing database, apply the additive column once:

```powershell
npm run admin:migrate
npm run setup:check
```

The Next.js project owns the admin field and validation. The Python ChatKit
backend owns the restricted web-search tool. Deploy both services after pushing
these changes, then test with one client before enabling more domains.

Official reference: [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search).

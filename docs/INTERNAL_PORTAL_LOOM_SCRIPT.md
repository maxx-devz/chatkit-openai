# AOC Internal Portal — Loom walkthrough script

Draft for client review, 2026-10-16. Aim for about five minutes. Use the [panel walkthrough slides](https://docs.google.com/presentation/d/1PSo29EAzblscDI660OSwQ0-VhqZbg1cgi8EV_7xUbGI/edit) alongside an approved multi-role demo account.

Before recording, confirm whether the branch shown in the slides has been deployed to staging. If it has not, demonstrate the current branch locally and say so; do not imply that the staging URL already contains these changes. Avoid showing passwords, tokens, detailed HR leave records, or client-sensitive data.

## Slide 1 — The point of this portal (about 25 seconds)

**Show:** Slide 1.

**Say:** “Here is the portal overview you asked for. The goal is not to copy AOC GPT or fill the screen with technical labels. It is to give each person a useful view of their work and, as integrations are connected, give leadership a clear picture of the business. I will separate what we have implemented in the current branch from pages that only preview future data.”

## Slide 2 — Why accounts see different sidebars (about 35 seconds)

**Show:** Slide 2; point to the illustrative sidebar.

**Say:** “This is one internal portal, but not everyone sees every link. My Work and Team are the shared starting points. Under My Workspace, someone may have several authorized responsibilities, such as Project Management and HR, and see both. A role makes the relevant workspace available; panel settings can hide parts of a page. The server still checks permission when data is requested. This picture shows a multi-role account, not what every employee should see.”

## Slide 3 — My Work and Team (about 40 seconds)

**Show:** Slide 3, then briefly open My Work and Team in the portal if the demo account is ready.

**Say:** “My Work is personal: it shows my own Hubstaff assignments, daily plan, and recent task activity. Team is different. It lists AOC members even if they do not have a portal login. It can show a simple work status—On Shift, Off Shift, Away, or Unknown—when the source can verify it. Everyone can see the basic team view, but detailed leave dates and reasons are not shared there. Unknown is intentional when we cannot verify a schedule or a fresh status.”

## Slide 4 — Project Management and HR (about 40 seconds)

**Show:** Slide 4; optionally open the two working workspaces with an authorized account.

**Say:** “Project Management now has read-only Hubstaff Tasks folders, projects, and tasks for a selected project, including assignees and due dates. It does not write changes back to Hubstaff. HR has a separate read-only view of approved leave, requests, balances, and people and schedule coverage. The private leave details require the HR role or Internal Admin. A job title by itself does not grant either workspace.”

## Slide 5 — Website Performance (about 45 seconds)

**Show:** Slide 5, then the Website Performance preview page. Do not present preview cards as measured results.

**Say:** “This is the website dashboard the client was describing. For each of the three AOC sites, the planned view shows sessions, users, page views, trends, traffic sources, and top landing pages. It will also show site-wide conversions after we agree which GA4 events count as conversions. Search Console can add search clicks and queries later. We have not connected GA4 yet, so the current page explains the intended panels rather than showing numbers. CRO does not need a duplicate page; its role can use this shared view. Campaign-specific outcomes belong in Marketing Performance.”

## Slide 6 — Sales, Marketing, Support, and Billing (about 50 seconds)

**Show:** Slide 6; open one or two preview pages to show that their cards describe future contents and sources.

**Say:** “Sales Pipeline is intended to answer how many leads and deals we have at each stage and what is moving or stalled, using HubSpot. Marketing Performance will show campaign traffic and campaign-attributed outcomes, once campaign tagging is defined. Customer Support will show open conversations, follow-up work, and volume and response trends from Help Scout. Billing stays because it has a clear first use: status and readiness from the approved Client Billing Status Index. Restricted decision summaries and aggregate Ramp spend can come later. This is not an invoicing or payment screen. All four pages are previews today, not live data connections.”

## Slide 7 — Business Overview (about 30 seconds)

**Show:** Slide 7.

**Say:** “Business Overview is the leadership dashboard. It should pull approved summaries from the operational areas—project delivery, people capacity, website traffic, sales, support, and billing—so leadership can see trends and issues in one place. We will not show a missing integration as zero, and this summary does not automatically expose individual HR or sensitive finance records.”

## Slide 8 — What today's demo proves, and what comes next (about 35 seconds)

**Show:** Slide 8; finish with the portal sidebar and a planned preview page.

**Say:** “The distinction is the main takeaway. The personal, Team, Project Management, and HR readers are implemented in this branch. The other workspaces currently describe what they will show when their sources are connected. If you see fewer links than on this slide, that can be because the account lacks a role or because the updated branch is not on staging yet; we should verify both before judging the screen. The next step is to deploy and verify this branch on staging, then confirm the three GA4 site mappings and the other source owners before connecting each planned area. Development and a separate CRO page are intentionally not in the sidebar.”

## Final live click-through (about 45–60 seconds)

**Show:** In the portal, click My Work → Team → Project Management → HR → Website Performance → Billing. Use a demo account authorized for each area; if one is not available, demonstrate only authorized pages and use the slides for the rest.

**Say:** “This is how I would move through the product: personal work first, then the team and operational pages, then the clearly marked preview areas. Please tell me whether these are the right questions for each page—especially which website measures, sales pipeline views, and billing-readiness signals matter most. We can adjust the panels before we connect the remaining systems.”

Do not say that the Loom has been recorded until a recording has actually been made. The deck and this script are recording materials, not a published video.

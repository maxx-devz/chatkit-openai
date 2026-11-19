# Client Documents and AI Commerce Journey

Branch: client-documents, created from master916bbf5 in AI\portal.

## Step 1 - layout prototype only

The user requested gradual implementation ("konti-konti"), real Google sign-in
when required, and clearly labeled prototypes for unfinished work. This step adds
only the shared presentation and authorized admin preview. No database, Google
connection, publication, download service, payment or milestone is created.
No fake client accounts, documents, receipts or completed stages are introduced.

Review routes after signing in through the existing portal:
- /admin/client-documents: authorized AOC administrators; includes planned admin flow.
- /admin/client-documents?preview=client: same admin authorization, client-layout preview.
- /?view=documents&journeyPreview=1: signed-in client's Documents view with opt-in layout preview.
- /?journeyPreview=1: opt-in dashboard document-summary prototype linking to the library.
- /?view=documents: existing library remains unchanged by default.

Existing library links and downloads remain separate. Prototype stages are all
unconfirmed and have no progress value. Unfinished actions have explanatory empty
states rather than fake working buttons. Stage labels are proposed display text;
the reference's seven-stage/five-step crosswalk needs owner confirmation before
live release. Reading a client document does not authorize sending its data to AI.

## Next small step (pending)

The user clarified that no Google file is available yet. The intended real flow
is: admin selects a client (for example Golfbrands), assigns and publishes its
approved file, then that client sees it on the dashboard and can view/download it.
This matches the task. No real file or test-client assignment is assumed.
Obtain the approved test client/file or client-facing folder when the integration
step is reached; do not block the current layout prototype on that missing file. Inspect the existing Drive
connection privately and request user sign-in/consent through the portal if needed;
never request passwords/tokens in chat. Do not substitute a fake provider when a
real authenticated pilot is requested. No real account/folder has been selected,
no live Google request performed and no Development/Roeland alignment claimed.

Then implement and review client-to-folder mapping before moving to file
publication, protected retrieval and verified milestones in subsequent steps.
No broad automatic publication, editable duplicate files, payment inference or
upload-triggered stage advancement. Billing remains authoritative. Keep existing
AOC authentication, client permissions, resources and Hubstaff behavior intact.

No .env file or configured Neon database is changed. No migration is needed for
this presentation step. Push/merge remains with the user. Verification results
are recorded below after running checks; a UI-only preview cannot establish
Google permissions or authenticated download isolation.


## Automation clarification

The task requires reusing approved Drive files; it does not require uploading a
second copy through the admin portal. The planned setup assigns the client's
approved Drive location once. Published file references and verified released
versions can then be retrieved/synchronized automatically for the client dashboard.
Existing email delivery continues. An official approved-release signal must be
agreed before fully automatic publication; a newly discovered file alone is not
approval, a payment event or a journey milestone. Until the real folder and release
rule exist, the UI describes this plan explicitly as a prototype, with no simulated
sync provider or fake working download buttons. Source/client isolation checks and
Drive sign-in will be implemented in subsequent small steps, not claimed here.

## Step 1 checks

- Production build passes with private environment values shadowed and no database connection.
- All352 existing top-level Node tests pass.
- Six desktop/mobile component-preview scenarios pass. These prove layout, empty
  states, navigation targets and no attempted data/provider calls; they do not
  prove portal authentication, Drive permissions, file delivery or milestone accuracy.
- Changed-file lint passes. Full repository lint retains two existing
  react-hooks/set-state-in-effect errors in the unchanged Website Insights component.
  They are outside this small presentation step and were not modified.
- No migration, database write, Google request, real message or external coordination.


## Layout-only local review

- http://127.0.0.1:3116/?mode=admin : planned admin setup and release flow.
- http://127.0.0.1:3116/ : full client document/journey layout.
- http://127.0.0.1:3116/?mode=dashboard : dashboard summary layout.

This separate presentation preview does not impersonate a signed-in client and
has no authentication, database, Drive or payment connection. No client identity
or fake file is supplied. Existing protected portal routes still use their real
AOC/client login checks. The localhost preview process is temporary and can be
stopped independently. Mobile/desktop screenshots were inspected. Current copy
makes one-time folder assignment and no duplicate upload explicit.

This is a small prototype checkpoint, not completion of the document integration.
Next small step: implement admin client/location assignment, then connect the
approved real Google account/file when available. Stop before enabling automated
publication until the authoritative approved-release rule has been agreed.

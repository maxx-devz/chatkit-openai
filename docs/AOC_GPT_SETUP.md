# Configure the portal to follow AOC-GPT

Your team's AOC-GPT is an existing custom GPT inside ChatGPT Business. The portal
uses an independently configured API assistant with ChatKit as its interface.
Its name can be AOC-GPT, but its instructions, knowledge, and tools must be
transferred and tested. There is no automatic synchronization with the custom GPT.

## Transfer the approved behavior

1. Have the GPT's owner or an authorized editor open its configuration in ChatGPT.
   Copy its approved instructions and conversation starters. Get the original
   knowledge documents from their authorized owner. A share link is insufficient.
2. Sign into this portal as an active administrator. Open **Assistant settings**
   at `/builder` and select the intended client.
3. Put the behavior rules in **Instructions**: role, tone, allowed tasks, questions
   to ask, and when to refer the client to a person. Global AOC rules in
   `config/assistant.js` also apply.
4. Put approved facts/FAQs in **Knowledge**. For a larger document collection,
   upload approved files to an OpenAI API vector store in your API project and
   enter its `vs_...` ID. The portal does not upload these files for you.
   Use stores containing only information that this client is allowed to access.
5. Enable the implemented tools in **Tools**. DOCX supports titles, headings,
   paragraphs and bullets; images produce square WebP files.
6. **Save draft**. Test representative AOC-GPT questions and compare results,
   including missing-information questions and requests outside approved scope.
7. **Publish for [client]**, then check the actual client ChatKit conversation.

Changes in the ChatGPT GPT editor do not change the portal. Update, test, and
publish the portal configuration when approved instructions or knowledge change.

## Approval and connected apps

Staff approval currently applies to the configuration and enabled tools.
Generated files become available immediately to the requesting user. If every
output needs a separate staff review before download, that is an additional
workflow to build.

Google Drive, Shopify, Hubstaff chat tools, custom GPT Actions, and other external
connections do not transfer automatically. For each future integration, specify:

- Which service and account/folder the client may use.
- Whether it only reads information or also creates/changes records.
- Whether an action requires the client's confirmation or staff approval.
- Which clients may use it, and how errors and duplicate requests should behave.

The portal's existing Hubstaff dashboard reads are separate from chat tools.

## Chat components

The implemented file card lives in `chatkit_backend/generated-file.widget`.
It uses ChatKit's `WidgetTemplate` with an authenticated download action.
OpenAI's Widget Builder at <https://widgets.chatkit.studio/> can help design
additional cards. New actions and tools still need server implementation,
authorization, and testing. It is not an n8n-style automation editor.

Fill in the Git-ignored `answer.txt` in the project root with approved behavior,
file examples, and remaining integration requirements. Do not put credentials
or client-sensitive source documents in that questionnaire. Use `.env.local`
and Vercel environment settings for credentials.

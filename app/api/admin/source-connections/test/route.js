import OpenAI from "openai";
import { resolveAdminContext, adminErrorResponse } from "@/lib/admin-data";
import { assertTrustedOrigin, readJsonRequest, requestSecurityErrorResponse } from "@/lib/request-security";
import { getRuntimeProvider } from "@/lib/provider-settings";
import { recordAdminUsage } from "@/lib/portal-usage";
import { openaiIssue } from "@/lib/openai-issues";
import { previewConnectedSource } from "@/lib/drive-source-service";
import { DriveSourceError } from "@/lib/drive-source-policy";
import { SOURCE_TEST_LIMITS, sourceTestProvider } from "@/lib/drive-source-test-policy";
import { createPrivateSourceTester } from "@/lib/drive-source-test-runner";
import { loadAutomaticSourceContext } from "@/lib/drive-source-auto-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };

const runTest = createPrivateSourceTester({
  getProvider: getRuntimeProvider, readSource: previewConnectedSource, recordUsage: recordAdminUsage,
  loadAutomaticContext: loadAutomaticSourceContext,
  generate: async (provider, body, options) => {
    try {
      const client = new OpenAI({ apiKey: provider.apiKey, baseURL: provider.baseURL, defaultHeaders: provider.defaultHeaders,
        maxRetries: 0, timeout: 50_000 });
      return await client.responses.create(body, options);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      const issue = openaiIssue(error, provider.id);
      throw new DriveSourceError(issue.code, issue.message, issue.httpStatus);
    }
  },
});

function failure(error) {
  let response;
  if (error?.publicDetails) response = adminErrorResponse(error);
  else response = requestSecurityErrorResponse(error);
  if (response) { for (const [key, value] of Object.entries(headers)) response.headers.set(key, value); return response; }
  if (error instanceof DriveSourceError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
  if (["AbortError", "TimeoutError"].includes(error?.name)) return Response.json({ error: "The private test was cancelled or timed out. No source was published.", code: "source_test_cancelled" }, { status: 408, headers });
  return Response.json({ error: "The private source test could not finish. Check the source connection and AI provider settings.", code: "source_test_unavailable" }, { status: 503, headers });
}

export async function GET(request) {
  try {
    await resolveAdminContext(request.headers);
    return Response.json({ provider: sourceTestProvider(await getRuntimeProvider()), limits: SOURCE_TEST_LIMITS }, { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    const { admin } = await resolveAdminContext(request.headers);
    const body = await readJsonRequest(request, 12_000);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(100_000)]);
    return Response.json(await runTest(admin.id, body, { signal }), { headers });
  } catch (error) { return failure(error); }
}

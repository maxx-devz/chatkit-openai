import {
  adminErrorResponse,
  assertTrustedAdminMutation,
  resolveAdminContext,
} from "@/lib/admin-data";
import {
  makeWebhookErrorResponse,
  sendMakeConnectionTest,
} from "@/lib/make-webhook";
import { databasePool } from '@/lib/database';
import { startIntegrationRun, finishIntegrationRun } from '@/lib/integration-run-audit';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  let runId;
  try {
    assertTrustedAdminMutation(request.headers);
    const { admin } = await resolveAdminContext(request.headers);
    runId = await startIntegrationRun(databasePool, { source: 'make', operation: 'connection_test',
      actorUserId: admin.id, portalArea: 'aoc_admin', triggerType: 'manual' });
    const result = await sendMakeConnectionTest();
    await finishIntegrationRun(databasePool, runId, { status: 'succeeded' });
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (runId) await finishIntegrationRun(databasePool, runId,
      { status: 'failed', errorCode: 'connection_unavailable' }).catch(() => {});
    return makeWebhookErrorResponse(error) || adminErrorResponse(error);
  }
}

import { resolveAdminContext, adminErrorResponse } from "@/lib/admin-data";
import { assertTrustedOrigin, readJsonRequest, requestSecurityErrorResponse } from "@/lib/request-security";
import { publicProviderSettings, getRuntimeProvider, providerFromKey, saveProviderConfiguration } from "@/lib/provider-settings";
import { validateProvider, validateProviderKey } from "@/lib/provider-secrets";
import { getModelCatalog } from "@/lib/openai-models";
import { validateSiteModel } from "@/lib/site-ai-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

function failure(error) {
  if (error?.publicDetails) return adminErrorResponse(error);
  return requestSecurityErrorResponse(error) || Response.json({ error:
    error?.code === "42P01" ? "Run npm run site-ai:migrate before configuring providers."
      : "Could not verify or save this configuration. Check the key, provider access, and server encryption setup." },
  { status: 400, headers });
}

export async function GET(request) {
  try {
    await resolveAdminContext(request.headers);
    return Response.json(await publicProviderSettings(), { headers });
  } catch (error) { return failure(error); }
}

async function configure(request, save) {
  try {
    assertTrustedOrigin(request.headers);
    const { admin } = await resolveAdminContext(request.headers);
    const body = await readJsonRequest(request, 4000);
    const id = validateProvider(body.provider);
    const key = body.apiKey ? validateProviderKey(id, body.apiKey) : "";
    const provider = key ? providerFromKey(id, key) : await getRuntimeProvider(id);
    if (!provider.apiKey) return Response.json({ error: "Enter an API key for this provider." }, { status: 400, headers });
    if (id === "openrouter") {
      const checked = await fetch("https://openrouter.ai/api/v1/key", {
        headers: { Authorization: `Bearer ${provider.apiKey}` }, cache: "no-store", redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      await checked.body?.cancel();
      if (!checked.ok) return Response.json({ error: "OpenRouter could not verify this API key." }, { status: 400, headers });
    }
    const catalog = await getModelCatalog(provider, { fresh: Boolean(key) || save });
    if (save) {
      let model;
      try { model = validateSiteModel(body.model, catalog); }
      catch (error) { return Response.json({ error: error.message }, { status: 400, headers }); }
      await saveProviderConfiguration(id, key, model, admin.id);
      return Response.json(await publicProviderSettings(), { headers });
    }
    return Response.json({ ...catalog, savedModel: provider.model }, { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request) { return configure(request, false); }
export async function PUT(request) { return configure(request, true); }

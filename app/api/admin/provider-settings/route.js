import { resolveAdminContext, adminErrorResponse } from "@/lib/admin-data";
import { assertTrustedOrigin, readJsonRequest, requestSecurityErrorResponse } from "@/lib/request-security";
import { publicProviderSettings, getRuntimeProvider, providerFromKey, saveProviderConfiguration } from "@/lib/provider-settings";
import { validateProvider, validateProviderKey } from "@/lib/provider-secrets";
import { getModelCatalog } from "@/lib/openai-models";
import { validateSiteModel } from "@/lib/site-ai-repository";
import { missingProviderSchemaMessage } from "@/lib/provider-configuration";
import { validateGenerationOptions } from "@/lib/provider-generation-options";
import { checkOpenRouterAccount, OpenRouterSetupError } from "@/lib/openrouter-setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };

function failure(error) {
  if (error instanceof OpenRouterSetupError) return Response.json({ error: error.message }, { status: error.status, headers });
  if (error?.publicDetails) return adminErrorResponse(error);
  return requestSecurityErrorResponse(error) || Response.json({ error:
    missingProviderSchemaMessage(error)
      || "Could not verify or save this configuration. Check the key, provider access, and server encryption setup." },
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
    const settings = await publicProviderSettings();
    if (!settings.ready) return Response.json({ error: settings.setupMessage }, { status: 503, headers });
    const body = await readJsonRequest(request, 4000);
    const id = validateProvider(body.provider);
    const key = body.apiKey ? validateProviderKey(id, body.apiKey) : "";
    const provider = key ? providerFromKey(id, key) : await getRuntimeProvider(id);
    if (!provider.apiKey) return Response.json({ error: "Enter an API key for this provider." }, { status: 400, headers });
    const account = id === "openrouter" ? await checkOpenRouterAccount(provider) : undefined;
    const catalog = await getModelCatalog(provider, { fresh: true });
    if (save) {
      let model, generationOptions;
      try {
        model = validateSiteModel(body.model, catalog);
        generationOptions = validateGenerationOptions(id, catalog.models.find(item => item.id === model), body.generationOptions);
      }
      catch (error) { return Response.json({ error: error.message }, { status: 400, headers }); }
      if (request.signal.aborted) return Response.json({ error: "Saving was cancelled." }, { status: 409, headers });
      await saveProviderConfiguration(id, key, model, admin.id, generationOptions);
      return Response.json({ ...await publicProviderSettings(), account,
        activation: { provider: id, id: model, generationOptions, generationTested: false } }, { headers });
    }
    return Response.json({ ...catalog, account, savedModel: provider.model }, { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request) { return configure(request, false); }
export async function PUT(request) { return configure(request, true); }

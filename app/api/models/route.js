import {
  getFallbackModelCatalog,
  getModelCatalog,
} from "@/lib/openai-models";
import {
  portalErrorResponse,
  resolvePortalContext,
} from "@/lib/portal-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await resolvePortalContext(request.headers);
  } catch (error) {
    return portalErrorResponse(error);
  }

  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 503 },
    );
  }

  let catalog;
  let notice = "Models returned by this server's OpenAI API key.";

  try {
    catalog = await getModelCatalog();
  } catch (error) {
    console.error("OpenAI model list failed", {
      name: error?.name,
      status: error?.status,
      code: error?.code,
      requestId: error?.request_id,
    });
    catalog = getFallbackModelCatalog();
    notice = "Model access could not be verified. The configured server default is shown.";
  }

  return Response.json(
    {
      defaultModel: catalog.defaultModel,
      models: catalog.models,
      verified: catalog.verified,
      imageGenerationAvailable: Boolean(catalog.imageModel),
      notice,
      billingNotice: "OpenAI API usage is separate from a ChatGPT subscription and may be billed.",
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

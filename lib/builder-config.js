export const DEFAULT_BUILDER_CONFIG = {
  instructions: "", knowledge: "", vectorStoreId: "", fileSearch: true,
  documents: false, images: false, documentLimit: 50, imageLimit: 10,
  greeting: "What can we work on today?", accent: "#1765ca",
  starters: ["Help me plan my next steps", "Help me draft a message", "Explain our approved services"],
};

export function builderError(message, status = 400) {
  return Object.assign(new Error(message), { publicDetails: { message, status, code: "builder_error" } });
}

export function validateBuilderConfig(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some((key) => !(key in DEFAULT_BUILDER_CONFIG))) {
    throw builderError("Unrecognized assistant settings.");
  }
  const result = {};
  for (const [key, limit] of Object.entries({ instructions: 12000, knowledge: 16000, vectorStoreId: 200, greeting: 160, accent: 7 })) {
    if (typeof input[key] !== "string" || input[key].length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input[key])) {
      throw builderError(`${key} must be text with at most ${limit} characters.`);
    }
    result[key] = input[key].trim();
  }
  if (!result.greeting || !/^#[0-9a-f]{6}$/i.test(result.accent)) throw builderError("Enter a greeting and a valid accent color.");
  if (result.vectorStoreId && !/^vs_[A-Za-z0-9_-]+$/.test(result.vectorStoreId)) throw builderError("The knowledge store ID must start with vs_.");
  for (const key of ["fileSearch", "documents", "images"]) {
    if (typeof input[key] !== "boolean") throw builderError(`${key} must be enabled or disabled.`);
    result[key] = input[key];
  }
  for (const key of ["documentLimit", "imageLimit"]) {
    if (!Number.isInteger(input[key]) || input[key] < 1 || input[key] > 500) throw builderError("Generation limits must be whole numbers from 1 to 500.");
    result[key] = input[key];
  }
  if (!Array.isArray(input.starters) || input.starters.length > 3 || input.starters.some((item) => typeof item !== "string" || item.length > 200 || /[\u0000-\u001f\u007f]/.test(item))) {
    throw builderError("Use up to three starter prompts, each at most 200 characters.");
  }
  result.starters = input.starters.map((item) => item.trim()).filter(Boolean);
  return result;
}

export function publicBuilderConfig(config) {
  return { greeting: config.greeting, accent: config.accent, starters: config.starters };
}

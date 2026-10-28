// Explicit, portable settings only. Never accept arbitrary provider parameters.
export const REASONING_EFFORTS = ["auto", "low", "medium", "high"];

export function modelReasoningEfforts(provider, model) {
  if (provider === "openai") {
    // Verified against the model documentation; unknown models keep provider defaults.
    return /^gpt-6-luna(?:-\d{4}-\d{2}-\d{2})?$/.test(model?.id || "") ? REASONING_EFFORTS : ["auto"];
  }
  const supported = model?.reasoning?.supported_efforts;
  if (supported === null) return REASONING_EFFORTS;
  return ["auto", ...REASONING_EFFORTS.slice(1).filter(value => Array.isArray(supported) && supported.includes(value))];
}

export function validateGenerationOptions(provider, model, input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)
      || Object.keys(input).some(key => key !== "reasoningEffort")) throw new Error("Invalid generation settings.");
  const reasoningEffort = input.reasoningEffort ?? "auto";
  if (!modelReasoningEfforts(provider, model).includes(reasoningEffort)) {
    throw new Error("This reasoning effort is not supported by the selected model. Choose Auto or refresh models.");
  }
  return { model: model.id, reasoningEffort };
}

export function runtimeGenerationOptions(provider) {
  const options = provider.generationOptions;
  if (options?.model !== provider.model || !REASONING_EFFORTS.slice(1).includes(options.reasoningEffort)) return {};
  if (provider.id === "openai" && modelReasoningEfforts("openai", { id: provider.model }).includes(options.reasoningEffort)) {
    return { reasoning: { effort: options.reasoningEffort } };
  }
  return provider.id === "openrouter" && !/^openrouter\//.test(provider.model)
    ? { reasoning: { effort: options.reasoningEffort } } : {};
}

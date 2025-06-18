import { OpenAiClient } from "./openaiClient.js";
import { OpenRouterClient } from "./openrouter.js";

export function getProvider(config) {
  if (config.llmProvider === "openai") {
    return new OpenAiClient(config.openAiApiKey, config.openAiOrg);
  } else {
    return new OpenRouterClient(config.openRouterApiKey);
  }
}

export function listModels(provider) {
  return provider.getAvailableModels();
}

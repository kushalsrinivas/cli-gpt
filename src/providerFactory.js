import { OpenAiClient } from "./openaiClient.js";
import { OpenRouterClient } from "./openrouter.js";

let _cachedProvider = null;

export function createProvider(config) {
  const desiredType = config.llmProvider;

  // Return cached instance if it matches current provider type
  if (_cachedProvider && _cachedProvider.__providerType === desiredType) {
    return _cachedProvider;
  }

  const instance =
    desiredType === "openai"
      ? new OpenAiClient(config.openAiApiKey, config.openAiOrg)
      : new OpenRouterClient(config.openRouterApiKey);

  // Tag instance to understand its origin for caching purposes
  instance.__providerType = desiredType;
  _cachedProvider = instance;
  return instance;
}

export function getProvider(config) {
  return createProvider(config);
}

export function listModels(provider) {
  return provider.getAvailableModels();
}

import axios from "axios";

export class OpenRouterClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = "https://openrouter.ai/api/v1";
    this.defaultModel = "sarvamai/sarvam-m:free";

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/your-username/cliagent",
        "X-Title": "CLI Agent Tool",
      },
    });
  }

  async chat(messages, options = {}) {
    if (!this.apiKey || this.apiKey === "your-openrouter-api-key-here") {
      return "I'm a placeholder AI response. Please configure your OpenRouter API key to get real AI responses. You can do this by running 'cliagent config' or setting the OPENROUTER_API_KEY environment variable.";
    }

    try {
      const response = await this.client.post("/chat/completions", {
        model: options.model || this.defaultModel,
        messages: messages,
        max_tokens: options.maxTokens || 2000,
        temperature: options.temperature || 0.7,
        top_p: options.topP || 0.9,
        stream: false,
      });

      return response.data.choices[0].message.content;
    } catch (error) {
      if (error.response) {
        throw new Error(
          `OpenRouter API Error: ${error.response.status} - ${
            error.response.data.error?.message || "Unknown error"
          }`
        );
      } else if (error.request) {
        throw new Error("Network error: Unable to reach OpenRouter API");
      } else {
        throw new Error(`Request error: ${error.message}`);
      }
    }
  }

  async getModels() {
    try {
      const response = await this.client.get("/models");
      return response.data.data;
    } catch (error) {
      throw new Error(`Failed to fetch models: ${error.message}`);
    }
  }

  setModel(model) {
    this.defaultModel = model;
  }

  getAvailableModels() {
    return [
      "sarvamai/sarvam-m:free",
      "deepseek/deepseek-r1-0528:free",
      "deepseek/deepseek-r1-0528-qwen3-8b:free",
      "anthropic/claude-3.5-sonnet",
      "anthropic/claude-3-haiku",
      "openai/gpt-4-turbo",
      "openai/gpt-3.5-turbo",
      "meta-llama/llama-2-70b-chat",
      "mistralai/mixtral-8x7b-instruct",
    ];
  }
}

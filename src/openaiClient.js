import OpenAI from "openai";

export class OpenAiClient {
  constructor(apiKey, organization = null) {
    this.apiKey = apiKey;
    this.organization = organization;
    this.defaultModel = "gpt-3.5-turbo";

    this.client = new OpenAI({
      apiKey: this.apiKey,
      organization: this.organization,
    });
  }

  async chat(messages, options = {}) {
    if (!this.apiKey || this.apiKey === "your-openai-api-key-here") {
      return "I'm a placeholder AI response. Please configure your OpenAI API key to get real AI responses. You can do this by running 'cliagent config' or setting the OPENAI_API_KEY environment variable.";
    }

    try {
      const response = await this.client.chat.completions.create({
        model: options.model || this.defaultModel,
        messages: messages,
        max_tokens: options.maxTokens || 2000,
        temperature: options.temperature || 0.7,
        top_p: options.topP || 0.9,
        stream: false,
      });

      return response.choices[0].message.content;
    } catch (error) {
      if (error.status) {
        throw new Error(
          `OpenAIError: ${error.status} - ${error.message || "Unknown error"}`
        );
      } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
        throw new Error(
          "OpenAIError: Network error – unable to reach OpenAI API"
        );
      } else {
        throw new Error(`OpenAIError: ${error.message}`);
      }
    }
  }

  async getModels() {
    try {
      const response = await this.client.models.list();
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch models: ${error.message}`);
    }
  }

  setModel(model) {
    this.defaultModel = model;
  }

  getAvailableModels() {
    return [
      "gpt-4-turbo",
      "gpt-4",
      "gpt-3.5-turbo",
      "gpt-3.5-turbo-16k",
      "gpt-4-32k",
      "gpt-4-1106-preview",
      "gpt-4-0125-preview",
      "gpt-3.5-turbo-1106",
      "gpt-3.5-turbo-0125",
    ];
  }
}

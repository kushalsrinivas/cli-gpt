import fs from "fs-extra";
import path from "path";
import os from "os";
import inquirer from "inquirer";
import chalk from "chalk";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

class Config {
  constructor() {
    this.configDir = path.join(os.homedir(), ".cliagent");
    this.configFile = path.join(this.configDir, "config.json");
    this.envFile = path.join(process.cwd(), ".env");
    this.config = this.loadConfig();
  }

  loadConfig() {
    // Priority: environment variables > local config file > default values
    const defaults = {
      llmProvider: "openrouter",
      openRouterApiKey: "your-openrouter-api-key-here",
      openAiApiKey: "your-openai-api-key-here",
      openAiOrg: "",
      defaultModel: "sarvamai/sarvam-m:free",
      maxTokens: 2000,
      temperature: 0.7,
      verbose: false,
      contextWindowSize: 4000,
      ragTopK: 3,
      ragRetrievalStrategy: "keyword",
      sessionsDir: path.join(os.homedir(), ".cliagent", "sessions"),
    };

    let fileConfig = {};

    // Try to load from config file
    try {
      if (fs.existsSync(this.configFile)) {
        fileConfig = fs.readJsonSync(this.configFile);
      }
    } catch (error) {
      console.warn(
        chalk.yellow("⚠️ Could not load config file, using defaults")
      );
    }

    // Merge with environment variables
    const envConfig = {
      llmProvider:
        process.env.LLM_PROVIDER ||
        fileConfig.llmProvider ||
        defaults.llmProvider,
      openRouterApiKey:
        process.env.OPENROUTER_API_KEY ||
        fileConfig.openRouterApiKey ||
        defaults.openRouterApiKey,
      openAiApiKey:
        process.env.OPENAI_API_KEY ||
        fileConfig.openAiApiKey ||
        defaults.openAiApiKey,
      openAiOrg:
        process.env.OPENAI_ORG || fileConfig.openAiOrg || defaults.openAiOrg,
      defaultModel:
        process.env.DEFAULT_MODEL ||
        fileConfig.defaultModel ||
        defaults.defaultModel,
      maxTokens:
        parseInt(process.env.MAX_TOKENS) ||
        fileConfig.maxTokens ||
        defaults.maxTokens,
      temperature:
        parseFloat(process.env.TEMPERATURE) ||
        fileConfig.temperature ||
        defaults.temperature,
      verbose:
        process.env.VERBOSE === "true" ||
        fileConfig.verbose ||
        defaults.verbose,
      contextWindowSize:
        parseInt(process.env.CONTEXT_WINDOW_SIZE) ||
        fileConfig.contextWindowSize ||
        defaults.contextWindowSize,
      ragTopK:
        parseInt(process.env.RAG_TOP_K) ||
        fileConfig.ragTopK ||
        defaults.ragTopK,
      ragRetrievalStrategy:
        process.env.RAG_STRATEGY ||
        fileConfig.ragRetrievalStrategy ||
        defaults.ragRetrievalStrategy,
      sessionsDir:
        process.env.SESSIONS_DIR ||
        fileConfig.sessionsDir ||
        defaults.sessionsDir,
    };

    return envConfig;
  }

  async setup() {
    console.log(chalk.blue("🔧 Setting up CLI Agent configuration..."));
    console.log(
      chalk.gray("Current configuration will be saved to:"),
      this.configFile
    );

    const questions = [
      {
        type: "list",
        name: "llmProvider",
        message: "Choose your AI provider:",
        choices: [
          {
            name: "OpenRouter (Multiple models via one API)",
            value: "openrouter",
          },
          { name: "OpenAI (Direct OpenAI API)", value: "openai" },
        ],
        default: this.config.llmProvider,
      },
    ];

    const providerAnswer = await inquirer.prompt(questions);
    const provider = providerAnswer.llmProvider;

    const apiKeyQuestions = [];

    if (provider === "openrouter") {
      apiKeyQuestions.push({
        type: "input",
        name: "openRouterApiKey",
        message: "Enter your OpenRouter API key:",
        default:
          this.config.openRouterApiKey !== "your-openrouter-api-key-here"
            ? this.config.openRouterApiKey
            : "",
        validate: (input) => {
          if (!input.trim()) {
            return "API key is required";
          }
          if (!input.startsWith("sk-or-")) {
            return 'OpenRouter API keys typically start with "sk-or-"';
          }
          return true;
        },
      });
    } else {
      apiKeyQuestions.push(
        {
          type: "input",
          name: "openAiApiKey",
          message: "Enter your OpenAI API key:",
          default:
            this.config.openAiApiKey !== "your-openai-api-key-here"
              ? this.config.openAiApiKey
              : "",
          validate: (input) => {
            if (!input.trim()) {
              return "API key is required";
            }
            if (!input.startsWith("sk-")) {
              return 'OpenAI API keys typically start with "sk-"';
            }
            return true;
          },
        },
        {
          type: "input",
          name: "openAiOrg",
          message: "Enter your OpenAI organization ID (optional):",
          default: this.config.openAiOrg,
        }
      );
    }

    const apiKeyAnswers = await inquirer.prompt(apiKeyQuestions);

    // Model selection based on provider
    let modelChoices = [];
    if (provider === "openai") {
      modelChoices = [
        { name: "GPT-4 Turbo (Recommended)", value: "gpt-4-turbo" },
        { name: "GPT-4", value: "gpt-4" },
        { name: "GPT-3.5 Turbo", value: "gpt-3.5-turbo" },
        { name: "GPT-3.5 Turbo 16K", value: "gpt-3.5-turbo-16k" },
        { name: "GPT-4 32K", value: "gpt-4-32k" },
        { name: "GPT-4 1106 Preview", value: "gpt-4-1106-preview" },
        { name: "GPT-4 0125 Preview", value: "gpt-4-0125-preview" },
        { name: "GPT-3.5 Turbo 1106", value: "gpt-3.5-turbo-1106" },
        { name: "GPT-3.5 Turbo 0125", value: "gpt-3.5-turbo-0125" },
      ];
    } else {
      modelChoices = [
        {
          name: "Sarvam-M (Free, Recommended)",
          value: "sarvamai/sarvam-m:free",
        },
        {
          name: "DeepSeek R1 (Free)",
          value: "deepseek/deepseek-r1-0528:free",
        },
        {
          name: "DeepSeek R1 Qwen3 8B (Free)",
          value: "deepseek/deepseek-r1-0528-qwen3-8b:free",
        },
        { name: "Claude 3.5 Sonnet", value: "anthropic/claude-3.5-sonnet" },
        { name: "Claude 3 Haiku", value: "anthropic/claude-3-haiku" },
        { name: "GPT-4 Turbo", value: "openai/gpt-4-turbo" },
        { name: "GPT-3.5 Turbo", value: "openai/gpt-3.5-turbo" },
        { name: "Llama 2 70B", value: "meta-llama/llama-2-70b-chat" },
        { name: "Mixtral 8x7B", value: "mistralai/mixtral-8x7b-instruct" },
      ];
    }

    const additionalQuestions = [
      {
        type: "list",
        name: "defaultModel",
        message: "Choose default AI model:",
        choices: modelChoices,
        default:
          provider === "openai" ? "gpt-3.5-turbo" : this.config.defaultModel,
      },
      {
        type: "number",
        name: "maxTokens",
        message: "Maximum tokens per response:",
        default: this.config.maxTokens,
        validate: (input) =>
          (input > 0 && input <= 8000) || "Must be between 1 and 8000",
      },
      {
        type: "number",
        name: "temperature",
        message: "Temperature (creativity, 0.0-2.0):",
        default: this.config.temperature,
        validate: (input) =>
          (input >= 0 && input <= 2) || "Must be between 0.0 and 2.0",
      },
      {
        type: "confirm",
        name: "verbose",
        message: "Enable verbose output by default?",
        default: this.config.verbose,
      },
      {
        type: "number",
        name: "contextWindowSize",
        message: "Context window size (number of lines to keep per session):",
        default: this.config.contextWindowSize,
        validate: (input) => input > 0 || "Must be a positive integer",
      },
      {
        type: "number",
        name: "ragTopK",
        message: "Top-K snippets to retrieve for RAG:",
        default: this.config.ragTopK,
        validate: (input) => input > 0 || "Must be a positive integer",
      },
      {
        type: "list",
        name: "ragRetrievalStrategy",
        message: "Retrieval strategy for RAG:",
        choices: ["keyword", "embedding"],
        default: this.config.ragRetrievalStrategy,
      },
    ];

    const answers = await inquirer.prompt(additionalQuestions);

    // Update config
    this.config = {
      ...this.config,
      llmProvider: provider,
      ...apiKeyAnswers,
      ...answers,
    };

    // Save to file
    await this.saveConfig();

    // Optionally create .env file
    const { createEnv } = await inquirer.prompt([
      {
        type: "confirm",
        name: "createEnv",
        message: "Create/update .env file in current directory?",
        default: false,
      },
    ]);

    if (createEnv) {
      await this.createEnvFile();
    }

    console.log(chalk.green("✅ Configuration saved successfully!"));
    console.log(
      chalk.gray("You can now use the CLI agent with your settings.")
    );
  }

  async saveConfig() {
    try {
      await fs.ensureDir(this.configDir);
      await fs.writeJson(this.configFile, this.config, { spaces: 2 });
    } catch (error) {
      throw new Error(`Failed to save config: ${error.message}`);
    }
  }

  async createEnvFile() {
    const envContent = `# CLI Agent Configuration
LLM_PROVIDER=${this.config.llmProvider}
OPENROUTER_API_KEY=${this.config.openRouterApiKey}
OPENAI_API_KEY=${this.config.openAiApiKey}
OPENAI_ORG=${this.config.openAiOrg}
DEFAULT_MODEL=${this.config.defaultModel}
MAX_TOKENS=${this.config.maxTokens}
TEMPERATURE=${this.config.temperature}
VERBOSE=${this.config.verbose}
CONTEXT_WINDOW_SIZE=${this.config.contextWindowSize}
RAG_TOP_K=${this.config.ragTopK}
RAG_STRATEGY=${this.config.ragRetrievalStrategy}
SESSIONS_DIR=${this.config.sessionsDir}
`;

    try {
      await fs.writeFile(this.envFile, envContent);
      console.log(chalk.green("✅ .env file created/updated"));
    } catch (error) {
      console.error(chalk.red("❌ Failed to create .env file:"), error.message);
    }
  }

  get llmProvider() {
    return this.config.llmProvider;
  }

  get openRouterApiKey() {
    return this.config.openRouterApiKey;
  }

  get openAiApiKey() {
    return this.config.openAiApiKey;
  }

  get openAiOrg() {
    return this.config.openAiOrg;
  }

  get defaultModel() {
    return this.config.defaultModel;
  }

  get maxTokens() {
    return this.config.maxTokens;
  }

  get temperature() {
    return this.config.temperature;
  }

  get verbose() {
    return this.config.verbose;
  }

  // New getters for session & RAG config
  get contextWindowSize() {
    return this.config.contextWindowSize;
  }

  get ragTopK() {
    return this.config.ragTopK;
  }

  get ragRetrievalStrategy() {
    return this.config.ragRetrievalStrategy;
  }

  get sessionsDir() {
    return this.config.sessionsDir;
  }

  // Check if this is the first time running and initialize if needed
  async checkAndInitialize() {
    const envExists = fs.existsSync(this.envFile);
    const configExists = fs.existsSync(this.configFile);
    const hasValidApiKey = this.hasValidApiKey();

    // If no config exists or API key is not set, run initialization
    if (!envExists && !configExists) {
      console.log(chalk.yellow("🎉 Welcome to CLI Agent!"));
      console.log(
        chalk.cyan(
          "It looks like this is your first time running the application."
        )
      );
      console.log(chalk.cyan("Let's set up your configuration...\n"));

      await this.runInitialSetup();
    } else if (!hasValidApiKey) {
      console.log(chalk.yellow("⚠️ API key not configured."));
      console.log(chalk.cyan("Let's set up your API key...\n"));

      await this.runInitialSetup();
    }
  }

  hasValidApiKey() {
    if (this.config.llmProvider === "openai") {
      return (
        this.config.openAiApiKey &&
        this.config.openAiApiKey !== "your-openai-api-key-here"
      );
    } else {
      return (
        this.config.openRouterApiKey &&
        this.config.openRouterApiKey !== "your-openrouter-api-key-here"
      );
    }
  }

  async runInitialSetup() {
    console.log(chalk.blue("🔧 Initial Setup - CLI Agent Configuration"));
    console.log(
      chalk.gray("This will create a .env file in your current directory.\n")
    );

    const providerQuestions = [
      {
        type: "list",
        name: "llmProvider",
        message: "Choose your AI provider:",
        choices: [
          {
            name: "OpenRouter (Multiple models via one API)",
            value: "openrouter",
          },
          { name: "OpenAI (Direct OpenAI API)", value: "openai" },
        ],
        default: "openrouter",
      },
    ];

    const providerAnswer = await inquirer.prompt(providerQuestions);
    const provider = providerAnswer.llmProvider;

    const apiKeyQuestions = [];

    if (provider === "openrouter") {
      apiKeyQuestions.push({
        type: "input",
        name: "openRouterApiKey",
        message: "Enter your OpenRouter API key:",
        validate: (input) => {
          if (!input.trim()) {
            return "API key is required";
          }
          if (!input.startsWith("sk-or-")) {
            return 'OpenRouter API keys typically start with "sk-or-"';
          }
          return true;
        },
      });
    } else {
      apiKeyQuestions.push(
        {
          type: "input",
          name: "openAiApiKey",
          message: "Enter your OpenAI API key:",
          validate: (input) => {
            if (!input.trim()) {
              return "API key is required";
            }
            if (!input.startsWith("sk-")) {
              return 'OpenAI API keys typically start with "sk-"';
            }
            return true;
          },
        },
        {
          type: "input",
          name: "openAiOrg",
          message: "Enter your OpenAI organization ID (optional):",
          default: "",
        }
      );
    }

    const apiKeyAnswers = await inquirer.prompt(apiKeyQuestions);

    // Model selection based on provider
    let modelChoices = [];
    if (provider === "openai") {
      modelChoices = [
        { name: "GPT-4 Turbo (Recommended)", value: "gpt-4-turbo" },
        { name: "GPT-4", value: "gpt-4" },
        { name: "GPT-3.5 Turbo", value: "gpt-3.5-turbo" },
        { name: "GPT-3.5 Turbo 16K", value: "gpt-3.5-turbo-16k" },
        { name: "GPT-4 32K", value: "gpt-4-32k" },
        { name: "GPT-4 1106 Preview", value: "gpt-4-1106-preview" },
        { name: "GPT-4 0125 Preview", value: "gpt-4-0125-preview" },
        { name: "GPT-3.5 Turbo 1106", value: "gpt-3.5-turbo-1106" },
        { name: "GPT-3.5 Turbo 0125", value: "gpt-3.5-turbo-0125" },
      ];
    } else {
      modelChoices = [
        {
          name: "Sarvam-M (Free, Recommended for beginners)",
          value: "sarvamai/sarvam-m:free",
        },
        {
          name: "DeepSeek R1 (Free, Good for coding)",
          value: "deepseek/deepseek-r1-0528:free",
        },
        {
          name: "DeepSeek R1 Qwen3 8B (Free, Fast)",
          value: "deepseek/deepseek-r1-0528-qwen3-8b:free",
        },
        {
          name: "Claude 3.5 Sonnet (Premium, Excellent)",
          value: "anthropic/claude-3.5-sonnet",
        },
        {
          name: "Claude 3 Haiku (Premium, Fast)",
          value: "anthropic/claude-3-haiku",
        },
        {
          name: "GPT-4 Turbo (Premium, Powerful)",
          value: "openai/gpt-4-turbo",
        },
        {
          name: "GPT-3.5 Turbo (Premium, Balanced)",
          value: "openai/gpt-3.5-turbo",
        },
        {
          name: "Llama 2 70B (Good for general tasks)",
          value: "meta-llama/llama-2-70b-chat",
        },
        {
          name: "Mixtral 8x7B (Good for coding)",
          value: "mistralai/mixtral-8x7b-instruct",
        },
      ];
    }

    const additionalQuestions = [
      {
        type: "list",
        name: "defaultModel",
        message: "Choose your preferred AI model:",
        choices: modelChoices,
        default:
          provider === "openai" ? "gpt-3.5-turbo" : "sarvamai/sarvam-m:free",
      },
      {
        type: "number",
        name: "maxTokens",
        message: "Maximum tokens per response (1-8000):",
        default: 2000,
        validate: (input) =>
          (input > 0 && input <= 8000) || "Must be between 1 and 8000",
      },
      {
        type: "number",
        name: "temperature",
        message:
          "Temperature - controls creativity (0.0-2.0, recommended: 0.7):",
        default: 0.7,
        validate: (input) =>
          (input >= 0 && input <= 2) || "Must be between 0.0 and 2.0",
      },
      {
        type: "confirm",
        name: "verbose",
        message: "Enable verbose output by default?",
        default: false,
      },
      {
        type: "number",
        name: "contextWindowSize",
        message: "Context window size (number of lines to keep per session):",
        default: 4000,
        validate: (input) => input > 0 || "Must be positive",
      },
      {
        type: "number",
        name: "ragTopK",
        message: "Top-K snippets to retrieve for RAG:",
        default: 3,
        validate: (input) => input > 0 || "Must be positive",
      },
      {
        type: "list",
        name: "ragRetrievalStrategy",
        message: "Retrieval strategy for RAG:",
        choices: ["keyword", "embedding"],
        default: "keyword",
      },
    ];

    const answers = await inquirer.prompt(additionalQuestions);

    // Update config
    this.config = {
      ...this.config,
      llmProvider: provider,
      ...apiKeyAnswers,
      ...answers,
    };

    // Always create .env file during initial setup
    await this.createEnvFile();

    // Also save to config file
    await this.saveConfig();

    console.log(chalk.green("\n✅ Configuration completed successfully!"));
    console.log(
      chalk.cyan(
        "💡 Tip: During interactive sessions, press Ctrl+M to change AI models"
      )
    );
    console.log(
      chalk.gray("You can reconfigure anytime by running: cliagent config\n")
    );
  }

  // Get available models for switching (delegated to provider)
  async getAvailableModels(provider = null) {
    const { createProvider } = await import("./providerFactory.js");
    const provInstance = createProvider(this.config);
    const models = provInstance.getAvailableModels();

    // Normalize to Inquirer choice objects
    return models.map((m) =>
      typeof m === "string" ? { name: m, value: m } : m
    );
  }

  // Switch provider temporarily (for current session)
  async switchProvider() {
    console.log(chalk.blue("\n🔄 Provider Switcher"));
    console.log(chalk.gray(`Current provider: ${this.config.llmProvider}`));

    const { newProvider } = await inquirer.prompt([
      {
        type: "list",
        name: "newProvider",
        message: "Choose a new AI provider:",
        choices: [
          {
            name: "OpenRouter (Multiple models via one API)",
            value: "openrouter",
          },
          { name: "OpenAI (Direct OpenAI API)", value: "openai" },
        ],
        default: this.config.llmProvider,
      },
    ]);

    if (newProvider !== this.config.llmProvider) {
      this.config.llmProvider = newProvider;

      // Ask for model selection based on the new provider
      let modelChoices = [];
      if (newProvider === "openai") {
        modelChoices = [
          { name: "GPT-4 Turbo (Recommended)", value: "gpt-4-turbo" },
          { name: "GPT-4", value: "gpt-4" },
          { name: "GPT-3.5 Turbo", value: "gpt-3.5-turbo" },
          { name: "GPT-3.5 Turbo 16K", value: "gpt-3.5-turbo-16k" },
          { name: "GPT-4 32K", value: "gpt-4-32k" },
          { name: "GPT-4 1106 Preview", value: "gpt-4-1106-preview" },
          { name: "GPT-4 0125 Preview", value: "gpt-4-0125-preview" },
          { name: "GPT-3.5 Turbo 1106", value: "gpt-3.5-turbo-1106" },
          { name: "GPT-3.5 Turbo 0125", value: "gpt-3.5-turbo-0125" },
        ];
      } else {
        modelChoices = [
          {
            name: "Sarvam-M (Free, Recommended)",
            value: "sarvamai/sarvam-m:free",
          },
          {
            name: "DeepSeek R1 (Free)",
            value: "deepseek/deepseek-r1-0528:free",
          },
          {
            name: "DeepSeek R1 Qwen3 8B (Free)",
            value: "deepseek/deepseek-r1-0528-qwen3-8b:free",
          },
          { name: "Claude 3.5 Sonnet", value: "anthropic/claude-3.5-sonnet" },
          { name: "Claude 3 Haiku", value: "anthropic/claude-3-haiku" },
          { name: "GPT-4 Turbo", value: "openai/gpt-4-turbo" },
          { name: "GPT-3.5 Turbo", value: "openai/gpt-3.5-turbo" },
          { name: "Llama 2 70B", value: "meta-llama/llama-2-70b-chat" },
          { name: "Mixtral 8x7B", value: "mistralai/mixtral-8x7b-instruct" },
        ];
      }

      const { selectedModel } = await inquirer.prompt([
        {
          type: "list",
          name: "selectedModel",
          message: `Choose a model for ${newProvider}:`,
          choices: modelChoices,
          default:
            newProvider === "openai"
              ? "gpt-3.5-turbo"
              : "sarvamai/sarvam-m:free",
        },
      ]);

      this.config.defaultModel = selectedModel;

      console.log(chalk.green(`✅ Provider switched to: ${newProvider}`));
      console.log(chalk.green(`✅ Model set to: ${selectedModel}`));
      console.log(
        chalk.gray("This change is temporary for this session only.")
      );
      console.log(chalk.gray("To make it permanent, run: cliagent config\n"));
      return true;
    } else {
      console.log(chalk.yellow("No change made.\n"));
      return false;
    }
  }

  // Switch model temporarily (for current session)
  async switchModel() {
    console.log(chalk.blue("\n🔄 Model Switcher"));
    console.log(chalk.gray(`Current provider: ${this.config.llmProvider}`));
    console.log(chalk.gray(`Current model: ${this.config.defaultModel}`));

    const availableModels = await this.getAvailableModels();
    const { newModel } = await inquirer.prompt([
      {
        type: "list",
        name: "newModel",
        message: "Choose a new AI model:",
        choices: availableModels,
        default: this.config.defaultModel,
      },
    ]);

    if (newModel !== this.config.defaultModel) {
      this.config.defaultModel = newModel;
      console.log(chalk.green(`✅ Model switched to: ${newModel}`));
      const { persist } = await inquirer.prompt([
        {
          type: "confirm",
          name: "persist",
          message: "Update .env with this model?",
          default: false,
        },
      ]);
      if (persist) {
        await this.updateEnvModel(newModel);
      } else {
        console.log(
          chalk.gray("This change is temporary for this session only.")
        );
      }
      return true;
    } else {
      console.log(chalk.yellow("No change made.\n"));
      return false;
    }
  }

  // Update .env file with new model
  async updateEnvModel(model) {
    try {
      let envContent = "";

      if (fs.existsSync(this.envFile)) {
        envContent = await fs.readFile(this.envFile, "utf8");
        // Replace existing DEFAULT_MODEL line or add it
        if (envContent.includes("DEFAULT_MODEL=")) {
          envContent = envContent.replace(
            /DEFAULT_MODEL=.*$/m,
            `DEFAULT_MODEL=${model}`
          );
        } else {
          envContent += `\nDEFAULT_MODEL=${model}`;
        }
      } else {
        // Create new .env file
        envContent = `# CLI Agent Configuration
LLM_PROVIDER=${this.config.llmProvider}
OPENROUTER_API_KEY=${this.config.openRouterApiKey}
OPENAI_API_KEY=${this.config.openAiApiKey}
OPENAI_ORG=${this.config.openAiOrg}
DEFAULT_MODEL=${model}
MAX_TOKENS=${this.config.maxTokens}
TEMPERATURE=${this.config.temperature}
VERBOSE=${this.config.verbose}
CONTEXT_WINDOW_SIZE=${this.config.contextWindowSize}
RAG_TOP_K=${this.config.ragTopK}
RAG_STRATEGY=${this.config.ragRetrievalStrategy}
SESSIONS_DIR=${this.config.sessionsDir}
`;
      }

      await fs.writeFile(this.envFile, envContent);
      this.config.defaultModel = model;
      console.log(chalk.green("✅ Model updated in .env file"));
    } catch (error) {
      console.error(chalk.red("❌ Failed to update .env file:"), error.message);
    }
  }

  // Update .env file with new provider and model
  async updateEnvProvider(provider, model) {
    try {
      let envContent = "";

      if (fs.existsSync(this.envFile)) {
        envContent = await fs.readFile(this.envFile, "utf8");

        // Replace existing LLM_PROVIDER line or add it
        if (envContent.includes("LLM_PROVIDER=")) {
          envContent = envContent.replace(
            /LLM_PROVIDER=.*$/m,
            `LLM_PROVIDER=${provider}`
          );
        } else {
          envContent += `\nLLM_PROVIDER=${provider}`;
        }

        // Replace existing DEFAULT_MODEL line or add it
        if (envContent.includes("DEFAULT_MODEL=")) {
          envContent = envContent.replace(
            /DEFAULT_MODEL=.*$/m,
            `DEFAULT_MODEL=${model}`
          );
        } else {
          envContent += `\nDEFAULT_MODEL=${model}`;
        }
      } else {
        // Create new .env file
        envContent = `# CLI Agent Configuration
LLM_PROVIDER=${provider}
OPENROUTER_API_KEY=${this.config.openRouterApiKey}
OPENAI_API_KEY=${this.config.openAiApiKey}
OPENAI_ORG=${this.config.openAiOrg}
DEFAULT_MODEL=${model}
MAX_TOKENS=${this.config.maxTokens}
TEMPERATURE=${this.config.temperature}
VERBOSE=${this.config.verbose}
CONTEXT_WINDOW_SIZE=${this.config.contextWindowSize}
RAG_TOP_K=${this.config.ragTopK}
RAG_STRATEGY=${this.config.ragRetrievalStrategy}
SESSIONS_DIR=${this.config.sessionsDir}
`;
      }

      await fs.writeFile(this.envFile, envContent);
      this.config.llmProvider = provider;
      this.config.defaultModel = model;
      console.log(chalk.green("✅ Provider and model updated in .env file"));
    } catch (error) {
      console.error(chalk.red("❌ Failed to update .env file:"), error.message);
    }
  }
}

export const config = new Config();

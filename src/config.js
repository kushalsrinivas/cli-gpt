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
      openRouterApiKey: "your-openrouter-api-key-here",
      defaultModel: "sarvamai/sarvam-m:free",
      maxTokens: 2000,
      temperature: 0.7,
      verbose: false,
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
      openRouterApiKey:
        process.env.OPENROUTER_API_KEY ||
        fileConfig.openRouterApiKey ||
        defaults.openRouterApiKey,
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
      },
      {
        type: "list",
        name: "defaultModel",
        message: "Choose default AI model:",
        choices: [
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
        ],
        default: this.config.defaultModel,
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
    ];

    const answers = await inquirer.prompt(questions);

    // Update config
    this.config = { ...this.config, ...answers };

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
OPENROUTER_API_KEY=${this.config.openRouterApiKey}
DEFAULT_MODEL=${this.config.defaultModel}
MAX_TOKENS=${this.config.maxTokens}
TEMPERATURE=${this.config.temperature}
VERBOSE=${this.config.verbose}
`;

    try {
      await fs.writeFile(this.envFile, envContent);
      console.log(chalk.green("✅ .env file created/updated"));
    } catch (error) {
      console.error(chalk.red("❌ Failed to create .env file:"), error.message);
    }
  }

  get openRouterApiKey() {
    return this.config.openRouterApiKey;
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
}

export const config = new Config();

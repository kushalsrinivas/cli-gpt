import { Agent } from "./agent.js";
import { config } from "./config.js";
import chalk from "chalk";

async function main() {
  console.log(chalk.blue("🤖 CLI Agent - Programmatic Mode"));

  // Example usage when imported as a module
  const agent = new Agent(config);

  // You can use the agent programmatically here
  console.log(chalk.gray("Agent initialized and ready for programmatic use."));
  console.log(chalk.gray("Use the CLI interface with: npm run cli <command>"));

  return agent;
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(chalk.red("❌ Error:"), error.message);
    process.exit(1);
  });
}

export { Agent } from "./agent.js";
export { config } from "./config.js";
export { OpenRouterClient } from "./openrouter.js";

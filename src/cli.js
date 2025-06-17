#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { Agent } from "./agent.js";
import { config } from "./config.js";

const program = new Command();

program
  .name("cliagent")
  .description(
    "CLI agentic tool for executing commands and managing files with AI"
  )
  .version("1.0.0");

program
  .command("run")
  .description("Run the agent with a specific task")
  .argument("<task>", "Task description for the agent")
  .option("-v, --verbose", "Enable verbose output")
  .option(
    "-j, --json",
    "Output structured JSON instead of human-readable format"
  )
  .action(async (task, options) => {
    try {
      if (!options.json) {
        console.log(chalk.blue("🤖 Starting CLI Agent..."));
        console.log(chalk.gray(`Task: ${task}`));
      }

      const agent = new Agent(config);
      const result = await agent.execute(task, options);

      if (!options.json) {
        console.log(chalk.green("✅ Task completed successfully!"));
      }

      return result;
    } catch (error) {
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              mode: "FATAL_ERROR",
              timestamp: new Date().toISOString(),
              error: {
                message: error.message,
                stack: options.verbose ? error.stack : undefined,
              },
            },
            null,
            2
          )
        );
      } else {
        console.error(chalk.red("❌ Error:"), error.message);
        if (options.verbose) {
          console.error(error.stack);
        }
      }
      process.exit(1);
    }
  });

program
  .command("interactive")
  .alias("i")
  .description("Start interactive mode")
  .action(async () => {
    try {
      console.log(chalk.blue("🤖 Starting Interactive CLI Agent..."));
      const agent = new Agent(config);
      await agent.startInteractive();
    } catch (error) {
      console.error(chalk.red("❌ Error:"), error.message);
      process.exit(1);
    }
  });

program
  .command("config")
  .description("Configure the agent settings")
  .action(async () => {
    try {
      console.log(chalk.blue("⚙️ Agent Configuration"));
      await config.setup();
    } catch (error) {
      console.error(chalk.red("❌ Error:"), error.message);
      process.exit(1);
    }
  });

program.parse();

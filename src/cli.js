#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { Agent } from "./agent.js";
import { CoordinatorAgent } from "./coordinatorAgent.js";
import { config } from "./config.js";
import { SessionManager } from "./sessionManager.js";
import fs from "fs-extra";
import path from "path";

const program = new Command();

program
  .name("cliagent")
  .description(
    "CLI agentic tool for executing commands and managing files with AI"
  )
  .version("2.0.0");

program
  .command("run")
  .description("Run the agent with a specific task")
  .argument("<task>", "Task description for the agent")
  .option("-v, --verbose", "Enable verbose output")
  .option(
    "-j, --json",
    "Output structured JSON instead of human-readable format"
  )
  .option(
    "-s, --session <id>",
    "Session ID to use (will be created if not exists)"
  )
  .option(
    "-p, --provider <openrouter|openai>",
    "AI provider to use (openrouter or openai)"
  )
  .action(async (task, options) => {
    try {
      // Check if initialization is needed
      await config.checkAndInitialize();

      // Override provider if specified
      if (options.provider) {
        config.config.llmProvider = options.provider;
      }

      const sessionId = options.session || null;

      if (!options.json) {
        console.log(chalk.blue("🤖 Starting CLI Agent..."));
        console.log(chalk.gray(`Task: ${task}`));
        console.log(chalk.gray(`Provider: ${config.config.llmProvider}`));
        if (sessionId) {
          console.log(chalk.gray(`Session: ${sessionId}`));
        }
      }

      const coordinator = new CoordinatorAgent(config, sessionId);
      const result = await coordinator.execute(task, options);

      if (
        result &&
        (result.mode === "ERROR" || result.mode === "FATAL_ERROR")
      ) {
        // Agent already printed the error details; just propagate exit code.
        process.exitCode = 1;
        return;
      }

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
      // Check if initialization is needed
      await config.checkAndInitialize();

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

// Default action when no command is specified - start interactive mode
program.action(async () => {
  try {
    // Check if initialization is needed
    await config.checkAndInitialize();

    console.log(chalk.blue("🤖 Starting Interactive CLI Agent..."));
    const agent = new Agent(config);
    await agent.startInteractive();
  } catch (error) {
    console.error(chalk.red("❌ Error:"), error.message);
    process.exit(1);
  }
});

// ----- Session Management Commands -----

program
  .command("new-session")
  .description("Create a brand new session and print its ID")
  .action(async () => {
    await config.checkAndInitialize();
    const sm = new SessionManager(config);
    const newId = sm.generateSessionId();
    await sm.ensureSessionDir(newId);
    console.log(chalk.green(`✨ New session created: ${newId}`));
  });

program
  .command("show-context")
  .description("Display the stored context window for a session")
  .argument("<id>", "Session ID")
  .action(async (id) => {
    await config.checkAndInitialize();
    const sm = new SessionManager(config);
    const entries = await sm.readEntries(id);
    if (!entries.length) {
      console.log(chalk.yellow("No context found for this session."));
      return;
    }
    console.log(chalk.blue(`📄 Context for session ${id}`));
    console.log(JSON.stringify(entries, null, 2));
  });

program
  .command("clear-context")
  .description("Clear the stored context for a session")
  .argument("<id>", "Session ID")
  .action(async (id) => {
    await config.checkAndInitialize();
    const sm = new SessionManager(config);
    await sm.clear(id);
    console.log(chalk.green(`🗑️  Cleared context for session ${id}`));
  });

program
  .command("resume-session")
  .description("Mark a session as active for subsequent runs")
  .argument("<id>", "Session ID")
  .action(async (id) => {
    await config.checkAndInitialize();
    const sm = new SessionManager(config);
    const dir = sm.getSessionDir(id);
    if (!(await fs.pathExists(dir))) {
      console.error(chalk.red("❌ Session does not exist:"), id);
      process.exit(1);
    }

    // Persist last-session reference inside config directory for convenience
    const marker = path.join(config.configDir, "last_session");
    await fs.writeFile(marker, id);
    console.log(
      chalk.green(`📌 Session ${id} set as default. Use --session to override.`)
    );
  });

// ----- Plan Management Commands -----

program
  .command("list-plans")
  .description("List all execution plans")
  .action(async () => {
    try {
      await config.checkAndInitialize();
      const coordinator = new CoordinatorAgent(config);
      const plans = await coordinator.listPlans();

      if (plans.length === 0) {
        console.log(chalk.yellow("No execution plans found."));
        return;
      }

      console.log(chalk.blue("📋 Execution Plans:"));
      plans.forEach((plan) => {
        const statusColor =
          plan.status === "COMPLETED"
            ? "green"
            : plan.status === "FAILED"
            ? "red"
            : "yellow";
        console.log(
          `${chalk[statusColor](plan.status)} ${plan.id.slice(0, 8)}... - ${
            plan.task
          }`
        );
        console.log(
          chalk.gray(`  Created: ${new Date(plan.created).toLocaleString()}`)
        );
        console.log(chalk.gray(`  Steps: ${plan.steps}`));
      });
    } catch (error) {
      console.error(chalk.red("❌ Error:"), error.message);
      process.exit(1);
    }
  });

program
  .command("resume-plan")
  .description("Resume execution of a specific plan")
  .argument("<id>", "Plan ID (full ID or first 8 characters)")
  .option("-v, --verbose", "Enable verbose output")
  .option("-j, --json", "Output structured JSON")
  .action(async (planId, options) => {
    try {
      await config.checkAndInitialize();
      const coordinator = new CoordinatorAgent(config);

      // If partial ID provided, find the full ID
      let fullPlanId = planId;
      if (planId.length === 8) {
        const plans = await coordinator.listPlans();
        const matchingPlan = plans.find((p) => p.id.startsWith(planId));
        if (!matchingPlan) {
          console.error(
            chalk.red("❌ No plan found with ID starting with:"),
            planId
          );
          process.exit(1);
        }
        fullPlanId = matchingPlan.id;
      }

      if (!options.json) {
        console.log(chalk.blue("🔄 Resuming plan execution..."));
        console.log(chalk.gray(`Plan ID: ${fullPlanId}`));
      }

      const result = await coordinator.resumePlan(fullPlanId, options);

      if (!options.json) {
        console.log(chalk.green("✅ Plan execution completed!"));
      }

      return result;
    } catch (error) {
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              mode: "FATAL_ERROR",
              timestamp: new Date().toISOString(),
              error: { message: error.message },
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
  .command("show-plan")
  .description("Display details of a specific plan")
  .argument("<id>", "Plan ID (full ID or first 8 characters)")
  .action(async (planId) => {
    try {
      await config.checkAndInitialize();
      const coordinator = new CoordinatorAgent(config);

      // If partial ID provided, find the full ID
      let fullPlanId = planId;
      if (planId.length === 8) {
        const plans = await coordinator.listPlans();
        const matchingPlan = plans.find((p) => p.id.startsWith(planId));
        if (!matchingPlan) {
          console.error(
            chalk.red("❌ No plan found with ID starting with:"),
            planId
          );
          process.exit(1);
        }
        fullPlanId = matchingPlan.id;
      }

      const plan = await coordinator.plannerAgent.loadPlan(fullPlanId);

      console.log(
        chalk.blue(`📋 Plan Details: ${plan.plan_id.slice(0, 8)}...`)
      );
      console.log(chalk.white(`Task: ${plan.original_task}`));
      console.log(
        chalk.gray(`Created: ${new Date(plan.created_at).toLocaleString()}`)
      );
      console.log(chalk.gray(`Strategy: ${plan.overall_strategy}`));
      console.log(chalk.gray(`Total Steps: ${plan.steps.length}`));

      console.log(chalk.blue("\n📝 Steps:"));
      plan.steps.forEach((step, index) => {
        const statusIcon =
          step.status === "COMPLETED"
            ? "✅"
            : step.status === "FAILED"
            ? "❌"
            : step.status === "SKIPPED"
            ? "⏭️"
            : "⏳";
        console.log(`${statusIcon} ${index + 1}. ${step.description}`);
        console.log(chalk.gray(`   Tool: ${step.tool}`));
        console.log(chalk.gray(`   Status: ${step.status}`));
        if (step.error) {
          console.log(chalk.red(`   Error: ${step.error}`));
        }
      });
    } catch (error) {
      console.error(chalk.red("❌ Error:"), error.message);
      process.exit(1);
    }
  });

program.parse();

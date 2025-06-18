import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import inquirer from "inquirer";
import readline from "readline";
import { OpenRouterClient } from "./openrouter.js";

const execAsync = promisify(exec);

export class Agent {
  constructor(config) {
    this.config = config;
    this.openRouter = new OpenRouterClient(config.openRouterApiKey);
    this.tools = {
      executeCommand: this.executeCommand.bind(this),
      createFile: this.createFile.bind(this),
      writeFile: this.writeFile.bind(this),
      readFile: this.readFile.bind(this),
      listDirectory: this.listDirectory.bind(this),
      searchFiles: this.searchFiles.bind(this),
      getSystemInfo: this.getSystemInfo.bind(this),
    };
    this.maxIterations = 10; // Prevent infinite loops
    this.currentIteration = 0;
  }

  async execute(task, options = {}) {
    this.currentIteration = 0;

    try {
      const result = await this.executeAgentLoop(task, options);
      return result;
    } catch (error) {
      const errorOutput = {
        mode: "ERROR",
        timestamp: new Date().toISOString(),
        error: {
          message: error.message,
          stack: options.verbose ? error.stack : undefined,
          iteration: this.currentIteration,
        },
      };

      if (options.json) {
        console.log(JSON.stringify(errorOutput, null, 2));
      } else {
        console.error(chalk.red("❌ Error:"), error.message);
        if (options.verbose && error.stack) {
          console.error(chalk.gray(error.stack));
        }
      }

      throw error;
    }
  }

  async executeAgentLoop(task, options = {}) {
    let context = {
      originalTask: task,
      history: [],
      observations: [],
      completed: false,
      finalOutput: null,
    };

    // START mode
    const startOutput = {
      mode: "START",
      timestamp: new Date().toISOString(),
      task: task,
      iteration: this.currentIteration,
    };

    this.outputResult(startOutput, options);

    while (!context.completed && this.currentIteration < this.maxIterations) {
      this.currentIteration++;

      try {
        // THINK mode
        const thinkResult = await this.thinkPhase(context, options);
        this.outputResult(thinkResult, options);

        // Check if thinking concluded we're done
        if (thinkResult.conclusion === "COMPLETE") {
          context.completed = true;
          context.finalOutput = thinkResult.output;
          break;
        }

        // ACTION mode (if action is needed)
        if (thinkResult.nextAction) {
          const actionResult = await this.actionPhase(
            thinkResult.nextAction,
            options
          );
          this.outputResult(actionResult, options);

          // OBSERVE mode
          const observeResult = await this.observePhase(
            actionResult,
            context,
            options
          );
          this.outputResult(observeResult, options);

          // Update context with observations
          context.observations.push(observeResult.observation);
          context.history.push({
            iteration: this.currentIteration,
            action: actionResult,
            observation: observeResult.observation,
          });

          // Check if observation indicates completion
          if (observeResult.status === "COMPLETE") {
            context.completed = true;
            context.finalOutput = observeResult.finalOutput;
          }
        }
      } catch (error) {
        // Handle errors gracefully and continue or exit based on error type
        const errorResult = {
          mode: "ERROR",
          timestamp: new Date().toISOString(),
          iteration: this.currentIteration,
          error: {
            message: error.message,
            recoverable: this.isRecoverableError(error),
            context: "Agent loop execution",
          },
        };

        this.outputResult(errorResult, options);

        if (!this.isRecoverableError(error)) {
          throw error;
        }

        // Add error to context and continue
        context.observations.push({
          type: "error",
          message: error.message,
          recoverable: true,
        });
      }
    }

    // OUTPUT mode
    const outputResult = {
      mode: "OUTPUT",
      timestamp: new Date().toISOString(),
      completed: context.completed,
      iterations: this.currentIteration,
      finalOutput: context.finalOutput || "Task execution completed",
      summary: this.generateSummary(context),
    };

    this.outputResult(outputResult, options);
    return outputResult;
  }

  async thinkPhase(context, options) {
    const thinkingPrompt = this.buildThinkingPrompt(context);

    try {
      const aiResponse = await this.openRouter.chat([
        {
          role: "system",
          content: this.getSystemPrompt(),
        },
        {
          role: "user",
          content: thinkingPrompt,
        },
      ]);

      // Parse AI response for structured thinking
      const thinking = this.parseThinkingResponse(aiResponse);

      return {
        mode: "THINK",
        timestamp: new Date().toISOString(),
        iteration: this.currentIteration,
        thinking: {
          analysis: thinking.analysis,
          considerations: thinking.considerations,
          plan: thinking.plan,
          confidence: thinking.confidence,
        },
        conclusion: thinking.conclusion,
        nextAction: thinking.nextAction,
        output: thinking.output,
      };
    } catch (error) {
      throw new Error(`Thinking phase failed: ${error.message}`);
    }
  }

  async actionPhase(actionSpec, options) {
    try {
      const { tool, parameters } = actionSpec;

      if (!this.tools[tool]) {
        throw new Error(`Unknown tool: ${tool}`);
      }

      const startTime = Date.now();
      const result = await this.tools[tool](...Object.values(parameters));
      const duration = Date.now() - startTime;

      return {
        mode: "ACTION",
        timestamp: new Date().toISOString(),
        iteration: this.currentIteration,
        action: {
          tool: tool,
          parameters: parameters,
          duration: `${duration}ms`,
        },
        result: result,
        success: result && result.success !== false,
      };
    } catch (error) {
      return {
        mode: "ACTION",
        timestamp: new Date().toISOString(),
        iteration: this.currentIteration,
        action: actionSpec,
        result: null,
        success: false,
        error: {
          message: error.message,
          type: error.constructor.name,
        },
      };
    }
  }

  async observePhase(actionResult, context, options) {
    // Analyze the action result and determine next steps
    const observation = {
      actionSuccess: actionResult.success,
      actionTool: actionResult.action.tool,
      result: actionResult.result,
      timestamp: actionResult.timestamp,
    };

    // Determine if we should continue or complete
    const shouldContinue = this.shouldContinueExecution(actionResult, context);

    return {
      mode: "OBSERVE",
      timestamp: new Date().toISOString(),
      iteration: this.currentIteration,
      observation: observation,
      status: shouldContinue ? "CONTINUE" : "COMPLETE",
      finalOutput: shouldContinue
        ? null
        : this.extractFinalOutput(actionResult, context),
    };
  }

  buildThinkingPrompt(context) {
    return `
TASK: ${context.originalTask}

CONTEXT:
- Current iteration: ${this.currentIteration}
- Previous observations: ${JSON.stringify(context.observations, null, 2)}
- History: ${JSON.stringify(context.history, null, 2)}

Please think through this task step by step. You must provide your response in the following JSON format:

{
  "analysis": "Your analysis of the current situation",
  "considerations": ["consideration 1", "consideration 2", "consideration 3"],
  "plan": "Your plan for the next step",
  "confidence": "high|medium|low",
  "conclusion": "CONTINUE|COMPLETE",
  "nextAction": {
    "tool": "toolName",
    "parameters": {"param1": "value1"}
  },
  "output": "Final output if conclusion is COMPLETE"
}

Think through this at least 3-4 times to make sure everything is clear.

Available tools: ${Object.keys(this.tools).join(", ")}
`;
  }

  parseThinkingResponse(response) {
    try {
      // Try to extract JSON from the response using a more robust approach
      const jsonMatch = this.extractJSON(response);
      if (jsonMatch) {
        return JSON.parse(jsonMatch);
      }

      // Fallback: create structured response from text
      return {
        analysis: response,
        considerations: ["AI provided unstructured response"],
        plan: "Continue with best effort interpretation",
        confidence: "low",
        conclusion: "CONTINUE",
        nextAction: null,
        output: null,
      };
    } catch (error) {
      throw new Error(`Failed to parse AI thinking response: ${error.message}`);
    }
  }

  extractJSON(text) {
    // Find the first opening brace
    const startIndex = text.indexOf("{");
    if (startIndex === -1) return null;

    let braceCount = 0;
    let inString = false;
    let escapeNext = false;

    // Parse character by character to find the matching closing brace
    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === "{") {
          braceCount++;
        } else if (char === "}") {
          braceCount--;
          if (braceCount === 0) {
            // Found the matching closing brace
            return text.substring(startIndex, i + 1);
          }
        }
      }
    }

    return null; // No matching closing brace found
  }

  shouldContinueExecution(actionResult, context) {
    // Simple heuristics to determine if we should continue
    if (!actionResult.success) {
      return context.observations.length < 3; // Try a few times on failure
    }

    // Check if the action result indicates completion
    if (
      actionResult.action.tool === "listDirectory" &&
      actionResult.result.success
    ) {
      return false; // Directory listing is usually a final action
    }

    if (
      actionResult.action.tool === "readFile" &&
      actionResult.result.success
    ) {
      return false; // File reading is usually a final action
    }

    return this.currentIteration < 3; // Continue for a few iterations by default
  }

  extractFinalOutput(actionResult, context) {
    if (actionResult.result && actionResult.result.success) {
      return actionResult.result;
    }

    return {
      message: "Task completed",
      iterations: this.currentIteration,
      lastAction: actionResult.action.tool,
    };
  }

  generateSummary(context) {
    return {
      totalIterations: this.currentIteration,
      actionsPerformed: context.history.length,
      successfulActions: context.history.filter(
        (h) => h.observation.actionSuccess
      ).length,
      finalStatus: context.completed ? "completed" : "incomplete",
    };
  }

  isRecoverableError(error) {
    const recoverableErrors = [
      "ENOENT", // File not found
      "EACCES", // Permission denied
      "ETIMEDOUT", // Timeout
      "Command failed", // Command execution failure
    ];

    return recoverableErrors.some((err) => error.message.includes(err));
  }

  outputResult(result, options) {
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      this.formatHumanOutput(result);
    }
  }

  formatHumanOutput(result) {
    const timestamp = new Date(result.timestamp).toLocaleTimeString();

    switch (result.mode) {
      case "START":
        console.log(chalk.blue(`🚀 [${timestamp}] STARTING TASK`));
        console.log(chalk.gray(`Task: ${result.task}`));
        break;

      case "THINK":
        console.log(
          chalk.yellow(
            `🤔 [${timestamp}] THINKING (Iteration ${result.iteration})`
          )
        );
        console.log(chalk.gray(`Analysis: ${result.thinking.analysis}`));
        console.log(chalk.gray(`Plan: ${result.thinking.plan}`));
        console.log(chalk.gray(`Confidence: ${result.thinking.confidence}`));
        break;

      case "ACTION":
        console.log(
          chalk.cyan(`⚡ [${timestamp}] ACTION (Iteration ${result.iteration})`)
        );
        console.log(chalk.gray(`Tool: ${result.action.tool}`));
        console.log(
          chalk.gray(`Parameters: ${JSON.stringify(result.action.parameters)}`)
        );
        console.log(
          result.success ? chalk.green("✅ Success") : chalk.red("❌ Failed")
        );
        break;

      case "OBSERVE":
        console.log(
          chalk.magenta(
            `👁️  [${timestamp}] OBSERVE (Iteration ${result.iteration})`
          )
        );
        console.log(chalk.gray(`Status: ${result.status}`));
        if (result.observation.result) {
          console.log(chalk.gray("Result:"), result.observation.result);
        }
        break;

      case "OUTPUT":
        console.log(chalk.green(`🎯 [${timestamp}] FINAL OUTPUT`));
        console.log(chalk.white("Result:"), result.finalOutput);
        console.log(chalk.gray(`Completed in ${result.iterations} iterations`));
        break;

      case "ERROR":
        console.log(chalk.red(`💥 [${timestamp}] ERROR`));
        console.log(chalk.red(result.error.message));
        break;
    }
  }

  async startInteractive() {
    console.log(chalk.green("🚀 Interactive mode started."));
    console.log(chalk.cyan("💡 Tips:"));
    console.log(chalk.gray("  • Type your requests naturally"));
    console.log(
      chalk.gray("  • Type '/switch' or '/model' to change AI models")
    );
    console.log(chalk.gray("  • Type '/help' for more commands"));
    console.log(chalk.gray("  • Press Ctrl+C to quit"));
    console.log(chalk.gray(`  • Current model: ${this.config.defaultModel}\n`));

    // Handle Ctrl+C gracefully
    process.on("SIGINT", () => {
      console.log(chalk.yellow("\n👋 Goodbye!"));
      process.exit(0);
    });

    while (true) {
      try {
        const { task } = await inquirer.prompt([
          {
            type: "input",
            name: "task",
            message: chalk.blue("What would you like me to do?"),
            validate: (input) => {
              if (input.trim() === "") {
                return "Please enter a task";
              }
              return true;
            },
          },
        ]);

        // Check for special commands
        const trimmedTask = task.trim().toLowerCase();

        if (trimmedTask === "/switch" || trimmedTask === "/model") {
          await this.handleModelSwitch();
          continue;
        }

        if (trimmedTask === "/help") {
          this.showInteractiveHelp();
          continue;
        }

        if (trimmedTask === "/status") {
          this.showStatus();
          continue;
        }

        if (trimmedTask === "/quit" || trimmedTask === "/exit") {
          console.log(chalk.yellow("👋 Goodbye!"));
          process.exit(0);
        }

        // Execute the task
        console.log(chalk.gray(`Using model: ${this.config.defaultModel}`));
        await this.execute(task, { verbose: false, json: false });
      } catch (error) {
        // Handle inquirer cancellation (Ctrl+C during prompt)
        if (error.name === "ExitPromptError" || error.isTtyError) {
          console.log(chalk.yellow("\n👋 Goodbye!"));
          process.exit(0);
        }
        console.error(chalk.red("❌ Error:"), error.message);
      }

      console.log(""); // Add spacing between tasks
    }
  }

  async handleModelSwitch() {
    try {
      const switched = await this.config.switchModel();
      if (switched) {
        // Update the OpenRouter client with the new model
        this.openRouter.setModel(this.config.defaultModel);

        // Ask if user wants to make this change permanent
        const { makePermanent } = await inquirer.prompt([
          {
            type: "confirm",
            name: "makePermanent",
            message: "Make this model change permanent in .env file?",
            default: false,
          },
        ]);

        if (makePermanent) {
          await this.config.updateEnvModel(this.config.defaultModel);
        }
      }
    } catch (error) {
      console.error(chalk.red("❌ Error switching model:"), error.message);
    }
  }

  showInteractiveHelp() {
    console.log(chalk.blue("\n📖 Interactive Mode Help"));
    console.log(chalk.white("Available Commands:"));
    console.log(chalk.gray("  /help     - Show this help message"));
    console.log(chalk.gray("  /switch   - Switch AI model"));
    console.log(chalk.gray("  /model    - Switch AI model (alias)"));
    console.log(chalk.gray("  /status   - Show current configuration"));
    console.log(chalk.gray("  /quit     - Exit the application"));
    console.log(chalk.gray("  /exit     - Exit the application"));
    console.log(chalk.gray("  Ctrl+C    - Exit"));
    console.log(chalk.white("\nExample Tasks:"));
    console.log(chalk.gray("  • 'list files in current directory'"));
    console.log(chalk.gray("  • 'create a new file called hello.txt'"));
    console.log(chalk.gray("  • 'show me system information'"));
    console.log(chalk.gray("  • 'find all .js files in src folder'\n"));
  }

  showStatus() {
    console.log(chalk.blue("\n📊 Current Status"));
    console.log(chalk.white("Configuration:"));
    console.log(chalk.gray(`  Model: ${this.config.defaultModel}`));
    console.log(chalk.gray(`  Max Tokens: ${this.config.maxTokens}`));
    console.log(chalk.gray(`  Temperature: ${this.config.temperature}`));
    console.log(chalk.gray(`  Verbose: ${this.config.verbose}`));
    console.log(chalk.gray(`  Working Directory: ${process.cwd()}`));
    console.log(chalk.gray(`  Platform: ${process.platform}\n`));
  }

  getSystemPrompt() {
    return `You are an advanced CLI agent with structured thinking capabilities. You operate in a loop with these modes:

1. START: Receive user task
2. THINK: Analyze and plan (you are here)
3. ACTION: Execute tools
4. OBSERVE: Analyze results
5. OUTPUT: Provide final result

Available Tools:
- executeCommand(command): Execute shell commands
- createFile(filePath, content): Create a new file
- writeFile(filePath, content): Write/overwrite file content
- readFile(filePath): Read file content
- listDirectory(dirPath): List directory contents
- searchFiles(pattern, directory): Search for files matching pattern
- getSystemInfo(): Get system information

CRITICAL: Always respond with valid JSON in the exact format requested. Think through the task 3-4 times before deciding on actions.

Current working directory: ${process.cwd()}
Operating System: ${process.platform}
Max iterations: ${this.maxIterations}

Be thorough in your thinking, consider edge cases, and provide clear reasoning for your decisions.`;
  }

  // Enhanced tool implementations with better error handling
  async executeCommand(command) {
    if (!command || typeof command !== "string") {
      throw new Error("Invalid command: must be a non-empty string");
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        timeout: 30000, // 30 second timeout
      });

      return {
        success: true,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        command: command,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        command: command,
        exitCode: error.code,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async createFile(filePath, content = "") {
    try {
      if (!filePath) {
        throw new Error("File path is required");
      }

      const resolvedPath = path.resolve(filePath);
      const dirPath = path.dirname(resolvedPath);

      await fs.ensureDir(dirPath);

      if (await fs.pathExists(resolvedPath)) {
        return {
          success: false,
          error: `File already exists: ${filePath}`,
          path: resolvedPath,
        };
      }

      await fs.writeFile(resolvedPath, content, "utf8");

      return {
        success: true,
        path: resolvedPath,
        size: Buffer.byteLength(content, "utf8"),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: filePath,
      };
    }
  }

  async writeFile(filePath, content) {
    try {
      if (!filePath) {
        throw new Error("File path is required");
      }

      const resolvedPath = path.resolve(filePath);
      const dirPath = path.dirname(resolvedPath);

      await fs.ensureDir(dirPath);
      await fs.writeFile(resolvedPath, content || "", "utf8");

      return {
        success: true,
        path: resolvedPath,
        size: Buffer.byteLength(content || "", "utf8"),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: filePath,
      };
    }
  }

  async readFile(filePath) {
    try {
      if (!filePath) {
        throw new Error("File path is required");
      }

      const resolvedPath = path.resolve(filePath);

      if (!(await fs.pathExists(resolvedPath))) {
        return {
          success: false,
          error: `File not found: ${filePath}`,
          path: resolvedPath,
        };
      }

      const content = await fs.readFile(resolvedPath, "utf8");
      const stats = await fs.stat(resolvedPath);

      return {
        success: true,
        content: content,
        path: resolvedPath,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: filePath,
      };
    }
  }

  async listDirectory(dirPath = ".") {
    try {
      const resolvedPath = path.resolve(dirPath);

      if (!(await fs.pathExists(resolvedPath))) {
        return {
          success: false,
          error: `Directory not found: ${dirPath}`,
          path: resolvedPath,
        };
      }

      const stats = await fs.stat(resolvedPath);
      if (!stats.isDirectory()) {
        return {
          success: false,
          error: `Path is not a directory: ${dirPath}`,
          path: resolvedPath,
        };
      }

      const items = await fs.readdir(resolvedPath);
      const detailedItems = await Promise.all(
        items.map(async (item) => {
          try {
            const itemPath = path.join(resolvedPath, item);
            const itemStats = await fs.stat(itemPath);
            return {
              name: item,
              type: itemStats.isDirectory() ? "directory" : "file",
              size: itemStats.size,
              modified: itemStats.mtime.toISOString(),
            };
          } catch (error) {
            return {
              name: item,
              type: "unknown",
              error: error.message,
            };
          }
        })
      );

      return {
        success: true,
        path: resolvedPath,
        items: detailedItems,
        count: detailedItems.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: dirPath,
      };
    }
  }

  async searchFiles(pattern, directory = ".") {
    try {
      const resolvedDir = path.resolve(directory);
      const result = await this.executeCommand(
        `find "${resolvedDir}" -name "${pattern}" -type f`
      );

      if (result.success) {
        const files = result.stdout.split("\n").filter((f) => f.trim());
        return {
          success: true,
          pattern: pattern,
          directory: resolvedDir,
          files: files,
          count: files.length,
          timestamp: new Date().toISOString(),
        };
      } else {
        return result;
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        pattern: pattern,
        directory: directory,
      };
    }
  }

  async getSystemInfo() {
    try {
      const info = {
        platform: process.platform,
        architecture: process.arch,
        nodeVersion: process.version,
        cwd: process.cwd(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString(),
      };

      return {
        success: true,
        info: info,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

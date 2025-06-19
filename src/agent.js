import chalk from "chalk";
import inquirer from "inquirer";
import { getProvider } from "./providerFactory.js";
import { SessionManager } from "./sessionManager.js";
import { Retriever } from "./retriever.js";
import * as tools from "./tools/index.js";

export class Agent {
  constructor(config, sessionId = null) {
    this.config = config;
    this.llm = getProvider(config);

    // Session & RAG setup
    this.sessionManager = new SessionManager(config);
    this.sessionId = sessionId || this.sessionManager.generateSessionId();
    this.retriever = new Retriever(config, this.sessionManager);

    this.tools = tools;
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

      return errorOutput;
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

    await this.outputResult(startOutput, options);

    while (!context.completed && this.currentIteration < this.maxIterations) {
      this.currentIteration++;

      try {
        // THINK mode
        const thinkResult = await this.thinkPhase(context, options);
        await this.outputResult(thinkResult, options);

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
          await this.outputResult(actionResult, options);

          // OBSERVE mode
          const observeResult = await this.observePhase(
            actionResult,
            context,
            options
          );
          await this.outputResult(observeResult, options);

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

        await this.outputResult(errorResult, options);

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
      curated: await this.curateOutput(
        context.finalOutput || "Task execution completed"
      ),
    };

    await this.outputResult(outputResult, options);
    return outputResult;
  }

  async thinkPhase(context, options) {
    // Retrieve relevant context snippets for RAG
    const ragSnippets = await this.retriever.retrieve(
      this.sessionId,
      context.originalTask
    );

    const thinkingPrompt = this.buildThinkingPrompt(context, ragSnippets);

    try {
      const aiResponse = await this.llm.chat([
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

      // Get the actual tool function
      const toolFunction = this.getToolFunction(tool);
      if (!toolFunction) {
        throw new Error(`Unknown tool: ${tool}`);
      }

      if (parameters && typeof parameters !== "object") {
        throw new Error("Tool parameters must be provided as an object");
      }

      const startTime = Date.now();
      const result = await toolFunction(parameters || {});
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

  buildThinkingPrompt(context, ragSnippets = []) {
    // Get available tool names - handle both direct exports and tools object
    const availableTools = this.getAvailableToolNames();

    return `
TASK: ${context.originalTask}

CONTEXT:
- Current iteration: ${this.currentIteration}
- Previous observations: ${JSON.stringify(context.observations, null, 2)}
- History: ${JSON.stringify(context.history, null, 2)}

RAG_SNIPPETS:
${JSON.stringify(ragSnippets, null, 2)}

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

Available tools: ${availableTools.join(", ")}
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
      "OpenAIError", // OpenAI API errors
      "RateLimitError", // Rate limit errors
    ];

    return recoverableErrors.some((err) => error.message.includes(err));
  }

  async outputResult(result, options = {}) {
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      this.formatHumanOutput(result);
    }

    // Persist to session context synchronously to avoid race conditions
    if (this.sessionManager && this.sessionId) {
      try {
        await this.sessionManager.appendEntry(this.sessionId, result);
      } catch {
        /* silently ignore persistence errors */
      }
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
        if (result.curated) {
          console.log(chalk.blue("\n📝 Curated Summary:"));
          console.log(result.curated);
        }
        break;

      case "ERROR":
        console.log(chalk.red(`💥 [${timestamp}] ERROR`));
        console.log(chalk.red(result.error.message));
        break;

      case "EXECUTE_STEP":
        if (result.status === "STARTING") {
          console.log(
            chalk.cyan(`⚡ [${timestamp}] EXECUTING STEP ${result.step.id}`)
          );
          console.log(chalk.gray(`${result.step.description}`));
          console.log(chalk.gray(`Tool: ${result.step.tool}`));
          console.log(
            chalk.gray(
              `Attempt: ${result.step.attempt}/${result.step.maxAttempts}`
            )
          );
        } else if (result.status === "COMPLETED") {
          console.log(
            chalk.green(`✅ [${timestamp}] STEP ${result.step.id} COMPLETED`)
          );
          console.log(chalk.gray(`${result.step.description}`));
        } else if (result.status === "FAILED") {
          console.log(
            chalk.red(`❌ [${timestamp}] STEP ${result.step.id} FAILED`)
          );
          console.log(chalk.gray(`${result.step.description}`));
          console.log(chalk.red(`Error: ${result.error}`));
        } else if (result.status === "RETRYING") {
          console.log(
            chalk.yellow(`🔄 [${timestamp}] RETRYING STEP ${result.step.id}`)
          );
          console.log(
            chalk.gray(
              `Attempt ${result.nextAttempt}/${result.step.maxAttempts}`
            )
          );
        }
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

        if (trimmedTask === "/provider") {
          await this.handleProviderSwitch();
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
        // Dynamically import CoordinatorAgent to avoid circular dependency
        const { CoordinatorAgent } = await import("./coordinatorAgent.js");
        const coordinator = new CoordinatorAgent(this.config, this.sessionId);
        await coordinator.execute(task, { verbose: false, json: false });
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

  async handleProviderSwitch() {
    try {
      const switched = await this.config.switchProvider();
      if (switched) {
        // Recreate the LLM client with the new provider
        this.llm = getProvider(this.config);

        // Ask if user wants to make this change permanent
        const { makePermanent } = await inquirer.prompt([
          {
            type: "confirm",
            name: "makePermanent",
            message: "Make this provider change permanent in .env file?",
            default: false,
          },
        ]);

        if (makePermanent) {
          await this.config.updateEnvProvider(
            this.config.llmProvider,
            this.config.defaultModel
          );
        }
      }
    } catch (error) {
      console.error(chalk.red("❌ Error switching provider:"), error.message);
    }
  }

  async handleModelSwitch() {
    try {
      const switched = await this.config.switchModel();
      if (switched) {
        // Update the LLM client with the new model
        this.llm.setModel(this.config.defaultModel);

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
    console.log(chalk.gray("  /provider - Switch AI provider"));
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
    console.log(chalk.gray(`  Provider: ${this.config.llmProvider}`));
    console.log(chalk.gray(`  Model: ${this.config.defaultModel}`));
    console.log(chalk.gray(`  Max Tokens: ${this.config.maxTokens}`));
    console.log(chalk.gray(`  Temperature: ${this.config.temperature}`));
    console.log(chalk.gray(`  Verbose: ${this.config.verbose}`));
    console.log(chalk.gray(`  Working Directory: ${process.cwd()}`));
    console.log(chalk.gray(`  Platform: ${process.platform}\n`));
  }

  getAvailableToolNames() {
    // Handle the case where tools are exported both as individual functions
    // and as a tools object with metadata
    const toolNames = [];

    // Check if we have the tools object with metadata
    if (this.tools.tools && typeof this.tools.tools === "object") {
      toolNames.push(...Object.keys(this.tools.tools));
    } else {
      // Fallback: get all exported function names, excluding the 'tools' object itself
      const allKeys = Object.keys(this.tools);
      toolNames.push(
        ...allKeys.filter(
          (key) =>
            key !== "tools" &&
            key !== "default" &&
            typeof this.tools[key] === "function"
        )
      );
    }

    return toolNames;
  }

  getToolFunction(toolName) {
    // First check if we have the tools object with metadata
    if (this.tools.tools && this.tools.tools[toolName]) {
      return this.tools.tools[toolName].fn;
    }

    // Fallback: check if it's directly exported as a function
    if (typeof this.tools[toolName] === "function") {
      return this.tools[toolName];
    }

    return null;
  }

  getSystemPrompt() {
    // Get available tool names and descriptions
    const availableTools = this.getAvailableToolNames();
    const toolList = availableTools.map((t) => `- ${t}`).join("\n");

    return `You are an advanced CLI agent with structured thinking capabilities. You operate in a loop with these modes:

1. START: Receive user task
2. THINK: Analyze and plan (you are here)
3. ACTION: Execute tools
4. OBSERVE: Analyze results
5. OUTPUT: Provide final result

Available Tools:\n${toolList}

CRITICAL DECISION RULES:
- Use "conclusion": "CONTINUE" when you need to execute a tool to complete the task
- Use "conclusion": "COMPLETE" ONLY when the task is already fully completed without needing any tools
- If you identify a tool that should be executed, always use "conclusion": "CONTINUE"
- Planning to use a tool is NOT the same as completing the task - you must actually execute it

CRITICAL: Always respond with valid JSON in the exact format requested. Think through the task 3-4 times before deciding on actions.

Current working directory: ${process.cwd()}
Operating System: ${process.platform}
Max iterations: ${this.maxIterations}

Be thorough in your thinking, consider edge cases, and provide clear reasoning for your decisions.`;
  }

  async curateOutput(output) {
    try {
      const prompt = `You are an assistant tasked with creating a concise, well-structured summary of the following raw task output. Focus on what was achieved, highlight any key results, and suggest clear next steps if appropriate. Keep it short (3-6 sentences) and easy to read.\n\nRAW OUTPUT:\n${
        typeof output === "string" ? output : JSON.stringify(output, null, 2)
      }\n\nCURATED SUMMARY:`;

      const response = await this.llm.chat([
        {
          role: "system",
          content:
            "You produce neat, human-friendly summaries for CLI outputs. Use markdown bullets where helpful.",
        },
        { role: "user", content: prompt },
      ]);

      return (response || "").trim();
    } catch (err) {
      // Fail gracefully – don't block the main flow
      return `Could not generate curated summary: ${err.message}`;
    }
  }
}

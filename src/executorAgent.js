import { Agent } from "./agent.js";
import inquirer from "inquirer";
import chalk from "chalk";

export class ExecutorAgent extends Agent {
  constructor(config, sessionId = null) {
    super(config, sessionId);
  }

  async executeStep(step, plan, options = {}) {
    const stepOutput = {
      mode: "EXECUTE_STEP",
      timestamp: new Date().toISOString(),
      step: {
        id: step.id,
        description: step.description,
        tool: step.tool,
        attempt: step.attempts + 1,
        maxAttempts: step.max_attempts,
      },
      status: "STARTING",
    };

    await this.outputResult(stepOutput, options);

    try {
      // Update step status and attempt count
      step.status = "EXECUTING";
      step.attempts += 1;
      step.started_at = new Date().toISOString();

      // Execute the step using the existing agent loop but with step-specific context
      const stepContext = {
        originalTask: step.description,
        stepId: step.id,
        stepTool: step.tool,
        stepParameters: step.parameters,
        successCriteria: step.success_criteria,
        history: [],
        observations: [],
        completed: false,
        finalOutput: null,
      };

      const result = await this.executeStepLoop(stepContext, step, options);

      if (result.success) {
        step.status = "COMPLETED";
        step.completed_at = new Date().toISOString();
        step.result = result.output;

        const successOutput = {
          mode: "EXECUTE_STEP",
          timestamp: new Date().toISOString(),
          step: {
            id: step.id,
            description: step.description,
            attempt: step.attempts,
          },
          status: "COMPLETED",
          result: result.output,
        };

        await this.outputResult(successOutput, options);
        return { success: true, step, result: result.output };
      } else {
        step.status = "FAILED";
        step.error = result.error;
        step.failed_at = new Date().toISOString();

        const failureOutput = {
          mode: "EXECUTE_STEP",
          timestamp: new Date().toISOString(),
          step: {
            id: step.id,
            description: step.description,
            attempt: step.attempts,
          },
          status: "FAILED",
          error: result.error,
        };

        await this.outputResult(failureOutput, options);

        // Handle failure according to step's error handling strategy
        return await this.handleStepFailure(step, plan, result.error, options);
      }
    } catch (error) {
      step.status = "FAILED";
      step.error = error.message;
      step.failed_at = new Date().toISOString();

      const errorOutput = {
        mode: "EXECUTE_STEP",
        timestamp: new Date().toISOString(),
        step: {
          id: step.id,
          description: step.description,
          attempt: step.attempts,
        },
        status: "ERROR",
        error: error.message,
      };

      await this.outputResult(errorOutput, options);
      return await this.handleStepFailure(step, plan, error.message, options);
    }
  }

  async executeStepLoop(context, step, options) {
    let iterations = 0;
    const maxIterations = 5; // Limit iterations per step

    while (!context.completed && iterations < maxIterations) {
      iterations++;

      try {
        // THINK phase - analyze the specific step
        const thinkResult = await this.thinkAboutStep(context, step, options);

        if (thinkResult.conclusion === "COMPLETE") {
          context.completed = true;
          context.finalOutput = thinkResult.output;
          return { success: true, output: thinkResult.output };
        }

        // ACTION phase - execute the step's specified tool
        if (thinkResult.nextAction || step.tool) {
          const actionSpec = thinkResult.nextAction || {
            tool: step.tool,
            parameters: step.parameters,
          };

          const actionResult = await this.actionPhase(actionSpec, options);

          // OBSERVE phase - check if step succeeded
          const observeResult = await this.observeStepResult(
            actionResult,
            context,
            step,
            options
          );

          context.observations.push(observeResult.observation);
          context.history.push({
            iteration: iterations,
            action: actionResult,
            observation: observeResult.observation,
          });

          if (observeResult.status === "COMPLETE") {
            context.completed = true;
            context.finalOutput = observeResult.finalOutput;
            return { success: true, output: observeResult.finalOutput };
          }

          if (observeResult.status === "FAILED") {
            return { success: false, error: observeResult.error };
          }
        }
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    return {
      success: false,
      error: `Step execution exceeded maximum iterations (${maxIterations})`,
    };
  }

  async thinkAboutStep(context, step, options) {
    const stepThinkingPrompt = `
STEP EXECUTION TASK: ${step.description}

STEP DETAILS:
- ID: ${step.id}
- Tool: ${step.tool}
- Parameters: ${JSON.stringify(step.parameters, null, 2)}
- Success Criteria: ${step.success_criteria}
- Attempt: ${step.attempts}/${step.max_attempts}

CONTEXT:
- Current iteration: ${context.history.length + 1}
- Previous observations: ${JSON.stringify(context.observations, null, 2)}
- History: ${JSON.stringify(context.history, null, 2)}

Analyze this specific step and determine how to execute it successfully.

Respond with JSON in this exact format:
{
  "analysis": "Your analysis of this specific step",
  "considerations": ["consideration 1", "consideration 2"],
  "plan": "Your plan for executing this step",
  "confidence": "high|medium|low",
  "conclusion": "CONTINUE|COMPLETE",
  "nextAction": {
    "tool": "toolName",
    "parameters": {"param1": "value1"}
  },
  "output": "Final output if conclusion is COMPLETE"
}

Focus specifically on this step's requirements and success criteria.
`;

    try {
      const response = await this.llm.chat([
        {
          role: "system",
          content: this.getStepExecutionSystemPrompt(),
        },
        {
          role: "user",
          content: stepThinkingPrompt,
        },
      ]);

      return this.parseThinkingResponse(response);
    } catch (error) {
      throw new Error(`Step thinking failed: ${error.message}`);
    }
  }

  async observeStepResult(actionResult, context, step, options) {
    const observationPrompt = `
STEP RESULT ANALYSIS:

STEP: ${step.description}
SUCCESS CRITERIA: ${step.success_criteria}

ACTION TAKEN:
- Tool: ${actionResult.action.tool}
- Parameters: ${JSON.stringify(actionResult.action.parameters, null, 2)}
- Success: ${actionResult.success}
- Result: ${JSON.stringify(actionResult.result, null, 2)}

Analyze if this step has been completed successfully based on the success criteria.

Respond with JSON in this exact format:
{
  "analysis": "Analysis of the action result",
  "criteriaCheck": "Does the result meet the success criteria?",
  "status": "COMPLETE|CONTINUE|FAILED",
  "confidence": "high|medium|low",
  "observation": "What was observed from this action",
  "finalOutput": "Output if step is complete",
  "error": "Error description if failed",
  "nextSteps": "What should happen next if continuing"
}
`;

    try {
      const response = await this.llm.chat([
        {
          role: "system",
          content:
            "You are an expert at analyzing action results and determining success based on criteria.",
        },
        {
          role: "user",
          content: observationPrompt,
        },
      ]);

      const observation = this.parseObservationResponse(response);

      const observeOutput = {
        mode: "OBSERVE",
        timestamp: new Date().toISOString(),
        step: {
          id: step.id,
          description: step.description,
        },
        status: observation.status,
        observation: observation.observation,
        criteriaCheck: observation.criteriaCheck,
      };

      await this.outputResult(observeOutput, options);
      return observation;
    } catch (error) {
      return {
        status: "FAILED",
        error: `Observation failed: ${error.message}`,
        observation: "Failed to analyze step result",
      };
    }
  }

  parseObservationResponse(response) {
    try {
      const jsonMatch = this.extractJSON(response);
      if (jsonMatch) {
        return JSON.parse(jsonMatch);
      }

      return {
        analysis: response,
        criteriaCheck: "Unable to parse response",
        status: "CONTINUE",
        confidence: "low",
        observation: "AI provided unstructured response",
        finalOutput: null,
        error: null,
        nextSteps: "Continue with best effort",
      };
    } catch (error) {
      throw new Error(`Failed to parse observation response: ${error.message}`);
    }
  }

  async handleStepFailure(step, plan, error, options) {
    // Check if we should retry
    if (step.attempts < step.max_attempts) {
      const retryOutput = {
        mode: "EXECUTE_STEP",
        timestamp: new Date().toISOString(),
        step: {
          id: step.id,
          description: step.description,
          attempt: step.attempts,
        },
        status: "RETRYING",
        error: error,
        nextAttempt: step.attempts + 1,
      };

      await this.outputResult(retryOutput, options);

      // Reset step status for retry
      step.status = "PENDING";
      return { success: false, retry: true, step, error };
    }

    // Max attempts reached, prompt user for intervention
    if (!options.json && !options.nonInteractive) {
      console.log(
        chalk.red(
          `\n❌ Step ${step.id} failed after ${step.attempts} attempts:`
        )
      );
      console.log(chalk.gray(`Description: ${step.description}`));
      console.log(chalk.gray(`Error: ${error}`));
      console.log(
        chalk.gray(`Error handling strategy: ${step.error_handling}`)
      );

      const choices = [
        { name: "Retry this step", value: "retry" },
        { name: "Skip this step and continue", value: "skip" },
        { name: "Modify step and retry", value: "modify" },
        { name: "Abort entire plan", value: "abort" },
      ];

      const { action } = await inquirer.prompt([
        {
          type: "list",
          name: "action",
          message: "How would you like to handle this failure?",
          choices: choices,
        },
      ]);

      switch (action) {
        case "retry":
          step.status = "PENDING";
          step.attempts = 0; // Reset attempts
          return { success: false, retry: true, step, error };

        case "skip":
          step.status = "SKIPPED";
          step.skipped_at = new Date().toISOString();
          step.skip_reason = "User chose to skip after failure";
          return { success: true, skipped: true, step };

        case "modify":
          const modifiedStep = await this.promptStepModification(step);
          return { success: false, retry: true, step: modifiedStep, error };

        case "abort":
          return { success: false, abort: true, step, error };
      }
    }

    // Non-interactive mode or JSON output - just fail
    return { success: false, step, error };
  }

  async promptStepModification(step) {
    console.log(chalk.blue("\n🔧 Modify Step:"));

    const { newDescription } = await inquirer.prompt([
      {
        type: "input",
        name: "newDescription",
        message: "New step description:",
        default: step.description,
      },
    ]);

    const { newTool } = await inquirer.prompt([
      {
        type: "list",
        name: "newTool",
        message: "Select tool:",
        choices: Object.keys(this.tools),
        default: step.tool,
      },
    ]);

    const { newParametersJson } = await inquirer.prompt([
      {
        type: "input",
        name: "newParametersJson",
        message: "Parameters (JSON):",
        default: JSON.stringify(step.parameters, null, 2),
        validate: (input) => {
          try {
            JSON.parse(input);
            return true;
          } catch {
            return "Please enter valid JSON";
          }
        },
      },
    ]);

    step.description = newDescription;
    step.tool = newTool;
    step.parameters = JSON.parse(newParametersJson);
    step.status = "PENDING";
    step.attempts = 0;
    step.modified_at = new Date().toISOString();

    return step;
  }

  getStepExecutionSystemPrompt() {
    return `You are an expert step executor. Your job is to analyze and execute individual steps from a larger plan.

Key principles:
1. Focus on the specific step requirements and success criteria
2. Use the designated tool and parameters when specified
3. Be thorough but efficient in execution
4. Clearly indicate when a step is complete vs needs continuation
5. Provide clear reasoning for your decisions

Available tools: ${Object.keys(this.tools).join(", ")}

Always respond with valid JSON in the exact format requested.`;
  }
}

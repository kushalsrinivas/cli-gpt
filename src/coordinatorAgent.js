import { Agent } from "./agent.js";
import { PlannerAgent } from "./plannerAgent.js";
import chalk from "chalk";
import inquirer from "inquirer";

export class CoordinatorAgent {
  constructor(config, sessionId = null) {
    this.config = config;
    this.sessionId = sessionId;

    // Create specialized agents
    this.plannerAgent = new PlannerAgent(config, sessionId);
    this.fallbackAgent = new Agent(config, sessionId); // For simple tasks
  }

  async execute(task, options = {}) {
    try {
      // Step 1: Detect if this is a multi-step task
      const analysis = await this.plannerAgent.detectMultiStepTask(task);

      const detectionOutput = {
        mode: "ANALYZE",
        timestamp: new Date().toISOString(),
        task: task,
        analysis: {
          isMultiStep: analysis.isMultiStep,
          reasoning: analysis.reasoning,
          complexity: analysis.complexity,
          estimatedSteps: analysis.estimatedSteps,
        },
      };

      await this.outputResult(detectionOutput, options);

      // Step 2: Route to appropriate execution path
      if (analysis.isMultiStep) {
        return await this.executeMultiStepTask(task, analysis, options);
      } else {
        return await this.executeSingleStepTask(task, options);
      }
    } catch (error) {
      const errorOutput = {
        mode: "ERROR",
        timestamp: new Date().toISOString(),
        error: {
          message: error.message,
          stack: options.verbose ? error.stack : undefined,
        },
      };

      await this.outputResult(errorOutput, options);
      throw error;
    }
  }

  async executeMultiStepTask(task, analysis, options = {}) {
    try {
      // Step 1: Create execution plan
      const plan = await this.plannerAgent.createExecutionPlan(task, options);

      // Step 2: Execute plan step by step
      const executionResult = await this.executePlan(plan, options);

      // Step 3: Generate final output
      const finalOutput = {
        mode: "OUTPUT",
        timestamp: new Date().toISOString(),
        task: task,
        plan: {
          id: plan.plan_id,
          totalSteps: plan.steps.length,
          completedSteps: plan.steps.filter((s) => s.status === "COMPLETED")
            .length,
          skippedSteps: plan.steps.filter((s) => s.status === "SKIPPED").length,
          failedSteps: plan.steps.filter((s) => s.status === "FAILED").length,
        },
        result: executionResult,
        summary: this.generateExecutionSummary(plan, executionResult),
      };

      await this.outputResult(finalOutput, options);
      return finalOutput;
    } catch (error) {
      throw new Error(`Multi-step execution failed: ${error.message}`);
    }
  }

  async executeSingleStepTask(task, options = {}) {
    const singleStepOutput = {
      mode: "SINGLE_STEP",
      timestamp: new Date().toISOString(),
      task: task,
      status: "EXECUTING",
    };

    await this.outputResult(singleStepOutput, options);

    // Use the original agent for simple tasks
    return await this.fallbackAgent.execute(task, options);
  }

  async executePlan(plan, options = {}) {
    const executionStartOutput = {
      mode: "EXECUTE_PLAN",
      timestamp: new Date().toISOString(),
      plan: {
        id: plan.plan_id,
        totalSteps: plan.steps.length,
        strategy: plan.overall_strategy,
      },
      status: "STARTING",
    };

    await this.outputResult(executionStartOutput, options);

    let currentStepIndex = 0;
    const results = [];
    let aborted = false;

    // Find the first pending step (for resume functionality)
    const firstPendingIndex = plan.steps.findIndex(
      (s) => s.status === "PENDING"
    );
    if (firstPendingIndex !== -1) {
      currentStepIndex = firstPendingIndex;
    }

    while (currentStepIndex < plan.steps.length && !aborted) {
      const step = plan.steps[currentStepIndex];

      // Skip already completed or skipped steps
      if (step.status === "COMPLETED" || step.status === "SKIPPED") {
        currentStepIndex++;
        continue;
      }

      const stepProgressOutput = {
        mode: "EXECUTE_PLAN",
        timestamp: new Date().toISOString(),
        plan: {
          id: plan.plan_id,
          currentStep: currentStepIndex + 1,
          totalSteps: plan.steps.length,
        },
        status: "STEP_PROGRESS",
        step: {
          id: step.id,
          description: step.description,
        },
      };

      await this.outputResult(stepProgressOutput, options);

      try {
        // Execute the current step
        const stepResult = await this.executeStep(step, options);
        results.push(stepResult);

        // Save updated plan after each step
        await this.plannerAgent.savePlan(plan);

        if (stepResult.success || stepResult.skipped) {
          // Step succeeded or was skipped, continue to next step
          currentStepIndex++;
        } else if (stepResult.retry) {
          // Step should be retried, stay on current step
          continue;
        } else if (stepResult.abort) {
          // User chose to abort
          aborted = true;
          break;
        } else {
          // Step failed and can't be retried
          const failureDecision = await this.handlePlanFailure(
            plan,
            step,
            stepResult,
            options
          );

          if (failureDecision.abort) {
            aborted = true;
            break;
          } else if (failureDecision.skip) {
            step.status = "SKIPPED";
            step.skip_reason = "Failed and user chose to skip";
            currentStepIndex++;
          } else if (failureDecision.continue) {
            currentStepIndex++;
          }
        }
      } catch (error) {
        const stepError = {
          step: step,
          error: error.message,
          success: false,
        };
        results.push(stepError);

        const errorDecision = await this.handleStepError(
          plan,
          step,
          error,
          options
        );

        if (errorDecision.abort) {
          aborted = true;
          break;
        } else if (errorDecision.skip) {
          step.status = "FAILED";
          step.error = error.message;
          currentStepIndex++;
        }
      }
    }

    // Final plan status
    const executionCompleteOutput = {
      mode: "EXECUTE_PLAN",
      timestamp: new Date().toISOString(),
      plan: {
        id: plan.plan_id,
        status: aborted ? "ABORTED" : "COMPLETED",
      },
      status: aborted ? "ABORTED" : "COMPLETED",
      results: {
        totalSteps: plan.steps.length,
        completedSteps: plan.steps.filter((s) => s.status === "COMPLETED")
          .length,
        skippedSteps: plan.steps.filter((s) => s.status === "SKIPPED").length,
        failedSteps: plan.steps.filter((s) => s.status === "FAILED").length,
      },
    };

    await this.outputResult(executionCompleteOutput, options);

    return {
      success:
        !aborted &&
        plan.steps.filter((s) => s.status === "FAILED").length === 0,
      aborted: aborted,
      results: results,
      plan: plan,
    };
  }

  async handlePlanFailure(plan, failedStep, stepResult, options) {
    if (options.json || options.nonInteractive) {
      return { abort: true };
    }

    console.log(chalk.red(`\n❌ Plan execution encountered a failure:`));
    console.log(chalk.gray(`Step ${failedStep.id}: ${failedStep.description}`));
    console.log(chalk.gray(`Error: ${stepResult.error}`));

    const choices = [
      { name: "Skip this step and continue with plan", value: "skip" },
      { name: "Continue with plan (mark step as failed)", value: "continue" },
      { name: "Abort entire plan", value: "abort" },
    ];

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "How would you like to handle this plan failure?",
        choices: choices,
      },
    ]);

    return { [action]: true };
  }

  async handleStepError(plan, step, error, options) {
    if (options.json || options.nonInteractive) {
      return { abort: true };
    }

    console.log(chalk.red(`\n💥 Unexpected error during step execution:`));
    console.log(chalk.gray(`Step ${step.id}: ${step.description}`));
    console.log(chalk.gray(`Error: ${error.message}`));

    const choices = [
      { name: "Skip this step and continue", value: "skip" },
      { name: "Abort entire plan", value: "abort" },
    ];

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "How would you like to handle this error?",
        choices: choices,
      },
    ]);

    return { [action]: true };
  }

  generateExecutionSummary(plan, executionResult) {
    const completed = plan.steps.filter((s) => s.status === "COMPLETED");
    const skipped = plan.steps.filter((s) => s.status === "SKIPPED");
    const failed = plan.steps.filter((s) => s.status === "FAILED");

    return {
      totalSteps: plan.steps.length,
      completed: completed.length,
      skipped: skipped.length,
      failed: failed.length,
      successRate:
        (
          ((completed.length + skipped.length) / plan.steps.length) *
          100
        ).toFixed(1) + "%",
      executionTime: this.calculateExecutionTime(plan),
      status: executionResult.aborted
        ? "ABORTED"
        : failed.length > 0
        ? "COMPLETED_WITH_FAILURES"
        : "COMPLETED_SUCCESSFULLY",
    };
  }

  calculateExecutionTime(plan) {
    const startTimes = plan.steps
      .filter((s) => s.started_at)
      .map((s) => new Date(s.started_at).getTime());

    const endTimes = plan.steps
      .filter((s) => s.completed_at || s.failed_at)
      .map((s) => new Date(s.completed_at || s.failed_at).getTime());

    if (startTimes.length === 0 || endTimes.length === 0) {
      return "unknown";
    }

    const startTime = Math.min(...startTimes);
    const endTime = Math.max(...endTimes);
    const durationMs = endTime - startTime;

    return `${(durationMs / 1000).toFixed(1)}s`;
  }

  async outputResult(result, options = {}) {
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      this.formatHumanOutput(result);
    }
  }

  formatHumanOutput(result) {
    const timestamp = new Date(result.timestamp).toLocaleTimeString();

    switch (result.mode) {
      case "ANALYZE":
        console.log(chalk.blue(`🔍 [${timestamp}] ANALYZING TASK`));
        if (result.analysis.isMultiStep) {
          console.log(chalk.green(`✅ Multi-step task detected`));
          console.log(chalk.gray(`Complexity: ${result.analysis.complexity}`));
          console.log(
            chalk.gray(`Estimated steps: ${result.analysis.estimatedSteps}`)
          );
          console.log(chalk.gray(`Reasoning: ${result.analysis.reasoning}`));
        } else {
          console.log(chalk.yellow(`➡️  Single-step task detected`));
          console.log(chalk.gray(`Reasoning: ${result.analysis.reasoning}`));
        }
        break;

      case "SINGLE_STEP":
        console.log(chalk.cyan(`⚡ [${timestamp}] SINGLE STEP EXECUTION`));
        console.log(chalk.gray(`Task: ${result.task}`));
        break;

      case "EXECUTE_PLAN":
        if (result.status === "STARTING") {
          console.log(chalk.blue(`🚀 [${timestamp}] STARTING PLAN EXECUTION`));
          console.log(chalk.gray(`Plan ID: ${result.plan.id}`));
          console.log(chalk.gray(`Total steps: ${result.plan.totalSteps}`));
          console.log(chalk.gray(`Strategy: ${result.plan.strategy}`));
        } else if (result.status === "STEP_PROGRESS") {
          console.log(
            chalk.cyan(
              `📋 [${timestamp}] STEP ${result.plan.currentStep}/${result.plan.totalSteps}`
            )
          );
          console.log(chalk.gray(`${result.step.description}`));
        } else if (
          result.status === "COMPLETED" ||
          result.status === "ABORTED"
        ) {
          const statusIcon = result.status === "COMPLETED" ? "✅" : "⛔";
          console.log(
            chalk.green(`${statusIcon} [${timestamp}] PLAN ${result.status}`)
          );
          console.log(
            chalk.gray(
              `Completed: ${result.results.completedSteps}/${result.results.totalSteps}`
            )
          );
          console.log(chalk.gray(`Skipped: ${result.results.skippedSteps}`));
          console.log(chalk.gray(`Failed: ${result.results.failedSteps}`));
        }
        break;

      case "OUTPUT":
        console.log(chalk.green(`🎯 [${timestamp}] COORDINATION COMPLETE`));
        console.log(chalk.white("Task:"), result.task);
        if (result.plan) {
          console.log(chalk.blue("\n📊 Execution Summary:"));
          console.log(
            chalk.gray(`Success Rate: ${result.summary.successRate}`)
          );
          console.log(
            chalk.gray(`Execution Time: ${result.summary.executionTime}`)
          );
          console.log(chalk.gray(`Status: ${result.summary.status}`));
        }
        break;

      case "ERROR":
        console.log(chalk.red(`❌ [${timestamp}] COORDINATION ERROR`));
        console.log(chalk.red(result.error.message));
        break;

      default:
        // For modes handled by sub-agents (PLAN, EXECUTE_STEP, etc.)
        // Let them handle their own formatting
        if (result.mode === "PLAN") {
          if (result.status === "CREATING") {
            console.log(
              chalk.yellow(`📝 [${timestamp}] CREATING EXECUTION PLAN`)
            );
          } else if (result.status === "CREATED") {
            console.log(chalk.green(`✅ [${timestamp}] PLAN CREATED`));
            console.log(chalk.gray(`Plan ID: ${result.plan.id}`));
            console.log(chalk.gray(`Steps: ${result.plan.steps}`));
            console.log(chalk.gray(`Strategy: ${result.plan.strategy}`));
          } else if (result.status === "FAILED") {
            console.log(chalk.red(`❌ [${timestamp}] PLAN CREATION FAILED`));
            console.log(chalk.red(result.error));
          }
        }
        break;
    }
  }

  // Utility methods for plan management
  async resumePlan(planId, options = {}) {
    try {
      const plan = await this.plannerAgent.loadPlan(planId);

      const resumeOutput = {
        mode: "RESUME",
        timestamp: new Date().toISOString(),
        plan: {
          id: plan.plan_id,
          originalTask: plan.original_task,
          totalSteps: plan.steps.length,
          pendingSteps: plan.steps.filter((s) => s.status === "PENDING").length,
        },
      };

      await this.outputResult(resumeOutput, options);
      return await this.executePlan(plan, options);
    } catch (error) {
      throw new Error(`Failed to resume plan ${planId}: ${error.message}`);
    }
  }

  async listPlans() {
    return await this.plannerAgent.listPlans();
  }

  /**
   * Determines if a BasicAgent output indicates successful completion.
   * @param {object} output - The BasicAgent execute() return object
   */
  isStepSuccess(output) {
    return output && output.completed === true && !output.error;
  }

  /**
   * Execute a single plan step using a fresh BasicAgent instance.
   * Handles attempt counting, retry logic up to max_attempts and returns
   * a stepResult object compatible with previous ExecutorAgent.executeStep.
   * This method purposefully does NOT mutate the currentStepIndex – the caller
   * (executePlan) should decide whether to advance to the next step based on
   * the returned flags (success, retry, abort, skipped).
   */
  async executeStep(step, options = {}) {
    // Increment attempt and mark step as executing
    step.status = "EXECUTING";
    step.attempts = (step.attempts || 0) + 1;
    step.started_at = step.started_at || new Date().toISOString();

    // Emit STARTING status
    await this.outputResult(
      {
        mode: "EXECUTE_PLAN",
        timestamp: new Date().toISOString(),
        status: "STEP_STARTING",
        step: {
          id: step.id,
          description: step.description,
          attempt: step.attempts,
          maxAttempts: step.max_attempts,
        },
      },
      options
    );

    // Build task string for BasicAgent
    const taskStr = `Execute plan step #${step.id}: ${
      step.description
    }\nParameters: ${JSON.stringify(step.parameters || {}, null, 2)}`;

    // Execute using fresh BasicAgent
    const basic = new Agent(this.config, this.sessionId);
    const basicOutput = await basic.execute(taskStr, options);

    // Analyze success
    if (this.isStepSuccess(basicOutput)) {
      step.status = "COMPLETED";
      step.completed_at = new Date().toISOString();
      step.result = basicOutput;

      await this.outputResult(
        {
          mode: "EXECUTE_PLAN",
          timestamp: new Date().toISOString(),
          status: "STEP_COMPLETED",
          step: { id: step.id, description: step.description },
        },
        options
      );

      return { success: true, step, result: basicOutput };
    }

    // Failure path
    step.error = basicOutput.error || "Step did not complete successfully";

    if (step.attempts < step.max_attempts) {
      // Prepare for retry
      await this.outputResult(
        {
          mode: "EXECUTE_PLAN",
          timestamp: new Date().toISOString(),
          status: "STEP_RETRYING",
          step: {
            id: step.id,
            description: step.description,
            attempt: step.attempts,
            nextAttempt: step.attempts + 1,
          },
          error: step.error,
        },
        options
      );

      // Reset status to pending so executePlan will retry same step
      step.status = "PENDING";
      return { success: false, retry: true, step, error: step.error };
    }

    // Exceeded max attempts – mark as failed
    step.status = "FAILED";
    step.failed_at = new Date().toISOString();

    await this.outputResult(
      {
        mode: "EXECUTE_PLAN",
        timestamp: new Date().toISOString(),
        status: "STEP_FAILED",
        step: {
          id: step.id,
          description: step.description,
          attempt: step.attempts,
        },
        error: step.error,
      },
      options
    );

    return { success: false, step, error: step.error };
  }
}

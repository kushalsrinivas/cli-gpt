import { Agent } from "./agent.js";
import fs from "fs-extra";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export class PlannerAgent extends Agent {
  constructor(config, sessionId = null) {
    super(config, sessionId);
    this.planDir = path.join(process.cwd(), ".cliagent", "plans");
  }

  async ensurePlanDir() {
    await fs.ensureDir(this.planDir);
  }

  async detectMultiStepTask(task) {
    const detectionPrompt = `
Analyze this task to determine if it requires multiple sequential steps:

TASK: "${task}"

Consider these indicators of multi-step tasks:
- Multiple actions connected by words like "then", "after", "and then", "next", "followed by"
- Tasks involving file operations followed by network operations
- Tasks requiring creation, modification, and distribution of content
- Tasks with clear dependencies (A must happen before B)
- Tasks involving multiple tools or services

Respond with JSON in this exact format:
{
  "isMultiStep": true/false,
  "reasoning": "explanation of why this is or isn't multi-step",
  "complexity": "low|medium|high",
  "estimatedSteps": number
}
`;

    try {
      const response = await this.llm.chat([
        {
          role: "system",
          content:
            "You are an expert task analyzer. Respond only with valid JSON.",
        },
        {
          role: "user",
          content: detectionPrompt,
        },
      ]);

      const analysis = this.extractJSON(response);
      return analysis
        ? JSON.parse(analysis)
        : {
            isMultiStep: false,
            reasoning: "Failed to analyze",
            complexity: "low",
            estimatedSteps: 1,
          };
    } catch (error) {
      console.warn(
        "Failed to detect multi-step nature, defaulting to single-step:",
        error.message
      );
      return {
        isMultiStep: false,
        reasoning: "Analysis failed",
        complexity: "low",
        estimatedSteps: 1,
      };
    }
  }

  async createExecutionPlan(task, options = {}) {
    await this.ensurePlanDir();

    const planningPrompt = `
Break down this complex task into a detailed sequential execution plan:

TASK: "${task}"

Create a detailed plan with clear, actionable steps. Each step should:
- Be specific and executable
- Have clear success criteria
- Include the tool/method needed
- Consider error handling
- Build upon previous steps

Available tools: ${Object.keys(this.tools).join(", ")}

Respond with JSON in this exact format:
{
  "plan_id": "generate a UUID",
  "original_task": "${task}",
  "created_at": "ISO timestamp",
  "estimated_duration": "time estimate",
  "steps": [
    {
      "id": 1,
      "description": "Clear description of what to do",
      "tool": "toolName",
      "parameters": {"param": "value"},
      "success_criteria": "How to know this step succeeded",
      "error_handling": "What to do if this step fails",
      "status": "PENDING",
      "dependencies": [],
      "estimated_time": "time estimate"
    }
  ],
  "overall_strategy": "High-level approach explanation",
  "risk_assessment": "Potential issues and mitigation strategies"
}

Think through this carefully and create a comprehensive plan.
`;

    try {
      const planOutput = {
        mode: "PLAN",
        timestamp: new Date().toISOString(),
        task: task,
        status: "CREATING",
      };

      await this.outputResult(planOutput, options);

      const response = await this.llm.chat([
        {
          role: "system",
          content: this.getPlanningSystemPrompt(),
        },
        {
          role: "user",
          content: planningPrompt,
        },
      ]);

      const planJson = this.extractJSON(response);
      if (!planJson) {
        throw new Error("Failed to extract valid JSON plan from AI response");
      }

      const plan = JSON.parse(planJson);

      // Ensure plan has required structure
      if (!plan.plan_id) plan.plan_id = uuidv4();
      if (!plan.created_at) plan.created_at = new Date().toISOString();
      if (!plan.steps || !Array.isArray(plan.steps)) {
        throw new Error(
          "Invalid plan structure: missing or invalid steps array"
        );
      }

      // Validate and normalize steps
      plan.steps = plan.steps.map((step, index) => ({
        id: step.id || index + 1,
        description: step.description || `Step ${index + 1}`,
        tool: step.tool || "executeCommand",
        parameters: step.parameters || {},
        success_criteria:
          step.success_criteria || "Step completes without error",
        error_handling: step.error_handling || "Retry once, then prompt user",
        status: "PENDING",
        dependencies: step.dependencies || [],
        estimated_time: step.estimated_time || "unknown",
        attempts: 0,
        max_attempts: 3,
      }));

      // Save plan to file
      const planFile = path.join(this.planDir, `${plan.plan_id}.json`);
      await fs.writeJson(planFile, plan, { spaces: 2 });

      const completePlanOutput = {
        mode: "PLAN",
        timestamp: new Date().toISOString(),
        task: task,
        status: "CREATED",
        plan: {
          id: plan.plan_id,
          file: planFile,
          steps: plan.steps.length,
          strategy: plan.overall_strategy,
          risks: plan.risk_assessment,
        },
      };

      await this.outputResult(completePlanOutput, options);
      return plan;
    } catch (error) {
      const errorOutput = {
        mode: "PLAN",
        timestamp: new Date().toISOString(),
        task: task,
        status: "FAILED",
        error: error.message,
      };

      await this.outputResult(errorOutput, options);
      throw new Error(`Planning failed: ${error.message}`);
    }
  }

  async loadPlan(planId) {
    const planFile = path.join(this.planDir, `${planId}.json`);
    if (!(await fs.pathExists(planFile))) {
      throw new Error(`Plan file not found: ${planId}`);
    }
    return await fs.readJson(planFile);
  }

  async savePlan(plan) {
    await this.ensurePlanDir();
    const planFile = path.join(this.planDir, `${plan.plan_id}.json`);
    await fs.writeJson(planFile, plan, { spaces: 2 });
    return planFile;
  }

  async listPlans() {
    await this.ensurePlanDir();
    const files = await fs.readdir(this.planDir);
    const planFiles = files.filter((f) => f.endsWith(".json"));

    const plans = [];
    for (const file of planFiles) {
      try {
        const plan = await fs.readJson(path.join(this.planDir, file));
        plans.push({
          id: plan.plan_id,
          task: plan.original_task,
          created: plan.created_at,
          steps: plan.steps.length,
          status: this.getPlanStatus(plan),
        });
      } catch (error) {
        console.warn(`Failed to read plan file ${file}:`, error.message);
      }
    }

    return plans;
  }

  getPlanStatus(plan) {
    const pending = plan.steps.filter((s) => s.status === "PENDING").length;
    const completed = plan.steps.filter((s) => s.status === "COMPLETED").length;
    const failed = plan.steps.filter((s) => s.status === "FAILED").length;

    if (failed > 0) return "FAILED";
    if (pending === 0) return "COMPLETED";
    if (completed > 0) return "IN_PROGRESS";
    return "PENDING";
  }

  getPlanningSystemPrompt() {
    return `You are an expert task planner and strategist. Your job is to break down complex tasks into clear, sequential, actionable steps.

Key principles:
1. Each step should be atomic and well-defined
2. Steps should build logically upon each other
3. Include proper error handling and recovery strategies
4. Consider dependencies and prerequisites
5. Be specific about tools and parameters needed
6. Think about edge cases and potential failures

Available tools: ${Object.keys(this.tools).join(", ")}

Always respond with valid JSON in the exact format requested. Think through the task multiple times to ensure completeness and accuracy.`;
  }
}

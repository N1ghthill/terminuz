import { z } from "zod";

export const TaskStatusSchema = z.enum(["pending", "running", "completed", "failed"]);

export const TaskSchema = z.object({
  id: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().min(1).max(500),
  type: z.enum(["research", "code", "test", "verify"]),
  dependencies: z.array(z.string()).default([]),
  status: TaskStatusSchema,
  result: z.string().optional(),
  error: z.string().optional(),
});

export interface Task {
  id: string;
  description: string;
  type: "research" | "code" | "test" | "verify";
  dependencies: string[];
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
  error?: string;
}

export interface TaskPlan {
  objective: string;
  tasks: Task[];
  raw?: string;
  currentTaskId?: string;
}

export const TaskPlanSchema = z.object({
  objective: z.string().min(1),
  tasks: z.array(TaskSchema),
  raw: z.string().optional(),
  currentTaskId: z.string().optional(),
});

const PlannedTaskSchema = z.object({
  id: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().min(1).max(500),
  type: z.enum(["research", "code", "test", "verify"]),
  dependencies: z.array(z.string()).default([]),
});

const PlannedTaskArraySchema = z.array(PlannedTaskSchema).min(1, "At least one task is required.");
const READ_ONLY_DISCOVERY_VERB_PATTERN = /\b(?:list|show|find|search|inspect|check|track|listar|mostre|mostrar|busque|buscar|procure|procurar|inspecione|verifique|rastrear|rastreie)\b/i;
const READ_ONLY_DISCOVERY_NOUN_PATTERN = /\b(?:project|projects|repo|repos|repository|repositories|directory|directories|folder|folders|workspace|projeto|projetos|repositorio|repositorios|diretorio|diretorios|pasta|pastas)\b/i;
const READ_ONLY_MUTATION_PATTERN = /\b(?:git\s+init|git\s+add|git\s+commit|git\s+push|git\s+tag|git\s+stash|initialize\s+(?:a\s+)?git\s+repository|initialise\s+(?:a\s+)?git\s+repository|create\s+(?:a\s+)?\.?gitignore|stage\s+all\s+files|commit\s+all\s+files)\b/i;

function isReadOnlyDiscoveryObjective(objective: string): boolean {
  return READ_ONLY_DISCOVERY_VERB_PATTERN.test(objective) && READ_ONLY_DISCOVERY_NOUN_PATTERN.test(objective);
}

export class TaskPlanner {
  async plan(objective: string, complete: (prompt: string) => Promise<string>): Promise<TaskPlan> {
    const readOnlyDiscoveryObjective = isReadOnlyDiscoveryObjective(objective);
    const raw = await complete(`Create an execution plan for this coding task.
Return only JSON in this shape:
[
  {"id":"short-id","description":"specific action","type":"research|code|test|verify","dependencies":[]}
]

Requirements:
- Each task must have a unique ID (lowercase, alphanumeric with hyphens)
- Description should be specific and actionable
- Type must be one of: research, code, test, verify
- Dependencies must reference existing task IDs
- Tasks should be ordered logically
${readOnlyDiscoveryObjective
  ? `- This is a read-only discovery request; prefer the fewest inspection steps needed
- Do not propose initializing git repositories, creating .gitignore, staging files, committing, or pushing
- Do not propose filesystem mutations for this request`
  : ""}

Task:
    ${objective}`);

    try {
      const parsedRaw = JSON.parse(raw);
      const validationResult = PlannedTaskArraySchema.safeParse(parsedRaw);

      if (!validationResult.success) {
        throw new Error(`Invalid task plan format: ${validationResult.error.message}`);
      }

      // Validate that dependencies reference existing tasks
      const taskIds = new Set(validationResult.data.map((t) => t.id));
      for (const task of validationResult.data) {
        for (const dep of task.dependencies) {
          if (!taskIds.has(dep)) {
            throw new Error(`Task "${task.id}" has unknown dependency: "${dep}"`);
          }
        }

        if (readOnlyDiscoveryObjective && READ_ONLY_MUTATION_PATTERN.test(task.description)) {
          throw new Error(`Unsafe mutating task in read-only plan: "${task.description}"`);
        }
      }

      return {
        objective,
        raw,
        tasks: validationResult.data.map((task) => ({
          id: task.id,
          description: task.description,
          type: task.type,
          dependencies: task.dependencies,
          status: "pending" as const,
        })),
      };
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in task plan: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get the next task that can be executed (all dependencies completed)
   */
  getNextTask(plan: TaskPlan): Task | undefined {
    return this.getRunnableTasks(plan)[0];
  }

  /**
   * Get all tasks that can be executed in parallel (dependencies satisfied, status pending)
   */
  getRunnableTasks(plan: TaskPlan): Task[] {
    const completedIds = new Set(
      plan.tasks.filter((t) => t.status === "completed").map((t) => t.id)
    );

    return plan.tasks.filter((task) => {
      if (task.status !== "pending") return false;
      return task.dependencies.every((dep) => completedIds.has(dep));
    });
  }

  /**
   * Update task status
   */
  updateTaskStatus(
    plan: TaskPlan,
    taskId: string,
    status: Task["status"],
    result?: string,
    error?: string
  ): void {
    const task = plan.tasks.find((t) => t.id === taskId);
    if (task) {
      task.status = status;
      if (result !== undefined) task.result = result;
      if (error !== undefined) task.error = error;
    }
  }

  /**
   * Check if all tasks are completed
   */
  isComplete(plan: TaskPlan): boolean {
    return plan.tasks.length > 0 && plan.tasks.every((t) => t.status === "completed");
  }

  hasFailures(plan: TaskPlan): boolean {
    return plan.tasks.some((t) => t.status === "failed");
  }

  /**
   * Get progress summary
   */
  getProgress(plan: TaskPlan): { completed: number; total: number; percentage: number } {
    const completed = plan.tasks.filter((t) => t.status === "completed").length;
    const total = plan.tasks.length;
    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
    return { completed, total, percentage };
  }
}

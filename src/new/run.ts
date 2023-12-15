import ChatMessage from "./ChatMessage.js";
import Context from "./Context.js";
import type { Task, TaskDescriptor } from "./types.js";

export class CyclicDependencyError extends Error {
  /**
   * Formats the given path into a string.
   * @param path The path to format.
   */
  static formatPath(path: string[]): string {
    return path.join(" -> ");
  }

  /** The name of the error. */
  readonly name = "CyclicDependencyError";
  /** The path of the cycle. */
  readonly path: readonly string[];

  constructor(path: string[]) {
    super(`Cycle detected: ${CyclicDependencyError.formatPath(path)}`);
    this.path = path;
  }
}

export class TaskGraph {
  #tasks = new Map<string, TaskDescriptor>();

  get tasks(): ReadonlyMap<string, TaskDescriptor> {
    return this.#tasks;
  }

  add(task: TaskDescriptor): void {
    this.#tasks.set(task.name, task);
  }

  get(name: string): TaskDescriptor | undefined {
    return this.#tasks.get(name);
  }

  has(name: string): boolean {
    return this.#tasks.has(name);
  }

  delete(name: string): boolean {
    return this.#tasks.delete(name);
  }

  /**
   * Executes the tasks in topological order.
   * @param message The message to pass to the tasks.
   * @param context The context to pass to the tasks.
   * @throws If a cycle is detected.
   * @throws If a task is not found.
   * @throws If a task fails.
   */
  async execute(message: ChatMessage, context: Context): Promise<void> {
    const tasks = this.topologicalSort();

    for (const name of tasks) {
      const { task } = this.get(name)!;

      try {
        await task(message, context);
      } catch (error: any) {
        throw new AggregateError([error], `Task "${name}" failed`);
      }
    }
  }

  /**
   * Executes the tasks in parallel.
   * @param message The message to pass to the tasks.
   * @param context The context to pass to the tasks.
   * @throws If a cycle is detected.
   * @throws If a task is not found.
   * @throws If a task fails.
   */
  async executeParallel(message: ChatMessage, context: Context): Promise<void> {
    const taskOrder = this.topologicalSort();
    const taskPromises = new Map<string, Promise<void>>();

    for (const name of taskOrder) {
      const { task, dependencies } = this.get(name)!;

      // Wait for all dependencies to be resolved before executing the task
      const dependencyPromises = dependencies.map((dep) =>
        taskPromises.get(dep)
      );

      const executeTask = async () => {
        await Promise.all(dependencyPromises);
        await task(message, context);
      };

      taskPromises.set(name, executeTask());
    }

    const settled = await Promise.allSettled(taskPromises.values());
    const rejected = settled.filter(isRejected);

    if (rejected.length) {
      throw new AggregateError(
        rejected.map((result) => result.reason),
        `${rejected.length} tasks failed`,
      );
    }
  }

  /**
   * Sorts the tasks in topological order.
   * @returns The sorted tasks.
   * @throws If a cycle is detected.
   */
  private topologicalSort(): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (name: string): void => {
      if (visited.has(name)) {
        return;
      }

      if (visiting.has(name)) {
        throw new CyclicDependencyError([...visiting, name]);
      }

      visiting.add(name);

      const task = this.get(name);

      if (!task) {
        throw new Error(`Task not found: ${name}`);
      }

      task.dependencies.forEach(visit);

      visiting.delete(name);
      visited.add(name);
      sorted.push(name);
    };

    this.#tasks.forEach((_, name) => visit(name));

    return sorted;
  }
}

/**
 * Type guard for {@link PromiseRejectedResult}.
 * @param result The result to check.
 */
export function isRejected<T>(
  result: PromiseSettledResult<T>,
): result is PromiseRejectedResult {
  return result.status === "rejected";
}

/**
 * Pipes the given tasks together. This version will wait for each task to
 * complete before executing the next task. To execute tasks in parallel, use
 * {@link parallelPipe}.
 *
 * @param tasks The tasks to pipe.
 */
export function pipe(...tasks: Task[]): Task {
  return async (message, context) => {
    for (const task of tasks) {
      await task(message, context);
    }
  };
}

/**
 * Pipes the given tasks together. This version will execute all tasks in
 * parallel. To execute tasks in sequence, use {@link pipe}.
 *
 * @param tasks The tasks to pipe.
 */
export function parallelPipe(...tasks: Task[]): Task {
  return async (message, context) => {
    await Promise.all(tasks.map((task) => task(message, context)));
  };
}

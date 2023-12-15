import type ChatMessage from "./ChatMessage.js";
import type Context from "./Context.js";

export interface Message {
  role: string;
  content: string;
}

export interface DataItem<T = unknown> {
  content: T;
  size?: number;
}

export interface CompletionUsage {
  prompt: number;
  completion: number;
}

export interface Completion {
  message: ChatMessage;
  usage: CompletionUsage;
  duration: number;
}

export interface ChatCompletionOptions {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  logprobs?: number;
}

export type ChatCompletion = (
  context: Context,
  options?: ChatCompletionOptions,
) => Promise<Completion>;

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

export interface ChatCompletionResponse {
  choices: { message: Message }[];
  usage: ChatCompletionUsage;
}

export type Task = (message: ChatMessage, context: Context) => Promise<void>;

export interface TaskDescriptor {
  name: string;
  dependencies: string[];
  task: Task;
}

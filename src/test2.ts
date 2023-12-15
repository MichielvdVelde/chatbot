import readline from "readline";

/**
 * A chat message.
 */
export interface Message {
  /** The role of the message. */
  role: string;
  /** The content of the message. */
  content: string;
  /** The token size of the message. */
  size?: number;
}

/**
 * A chat completion function.
 *
 * @param context The context of the chat.
 * @returns The new message.
 */
export type ChatCompletion = (
  context: Context,
) => Promise<ChatCompletionResult>;

/**
 * A data item.
 */
export interface DataItem {
  /** The content of the data item. */
  content: unknown;
  /** The token size of the data item. */
  size?: number;
}

/**
 * A chat message.
 */
export class ChatMessage {
  /** The role of the message. */
  readonly role: string;
  /** The content of the message. */
  readonly content: string;
  /** The token size of the message. */
  readonly size?: number;

  #data = new Map<string, DataItem>();

  constructor(role: string, content: string, size?: number) {
    this.role = role;
    this.content = content;
    this.size = size;
  }

  get data(): ReadonlyMap<string, DataItem> {
    return this.#data;
  }

  /**
   * Set a data item.
   * @param key The key of the data item.
   * @param val The value of the data item.
   * @param size The token size of the data item.
   */
  set(key: string, val: unknown, size?: number) {
    this.#data.set(key, {
      content: val,
      size,
    });

    return this;
  }

  /**
   * Get a data item.
   * @param key The key of the data item.
   */
  get<T = unknown>(key: string): T | undefined {
    return this.#data.get(key)?.content as T | undefined;
  }
}

/**
 * A pipeline function.
 *
 * @param message The chat message.
 * @param context The chat context.
 */
export type PipelineFunction = (
  message: ChatMessage,
  context: Context,
  i?: number,
) => Promise<void>;

/**
 * A run function.
 *
 * @param message The chat message.
 * @param context The chat context.
 */
export type RunFunction = (
  message: ChatMessage,
  context: Context,
) => Promise<void>;

/**
 * Creates a pipeline function.
 *
 * @param fns The pipeline functions.
 */
export function createRun(...fns: PipelineFunction[]): RunFunction {
  return async (message: ChatMessage, context: Context): Promise<void> => {
    for (const fn of fns) {
      await fn(message, context);
    }
  };
}

/**
 * A chat context.
 */
export class Context {
  #messages: ChatMessage[] = [];

  /**
   * The messages in the context.
   */
  get messages(): ReadonlyArray<ChatMessage> {
    return this.#messages;
  }

  /**
   * The size of the context.
   */
  get size(): number {
    return this.#messages.reduce((sum, { size }) => sum + (size ?? 0), 0);
  }

  /**
   * Pushes a message to the context.
   *
   * @param message The message to push.
   */
  push(message: ChatMessage) {
    this.#messages.push(message);
    return this;
  }

  /**
   * Returns an iterator over the messages in the context.
   */
  [Symbol.iterator]() {
    return this.#messages[Symbol.iterator]();
  }
}

export interface ChatCompletionResult {
  /** The message. */
  message: Message;
  /** The token size of the message. */
  size: number;
  /** The duration of the chat completion. */
  duration: number;
}

/**
 * Creates a chat completion function.
 *
 * @param url The URL of the chat completion API.
 */
export function createChatCompletion(url: URL): ChatCompletion {
  return async function chatCompletion(context: Context) {
    const start = performance.now();
    const { messages } = context;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages, temperature: 0.7 }),
    });

    if (!response.ok) {
      throw new Error(`Chat completion failed: ${response.statusText}`);
    }

    const { choices, usage } = await response.json() as {
      choices: { message: Message }[];
      usage: { completion_tokens: number };
    };

    const duration = performance.now() - start;

    return {
      message: choices[0].message,
      size: usage.completion_tokens,
      duration,
    };
  };
}

const summarize: PipelineFunction = async (message) => {
  console.log(`Running summarize for "${message.role}"`);

  const ctx = new Context();
  const systemMessage = new ChatMessage(
    "system",
    "You are an expert editor, specializing in summarizing text. Summarize the user's text in a single concise sentence.",
  );
  ctx.push(systemMessage);

  const userMessage = new ChatMessage("user", message.content);
  ctx.push(userMessage);

  const { message: assistantMessage, size } = await chatCompletion(ctx);
  message.set("summary", assistantMessage.content, size);
};

function createErrorMessage(err: Error, context: Context): ChatMessage {
  const errorMessage = new ChatMessage(
    "user",
    `The following error occurred during parsing. Please try again.\n\nError: ${err.message}`,
  );

  context.push(errorMessage);
  return errorMessage;
}

export class TryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TryError";
  }
}

/**
 * Wraps a pipeline function. If the validation function returns an error, the
 * pipeline function is run again. This is useful for validating the output of
 * the pipeline function.
 *
 * @param key The key of the data item.
 * @param init The initialization function. This function is run before the
 * pipeline function, and is used to initialize the context.
 * @param validate The validation function. This function is run after the
 * pipeline function, and is used to validate the output of the pipeline
 * function. It should return an error if the output is invalid.
 * @returns The wrapped pipeline function.
 */
export function wrap(
  key: string,
  init: (context: Context) => Context,
  validate: (input: unknown) => Error | void,
  maxTries = 3,
): PipelineFunction {
  const fn = async function wrappedFn(
    message: ChatMessage,
    context: Context,
    i = 1,
    previousContext?: Context,
  ): Promise<void> {
    if (i > maxTries) {
      throw new TryError(`Maximum number of tries exceeded (${maxTries})`);
    }

    console.log(`Running '${key}' for try #${i}`);
    const ctx = previousContext ?? init(new Context());

    if (!previousContext) {
      const userMessage = new ChatMessage("user", message.content);
      ctx.push(userMessage);
    }

    const { message: completionMessage, size } = await chatCompletion(ctx);

    let json: unknown;

    try {
      json = JSON.parse(completionMessage.content.trim());
    } catch (err: any) {
      console.error(err);
      const errorMessage = createErrorMessage(
        new Error("Failed to parse as JSON"),
        ctx,
      );
      return wrappedFn(errorMessage, context, i + 1, ctx);
    }

    const validationError = validate(json);

    if (validationError) {
      console.error(validationError);
      const errorMessage = createErrorMessage(validationError, ctx);
      return wrappedFn(errorMessage, context, i + 1, ctx);
    }

    message.set(key, json, size);
  };

  return (message, context) => fn(message, context);
}

const extractPeople = wrap(
  "people",
  (ctx) => {
    const systemMessage = new ChatMessage(
      "system",
      "You are an expert editor, specializing in extracting people from text. Extract all people from the user's text, and return them as a valid JSON array `Person` objects\n\n" +
        `\`\`\`ts
      interface Person {
        name: string;
        occupation?: string;
      }
      \`\`\``,
    );
    ctx.push(systemMessage);
    console.log("Extracting people from text");
    return ctx;
  },
  (people) => {
    try {
      if (!Array.isArray(people)) {
        throw new Error(
          `People must be an array, got ${typeof people} instead`,
        );
      } else if (!people.length) {
        throw new Error("People must not be empty");
      } else if (
        !people.every((person) => typeof person === "object" && person !== null)
      ) {
        throw new Error(
          `People must be an array of \`Person\` objects, got ${typeof people} instead`,
        );
      }
    } catch (err: any) {
      return err;
    }
  },
);

const extractKeywords = wrap(
  "keywords",
  (ctx) => {
    const systemMessage = new ChatMessage(
      "system",
      "You are an expert editor, specializing in extracting keywords from text. Extract up to five keywords from the user's text, and return them as a valid JSON array.",
    );
    ctx.push(systemMessage);
    return ctx;
  },
  (keywords) => {
    try {
      if (!Array.isArray(keywords)) {
        throw new Error(
          `Keywords must be an array, got ${typeof keywords} instead`,
        );
      } else if (!keywords.length) {
        throw new Error("Keywords must not be empty");
      } else if (!keywords.every((keyword) => typeof keyword === "string")) {
        throw new Error(
          `Keywords must be an array of strings, got ${typeof keywords} instead`,
        );
      }
    } catch (err: any) {
      return err;
    }
  },
);

const run = createRun(summarize, extractKeywords, extractPeople);

const BASE_URL = new URL("http://localhost:1234");
const CHAT_COMPLETION_URL = new URL("/v1/chat/completions", BASE_URL);

const chatCompletion = createChatCompletion(CHAT_COMPLETION_URL);
const ctx = new Context();

const lr = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function processCompletion(ctx: Context) {
  console.log("Running chat completion");

  const { message: completion, duration } = await chatCompletion(ctx);
  const message = new ChatMessage(completion.role, completion.content);
  message.set("duration", duration);
  ctx.push(message);
  await run(message, ctx);
  return message;
}

ctx.push(
  new ChatMessage(
    "system",
    "You are YAAAI (Yet Another Approach (to) AI), a helpful AI that assists the user in their tasks.",
  ),
);

function next() {
  lr.question("> ", async (input) => {
    if (input === "exit") {
      lr.close();
      return;
    }

    console.log("Processing input...");

    const userMessage = new ChatMessage("user", input);
    await run(userMessage, ctx);
    ctx.push(userMessage);

    console.log(userMessage);
    console.log(userMessage.data);

    console.log("Processing completion...");

    const assistantMessage = await processCompletion(ctx);
    console.log(assistantMessage);
    console.log(assistantMessage.data);

    const totalDuration = (userMessage.get<number>("duration") ?? 0) +
      (assistantMessage.get<number>("duration") ?? 0);

    console.log("Processing complete");
    console.log(`Total duration: ${totalDuration}ms\n\n`);

    next();
  });
}

next();

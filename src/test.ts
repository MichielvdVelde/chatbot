import { Eta } from "eta";
import { join } from "path";

export interface Message {
  role: string;
  content: string;
}

export class Context {
  #messages: Message[] = [];

  get messages(): ReadonlyArray<Message> {
    return this.#messages;
  }

  push(role: string, content: string) {
    this.#messages.push({ role, content });
  }

  [Symbol.iterator]() {
    return this.#messages[Symbol.iterator]();
  }
}

export function createChatCompletion(url: URL) {
  return async function chatCompletion(context: Context) {
    const { messages } = context;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      throw new Error(`Chat completion failed: ${response.statusText}`);
    }

    const { choices } = await response.json() as {
      choices: { message: Message }[];
    };

    return choices[0].message;
  };
}

const eta = new Eta({ views: join(import.meta.url, "templates") });

const BASE_URL = new URL("http://localhost:1234");
const CHAT_COMPLETION_URL = new URL("/v1/chat/completions", BASE_URL);

const chatCompletion = createChatCompletion(CHAT_COMPLETION_URL);
const ctx = new Context();

// Add system message
ctx.push(
  "system",
  "For each request, output a JSON array of at least 5 words or phrases that best describe the themes of the request.",
);

// Add user message
ctx.push(
  "user",
  "As the vast emptiness of space stretched before me, I couldn't help but wonder why he'd ever applied for that forsaken position. His decision had left me virtually alone, tasked with the mind-numbing chore of overseeing massive machines that barely seemed to need supervision. Weeks, maybe months, had passed since they'd last required any input from me.",
);

const message = await chatCompletion(ctx);
console.log(message.content);

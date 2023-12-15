import ChatMessage from "./ChatMessage.js";
import type { ChatCompletion, ChatCompletionResponse } from "./types.js";

/**
 * Creates a chat completion function. This function will send a request to the
 * chat completion API with the given context and options. The response will be
 * parsed and returned as a completion.
 *
 * @param url The URL of the chat completion API.
 * @param headers The headers to send with the request.
 * @returns A chat completion function.
 */
export default function createChatCompletion(
  url: URL,
  headers?: HeadersInit,
): ChatCompletion {
  return async function chatCompletion(context, options) {
    const start = performance.now();
    const { messages } = context;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ ...options, messages }),
    });

    if (!response.ok) {
      throw new Error(`Chat completion failed: ${response.statusText}`);
    }

    const { choices, usage } = await response.json() as ChatCompletionResponse;
    const choice = choices[0].message;

    const message = new ChatMessage(
      choice.role,
      choice.content,
      usage.completion_tokens,
    );

    return {
      message,
      duration: performance.now() - start,
      usage: {
        prompt: usage.prompt_tokens,
        completion: usage.completion_tokens,
      },
    };
  };
}

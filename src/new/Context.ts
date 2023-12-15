import ChatMessage from "./ChatMessage.js";
import type { DataItem } from "./types.js";

/**
 * A context is a collection of chat messages.
 */
export default class Context {
  #messages: ChatMessage[] = [];
  #data = new Map<string, DataItem>();

  /**
   * The chat messages in the context.
   */
  get messages(): ReadonlyArray<ChatMessage> {
    return this.#messages;
  }

  /**
   * The data in the context.
   */
  get data(): ReadonlyMap<string, DataItem> {
    return this.#data;
  }

  /**
   * Creates a chat message and adds it to the context.
   *
   * @param role The role of the message.
   * @param content The content of the message.
   * @param size The size of the message.
   * @returns The created chat message.
   */
  create(role: string, content: string, size?: number): ChatMessage {
    const message = new ChatMessage(role, content, size);
    this.push(message);
    return message;
  }

  /**
   * Adds chat messages to the context.
   *
   * @param messages The chat messages to add.
   */
  push(...messages: ChatMessage[]): void {
    this.#messages.push(...messages);
  }

  /**
   * Sets data in the context.
   *
   * @param key The key of the data.
   * @param content The content of the data.
   * @param size The size of the data.
   */
  set<T>(key: string, content: T, size?: number): void {
    this.#data.set(key, { content, size });
  }

  /**
   * Gets data from the context.
   *
   * @param key The key of the data.
   * @returns The data item.
   */
  get<T = unknown>(key: string): DataItem<T> | undefined {
    return this.#data.get(key) as DataItem<T> | undefined;
  }

  [Symbol.iterator]() {
    return this.#messages[Symbol.iterator]();
  }
}

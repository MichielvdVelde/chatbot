import type { DataItem } from "./types.js";

/**
 * Represents a chat message.
 */
export default class ChatMessage {
  /** The role of the message. */
  readonly role: string;
  /** The content of the message. */
  readonly content: string;

  #size?: number;
  #data = new Map<string, DataItem>();

  constructor(role: string, content: string, size?: number) {
    this.role = role;
    this.content = content;
    this.#size = size;
  }

  /**
   * The size of the message. This is the number of tokens in the message.
   */
  get size(): number {
    return this.#size ?? 0;
  }

  set size(size: number) {
    if (this.#size !== undefined) {
      throw new Error("Cannot set size twice");
    }

    this.#size = size;
  }

  /**
   * The data associated with the message.
   */
  get data(): ReadonlyMap<string, DataItem> {
    return this.#data;
  }

  /**
   * Sets the data associated with the message.
   *
   * @param key The key to set.
   * @param content The data to set.
   * @param size The size of the data item.
   */
  set<T>(key: string, content: T, size?: number): void {
    this.#data.set(key, { content, size });
  }

  /**
   * Gets the data associated with the message.
   *
   * @param key The key to get.
   * @returns The data associated with the key.
   */
  get<T = unknown>(key: string): T | undefined {
    return this.#data.get(key)?.content as T | undefined;
  }
}

/**
 * Represents a system chat message (role is "system").
 */
export class SystemChatMessage extends ChatMessage {
  constructor(content: string, size?: number) {
    super("system", content, size);
  }
}

/**
 * Represents a user chat message (role is "user").
 */
export class UserChatMessage extends ChatMessage {
  constructor(content: string, size?: number) {
    super("user", content, size);
  }
}

/**
 * Represents an assistant chat message (role is "assistant").
 */
export class AssistantChatMessage extends ChatMessage {
  constructor(content: string, size?: number) {
    super("assistant", content, size);
  }
}

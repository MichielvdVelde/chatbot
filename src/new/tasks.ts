import type { ChatCompletion, ChatCompletionOptions, Task } from "./types.js";
import Context from "./Context.js";
import { SystemChatMessage, UserChatMessage } from "./ChatMessage.js";
import Ajv, { type JSONSchemaType, type ValidateFunction } from "ajv";

const ajv = new Ajv();

export interface NamedEntity {
  entity: string;
  title?: string;
  category: string;
}

const entitySchema: JSONSchemaType<NamedEntity[]> = {
  type: "array",
  items: {
    type: "object",
    properties: {
      entity: { type: "string" },
      title: { type: "string", nullable: true },
      aliases: { type: "array", items: { type: "string" } },
      category: {
        type: "string",
        enum: ["person", "location", "organization"],
      },
    },
    required: ["entity", "category"],
  },
};

const keywordSchema: JSONSchemaType<string[]> = {
  type: "array",
  items: { type: "string" },
};

const validateKeywords = ajv.compile(keywordSchema);
const validateEntities = ajv.compile(entitySchema);

/**
 * Creates a task that parses the response of the chat completion function and
 * sets the result on the message.
 *
 * @param key The key to set.
 * @param chatCompletion The chat completion function to use.
 * @param validateJson The JSON schema to validate the response.
 * @param systemMessageContent The content of the system message to send.
 * @param maxTries The maximum number of tries to parse the response.
 * @returns A task that parses the response of the chat completion function and
 * sets the result on the message.
 */
export function createJsonTask<T>(
  key: string,
  chatCompletion: ChatCompletion,
  validateJson: ValidateFunction<T>,
  systemMessageContent: string,
  maxTries = 3,
  options?: ChatCompletionOptions,
): Task {
  return async (message) => {
    const innerContext = new Context();

    innerContext.push(new SystemChatMessage(systemMessageContent));
    innerContext.push(new UserChatMessage(message.content));

    async function complete() {
      const { message: response, usage } = await chatCompletion(
        innerContext,
        options,
      );

      innerContext.push(response);

      let parsedJson: unknown;

      try {
        parsedJson = JSON.parse(response.content);
      } catch (e) {
        throw new Error("Message is not valid JSON");
      }

      if (!validateJson(parsedJson)) {
        throw new Error(validateJson.errors?.[0].message ?? "Invalid JSON");
      }

      message.set(key, parsedJson, usage.completion);
    }

    for (let i = 0; i < maxTries; i++) {
      try {
        await complete();
        return;
      } catch (error: any) {
        innerContext.push(
          new UserChatMessage(
            `Unable to parse response. Please fix the error and try again.\n\nError: ${error.message}`,
          ),
        );
      }
    }

    throw new Error(`Unable to parse response after ${maxTries} tries`);
  };
}

/**
 * Creates a task that extracts keywords from the user's messages and sets the
 * result on the message.
 *
 * @param chatCompletion The chat completion function to use.
 * @param maxTries The maximum number of tries to parse the response.
 */
export function createExtractKeywords(
  chatCompletion: ChatCompletion,
  maxTries = 3,
): Task {
  return createJsonTask(
    "keywords",
    chatCompletion,
    validateKeywords,
    "For each of the user's messages, extract up to 5 keywords that describe what the message is about. Return a valid JSON array of strings. Consider the entire message when extracting keywords.",
    maxTries,
    {
      temperature: 0.1,
    },
  );
}

/**
 * Creates a task that extracts entities from the user's messages and sets the
 * result on the message.
 *
 * @param chatCompletion The chat completion function to use.
 * @param maxTries The maximum number of tries to parse the response.
 */
export function createExtractEntities(
  chatCompletion: ChatCompletion,
  maxTries = 3,
): Task {
  return createJsonTask(
    "entities",
    chatCompletion,
    validateEntities,
    "For each of the user's messages, extract any people, places, or organizations that are mentioned. Return a valid JSON array of objects with a `category` (either `person`, `location`, or `organization`), `entity` (name) field, optional `title` string, and `aliases` array. Consider the entire message when extracting entities.",
    maxTries,
    {
      temperature: 0.1,
    },
  );
}

/**
 * Creates a task that summarizes the user's messages and sets the result on the
 * message.
 *
 * @param chatCompletion The chat completion function to use.
 */
export function createSummarize(chatCompletion: ChatCompletion): Task {
  return async function summarize(message) {
    const innerContext = new Context();

    innerContext.push(
      new SystemChatMessage(
        "For each of the user's messages, summarize in one sentence what the message is about.",
      ),
    );

    innerContext.push(new UserChatMessage(message.content));

    const { message: response, usage } = await chatCompletion(innerContext, {
      temperature: 0.1,
    });

    message.set("summary", response.content, usage.completion);
  };
}

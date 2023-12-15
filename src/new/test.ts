import createChatCompletion from "./chatCompletion.js";
import { SystemChatMessage, UserChatMessage } from "./ChatMessage.js";
import Context from "./Context.js";
import { pipe } from "./run.js";
import {
  createExtractEntities,
  createExtractKeywords,
  createSummarize,
  type NamedEntity,
} from "./tasks.js";

const text = `
The 1920s saw dramatic innovations in American political campaign techniques, based especially on new advertising methods that had worked so well selling war bonds during World War I.
Governor James M. Cox of Ohio, the Democratic Party candidate, made a whirlwind campaign that took him to rallies, train station speeches, and formal addresses, reaching audiences totaling perhaps 2,000,000 people. It resembled the William Jennings Bryan campaign of 1896. By contrast, the Republican Party candidate Senator Warren G. Harding of Ohio relied upon a "front porch campaign".
It brought 600,000 voters to Marion, Ohio, where Harding spoke from his home. Republican campaign manager Will Hays spent some $8,100,000; nearly four times the money Cox's campaign spent. Hays used national advertising in a major way (with advice from adman Albert Lasker). The theme was Harding's own slogan "America First".
Thus the Republican advertisement in Collier's Magazine for October 30, 1920, demanded, "Let's be done with wiggle and wobble." The image presented in the ads was nationalistic, using catchphrases like "absolute control of the United States by the United States," "Independence means independence, now as in 1776," "This country will remain American. Its next President will remain in our own country," and "We decided long ago that we objected to a foreign government of our people."
`;

const BASE_URL = new URL("http://localhost:1234");
const CHAT_COMPLETION_URL = new URL("/v1/chat/completions", BASE_URL);

const chatCompletion = createChatCompletion(CHAT_COMPLETION_URL);

const run = pipe(
  createSummarize(chatCompletion),
  createExtractKeywords(chatCompletion),
  createExtractEntities(chatCompletion),
);

// Create a context
const context = new Context();

// Add a system message which contains instructions for the model
context.push(
  new SystemChatMessage(
    "You are a helpful assistant. Assist the user with their tasks as best you can.",
  ),
);

// Create a user message which contains the user's request
context.push(
  new UserChatMessage(
    `Use the context to answer the following question: Which role did advertising play in the elections?\n\nContext: ${text}`,
  ),
);

// Get a completion from the model
const { message, duration } = await chatCompletion(context, {
  temperature: 0.9,
});

// Print the response
console.log(message.content);
console.log(`Response generated in ${duration.toFixed(3)}ms\n`);

// Run the tasks
await run(message, context);

// Print the summary
console.log(`Summary: ${message.get<string>("summary")}\n`);

// Print the keywords
console.log(`Keywords: ${message.get<string[]>("keywords")?.join(", ")}\n`);

// Print the entities
console.log(
  `Entities:\n ${
    message
      .get<NamedEntity[]>("entities")!
      .map(({ entity, category }) => `${entity} (${category.toLowerCase()})`)
      .join("\n ")
  }`,
);

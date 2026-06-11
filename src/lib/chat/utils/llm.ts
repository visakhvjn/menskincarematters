import { ChatOpenAI } from "@langchain/openai";

export const sharedLlm = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0.4,
});

export const classifierLlm = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0,
});

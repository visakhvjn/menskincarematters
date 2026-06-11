import { createAgent } from "langchain";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { z } from "zod";
import { sharedLlm } from "@/lib/chat/utils/llm";
import { SEARCH_AGENT_SYSTEM_PROMPT } from "@/lib/chat/prompts";
import { duckDuckGoSearchTool } from "@/lib/chat/tools/duckDuckGoSearch";
import { buildUserMessage } from "@/lib/chat/utils/messages";
import { agentEventsToStream, textToStream } from "@/lib/chat/utils/agentStream";

const checkpointer = new MemorySaver();

const searchResultSchema = z.object({
  hasProducts: z.boolean(),
  products: z.array(z.string()).max(3),
  summary: z.string(),
  advice: z.string(),
});

export type ProductSearchResult = z.infer<typeof searchResultSchema>;

export const searchAgent = createAgent({
  model: sharedLlm,
  tools: [duckDuckGoSearchTool],
  systemPrompt: SEARCH_AGENT_SYSTEM_PROMPT,
  responseFormat: searchResultSchema,
  checkpointer,
});

export async function findProductSuggestions(input: {
  question: string;
  threadId: string;
}): Promise<ProductSearchResult> {
  const result = await searchAgent.invoke(
    {
      messages: [{ role: "user", content: buildUserMessage(input.question) }],
    },
    {
      configurable: {
        thread_id: `search-${input.threadId}`,
      },
    }
  );

  const parsed = searchResultSchema.safeParse(result.structuredResponse);
  if (parsed.success) {
    const products = parsed.data.products
      .filter((name) => name.trim().length > 0)
      .slice(0, 3);

    return {
      ...parsed.data,
      products,
      hasProducts: parsed.data.hasProducts && products.length > 0,
    };
  }

  return {
    hasProducts: false,
    products: [],
    summary: "Men's skincare guidance",
    advice:
      "I couldn't find specific product matches, but I'm here for men's skincare questions. Try asking about a routine, ingredient, or skin concern.",
  };
}

export async function streamSearchAdvice(input: {
  question: string;
  threadId: string;
  advice: string;
}): Promise<ReadableStream<Uint8Array>> {
  if (input.advice.trim()) {
    return textToStream(input.advice);
  }

  const eventStream = await searchAgent.streamEvents(
    {
      messages: [{ role: "user", content: buildUserMessage(input.question) }],
    },
    {
      configurable: {
        thread_id: `search-stream-${input.threadId}`,
      },
      version: "v2",
    }
  );

  return agentEventsToStream(eventStream);
}

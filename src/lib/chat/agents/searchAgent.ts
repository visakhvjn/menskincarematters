import { createAgent } from "langchain";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { z } from "zod";
import { sharedLlm } from "@/lib/chat/utils/llm";
import { SEARCH_AGENT_SYSTEM_PROMPT } from "@/lib/chat/prompts";
import { duckDuckGoSearchTool } from "@/lib/chat/tools/duckDuckGoSearch";
import {
  buildConversationMessages,
  type ChatHistoryMessage,
} from "@/lib/chat/utils/messages";
import { textToStream } from "@/lib/chat/utils/agentStream";

const checkpointer = new MemorySaver();

const productSuggestionSchema = z.object({
  name: z
    .string()
    .describe("Exact brand, product name, and variant shown by the source."),
  url: z
    .string()
    .describe(
      "Direct Indian product-page URL copied from search results (must start with https://)."
    ),
});

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const searchResultSchema = z.object({
  hasProducts: z.boolean(),
  products: z.array(productSuggestionSchema).max(3),
  summary: z.string(),
  advice: z.string(),
});

export type ProductSearchResult = z.infer<typeof searchResultSchema>;
export type ProductSuggestion = z.infer<typeof productSuggestionSchema>;

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
  history: ChatHistoryMessage[];
}): Promise<ProductSearchResult> {
  const result = await searchAgent.invoke(
    {
      messages: buildConversationMessages(input.history, input.question),
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
      .filter(
        (product) =>
          product.name.trim().length > 0 && isHttpUrl(product.url.trim())
      )
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
  advice: string;
}): Promise<ReadableStream<Uint8Array>> {
  const text =
    input.advice.trim() ||
    "I'm here for men's skincare questions. What would you like to know?";

  return textToStream(text);
}

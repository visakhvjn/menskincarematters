import { createAgent } from "langchain";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { sharedLlm } from "@/lib/chat/utils/llm";
import { PRODUCT_FETCHER_SYSTEM_PROMPT } from "@/lib/chat/prompts";
import { indianProductSearchTool } from "@/lib/chat/tools/indianProductSearch";
import type { ProductSuggestion } from "@/lib/chat/agents/searchAgent";
import {
  buildConversationMessages,
  type ChatHistoryMessage,
} from "@/lib/chat/utils/messages";
import { agentEventsToStream } from "@/lib/chat/utils/agentStream";

const checkpointer = new MemorySaver();

export const productFetcherAgent = createAgent({
  model: sharedLlm,
  tools: [indianProductSearchTool],
  systemPrompt: PRODUCT_FETCHER_SYSTEM_PROMPT,
  checkpointer,
});

function buildFetcherQuestion(input: {
  question: string;
  products: ProductSuggestion[];
  summary: string;
}) {
  const productList = input.products
    .map(
      (product, index) =>
        `${index + 1}. ${product.name}\n   Verified product URL: ${product.url}`
    )
    .join("\n");

  return `User question: ${input.question}

Products to look up in India:
${productList}

Context from product search: ${input.summary}

Use indian_product_search to find one image for each product. Keep the verified product URL supplied above as the buy link; do not replace it with a URL returned by the image search. Write the final answer with one image and one buy link per product. Use the product name as the link text (e.g. [Product name](url)). Do not add a "Where to buy in India" section or use store names as link text.`;
}

export async function streamIndianProductAnswer(input: {
  question: string;
  threadId: string;
  history: ChatHistoryMessage[];
  products: ProductSuggestion[];
  summary: string;
}): Promise<ReadableStream<Uint8Array>> {
  const fetchQuestion = buildFetcherQuestion(input);

  const eventStream = await productFetcherAgent.streamEvents(
    {
      messages: buildConversationMessages(input.history, fetchQuestion),
    },
    {
      configurable: {
        thread_id: `fetch-${input.threadId}`,
      },
      version: "v2",
    }
  );

  return agentEventsToStream(eventStream);
}

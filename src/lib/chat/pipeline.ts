import { classifyQuery } from "@/lib/chat/agents/classifierAgent";
import {
  findProductSuggestions,
  streamSearchAdvice,
} from "@/lib/chat/agents/searchAgent";
import { streamIndianProductAnswer } from "@/lib/chat/agents/productFetcherAgent";
import { OUT_OF_DOMAIN_RESPONSE } from "@/lib/chat/prompts";
import type { ChatHistoryMessage } from "@/lib/chat/utils/messages";

export type PipelineResult =
  | {
      type: "refusal";
      message: string;
      score: number;
      category: string;
    }
  | {
      type: "stream";
      stream: ReadableStream<Uint8Array>;
      score: number;
      category: string;
      hasProducts: boolean;
    };

export async function runChatPipeline(input: {
  question: string;
  threadId: string;
  history: ChatHistoryMessage[];
}): Promise<PipelineResult> {
  const classification = await classifyQuery({
    question: input.question,
    threadId: input.threadId,
    history: input.history,
  });

  if (!classification.isAccepted) {
    return {
      type: "refusal",
      message: OUT_OF_DOMAIN_RESPONSE,
      score: classification.score,
      category: classification.category,
    };
  }

  const searchResult = await findProductSuggestions({
    question: input.question,
    threadId: input.threadId,
    history: input.history,
  });

  if (searchResult.hasProducts) {
    const stream = await streamIndianProductAnswer({
      question: input.question,
      threadId: input.threadId,
      history: input.history,
      products: searchResult.products,
      summary: searchResult.summary,
    });

    return {
      type: "stream",
      stream,
      score: classification.score,
      category: classification.category,
      hasProducts: true,
    };
  }

  const stream = await streamSearchAdvice({
    advice: searchResult.advice,
  });

  return {
    type: "stream",
    stream,
    score: classification.score,
    category: classification.category,
    hasProducts: false,
  };
}

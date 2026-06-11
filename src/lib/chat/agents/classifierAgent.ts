import { createAgent } from "langchain";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { z } from "zod";
import { classifierLlm } from "@/lib/chat/utils/llm";
import {
  CLASSIFICATION_THRESHOLD,
  CLASSIFIER_SYSTEM_PROMPT,
} from "@/lib/chat/prompts";
import {
  buildConversationMessages,
  type ChatHistoryMessage,
} from "@/lib/chat/utils/messages";

const classificationSchema = z.object({
  score: z.number().min(0).max(100),
  category: z.string(),
  reason: z.string(),
});

export type ClassificationResult = z.infer<typeof classificationSchema> & {
  isAccepted: boolean;
};

const keywordFallback = [
  "men skincare",
  "men's skincare",
  "mens skincare",
  "male skincare",
  "skincare",
  "skin care",
  "acne",
  "dark spots",
  "hyperpigmentation",
  "sunscreen",
  "spf",
  "moisturizer",
  "cleanser",
  "retinol",
  "niacinamide",
  "salicylic",
  "beard",
  "shaving",
  "razor burn",
  "ingrown",
  "aftershave",
  "beard oil",
  "face wash",
  "serum",
  "toner",
];

const checkpointer = new MemorySaver();

export const classifierAgent = createAgent({
  model: classifierLlm,
  tools: [],
  systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
  responseFormat: classificationSchema,
  checkpointer,
});

function keywordScore(question: string): number {
  const lower = question.toLowerCase();
  const matches = keywordFallback.filter((keyword) => lower.includes(keyword));
  if (matches.length >= 2) return 85;
  if (matches.length === 1) return 72;
  return 0;
}

function hasOngoingSkincareThread(history: ChatHistoryMessage[]) {
  return history.some(
    (message) => message.role === "assistant" && message.content.trim().length > 0
  );
}

export async function classifyQuery(input: {
  question: string;
  threadId: string;
  history: ChatHistoryMessage[];
}): Promise<ClassificationResult> {
  const trimmed = input.question.trim();
  if (!trimmed) {
    return {
      score: 0,
      category: "empty",
      reason: "Empty question.",
      isAccepted: false,
    };
  }

  const fallbackScore = keywordScore(trimmed);
  const isFollowUp = hasOngoingSkincareThread(input.history);

  try {
    const result = await classifierAgent.invoke(
      {
        messages: buildConversationMessages(input.history, trimmed),
      },
      {
        configurable: {
          thread_id: `classify-${input.threadId}`,
        },
      }
    );

    const structured = classificationSchema.safeParse(result.structuredResponse);
    if (structured.success) {
      let score = Math.max(structured.data.score, fallbackScore);

      if (isFollowUp && score < CLASSIFICATION_THRESHOLD) {
        score = CLASSIFICATION_THRESHOLD;
      }

      return {
        ...structured.data,
        score,
        isAccepted: score >= CLASSIFICATION_THRESHOLD,
      };
    }
  } catch {
    // Fall through to keyword fallback.
  }

  const followUpScore =
    isFollowUp && fallbackScore < CLASSIFICATION_THRESHOLD
      ? CLASSIFICATION_THRESHOLD
      : fallbackScore;

  return {
    score: followUpScore,
    category:
      followUpScore >= CLASSIFICATION_THRESHOLD ? "men's skincare" : "off-topic",
    reason:
      followUpScore >= CLASSIFICATION_THRESHOLD
        ? isFollowUp
          ? "Follow-up in an ongoing skincare conversation."
          : "Matched men's skincare keyword fallback."
        : "No men's skincare signal detected.",
    isAccepted: followUpScore >= CLASSIFICATION_THRESHOLD,
  };
}

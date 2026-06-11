import { createAgent } from "langchain";
import { z } from "zod";
import { classifierLlm } from "@/lib/chat/utils/llm";
import {
  CLASSIFICATION_THRESHOLD,
  CLASSIFIER_SYSTEM_PROMPT,
} from "@/lib/chat/prompts";

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

function keywordScore(question: string): number {
  const lower = question.toLowerCase();
  const matches = keywordFallback.filter((keyword) => lower.includes(keyword));
  if (matches.length >= 2) return 85;
  if (matches.length === 1) return 72;
  return 0;
}

export const classifierAgent = createAgent({
  model: classifierLlm,
  tools: [],
  systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
  responseFormat: classificationSchema,
});

export async function classifyQuery(
  question: string
): Promise<ClassificationResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    return {
      score: 0,
      category: "empty",
      reason: "Empty question.",
      isAccepted: false,
    };
  }

  const fallbackScore = keywordScore(trimmed);

  try {
    const result = await classifierAgent.invoke({
      messages: [{ role: "user", content: trimmed }],
    });

    const structured = classificationSchema.safeParse(result.structuredResponse);
    if (structured.success) {
      const score = Math.max(structured.data.score, fallbackScore);
      return {
        ...structured.data,
        score,
        isAccepted: score >= CLASSIFICATION_THRESHOLD,
      };
    }
  } catch {
    // Fall through to keyword fallback.
  }

  return {
    score: fallbackScore,
    category: fallbackScore >= CLASSIFICATION_THRESHOLD ? "men's skincare" : "off-topic",
    reason:
      fallbackScore >= CLASSIFICATION_THRESHOLD
        ? "Matched men's skincare keyword fallback."
        : "No men's skincare signal detected.",
    isAccepted: fallbackScore >= CLASSIFICATION_THRESHOLD,
  };
}

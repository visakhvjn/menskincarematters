import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { DOMAIN_GUARD_SYSTEM_PROMPT } from "@/lib/chat/prompts";

const guardSchema = z.object({
  isInDomain: z.boolean(),
  reason: z.string(),
});

export type DomainGuardResult = z.infer<typeof guardSchema>;

const keywordFallback = [
  "men grooming",
  "male grooming",
  "grooming",
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
  "beard balm",
  "haircare",
  "hair care",
  "scalp",
  "dandruff",
  "pomade",
  "hair wax",
  "body wash",
  "deodorant",
  "fragrance",
  "cologne",
];

export async function classifyMensGroomingQuestion(
  question: string
): Promise<DomainGuardResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    return {
      isInDomain: false,
      reason: "Empty question.",
    };
  }

  const model = new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0,
  });
  const lower = trimmed.toLowerCase();
  const hasKeyword = keywordFallback.some((keyword) => lower.includes(keyword));

  try {
    const response = await model.invoke([
      { role: "system", content: DOMAIN_GUARD_SYSTEM_PROMPT },
      { role: "user", content: trimmed },
    ]);

    const content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    const parsed = guardSchema.safeParse(JSON.parse(content));
    if (parsed.success) {
      if (!parsed.data.isInDomain && hasKeyword) {
        return {
          isInDomain: true,
          reason: "Keyword override: matched clear men's grooming signal.",
        };
      }
      return parsed.data;
    }
  } catch {
    // Fallback is used when LLM classification fails.
  }

  return {
    isInDomain: hasKeyword,
    reason: hasKeyword
      ? "Matched men's grooming fallback keyword."
      : "No men's grooming signal detected.",
  };
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { streamSkincareAnswer } from "@/lib/chat/chain";
import { classifyMensGroomingQuestion } from "@/lib/chat/domainGuard";
import { OUT_OF_DOMAIN_RESPONSE } from "@/lib/chat/prompts";

const requestSchema = z.object({
  message: z.string().min(1, "Message is required."),
  threadId: z.string().min(1).nullable().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .default([]),
});

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing OPENAI_API_KEY." },
      { status: 500 }
    );
  }

  try {
    const json = await request.json();
    const parsed = requestSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { message, threadId } = parsed.data;
    const resolvedThreadId = threadId ?? crypto.randomUUID();
    const guard = await classifyMensGroomingQuestion(message);

    if (!guard.isInDomain) {
      return new Response(OUT_OF_DOMAIN_RESPONSE, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Thread-Id": resolvedThreadId,
          "X-In-Domain": "false",
        },
      });
    }

    const stream = await streamSkincareAnswer({
      question: message,
      threadId: resolvedThreadId,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Thread-Id": resolvedThreadId,
        "X-In-Domain": "true",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to process chat request.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

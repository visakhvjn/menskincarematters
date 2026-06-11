import { NextResponse } from "next/server";
import { z } from "zod";
import { runChatPipeline } from "@/lib/chat/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    const { message, threadId, history } = parsed.data;
    const resolvedThreadId = threadId ?? crypto.randomUUID();
    const result = await runChatPipeline({
      question: message,
      threadId: resolvedThreadId,
      history,
    });

    if (result.type === "refusal") {
      return new Response(result.message, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Thread-Id": resolvedThreadId,
          "X-In-Domain": "false",
          "X-Classification-Score": String(result.score),
          "X-Classification-Category": result.category,
        },
      });
    }

    return new Response(result.stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Thread-Id": resolvedThreadId,
        "X-In-Domain": "true",
        "X-Classification-Score": String(result.score),
        "X-Classification-Category": result.category,
        "X-Has-Products": String(result.hasProducts),
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

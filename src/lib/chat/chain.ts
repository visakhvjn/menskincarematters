import { createAgent } from "langchain";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { ChatOpenAI } from "@langchain/openai";
import { SKINCARE_SYSTEM_PROMPT } from "@/lib/chat/prompts";

const checkpointer = new MemorySaver();
const llm = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0.4,
});

const skincareAgent = createAgent({
  model: llm,
  tools: [],
  systemPrompt: SKINCARE_SYSTEM_PROMPT,
  checkpointer,
});

function normalizeContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (
          part &&
          typeof part === "object" &&
          "type" in part &&
          part.type === "text" &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }

        return "";
      })
      .join("")
      .trim();
  }

  return JSON.stringify(content);
}

function extractChunkText(chunk: unknown): string {
  if (!chunk) return "";
  if (typeof chunk === "string") return chunk;
  if (typeof chunk === "object" && "content" in chunk) {
    return normalizeContent(chunk.content);
  }
  return "";
}

export async function streamSkincareAnswer(input: {
  question: string;
  threadId: string;
}): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();
  const eventStream = await skincareAgent.streamEvents(
    {
      messages: [{ role: "user", content: input.question }],
    },
    {
      configurable: {
        thread_id: input.threadId,
      },
      version: "v2",
    }
  );

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of eventStream) {
          if (event.event !== "on_chat_model_stream") {
            continue;
          }

          const text = extractChunkText(event.data?.chunk);
          if (text) {
            controller.enqueue(encoder.encode(text));
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

export async function generateSkincareAnswer(input: {
  question: string;
  threadId: string;
}): Promise<string> {
  const result = await skincareAgent.invoke({
    messages: [{ role: "user", content: input.question }],
  }, {
    configurable: {
      thread_id: input.threadId,
    },
  });

  const allMessages = Array.isArray(result.messages) ? result.messages : [];
  const assistantMessage = [...allMessages]
    .reverse()
    .find((message) => {
      if (!message || typeof message !== "object") {
        return false;
      }

      const role =
        "role" in message && typeof message.role === "string"
          ? message.role
          : "getType" in message && typeof message.getType === "function"
            ? message.getType()
            : "";

      return role === "assistant" || role === "ai";
    });

  if (assistantMessage && typeof assistantMessage === "object" && "content" in assistantMessage) {
    return normalizeContent(assistantMessage.content);
  }

  return "I could not generate a response.";
}

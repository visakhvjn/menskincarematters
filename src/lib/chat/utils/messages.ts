export function normalizeContent(content: unknown): string {
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

export function extractChunkText(chunk: unknown): string {
  if (!chunk) return "";
  if (typeof chunk === "string") return chunk;
  if (typeof chunk === "object" && "content" in chunk) {
    return normalizeContent(chunk.content);
  }
  return "";
}

function getCurrentDateLabel() {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_HISTORY_MESSAGES = 20;

export function buildUserMessage(question: string) {
  return `[Current date: ${getCurrentDateLabel()}]\n\n${question}`;
}

export function buildConversationMessages(
  history: ChatHistoryMessage[],
  question: string,
  maxMessages = MAX_HISTORY_MESSAGES
) {
  const trimmedHistory = history
    .filter((message) => message.content.trim())
    .slice(-maxMessages);

  return [
    ...trimmedHistory.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    { role: "user" as const, content: buildUserMessage(question) },
  ];
}

export function extractAssistantText(messages: unknown[]): string {
  const assistantMessage = [...messages]
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

  if (
    assistantMessage &&
    typeof assistantMessage === "object" &&
    "content" in assistantMessage
  ) {
    return normalizeContent(assistantMessage.content);
  }

  return "";
}

export function parseJsonBlock<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? text.trim();

  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    try {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

import { extractChunkText } from "@/lib/chat/utils/messages";

export function textToStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

export function agentEventsToStream(
  eventStream: AsyncIterable<{ event?: string; data?: { chunk?: unknown } }>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

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

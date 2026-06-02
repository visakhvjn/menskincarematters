"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const initialAssistantMessage =
  "Ask me anything about men's grooming, especially skincare.";

type MarkdownImage = {
  alt: string;
  src: string;
};

const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

function extractMarkdownImages(content: string) {
  const images: MarkdownImage[] = [];
  const text = content
    .replace(markdownImageRegex, (_, alt, src) => {
      images.push({ alt: alt || "Search result image", src });
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text, images };
}

function AssistantMessage({ content }: { content: string }) {
  const { text, images } = extractMarkdownImages(content);

  return (
    <div className="markdown-content text-[15px] text-zinc-100">
      {text ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 underline"
              >
                {children}
              </a>
            ),
          }}
        >
          {text}
        </ReactMarkdown>
      ) : null}
      {images.length > 0 ? (
        <div className="chat-images-row">
          {images.map((image, imageIndex) => (
            <span key={`${image.src}-${imageIndex}`} className="chat-image-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.src}
                alt={image.alt}
                loading="lazy"
                className="chat-image"
              />
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function Home() {
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: initialAssistantMessage,
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (!message || isLoading) return;

    const nextMessages = [...messages, { role: "user" as const, content: message }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, threadId }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Request failed.");
      }

      const returnedThreadId = response.headers.get("X-Thread-Id");
      if (returnedThreadId) {
        setThreadId(returnedThreadId);
      }

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      if (!response.body) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "I could not generate a response.",
          };
          return updated;
        });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: accumulated,
          };
          return updated;
        });
      }

      if (!accumulated.trim()) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "I could not generate a response.",
          };
          return updated;
        });
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unknown error."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col">
        <header className="px-4 py-4 sm:px-8">
          <h1 className="text-xl font-semibold text-white">
            Men&apos;s Grooming Assistant
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Men&apos;s grooming overall - especially skincare
          </p>
        </header>

        <main className="flex-1 overflow-y-auto border-y border-zinc-800">
          {messages.map((messageItem, index) => (
            <div
              key={`${messageItem.role}-${index}`}
              className={`px-4 py-6 sm:px-8 ${
                messageItem.role === "assistant" ? "bg-black" : "bg-zinc-900"
              }`}
            >
              <div className="mx-auto max-w-3xl">
                {messageItem.role === "assistant" ? (
                  <AssistantMessage content={messageItem.content} />
                ) : (
                  <div className="text-[15px] text-zinc-100">{messageItem.content}</div>
                )}
              </div>
            </div>
          ))}
          {isLoading ? (
            <div className="bg-black px-4 py-6 sm:px-8">
              <div className="mx-auto max-w-3xl text-[15px] text-zinc-400">
                Thinking...
              </div>
            </div>
          ) : null}
          <div ref={endOfMessagesRef} />
        </main>

        {error ? (
          <div className="bg-red-900/30 px-4 py-2 text-sm text-red-300 sm:px-8">
            {error}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="mb-4 px-4 py-4 sm:px-8">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Message Men's Grooming Assistant..."
            className="mx-auto block h-11 w-full max-w-3xl rounded-full bg-zinc-800 px-4 text-sm text-white shadow-[0_6px_18px_rgba(0,0,0,0.35)] outline-none"
          />
        </form>
      </div>
    </div>
  );
}

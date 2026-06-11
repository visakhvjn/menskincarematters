"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const CAPABILITIES = [
  "Build AM/PM skincare routines for your skin type",
  "Explain ingredients like salicylic acid, niacinamide & retinol",
  "Recommend products with buy links from Flipkart, Nykaa & Amazon India",
  "Help with acne, dryness, dark spots, sunscreen & shaving irritation",
];

type MarkdownImage = {
  alt: string;
  src: string;
};

const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

function extractMarkdownImages(content: string) {
  const images: MarkdownImage[] = [];
  const text = content
    .replace(markdownImageRegex, (_, alt, src) => {
      images.push({ alt: alt || "Product image", src });
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text, images };
}

function AssistantAvatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm">
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
        <path
          d="M12 3c-2.5 0-4.5 2-4.5 4.5 0 1.2.5 2.3 1.2 3.1-.8.5-1.7 1.4-1.7 2.9V15h10v-1.5c0-1.5-.9-2.4-1.7-2.9.7-.8 1.2-1.9 1.2-3.1C16.5 5 14.5 3 12 3Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9 18h6M10 21h4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function AssistantMessage({ content }: { content: string }) {
  const { text, images } = extractMarkdownImages(content);

  return (
    <div className="markdown-content text-[15px] leading-relaxed">
      {text ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer">
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

function TypingIndicator() {
  return (
    <div className="flex items-center gap-3">
      <AssistantAvatar />
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-blue-500" />
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-blue-500" />
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-blue-500" />
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChatInput({
  input,
  isLoading,
  onInputChange,
  onSubmit,
  inputRef,
  className = "",
}: {
  input: string;
  isLoading: boolean;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  className?: string;
}) {
  return (
    <form onSubmit={onSubmit} className={`relative ${className}`}>
      <input
        ref={inputRef}
        autoFocus
        value={input}
        onChange={(event) => onInputChange(event.target.value)}
        placeholder="Ask about skincare, routines, or products..."
        disabled={isLoading}
        className="h-12 w-full rounded-2xl border border-slate-200 bg-white pr-12 pl-4 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={isLoading || !input.trim()}
        aria-label="Send message"
        className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <SendIcon />
      </button>
    </form>
  );
}

export default function Home() {
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isWelcome = messages.length === 0;

  useEffect(() => {
    if (!isWelcome) {
      endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, isWelcome]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [isWelcome]);

  async function sendMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed || isLoading) return;

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, threadId }),
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
      inputRef.current?.focus();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function startNewChat() {
    setMessages([]);
    setThreadId(undefined);
    setInput("");
    setError(null);
    setIsLoading(false);
  }

  return (
    <div className="chat-bg flex min-h-screen flex-col text-slate-800">
      <header className="sticky top-0 z-10 bg-transparent px-4 py-3 sm:px-6">
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
              <span className="text-lg font-bold text-white">M</span>
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-slate-900">
                Men&apos;s Skincare Matters
              </h1>
              <p className="text-xs text-slate-500">
                Routines, ingredients &amp; Indian product picks
              </p>
            </div>
          </div>
          {!isWelcome ? (
            <button
              type="button"
              onClick={startNewChat}
              className="rounded-lg border border-blue-200 bg-white/60 px-3 py-1.5 text-xs font-medium text-blue-700 backdrop-blur-sm transition hover:bg-white"
            >
              New chat
            </button>
          ) : null}
        </div>
      </header>

      {isWelcome ? (
        <main className="flex flex-1 flex-col items-center justify-start px-4 pt-10 pb-10 sm:px-6 sm:pt-16">
          <div className="message-enter w-full max-w-2xl">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md">
                <span className="text-2xl font-bold">M</span>
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                Hi, how can I help with your skin?
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-600 sm:text-base">
                Welcome to Men&apos;s Skincare Matters. Ask me anything about
                routines, ingredients, or products — I&apos;ll find picks you can
                buy in India.
              </p>
            </div>

            <ul className="mb-8 grid gap-1.5 sm:grid-cols-2">
              {CAPABILITIES.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs leading-relaxed text-slate-500"
                >
                  <span className="mt-0.5 text-blue-600" aria-hidden>
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            {error ? (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <ChatInput
              input={input}
              isLoading={isLoading}
              onInputChange={setInput}
              onSubmit={onSubmit}
              inputRef={inputRef}
              className="shadow-md"
            />

            <p className="mt-6 text-center text-[11px] text-slate-400">
              Not medical advice. For persistent issues, see a dermatologist.
            </p>
          </div>
        </main>
      ) : (
        <>
          <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
            <div className="mx-auto flex max-w-3xl flex-col gap-5">
              {messages.map((messageItem, index) => (
                <div
                  key={`${messageItem.role}-${index}`}
                  className={`message-enter ${
                    messageItem.role === "user"
                      ? "flex justify-end"
                      : "flex justify-start"
                  }`}
                >
                  {messageItem.role === "assistant" ? (
                    <div className="flex max-w-[92%] gap-3 sm:max-w-[85%]">
                      <AssistantAvatar />
                      <div className="min-w-0 rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
                        <AssistantMessage content={messageItem.content} />
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-blue-600 px-4 py-3 text-[15px] leading-relaxed text-white shadow-sm">
                      {messageItem.content}
                    </div>
                  )}
                </div>
              ))}

              {isLoading ? <TypingIndicator /> : null}

              <div ref={endOfMessagesRef} />
            </div>
          </main>

          <div className="sticky bottom-0 border-t border-slate-200 bg-white px-4 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] sm:px-6">
            <div className="mx-auto max-w-3xl">
              {error ? (
                <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <ChatInput
                input={input}
                isLoading={isLoading}
                onInputChange={setInput}
                onSubmit={onSubmit}
                inputRef={inputRef}
              />

              <p className="mt-2 text-center text-[11px] text-slate-400">
                Not medical advice. For persistent issues, see a dermatologist.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

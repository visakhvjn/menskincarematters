# Men's Skincare-Only Chatbot

Public Next.js + LangChainJS chatbot that only answers men's skincare questions.

## Features

- Public chat interface (no login/auth)
- Server-side domain guard for men's skincare scope
- Refuses out-of-domain questions
- Safety-oriented skincare responses (non-diagnostic guidance)

## Tech Stack

- Next.js (App Router, TypeScript)
- LangChainJS
- OpenAI via `@langchain/openai`

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.local.example .env.local
```

Add your keys to `.env.local`:

```bash
OPENAI_API_KEY=your_openai_api_key_here
SERPER_API_KEY=your_serper_api_key_here
```

`SERPER_API_KEY` is strongly recommended for production. DuckDuckGo HTML scraping often works locally but gets blocked on cloud hosts (Vercel/AWS), which breaks live web search in production.

3. Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API

`POST /api/chat`

Request body:

```json
{
  "message": "How should men with oily skin build a morning routine?",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

Response body:

```json
{
  "reply": "...",
  "inDomain": true
}
```

If out of domain, `inDomain` is `false` and `reply` returns a refusal message.

## Validation Prompts

In-domain (should answer):
- "Create a men's oily-skin routine."
- "How can men reduce razor burn from shaving?"

Out-of-domain (should refuse):
- "Write a Python function to sort arrays."
- "What is the capital of France?"

# LogLLM

A full-stack application that lets you chat with large language models and automatically records every request for monitoring. Built as part of the Olive assignment.

Live demo: https://logllm.vercel.app

---

## What it does

- Chat with Claude (Anthropic) or Gemini (Google) in a clean dark interface
- Every request is logged: latency, token counts, model used, success or error
- A dashboard shows live stats: average latency, total requests, error rate, and throughput
- You can cancel a response mid-stream and the partial text is saved
- Personal information in messages (emails, phone numbers) is redacted before logging

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Tailwind CSS, Vite |
| Backend | Node.js, Express, Apollo GraphQL |
| Database | MongoDB Atlas (Mongoose) |
| Queue | Upstash Redis + BullMQ |
| LLM providers | Anthropic Claude, Google Gemini |
| Hosting | Render (backend), Vercel (frontend) |

---

## Local setup

### Requirements

- Node.js 18+
- A MongoDB Atlas account (free tier works)
- An Upstash Redis account (free tier works)
- An Anthropic API key
- A Google Gemini API key

### Steps

1. Clone the repo

```bash
git clone https://github.com/your-username/logllm.git
cd logllm
```

2. Set up the backend

```bash
cd backend
npm install
cp .env.example .env
```

Fill in your `.env`:

```
ANTHROPIC_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/logllm
REDIS_URL=rediss://default:password@host:6379
PORT=4000
```

Start the backend:

```bash
npx ts-node-dev --respawn src/server.ts
```

3. Set up the frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

---

## Architecture overview

```
Browser
  |
  |-- GraphQL (Apollo) --> conversations, messages, dashboard stats
  |
  |-- SSE /stream -------> word-by-word token streaming
  
Backend (Express)
  |
  |-- /stream endpoint
  |     |-- saves user message to MongoDB
  |     |-- calls LLM provider (Anthropic or Gemini)
  |     |-- streams tokens back to browser via SSE
  |     |-- saves assistant message to MongoDB
  |     |-- pushes log job to Redis queue (BullMQ)
  |
  |-- BullMQ worker (same process)
  |     |-- picks up log job from Redis
  |     |-- writes InferenceLog document to MongoDB
  |
  |-- Apollo GraphQL server
        |-- reads Conversation, Message, InferenceLog from MongoDB
        |-- computes dashboard stats (aggregation queries)
```

The reason for the queue between the stream endpoint and the database write is so that logging never blocks or slows down the response to the user. The stream finishes, the job is pushed, and the user sees the response immediately. The worker handles the write in the background.

---

## Schema design

### Conversation

```
id
title       (first 50 chars of the opening message)
createdAt
```

### Message

```
id
conversationId  (ref to Conversation)
role            ("user" or "assistant")
content
createdAt
```

### InferenceLog

```
id
conversationId
model           (e.g. "claude-sonnet-4-6")
provider        ("anthropic" or "gemini")
status          ("success" or "error")
latencyMs
promptTokens
completionTokens
inputPreview    (first 200 chars, PII redacted)
outputPreview   (first 200 chars, PII redacted)
requestedAt
createdAt
```

**Why keep InferenceLog separate from Message?**

Messages are chat data. Logs are operational data. Mixing them into one document would make queries messy. For example, computing average latency would require filtering and unwrapping chat data. Keeping them separate means the dashboard can query InferenceLog with simple aggregations without touching Messages at all.

**Why store inputPreview and outputPreview instead of the full text?**

The full conversation content already lives in the Message collection. The log only needs enough context to debug a bad response or check what was sent. Capping at 200 characters keeps the InferenceLog collection small and avoids storing the same large text twice.

**Why not extend Mongoose Document on InferenceLog?**

Mongoose's Document type has a built-in `model` field that conflicts with our own `model` field (the LLM model name). Removing the `extends Document` inheritance and using `Schema<IInferenceLog>` directly avoids that TypeScript conflict without changing any runtime behavior.

---

## Tradeoffs made

**BullMQ worker runs in the same process as the web server.**
Normally these would be separate services so they can scale independently. Running them together saves one Render service slot (which matters on a free plan) but means a spike in chat traffic also affects the worker, and vice versa.

**SSE instead of WebSockets.**
Server-Sent Events are one-directional (server to client) and simpler to implement than WebSockets. For streaming tokens from a model, they are a good fit because the client never needs to push data during the stream. The tradeoff is that SSE uses HTTP/1.1 long-polling, which some proxies and CDNs can interfere with (addressed in the Kubernetes ingress config with buffering disabled and a long timeout).

**Dashboard stats are polled via GraphQL, not pushed via subscriptions.**
GraphQL subscriptions (WebSocket-based) would give real-time updates. Polling every few seconds is simpler and still feels live enough for a monitoring dashboard. The tradeoff is slightly stale data and extra queries.

**No authentication.**
Any person with the URL can read conversations and stats. Adding auth was out of scope for this project.

**PII redaction is best-effort.**
The email and phone regexes cover common formats but not every possible format. This is a reasonable starting point but not a compliance-grade solution.

---

## What I would improve with more time

1. **Authentication.** Add user accounts so conversations are private and the dashboard only shows stats for the logged-in user.

2. **Separate the worker.** Move BullMQ worker to its own process or service so it does not compete with the web server for CPU and memory.

3. **More LLM providers.** Add OpenAI and Mistral. The provider abstraction in `llm.ts` makes this straightforward to extend.

4. **Real-time dashboard.** Replace polling with GraphQL subscriptions so the dashboard updates the moment a new log is written.

5. **Per-conversation stats.** Right now the dashboard shows aggregate stats across all conversations. It would be more useful to see stats broken down by conversation or by time window.

6. **Retry logic.** If the LLM provider returns a rate limit error, the request fails immediately. A simple exponential backoff retry would make the app more resilient.

7. **Export.** Let users download a conversation as a text file or JSON.

8. **Tests.** Add unit tests for the resolver aggregations and integration tests for the stream endpoint.

---

## Project structure

```
logllm/
  backend/
    src/
      graphql/
        schema.ts       GraphQL type definitions
        resolvers.ts    Query and mutation handlers
      lib/
        llm.ts          LLM provider wrapper (Anthropic + Gemini)
        redis.ts        BullMQ queue and Redis connection
      models/
        Conversation.ts
        Message.ts
        InferenceLog.ts
      server.ts         Express app, SSE endpoint, BullMQ worker, Apollo server
    .env.example
    Dockerfile
  frontend/
    src/
      pages/
        ChatPage.tsx    Main UI (sidebar, chat, dashboard modal)
      graphql/
        queries.ts      Apollo GraphQL query definitions
      main.tsx
      App.tsx
    vercel.json         Route rewrites for Vercel deployment
    Dockerfile
  k8s/                  Kubernetes manifests for self-hosted deployment
  docker-compose.yml
  README.md
```

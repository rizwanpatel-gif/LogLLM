# Architecture Notes

---

## 1. Ingestion Flow

This is the path a single message takes from the moment the user hits send to the moment the response is fully saved.

```
USER TYPES A MESSAGE AND HITS SEND
          |
          v
+-------------------+
|   React Frontend  |
|   (Vercel)        |
|                   |
|  Opens SSE conn   |
|  GET /stream?     |
|  content=hello    |
|  provider=gemini  |
+-------------------+
          |
          | HTTP (SSE)
          v
+---------------------------+
|   Express Backend         |
|   (Render)                |
|                           |
|  1. Create Conversation   | --> MongoDB: saves { title, createdAt }
|     (if new)              |
|                           |
|  2. Save user Message     | --> MongoDB: saves { role: "user", content }
|                           |
|  3. Load full history     | <-- MongoDB: fetches all messages for context
|     from MongoDB          |
|                           |
|  4. Call LLM provider     |
+---------------------------+
          |
          | API call (HTTPS)
          v
+---------------------------+
|   LLM Provider            |
|   (Anthropic or Gemini)   |
|                           |
|   Streams tokens back     |
+---------------------------+
          |
          | token stream
          v
+---------------------------+
|   Express Backend         |
|                           |
|  5. Forward each token    | --> SSE event --> Browser (user sees words appear)
|     to browser            |
|                           |
|  6. Collect full response |
|                           |
|  7. Save assistant Message| --> MongoDB: saves { role: "assistant", content }
|                           |
|  8. Push job to Redis     | --> Redis queue (BullMQ)
|     queue                 |
+---------------------------+
          |
          | async (non-blocking)
          v
+---------------------------+
|   BullMQ Worker           |
|   (same process)          |
|                           |
|  9. Pick up job from      |
|     Redis queue           |
|                           |
| 10. Write InferenceLog    | --> MongoDB: saves latency, tokens, status, preview
+---------------------------+
```

**Key point:** Steps 1-7 happen in order during the stream. Step 8 fires the log job and the stream is done. Step 9-10 happen in the background after the user already has their response. The user never waits for the log write.

---

## 2. Logging Strategy

**What is logged**

Every request to `/stream` produces one `InferenceLog` document regardless of whether it succeeded or failed. The document records:

- How long the full response took (latency in milliseconds)
- How many tokens were used (prompt and completion)
- Which model and provider handled it
- Whether it succeeded or errored
- A short preview of what was sent and received (first 200 characters)
- When the request started

**Why a queue instead of writing directly to MongoDB**

If we wrote to MongoDB directly inside the stream handler, a slow database write would delay the moment the browser connection closes. With BullMQ, the stream handler pushes a tiny job object to Redis (fast, in-memory), closes the connection, and moves on. The worker picks up the job a moment later and does the slower MongoDB write independently.

This also means if MongoDB is temporarily down, jobs sit in the Redis queue and are retried automatically when MongoDB comes back.

**PII redaction**

Before storing the input and output previews, the code runs two regex patterns over the text to replace email addresses with `[EMAIL]` and phone numbers with `[PHONE]`. This keeps personal information out of the logs.

**Why store previews and not full text**

The full message content already lives in the `Message` collection. The log preview exists only for debugging (for example, to check what prompt caused an error). Storing the full text twice would waste space and create a situation where the log and the message could get out of sync.

---

## 3. Scaling Considerations

**What works fine at small scale (current setup)**

- Single backend instance on Render free tier handles a low volume of concurrent chats
- MongoDB Atlas free tier (512 MB) is enough for thousands of conversations
- Upstash Redis free tier handles the job queue with no issues
- BullMQ worker in the same process as the web server keeps deployment simple

**What breaks first as traffic grows**

| Bottleneck | Why it breaks | Fix |
|---|---|---|
| Single backend process | Node.js is single-threaded. Many concurrent SSE streams block each other | Run multiple backend instances behind a load balancer |
| Worker in same process | Heavy log writes compete with stream handling for CPU | Move worker to a separate service |
| MongoDB free tier | 512 MB fills up with enough conversations | Upgrade tier or archive old logs |
| No rate limiting | A single user can flood the LLM provider with requests | Add per-IP rate limiting on `/stream` |
| SSE connections | Each open chat holds an HTTP connection. Hundreds of concurrent users = hundreds of open connections | This is a known SSE limitation; WebSockets with a connection pool scale better |

**What scales naturally**

- The queue pattern means logging always stays decoupled from the hot path regardless of scale
- GraphQL dashboard queries use MongoDB aggregations which are fast even on large collections
- Adding more LLM providers requires only adding to the `PROVIDER_MODELS` map in `llm.ts`

---

## 4. Failure Handling Assumptions

**LLM provider returns an error**

The stream handler catches the error, writes `data: {"type":"error","message":"Stream failed"}` to the SSE connection, and closes it. The browser shows an error state. The BullMQ job is still pushed with `status: "error"` so the failure shows up in the dashboard error rate.

**User closes the browser tab mid-stream**

The browser closes the SSE connection. The backend detects this via the `req.on('close')` event and fires the `AbortController`. The LLM stream is aborted. If any tokens arrived before the abort, the partial text is saved as an assistant message with `[cancelled]` appended so the conversation history is not left in a broken state.

**MongoDB is down**

If MongoDB is down when the request starts, the stream handler cannot save the user message or load history, so it throws and the user sees an error. If MongoDB goes down after the stream starts but before the log write, the BullMQ job will fail and retry automatically (BullMQ default is 3 retries with exponential backoff). The conversation message write will also fail on retry but there is no retry for that step currently.

**Redis is down**

BullMQ cannot queue the log job. The `logQueue.add()` call in the `finally` block will throw. This error is not currently surfaced to the user because it happens in `finally` after the response is already sent. The log for that request is lost. The chat itself still works because Redis is only used for the log queue, not for the main conversation flow.

**Assumption about consistency**

The system assumes that losing an occasional log is acceptable. The chat messages in MongoDB are the source of truth. The inference logs are supplementary observability data. This is a deliberate tradeoff: making logging non-blocking means it can fail silently without affecting the user experience.

---

## Submission

**GitHub repo:** https://github.com/your-username/logllm

**Demo:** https://logllm.vercel.app

**Stack summary:** React + TypeScript + Tailwind on Vercel, Node.js + Express + Apollo GraphQL on Render, MongoDB Atlas, Upstash Redis, BullMQ, Anthropic Claude and Google Gemini

**Architecture notes:** This document (ARCHITECTURE.md)

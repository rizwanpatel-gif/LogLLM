import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { typeDefs } from './graphql/schema';
import { resolvers } from './graphql/resolvers';
import { streamChat, ChatMessage, Provider } from './lib/llm';
import Message from './models/Message';
import { Worker } from 'bullmq';
import { redisConnection } from './lib/redis';
import InferenceLog from './models/InferenceLog';
import Conversation from './models/Conversation';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/logllm');
  console.log('MongoDB connected');

  // BullMQ worker runs in the same process
  const worker = new Worker('inference-logs', async (job) => {
    const { conversationId, latencyMs, promptTokens, completionTokens, model, provider, status, requestedAt, inputPreview, outputPreview } = job.data;
    await InferenceLog.create({ conversationId, latencyMs, promptTokens, completionTokens, model, provider, status, requestedAt, inputPreview, outputPreview });
    console.log(`Logged [${status}] ${provider}/${model} — ${latencyMs}ms`);
  }, { connection: redisConnection });
  worker.on('failed', (job, err) => console.error(`Job ${job?.id} failed:`, err.message));
  console.log('BullMQ worker started');

  const app = express();
  app.use(cors());
  app.use(express.json());

  // SSE streaming endpoint — supports provider selection + cancellation
  app.get('/stream', async (req, res) => {
    const { conversationId, content, provider = 'anthropic' } = req.query as {
      conversationId?: string;
      content?: string;
      provider?: Provider;
    };

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // AbortController lets client cancel mid-stream
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    let convId = conversationId;

    if (!convId) {
      const conv = await Conversation.create({ title: content.slice(0, 50) });
      convId = conv._id.toString();
      res.write(`data: ${JSON.stringify({ type: 'conversation', conversationId: convId })}\n\n`);
    }

    await Message.create({ conversationId: convId, role: 'user', content });

    const history = await Message.find({ conversationId: convId }).sort({ createdAt: 1 });
    const messages: ChatMessage[] = history.map(m => ({ role: m.role, content: m.content }));

    let fullResponse = '';

    try {
      fullResponse = await streamChat(
        messages,
        convId,
        provider,
        (token) => {
          if (!abortController.signal.aborted) {
            res.write(`data: ${JSON.stringify({ type: 'token', text: token })}\n\n`);
          }
        },
        abortController.signal
      );

      if (!abortController.signal.aborted) {
        await Message.create({ conversationId: convId, role: 'assistant', content: fullResponse });
        res.write(`data: ${JSON.stringify({ type: 'done', conversationId: convId })}\n\n`);
      } else {
        // Save partial response on cancel
        if (fullResponse) {
          await Message.create({ conversationId: convId, role: 'assistant', content: fullResponse + ' [cancelled]' });
        }
        res.write(`data: ${JSON.stringify({ type: 'cancelled' })}\n\n`);
      }
    } catch (err) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream failed' })}\n\n`);
    } finally {
      res.end();
    }
  });

  const apollo = new ApolloServer({ typeDefs, resolvers });
  await apollo.start();
  app.use('/graphql', expressMiddleware(apollo));

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

main().catch(console.error);

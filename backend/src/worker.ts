import 'dotenv/config';
import mongoose from 'mongoose';
import { Worker } from 'bullmq';
import { redisConnection } from './lib/redis';
import InferenceLog from './models/InferenceLog';

async function startWorker() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/logllm');
  console.log('Worker: MongoDB connected');

  const worker = new Worker(
    'inference-logs',
    async (job) => {
      const {
        conversationId, latencyMs, promptTokens, completionTokens,
        model, provider, status, requestedAt, inputPreview, outputPreview,
      } = job.data;

      await InferenceLog.create({
        conversationId,
        latencyMs,
        promptTokens,
        completionTokens,
        model,
        provider,
        status,
        requestedAt,
        inputPreview,
        outputPreview,
      });

      console.log(`Logged [${status}] ${model} — ${latencyMs}ms | in:${promptTokens} out:${completionTokens} tokens`);
    },
    { connection: redisConnection }
  );

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
  });

  console.log('BullMQ worker started');
}

startWorker().catch(console.error);

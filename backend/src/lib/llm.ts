import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logQueue } from './redis';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(\+?1[\s\-.]?)?(\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})/g;

function redact(text: string): string {
  return text.replace(EMAIL_REGEX, '[EMAIL]').replace(PHONE_REGEX, '[PHONE]');
}

export type Provider = 'anthropic' | 'gemini';

export const PROVIDER_MODELS: Record<Provider, string> = {
  anthropic: 'claude-sonnet-4-6',
  gemini: 'gemini-1.5-flash',
};

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function streamChat(
  messages: ChatMessage[],
  conversationId: string,
  provider: Provider,
  onToken: (token: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const model = PROVIDER_MODELS[provider];
  const requestedAt = new Date();
  const start = Date.now();
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content ?? '';

  let fullText = '';
  let promptTokens = 0;
  let completionTokens = 0;
  let status: 'success' | 'error' = 'success';

  try {
    if (provider === 'anthropic') {
      const stream = anthropic.messages.stream({
        model,
        max_tokens: 1024,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      });

      // Abort anthropic stream when signal fires
      signal?.addEventListener('abort', () => stream.abort());

      for await (const chunk of stream) {
        if (signal?.aborted) break;
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          fullText += chunk.delta.text;
          onToken(chunk.delta.text);
        }
      }

      if (!signal?.aborted) {
        const final = await stream.finalMessage();
        promptTokens = final.usage.input_tokens;
        completionTokens = final.usage.output_tokens;
      }

    } else if (provider === 'gemini') {
      const geminiModel = gemini.getGenerativeModel({ model });

      // Gemini uses 'model' role, not 'assistant'
      const history = messages.slice(0, -1).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const chat = geminiModel.startChat({ history });
      const result = await chat.sendMessageStream(lastUserMessage);

      for await (const chunk of result.stream) {
        if (signal?.aborted) break;
        const text = chunk.text();
        if (text) {
          fullText += text;
          onToken(text);
        }
      }

      if (!signal?.aborted) {
        const response = await result.response;
        promptTokens = response.usageMetadata?.promptTokenCount ?? 0;
        completionTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
      }
    }
  } catch (err: any) {
    if (signal?.aborted || err?.name === 'AbortError') {
      // client cancelled — not an error, keep status success
    } else {
      status = 'error';
      throw err;
    }
  } finally {
    const latencyMs = Date.now() - start;
    await logQueue.add('log', {
      conversationId,
      latencyMs,
      promptTokens,
      completionTokens,
      model,
      provider,
      status,
      requestedAt,
      inputPreview: redact(lastUserMessage).slice(0, 200),
      outputPreview: redact(fullText).slice(0, 200),
    });
  }

  return fullText;
}

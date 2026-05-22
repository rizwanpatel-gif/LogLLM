import Anthropic from '@anthropic-ai/sdk';
import { logQueue } from './redis';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(\+?1[\s\-.]?)?(\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})/g;

function redact(text: string): string {
  return text.replace(EMAIL_REGEX, '[EMAIL]').replace(PHONE_REGEX, '[PHONE]');
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function streamChat(
  messages: ChatMessage[],
  conversationId: string,
  onToken: (token: string) => void
): Promise<string> {
  const model = 'claude-sonnet-4-6';
  const requestedAt = new Date();
  const start = Date.now();

  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content ?? '';

  let fullText = '';
  let promptTokens = 0;
  let completionTokens = 0;
  let status: 'success' | 'error' = 'success';

  try {
    const stream = await client.messages.stream({
      model,
      max_tokens: 1024,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        fullText += chunk.delta.text;
        onToken(chunk.delta.text);
      }
    }

    const finalMessage = await stream.finalMessage();
    promptTokens = finalMessage.usage.input_tokens;
    completionTokens = finalMessage.usage.output_tokens;
  } catch (err) {
    status = 'error';
    throw err;
  } finally {
    const latencyMs = Date.now() - start;
    await logQueue.add('log', {
      conversationId,
      latencyMs,
      promptTokens,
      completionTokens,
      model,
      provider: 'anthropic',
      status,
      requestedAt,
      inputPreview: redact(lastUserMessage).slice(0, 200),
      outputPreview: redact(fullText).slice(0, 200),
    });
  }

  return fullText;
}

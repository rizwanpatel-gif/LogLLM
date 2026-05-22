import mongoose, { Schema } from 'mongoose';

export interface IInferenceLog {
  conversationId: mongoose.Types.ObjectId;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  model: string;
  provider: string;
  status: 'success' | 'error';
  inputPreview: string;
  outputPreview: string;
  requestedAt: Date;
  createdAt: Date;
}

const InferenceLogSchema = new Schema<IInferenceLog>({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  latencyMs: { type: Number, required: true },
  promptTokens: { type: Number, default: 0 },
  completionTokens: { type: Number, default: 0 },
  model: { type: String, required: true },
  provider: { type: String, required: true },
  status: { type: String, enum: ['success', 'error'], required: true },
  inputPreview: { type: String, default: '' },
  outputPreview: { type: String, default: '' },
  requestedAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IInferenceLog>('InferenceLog', InferenceLogSchema);

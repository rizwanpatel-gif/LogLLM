import mongoose, { Schema, Document } from 'mongoose';

export interface IConversation extends Document {
  title: string;
  createdAt: Date;
}

const ConversationSchema = new Schema<IConversation>({
  title: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IConversation>('Conversation', ConversationSchema);

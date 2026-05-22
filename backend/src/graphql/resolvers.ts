import Conversation from '../models/Conversation';
import Message from '../models/Message';
import InferenceLog from '../models/InferenceLog';

export const resolvers = {
  Query: {
    conversations: async () => {
      const convs = await Conversation.find().sort({ createdAt: -1 });
      return convs.map(c => ({ ...c.toObject(), id: c._id.toString() }));
    },

    messages: async (_: unknown, { conversationId }: { conversationId: string }) => {
      const msgs = await Message.find({ conversationId }).sort({ createdAt: 1 });
      return msgs.map(m => ({ ...m.toObject(), id: m._id.toString(), conversationId: m.conversationId.toString() }));
    },

    dashboardStats: async () => {
      const total = await InferenceLog.countDocuments();
      const errors = await InferenceLog.countDocuments({ status: 'error' });
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const lastHourCount = await InferenceLog.countDocuments({ createdAt: { $gte: oneHourAgo } });
      const agg = await InferenceLog.aggregate([
        { $group: { _id: null, avg: { $avg: '$latencyMs' } } },
      ]);
      return {
        avgLatencyMs: agg[0]?.avg ?? 0,
        totalRequests: total,
        errorRate: total > 0 ? (errors / total) * 100 : 0,
        throughputPerMinute: parseFloat((lastHourCount / 60).toFixed(2)),
      };
    },
  },

  Mutation: {
    sendMessage: async (_: unknown, { conversationId, content }: { conversationId?: string; content: string }) => {
      let convId = conversationId;

      if (!convId) {
        const title = content.slice(0, 50) || 'New Conversation';
        const conv = await Conversation.create({ title });
        convId = conv._id.toString();
      }

      const userMsg = await Message.create({ conversationId: convId, role: 'user', content });
      return { ...userMsg.toObject(), id: userMsg._id.toString(), conversationId: convId };
    },

    deleteConversation: async (_: unknown, { id }: { id: string }) => {
      await Conversation.findByIdAndDelete(id);
      await Message.deleteMany({ conversationId: id });
      return true;
    },
  },
};

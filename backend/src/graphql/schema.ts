export const typeDefs = `#graphql
  type Conversation {
    id: ID!
    title: String!
    createdAt: String!
  }

  type Message {
    id: ID!
    conversationId: ID!
    role: String!
    content: String!
    createdAt: String!
  }

  type DashboardStats {
    avgLatencyMs: Float!
    totalRequests: Int!
    errorRate: Float!
  }

  type Query {
    conversations: [Conversation!]!
    messages(conversationId: ID!): [Message!]!
    dashboardStats: DashboardStats!
  }

  type Mutation {
    sendMessage(conversationId: ID, content: String!): Message!
    deleteConversation(id: ID!): Boolean!
  }
`;

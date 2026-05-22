import { gql } from '@apollo/client';

export const GET_CONVERSATIONS = gql`
  query GetConversations {
    conversations {
      id
      title
      createdAt
    }
  }
`;

export const GET_MESSAGES = gql`
  query GetMessages($conversationId: ID!) {
    messages(conversationId: $conversationId) {
      id
      role
      content
      createdAt
    }
  }
`;

export const GET_DASHBOARD_STATS = gql`
  query GetDashboardStats {
    dashboardStats {
      avgLatencyMs
      totalRequests
      errorRate
      throughputPerMinute
    }
  }
`;

export const DELETE_CONVERSATION = gql`
  mutation DeleteConversation($id: ID!) {
    deleteConversation(id: $id)
  }
`;

export const SEND_MESSAGE = gql`
  mutation SendMessage($conversationId: ID, $content: String!) {
    sendMessage(conversationId: $conversationId, content: $content) {
      id
      conversationId
      role
      content
      createdAt
    }
  }
`;

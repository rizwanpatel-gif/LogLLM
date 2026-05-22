import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useApolloClient } from '@apollo/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  GET_CONVERSATIONS,
  GET_MESSAGES,
  GET_DASHBOARD_STATS,
  DELETE_CONVERSATION,
} from '../graphql/queries';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
}

export default function ChatPage() {
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const apolloClient = useApolloClient();

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const { data: convsData, refetch: refetchConvs } = useQuery<{ conversations: Conversation[] }>(
    GET_CONVERSATIONS
  );
  const { data: msgsData } = useQuery(GET_MESSAGES, {
    variables: { conversationId: activeConvId },
    skip: !activeConvId || streaming,  // don't overwrite local state mid-stream
  });
  const { data: statsData } = useQuery<{
    dashboardStats: { avgLatencyMs: number; totalRequests: number; errorRate: number };
  }>(GET_DASHBOARD_STATS, { pollInterval: 10000 });

  const [deleteConversation] = useMutation(DELETE_CONVERSATION, {
    onCompleted: () => {
      refetchConvs();
      setActiveConvId(null);
      setMessages([]);
    },
  });

  useEffect(() => {
    if (msgsData?.messages) setMessages(msgsData.messages);
  }, [msgsData]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function startNewChat() {
    setActiveConvId(null);
    setMessages([]);
    setInput('');
  }

  async function sendMessage() {
    if (!input.trim() || streaming) return;

    const userText = input.trim();
    setInput('');
    setStreaming(true);

    const userId = `u-${Date.now()}`;
    const assistantId = `a-${Date.now() + 1}`;

    setMessages(prev => [
      ...prev,
      { id: userId, role: 'user' as const, content: userText },
      { id: assistantId, role: 'assistant' as const, content: '' },
    ]);

    const params = new URLSearchParams({ content: userText });
    if (activeConvId) params.set('conversationId', activeConvId);

    const es = new EventSource(`/stream?${params.toString()}`);

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'conversation') {
        setActiveConvId(data.conversationId);
        apolloClient.refetchQueries({ include: [GET_CONVERSATIONS] });
      } else if (data.type === 'token') {
        setMessages(prev =>
          prev.map((m, i) => i === prev.length - 1 ? { ...m, content: m.content + data.text } : m)
        );
      } else if (data.type === 'done') {
        if (!activeConvId) setActiveConvId(data.conversationId);
        apolloClient.refetchQueries({ include: [GET_CONVERSATIONS, GET_DASHBOARD_STATS] });
        es.close();
        setStreaming(false);
      } else if (data.type === 'error') {
        es.close();
        setStreaming(false);
      }
    };
    es.onerror = () => { es.close(); setStreaming(false); };
  }

  const stats = statsData?.dashboardStats;

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0f0f0f', color: '#e2e2e2', overflow: 'hidden', fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>

      {/* Mobile backdrop */}
      {isMobile && sidebarOpen && (
        <div
          onClick={closeSidebar}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 30 }}
        />
      )}

      {/* ── Sidebar ── */}
      <div style={{
        width: 220,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid #1e1e1e',
        ...(isMobile ? {
          position: 'fixed',
          top: 0, left: 0, bottom: 0,
          zIndex: 40,
          background: '#0f0f0f',
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.22s ease',
        } : {}),
      }}>

        {/* Logo */}
        <div style={{ height: 48, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid #1e1e1e' }}>
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em' }}>LogLLM</span>
        </div>

        {/* New chat */}
        <div style={{ padding: '10px 12px' }}>
          <button
            onClick={startNewChat}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'none', border: 'none', color: '#8a8a8a', cursor: 'pointer', borderRadius: 6, fontSize: 13 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#1a1a1a'; (e.currentTarget as HTMLButtonElement).style.color = '#e2e2e2'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#8a8a8a'; }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
            New conversation
          </button>
        </div>

        {/* Conversations */}
        <div style={{ padding: '0 12px', marginBottom: 4 }}>
          <p style={{ padding: '8px 8px 4px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#444', fontWeight: 600, margin: 0 }}>
            Conversations
          </p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
          {convsData?.conversations.map(conv => (
            <div
              key={conv.id}
              style={{
                display: 'flex', alignItems: 'center', borderRadius: 6, marginBottom: 2, cursor: 'pointer',
                background: activeConvId === conv.id ? '#1e1e1e' : 'transparent',
              }}
              onMouseEnter={e => { if (activeConvId !== conv.id) (e.currentTarget as HTMLDivElement).style.background = '#161616'; }}
              onMouseLeave={e => { if (activeConvId !== conv.id) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            >
              <button
                onClick={() => { setActiveConvId(conv.id); setMessages([]); closeSidebar(); }}
                style={{ flex: 1, textAlign: 'left', padding: '7px 8px', background: 'none', border: 'none', color: activeConvId === conv.id ? '#e2e2e2' : '#8a8a8a', fontSize: 13, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {conv.title}
              </button>
              <button
                onClick={e => { e.stopPropagation(); deleteConversation({ variables: { id: conv.id } }); }}
                style={{ padding: '4px 8px', background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#e06c75'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#444'}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* ── Inference Stats ── */}
        <div style={{ borderTop: '1px solid #1e1e1e', padding: '14px 12px' }}>
          <p style={{ margin: '0 0 10px 8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#555', fontWeight: 600 }}>
            Inference Stats
          </p>
          <StatRow label="Avg latency" value={stats ? `${Math.round(stats.avgLatencyMs)}ms` : '—'} />
          <StatRow label="Total requests" value={stats ? String(stats.totalRequests) : '—'} />
          <StatRow
            label="Error rate"
            value={stats ? `${stats.errorRate.toFixed(1)}%` : '—'}
            warn={(stats?.errorRate ?? 0) > 5}
          />
        </div>
      </div>

      {/* ── Main chat ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Header */}
        <div style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid #1e1e1e', flexShrink: 0, gap: 10 }}>
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(true)}
              style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '4px 6px', flexShrink: 0, display: 'flex', alignItems: 'center' }}
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
          <span style={{ fontSize: 13, color: '#555', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {activeConvId
              ? convsData?.conversations.find(c => c.id === activeConvId)?.title ?? 'Chat'
              : 'New conversation'}
          </span>
          <button
            onClick={() => setShowDashboard(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#5e6ad2', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', letterSpacing: '-0.01em', flexShrink: 0 }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#6872d8'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#5e6ad2'}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Dashboard
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '20px 16px' : '28px 40px' }}>
          {messages.length === 0 && (
            <p style={{ color: '#333', fontSize: 14, marginTop: 8 }}>Send a message to start</p>
          )}
          {messages.map(msg => (
            <div key={msg.id} style={{ marginBottom: 32 }}>
              <p style={{
                margin: '0 0 6px 0',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: msg.role === 'user' ? '#5e6ad2' : '#555',
              }}>
                {msg.role === 'user' ? 'You' : 'Claude'}
              </p>
              <p style={{
                margin: 0,
                fontSize: 15,
                lineHeight: 1.75,
                whiteSpace: 'pre-wrap',
                color: '#e2e2e2',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {msg.content}
                {msg.role === 'assistant' && msg.content === '' && (
                  <span style={{ display: 'inline-block', width: 8, height: 16, background: '#5e6ad2', marginLeft: 4, verticalAlign: 'middle', animation: 'pulse 1s infinite' }} />
                )}
              </p>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: isMobile ? '0 12px 16px' : '0 28px 20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, border: '1px solid #2a2a2a', borderRadius: 10, background: '#161616', padding: '12px 16px' }}>
            <textarea
              rows={1}
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#e2e2e2', fontSize: 15, resize: 'none', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6 }}
              placeholder="Ask anything..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              disabled={streaming}
            />
            <button
              onClick={sendMessage}
              disabled={streaming || !input.trim()}
              style={{ flexShrink: 0, padding: '6px 16px', background: streaming || !input.trim() ? '#2a2a2a' : '#5e6ad2', border: 'none', borderRadius: 6, color: streaming || !input.trim() ? '#555' : '#fff', fontSize: 13, fontWeight: 600, cursor: streaming || !input.trim() ? 'not-allowed' : 'pointer' }}
            >
              {streaming ? '...' : 'Send'}
            </button>
          </div>
          <p style={{ marginTop: 6, fontSize: 11, color: '#2e2e2e' }}>Enter to send · Shift+Enter for newline</p>
        </div>
      </div>

      {/* ── Dashboard Modal ── */}
      {showDashboard && (
        <DashboardModal stats={stats} onClose={() => setShowDashboard(false)} />
      )}
    </div>
  );
}

function StatRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px' }}>
      <span style={{ fontSize: 12, color: '#888' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: warn ? '#e06c75' : '#5e6ad2' }}>
        {value}
      </span>
    </div>
  );
}

function DashboardModal({
  stats,
  onClose,
}: {
  stats: { avgLatencyMs: number; totalRequests: number; errorRate: number } | undefined;
  onClose: () => void;
}) {
  const total = stats?.totalRequests ?? 0;
  const errors = Math.round(((stats?.errorRate ?? 0) / 100) * total);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: 12, width: 600, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', padding: 24, fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
      >
        {/* Modal header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#e2e2e2' }}>Dashboard</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#555' }}>Inference log overview</p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: '4px 8px', borderRadius: 6 }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#e2e2e2'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#555'}
          >
            ×
          </button>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: '#1e1e1e', border: '1px solid #1e1e1e', borderRadius: 8, marginBottom: 20, overflow: 'hidden' }}>
          <ModalStatCard label="Avg latency" value={`${Math.round(stats?.avgLatencyMs ?? 0)}ms`} />
          <ModalStatCard label="Total requests" value={String(total)} />
          <ModalStatCard label="Error rate" value={`${(stats?.errorRate ?? 0).toFixed(1)}%`} warn={(stats?.errorRate ?? 0) > 5} />
        </div>

        {/* Charts */}
        <div style={{ border: '1px solid #1e1e1e', borderRadius: 8, marginBottom: 12 }}>
          <p style={{ margin: 0, padding: '10px 16px', borderBottom: '1px solid #1e1e1e', fontSize: 12, color: '#888', fontWeight: 500 }}>
            Avg latency (ms)
          </p>
          <div style={{ padding: '12px 8px' }}>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={[{ name: 'Avg latency', value: Math.round(stats?.avgLatencyMs ?? 0) }]} barSize={48}>
                <CartesianGrid strokeDasharray="2 4" stroke="#1e1e1e" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#555', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#555', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#1a1a1a' }} contentStyle={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: 4, fontSize: 11 }} itemStyle={{ color: '#e2e2e2' }} labelStyle={{ color: '#888' }} />
                <Bar dataKey="value" fill="#5e6ad2" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ border: '1px solid #1e1e1e', borderRadius: 8 }}>
          <p style={{ margin: 0, padding: '10px 16px', borderBottom: '1px solid #1e1e1e', fontSize: 12, color: '#888', fontWeight: 500 }}>
            Request breakdown
          </p>
          <div style={{ padding: '12px 8px' }}>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={[{ name: 'Total', value: total }, { name: 'Success', value: total - errors }, { name: 'Errors', value: errors }]} barSize={40}>
                <CartesianGrid strokeDasharray="2 4" stroke="#1e1e1e" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#555', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#555', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#1a1a1a' }} contentStyle={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: 4, fontSize: 11 }} itemStyle={{ color: '#e2e2e2' }} labelStyle={{ color: '#888' }} />
                <Bar dataKey="value" fill="#5e6ad2" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <p style={{ margin: '14px 0 0', fontSize: 11, color: '#333', textAlign: 'center' }}>
          Click outside or × to close · Stats refresh every 10s
        </p>
      </div>
    </div>
  );
}

function ModalStatCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ background: '#0f0f0f', padding: '16px 20px' }}>
      <p style={{ margin: '0 0 6px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#555', fontWeight: 600 }}>{label}</p>
      <p style={{ margin: 0, fontSize: 24, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: warn ? '#e06c75' : '#5e6ad2' }}>{value}</p>
    </div>
  );
}

import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { GET_DASHBOARD_STATS } from '../graphql/queries';

export default function DashboardPage() {
  const { data, loading } = useQuery<{
    dashboardStats: { avgLatencyMs: number; totalRequests: number; errorRate: number };
  }>(GET_DASHBOARD_STATS, { pollInterval: 10000 });

  const stats = data?.dashboardStats;
  const total = stats?.totalRequests ?? 0;
  const errors = Math.round(((stats?.errorRate ?? 0) / 100) * total);

  const barData = [
    { name: 'Avg latency', value: Math.round(stats?.avgLatencyMs ?? 0), unit: 'ms' },
  ];

  const requestData = [
    { name: 'Total', value: total },
    { name: 'Success', value: total - errors },
    { name: 'Errors', value: errors },
  ];

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-[#e2e2e2] font-sans">
      <div className="max-w-3xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-sm font-semibold tracking-tight">Dashboard</h1>
            <p className="text-xs text-[#4a4a4a] mt-0.5">Inference log overview</p>
          </div>
          <Link
            to="/"
            className="text-xs text-[#4a4a4a] hover:text-[#8a8a8a] transition-colors"
          >
            ← Back to chat
          </Link>
        </div>

        {loading && <p className="text-xs text-[#4a4a4a]">Loading...</p>}

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-px bg-[#1e1e1e] rounded border border-[#1e1e1e] mb-6 overflow-hidden">
          <StatCard label="Avg latency" value={`${Math.round(stats?.avgLatencyMs ?? 0)}ms`} />
          <StatCard label="Total requests" value={String(total)} />
          <StatCard
            label="Error rate"
            value={`${(stats?.errorRate ?? 0).toFixed(1)}%`}
            warn={(stats?.errorRate ?? 0) > 5}
          />
        </div>

        {/* Latency chart */}
        <div className="border border-[#1e1e1e] rounded mb-4">
          <div className="px-4 py-3 border-b border-[#1e1e1e]">
            <p className="text-xs font-medium text-[#8a8a8a]">Average latency (ms)</p>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={barData} barSize={40}>
                <CartesianGrid strokeDasharray="2 4" stroke="#1e1e1e" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#4a4a4a', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#4a4a4a', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: '#1a1a1a' }}
                  contentStyle={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: 4, fontSize: 11 }}
                  labelStyle={{ color: '#8a8a8a' }}
                  itemStyle={{ color: '#e2e2e2' }}
                />
                <Bar dataKey="value" fill="#5e6ad2" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Requests chart */}
        <div className="border border-[#1e1e1e] rounded">
          <div className="px-4 py-3 border-b border-[#1e1e1e]">
            <p className="text-xs font-medium text-[#8a8a8a]">Request breakdown</p>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={requestData} barSize={40}>
                <CartesianGrid strokeDasharray="2 4" stroke="#1e1e1e" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#4a4a4a', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#4a4a4a', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: '#1a1a1a' }}
                  contentStyle={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: 4, fontSize: 11 }}
                  labelStyle={{ color: '#8a8a8a' }}
                  itemStyle={{ color: '#e2e2e2' }}
                />
                <Bar dataKey="value" fill="#5e6ad2" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="bg-[#0f0f0f] px-5 py-4">
      <p className="text-[10px] uppercase tracking-widest text-[#4a4a4a] mb-2">{label}</p>
      <p className={`text-2xl font-semibold font-mono tracking-tight ${warn ? 'text-[#e06c75]' : 'text-[#e2e2e2]'}`}>
        {value}
      </p>
    </div>
  );
}

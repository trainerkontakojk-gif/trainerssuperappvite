import { Link } from '@tanstack/react-router';
import { ArrowRight, Sparkles, Activity, Users, BarChart3, Shield, History } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { APP_MODULES } from '../lib/app-config';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

const trendData = [
  { month: 'Jan', defects: 45, agents: 28 },
  { month: 'Feb', defects: 52, agents: 30 },
  { month: 'Mar', defects: 38, agents: 32 },
  { month: 'Apr', defects: 41, agents: 29 },
  { month: 'May', defects: 33, agents: 35 },
  { month: 'Jun', defects: 29, agents: 33 },
];

const serviceData = [
  { name: 'Call', score: 87 },
  { name: 'Chat', score: 92 },
  { name: 'Email', score: 78 },
  { name: 'CSO', score: 84 },
  { name: 'BKO', score: 90 },
];

const pieData = [
  { name: 'Critical', value: 35, color: '#ef4444' },
  { name: 'Non-Critical', value: 65, color: '#94a3b8' },
];

export default function DashboardPage() {
  const profile = useAuthStore((s) => s.profile);

  const visibleModules = APP_MODULES.filter(
    (m) => !m.allowedRoles || m.allowedRoles.includes(profile?.role?.toLowerCase() || '')
  );

  const displayName = profile?.full_name || 'User';

  return (
    <div className="space-y-8">
      {/* Hero Card */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
          <div className="p-8 lg:p-10">
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-indigo-700">
              <Sparkles className="h-3.5 w-3.5" />
              Pusat Kendali
            </div>
            <h2 className="mt-6 text-3xl font-bold tracking-tight lg:text-4xl">
              Halo, {displayName}.
            </h2>
            <p className="mt-3 text-base text-gray-500 max-w-xl leading-relaxed">
              Pantau tren performa layanan utama, evaluasi aktivitas harian staf, dan gunakan perangkat manajemen dalam satu platform.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/sidak/dashboard" className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-semibold hover:bg-gray-100 transition">
                <BarChart3 className="h-4 w-4 text-indigo-600" />
                Dashboard SIDAK
              </Link>
              <Link to="/monitoring" className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-semibold hover:bg-gray-100 transition">
                <Activity className="h-4 w-4 text-indigo-600" />
                Monitoring
              </Link>
            </div>
          </div>
          <div className="border-t lg:border-t-0 lg:border-l border-gray-100 bg-gray-50/50 p-8 lg:p-10">
            <p className="mb-4 text-xs font-bold uppercase tracking-wider text-gray-400">Ringkasan</p>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Total Agen', value: '128', icon: Users, color: 'text-blue-600', bg: 'bg-blue-100' },
                { label: 'Total Temuan', value: '238', icon: Shield, color: 'text-red-600', bg: 'bg-red-100' },
                { label: 'Rata-rata Skor', value: '86.4', icon: BarChart3, color: 'text-emerald-600', bg: 'bg-emerald-100' },
                { label: 'Audit Aktif', value: '12', icon: Activity, color: 'text-violet-600', bg: 'bg-violet-100' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border bg-white p-4">
                  <div className={`w-8 h-8 rounded-lg ${stat.bg} ${stat.color} flex items-center justify-center mb-2`}>
                    <stat.icon className="h-4 w-4" />
                  </div>
                  <p className="text-xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-xs text-gray-500">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Module Showcase */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Workspace Terpadu</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {visibleModules.map((module) => (
            <Link
              key={module.id}
              to={module.href}
              className="group flex flex-col rounded-xl border bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className={`w-10 h-10 rounded-lg ${module.accentSoftClassName} ${module.accentClassName} flex items-center justify-center mb-3`}>
                <module.icon className="h-5 w-5" />
              </div>
              <h4 className="text-sm font-bold text-gray-900">{module.shortTitle}</h4>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed flex-1">{module.description}</p>
              <div className="mt-3 text-xs font-semibold text-indigo-600 opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
                Buka <ArrowRight className="h-3 w-3" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-1">Tren Temuan (6 Bulan)</h3>
          <p className="text-xs text-gray-500 mb-4">Jumlah temuan dan agen per bulan</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="defects" fill="#6366f1" radius={[4, 4, 0, 0]} name="Temuan" />
              <Bar dataKey="agents" fill="#a5b4fc" radius={[4, 4, 0, 0]} name="Agen" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Score by Service */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-1">Skor per Layanan</h3>
          <p className="text-xs text-gray-500 mb-4">Rata-rata skor QA berdasarkan layanan</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={serviceData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={50} />
              <Tooltip />
              <Bar dataKey="score" fill="#6366f1" radius={[0, 4, 4, 0]} name="Skor" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-1">Distribusi Temuan</h3>
          <p className="text-xs text-gray-500 mb-4">Perbandingan critical vs non-critical</p>
          <div className="flex items-center justify-center h-60">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, percent }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                  {pieData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-1">Tren Skor Bulanan</h3>
          <p className="text-xs text-gray-500 mb-4">Rata-rata skor QA per bulan</p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="defects" stroke="#6366f1" strokeWidth={2} name="Skor" dot={{ fill: '#6366f1' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

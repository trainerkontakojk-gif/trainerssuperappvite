import { useApi } from '../../hooks/useApi';
import type { DashboardData } from '@trainers/types';
import { BarChart3, TrendingDown, Users, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function SidakDashboardPage() {
  const { data, loading } = useApi<DashboardData>('/sidak/dashboard');

  if (loading) return <div className="p-8 text-center text-gray-500">Loading dashboard...</div>;
  if (!data) return <div className="p-8 text-center text-gray-500">No data available</div>;

  const s = data.summary;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">QA Dashboard</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={Users} label="Total Agents" value={s?.totalAgents ?? 0} color="text-blue-600" bg="bg-blue-50" />
        <MetricCard icon={AlertTriangle} label="Total Defects" value={s?.totalDefects ?? 0} color="text-red-600" bg="bg-red-50" />
        <MetricCard icon={TrendingDown} label="Avg Defects/Audit" value={s?.avgDefectsPerAudit?.toFixed(2) ?? '0'} color="text-amber-600" bg="bg-amber-50" />
        <MetricCard icon={CheckCircle2} label="Zero Error Rate" value={`${s?.zeroErrorRate?.toFixed(1) ?? 0}%`} color="text-green-600" bg="bg-green-50" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h3 className="font-semibold mb-4">Score Overview</h3>
          <div className="space-y-3">
            <ScoreBar label="Avg Agent Score" value={s?.avgAgentScore ?? 0} />
            <ScoreBar label="Compliance Rate" value={s?.complianceRate ?? 0} />
            <div className="text-sm text-gray-500 mt-2">
              {s?.complianceCount ?? 0} agents comply (&ge;95 score)
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h3 className="font-semibold mb-4">Service Comparison</h3>
          {data.serviceData.length === 0 ? (
            <p className="text-gray-400 text-sm">No data</p>
          ) : (
            <div className="space-y-2">
              {data.serviceData.map((svc) => (
                <div key={svc.serviceType} className="flex items-center justify-between text-sm">
                  <span>{svc.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${svc.severity === 'Critical' ? 'bg-red-500' : svc.severity === 'High' ? 'bg-amber-500' : 'bg-blue-500'}`}
                        style={{ width: `${Math.min(100, (svc.total / (Math.max(...data.serviceData.map(d => d.total), 1))) * 100)}%` }}
                      />
                    </div>
                    <span className="font-medium w-8 text-right">{svc.total}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {data.topAgents.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h3 className="font-semibold mb-4">Top Agents by Defects</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">Agent</th>
                  <th className="pb-2 font-medium">Batch</th>
                  <th className="pb-2 font-medium text-right">Defects</th>
                  <th className="pb-2 font-medium text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {data.topAgents.slice(0, 10).map((agent) => (
                  <tr key={agent.agentId} className="border-b last:border-0">
                    <td className="py-2 font-medium">{agent.nama}</td>
                    <td className="py-2 text-gray-500">{agent.batch}</td>
                    <td className={`py-2 text-right font-medium ${agent.defects > 0 ? 'text-red-600' : 'text-green-600'}`}>{agent.defects}</td>
                    <td className="py-2 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${agent.score >= 85 ? 'bg-green-100 text-green-700' : agent.score >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                        {agent.score}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, color, bg }: { icon: any; label: string; value: string | number; color: string; bg: string }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center`}><Icon size={20} className={color} /></div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className={`text-xl font-bold ${color}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 85 ? 'bg-green-500' : value >= 70 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span className="font-medium">{value.toFixed(1)}</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

import { useApi } from '../../hooks/useApi';
import type { AgentDetailData } from '@trainers/types';
import { useParams } from '@tanstack/react-router';

export default function SidakAgentDetailPage() {
  const { id } = useParams({ from: '/sidak/agents/$id' });
  const { data, loading } = useApi<AgentDetailData>(`/sidak/agents/${id}`);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading...</div>;
  if (!data) return <div className="p-8 text-center text-gray-500">Agent not found</div>;

  const latestPeriod = data.periodSummaries[0];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Agent Detail</h2>

      {latestPeriod && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border shadow-sm p-4">
            <p className="text-xs text-gray-500">Final Score</p>
            <p className={`text-2xl font-bold ${latestPeriod.finalScore >= 85 ? 'text-green-600' : latestPeriod.finalScore >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
              {latestPeriod.finalScore.toFixed(1)}
            </p>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-4">
            <p className="text-xs text-gray-500">Non-Critical</p>
            <p className="text-2xl font-bold text-blue-600">{latestPeriod.nonCriticalScore.toFixed(1)}</p>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-4">
            <p className="text-xs text-gray-500">Critical</p>
            <p className="text-2xl font-bold text-red-600">{latestPeriod.criticalScore.toFixed(1)}</p>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-4">
            <p className="text-xs text-gray-500">Findings</p>
            <p className={`text-2xl font-bold ${latestPeriod.findingsCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {latestPeriod.findingsCount}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm p-6">
        <h3 className="font-semibold mb-4">Score History</h3>
        {data.scoreHistory && data.scoreHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">Period</th>
                  <th className="pb-2 font-medium text-right">Score</th>
                  <th className="pb-2 font-medium text-right">NC</th>
                  <th className="pb-2 font-medium text-right">CR</th>
                  <th className="pb-2 font-medium text-right">Sessions</th>
                  <th className="pb-2 font-medium text-right">Findings</th>
                </tr>
              </thead>
              <tbody>
                {data.scoreHistory.map((s) => (
                  <tr key={`${s.month}-${s.year}`} className="border-b last:border-0">
                    <td className="py-2">{s.month}/{s.year}</td>
                    <td className={`py-2 text-right font-medium ${s.finalScore >= 85 ? 'text-green-600' : s.finalScore >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                      {s.finalScore.toFixed(1)}
                    </td>
                    <td className="py-2 text-right">{s.nonCriticalScore.toFixed(1)}</td>
                    <td className="py-2 text-right">{s.criticalScore.toFixed(1)}</td>
                    <td className="py-2 text-right">{s.sessionCount}</td>
                    <td className="py-2 text-right">
                      {data.periodSummaries.find(p => p.month === s.month && p.year === s.year)?.findingsCount ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">Belum ada riwayat skor.</p>
        )}
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-6">
        <h3 className="font-semibold mb-4">Findings {data.temuan.length > 0 && `(${data.temuan.length})`}</h3>
        {data.temuan.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">Indicator</th>
                  <th className="pb-2 font-medium text-center">Nilai</th>
                  <th className="pb-2 font-medium">Ticket</th>
                  <th className="pb-2 font-medium">Ketidaksesuaian</th>
                </tr>
              </thead>
              <tbody>
                {data.temuan.slice(0, 20).map((t) => {
                  const ind = data.indicators.find(i => i.id === t.indicator_id);
                  return (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="py-2">{ind?.name ?? t.indicator_id.slice(0, 8)}</td>
                      <td className={`py-2 text-center font-medium ${t.nilai < 3 ? 'text-red-600' : 'text-green-600'}`}>
                        {t.nilai}
                      </td>
                      <td className="py-2 text-gray-500">{t.no_tiket ?? '-'}</td>
                      <td className="py-2 text-gray-500 max-w-xs truncate">{t.ketidaksesuaian ?? '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">Belum ada temuan.</p>
        )}
      </div>
    </div>
  );
}

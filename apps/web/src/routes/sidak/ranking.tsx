import { useState } from "react";
import { useApi } from "../../hooks/useApi";
import type { DashboardData } from "@trainers/types";
import { Medal, TrendingDown } from "lucide-react";
import { Pagination } from "../../components/ui/Pagination";

export default function SidakRankingPage() {
  const { data, loading } = useApi<DashboardData>("/sidak/dashboard");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  if (loading)
    return <div className="p-8 text-center text-gray-500">Loading...</div>;
  if (!data)
    return <div className="p-8 text-center text-gray-500">No data</div>;

  const sorted = [...data.topAgents].sort(
    (a, b) => b.defects - a.defects || a.nama.localeCompare(b.nama),
  );
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Agent Ranking</h2>
      <p className="text-gray-500">
        Diurutkan berdasarkan jumlah defect (terbanyak ke tersedikit)
      </p>

      {sorted.length === 0 ? (
        <div className="text-center text-gray-500 py-8">No data</div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="p-3 font-medium text-gray-500 w-12">#</th>
                <th className="p-3 font-medium text-gray-500">Agent</th>
                <th className="p-3 font-medium text-gray-500">Batch</th>
                <th className="p-3 font-medium text-gray-500 text-right">
                  Defects
                </th>
                <th className="p-3 font-medium text-gray-500 text-right">
                  Score
                </th>
                <th className="p-3 font-medium text-gray-500 text-center">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paginated.map((agent, i) => {
                const rank = (page - 1) * pageSize + i + 1;
                return (
                  <tr key={agent.agentId} className="hover:bg-gray-50">
                    <td className="p-3">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          rank === 1
                            ? "bg-amber-100 text-amber-700"
                            : rank === 2
                              ? "bg-gray-100 text-gray-600"
                              : rank === 3
                                ? "bg-orange-100 text-orange-700"
                                : "bg-gray-50 text-gray-400"
                        }`}
                      >
                        {rank}
                      </div>
                    </td>
                    <td className="p-3 font-medium">{agent.nama}</td>
                    <td className="p-3 text-gray-500">{agent.batch}</td>
                    <td
                      className={`p-3 text-right font-medium ${agent.defects > 0 ? "text-red-600" : "text-green-600"}`}
                    >
                      {agent.defects}
                    </td>
                    <td className="p-3 text-right">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          agent.score >= 85
                            ? "bg-green-100 text-green-700"
                            : agent.score >= 70
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {agent.score.toFixed(1)}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {agent.defects === 0 ? (
                        <span className="text-green-600 text-xs">Clean</span>
                      ) : agent.hasCritical ? (
                        <span className="text-red-600 text-xs flex items-center justify-center gap-1">
                          <TrendingDown size={14} /> Critical
                        </span>
                      ) : (
                        <span className="text-amber-600 text-xs">
                          Non-Critical
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sorted.length > pageSize && (
            <div className="px-6 py-4 border-t">
              <Pagination
                page={page}
                pageSize={pageSize}
                total={sorted.length}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

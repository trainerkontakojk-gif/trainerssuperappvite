import { Link } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import { Search, ChevronRight } from 'lucide-react';
import { Pagination } from '../../components/ui/Pagination';

export default function SidakAgentsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data: agents, loading } = useApi<any[]>('/sidak/agents');

  useEffect(() => {
    setPage(1);
  }, [search]);

  const filtered = (agents ?? []).filter((a: any) =>
    !search || a.nama?.toLowerCase().includes(search.toLowerCase()) ||
    a.tim?.toLowerCase().includes(search.toLowerCase()) ||
    a.batch_name?.toLowerCase().includes(search.toLowerCase())
  );

  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Agent Directory</h2>

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          placeholder="Cari agent..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-8">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-gray-500 py-8">No agents found</div>
      ) : (
        <>
          <div className="bg-white rounded-xl border shadow-sm divide-y">
            {paginated.map((agent: any) => (
              <Link
                key={agent.id}
                to="/sidak/agents/$id"
                params={{ id: agent.id }}
                className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold">
                    {agent.nama?.charAt(0) ?? '?'}
                  </div>
                  <div>
                    <p className="font-medium">{agent.nama}</p>
                    <p className="text-sm text-gray-500">{agent.tim} &middot; {agent.batch_name}</p>
                  </div>
                </div>
                {agent.jabatan && (
                  <span className="text-xs text-gray-400">{agent.jabatan}</span>
                )}
              </Link>
            ))}
          </div>
          {filtered.length > 0 && (
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <Pagination
                page={page}
                pageSize={pageSize}
                total={filtered.length}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

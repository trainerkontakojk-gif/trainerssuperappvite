import { useApi, putApi } from '../../hooks/useApi';
import { useState } from 'react';
import { Save } from 'lucide-react';
import type { ServiceType } from '@trainers/types';

interface ServiceWeightData {
  service_type: ServiceType;
  critical_weight: number;
  non_critical_weight: number;
  scoring_mode: string;
}

const SERVICE_LABELS: Record<string, string> = {
  call: 'Call', chat: 'Chat', email: 'Email', cso: 'CSO',
  pencatatan: 'Pencatatan', bko: 'BKO', slik: 'SLIK',
};

export default function SidakSettingsPage() {
  const { data: weights, loading, refetch } = useApi<ServiceWeightData[]>('/sidak/service-weights');
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  const handleUpdate = async (serviceType: string, field: string, value: number | string) => {
    setSaving(serviceType);
    setMessage(null);
    try {
      await putApi(`/sidak/service-weights/${serviceType}`, { [field]: value });
      setMessage({ type: 'success', text: `${SERVICE_LABELS[serviceType] ?? serviceType} updated` });
      refetch();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">QA Settings</h2>
      <p className="text-gray-500">Service weights and scoring configuration</p>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="p-3 font-medium text-gray-500">Service</th>
              <th className="p-3 font-medium text-gray-500">Mode</th>
              <th className="p-3 font-medium text-gray-500 text-right">Critical Weight</th>
              <th className="p-3 font-medium text-gray-500 text-right">Non-Critical Weight</th>
              <th className="p-3 font-medium text-gray-500 text-center">Sum</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(weights ?? []).map((w) => (
              <tr key={w.service_type} className="hover:bg-gray-50">
                <td className="p-3 font-medium">{SERVICE_LABELS[w.service_type] ?? w.service_type}</td>
                <td className="p-3">
                  <select
                    className="border rounded p-1 text-sm"
                    value={w.scoring_mode}
                    onChange={(e) => handleUpdate(w.service_type, 'scoring_mode', e.target.value)}
                    disabled={saving === w.service_type}
                  >
                    <option value="weighted">Weighted</option>
                    <option value="flat">Flat</option>
                    <option value="no_category">No Category</option>
                  </select>
                </td>
                <td className="p-3 text-right">
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    className="w-20 border rounded p-1 text-right text-sm"
                    value={w.critical_weight}
                    onChange={(e) => handleUpdate(w.service_type, 'critical_weight', parseFloat(e.target.value))}
                    disabled={saving === w.service_type}
                  />
                </td>
                <td className="p-3 text-right">
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    className="w-20 border rounded p-1 text-right text-sm"
                    value={w.non_critical_weight}
                    onChange={(e) => handleUpdate(w.service_type, 'non_critical_weight', parseFloat(e.target.value))}
                    disabled={saving === w.service_type}
                  />
                </td>
                <td className={`p-3 text-center font-medium ${Math.abs(w.critical_weight + w.non_critical_weight - 1) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                  {(w.critical_weight + w.non_critical_weight).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Mail, User, Bot, Send, FileText, BarChart3, AlertCircle } from 'lucide-react';
import { useApi } from '../../hooks/useApi';

interface Scenario { id: string; title: string; description: string; category: string; isActive: boolean; }
interface PdktIdentity { name: string; email: string; city: string; bodyName: string; }

export default function PdktSimulation() {
  const { data: scenarios } = useApi<Scenario[]>('/pdkt/scenarios');
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [inboundEmail, setInboundEmail] = useState<{ subject: string; body: string } | null>(null);
  const [reply, setReply] = useState('');
  const [evaluation, setEvaluation] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async (scenario: Scenario) => {
    setSelectedScenario(scenario);
    setInboundEmail(null);
    setReply('');
    setEvaluation(null);
    setLoading(true);

    try {
      const idRes = await fetch('/api/v1/pdkt/generate-identity', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const idJson = await idRes.json();
      const identity: PdktIdentity = idJson.data;

      const res = await fetch('/api/v1/pdkt/generate-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: scenario.id, consumerTypeId: 'ramah', identity }),
      });
      const json = await res.json();
      if (json.success) {
        setInboundEmail(json.data);
        setError(null);
      } else {
        setError(json.error?.message || 'Gagal memulai sesi');
      }
    } catch (err) {
      setError('Terjadi kesalahan koneksi. Silakan coba lagi.');
      console.error('Start error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEvaluate = async () => {
    if (!reply.trim() || !inboundEmail) return;
    setEvaluating(true);

    try {
      const res = await fetch('/api/v1/pdkt/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            scenarios: [],
            consumerType: {},
            identity: {},
            selectedModel: 'gemini-3.1-flash-lite',
            resolvedConsumerNameMentionPattern: 'none',
            writingStyleMode: 'training',
          },
          emails: [
            { id: '1', from: 'consumer@email.com', to: 'ojk@kontak157.go.id', subject: inboundEmail.subject, body: inboundEmail.body, timestamp: new Date().toISOString(), isAgent: false },
            { id: '2', from: 'ojk@kontak157.go.id', to: 'consumer@email.com', subject: `Re: ${inboundEmail.subject}`, body: reply, timestamp: new Date().toISOString(), isAgent: true },
          ],
        }),
      });
      const json = await res.json();
      if (json.success) {
        setEvaluation(json.data);
        setError(null);
      } else {
        setError(json.error?.message || 'Gagal mengevaluasi');
      }
    } catch (err) {
      setError('Terjadi kesalahan koneksi saat evaluasi.');
      console.error('Evaluate error:', err);
    } finally {
      setEvaluating(false);
    }
  };

  if (!selectedScenario) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Mulai Simulasi PDKT</h1>
        <p className="text-gray-500">Pilih skenario untuk memulai simulasi email:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(scenarios || []).map(s => (
            <button key={s.id} onClick={() => handleStart(s)}
              className="p-4 bg-white rounded-xl border text-left hover:shadow-md transition-shadow">
              <span className="text-xs text-indigo-500 font-medium">{s.category}</span>
              <h3 className="font-semibold mt-1">{s.title}</h3>
              <p className="text-sm text-gray-500 mt-1">{s.description}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (loading) return <div className="text-center p-8 text-gray-500">Membuat email konsumen...</div>;

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>Tutup</button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{selectedScenario.title}</h2>
        <button onClick={() => setSelectedScenario(null)}
          className="text-sm text-red-500 hover:underline">Kembali</button>
      </div>

      {inboundEmail && (
        <>
          <div className="bg-white rounded-xl border shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <Mail size={18} className="text-gray-400" />
              <span className="text-sm font-medium">Email dari Konsumen</span>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-sm"><span className="font-medium">Subjek:</span> {inboundEmail.subject}</p>
              <p className="text-sm whitespace-pre-wrap">{inboundEmail.body}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border shadow-sm p-6">
            <h3 className="text-sm font-medium mb-2">Balas Email</h3>
            <textarea
              value={reply}
              onChange={e => setReply(e.target.value)}
              placeholder="Tulis balasan email..."
              rows={8}
              className="w-full p-3 border rounded-lg text-sm resize-none"
            />
            <div className="flex justify-end mt-3">
              <button onClick={handleEvaluate} disabled={evaluating || !reply.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm">
                <BarChart3 size={16} />
                {evaluating ? 'Mengevaluasi...' : 'Kirim & Evaluasi'}
              </button>
            </div>
          </div>

          {evaluation && (
            <div className="bg-white rounded-xl border shadow-sm p-6">
              <h3 className="font-semibold mb-4">Hasil Evaluasi</h3>
              <div className="flex items-center gap-4 mb-4">
                <div className="text-3xl font-bold text-indigo-600">{evaluation.score}</div>
                <div className="text-sm text-gray-500">dari 100</div>
              </div>
              <p className="text-sm text-gray-700 mb-4">{evaluation.feedback}</p>
              {evaluation.typos?.length > 0 && (
                <div className="mb-3">
                  <span className="text-xs font-medium text-red-500">Typo:</span>
                  <ul className="list-disc list-inside text-xs text-gray-500 mt-1">
                    {evaluation.typos.map((t: string, i: number) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

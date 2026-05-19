import { useState } from 'react';
import { Send, User, Bot, Clock, AlertCircle } from 'lucide-react';
import { useApi } from '../../hooks/useApi';

interface Scenario { id: string; title: string; description: string; category: string; isActive: boolean; }

export default function KetikSimulation() {
  const { data: scenarios } = useApi<Scenario[]>('/ketik/scenarios');
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [messages, setMessages] = useState<{ id: string; sender: string; text: string; timestamp: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartSession = (scenario: Scenario) => {
    setSelectedScenario(scenario);
    const greeting = `Selamat pagi/siang/sore, dengan Kontak OJK 157. Ada yang bisa kami bantu?`;
    setMessages([{ id: '0', sender: 'agent', text: greeting, timestamp: new Date().toISOString() }]);
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedScenario) return;
    const agentMsg = { id: String(Date.now()), sender: 'agent', text: input, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, agentMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/v1/ketik/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioId: selectedScenario.id,
          consumerTypeId: 'ramah',
          identity: { name: 'Budi Santoso', city: 'Jakarta', phone: '08123456789' },
          selectedModel: 'gemini-3.1-flash-lite',
          chatHistory: [...messages, agentMsg],
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.text) {
        const consumerMsg = {
          id: String(Date.now() + 1),
          sender: 'consumer',
          text: json.data.text,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, consumerMsg]);
        setError(null);
      } else {
        setError(json.error?.message || 'Gagal mendapatkan respons dari AI');
      }
    } catch (err) {
      setError('Terjadi kesalahan koneksi. Silakan coba lagi.');
      console.error('Send error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!selectedScenario) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Mulai Simulasi KETIK</h1>
        <p className="text-gray-500">Pilih skenario untuk memulai sesi chat:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(scenarios || []).map(s => (
            <button key={s.id} onClick={() => handleStartSession(s)}
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

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between p-4 bg-white border-b">
        <div>
          <h2 className="font-semibold">{selectedScenario.title}</h2>
          <span className="text-xs text-gray-500">AI Consumer: Ramah & Kooperatif</span>
        </div>
        <button onClick={() => setSelectedScenario(null)}
          className="text-sm text-red-500 hover:underline">Akhiri Sesi</button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 text-sm border-b">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>Tutup</button>
        </div>
      )}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.sender === 'agent' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[70%] p-3 rounded-xl ${m.sender === 'agent' ? 'bg-indigo-100 text-indigo-900' : 'bg-gray-100 text-gray-900'}`}>
              <div className="flex items-center gap-2 mb-1">
                {m.sender === 'agent' ? <User size={14} /> : <Bot size={14} />}
                <span className="text-xs font-medium">{m.sender === 'agent' ? 'Anda' : 'Konsumen'}</span>
              </div>
              <p className="text-sm">{m.text}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 p-3 rounded-xl">
              <div className="flex items-center gap-2">
                <Bot size={14} />
                <span className="text-sm">Mengetik...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-white border-t">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Ketik pesan..."
            className="flex-1 p-2 border rounded-lg text-sm"
            disabled={loading}
          />
          <button onClick={handleSend} disabled={loading || !input.trim()}
            className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

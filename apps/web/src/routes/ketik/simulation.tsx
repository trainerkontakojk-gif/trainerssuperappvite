import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, User, Bot, Clock, AlertCircle, ArrowLeft } from "lucide-react";
import { useApi } from "../../hooks/useApi";

interface Scenario {
  id: string;
  title: string;
  description: string;
  category: string;
  isActive: boolean;
}

export default function KetikSimulation() {
  const {
    data: scenarios,
    loading: loadingScenarios,
    error: scenariosError,
  } = useApi<Scenario[]>("/ketik/scenarios");
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(
    null,
  );
  const [messages, setMessages] = useState<
    { id: string; sender: string; text: string; timestamp: string }[]
  >([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartSession = (scenario: Scenario) => {
    setSelectedScenario(scenario);
    const greeting = `Selamat pagi/siang/sore, dengan Kontak OJK 157. Ada yang bisa kami bantu?`;
    setMessages([
      {
        id: "0",
        sender: "agent",
        text: greeting,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedScenario) return;
    const agentMsg = {
      id: String(Date.now()),
      sender: "agent",
      text: input,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, agentMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/v1/ketik/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: selectedScenario.id,
          consumerTypeId: "ramah",
          identity: {
            name: "Budi Santoso",
            city: "Jakarta",
            phone: "08123456789",
          },
          selectedModel: "gemini-3.8-flash",
          chatHistory: [...messages, agentMsg],
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.text) {
        const consumerMsg = {
          id: String(Date.now() + 1),
          sender: "consumer",
          text: json.data.text,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, consumerMsg]);
        setError(null);
      } else {
        setError(json.error?.message || "Gagal mendapatkan respons dari AI");
      }
    } catch (err) {
      setError("Terjadi kesalahan koneksi. Silakan coba lagi.");
      console.error("Send error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!selectedScenario) {
    return (
      <div data-module="ketik" className="module-clean-app space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">
            Mulai Simulasi KETIK
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Pilih skenario training untuk memulai sesi chat edukatif.
          </p>
        </div>
        {scenariosError && (
          <div
            className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            <AlertCircle size={16} /> {scenariosError}
          </div>
        )}
        {loadingScenarios ? (
          <div className="module-clean-panel rounded-2xl px-4 py-8 text-center text-sm text-muted-foreground">
            Memuat skenario...
          </div>
        ) : scenarios && scenarios.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {scenarios.map((s) => (
              <motion.button
                key={s.id}
                onClick={() => handleStartSession(s)}
                whileTap={{ scale: 0.99 }}
                className="module-clean-panel rounded-2xl p-4 text-left transition hover:border-module-ketik/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-ketik focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                type="button"
              >
                <span className="text-xs font-semibold text-module-ketik">
                  {s.category}
                </span>
                <h3 className="mt-1 font-semibold text-foreground">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {s.description}
                </p>
              </motion.button>
            ))}
          </div>
        ) : (
          <div className="module-clean-panel rounded-2xl px-4 py-8 text-center text-sm text-muted-foreground">
            Tidak ada skenario tersedia.
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-module="ketik"
      className="module-clean-app flex h-[calc(100dvh-8rem)] min-h-[34rem] flex-col overflow-hidden rounded-2xl border border-border bg-background"
    >
      <div className="module-clean-toolbar flex items-center justify-between gap-3 border-b p-3 sm:p-4">
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-foreground">
            {selectedScenario.title}
          </h2>
          <div className="mt-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Clock size={14} className="text-module-ketik" />
            <span>AI Consumer: Ramah & Kooperatif</span>
          </div>
        </div>
        <button
          onClick={() => setSelectedScenario(null)}
          className="module-clean-button-secondary flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-destructive transition hover:border-destructive/30 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          type="button"
        >
          <ArrowLeft size={16} />
          Akhiri Sesi
        </button>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            <AlertCircle size={16} />
            <span>{error}</span>
            <button
              className="ml-auto min-h-9 rounded-lg px-2 text-xs font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
              onClick={() => setError(null)}
              type="button"
            >
              Tutup
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="module-clean-stage flex-1 space-y-4 overflow-auto p-3 sm:p-4">
        {messages.map((m) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={`flex ${m.sender === "agent" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[74%] ${
                m.sender === "agent"
                  ? "rounded-tr-md bg-module-ketik text-white"
                  : "module-clean-panel rounded-tl-md text-foreground"
              }`}
            >
              <div
                className={`mb-1 flex items-center gap-2 text-xs font-semibold ${
                  m.sender === "agent"
                    ? "text-white/85"
                    : "text-muted-foreground"
                }`}
              >
                {m.sender === "agent" ? <User size={14} /> : <Bot size={14} />}
                <span>{m.sender === "agent" ? "Anda" : "Konsumen"}</span>
              </div>
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
            </div>
          </motion.div>
        ))}
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
            aria-live="polite"
          >
            <div className="module-clean-panel rounded-2xl rounded-tl-md px-4 py-3">
              <div className="flex items-center gap-2">
                <Bot size={14} className="text-module-ketik" />
                <span className="text-sm">Mengetik...</span>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <div className="module-clean-toolbar border-t p-3 sm:p-4">
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="ketik-simulation-input">
            Ketik pesan
          </label>
          <input
            id="ketik-simulation-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ketik pesan..."
            className="module-clean-input-shell min-h-11 flex-1 rounded-xl px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-module-ketik"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="module-clean-button-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-ketik focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            type="button"
            aria-label="Kirim pesan"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

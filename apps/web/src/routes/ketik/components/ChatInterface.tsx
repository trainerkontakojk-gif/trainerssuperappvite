import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Phone, X, Check, CheckCheck, ArrowLeft, Download, Sparkles } from 'lucide-react';
import type { ChatMessage, KetikSessionConfig, KetikScenario, KetikQuickTemplate } from '@trainers/types';
import { ketikApi } from '../ketikApi';

interface ChatInterfaceProps {
  config: KetikSessionConfig;
  scenario: KetikScenario;
  onEndSession: (messages: ChatMessage[]) => void;
  isReviewMode?: boolean;
  initialMessages?: ChatMessage[];
  isEnding?: boolean;
  authReady?: boolean;
  currentUserId?: string;
  templates?: KetikQuickTemplate[];
  signatureName?: string;
}

const TickIcon = ({ status }: { status?: string }) => {
  if (!status) return null;
  return status === 'read'
    ? <CheckCheck className="w-3.5 h-3.5 text-primary" />
    : <Check className="w-3.5 h-3.5 text-muted-foreground" />;
};

const IMAGE_TAG_PATTERN = /\[SEND_IMAGE\s*:\s*\d+\]/i;
const IMAGE_TAG_PATTERN_GLOBAL = /\[SEND_IMAGE\s*:\s*\d+\]/gi;
const SYSTEM_TAG_PATTERN = /\[(sistem|system)\]/i;
const SYSTEM_TAG_PATTERN_GLOBAL = /\[(sistem|system)\]/gi;
const MAINTENANCE_TEMPLATE = 'Demikian informasi yang dapat kami sampaikan. Apakah informasinya sudah cukup jelas? Ada hal lain yang dapat kami bantu?';

function stripSystemTags(text: string): string {
  return text.replace(SYSTEM_TAG_PATTERN_GLOBAL, '').trim();
}

function hasImageTag(text: string): boolean {
  return IMAGE_TAG_PATTERN.test(text);
}

function isImageOnlyText(text: string): boolean {
  const cleaned = stripSystemTags(text);
  return cleaned.length > 0 && hasImageTag(cleaned) && cleaned.replace(IMAGE_TAG_PATTERN_GLOBAL, '').trim() === '';
}

export function ChatInterface({
  config, scenario, onEndSession, isReviewMode = false,
  initialMessages = [], isEnding = false, authReady = true,
  currentUserId, templates = [],
  signatureName = '',
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(config.simulationDuration * 60);
  const [consumerTyping, setConsumerTyping] = useState(false);
  const [imageLightbox, setImageLightbox] = useState<string | null>(null);
  const [showTemplatePopup, setShowTemplatePopup] = useState(false);
  const [templateFilter, setTemplateFilter] = useState('');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionActiveRef = useRef(true);

  const [conversationPhase, setConversationPhase] = useState<'opening' | 'middle' | 'closing'>('opening');
  const consumerTurnIndexRef = useRef(0);
  const consecutiveSlowCountRef = useRef(0);
  const totalSlowCountRef = useRef(0);
  const [closingTimeout, setClosingTimeout] = useState(false);

  const dummyNames = ['Budi Santoso', 'Siti Aminah', 'Agus Setiawan', 'Dewi Lestari'];
  const dummyCities = ['Jakarta Selatan', 'Jakarta Pusat', 'Jakarta Barat', 'Jakarta Timur'];
  const phonePrefixes = ['0812', '0813', '0821', '0852'];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isReviewMode) {
      setMessages(initialMessages);
      return;
    }
    const greetingText = signatureName
      ? `Selamat pagi/siang/sore Bapak/Ibu, perkenalkan saya ${signatureName} dari Kontak OJK 157. Ada yang bisa saya bantu terkait kendala Bapak/Ibu hari ini?`
      : `Selamat pagi/siang/sore, dengan Kontak OJK 157. Ada yang bisa kami bantu?`;
    const greeting: ChatMessage = {
      id: 'sys-greeting', sender: 'agent', text: greetingText,
      timestamp: new Date().toISOString(), status: 'read',
    };
    const systemMsg: ChatMessage = {
      id: 'sys-start', sender: 'system', text: `iMessage dengan ${config.identity.name}`,
      timestamp: new Date().toISOString(),
    };
    setMessages([systemMsg, greeting]);
  }, []);

  useEffect(() => {
    if (isReviewMode || isEnding) return;
    timerRef.current = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setClosingTimeout(true);
          handleTimeoutClose();
          return 0;
        }
        if (prev <= config.simulationDuration * 60 * 0.25) {
          setConversationPhase('closing');
        } else if (prev <= config.simulationDuration * 60 * 0.6) {
          setConversationPhase('middle');
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isReviewMode, isEnding]);

  useEffect(() => {
    if (closingTimeout && !isReviewMode && messages.length > 0 && sessionActiveRef.current) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.sender !== 'system') {
        const timeoutMsg: ChatMessage = {
          id: `sys-timeout-${Date.now()}`, sender: 'system',
          text: 'Waktu simulasi telah habis.',
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, timeoutMsg]);
      }
    }
  }, [closingTimeout]);

  const handleTimeoutClose = () => {
    if (sessionActiveRef.current && messages.length > 0) {
      const closingMsg: ChatMessage = {
        id: `sys-timeout-close-${Date.now()}`, sender: 'system',
        text: MAINTENANCE_TEMPLATE,
        timestamp: new Date().toISOString(),
      };
      const finalMessages = [...messages, closingMsg];
      sessionActiveRef.current = false;
      setTimeout(() => onEndSession(finalMessages), 2000);
    }
  };

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = overrideText || input;
    if (!text.trim() || isLoading || isReviewMode || !sessionActiveRef.current) return;

    const agentMsg: ChatMessage = {
      id: `msg-${Date.now()}`, sender: 'agent', text: text.trim(),
      timestamp: new Date().toISOString(), status: 'sent',
    };

    setMessages(prev => [...prev, agentMsg]);
    setInput('');
    setError(null);
    setIsLoading(true);
    setShowTemplatePopup(false);

    setTimeout(() => {
      setMessages(prev => prev.map(m => m.id === agentMsg.id ? { ...m, status: 'delivered' as const } : m));
    }, 300);
    setTimeout(() => {
      setMessages(prev => prev.map(m => m.id === agentMsg.id ? { ...m, status: 'read' as const } : m));
    }, 800);

    try {
      const result = await ketikApi.generate({
        scenarioId: scenario.id,
        consumerTypeId: config.consumerType.id,
        identity: config.identity,
        selectedModel: config.selectedModel,
        simulationDuration: config.simulationDuration,
        responsePacingMode: config.responsePacingMode,
        chatHistory: [...messages, agentMsg],
      });

      if (result.text) {
        const parts = result.text.split('[BREAK]').map(p => p.trim()).filter(Boolean);
        const followUpDelay = config.responsePacingMode === 'realistic' ? 2000 : 800;

        for (let i = 0; i < parts.length; i++) {
          if (!sessionActiveRef.current) break;

          if (hasImageTag(parts[i])) {
            const imageOnly = isImageOnlyText(parts[i]);
            const consumerMsg: ChatMessage = {
              id: `consumer-${Date.now()}-${i}`, sender: 'consumer',
              text: imageOnly ? '📷 *Mengirim gambar...*' : parts[i],
              timestamp: new Date().toISOString(),
            };
            setMessages(prev => [...prev, consumerMsg]);
            consumerTurnIndexRef.current += 1;
            await new Promise(r => setTimeout(r, followUpDelay));
          } else {
            setConsumerTyping(true);
            const typingDuration = Math.min(parts[i].length * 20, 3000);
            await new Promise(r => setTimeout(r, typingDuration));
            setConsumerTyping(false);

            const consumerMsg: ChatMessage = {
              id: `consumer-${Date.now()}-${i}`, sender: 'consumer',
              text: parts[i], timestamp: new Date().toISOString(),
            };
            setMessages(prev => [...prev, consumerMsg]);
            consumerTurnIndexRef.current += 1;
            await new Promise(r => setTimeout(r, followUpDelay));
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Gagal mendapatkan respons');
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, isReviewMode, messages, config, scenario]);

  const handleEndSession = () => {
    if (isEnding) return;
    sessionActiveRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);

    const closing: ChatMessage = {
      id: `sys-end-${Date.now()}`, sender: 'system',
      text: 'Sesi simulasi diakhiri oleh pengguna.',
      timestamp: new Date().toISOString(),
    };
    const finalMessages = [...messages, closing];
    onEndSession(finalMessages);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (showTemplatePopup && templateFilter) {
        const filtered = (templates || []).filter(t => t.keyword.includes(templateFilter));
        if (filtered.length > 0) {
          handleSend(filtered[0].content);
          return;
        }
      }
      handleSend();
    }
    if (e.key === 'Escape') setShowTemplatePopup(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    if (val.startsWith('/')) {
      setShowTemplatePopup(true);
      setTemplateFilter(val.slice(1).toLowerCase());
    } else {
      setShowTemplatePopup(false);
    }
  };

  const filteredTemplates = (templates || []).filter(t => t.keyword.includes(templateFilter));

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleCsvExport = () => {
    const csv = [
      ['Sender', 'Message', 'Timestamp'].join(','),
      ...messages.map(m => [
        m.sender === 'agent' ? 'Agent' : m.sender === 'consumer' ? 'Consumer' : 'System',
        `"${m.text.replace(/"/g, '""')}"`,
        m.timestamp,
      ].join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ketik-session-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-card/90 backdrop-blur-xl shrink-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {!isReviewMode ? (
              <button onClick={handleEndSession} disabled={isEnding} className="w-9 h-9 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-foreground/5 transition-all" title="Akhiri Sesi">
                <X className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-9 h-9 flex items-center justify-center rounded-xl text-primary">
                <Sparkles className="w-5 h-5" />
              </div>
            )}
            <div>
              <h2 className="text-sm font-black text-foreground tracking-tight">{scenario.title}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{config.identity.name}</span>
                {config.identity.city && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-foreground/20" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{config.identity.city}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!isReviewMode && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-black tracking-wider ${remainingSeconds < 60 ? 'bg-red-500/10 text-red-500 animate-pulse' : 'bg-foreground/5 text-muted-foreground'}`}>
                <Phone className="w-3.5 h-3.5" />
                {formatTime(remainingSeconds)}
              </div>
            )}
            {isReviewMode && (
              <button onClick={handleCsvExport} className="w-9 h-9 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-foreground/5 transition-all" title="Export CSV">
                <Download className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 text-sm border-b border-red-200 dark:border-red-500/20">
          <span>{error}</span>
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>Tutup</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            if (msg.sender === 'system') {
              return (
                <motion.div key={msg.id} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center py-1">
                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 bg-foreground/5 px-4 py-1.5 rounded-full">{msg.text}</span>
                </motion.div>
              );
            }
            const isAgent = msg.sender === 'agent';
            const hasImage = hasImageTag(msg.text);
            return (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-4 py-3 relative text-sm leading-relaxed ${isAgent ? 'bg-emerald-600 text-white rounded-2xl rounded-tr-md' : 'bg-foreground/[0.03] border border-border/50 text-foreground rounded-2xl rounded-tl-md'}`}>
                  {hasImage && <span className="block mb-2 cursor-pointer text-blue-400 underline" onClick={() => setImageLightbox(msg.text)}>📷 Lihat Gambar</span>}
                  <p className="whitespace-pre-wrap break-words">{hasImage ? msg.text.replace(IMAGE_TAG_PATTERN_GLOBAL, '').trim() : msg.text}</p>
                  <div className={`flex items-center gap-1 mt-1 ${isAgent ? 'justify-end' : 'justify-start'}`}>
                    <span className="text-[8px] opacity-60">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {isAgent && <TickIcon status={msg.status} />}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {consumerTyping && (
          <div className="flex justify-start">
            <div className="bg-foreground/[0.03] border border-border/50 rounded-2xl rounded-tl-md px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-muted-foreground font-medium">Mengetik...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {!isReviewMode && (
        <div className="sticky bottom-0 border-t border-border/50 bg-card/90 backdrop-blur-xl shrink-0">
          <div className="relative p-4">
            {showTemplatePopup && filteredTemplates.length > 0 && (
              <div className="absolute bottom-full left-4 right-4 mb-2 bg-card border border-border/50 rounded-2xl shadow-xl overflow-hidden z-20">
                <div className="max-h-40 overflow-y-auto p-2 space-y-1">
                  {filteredTemplates.map(t => (
                    <button key={t.id} onClick={() => handleSend(t.content)} className="w-full text-left p-3 rounded-xl hover:bg-foreground/5 transition-all">
                      <span className="text-[10px] font-black uppercase tracking-wider text-primary">/{t.keyword}</span>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{t.content}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2 items-end">
              <input
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ketik pesan... (gunakan / untuk template)"
                disabled={isLoading || isEnding || !authReady || closingTimeout}
                className="flex-1 bg-foreground/5 border border-border/50 rounded-2xl px-5 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-2 focus:ring-primary/30 transition-all disabled:opacity-50"
              />
              <button
                onClick={() => handleSend()}
                disabled={isLoading || !input.trim() || isEnding || !authReady || closingTimeout}
                className="w-12 h-12 flex items-center justify-center bg-primary text-white rounded-2xl hover:opacity-90 transition-all disabled:opacity-30 shadow-lg shadow-primary/20"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
            {!authReady && (
              <p className="text-[10px] text-amber-500 font-black uppercase tracking-widest mt-2 text-center">
                Autentikasi belum siap. Beberapa fitur mungkin terbatas.
              </p>
            )}
          </div>
        </div>
      )}

      {imageLightbox && (
        <div className="fixed inset-0 z-[300] bg-black/80 flex items-center justify-center p-8" onClick={() => setImageLightbox(null)}>
          <button className="absolute top-6 right-6 text-white/60 hover:text-white" onClick={() => setImageLightbox(null)}><X className="w-8 h-8" /></button>
          <p className="text-white text-center text-sm">{imageLightbox}</p>
        </div>
      )}
    </div>
  );
}

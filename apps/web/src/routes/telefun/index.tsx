import { useState, useRef, useEffect, useCallback } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Play, AlertCircle, Settings } from 'lucide-react';
import { getApi, putApi } from '../../hooks/useApi';
import { notify } from '../../lib/toast';
import type { TelefunAppSettings } from './telefunSettings';
import { DEFAULT_TELEFUN_SETTINGS, VOICE_MODELS } from './telefunSettings';
import { SettingsModal } from './components/SettingsModal';

const VITE_TELEFUN_WS_URL = import.meta.env.VITE_TELEFUN_WS_URL || 'ws://localhost:3002';

type CallState = 'idle' | 'connecting' | 'connected' | 'ended';

export default function TelefunLanding() {
  const [callState, setCallState] = useState<CallState>('idle');
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [messages, setMessages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<TelefunAppSettings>(DEFAULT_TELEFUN_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [transcript, setTranscript] = useState<{ speaker: 'user' | 'ai'; text: string; timestamp: string }[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const durationRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    getApi<{ success: boolean; settings: TelefunAppSettings | null }>('/telefun/settings')
      .then(res => {
        if (res?.settings) {
          setSettings({
            ...DEFAULT_TELEFUN_SETTINGS,
            ...res.settings,
            scenarios: res.settings.scenarios || DEFAULT_TELEFUN_SETTINGS.scenarios,
            consumerTypes: res.settings.consumerTypes || DEFAULT_TELEFUN_SETTINGS.consumerTypes,
          });
        } else setSettings(DEFAULT_TELEFUN_SETTINGS);
      })
      .catch(() => setSettings(DEFAULT_TELEFUN_SETTINGS))
      .finally(() => setSettingsLoading(false));
  }, []);

  useEffect(() => {
    if (callState === 'connected') {
      const interval = setInterval(() => {
        setDuration(d => d + 1);
        durationRef.current += 1;
      }, 1000);
      return () => clearInterval(interval);
    }
    if (callState === 'idle') {
      setDuration(0);
      durationRef.current = 0;
      setTranscript([]);
    }
  }, [callState]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const cleanup = useCallback(() => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    wsRef.current?.close();
    audioRef.current?.pause();
  }, []);

  const startCall = useCallback(async () => {
    setError(null);
    setCallState('connecting');
    setMessages([]);

    const token = localStorage.getItem('auth_token') ?? localStorage.getItem('supabase_token');
    if (!token) { setError('Token tidak ditemukan. Silakan login terlebih dahulu.'); setCallState('idle'); return; }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ws = new WebSocket(`${VITE_TELEFUN_WS_URL}/?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setCallState('connected');
        setMessages(prev => [...prev, 'Terhubung ke Gemini Live...']);

        const modelPath = settings.selectedModel.startsWith('models/')
          ? settings.selectedModel
          : `models/${settings.selectedModel}`;

        ws.send(JSON.stringify({
          setup: {
            model: modelPath,
            systemInstruction: { parts: [{ text: settings.systemInstruction }] },
            voiceConfig: { voice: { name: settings.voiceName }, prebuiltVoiceConfig: { voiceName: settings.voiceName } },
            audioOutputConfig: { encoding: 'LINEAR16', sampleRateHertz: 16000 },
            realtimeInputConfig: {
              config: {
                enableVad: true,
                vadConfig: {
                  startSensitivity: 2,
                  endSensitivity: 3,
                  prefixPaddingMs: 300,
                  silenceDurationMs: 950,
                },
              },
            },
          },
        }));

        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        recorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            event.data.arrayBuffer().then(buf => {
              ws.send(JSON.stringify({
                realtimeInput: { mediaChunks: [{ data: btoa(String.fromCharCode(...new Uint8Array(buf))), mimeType: 'audio/webm' }] },
              }));
            });
          }
        };

        recorder.start(100);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.setupComplete) {
            setMessages(prev => [...prev, 'Siap memulai simulasi.']);
          } else if (data.serverContent?.modelTurn) {
            setIsSpeaking(true);
            for (const part of data.serverContent.modelTurn.parts || []) {
              if (part.text) {
                setTranscript(prev => [...prev, { speaker: 'ai', text: part.text, timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) }]);
              }
            }
          } else if (data.serverContent?.turnComplete) {
            setIsSpeaking(false);
          } else if (data.serverContent?.audioChunks) {
            for (const chunk of data.serverContent.modelTurn.parts || []) {
              if (chunk.inlineData?.data) {
                const audio = new Audio(`data:audio/wav;base64,${chunk.inlineData.data}`);
                audioRef.current = audio;
                audio.play();
              }
            }
          } else if (data.error) {
            setError(data.error.message || 'Gemini API Error');
          }
        } catch { /* non-JSON */ }
      };

      ws.onclose = () => {
        setCallState('ended');
        cleanup();
      };

      ws.onerror = () => {
        setError('Gagal terhubung ke server.');
        setCallState('ended');
      };
    } catch {
      setError('Gagal mengakses mikrofon.');
      setCallState('ended');
    }
  }, [settings, cleanup]);

  const endCall = useCallback(() => {
    cleanup();
    setCallState('ended');
  }, [cleanup]);

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const handleSaveSettings = async (newSettings: TelefunAppSettings) => {
    try {
      await putApi('/telefun/settings', newSettings);
      setSettings(newSettings);
      notify.success('Pengaturan Telefun berhasil disimpan');
    } catch {
      notify.error('Gagal menyimpan pengaturan');
    }
  };

  return (
    <>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={settings} onSave={handleSaveSettings} />
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] gap-8">
        <div className="bg-white rounded-2xl border shadow-lg p-8 w-full max-w-sm text-center space-y-6">
          <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center transition-colors ${
            callState === 'connected' ? 'bg-green-100' : callState === 'connecting' ? 'bg-yellow-100' : 'bg-indigo-100'
          }`}>
            <Phone size={36} className={callState === 'connected' ? 'text-green-600' : 'text-indigo-600'} />
          </div>

          <div className="flex items-center justify-center gap-3">
            <div>
              <h2 className="text-xl font-bold">Telefun</h2>
              <p className="text-sm text-gray-500">Simulasi Panggilan Voice AI</p>
            </div>
            {callState === 'idle' && !settingsLoading && (
              <button onClick={() => setIsSettingsOpen(true)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors" title="Pengaturan">
                <Settings size={18} />
              </button>
            )}
          </div>

          {settingsLoading ? (
            <div className="flex items-center justify-center py-4">
              <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : callState === 'idle' && (
            <div className="text-xs text-gray-400 space-y-1">
              <p>Model: {VOICE_MODELS.find(m => m.id === settings.selectedModel)?.name || settings.selectedModel}</p>
              <p>Skema: {settings.scenarioTitle || 'Custom'}</p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {(callState === 'connected' || callState === 'connecting') && (
            <div className="flex items-center justify-center gap-4 text-lg font-mono">
              {isSpeaking && <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />}
              <span>{formatDuration(duration)}</span>
            </div>
          )}

          {callState === 'connected' && transcript.length > 0 && (
            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-gray-500 mb-2">Transcript</p>
              <div className="max-h-48 overflow-auto space-y-2 text-left">
                {transcript.map((entry, i) => (
                  <div key={i} className={`flex items-start gap-2 ${entry.speaker === 'ai' ? 'justify-start' : 'justify-end'}`}>
                    {entry.speaker === 'ai' && (
                      <span className="w-2 h-2 bg-indigo-500 rounded-full mt-1.5 shrink-0" />
                    )}
                    <div className={`max-w-[80%] rounded-lg px-3 py-1.5 text-xs ${
                      entry.speaker === 'ai' ? 'bg-indigo-50 text-indigo-900' : 'bg-gray-100 text-gray-700'
                    }`}>
                      <span className="text-[10px] text-gray-400 block">{entry.timestamp}</span>
                      {entry.text}
                    </div>
                  </div>
                ))}
                <div ref={transcriptEndRef} />
              </div>
            </div>
          )}

          <div className="flex justify-center gap-4">
            {callState === 'idle' && (
              <button onClick={startCall}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-full hover:bg-green-700">
                <Phone size={20} /> Mulai Panggilan
              </button>
            )}
            {callState === 'connecting' && (
              <div className="flex items-center gap-2 px-6 py-3 bg-yellow-100 text-yellow-700 rounded-full">
                <div className="w-4 h-4 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin" />
                Menghubungkan...
              </div>
            )}
            {(callState === 'connected') && (
              <>
                <button onClick={() => setMuted(!muted)}
                  className={`p-3 rounded-full ${muted ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                  {muted ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <button onClick={endCall}
                  className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-full hover:bg-red-700">
                  <PhoneOff size={20} /> Akhiri
                </button>
              </>
            )}
            {callState === 'ended' && (
              <button onClick={() => setCallState('idle')}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700">
                <Play size={20} /> Mulai Ulang
              </button>
            )}
          </div>

          {messages.length > 0 && (
            <div className="border-t pt-4">
              <div className="max-h-32 overflow-auto space-y-1 text-left">
                {messages.map((msg, i) => (
                  <p key={i} className="text-sm text-gray-600">{msg}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

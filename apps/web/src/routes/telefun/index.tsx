import { useState, useRef, useEffect, useCallback } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Play, Square, AlertCircle } from 'lucide-react';

const VITE_TELEFUN_WS_URL = import.meta.env.VITE_TELEFUN_WS_URL || 'ws://localhost:3002';

type CallState = 'idle' | 'connecting' | 'connected' | 'ended';

export default function TelefunLanding() {
  const [callState, setCallState] = useState<CallState>('idle');
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [messages, setMessages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const durationRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    }
  }, [callState]);

  const startCall = useCallback(async () => {
    setError(null);
    setCallState('connecting');

    const token = localStorage.getItem('supabase_token');
    if (!token) { setError('Token tidak ditemukan. Silakan login terlebih dahulu.'); setCallState('idle'); return; }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ws = new WebSocket(`${VITE_TELEFUN_WS_URL}/?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setCallState('connected');
        setMessages(prev => [...prev, 'Terhubung ke Gemini Live...']);

        // Send setup message
        ws.send(JSON.stringify({
          setup: {
            model: 'models/gemini-3.1-flash-live-preview',
            systemInstruction: { parts: [{ text: 'Anda adalah konsumen yang menghubungi OJK. Bantu agen melatih kemampuan komunikasi.' }] },
            voiceConfig: { voice: { name: 'Kore' }, prebuiltVoiceConfig: { voiceName: 'Kore' } },
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

        // Start recording
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
          } else if (data.serverContent?.turnComplete) {
            setIsSpeaking(false);
          } else if (data.serverContent?.audioChunks) {
            // Audio response - play it
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
    } catch (err) {
      setError('Gagal mengakses mikrofon.');
      setCallState('ended');
    }
  }, []);

  const cleanup = useCallback(() => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    wsRef.current?.close();
    audioRef.current?.pause();
  }, []);

  const endCall = useCallback(() => {
    cleanup();
    setCallState('ended');
  }, [cleanup]);

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] gap-8">
      <div className="bg-white rounded-2xl border shadow-lg p-8 w-full max-w-sm text-center space-y-6">
        <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center transition-colors ${
          callState === 'connected' ? 'bg-green-100' : callState === 'connecting' ? 'bg-yellow-100' : 'bg-indigo-100'
        }`}>
          <Phone size={36} className={callState === 'connected' ? 'text-green-600' : 'text-indigo-600'} />
        </div>

        <div>
          <h2 className="text-xl font-bold">Telefun</h2>
          <p className="text-sm text-gray-500">Simulasi Panggilan Voice AI</p>
        </div>

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
  );
}

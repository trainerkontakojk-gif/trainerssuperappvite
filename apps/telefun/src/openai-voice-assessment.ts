import {
  parseVoiceQualityAssessment,
  TELEFUN_VOICE_ASSESSMENT_JSON_SCHEMA,
  type VoiceQualityAssessment,
} from "@trainers/types";
import type {
  OpenAIRealtimeSocketLike,
  OpenAIRealtimeSocketOptions,
} from "./providers/OpenAIRealtimeAdapter.js";
import {
  createOpenAIUsageAccumulator,
  observeOpenAIUsage,
  summarizeOpenAIUsageAccumulator,
  type OpenAIUsageAggregate,
} from "./usage.js";

export const SCORING_FUNCTION_NAME = "submit_voice_assessment";

export const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
export const DEFAULT_EVALUATION_TIMEOUT_MS = 60_000;
export const MAX_AUDIO_CHUNK_BYTES = 32 * 1024;
export const MAX_TOOL_ARGUMENT_BYTES = 64 * 1024;
export const MAX_ASSESSMENT_PCM_BYTES = 200 * 1024 * 1024;

export interface OpenAISocketFactory {
  (
    url: string,
    options?: OpenAIRealtimeSocketOptions,
  ): OpenAIRealtimeSocketLike;
}

export interface OpenAIAssessmentResult {
  assessment: VoiceQualityAssessment;
  usage: OpenAIUsageAggregate;
}

export class OpenAIAssessmentError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "OpenAIAssessmentError";
    this.code = code;
  }
}

const REALTIME_BASE_URL = "wss://api.openai.com/v1/realtime";

function buildInstructions(scenarioTitle: string): string {
  return [
    "Anda adalah pelatih vokal senior dan evaluator kualitas vokal untuk sesi latihan telemarketing Telefun OJK 157.",
    `Skenario latihan: ${scenarioTitle}.`,
    "Dengarkan rekaman audio agen (hanya satu pihak), lalu nilai 5 INDIKATOR WAJIB secara LENGKAP dan DETAIL melalui tools `submit_voice_assessment`. Jangan singkat, jangan generik.",
    "INDIKATOR WAJIB (skor 0-10 untuk setiap aspek, overallScore = rata-rata kelima aspek):",
    "1. Kecepatan Bicara: wordsPerMinute = angka mentah (100-180, ideal 130-150), score = kualitas. Feedback wajib sebutkan WPM aktual vs ideal, dampak, dan 1 tips tempo/jeda. Verdict 8-15 kata, feedback 2-3 kalimat minimal 35 kata.",
    "2. Intonasi: variasi nada, antusiasme vs monoton (0-3 datar, 4-6 minimal, 7-8 baik, 9-10 sangat hidup). Feedback wajib sebutkan datar/variatif, contoh frasa, dampak, dan 1 tips variasi nada.",
    "3. Artikulasi: kejelasan vokal/konsonan (0-3 bergumam, 4-6 cukup jelas, 7-8 jelas, 9-10 sangat presisi). Feedback wajib sebutkan kejelasan, contoh kata, dampak, dan 1 tips artikulasi.",
    "4. Kata Pengisi: count = jumlah mentah filler (hm, anu, gitu, eeeh), score = kualitas (10=0 filler, 7-8=1-2, 4-6=3-5, 0-3=>6). examples = kata aktual. Feedback wajib sebutkan jumlah, contoh, dampak profesionalisme, dan 1 tips jeda senyap.",
    "5. Nada Emosional: dominant = satu kata (empatik/hangat/tenang/datar), score = empati & percaya diri. Feedback wajib sebutkan dominant, emosi terdengar, dampak kepercayaan, dan 1 tips empati nada.",
    "WAJIB: transcript verbatim lengkap (jangan ringkas, minimal 20 kata jika durasi >15 detik), highlights 3-5 poin (15-30 kata tiap poin), strengths 3-5 kelebihan spesifik (12-25 kata).",
    "ATURAN KUALITAS: Semua teks WAJIB Bahasa Indonesia 100%. Setiap verdict 8-15 kata. Setiap feedback 2-3 kalimat 35-90 kata dengan 50% apresiasi + 50% kritik konstruktif (observasi konkret + dampak + saran actionable). Skor konsisten dengan narasi. Jangan mengarang WPM/count/target radar. Jangan generik seperti 'sudah baik' tanpa detail.",
    "Gunakan tools `submit_voice_assessment` dan jangan memberikan umpan balik di luar skema.",
  ].join(" ");
}

/**
 * Run a one-shot, provider-matched GPT Realtime voice assessment against the
 * stored agent recording. The connection is isolated: it does NOT use the
 * production telefun WebSocket wiring, it only appends the supplied PCM audio,
 * commits, and requests a single text response that MUST call the scoring tool.
 *
 * The result is validated through `parseVoiceQualityAssessment` so untrusted
 * model output can never reach the persisted domain object.
 */
export function evaluateOpenAIVoiceAssessment({
  modelId,
  userId: _userId,
  scenarioTitle,
  pcmAudio,
  apiKey,
  createSocket,
  connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
  evaluationTimeoutMs = DEFAULT_EVALUATION_TIMEOUT_MS,
  instructions,
}: {
  modelId: string;
  userId: string;
  scenarioTitle: string;
  pcmAudio: Buffer;
  apiKey: string;
  createSocket: OpenAISocketFactory;
  connectTimeoutMs?: number;
  evaluationTimeoutMs?: number;
  instructions?: string;
}): Promise<OpenAIAssessmentResult> {
  return new Promise<OpenAIAssessmentResult>((resolve, reject) => {
    if (
      pcmAudio.byteLength === 0 ||
      pcmAudio.byteLength > MAX_ASSESSMENT_PCM_BYTES
    ) {
      reject(
        new OpenAIAssessmentError(
          "Audio penilaian kosong atau melebihi batas ukuran.",
          "INVALID_AUDIO",
        ),
      );
      return;
    }
    const url = `${REALTIME_BASE_URL}?model=${encodeURIComponent(modelId)}`;
    const socket = createSocket(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    let settled = false;
    let audioSent = false;
    const cleanup = () => {
      clearTimeout(connectTimer);
      clearTimeout(evalTimer);
      socket.removeAllListeners?.();
    };

    const finish = (
      err: OpenAIAssessmentError | null,
      value?: OpenAIAssessmentResult,
    ) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) {
        socket.terminate();
        reject(err);
        return;
      }
      socket.close(1000, "assessment-complete");
      resolve(value!);
    };

    const connectTimer = setTimeout(() => {
      finish(
        new OpenAIAssessmentError(
          "Koneksi realtime timeout.",
          "CONNECT_TIMEOUT",
        ),
      );
    }, connectTimeoutMs);

    const evalTimer = setTimeout(() => {
      finish(
        new OpenAIAssessmentError(
          "Evaluasi melebihi batas waktu.",
          "EVALUATION_TIMEOUT",
        ),
      );
    }, evaluationTimeoutMs);

    socket.on("open", () => {
      clearTimeout(connectTimer);

      socket.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            model: modelId,
            output_modalities: ["text"],
            audio: {
              input: {
                format: { type: "audio/pcm", rate: 24_000 },
                turn_detection: null,
              },
            },
            tools: [
              {
                type: "function",
                name: SCORING_FUNCTION_NAME,
                description:
                  "Kembalikan penilaian kualitas vokal terstruktur untuk rekaman agen.",
                parameters: TELEFUN_VOICE_ASSESSMENT_JSON_SCHEMA,
              },
            ],
            tool_choice: { type: "function", name: SCORING_FUNCTION_NAME },
            instructions: instructions ?? buildInstructions(scenarioTitle),
          },
        }),
      );
    });

    socket.on("message", (data) => {
      let event: any;
      try {
        event = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (event?.type === "session.updated" && !audioSent) {
        audioSent = true;
        for (
          let offset = 0;
          offset < pcmAudio.byteLength;
          offset += MAX_AUDIO_CHUNK_BYTES
        ) {
          socket.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: pcmAudio
                .subarray(offset, offset + MAX_AUDIO_CHUNK_BYTES)
                .toString("base64"),
            }),
          );
        }
        socket.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        socket.send(JSON.stringify({ type: "response.create" }));
        return;
      }

      if (event?.type === "error") {
        finish(
          new OpenAIAssessmentError(
            "Layanan Realtime menolak permintaan penilaian.",
            "UPSTREAM_ERROR",
          ),
        );
        return;
      }
      if (event?.type !== "response.done") return;

      const response = event.response ?? {};
      if (response.status !== "completed") {
        finish(
          new OpenAIAssessmentError(
            "Respons penilaian tidak selesai.",
            "UPSTREAM_INCOMPLETE",
          ),
        );
        return;
      }
      const outputs = Array.isArray(response.output) ? response.output : [];
      const call = outputs.find(
        (o: any) =>
          o?.type === "function_call" && o?.name === SCORING_FUNCTION_NAME,
      );

      if (!call) {
        finish(
          new OpenAIAssessmentError(
            "Respons tidak memanggil alat penilaian yang diharapkan.",
            "INVALID_ASSESSMENT",
          ),
        );
        return;
      }

      let parsedArgs: unknown;
      if (
        typeof call.arguments !== "string" ||
        Buffer.byteLength(call.arguments, "utf8") > MAX_TOOL_ARGUMENT_BYTES
      ) {
        finish(
          new OpenAIAssessmentError(
            "Argumen alat penilaian tidak valid.",
            "INVALID_ASSESSMENT",
          ),
        );
        return;
      }
      try {
        parsedArgs = JSON.parse(call.arguments);
      } catch {
        finish(
          new OpenAIAssessmentError(
            "Argumen alat penilaian bukan JSON valid.",
            "INVALID_ASSESSMENT",
          ),
        );
        return;
      }

      const assessment = parseVoiceQualityAssessment(parsedArgs);
      if (!assessment) {
        finish(
          new OpenAIAssessmentError(
            "Hasil penilaian tidak lolos validasi skema.",
            "INVALID_ASSESSMENT",
          ),
        );
        return;
      }

      const usageAccumulator = createOpenAIUsageAccumulator();
      observeOpenAIUsage(usageAccumulator, {
        source: "openai_realtime_response",
        id:
          typeof response.id === "string" ? response.id : "assessment-response",
        usage: response.usage,
      });
      const usage = summarizeOpenAIUsageAccumulator(usageAccumulator);
      if (!usage || usage.unpriceableUsageCount > 0) {
        finish(
          new OpenAIAssessmentError(
            "Penggunaan token tidak tersedia dari upstream.",
            "MISSING_USAGE",
          ),
        );
        return;
      }

      finish(null, {
        assessment,
        usage,
      });
    });

    socket.on("error", (_error) => {
      finish(
        new OpenAIAssessmentError(
          "Koneksi Realtime mengalami gangguan.",
          "SOCKET_ERROR",
        ),
      );
    });

    socket.on("close", (code) => {
      if (!settled) {
        finish(
          new OpenAIAssessmentError(
            `Koneksi ditutup sebelum selesai (code ${code}).`,
            "SOCKET_CLOSED",
          ),
        );
      }
    });
  });
}

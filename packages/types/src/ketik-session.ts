import { z } from "zod";
import {
  KETIK_PROMPT_LIMITS,
  type ChatMessage,
  type KetikScenario,
  type KetikSessionConfig,
} from "./ketik";
import {
  simulationSubjectSelectionSchema,
  type SimulationSubjectSnapshot,
} from "./simulation-subject";

export const startKetikSessionSchema = z.strictObject({
  requestId: z.uuid(),
  simulationSubject: simulationSubjectSelectionSchema.optional(),
});
export const ketikSessionTurnSchema = z.strictObject({
  requestId: z.uuid(),
  expectedVersion: z.number().int().min(0),
  text: z.string().trim().min(1).max(KETIK_PROMPT_LIMITS.chatMessageText),
});
export const finishKetikSessionSchema = z.strictObject({});
export type KetikSessionTurnRequest = z.infer<typeof ketikSessionTurnSchema>;
export interface KetikServerSession {
  id: string;
  state: "active" | "ended" | "discarded";
  version: number;
  startedAt: string;
  expiresAt: string;
  config: KetikSessionConfig;
  scenario: KetikScenario;
  simulationSubject: SimulationSubjectSnapshot;
  messages: ChatMessage[];
  consumerClosed: boolean;
  provenance: "server_v1";
  pendingTurn:
    | (KetikSessionTurnRequest & {
        status: "processing" | "failed";
        leaseExpiresAt: string | null;
      })
    | null;
}
export const KETIK_SESSION_ERRORS = {
  SESSION_NOT_FOUND: "Sesi tidak ditemukan.",
  SESSION_FAILED: "Sesi belum bisa diproses. Coba lagi.",
  SESSION_CONFLICT:
    "Sesi sudah berubah atau masih memproses pesan. Muat ulang atau coba lagi.",
  SESSION_EXPIRED:
    "Waktu sesi sudah berakhir. Akhiri chat untuk menyimpan percakapan.",
  ASSIGNMENT_REQUIRED:
    "Belum ada penugasan. Hubungi trainer untuk mendapatkan skenario latihan.",
  SESSION_CONFIGURATION_INVALID:
    "Aktifkan skenario dan pilih karakter konsumen di Pengaturan.",
  SESSION_AI_FAILED:
    "Balasan konsumen belum tersedia. Coba lagi untuk pesan yang sama.",
  LEGACY_SESSION_WRITE_DISABLED:
    "Versi chat ini tidak didukung. Muat ulang halaman untuk memulai sesi server.",
} as const;

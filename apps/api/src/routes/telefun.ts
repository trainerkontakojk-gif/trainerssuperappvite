import { Hono } from "hono";
import { User } from "@supabase/supabase-js";
import { requireCapability } from "../middleware/role";
import { telefunSessions } from "./telefun/sessions";
import { telefunCapabilities } from "./telefun/capabilities";
import { telefunRecordings } from "./telefun/recordings";
import { telefunSettings } from "./telefun/settings";
import { telefunAnnotations } from "./telefun/annotations";
import { telefunRemuxRecording } from "./telefun/remux-recording";
import { telefunRerun } from "./telefun/rerun";

type Variables = { user: User; profile: any };
const telefun = new Hono<{ Variables: Variables }>();

// Semua peran boleh membuka Telefun; mulai panggilan dibatasi kuota harian
// (POST /sessions), dan analisis ulang AI hanya untuk telefun.manage.
telefun.use("*", requireCapability("telefun.use"));

telefun.route("/", telefunCapabilities);
telefun.route("/", telefunSessions);
telefun.route("/", telefunRecordings);
telefun.route("/", telefunSettings);
telefun.route("/", telefunAnnotations);
telefun.route("/", telefunRemuxRecording);
telefun.route("/", telefunRerun);

export { telefun };

// Re-export helpers for test backward compatibility
export {
  buildTelefunSessionInsertPayload,
  buildTelefunSessionUpdatePayload,
} from "./telefun/sessions";
export {
  buildTelefunFeedbackSummary,
  isTelefunRecordingPathOwnedBySession,
} from "./telefun/recordings";
export { buildTelefunSettingsUpsertPayload } from "./telefun/settings";
export { buildSeekablePath } from "./telefun/remux-recording";

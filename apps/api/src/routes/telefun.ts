import { Hono } from "hono";
import { User } from "@supabase/supabase-js";
import { requireRole } from "../middleware/role";
import { telefunSessions } from "./telefun/sessions";
import { telefunCapabilities } from "./telefun/capabilities";
import { telefunRecordings } from "./telefun/recordings";
import { telefunSettings } from "./telefun/settings";
import { telefunAnnotations } from "./telefun/annotations";
import { telefunRemuxRecording } from "./telefun/remux-recording";

type Variables = { user: User; profile: any };
const telefun = new Hono<{ Variables: Variables }>();

// Semua route Telefun hanya untuk admin/trainer — agent & leader tidak diizinkan
telefun.use("*", requireRole("admin", "trainer"));

telefun.route("/", telefunCapabilities);
telefun.route("/", telefunSessions);
telefun.route("/", telefunRecordings);
telefun.route("/", telefunSettings);
telefun.route("/", telefunAnnotations);
telefun.route("/", telefunRemuxRecording);

export { telefun };

// Re-export helpers for test backward compatibility
export { buildTelefunSessionInsertPayload, buildTelefunSessionUpdatePayload } from "./telefun/sessions";
export { buildTelefunFeedbackSummary, isTelefunRecordingPathOwnedBySession } from "./telefun/recordings";
export { buildTelefunSettingsUpsertPayload } from "./telefun/settings";
export { buildSeekablePath } from "./telefun/remux-recording";

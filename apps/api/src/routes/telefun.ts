import { Hono } from "hono";
import { User } from "@supabase/supabase-js";
import { telefunSessions } from "./telefun/sessions";
import { telefunRecordings } from "./telefun/recordings";
import { telefunSettings } from "./telefun/settings";
import { telefunAnnotations } from "./telefun/annotations";

type Variables = { user: User; profile: any };
const telefun = new Hono<{ Variables: Variables }>();

telefun.route("/", telefunSessions);
telefun.route("/", telefunRecordings);
telefun.route("/", telefunSettings);
telefun.route("/", telefunAnnotations);

export { telefun };

// Re-export helpers for test backward compatibility
export { buildTelefunSessionInsertPayload, buildTelefunSessionUpdatePayload } from "./telefun/sessions";
export { buildTelefunFeedbackSummary, isTelefunRecordingPathOwnedBySession } from "./telefun/recordings";
export { buildTelefunSettingsUpsertPayload } from "./telefun/settings";

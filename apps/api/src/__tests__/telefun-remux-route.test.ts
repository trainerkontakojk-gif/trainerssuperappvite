import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const state = vi.hoisted(() => ({
  session: {
    user_id: "user-1",
    recording_path: "user-1/session-1/full_call.webm" as string | null,
    agent_recording_path: null as string | null,
  },
  updateError: null as { message: string } | null,
}));

const mocks = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
  remuxWebM: vi.fn(),
  checkFFmpegAvailable: vi.fn(),
}));

vi.mock("../lib/telefun-ffmpeg", () => ({
  checkFFmpegAvailable: mocks.checkFFmpegAvailable,
  remuxWebM: mocks.remuxWebM,
}));

vi.mock("../lib/supabase", () => ({
  createAdminClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: mocks.createSignedUrl,
        upload: mocks.upload,
        remove: mocks.remove,
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: state.session, error: null })),
        })),
      })),
      update: mocks.update,
    })),
  })),
}));

import { telefunRemuxRecording } from "../routes/telefun/remux-recording";

type Variables = { user: User; profile: unknown };

function buildApp() {
  const app = new Hono<{ Variables: Variables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1" } as User);
    c.set("profile", { role: "agent" });
    await next();
  });
  app.route("/", telefunRemuxRecording);
  return app;
}

describe("POST /remux-recording/:sessionId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.session = {
      user_id: "user-1",
      recording_path: "user-1/session-1/full_call.webm",
      agent_recording_path: null,
    };
    state.updateError = null;
    mocks.checkFFmpegAvailable.mockResolvedValue("ffmpeg version");
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example/source.webm" },
      error: null,
    });
    mocks.remuxWebM.mockResolvedValue(Buffer.from("seekable"));
    mocks.upload.mockResolvedValue({ error: null });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.update.mockImplementation(() => ({
      eq: vi.fn(async () => ({ error: state.updateError })),
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(Buffer.from("source"), { status: 200 })),
    );
  });

  it("treats an existing seekable path as an idempotent success", async () => {
    state.session.recording_path =
      "user-1/session-1/full_call.seekable.webm";

    const response = await buildApp().request(
      "/remux-recording/session-1",
      { method: "POST" },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: { remuxed: true },
    });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("removes newly uploaded seekable objects when the DB path update fails", async () => {
    state.updateError = { message: "update failed" };

    const response = await buildApp().request(
      "/remux-recording/session-1",
      { method: "POST" },
    );

    expect(response.status).toBe(500);
    expect(mocks.remove).toHaveBeenCalledWith([
      "user-1/session-1/full_call.seekable.webm",
    ]);
    expect(mocks.remove).not.toHaveBeenCalledWith([
      "user-1/session-1/full_call.webm",
    ]);
  });
});

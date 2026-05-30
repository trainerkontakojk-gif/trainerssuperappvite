import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { User } from "@supabase/supabase-js";
import { createAdminClient } from "../../lib/supabase";
import { generateGeminiContent } from "../../lib/gemini";

type Variables = { user: User; profile: any };

const telefunAnnotations = new Hono<{ Variables: Variables }>();

telefunAnnotations.get("/annotations/:id", async (c) => {
  const sessionId = c.req.param("id");
  const user = c.get("user");
  const profile = c.get("profile");
  const adminClient = createAdminClient();

  try {
    const { data: session, error: sessionError } = await adminClient
      .from("telefun_history")
      .select("user_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Sesi tidak ditemukan." },
        },
        404,
      );
    }

    const isManager = ["admin", "trainer", "qa"].includes(profile?.role);
    if (!isManager && session.user_id !== user.id) {
      return c.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Anda tidak memiliki akses ke sesi ini.",
          },
        },
        403,
      );
    }

    const { data, error } = await adminClient
      .from("telefun_replay_annotations")
      .select("*")
      .eq("session_id", sessionId)
      .order("timestamp_ms", { ascending: true });

    if (error) throw error;
    return c.json({ success: true, data: data ?? [] });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: {
          code: "DATABASE_ERROR",
          message: error?.message || "Database error.",
        },
      },
      500,
    );
  }
});

telefunAnnotations.post(
  "/annotations/:id",
  zValidator(
    "json",
    z.object({
      timestamp_ms: z.number().int(),
      category: z.enum([
        "strength",
        "improvement_area",
        "critical_moment",
        "technique_used",
      ]),
      moment: z.string(),
      text: z.string().max(500),
      is_manual: z.boolean().default(true),
    }),
  ),
  async (c) => {
    const sessionId = c.req.param("id");
    const user = c.get("user");
    const profile = c.get("profile");
    const adminClient = createAdminClient();
    const body = c.req.valid("json");

    try {
      const { data: session, error: sessionError } = await adminClient
        .from("telefun_history")
        .select("user_id")
        .eq("id", sessionId)
        .maybeSingle();

      if (sessionError) throw sessionError;
      if (!session) {
        return c.json(
          {
            success: false,
            error: { code: "NOT_FOUND", message: "Sesi tidak ditemukan." },
          },
          404,
        );
      }

      const isManager = ["admin", "trainer", "qa"].includes(profile?.role);
      if (!isManager && session.user_id !== user.id) {
        return c.json(
          {
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Anda tidak memiliki akses ke sesi ini.",
            },
          },
          403,
        );
      }

      const { data, error } = await adminClient
        .from("telefun_replay_annotations")
        .insert({
          session_id: sessionId,
          user_id: session.user_id,
          timestamp_ms: body.timestamp_ms,
          category: body.category,
          moment: body.moment,
          text: body.text,
          is_manual: true,
        })
        .select()
        .single();

      if (error) throw error;
      return c.json({ success: true, data });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: {
            code: "DATABASE_ERROR",
            message: error?.message || "Database error.",
          },
        },
        500,
      );
    }
  },
);

telefunAnnotations.delete("/annotations/:annotationId", async (c) => {
  const annotationId = c.req.param("annotationId");
  const user = c.get("user");
  const profile = c.get("profile");
  const adminClient = createAdminClient();

  try {
    const { data: annotation, error: fetchError } = await adminClient
      .from("telefun_replay_annotations")
      .select("user_id, session_id, is_manual")
      .eq("id", annotationId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!annotation) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Anotasi tidak ditemukan." },
        },
        404,
      );
    }

    const isManager = ["admin", "trainer", "qa"].includes(profile?.role);
    if (!isManager && annotation.user_id !== user.id) {
      return c.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Anda tidak memiliki akses untuk menghapus anotasi ini.",
          },
        },
        403,
      );
    }

    if (!annotation.is_manual) {
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Hanya anotasi manual yang dapat dihapus.",
          },
        },
        400,
      );
    }

    const { error: deleteError } = await adminClient
      .from("telefun_replay_annotations")
      .delete()
      .eq("id", annotationId)
      .eq("is_manual", true);

    if (deleteError) throw deleteError;
    return c.json({ success: true, message: "Anotasi berhasil dihapus." });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: {
          code: "DATABASE_ERROR",
          message: error?.message || "Database error.",
        },
      },
      500,
    );
  }
});

// --- AI Annotation Generation ---

export const REPLAY_ANNOTATION_SCHEMA = {
  type: "object",
  properties: {
    annotations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          timestamp_ms: { type: "number", description: "Waktu dalam milidetik pada rekaman" },
          category: {
            type: "string",
            enum: ["strength", "improvement_area", "critical_moment", "technique_used"],
          },
          moment: {
            type: "string",
            enum: ["missed_empathy", "good_de_escalation", "long_pause", "interruption", "technique_usage"],
          },
          text: { type: "string", description: "Deskripsi maksimal 500 karakter", maxLength: 500 },
        },
        required: ["timestamp_ms", "category", "moment", "text"],
      },
      maxItems: 30,
    },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          priority: { type: "number", minimum: 1, maximum: 5 },
        },
        required: ["text", "priority"],
      },
      maxItems: 5,
    },
  },
  required: ["annotations", "recommendations"],
};

telefunAnnotations.post("/annotations/generate/:id", async (c) => {
  const sessionId = c.req.param("id");
  const user = c.get("user");
  const profile = c.get("profile");
  const adminClient = createAdminClient();

  try {
    // 1. Validate session ownership
    const { data: session, error: sessionError } = await adminClient
      .from("telefun_history")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session) {
      return c.json(
        { success: false, error: { code: "NOT_FOUND", message: "Sesi tidak ditemukan." } },
        404,
      );
    }

    const isManager = ["admin", "trainer", "qa"].includes(profile?.role);
    if (!isManager && session.user_id !== user.id) {
      return c.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Anda tidak memiliki akses ke sesi ini." },
        },
        403,
      );
    }

    // 2. Get recording
    const recordingPath = session.agent_recording_path;
    if (!recordingPath) {
      return c.json(
        {
          success: false,
          error: { code: "NO_RECORDING", message: "Tidak ada rekaman agen untuk sesi ini." },
        },
        400,
      );
    }

    const { data: audioData, error: downloadError } = await adminClient.storage
      .from("telefun-recordings")
      .download(recordingPath);

    if (downloadError || !audioData) {
      return c.json(
        {
          success: false,
          error: { code: "DOWNLOAD_FAILED", message: "Gagal mengunduh rekaman." },
        },
        500,
      );
    }

    const base64Audio = Buffer.from(await audioData.arrayBuffer()).toString("base64");

    // 3. Call Gemini for annotations
    const prompt = `Analisis rekaman telepon simulasi layanan konsumen berikut.
Skenario: ${session.scenario_title || "Tidak diketahui"}
Konsumen: ${session.consumer_name || "Tidak diketahui"}

Identifikasi momen-momen penting dalam percakapan:
- strength: Kekuatan agen (penanganan baik, empati, solusi tepat)
- improvement_area: Area yang perlu perbaikan
- critical_moment: Momen kritis (eskalasi, konfrontasi, titik balik)
- technique_used: Teknik yang digunakan (probing, clarifying, summarizing)

Jenis momen (moment):
- missed_empathy: Kesempatan empati terlewat
- good_de_escalation: De-eskalasi yang baik
- long_pause: Jeda panjang yang signifikan
- interruption: Interupsi
- technique_usage: Penggunaan teknik spesifik

Berikan maksimal 30 anotasi dan 5 rekomendasi coaching. Deskripsi maksimal 500 karakter.`;

    const result = await generateGeminiContent({
      model: "gemini-3.1-flash-lite",
      systemInstruction:
        "Anda adalah pelatih komunikasi profesional. Analisis rekaman telepon dan berikan catatan objektif dalam format JSON. Gunakan Bahasa Indonesia.",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "audio/webm",
                data: base64Audio,
              },
            },
          ],
        },
      ],
      responseMimeType: "application/json",
      responseSchema: REPLAY_ANNOTATION_SCHEMA,
      usageContext: { module: "telefun", action: "replay-annotation-generation" },
      userId: user.id,
    });

    const resultText = result.text || "";
    let parsed: { annotations?: any[]; recommendations?: any[] } = {};
    try {
      parsed = JSON.parse(resultText);
    } catch {
      const match = resultText.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    const annotations = (parsed.annotations || []).slice(0, 30);
    const recommendations = (parsed.recommendations || []).slice(0, 5);

    if (annotations.length === 0) {
      return c.json(
        {
          success: false,
          error: { code: "NO_ANNOTATIONS", message: "AI tidak menghasilkan anotasi." },
        },
        500,
      );
    }

    // 4. Delete stale AI annotations
    await adminClient
      .from("telefun_replay_annotations")
      .delete()
      .eq("session_id", sessionId)
      .eq("is_manual", false);

    // 5. Insert new AI annotations
    const annotationRows = annotations.map((a: any) => ({
      session_id: sessionId,
      user_id: session.user_id,
      timestamp_ms: a.timestamp_ms,
      category: a.category,
      moment: a.moment,
      text: (a.text || "").slice(0, 500),
      is_manual: false,
    }));

    const { data: insertedAnnotations, error: insertError } = await adminClient
      .from("telefun_replay_annotations")
      .insert(annotationRows)
      .select("*");

    if (insertError) throw insertError;

    // 6. Update coaching summary
    const checksum = Buffer.from(
      JSON.stringify(
        annotations
          .map((a: any) => `${a.timestamp_ms}:${a.category}:${a.text}`)
          .sort()
          .join("|"),
      ),
    ).toString("base64").slice(0, 64);

    await adminClient.rpc("upsert_telefun_coaching_summary", {
      p_session_id: sessionId,
      p_user_id: session.user_id,
      p_recommendations: recommendations.map((r: any) => ({
        text: r.text,
        priority: r.priority,
      })),
      p_ai_annotation_count: annotations.length,
      p_ai_annotation_checksum: checksum,
    });

    return c.json({
      success: true,
      data: {
        annotations: insertedAnnotations || [],
        recommendations,
      },
    });
  } catch (error: any) {
    console.error("[Telefun] Annotation generation error:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "GENERATION_ERROR",
          message: error?.message || "Gagal menghasilkan anotasi.",
        },
      },
      500,
    );
  }
});

export { telefunAnnotations };

import { expect } from "@playwright/test";
import { createAdmin, runSql, type LoopbackEnv } from "./sidakRealBackend";

// Synthetic assessment/audio transport controls, never real model output.
export const telefunQueueAssessment = {
  overallScore: 8.3,
  speakingRate: {
    score: 8.3,
    wordsPerMinute: 140,
    verdict: "Tempo stabil dan nyaman didengar.",
    feedback:
      "Tempo bicara stabil dan jelas sehingga konsumen mudah mengikuti penjelasan tanpa kehilangan inti informasi yang disampaikan agen.",
  },
  intonation: {
    score: 8.3,
    verdict: "Intonasi terdengar hangat dan bervariasi.",
    feedback:
      "Intonasi terdengar hangat dan bervariasi sehingga konsumen dapat mengikuti penjelasan dengan nyaman sepanjang percakapan berlangsung.",
  },
  articulation: {
    score: 8.3,
    verdict: "Artikulasi jelas pada bagian utama percakapan.",
    feedback:
      "Artikulasi terdengar jelas pada bagian utama percakapan sehingga konsumen dapat memahami keterangan agen tanpa perlu meminta pengulangan.",
  },
  fillerWords: {
    score: 8.3,
    count: 0,
    examples: [],
    verdict: "Kata pengisi tidak mengganggu penyampaian informasi.",
    feedback:
      "Kata pengisi tidak terdengar mengganggu sehingga penjelasan agen tetap runtut dan konsumen dapat berfokus pada isi pembicaraan.",
  },
  emotionalTone: {
    score: 8.3,
    dominant: "tenang",
    verdict: "Nada emosional tenang dan menjaga kenyamanan konsumen.",
    feedback:
      "Nada emosional terdengar tenang dan menjaga kenyamanan konsumen sehingga percakapan terasa profesional serta tidak tergesa-gesa.",
  },
  transcript:
    "Selamat siang, dengan layanan konsumen. Apa yang dapat saya bantu?",
  highlights: [
    "Agen membuka percakapan dengan sapaan yang jelas dan memperkenalkan layanan secara ringkas.",
    "Agen menyampaikan informasi dengan tempo stabil sehingga konsumen dapat mengikuti penjelasan.",
    "Agen menutup percakapan dengan sopan setelah memastikan kebutuhan konsumen dipahami.",
  ],
  strengths: [
    "Agen menyapa konsumen dengan jelas dan langsung memperkenalkan layanan yang tersedia.",
    "Agen menjaga tempo bicara tetap stabil selama menjelaskan informasi kepada konsumen.",
    "Agen menggunakan nada tenang dan menutup percakapan secara sopan.",
  ],
  holdManagement: null,
};

export function telefunQueueProviderResponse(): Response {
  return Response.json({
    candidates: [
      {
        content: {
          role: "model",
          parts: [{ text: JSON.stringify(telefunQueueAssessment) }],
        },
        finishReason: "STOP",
      },
    ],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 5,
      totalTokenCount: 15,
    },
  });
}

/** Delete only run-owned fixtures and require exact zero-row readback. */
export async function cleanupTelefunQueueFixtures(
  env: LoopbackEnv,
  userId: string,
  sessionIds: string[],
  storagePaths: string[],
) {
  // All mutations below are bounded to UUIDs created by this fixture run.
  expect(userId).toMatch(/^[0-9a-f-]{36}$/i);
  for (const id of sessionIds) expect(id).toMatch(/^[0-9a-f-]{36}$/i);
  const admin = createAdmin(env);
  // Soft checks allow all cleanup steps to run even if an earlier delete fails.
  if (storagePaths.length > 0) {
    const removed = await admin.storage
      .from("telefun-recordings")
      .remove(storagePaths);
    expect.soft(removed.error, "remove Storage fixtures").toBeNull();
  }
  if (sessionIds.length > 0) {
    // Contract assertions have finished. These direct-insert fixtures have no
    // broker attempts; terminalize only this run's still-nonterminal history so
    // the active-WebRTC delete guard remains enforced during teardown.
    const terminalized = await admin
      .from("telefun_history")
      .update({ status: "failed" })
      .eq("user_id", userId)
      .in("id", sessionIds)
      .in("status", ["active", "pending"])
      .select("id, status");
    expect.soft(terminalized.error, "terminalize run sessions").toBeNull();
    expect
      .soft(
        (terminalized.data ?? []).every(
          (row) => sessionIds.includes(row.id) && row.status === "failed",
        ),
        "only exact run sessions may be terminalized",
      )
      .toBe(true);
    const deleted = await admin
      .from("telefun_history")
      .delete()
      .eq("user_id", userId)
      .in("id", sessionIds);
    expect.soft(deleted.error, "delete run sessions").toBeNull();
  }
  const usageDeleted = await admin
    .from("ai_usage_logs")
    .delete()
    .eq("user_id", userId);
  expect.soft(usageDeleted.error, "delete run usage rows").toBeNull();
  const userDeleted = await admin.auth.admin.deleteUser(userId);
  expect.soft(userDeleted.error, "delete run auth user").toBeNull();

  // Storage download errors could mean 503, not absence. Count persisted rows.
  const remaining = JSON.parse(
    runSql(
      env,
      `
    SELECT json_build_object(
      'sessions', (SELECT count(*) FROM public.telefun_history WHERE user_id = '${userId}'),
      'usage', (SELECT count(*) FROM public.ai_usage_logs WHERE user_id = '${userId}'),
      'profiles', (SELECT count(*) FROM public.profiles WHERE id = '${userId}'),
      'users', (SELECT count(*) FROM auth.users WHERE id = '${userId}'),
      'storage', (SELECT count(*) FROM storage.objects
        WHERE bucket_id = 'telefun-recordings' AND name LIKE '${userId}/%')
    )::text;
  `,
    ),
  );
  expect(remaining, "fixture cleanup readback must be zero").toEqual({
    sessions: 0,
    usage: 0,
    profiles: 0,
    users: 0,
    storage: 0,
  });
}

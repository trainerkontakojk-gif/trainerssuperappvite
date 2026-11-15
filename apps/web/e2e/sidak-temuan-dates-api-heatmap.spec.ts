/**
 * E2E kontrak TANGGAL untuk `qa_temuan` — Fase 1 heatmap SIDAK.
 *
 * Dipecah per lapisan: kontrak validasi (`sidak-temuan-dates-api-contract`),
 * persistence (`-persistence`), dan agregasi heatmap (`-heatmap`). Guard,
 * pin env, dan fixture bersama ada di `helpers/sidakTemuanDatesApiHarness.ts`.
 *
 * Lapisan yang diuji:
 *   A. Shared schema di `@trainers/types` — sumber kebenaran tunggal yang dipakai
 *      route create/batch/preview/update.
 *   B. Router Hono ASLI (`apps/api/src/routes/sidak/temuan.ts`) dengan
 *      `requireRole` ASLI. Validasi Sharing jalan SEBELUM service dipanggil,
 *      jadi jalur "tidak valid" benar-benar tidak menyentuh database.
 *   C. Migrasi di database disposable lokal: kolom ada, `date`, nullable, dan
 *      baris lama tetap NULL (bukti tidak ada backfill).
 *
 * Keamanan target (wajib, bukan opsional):
 *   `apps/api/src/lib/env.ts` memanggil `process.loadEnvFile(".env.local")` dan
 *   `supabaseAdmin` dibuat PADA SAAT IMPORT dengan service-role key. Kalau spec
 *   ini mengimpor router tanpa_COMMAND pin, `supabaseAdmin` akan terikat ke
 *   project remote dan service bisa menulis ke sana. Jadi:
 *     1. Env Supabase di-pin ke loopback yang tidak listening SEBELUM import
 *        router. `process.loadEnvFile` tidak menimpa variabel yang sudah ada
 *        (dibuktikan di Node v26), jadi pin ini bertahan.
 *     2. `globalThis.fetch` diganti guard fail-closed: host non-loopback langsung
 *        ditolak dan dicatat, sehingga tidak ada jalan egress meski pin somehow
 *        gagal. Setiap test asserting "service tidak terpanggil" memakai penghitung
 *        `remoteAttempts()`.
 */
import { expect, test } from "@playwright/test";
import { cleanupSlikRuleFixture } from "./helpers/sidakSlikFixture";
import {
  guard,
  installTemuanFetchGuard,
  sql,
  sqlUuid,
  type TemuanFixture,
  fixtureSetup,
  getSidakHeatmap,
  mountHeatmapRouter,
  admin,
  createUserWithJwt,
  userClient,
  seedRows,
  seedLeaderSidakScope,
} from "./helpers/sidakTemuanDatesApiHarness";

/**
 * Teardown `fetch`. `process.env` SENGAJA tidak dipin di level modul — lihat
 * `loadApiModules`. Playwright menjalankan tiap file spec di proses worker
 * yang diwarisi dari proses sebelumnya, sehingga pin env di level modul bocor ke
 * file lain dan tidak bisa dipulihkan dari dalam file ini. Env dipin hanya
 * selama import router dan langsung dikembalikan setelahnya.
 */
test.afterAll(() => {
  globalThis.fetch = guard.originalFetch;
  guard.fetchPatched = false;
});

installTemuanFetchGuard();

test.describe("Heatmap agregasi", () => {
  let fx: TemuanFixture;
  let trainerToken: string;
  let leaderToken: string;
  let trainerUserId: string;
  let leaderUserId: string;
  let lockedLeaderUserId: string;
  let lockedLeaderToken: string;

  let otherPesertaId: string | null = null;
  const leaderGroupIds: string[] = [];

  test.beforeAll(async () => {
    fx = fixtureSetup();
    const trainer = await createUserWithJwt("trainer");
    const leader = await createUserWithJwt("leader");
    const lockedLeader = await createUserWithJwt("leader");
    trainerToken = trainer.token;
    leaderUserId = leader.userId;
    trainerUserId = trainer.userId;
    leaderToken = leader.token;
    lockedLeaderUserId = lockedLeader.userId;
    lockedLeaderToken = lockedLeader.token;

    // Scope leader: satu tanpa lock layanan, satu terkunci ke `call`.
    leaderGroupIds.push(seedLeaderSidakScope(leaderUserId, fx.pesertaId));
    leaderGroupIds.push(
      seedLeaderSidakScope(lockedLeaderUserId, fx.pesertaId, ["call"]),
    );
  });

  test.afterAll(async () => {
    if (otherPesertaId) {
      sql(
        `DELETE FROM public.profiler_peserta WHERE id = '${otherPesertaId}';`,
      );
    }
    if (fx?.pesertaId) {
      sql(`DELETE FROM public.profiler_peserta WHERE id = '${fx.pesertaId}';`);
      sql(
        `DELETE FROM public.profiler_folders WHERE name = '${fx.folderName}';`,
      );
      cleanupSlikRuleFixture(sql, fx.slik);
    }
    if (leaderGroupIds.length > 0) {
      sql(
        `DELETE FROM public.access_groups WHERE id IN ('${leaderGroupIds.join("','")}');`,
      );
    }
    for (const id of [trainerUserId, leaderUserId, lockedLeaderUserId]) {
      if (id) await admin().auth.admin.deleteUser(id);
    }
  });

  test("satu tiket tiga parameter = tiga temuan", async () => {
    await seedRows(fx.periodId, fx.pesertaId, fx.indicators[0]!, [
      { nilai: 1, ketidaksesuaian: "A", tanggal_layanan: "2026-01-05" },
      { nilai: 1, ketidaksesuaian: "B", tanggal_layanan: "2026-01-05" },
      { nilai: 1, ketidaksesuaian: "C", tanggal_layanan: "2026-01-05" },
    ]);

    const res = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    const day = res.days.find((d) => d.date === "2026-01-05")!;
    expect(day.count).toBeGreaterThanOrEqual(3);
  });

  test("satuan per-tiket menghitung distinct no_tiket per hari", async () => {
    const beforeParam = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    const beforeTicket = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
      countBy: "tiket",
    });

    const day = "2026-05-05";
    // Satu tiket boleh punya banyak parameter, tapi constraint unik DB
    // membedakannya lewat `indicator_id` — jadi tiap baris memakai indikator
    // berbeda dengan nomor tiket yang sama.
    await seedRows(fx.periodId, fx.pesertaId, fx.indicators[0]!, [
      {
        indicator_id: fx.indicators[0]!,
        nilai: 1,
        ketidaksesuaian: "A",
        no_tiket: "TKT-SAME",
        tanggal_layanan: day,
      },
      {
        indicator_id: fx.indicators[1]!,
        nilai: 1,
        ketidaksesuaian: "B",
        no_tiket: "TKT-SAME",
        tanggal_layanan: day,
      },
      {
        indicator_id: fx.indicators[2]!,
        nilai: 1,
        ketidaksesuaian: "C",
        no_tiket: "TKT-SAME",
        tanggal_layanan: day,
      },
      {
        indicator_id: fx.indicators[3]!,
        nilai: 1,
        ketidaksesuaian: "D",
        no_tiket: "TKT-OTHER",
        tanggal_layanan: day,
      },
      // Tanpa nomor tiket tidak bisa dikelompokkan → dihitung per baris.
      {
        indicator_id: fx.indicators[0]!,
        nilai: 1,
        ketidaksesuaian: "E",
        no_tiket: null,
        tanggal_layanan: day,
      },
    ]);

    const afterParam = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    const afterTicket = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
      countBy: "tiket",
    });

    const countAt = (
      res: Awaited<ReturnType<typeof getSidakHeatmap>>,
      date: string,
    ) => res.days.find((d) => d.date === date)!.count;

    // Parameter: 5 baris baru = 5 temuan. Tiket: 3 (TKT-SAME, TKT-OTHER, null).
    expect(countAt(afterParam, day) - countAt(beforeParam, day)).toBe(5);
    expect(countAt(afterTicket, day) - countAt(beforeTicket, day)).toBe(3);
    expect(afterTicket.countBy).toBe("tiket");
    expect(afterTicket.totalFindings).toBe(
      afterTicket.days.reduce((sum, d) => sum + d.count, 0),
    );
  });

  test("satuan per-tiket juga berlaku pada temuan tanpa tanggal", async () => {
    const beforeParam = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    const beforeTicket = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
      countBy: "tiket",
    });

    await seedRows(fx.periodId, fx.pesertaId, fx.indicators[0]!, [
      {
        indicator_id: fx.indicators[0]!,
        nilai: 1,
        ketidaksesuaian: "N1",
        no_tiket: "TKT-NULL",
      },
      {
        indicator_id: fx.indicators[1]!,
        nilai: 1,
        ketidaksesuaian: "N2",
        no_tiket: "TKT-NULL",
      },
      {
        indicator_id: fx.indicators[2]!,
        nilai: 1,
        ketidaksesuaian: "N3",
        no_tiket: null,
      },
    ]);

    const afterParam = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    const afterTicket = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
      countBy: "tiket",
    });

    expect(
      afterParam.missingDateFindingsAllPeriods -
        beforeParam.missingDateFindingsAllPeriods,
    ).toBe(3);
    expect(
      afterTicket.missingDateFindingsAllPeriods -
        beforeTicket.missingDateFindingsAllPeriods,
    ).toBe(2);
  });

  test("filter agent_id hanya menghitung agent tersebut", async () => {
    otherPesertaId = sqlUuid(
      `INSERT INTO public.profiler_peserta (batch_name, nama, tim, jabatan, nomor_urut)
       VALUES ('${fx.folderName}', 'Agen Kedua E2E', 'Tim Uji', 'Agent', 2)
       RETURNING id;`,
    );
    const day = "2026-06-06";
    await seedRows(fx.periodId, otherPesertaId, fx.indicators[0]!, [
      { nilai: 1, ketidaksesuaian: "Agent lain", tanggal_layanan: day },
    ]);

    const all = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    const onlyOther = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
      agentId: otherPesertaId,
    });
    const onlyFirst = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
      agentId: fx.pesertaId,
    });

    const countAt = (
      res: Awaited<ReturnType<typeof getSidakHeatmap>>,
      date: string,
    ) => res.days.find((d) => d.date === date)!.count;

    expect(countAt(all, day)).toBeGreaterThanOrEqual(1);
    expect(countAt(onlyOther, day)).toBe(1);
    expect(onlyOther.totalFindings).toBe(1);
    expect(onlyOther.agentId).toBe(otherPesertaId);
    // Agent pertama tidak punya baris pada tanggal itu.
    expect(countAt(onlyFirst, day)).toBe(0);
  });

  test("mode memakai kolom tanggal yang berbeda", async () => {
    await seedRows(fx.periodId, fx.pesertaId, fx.indicators[1]!, [
      {
        nilai: 1,
        ketidaksesuaian: "X",
        tanggal_layanan: "2026-02-10",
        tanggal_sampel: "2026-03-11",
      },
    ]);

    const agent = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    const qa = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "qa",
      year: 2026,
    });

    expect(
      agent.days.find((d) => d.date === "2026-02-10")!.count,
    ).toBeGreaterThanOrEqual(1);
    expect(agent.days.find((d) => d.date === "2026-03-11")!.count).toBe(0);
    expect(
      qa.days.find((d) => d.date === "2026-03-11")!.count,
    ).toBeGreaterThanOrEqual(1);
    expect(qa.days.find((d) => d.date === "2026-02-10")!.count).toBe(0);
    expect(agent.dateBasis).toBe("tanggal_layanan");
    expect(qa.dateBasis).toBe("tanggal_sampel");
  });

  test("phantom dan baris complies dikeluarkan", async () => {
    const before = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    await seedRows(fx.periodId, fx.pesertaId, fx.indicators[2]!, [
      { nilai: 1, ketidaksesuaian: "Asli", tanggal_layanan: "2026-04-10" },
      { nilai: 3, ketidaksesuaian: "", tanggal_layanan: "2026-04-11" },
      {
        nilai: 1,
        ketidaksesuaian: "Phantom",
        tanggal_layanan: "2026-04-12",
        is_phantom_padding: true,
      },
    ]);
    const after = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });

    expect(after.days.find((d) => d.date === "2026-04-10")!.count).toBe(
      before.days.find((d) => d.date === "2026-04-10")!.count + 1,
    );
    // Completes (nilai 3 tanpa catatan) tidak menambah hitungan.
    expect(after.days.find((d) => d.date === "2026-04-11")!.count).toBe(
      before.days.find((d) => d.date === "2026-04-11")!.count,
    );
    // Phantom tidak pernah dihitung.
    expect(after.days.find((d) => d.date === "2026-04-12")!.count).toBe(
      before.days.find((d) => d.date === "2026-04-12")!.count,
    );
  });

  test("tahun tanpa data tetap punya 365/366 hari penuh", async () => {
    const res = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2024,
    });
    expect(res.days.length).toBe(366); // 2024 leap
    expect(res.days.some((d) => d.date === "2024-02-29")).toBe(true);
    expect(res.days.every((d) => d.count === 0)).toBe(true);

    const nonLeap = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2025,
    });
    expect(nonLeap.days.length).toBe(365);
    expect(nonLeap.days.some((d) => d.date === "2025-02-29")).toBe(false);
  });

  test("temuan tanpa tanggal dihitung pada scope seluruh periode", async () => {
    await seedRows(fx.periodId, fx.pesertaId, fx.indicators[3]!, [
      { nilai: 1, ketidaksesuaian: "Tanpa tanggal" },
    ]);

    const res = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    // Baris ini tidak boleh masuk kalender, tapi WAJIB muncul di metadata.
    expect(res.totalFindings).toBe(
      res.days.reduce((sum, d) => sum + d.count, 0),
    );
    expect(res.missingDateFindingsAllPeriods).toBeGreaterThanOrEqual(1);
  });

  /**
   * REGRESI P1 — `missingDateFindingsAllPeriods` harus memakai predikat yang
   * SAMA dengan kalender (countable, non-phantom, satu baris = satu temuan).
   *
   * Bug baseline: jalur `count: "exact"` mengembalikan hitungan MENTAH semua
   * baris non-phantom bertanggal-null, termasuk baris `nilai=3` tanpa catatan
   * yang sebenarnya complies. Akibatnya kartu "Tanggal belum diisi"
   * menggelembung dan tidak sepakat dengan `days`.
   *
   * Delta diukur sebelum/sesudah agar tidak bergantung pada baris test lain.
   */
  async function missingCount(
    mode: "agent" | "qa",
    serviceType?: "slik" | "call",
  ): Promise<number> {
    const res = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode,
      year: 2026,
      serviceType,
    });
    return res.missingDateFindingsAllPeriods;
  }

  test("hitungan tanpa tanggal hanya countable, tepat per mode dan filter layanan", async () => {
    const agentBefore = await missingCount("agent");
    const qaBefore = await missingCount("qa");
    const callBefore = await missingCount("agent", "call");

    // Tiga baris countable (nilai<3 atau catatan) pada layanan default (slik)…
    await seedRows(fx.periodId, fx.pesertaId, fx.indicators[0]!, [
      { nilai: 1, ketidaksesuaian: "countable A" },
      { nilai: 2, ketidaksesuaian: "countable B" },
      { nilai: 0, ketidaksesuaian: "" },
      // …plus baris complies yang TIDAK boleh dihitung: nilai 3 tanpa catatan.
      { nilai: 3, ketidaksesuaian: "" },
      { nilai: 3, ketidaksesuaian: "   " },
      // Phantom selalu keluar, meski countable.
      { nilai: 1, ketidaksesuaian: "phantom", is_phantom_padding: true },
    ]);

    // Filter layanan: satu countable + satu complies pada layanan lain.
    await seedRows(fx.periodId, fx.pesertaId, fx.indicators[1]!, [
      { service_type: "call", nilai: 1, ketidaksesuaian: "countable call" },
      { service_type: "call", nilai: 3, ketidaksesuaian: "" },
    ]);

    // Tepat +4 (3 slik + 1 call countable), bukan +7 (semua baris non-phantom
    // null-date).
    expect(await missingCount("agent")).toBe(agentBefore + 4);
    expect(await missingCount("qa")).toBe(qaBefore + 4);
    // Filter layanan memisahkan call dari slik.
    expect(await missingCount("agent", "call")).toBe(callBefore + 1);

    // Konsistensi eksplisit: metadata wajib sepakat dengan kalender.
    const agent = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    expect(agent.totalFindings).toBe(
      agent.days.reduce((sum, d) => sum + d.count, 0),
    );
  });

  /**
   * REGRESI P5 — paging > 1.000 baris harus lengkap dan tetap menyaring
   * countable. PostgREST membatasi satu halaman 1.000 baris; kalau agregasi
   * tidak memakai `fetchAllPages`, hitungan terpotong atau memakai `count`
   * mentah yang ikut menghitung baris complies.
   */
  test("hitungan tanpa tanggal tetap tepat di atas 1.000 baris (paging penuh)", async () => {
    const before = await missingCount("agent");
    const COUNTABLE = 1005;
    const CLEAN = 7;

    const base = {
      peserta_id: fx.pesertaId,
      period_id: fx.periodId,
      indicator_id: fx.indicators[0]!,
      service_type: "slik",
      sebaiknya: "",
      no_tiket: null,
      is_phantom_padding: false,
      tanggal_layanan: null,
      tanggal_sampel: null,
    };
    const payload = [
      ...Array.from({ length: COUNTABLE }, () => ({
        ...base,
        nilai: 1,
        ketidaksesuaian: "bulk countable",
      })),
      ...Array.from({ length: CLEAN }, () => ({
        ...base,
        nilai: 3,
        ketidaksesuaian: "",
      })),
    ];

    const { error } = await admin().from("qa_temuan").insert(payload);
    expect(error).toBeNull();

    // Tepat +1005, bukan +1012 (semua baris null-date) dan bukan 1000 (terpotong).
    expect(await missingCount("agent")).toBe(before + COUNTABLE);
  });

  /**
   * P5 (kalender): agregasi `days`/`totalFindings` juga harus lengkap di atas
   * 1.000 baris dan tetap mengeluarkan baris complies. Test sebelumnya hanya
   * membuktikan paging pada hitungan tanggal-null.
   */
  test("kalender >1.000 baris menghitung countable tepat dan mengeluarkan complies", async () => {
    const date = "2026-08-15";
    const before = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    const beforeDay = before.days.find((d) => d.date === date)!.count;
    const beforeTotal = before.totalFindings;

    const COUNTABLE = 1005;
    const CLEAN = 7;
    const base = {
      peserta_id: fx.pesertaId,
      period_id: fx.periodId,
      indicator_id: fx.indicators[0]!,
      service_type: "slik",
      sebaiknya: "",
      no_tiket: null,
      is_phantom_padding: false,
      tanggal_layanan: date,
      tanggal_sampel: null,
    };
    const payload = [
      ...Array.from({ length: COUNTABLE }, () => ({
        ...base,
        nilai: 1,
        ketidaksesuaian: "kalender countable",
      })),
      ...Array.from({ length: CLEAN }, () => ({
        ...base,
        nilai: 3,
        ketidaksesuaian: "",
      })),
    ];
    const { error } = await admin().from("qa_temuan").insert(payload);
    expect(error).toBeNull();

    const after = await getSidakHeatmap({
      supabase: userClient(trainerToken),
      mode: "agent",
      year: 2026,
    });
    expect(after.days.find((d) => d.date === date)!.count).toBe(
      beforeDay + COUNTABLE,
    );
    expect(after.totalFindings).toBe(beforeTotal + COUNTABLE);
  });

  /**
   * Kegagalan halaman lanjutan tidak boleh menjadi sukses parsial/kosong.
   * Client palsu mengembalikan satu halaman penuh (1000 baris) lalu gagal.
   */
  test("kegagalan halaman lanjutan menggagalkan respons, bukan data parsial", async () => {
    // `fetchAllPages` memanggil `build` sekali per halaman, dan `build` memanggil
    // `.from()` lagi setiap kali — jadi status "halaman pertama" harus hidup di
    // closure client, bukan di builder. Kalau tidak, setiap panggilan kembali
    // "halaman pertama" dan loop paging tidak pernah berhenti.
    let servedFirstPage = false;
    function failingSecondPageClient() {
      const makeBuilder = () => {
        const builder: Record<string, unknown> = {};
        for (const method of ["select", "eq", "is", "gte", "lte", "order"]) {
          builder[method] = () => builder;
        }
        builder.range = () => {
          if (!servedFirstPage) {
            servedFirstPage = true;
            return Promise.resolve({
              data: Array.from({ length: 1000 }, (_, i) => ({
                id: `page-1-${i}`,
                nilai: 1,
                ketidaksesuaian: "x",
                sebaiknya: null,
                tanggal: null,
              })),
              error: null,
            });
          }
          return Promise.resolve({
            data: null,
            error: new Error("probe: halaman kedua gagal"),
          });
        };
        return builder;
      };
      return { from: () => makeBuilder() } as never;
    }

    await expect(
      getSidakHeatmap({
        supabase: failingSecondPageClient(),
        mode: "agent",
        year: 2026,
      }),
    ).rejects.toThrow("probe: halaman kedua gagal");
  });

  test("leader hanya melihat agent dalam scope-nya", async () => {
    const call = await mountHeatmapRouter("leader", leaderToken, leaderUserId);
    const res = await call("/heatmap?mode=agent&year=2026");
    expect(res.status).toBe(200);
    const data = res.body.data as {
      agentId: string | null;
      days: Array<{ date: string; count: number }>;
    };
    const countAt = (date: string) =>
      data.days.find((d) => d.date === date)!.count;

    // Hari milik agent dalam scope terlihat…
    expect(countAt("2026-01-05")).toBeGreaterThanOrEqual(1);
    // …dan hari milik agent di luar scope TIDAK terlihat (baris 2026-06-06
    // dibuat oleh test `filter agent_id` pada agent kedua).
    expect(countAt("2026-06-06")).toBe(0);
  });

  test("leader ditolak meminta agent di luar scope, diizinkan di dalam scope", async () => {
    expect(otherPesertaId).not.toBeNull();
    const call = await mountHeatmapRouter("leader", leaderToken, leaderUserId);

    const forbidden = await call(
      `/heatmap?mode=agent&year=2026&agent_id=${otherPesertaId}`,
    );
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error?.code).toBe("FORBIDDEN");

    const allowed = await call(
      `/heatmap?mode=agent&year=2026&agent_id=${fx.pesertaId}`,
    );
    expect(allowed.status).toBe(200);
  });

  test("leader terkunci layanan ditolak meminta layanan lain", async () => {
    const call = await mountHeatmapRouter(
      "leader",
      lockedLeaderToken,
      lockedLeaderUserId,
    );
    const forbidden = await call(
      "/heatmap?mode=agent&year=2026&service_type=slik",
    );
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error?.code).toBe("FORBIDDEN");

    const allowed = await call(
      "/heatmap?mode=agent&year=2026&service_type=call",
    );
    expect(allowed.status).toBe(200);
  });

  test("parameter tidak valid ditolak 400", async () => {
    const call = await mountHeatmapRouter("trainer", trainerToken);
    for (const query of [
      "/heatmap?mode=bogus&year=2026",
      "/heatmap?mode=agent&year=abc",
      "/heatmap?mode=agent&year=1800",
      "/heatmap?mode=agent&year=2026&service_type=invalid",
      "/heatmap?mode=agent&year=2026&count_by=bogus",
      "/heatmap?mode=agent&year=2026&agent_id=not-a-uuid",
    ]) {
      const res = await call(query);
      expect(res.status, query).toBe(400);
      expect(res.body.error?.code, query).toBe("VALIDATION_ERROR");
    }
  });

  test("query gagal menjadi error, bukan heatmap kosong", async () => {
    /**
     * Injeksi kegagalan DETERMINISTIK di lapisan client, bukan lewat jaringan.
     * Client jaringan membuat supabase-js melakukan retry, sehingga assertion
     * jadi tidak stabil dan tidak membuktikan apa pun.
     *
     * Yang diuji adalah kontraknya: kegagalan query harus DILEWARKAN sebagai
     * error. Kalau dil swallow, heatmap akan tampil "tidak ada temuan" padahal
     * datanya gagal dimuat — kesimpulan yang lebih buruk daripada error.
     */
    const broken = {
      from() {
        throw new Error("probe: sumber data tidak bisa diakses");
      },
    } as never;

    await expect(
      getSidakHeatmap({ supabase: broken, mode: "agent", year: 2026 }),
    ).rejects.toThrow("probe: sumber data tidak bisa diakses");
  });
});

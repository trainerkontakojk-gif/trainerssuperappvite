import { expect, test } from "@playwright/test";
import {
  createAdmin,
  installLoopbackFetchGuard,
  readLoopbackEnv,
} from "./helpers/sidakRealBackend";
import { fixtureSetup, sql } from "./helpers/sidakTemuanDatesApiHarness";
import { cleanupSlikRuleFixture } from "./helpers/sidakSlikFixture";

const env = readLoopbackEnv();
let fixture: ReturnType<typeof fixtureSetup>;

test.beforeAll(() => {
  installLoopbackFetchGuard();
  fixture = fixtureSetup();
});

test.afterAll(() => {
  if (!fixture) return;
  sql(`DELETE FROM profiler_peserta WHERE id = '${fixture.pesertaId}';
       DELETE FROM profiler_folders WHERE name = '${fixture.folderName}';`);
  cleanupSlikRuleFixture(sql, fixture.slik);
});

test("service-role writes enforce time/duration bounds and service eligibility", async () => {
  const admin = createAdmin(env);
  const insert = (
    service_type: string,
    fields: { jam_layanan?: string; durasi_detik?: number },
  ) =>
    admin
      .from("qa_temuan")
      .insert({
        peserta_id: fixture.pesertaId,
        period_id: fixture.periodId,
        indicator_id: fixture.indicators[0],
        service_type,
        nilai: 0,
        ...fields,
      })
      .select("jam_layanan,durasi_detik")
      .single();

  for (const service of ["call", "email", "cso", "bko"]) {
    expect(
      (await insert(service, { jam_layanan: "08:00" })).error?.code,
      service,
    ).toBe("23514");
  }
  for (const service of ["chat", "pencatatan", "slik", "email", "cso", "bko"]) {
    expect(
      (await insert(service, { durasi_detik: 60 })).error?.code,
      service,
    ).toBe("23514");
  }
  for (const duration of [-1, 86400]) {
    expect(
      (await insert("call", { durasi_detik: duration })).error?.code,
      String(duration),
    ).toBe("23514");
  }
  for (const service of ["chat", "pencatatan", "slik"]) {
    expect(await insert(service, { jam_layanan: "08:00" })).toMatchObject({
      error: null,
      data: { jam_layanan: "08:00:00", durasi_detik: null },
    });
  }
  for (const duration of [0, 86399]) {
    expect(await insert("call", { durasi_detik: duration })).toMatchObject({
      error: null,
      data: { jam_layanan: null, durasi_detik: duration },
    });
  }
  expect(await insert("email", {})).toMatchObject({
    error: null,
    data: { jam_layanan: null, durasi_detik: null },
  });
});

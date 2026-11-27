import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { SIDAK_TIME_SOURCE } from "@trainers/types";
import {
  createAdmin,
  createRealSidakApp,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
  sqlOne,
} from "./helpers/sidakRealBackend";

const env = readLoopbackEnv();
const admin = createAdmin(env);
const marker = randomUUID();
const year = 2096;
const monday = `${year}-01-02`;
const agents = [randomUUID(), randomUUID()];
const folders = [randomUUID(), randomUUID()];
const group = randomUUID();
const access = randomUUID();
const period = randomUUID();
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let leader: typeof trainer;
let trainerApp: Awaited<ReturnType<typeof createRealSidakApp>>;
let leaderApp: typeof trainerApp;
let failFindings = false;

async function profile(query = {}, app = trainerApp) {
  const params = new URLSearchParams({ year: String(year), ...query });
  const { status, bodyText } = await app.request(
    `/v1/sidak/heatmap/time-profile?${params}`,
    { method: "GET" },
  );
  return {
    status,
    body: bodyText.startsWith("{") ? JSON.parse(bodyText) : bodyText,
  };
}
async function data(query = {}, app = trainerApp) {
  const res = await profile(query, app);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data;
}

test.beforeAll(async () => {
  installLoopbackFetchGuard();
  const fetchLocal = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    if (
      failFindings &&
      url.origin === env.apiUrl &&
      url.pathname === "/rest/v1/qa_temuan"
    ) {
      return Promise.resolve(
        Response.json(
          { message: "private-database-sentinel" },
          { status: 500 },
        ),
      );
    }
    return fetchLocal(input, init);
  };
  trainer = await createUserWithJwt(env, "trainer", marker);
  leader = await createUserWithJwt(env, "leader", marker);
  trainerApp = await createRealSidakApp(env, {
    ...trainer,
    role: "trainer",
    fullName: "Trainer",
  });
  leaderApp = await createRealSidakApp(env, {
    ...leader,
    role: "leader",
    fullName: "Leader",
  });
  const yearId = sqlOne(
    env,
    "SELECT id FROM profiler_years ORDER BY year LIMIT 1;",
  );
  runSql(
    env,
    `INSERT INTO qa_periods (id, month, year) VALUES ('${period}', 1, ${year});
    INSERT INTO profiler_folders (id, name, year_id) VALUES ${folders.map((id) => `('${id}', '${id}', '${yearId}')`).join(",")};
    INSERT INTO profiler_peserta (id, batch_name, nama, tim, jabatan, nomor_urut) VALUES ${agents.map((id, i) => `('${id}', '${folders[i]}', '${id}', 'E2E', 'Agent', 1)`).join(",")};
    INSERT INTO access_groups (id, name, is_active) VALUES ('${group}', '${marker}', true);
    INSERT INTO access_group_items (access_group_id, field_name, field_value, is_active) VALUES ('${group}', 'peserta_id', '${agents[0]}', true);
    INSERT INTO leader_access_requests (id, leader_user_id, module, status) VALUES ('${access}', '${leader.userId}', 'sidak', 'approved');
    INSERT INTO leader_access_request_groups (request_id, access_group_id) VALUES ('${access}', '${group}');`,
  );
  const [indicator, duplicateIndicator] = runSql(
    env,
    "SELECT id FROM qa_indicators WHERE service_type='chat' ORDER BY id LIMIT 2;",
  ).split("\n");
  const row = (service_type: string, fields = {}) => ({
    peserta_id: agents[0],
    period_id: period,
    indicator_id: indicator,
    service_type,
    tanggal_layanan: monday,
    no_tiket: null,
    nilai: 0,
    ketidaksesuaian: "E2E",
    is_phantom_padding: false,
    jam_layanan: null,
    durasi_detik: null,
    ...fields,
  });
  const { error } = await admin
    .from("qa_temuan")
    .insert([
      ...[
        "06:59",
        "07:00",
        "10:59",
        "11:00",
        "13:59",
        "14:00",
        "16:59",
        "17:00",
      ].map((jam_layanan, i) =>
        row("chat", { jam_layanan, no_tiket: `T${i}` }),
      ),
      row("chat", {
        jam_layanan: "07:30",
        no_tiket: "T1",
        indicator_id: duplicateIndicator,
      }),
      row("chat", { jam_layanan: "07:45" }),
      row("chat", { jam_layanan: "07:50" }),
      row("chat"),
      row("chat", { tanggal_layanan: null }),
      row("chat", { jam_layanan: "07:00", nilai: 3, ketidaksesuaian: null }),
      row("chat", {
        jam_layanan: "07:00",
        is_phantom_padding: true,
        phantom_batch_id: marker,
      }),
      row("pencatatan", { jam_layanan: "07:00" }),
      row("slik"),
      ...[59, 299, 300, 599, 600, 899, 900, null].map((durasi_detik) =>
        row("call", { durasi_detik }),
      ),
      ...["email", "cso", "bko"].map((service) => row(service)),
      row("chat", {
        peserta_id: agents[1],
        tanggal_layanan: `${year}-02-29`,
        jam_layanan: "08:00",
      }),
    ]);
  expect(error).toBeNull();
});

test.afterAll(async () => {
  runSql(
    env,
    `DELETE FROM leader_access_request_groups WHERE request_id='${access}';
    DELETE FROM leader_access_requests WHERE id='${access}';
    DELETE FROM access_group_items WHERE access_group_id='${group}'; DELETE FROM access_groups WHERE id='${group}';
    DELETE FROM qa_temuan WHERE period_id='${period}'; DELETE FROM qa_periods WHERE id='${period}';
    DELETE FROM profiler_peserta WHERE id IN ('${agents.join("','")}');
    DELETE FROM profiler_folders WHERE id IN ('${folders.join("','")}');`,
  );
  for (const user of [trainer, leader])
    if (user) {
      expect((await admin.auth.admin.deleteUser(user.userId)).error).toBeNull();
    }
});

test("separates service meanings, fixed bucket edges and missing values", async () => {
  const one = await data({
    service_type: "chat",
    folder_ids: folders[0],
    count_by: "tiket",
  });
  expect(one.hours).toMatchObject({
    ...(SIDAK_TIME_SOURCE.chat.kind === "jam" && {
      label: SIDAK_TIME_SOURCE.chat.label,
    }),
    buckets: { luar: 2, pagi: 4, siang: 2, sore: 2 },
    total: 10,
    missingTime: 1,
    cells: expect.arrayContaining([{ weekday: 1, hour: 7, count: 3 }]),
  });
  expect(one.hoursByService).toBeNull();
  expect(one.notApplicable).toBe(0);
  const all = await data({ agent_id: agents[0] });
  expect(all.hours).toBeNull();
  expect(all.hoursByService).toEqual([
    {
      serviceType: "chat",
      label: "Jam interaksi dimulai",
      buckets: { pagi: 5, siang: 2, sore: 2, luar: 2 },
      total: 11,
      missingTime: 1,
    },
    {
      serviceType: "pencatatan",
      label: "Jam tiket dibuat",
      buckets: { pagi: 1, siang: 0, sore: 0, luar: 0 },
      total: 1,
      missingTime: 0,
    },
    {
      serviceType: "slik",
      label: "Jam layanan",
      buckets: { pagi: 0, siang: 0, sore: 0, luar: 0 },
      total: 0,
      missingTime: 1,
    },
  ]);
  expect(all.durations).toEqual({
    buckets: { singkat: 2, sedang: 2, panjang: 2, sangat_panjang: 1 },
    total: 7,
    missingDuration: 1,
    reviewBelowOneMinute: 1,
  });
  expect(all.notApplicable).toBe(11);
  for (const service_type of ["email", "cso", "bko"]) {
    expect(await data({ service_type })).toMatchObject({
      hours: null,
      hoursByService: null,
      durations: null,
      notApplicable: 1,
    });
  }
});

test("intersects month, folder, agent and leader scope; query failures are not empty success", async () => {
  const filters = {
    service_type: "chat",
    start_month: "2",
    end_month: "2",
    folder_ids: folders.join(","),
  };
  expect((await data(filters)).hours.total).toBe(1);
  expect((await data({ ...filters, agent_id: agents[0] })).hours.total).toBe(0);
  expect((await data(filters, leaderApp)).hours.total).toBe(0);
  expect(
    (await profile({ ...filters, agent_id: agents[1] }, leaderApp)).status,
  ).toBe(403);
  expect((await data({ service_type: "chat" }, leaderApp)).hours.total).toBe(
    11,
  );
  expect((await profile({ start_month: "2" })).status).toBe(400);
  failFindings = true;
  try {
    const res = await profile();
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: "HEATMAP_ERROR" },
    });
    expect(JSON.stringify(res.body)).not.toContain("private-database-sentinel");
  } finally {
    failFindings = false;
  }
});

import { expect, test } from "@playwright/test";
import {
  fixtureSetup,
  fixtureBatch,
  installTemuanFetchGuard,
  mountRouter,
  persistence,
  sql,
} from "./helpers/sidakTemuanDatesApiHarness";
import { cleanupSlikRuleFixture } from "./helpers/sidakSlikFixture";

installTemuanFetchGuard();

test.beforeAll(() => {
  persistence.fx = fixtureSetup();
});
test.afterAll(() => {
  const fx = persistence.fx;
  if (!fx) return;
  sql(`DELETE FROM profiler_peserta WHERE id = '${fx.pesertaId}';
       DELETE FROM profiler_folders WHERE name = '${fx.folderName}';`);
  cleanupSlikRuleFixture(sql, fx.slik);
  sql(`DELETE FROM qa_indicators WHERE id = '${fx.pesertaId}';`);
});

const json = (method: string, body: unknown) => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

test("preview preserves time; create and update round-trip seconds, omission and null", async () => {
  const call = await mountRouter("trainer");
  const payload = fixtureBatch({ jam_layanan: "08:30:15" });
  const preview = await call("/temuan/batch/preview", json("POST", payload));
  expect(preview.status).toBe(200);
  expect(preview.body.data).toMatchObject({
    valid: expect.arrayContaining([
      expect.objectContaining({ jam_layanan: "08:30:15" }),
    ]),
  });
  expect((await call("/temuan/batch", json("POST", payload))).status).toBe(201);
  const list = await call(
    `/temuan?peserta_id=${persistence.fx.pesertaId}&limit=100`,
  );
  const { items } = list.body.data as {
    items: Array<{ id: string; no_tiket: string }>;
  };
  const target = items.find(
    (item) => item.no_tiket === payload.items[3]!.no_tiket,
  )!;
  expect(target).toMatchObject({ jam_layanan: "08:30:15", durasi_detik: null });
  expect(
    items.find((item) => item.no_tiket === payload.items[0]!.no_tiket),
  ).toMatchObject({ jam_layanan: null, durasi_detik: null });
  const update = (fields: unknown) =>
    call(`/temuan/${target.id}`, json("PUT", fields));
  expect((await update({ jam_layanan: "17:04" })).body.data).toMatchObject({
    jam_layanan: "17:04:00",
  });
  expect((await update({ sebaiknya: "Perbaikan" })).body.data).toMatchObject({
    jam_layanan: "17:04:00",
  });
  expect((await update({ durasi_detik: 60 })).body.error?.message).toMatch(
    /durasi.*Call/i,
  );
  expect((await update({ jam_layanan: null })).body.data).toMatchObject({
    jam_layanan: null,
  });

  const indicator =
    sql(`INSERT INTO qa_indicators (id, service_type, name, category, bobot, is_active)
    VALUES ('${persistence.fx.pesertaId}', 'call', '${persistence.fx.folderName}', 'critical', 1, true) RETURNING id;`);
  const callPayload = {
    ...fixtureBatch(),
    service_type: "call",
    items: [
      {
        indicator_id: indicator,
        nilai: 0,
        ketidaksesuaian: "Durasi panggilan",
        durasi_detik: 59,
      },
    ],
  };
  const durationPreview = await call(
    "/temuan/batch/preview",
    json("POST", callPayload),
  );
  expect(
    durationPreview.status,
    JSON.stringify(durationPreview.body.error),
  ).toBe(200);
  expect(durationPreview.body.data).toMatchObject({
    valid: [expect.objectContaining({ durasi_detik: 59 })],
  });
  expect((await call("/temuan/batch", json("POST", callPayload))).status).toBe(
    201,
  );
  expect(
    sql(
      `SELECT durasi_detik FROM qa_temuan WHERE peserta_id='${persistence.fx.pesertaId}' AND service_type='call';`,
    ),
  ).toBe("59");
  const id = sql(
    `SELECT id FROM qa_temuan WHERE peserta_id='${persistence.fx.pesertaId}' AND service_type='call';`,
  );
  expect(
    (await call(`/temuan/${id}`, json("PUT", { durasi_detik: 0 }))).body.data,
  ).toMatchObject({ durasi_detik: 0 });
});

test("malformed time is rejected and unsupported services get a friendly message", async () => {
  const call = await mountRouter("trainer");
  for (const fields of [
    ...["25:00", "7.2", "08:00 PM"].map((jam_layanan) => ({ jam_layanan })),
    ...[-1, 1.5, 86400].map((durasi_detik) => ({ durasi_detik })),
  ]) {
    for (const suffix of ["", "/preview"]) {
      const res = await call(
        `/temuan/batch${suffix}`,
        json("POST", fixtureBatch(fields)),
      );
      expect(res.status, JSON.stringify(fields)).toBe(400);
      expect(res.body.error?.code).toBe("VALIDATION_ERROR");
    }
  }
  const allowedShapes = [
    ...["call", "email", "cso", "bko"].map((service_type) => ({
      service_type,
      fields: { jam_layanan: "08:00" },
      message: /tidak memakai jam/i,
    })),
    {
      service_type: "slik",
      fields: { durasi_detik: 60 },
      message: /durasi.*Call/i,
    },
  ];
  for (const { service_type, fields, message } of allowedShapes) {
    const payload = {
      ...fixtureBatch(),
      service_type,
      items: [{ ...fixtureBatch().items[0], ...fields }],
    };
    const preview = await call("/temuan/batch/preview", json("POST", payload));
    expect(preview.body.data).toMatchObject({
      invalid: [
        expect.objectContaining({ error: expect.stringMatching(message) }),
      ],
    });
    const res = await call("/temuan/batch", json("POST", payload));
    expect(res.status).toBe(422);
    expect(res.body.error?.message).toMatch(message);
  }
});

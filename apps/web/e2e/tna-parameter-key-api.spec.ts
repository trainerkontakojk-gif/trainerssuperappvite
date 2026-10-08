import { tnaApiRequest } from "./helpers/tnaApi";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createTnaFixture } from "./helpers/tnaFixture";
import { createRealSidakApp, sqlOne } from "./helpers/sidakRealBackend";

// Plan K8: TNA keys parameters by qa_temuan.indicator_id. That is only sound if
// SIDAK never stores an unmapped rule-indicator snapshot UUID and stores mapped
// findings under the master id across rule versions. The HTTP status of a
// zero-insert batch is SIDAK's own contract and deliberately not pinned here.
test("parameter key: unmapped snapshots never stored, mapped findings keep master id; fixture is repeatable", async () => {
  const namespace = randomUUID();
  const fixture = createTnaFixture(namespace);
  try {
    const first = await fixture.seed();
    const again = await fixture.seed();
    expect(again).toBe(first);
    expect(
      sqlOne(
        fixture.env,
        `SELECT count(*) FROM qa_temuan WHERE id IN (${fixture.ids.findings.map((id) => `'${id}'`).join(",")});`,
      ),
    ).toBe("18");
    for (const role of ["admin", "trainer"] as const) {
      const client = createClient(fixture.env.apiUrl, fixture.env.anonKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${first[role].token}` } },
      });
      for (const [table, ids] of [
        ["qa_temuan", fixture.ids.findings],
        ["qa_periods", fixture.ids.periods],
        ["profiler_peserta", fixture.ids.participants],
      ] as const) {
        const result = await client
          .from(table)
          .select("id")
          .in("id", [...ids]);
        expect(result.error, `${role}: ${table}`).toBeNull();
        expect(result.data).toHaveLength(ids.length);
      }
    }
    const app = await createRealSidakApp(fixture.env, {
      ...first.trainer,
      role: "trainer",
      fullName: "TNA synthetic trainer",
    });
    const body = {
      peserta_id: fixture.ids.participants[0],
      period_id: fixture.ids.periods[2],
      service_type: "chat",
      no_tiket: "TNA-UNMAPPED-PROBE",
      items: [
        { indicator_id: fixture.ids.unmappedRuleIndicators[1], nilai: 1 },
      ],
    };
    const preview = await tnaApiRequest(app, "/v1/sidak/temuan/batch/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(preview.status).toBe(200);
    const validation = JSON.parse(preview.bodyText).data;
    expect(validation.valid).toHaveLength(0);
    expect(validation.invalid[0].error).toBe(
      "Indikator tidak ditemukan di database",
    );
    const inserted = await tnaApiRequest(app, "/v1/sidak/temuan/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(inserted.status).toBeLessThan(500);
    expect(
      sqlOne(
        fixture.env,
        `SELECT count(*) FROM qa_temuan WHERE indicator_id='${fixture.ids.unmappedRuleIndicators[1]}';`,
      ),
    ).toBe("0");
    expect(
      sqlOne(
        fixture.env,
        `SELECT count(DISTINCT indicator_id) FROM qa_temuan WHERE id IN (${fixture.ids.findings.map((id) => `'${id}'`).join(",")});`,
      ),
    ).toBe("1");
    const mapped = await tnaApiRequest(app, "/v1/sidak/temuan/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...body,
        items: [{ indicator_id: fixture.ids.indicators[0], nilai: 1 }],
      }),
    });
    expect(mapped.status).toBe(201);
    expect(JSON.parse(mapped.bodyText).data.inserted).toBe(1);
    expect(
      sqlOne(
        fixture.env,
        `SELECT indicator_id::text || '|' || rule_version_id::text || '|' || coalesce(rule_indicator_id::text,'NULL') FROM qa_temuan WHERE peserta_id='${fixture.ids.participants[0]}' AND no_tiket='TNA-UNMAPPED-PROBE';`,
      ),
    ).toBe(`${fixture.ids.indicators[0]}|${fixture.ids.versions[1]}|NULL`);
  } finally {
    await fixture.cleanup();
    await fixture.cleanup();
  }
  for (const [table, ids] of [
    ["qa_temuan", fixture.ids.findings],
    ["qa_periods", fixture.ids.periods],
    ["qa_service_rule_versions", fixture.ids.versions],
    [
      "qa_service_rule_indicators",
      [
        ...fixture.ids.mappedRuleIndicators,
        ...fixture.ids.unmappedRuleIndicators,
      ],
    ],
    ["qa_indicators", fixture.ids.indicators],
    ["profiler_peserta", fixture.ids.participants],
    ["profiler_folders", [fixture.ids.folder]],
  ] as const) {
    expect(
      sqlOne(
        fixture.env,
        `SELECT count(*) FROM ${table} WHERE id IN (${ids.map((id) => `'${id}'`).join(",")});`,
      ),
      table,
    ).toBe("0");
  }
  // The same namespace can be seeded again after cleanup (including auth users).
  try {
    await fixture.seed();
  } finally {
    await fixture.cleanup();
  }
  expect(
    sqlOne(
      fixture.env,
      `SELECT count(*) FROM auth.users WHERE email IN ('e2e-browser-admin-${namespace}@local.test','e2e-browser-trainer-${namespace}@local.test');`,
    ),
  ).toBe("0");
});

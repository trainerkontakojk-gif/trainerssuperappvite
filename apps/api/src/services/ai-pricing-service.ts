import {
  IMAGE_GENERATION_MODELS,
  isMissingPricingScheduleTable,
  pickEffectivePricing,
} from "@trainers/types";
import type { z } from "zod";
import {
  AI_MODELS,
  TELEFUN_LIVE_MODELS,
  getHistoricalTelefunRealtimeModel,
} from "../lib/ai-models";
import type { createAdminClient } from "../lib/supabase";
import {
  buildPricingUpsertPayload,
  isMissingRealtimePricingColumn,
  REALTIME_PRICING_COLUMNS,
  type pricingUpsertSchema,
} from "../lib/pricing-contract";

type AdminClient = ReturnType<typeof createAdminClient>;
type RealtimeRates = Partial<
  Record<(typeof REALTIME_PRICING_COLUMNS)[number], number | null>
>;
type PriceRow = {
  model_id: string;
  input_price_usd_per_million: number;
  output_price_usd_per_million: number;
  effective_since: string | null;
} & RealtimeRates;
type ScheduleRow = PriceRow & { id: string; effective_from: string };

export type PricingUpsert = z.infer<typeof pricingUpsertSchema>;

/** Monitoring-facing error with a message safe to show the user. */
export class PricingError extends Error {
  constructor(
    readonly status: 400 | 404 | 410 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PricingError";
  }
}

export const PRICING_MODELS = [...AI_MODELS, ...TELEFUN_LIVE_MODELS].filter(
  (model, index, models) =>
    models.findIndex((candidate) => candidate.id === model.id) === index,
);
const PRICING_MODEL_IDS = new Set(PRICING_MODELS.map((model) => model.id));

const LEGACY_SELECT =
  "model_id, input_price_usd_per_million, output_price_usd_per_million, updated_at";
const EXPANDED_SELECT = `${LEGACY_SELECT}, ${REALTIME_PRICING_COLUMNS.join(", ")}`;
const SCHEDULE_SELECT = `id, model_id, effective_from, input_price_usd_per_million, output_price_usd_per_million, ${REALTIME_PRICING_COLUMNS.join(", ")}`;
const SCHEDULE_UNAVAILABLE = new PricingError(
  503,
  "SCHEDULE_UNAVAILABLE",
  "Jadwal harga belum aktif di database. Hubungi admin.",
);

function toNumberRow<T extends Record<string, unknown>>(row: T) {
  const numbers = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      key.endsWith("_per_million") && value !== null && value !== undefined
        ? Number(value)
        : value,
    ]),
  );
  return {
    ...numbers,
    input_price_usd_per_million: Number(row.input_price_usd_per_million ?? 0),
    output_price_usd_per_million: Number(row.output_price_usd_per_million ?? 0),
  } as unknown as T;
}

async function readSettings(admin: AdminClient): Promise<PriceRow[]> {
  const read = (columns: string) =>
    admin.from("ai_pricing_settings").select(columns).order("model_id");
  let result = await read(EXPANDED_SELECT);
  if (result.error && isMissingRealtimePricingColumn(result.error)) {
    result = await read(LEGACY_SELECT);
  }
  if (result.error) throw result.error;
  return ((result.data ?? []) as unknown as Array<Record<string, unknown>>).map(
    ({ updated_at, ...row }) =>
      toNumberRow({
        ...row,
        effective_since:
          typeof updated_at === "string"
            ? new Date(updated_at).toISOString()
            : null,
      }) as unknown as PriceRow,
  );
}

async function readSchedule(admin: AdminClient): Promise<ScheduleRow[]> {
  const { data, error } = await admin
    .from("ai_pricing_schedule")
    .select(SCHEDULE_SELECT)
    .order("effective_from");
  if (error) {
    if (isMissingPricingScheduleTable(error)) return [];
    throw error;
  }
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(
    (row) =>
      toNumberRow({
        ...row,
        // PostgREST returns "+00:00"; the API speaks ISO "Z".
        effective_from: new Date(String(row.effective_from)).toISOString(),
        effective_since: new Date(String(row.effective_from)).toISOString(),
      }) as unknown as ScheduleRow,
  );
}

function priceFields(row: PriceRow | null) {
  return {
    input_price_usd_per_million: row?.input_price_usd_per_million ?? 0,
    output_price_usd_per_million: row?.output_price_usd_per_million ?? 0,
    ...Object.fromEntries(
      REALTIME_PRICING_COLUMNS.map((column) => [column, row?.[column] ?? null]),
    ),
  };
}

/** Prices for the Harga page: the price in effect now and the next scheduled one. */
export async function listPricing(admin: AdminClient, now = new Date()) {
  const [settings, schedule] = await Promise.all([
    readSettings(admin),
    readSchedule(admin),
  ]);
  const settingsById = new Map(settings.map((row) => [row.model_id, row]));
  const nowMs = now.getTime();

  const priceFor = (modelId: string) => {
    const rows = schedule.filter((row) => row.model_id === modelId);
    const due = rows.filter((row) => Date.parse(row.effective_from) <= nowMs);
    const effective = pickEffectivePricing<PriceRow>(
      settingsById.get(modelId) ?? null,
      due.at(-1) ?? null,
    );
    const next = rows.find((row) => Date.parse(row.effective_from) > nowMs);
    return {
      ...priceFields(effective),
      effective_since: effective?.effective_since ?? null,
      next_price: next
        ? {
            id: next.id,
            effective_from: next.effective_from,
            ...priceFields(next),
          }
        : null,
    };
  };

  const result: Array<Record<string, unknown> & { model_id: string }> =
    PRICING_MODELS.map((model) => ({
      model_id: model.id,
      model_name: model.name,
      provider: model.provider,
      pricing_mode: model.realtime ? "realtime" : "simple",
      image_output_price_usd_per_million:
        IMAGE_GENERATION_MODELS.find((image) => image.id === model.id)
          ?.capabilities?.imageOutputPriceUsdPerMillion ?? null,
      ...priceFor(model.id),
    }));

  for (const row of settings) {
    if (PRICING_MODEL_IDS.has(row.model_id)) continue;
    const historical = getHistoricalTelefunRealtimeModel(row.model_id);
    result.push({
      model_id: row.model_id,
      model_name: historical?.name ?? row.model_id,
      provider: historical?.provider ?? "unknown",
      pricing_mode: historical ? "realtime" : "simple",
      historical: true,
      editable: false,
      image_output_price_usd_per_million: null,
      ...priceFor(row.model_id),
    });
  }
  return result;
}

function assertEditableModel(modelId: string) {
  if (getHistoricalTelefunRealtimeModel(modelId)) {
    throw new PricingError(
      410,
      "TELEFUN_REALTIME_MODEL_RETIRED",
      "Harga model realtime OpenAI Telefun hanya tersedia untuk riwayat.",
    );
  }
  if (!PRICING_MODEL_IDS.has(modelId)) {
    throw new PricingError(
      400,
      "UNKNOWN_MODEL",
      "Model ini tidak dikenal, jadi harganya tidak bisa disimpan.",
    );
  }
}

/** Start of `date` (YYYY-MM-DD) at 00.00 WIB. */
export function wibStartOfDay(date: string): Date {
  return new Date(`${date}T00:00:00+07:00`);
}

/**
 * Save a price now, or schedule it from `effectiveFrom` (YYYY-MM-DD, 00.00
 * WIB, after today). Scheduling the same model and day again replaces it.
 */
export async function savePricing(
  admin: AdminClient,
  body: PricingUpsert,
  options: { effectiveFrom?: string; userId: string; now?: Date },
): Promise<void> {
  assertEditableModel(body.model_id);
  const now = options.now ?? new Date();

  if (!options.effectiveFrom) {
    const { error } = await admin
      .from("ai_pricing_settings")
      .upsert(buildPricingUpsertPayload(body, now.toISOString()), {
        onConflict: "model_id",
      });
    if (error) throw error;
    return;
  }

  const start = wibStartOfDay(options.effectiveFrom);
  if (Number.isNaN(start.getTime()) || start.getTime() <= now.getTime()) {
    throw new PricingError(
      400,
      "INVALID_EFFECTIVE_DATE",
      "Tanggal mulai harus sesudah hari ini.",
    );
  }
  const { updated_at: _updatedAt, ...payload } = buildPricingUpsertPayload(
    body,
    now.toISOString(),
  );
  const { error } = await admin.from("ai_pricing_schedule").upsert(
    {
      ...payload,
      effective_from: start.toISOString(),
      created_by: options.userId,
    },
    { onConflict: "model_id,effective_from" },
  );
  if (error) {
    if (isMissingPricingScheduleTable(error)) throw SCHEDULE_UNAVAILABLE;
    throw error;
  }
}

/** Cancel a schedule that has not taken effect; ones already in effect stay. */
export async function cancelPricingSchedule(
  admin: AdminClient,
  id: string,
  now = new Date(),
): Promise<void> {
  const { data, error } = await admin
    .from("ai_pricing_schedule")
    .delete()
    .eq("id", id)
    .gt("effective_from", now.toISOString())
    .select("id");
  if (error) {
    if (isMissingPricingScheduleTable(error)) throw SCHEDULE_UNAVAILABLE;
    throw error;
  }
  if (!data?.length) {
    throw new PricingError(
      404,
      "NOT_FOUND",
      "Jadwal harga tidak ditemukan atau sudah berlaku.",
    );
  }
}

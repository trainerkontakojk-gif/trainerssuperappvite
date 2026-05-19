import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

export interface LiveUsageSnapshot {
  promptTokenCount: number;
  responseTokenCount: number;
  totalTokenCount: number;
}

export function parseUsageMetadata(raw: unknown): LiveUsageSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const meta = raw as Record<string, unknown>;

  let prompt = typeof meta.promptTokenCount === 'number' ? meta.promptTokenCount : 0;
  if (prompt === 0 && Array.isArray(meta.promptTokensDetails)) {
    for (const detail of meta.promptTokensDetails as Record<string, unknown>[]) {
      if (typeof detail?.tokenCount === 'number') prompt += detail.tokenCount;
    }
  }

  let response = typeof meta.responseTokenCount === 'number' ? meta.responseTokenCount : 0;
  if (response === 0 && typeof meta.candidatesTokenCount === 'number') {
    response = meta.candidatesTokenCount;
  }
  if (response === 0 && Array.isArray(meta.responseTokensDetails)) {
    for (const detail of meta.responseTokensDetails as Record<string, unknown>[]) {
      if (typeof detail?.tokenCount === 'number') response += detail.tokenCount;
    }
  }

  let total = typeof meta.totalTokenCount === 'number' ? meta.totalTokenCount : 0;
  if (total === 0 && (prompt > 0 || response > 0)) total = prompt + response;
  if (response === 0 && total > 0 && prompt > 0 && total >= prompt) response = total - prompt;

  if (prompt === 0 && response === 0 && total === 0) return null;
  return { promptTokenCount: prompt, responseTokenCount: response, totalTokenCount: total };
}

export function mergeSnapshot(prev: LiveUsageSnapshot | null, next: LiveUsageSnapshot): LiveUsageSnapshot {
  if (!prev) return next;
  return {
    promptTokenCount: Math.max(prev.promptTokenCount, next.promptTokenCount),
    responseTokenCount: Math.max(prev.responseTokenCount, next.responseTokenCount),
    totalTokenCount: Math.max(prev.totalTokenCount, next.totalTokenCount),
  };
}

export async function flushLiveUsage(
  requestId: string,
  userId: string,
  snapshot: LiveUsageSnapshot,
  modelId: string,
): Promise<void> {
  try {
    const [{ data: pricing }, { data: billing }] = await Promise.all([
      admin.from('ai_pricing_settings')
        .select('input_price_usd_per_million, output_price_usd_per_million')
        .eq('model_id', modelId)
        .maybeSingle(),
      admin.from('ai_billing_settings')
        .select('usd_to_idr_rate')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const usdToIdrRate = billing?.usd_to_idr_rate ?? 15000;
    const isLiveModel = modelId.includes('live');
    const inputPricePerMillion = pricing?.input_price_usd_per_million ?? (isLiveModel ? 3.0 : 0);
    const outputPricePerMillion = pricing?.output_price_usd_per_million ?? (isLiveModel ? 12.0 : 0);

    const estimatedCostUsd =
      (snapshot.promptTokenCount / 1_000_000) * inputPricePerMillion +
      (snapshot.responseTokenCount / 1_000_000) * outputPricePerMillion;

    const { error } = await admin.from('ai_usage_logs').insert({
      request_id: requestId,
      user_id: userId,
      provider: 'gemini',
      model_id: modelId,
      module: 'telefun',
      action: 'voice_live',
      input_tokens: snapshot.promptTokenCount,
      output_tokens: snapshot.responseTokenCount,
      total_tokens: snapshot.totalTokenCount,
      input_price_usd_per_million: inputPricePerMillion,
      output_price_usd_per_million: outputPricePerMillion,
      usd_to_idr_rate: usdToIdrRate,
      estimated_cost_usd: Math.round(estimatedCostUsd * 1_000_000) / 1_000_000,
      estimated_cost_idr: Math.round(estimatedCostUsd * usdToIdrRate),
    });

    if (error && error.code !== '23505') {
      console.error('[Telefun Usage] Failed to insert:', error);
    }
  } catch (err) {
    console.error('[Telefun Usage] Exception:', err);
  }
}

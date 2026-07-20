import { hc } from "hono/client";
import type { ClientResponse } from "hono/client";
import type { AppType, HealthRouteType } from "@trainers/api";
import type {
  AccessGroupItemRow,
  AccessGroupRow,
  ApiResponse,
} from "@trainers/types";

type RpcResponse<T> = ClientResponse<ApiResponse<T>, number, "json">;
type MonitoringModule = "ketik" | "pdkt" | "telefun";

export type MonitoringHistoryEntry = {
  id: string;
  user_id: string;
  module: MonitoringModule;
  scenario_title: string;
  created_at: string;
  duration_seconds: number;
  score: number | null;
  history: unknown;
  user_email?: string;
  user_role?: string;
  review_status:
    | "not_started"
    | "pending"
    | "processing"
    | "completed"
    | "failed";
  scores?: {
    final?: number;
    empathy?: number;
    probing?: number;
    resolution?: number;
    typo?: number;
    compliance?: number;
  };
  pdkt_evaluation?: {
    score: number;
    feedback: string;
    typos_count: number;
    clarity_issues_count: number;
    content_gaps_count: number;
  };
  telefun_assessment?: {
    overall_score: number;
    speaking_rate_wpm: number;
    intonation_score: number;
    articulation_score: number;
    filler_words_count: number;
    emotional_tone: string;
    strengths: string[];
    highlights: string[];
  };
};

export type UsageAggregation = {
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  user_role: string | null;
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cost_idr: number;
  simulation_cost_idr: number;
  review_cost_idr: number;
  models: Array<{
    model_id: string;
    module: string;
    action: string;
    action_category: "simulation" | "review" | "other";
    calls: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_idr: number;
  }>;
};

export type PricingEntry = {
  model_id: string;
  model_name: string;
  provider: string;
  pricing_mode: "simple" | "realtime";
  input_price_usd_per_million: number;
  output_price_usd_per_million: number;
  input_text_price_usd_per_million: number | null;
  cached_input_text_price_usd_per_million: number | null;
  input_audio_price_usd_per_million: number | null;
  cached_input_audio_price_usd_per_million: number | null;
  output_text_price_usd_per_million: number | null;
  output_audio_price_usd_per_million: number | null;
};

export type KetikMonitoringReview = {
  module: "ketik";
  review_status: string;
  scores?: {
    final?: number;
    empathy?: number;
    probing?: number;
    resolution?: number;
    typo?: number;
    compliance?: number;
  };
  review?: {
    id: string;
    sessionId: string;
    aiSummary: string;
    strengths: string[];
    weaknesses: string[];
    coachingFocus: string[];
    createdAt: string;
  } | null;
  typos?: Array<{
    id: string;
    originalWord: string;
    correctedWord: string;
    severity: string;
  }>;
};

export type PdktMonitoringReview = {
  module: "pdkt";
  review_status: string;
  evaluation: {
    score: number;
    feedback: string;
    typos: string[];
    clarityIssues: string[];
    contentGaps: string[];
    scoreBreakdown?: {
      recipientDirectionScore: number;
      normativeResponseScore: number;
      clarityScore: number;
      typoScore: number;
      templateComplianceScore: number;
    };
  } | null;
  evaluation_error: string | null;
  time_taken: number | null;
  emails: Array<{
    type?: string;
    subject?: string;
    body?: string;
    content?: string;
    timestamp?: string;
    isAgent?: boolean;
  }>;
};

export type TelefunMonitoringReview = {
  module: "telefun";
  review_status: string;
  score: number | null;
  recording_path: string | null;
  agent_recording_path: string | null;
  recording_url: string | null;
  scenario_title: string | null;
  duration_seconds: number | null;
  voice_assessment: unknown;
  transcript?: unknown;
  ai_summary: string | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
  coaching_focus: string[] | null;
};

type MonitoringReviewByModule = {
  ketik: KetikMonitoringReview;
  pdkt: PdktMonitoringReview;
  telefun: TelefunMonitoringReview;
};

type AdminClient = {
  users: {
    ":id": {
      status: {
        $put(args: {
          param: { id: string };
          json: { status: "approved" | "pending" | "rejected" };
        }): Promise<RpcResponse<null>>;
      };
      role: {
        $put(args: {
          param: { id: string };
          json: { role: string };
        }): Promise<RpcResponse<null>>;
      };
      "reset-password": {
        $post(args: {
          param: { id: string };
          json: { email: string };
        }): Promise<RpcResponse<null>>;
      };
      $delete(args: { param: { id: string } }): Promise<RpcResponse<null>>;
    };
  };
  "access-groups": {
    $post(args: {
      json: { name: string; description?: string };
    }): Promise<RpcResponse<AccessGroupRow>>;
    ":id": {
      $put(args: {
        param: { id: string };
        json: {
          name?: string;
          description?: string;
          is_active?: boolean;
        };
      }): Promise<RpcResponse<null>>;
      items: {
        $post(args: {
          param: { id: string };
          json: {
            fieldName: AccessGroupItemRow["field_name"];
            fieldValue: string;
          };
        }): Promise<RpcResponse<AccessGroupItemRow>>;
      };
    };
    items: {
      ":itemId": {
        $delete(args: {
          param: { itemId: string };
        }): Promise<RpcResponse<null>>;
      };
    };
  };
  "leader-requests": {
    ":id": {
      approve: {
        $post(args: {
          param: { id: string };
          json: { accessGroupIds: string[] };
        }): Promise<RpcResponse<null>>;
      };
      reject: {
        $post(args: {
          param: { id: string };
          json: { note?: string };
        }): Promise<RpcResponse<null>>;
      };
      revoke: {
        $post(args: {
          param: { id: string };
          json: { note?: string };
        }): Promise<RpcResponse<null>>;
      };
      groups: {
        $put(args: {
          param: { id: string };
          json: { accessGroupIds: string[] };
        }): Promise<RpcResponse<null>>;
      };
    };
  };
  "activity-logs": {
    ":id": {
      $delete(args: { param: { id: string } }): Promise<RpcResponse<null>>;
    };
  };
};

type AiClient = {
  "monitoring/history": {
    $get(): Promise<RpcResponse<MonitoringHistoryEntry[]>>;
  };
  "monitoring/history/:module/:id/review": {
    $get<M extends MonitoringModule>(args: {
      param: { module: M; id: string };
    }): Promise<RpcResponse<MonitoringReviewByModule[M]>>;
  };
  "monitoring/history/:module/:id": {
    $delete(args: {
      param: { module: MonitoringModule; id: string };
    }): Promise<RpcResponse<null>>;
  };
  "monitoring/aggregation": {
    $get(args: {
      query: { year: string; month: string; module: string };
    }): Promise<RpcResponse<UsageAggregation[]>>;
  };
  "monitoring/pricing": {
    $get(): Promise<RpcResponse<PricingEntry[]>>;
    $put(args: {
      json: Pick<
        PricingEntry,
        | "model_id"
        | "input_price_usd_per_million"
        | "output_price_usd_per_million"
      > &
        Partial<
          Pick<
            PricingEntry,
            | "input_text_price_usd_per_million"
            | "cached_input_text_price_usd_per_million"
            | "input_audio_price_usd_per_million"
            | "cached_input_audio_price_usd_per_million"
            | "output_text_price_usd_per_million"
            | "output_audio_price_usd_per_million"
          >
        >;
    }): Promise<RpcResponse<null>>;
  };
  "monitoring/billing": {
    $get(): Promise<RpcResponse<{ usd_to_idr_rate: number }>>;
    $post(args: {
      json: { usd_to_idr_rate: number };
    }): Promise<RpcResponse<null>>;
  };
  usage: {
    summary: {
      $get(args: { query: { module: string } }): Promise<RpcResponse<unknown>>;
    };
  };
};

/**
 * Base URL for the Hono RPC client.
 *
 * The Hono server is mounted with `basePath("/api")`, and routes
 * are under `/v1/*`.  The `hc` client uses this value as the prefix
 * and appends route paths (e.g. `/v1/me`) automatically.
 *
 * In dev, Vite proxies `/api` → target API server (see vite.config.ts).
 * In production, same-origin `/api` works via the Hono server's basePath.
 *
 * If `VITE_API_URL` is set (e.g. `https://api.example.com/api/v1`),
 * the trailing `/v1` is stripped so the HC client's base matches the
 * Hono `basePath("/api")`.
 */
const resolveBaseUrl = (): string => {
  const raw = import.meta.env.VITE_API_URL || "/api/v1";
  // Strip trailing /v1 if present — the Hono client adds it back
  // via the route definitions (e.g. `/v1/me`).
  return raw.replace(/\/v1\/?$/, "") || "/api";
};

const HC_BASE_URL = resolveBaseUrl();

/**
 * Custom fetch for the Hono RPC client.
 *
 * Preserves the same auth/error semantics as `fetchApi` in `useApi.ts`:
 * - Adds `Authorization: Bearer *** from localStorage
 * - Adds `X-Requested-With: XMLHttpRequest`
 * - 401 → clears session + redirects to `/`
 * - HTML content-type → throws descriptive misconfiguration error
 * - Re-throws envelope-level errors so consumers get a consistent reject
 */
export async function rpcFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const token = localStorage.getItem("auth_token");

  const headers = new Headers(init?.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("X-Requested-With", "XMLHttpRequest");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(input, { ...init, headers });

  // 401 → session expired
  if (res.status === 401) {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_profile");
    localStorage.removeItem("trainers_login_time");
    localStorage.removeItem("trainers_last_activity");
    window.location.href = "/";
    throw new Error("Sesi telah berakhir. Silakan login kembali.");
  }

  // HTML → SPA fallback / misconfigured API URL
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new Error(
      "API tidak tersedia. Pastikan HC_BASE_URL sudah benar dan ALLOWED_ORIGINS mencakup URL aplikasi ini.",
    );
  }

  return res;
}

/**
 * Typed RPC client backed by `hc<AppType>`.
 *
 * Usage:
 * ```ts
 * import { rpcClient } from "@/lib/api/rpc-client";
 *
 * const res = await rpcClient.v1.me.$get();
 * // res.json() → { success: true, data: ... } or { success: false, error: ... }
 * ```
 *
 * All requests flow through `rpcFetch` automatically: auth headers,
 * 401 redirect, and HTML-fallback detection work identically to the
 * old `fetchApi` / `getApi` / `postApi` / etc. helpers.
 *
 * NOTE: For deeply-nested route groups (KETIK, PDKT, Telefun), use
 * the per-module clients (e.g. `ketikClient`) to avoid TypeScript
 * type-depth limits.
 */
const clientOptions = { fetch: rpcFetch as typeof fetch };

export const rpcClient = hc<AppType>(HC_BASE_URL, clientOptions);

/**
 * Per-module typed clients for deeply-nested route groups.
 * These bypass the full AppType depth limit by scoping types to a single module.
 */
// Module route schemas are not preserved by the current unchained server
// router declarations, so these facades remain untyped until those routers
// are converted to chained Hono definitions.
export const ketikClient = (rpcClient as any).v1.ketik;
export const pdktClient = (rpcClient as any).v1.pdkt;
export const telefunClient = (rpcClient as any).v1.telefun;
export const sidakClient = (rpcClient as any).v1.sidak;
export const aiClient = (rpcClient as any).v1.ai as unknown as AiClient;
export const adminClient = (rpcClient as any).v1
  .admin as unknown as AdminClient;
export const profilerClient = (rpcClient as any).v1.profiler;
export const healthClient = hc<HealthRouteType>(HC_BASE_URL, clientOptions);

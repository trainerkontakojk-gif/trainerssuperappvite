import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import { AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button, buttonVariants } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { aiClient, unwrapResponse, type UsageAggregation } from "../../lib/api";
import {
  formatUsageMonth,
  lastBiayaSearch,
  shiftMonth,
  USAGE_MODULE_LABELS,
  usageMonth,
  usageQuery,
  validateBiayaSearch,
} from "./biaya-search";
import {
  ModelTable,
  MonthPicker,
  UsageCostNote,
  UsagePanel,
  UsageSummary,
} from "./components/usage/UsageParts";
import {
  sumUsage,
  usageByModel,
  usageRoleLabel,
} from "./components/usage/totals";
import { mapError } from "./utils/formatting";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Hari terakhir bulan YYYY-MM, untuk rentang tanggal di Riwayat. */
function lastDay(month: string): string {
  const next = new Date(`${shiftMonth(month, 1)}-01T00:00:00Z`);
  return new Date(next.getTime() - 86_400_000).toISOString().slice(0, 10);
}

/** Rincian biaya AI satu orang dalam satu bulan, per model. */
export default function BiayaUserPage() {
  const navigate = useNavigate();
  const { pengguna = "" } = useParams({ strict: false }) as {
    pengguna?: string;
  };
  const search = validateBiayaSearch(useSearch({ strict: false }));
  const month = usageMonth(search);
  const validId = UUID.test(pengguna);

  const [row, setRow] = useState<UsageAggregation | null>(null);
  const [loading, setLoading] = useState(validId);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!validId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = await unwrapResponse(
          await aiClient["monitoring/aggregation"].$get({
            query: { ...usageQuery(search), user_id: pengguna },
          }),
        );
        if (!cancelled) setRow(data[0] ?? null);
      } catch (err) {
        if (!cancelled) setError(mapError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `search` dibentuk ulang tiap render; bulan dan modul yang menentukan data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pengguna, validId, month, search.modul, attempt]);

  const name = row?.user_name || row?.user_email || "Rincian biaya";
  const meta = [
    row?.user_name ? row.user_email : null,
    row ? usageRoleLabel(row.user_role) : null,
    formatUsageMonth(month),
    search.modul ? USAGE_MODULE_LABELS[search.modul] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <Link
            to="/monitoring/biaya"
            search={{ ...lastBiayaSearch(), bulan: search.bulan }}
            className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Kembali ke Biaya AI
          </Link>
          <h1 className="mt-1 break-words text-page-title font-display text-foreground">
            {name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{meta}</p>
        </div>
        {row?.user_email ? (
          <Link
            to="/monitoring"
            search={{
              q: row.user_email,
              dari: `${month}-01`,
              sampai: lastDay(month),
            }}
            className={buttonVariants({
              variant: "outline",
              className: "min-h-11 shrink-0",
            })}
          >
            Lihat sesinya di Riwayat
            <ChevronRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      <MonthPicker
        month={month}
        onChange={(bulan) =>
          void navigate({
            to: "/monitoring/biaya/$pengguna",
            params: { pengguna },
            search: validateBiayaSearch({ ...search, bulan }),
            replace: true,
          })
        }
      />

      {error ? (
        <Alert variant="destructive" className="items-center">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setAttempt((n) => n + 1)}
            className="ml-auto min-h-11"
          >
            Coba lagi
          </Button>
        </Alert>
      ) : null}

      {!validId ? (
        <p className="text-sm text-muted-foreground">
          Alamat pengguna ini tidak dikenali.
        </p>
      ) : loading ? (
        <div
          role="status"
          className="flex items-center gap-2 py-6 text-sm text-muted-foreground"
        >
          <Skeleton className="size-4 rounded-full" />
          Memuat biaya…
        </div>
      ) : row ? (
        <>
          <UsageSummary totals={sumUsage([row])} />
          <UsagePanel title="Per model">
            <ModelTable rows={usageByModel([row])} splitTokens />
          </UsagePanel>
          <UsageCostNote />
        </>
      ) : error ? null : (
        <div className="grid gap-2 py-6">
          <p className="font-semibold text-foreground">
            Belum ada pemakaian AI di {formatUsageMonth(month)}
          </p>
          <p className="text-sm text-muted-foreground">
            Orang ini tidak memakai AI pada bulan itu, atau berada di luar tim
            yang bisa kamu lihat.
          </p>
        </div>
      )}
    </div>
  );
}

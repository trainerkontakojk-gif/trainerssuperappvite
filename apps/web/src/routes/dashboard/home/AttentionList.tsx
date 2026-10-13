import { Link } from "@tanstack/react-router";
import type { HomeAttentionItem, HomeAttentionKind } from "@trainers/types";
import { useCallback, useEffect, useState } from "react";
import { homeClient, unwrapResponse } from "../../../lib/api";
import QaStatePanel from "../../../components/ui/QaStatePanel";
import { Button, buttonVariants } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";

const MONTH = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

type Copy = {
  title: string;
  meta: string;
  module: string;
  moduleColor: string;
  cta: string;
  href: string;
};

/** Label dan tujuan tiap jenis item; backend hanya mengirim `kind`. */
const COPY: Record<HomeAttentionKind, (item: HomeAttentionItem) => Copy> = {
  leader_access_pending: () => ({
    title: "Permintaan akses leader",
    meta: "Menunggu persetujuan",
    module: "Administrasi",
    moduleColor: "var(--fg3)",
    cta: "Tinjau",
    href: "/dashboard/access-approval",
  }),
  agents_below_target: (item) => ({
    title: "Agen di bawah target skor 95",
    meta: `${item.scope === "team" ? "Tim Anda" : "Semua layanan"} · periode audit terakhir tiap agen`,
    module: "SIDAK",
    moduleColor: "var(--module-sidak)",
    cta: "Lihat agen",
    href: "/sidak/agents",
  }),
  qa_period_missing: (item) => ({
    title: item.period
      ? `Periode QA ${MONTH.format(Date.UTC(item.period.year, item.period.month - 1))} belum dibuat`
      : "Periode QA bulan ini belum dibuat",
    meta: "Input temuan untuk bulan ini belum bisa dipakai",
    module: "SIDAK",
    moduleColor: "var(--module-sidak)",
    cta: "Buat periode",
    href: "/sidak/periods",
  }),
};

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: HomeAttentionItem[]; partial: boolean };

/** "Perlu tindakan": item dari `GET /home/attention`, sesuai capability. */
export function AttentionList() {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const data = await unwrapResponse(await homeClient.attention.$get());
      setState({ status: "ready", items: data.items, partial: data.partial });
    } catch {
      setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const retry = (
    <Button
      type="button"
      variant="outline"
      className="min-h-[44px]"
      onClick={() => void load()}
    >
      Coba lagi
    </Button>
  );

  return (
    <section aria-labelledby="home-attention-title" className="home-section">
      <div className="home-section-head">
        <h2 id="home-attention-title" className="home-section-title">
          Perlu tindakan
        </h2>
        {state.status === "ready" && state.items.length > 0 && (
          <p className="home-section-sub">
            {state.items.length} hal menunggu Anda
          </p>
        )}
      </div>

      {state.status === "loading" && (
        <div className="home-attention" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="home-attention-row">
              <Skeleton className="h-7 w-8" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-3 w-72 max-w-full" />
              </div>
            </div>
          ))}
          <span className="sr-only">Memuat daftar tindakan</span>
        </div>
      )}

      {state.status === "error" && (
        <QaStatePanel
          type="error"
          compact
          title="Daftar tindakan belum dapat dimuat"
          description="Periksa koneksi Anda, lalu coba lagi."
          action={retry}
        />
      )}

      {state.status === "ready" && state.items.length === 0 && (
        <QaStatePanel
          type={state.partial ? "warning" : "empty"}
          compact
          title={
            state.partial
              ? "Sebagian data tidak termuat"
              : "Tidak ada yang menunggu"
          }
          description={
            state.partial
              ? "Beberapa sumber gagal dimuat, jadi daftar ini mungkin belum lengkap."
              : "Semua permintaan dan periode sudah ditangani."
          }
          action={state.partial ? retry : undefined}
        />
      )}

      {state.status === "ready" && state.items.length > 0 && (
        <>
          <ul className="home-attention">
            {state.items.map((item) => {
              const copy = COPY[item.kind](item);
              return (
                <li key={item.kind} className="home-attention-row">
                  <span className="home-attention-count">{item.count}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-fg">
                      {copy.title}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-fg2">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: copy.moduleColor }}
                          aria-hidden="true"
                        />
                        {copy.module}
                      </span>
                      <span>{copy.meta}</span>
                    </p>
                  </div>
                  <Link
                    to={copy.href as any}
                    className={buttonVariants({
                      variant: "outline",
                      className: "min-h-[44px] shrink-0",
                    })}
                  >
                    {copy.cta}
                    <span className="sr-only">: {copy.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {state.partial && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-fg2">
              <p>
                Sebagian data tidak termuat, jadi daftar ini mungkin belum
                lengkap.
              </p>
              {retry}
            </div>
          )}
        </>
      )}
    </section>
  );
}

import {
  Download,
  PieChart,
  Plus,
  Settings2,
  SlidersHorizontal,
  Table2,
  Upload,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";

import ActionToolTile from "./ActionToolTile";
import BatchHero from "./BatchHero";
import InsightPanel from "./InsightPanel";

interface Birthday {
  nama: string;
  tglLahir: string;
  days: number;
  age: number;
}

interface WorkspaceActiveBatchProps {
  batchName: string;
  count: number;
  loadingPeserta: boolean;
  isReadOnly: boolean;
  onPickPeserta: () => void;
  upcomingBirthdays: Birthday[];
  onShowBirthdays: () => void;
}

export default function WorkspaceActiveBatch({
  batchName,
  count,
  loadingPeserta,
  isReadOnly,
  onPickPeserta,
  upcomingBirthdays,
  onShowBirthdays,
}: WorkspaceActiveBatchProps) {
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const hasPeserta = count > 0;

  const animationTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: "easeOut" as const };

  return (
    <div className="relative z-10 h-full overflow-y-auto custom-scrollbar">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 p-4 sm:p-6 lg:p-8">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={animationTransition}
        >
          <BatchHero
            name={batchName}
            count={count}
            loading={loadingPeserta}
            isReadOnly={isReadOnly}
            onAddPeserta={() =>
              navigate({ to: "/profiler/add", search: { batch: batchName } })
            }
            onPickPeserta={onPickPeserta}
          />
        </motion.div>

        {hasPeserta && (
          <motion.section
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              ...animationTransition,
              delay: prefersReducedMotion ? 0 : 0.04,
            }}
            aria-labelledby="profiler-batch-insights"
          >
            <h2 id="profiler-batch-insights" className="sr-only">
              Ringkasan batch
            </h2>
            <InsightPanel
              upcomingBirthdays={upcomingBirthdays}
              totalPeserta={count}
              batchName={batchName}
              onShowBirthdays={onShowBirthdays}
            />
          </motion.section>
        )}

        <div className="flex flex-col gap-10">
          {!isReadOnly && (
            <section
              className="flex flex-col gap-4"
              aria-labelledby="profiler-data-management"
            >
              <SectionHeading
                id="profiler-data-management"
                title="Manajemen data"
                description="Tambahkan peserta baru ke batch aktif."
              />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <ActionToolTile
                  icon={<Plus aria-hidden="true" />}
                  accent="primary"
                  title="Input manual"
                  desc="Isi profil peserta satu per satu melalui formulir."
                  onClick={() =>
                    navigate({
                      to: "/profiler/add",
                      search: { batch: batchName },
                    })
                  }
                />
                <ActionToolTile
                  icon={<Upload aria-hidden="true" />}
                  accent="telefun"
                  title="Impor data"
                  desc="Unggah file Excel untuk menambahkan banyak peserta sekaligus."
                  onClick={() =>
                    navigate({
                      to: "/profiler/import",
                      search: { batch: batchName },
                    })
                  }
                />
              </div>
            </section>
          )}

          <section
            className="flex flex-col gap-4"
            aria-labelledby="profiler-analysis"
          >
            <SectionHeading
              id="profiler-analysis"
              title="Analisis & ekspor"
              description={
                hasPeserta
                  ? "Pilih tampilan yang dibutuhkan untuk batch ini."
                  : "Tambahkan peserta terlebih dahulu untuk membuka analisis."
              }
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <ActionToolTile
                disabled={!hasPeserta}
                icon={<Table2 aria-hidden="true" />}
                accent="primary"
                title="Database"
                desc="Kelola dan tinjau data peserta dalam tabel interaktif."
                onClick={() =>
                  navigate({
                    to: "/profiler/table",
                    search: { batch: batchName },
                  })
                }
              />
              <ActionToolTile
                disabled={!hasPeserta}
                icon={<SlidersHorizontal aria-hidden="true" />}
                accent="pdkt"
                title="Slide profil"
                desc="Tampilkan profil peserta dalam format presentasi."
                onClick={() =>
                  navigate({
                    to: "/profiler/slides",
                    search: { batch: batchName },
                  })
                }
              />
              <ActionToolTile
                disabled={!hasPeserta}
                icon={<Download aria-hidden="true" />}
                accent="sidak"
                title="Ekspor laporan"
                desc="Buat laporan PDF atau Excel untuk dibagikan."
                onClick={() =>
                  navigate({
                    to: "/profiler/export",
                    search: { batch: batchName },
                  })
                }
              />
              <ActionToolTile
                disabled={!hasPeserta}
                icon={<PieChart aria-hidden="true" />}
                accent="telefun"
                title="Statistik batch"
                desc="Lihat distribusi demografi peserta batch aktif."
                onClick={() =>
                  navigate({
                    to: "/profiler/analytics",
                    search: { batch: batchName },
                  })
                }
              />
            </div>
          </section>

          {!isReadOnly && (
            <section
              className="flex flex-col gap-4"
              aria-labelledby="profiler-configuration"
            >
              <SectionHeading
                id="profiler-configuration"
                title="Konfigurasi"
                description="Atur struktur tim yang tersedia di Profiler."
              />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <ActionToolTile
                  icon={<Settings2 aria-hidden="true" />}
                  accent="slate"
                  title="Manajemen tim"
                  desc="Kelola daftar tim dan struktur organisasi."
                  onClick={() => navigate({ to: "/profiler/teams" })}
                />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeading({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2
        id={id}
        className="font-outfit text-lg font-semibold tracking-tight text-foreground"
      >
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

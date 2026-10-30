import { useEffect, useMemo, useState } from "react";
import { LockKeyhole, RotateCw } from "lucide-react";
import { TRAINER_ACTIVITY_PROGRAMS } from "@trainers/types";
import type {
  PublicKegiatanResponse,
  PublicTrainerActivity,
  TrainerActivityProgram,
} from "@trainers/types";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { LandingAuthProvider } from "../components/LandingAuthClient";
import { healthClient } from "../lib/api/rpc-client";
import { unwrapResponse } from "../lib/api/unwrap-response";
import { LandingHeader } from "../components/landing/LandingHeader";
import "./landing.css";
import "./kegiatan.css";

const PROGRAM_BY_VALUE = new Map(
  TRAINER_ACTIVITY_PROGRAMS.map((program) => [program.value, program]),
);

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function displayDate(date: string | null) {
  if (!date) return null;
  const [year, month, day] = date.split("-").map(Number);
  return dateFormatter.format(new Date(year, month - 1, day));
}

function programName(value: TrainerActivityProgram) {
  return PROGRAM_BY_VALUE.get(value)!;
}

/** Roughly the first row on wide screens; these sit above the fold. */
const EAGER_IMAGE_COUNT = 4;

function ActivityCard({
  item,
  eager,
}: {
  item: PublicTrainerActivity;
  eager: boolean;
}) {
  const program = programName(item.program);
  const formattedDate = displayDate(item.event_date);

  return (
    <a
      className="kegiatan-card"
      href={item.drive_url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${item.title} ${program.label} ${item.year}, buka di Google Drive (perlu akses)`}
    >
      <span className="kegiatan-card-image">
        <img
          src={item.image_url}
          alt={item.title}
          width={800}
          height={1000}
          decoding="async"
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : undefined}
        />
        <span className="kegiatan-card-open" aria-hidden="true">
          Buka di Drive
        </span>
      </span>
      <span className="kegiatan-card-copy">
        <span className="kegiatan-card-title">{item.title}</span>
        {formattedDate ? (
          <span className="kegiatan-card-date">{formattedDate}</span>
        ) : null}
      </span>
    </a>
  );
}

function KegiatanContent() {
  const navigate = useNavigate({ from: "/kegiatan" });
  const search = useSearch({ from: "/kegiatan" });
  const [response, setResponse] = useState<PublicKegiatanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const request = healthClient.public.kegiatan.$get(
      search.tahun === undefined
        ? {}
        : { query: { tahun: String(search.tahun) } },
    );
    void request
      .then((response) => unwrapResponse(response))
      .then((data) => {
        if (active) setResponse(data as PublicKegiatanResponse);
      })
      .catch(() => {
        if (active)
          setError(
            "Kegiatan yang diterbitkan belum dapat dimuat. Silakan coba lagi.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [search.tahun, retryCount]);

  const selectedYear = search.tahun ?? response?.year ?? null;
  const filteredItems = useMemo(() => {
    const items = response?.items ?? [];
    return search.program
      ? items.filter((item) => item.program === search.program)
      : items;
  }, [response?.items, search.program]);

  const grouped = useMemo(
    () =>
      TRAINER_ACTIVITY_PROGRAMS.map((program) => ({
        program,
        items: filteredItems.filter((item) => item.program === program.value),
      })).filter(({ items }) => items.length > 0),
    [filteredItems],
  );
  const eagerIds = useMemo(
    () =>
      new Set(
        grouped
          .flatMap(({ items }) => items)
          .slice(0, EAGER_IMAGE_COUNT)
          .map((item) => item.id),
      ),
    [grouped],
  );

  const selectYear = (year: number) => {
    void navigate({ search: (previous) => ({ ...previous, tahun: year }) });
  };

  const selectProgram = (program?: TrainerActivityProgram) => {
    void navigate({
      search: (previous) => {
        const { program: _current, ...rest } = previous;
        return program ? { ...rest, program } : rest;
      },
    });
  };

  return (
    <div className="landing-wrapper kegiatan-shell">
      <a className="skip-link" href="#kegiatan-content">
        Langsung ke konten
      </a>
      <LandingAuthProvider>
        <LandingHeader />
      </LandingAuthProvider>
      <main id="kegiatan-content" className="kegiatan-page lp-container">
        <header className="kegiatan-page-header">
          <h1>Kegiatan Trainers</h1>
          <p>Dokumentasi kegiatan pelatihan berdasarkan tahun dan program.</p>
        </header>

        {response?.years.length ? (
          <section className="kegiatan-controls" aria-label="Filter kegiatan">
            <div className="kegiatan-filter-block">
              <h2>Tahun</h2>
              <div className="kegiatan-year-list" aria-label="Pilih tahun">
                {response.years.map((year) => (
                  <button
                    key={year}
                    type="button"
                    className="kegiatan-year-button"
                    aria-pressed={selectedYear === year}
                    onClick={() => selectYear(year)}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>

            <div className="kegiatan-filter-block">
              <h2>Program</h2>
              <div className="kegiatan-program-list" aria-label="Pilih program">
                <button
                  type="button"
                  className="kegiatan-program-button"
                  aria-pressed={!search.program}
                  onClick={() => selectProgram()}
                >
                  Semua
                </button>
                {TRAINER_ACTIVITY_PROGRAMS.map((program) => (
                  <button
                    key={program.value}
                    type="button"
                    className="kegiatan-program-button"
                    data-program={program.value}
                    aria-pressed={search.program === program.value}
                    onClick={() => selectProgram(program.value)}
                  >
                    {program.label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <p className="kegiatan-drive-note">
          <LockKeyhole size={18} aria-hidden="true" />
          Folder Google Drive mungkin dibatasi. Jika tidak bisa membuka berkas,
          minta akses kepada pemilik folder.
        </p>

        {loading ? (
          <div className="kegiatan-loading" role="status" aria-live="polite">
            <span className="sr-only">Memuat kegiatan…</span>
            <span />
            <span />
            <span />
          </div>
        ) : error ? (
          <div className="kegiatan-error" role="alert">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => setRetryCount((previous) => previous + 1)}
            >
              <RotateCw size={16} aria-hidden="true" />
              Coba lagi
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <p className="kegiatan-empty">
            {search.program && response?.items.length
              ? `Belum ada kegiatan ${programName(search.program).label} yang diterbitkan pada ${selectedYear}.`
              : "Belum ada kegiatan yang diterbitkan."}
          </p>
        ) : (
          <div className="kegiatan-groups">
            {grouped.map(({ program, items }) => (
              <section
                key={program.value}
                className="kegiatan-group"
                aria-labelledby={`kegiatan-${program.value}`}
              >
                <header className="kegiatan-group-heading">
                  <div className="kegiatan-group-name">
                    <span
                      className="kegiatan-program-dot"
                      data-program={program.value}
                      aria-hidden="true"
                    />
                    <h2 id={`kegiatan-${program.value}`}>{program.label}</h2>
                    <span className="kegiatan-program-full-name">
                      {program.fullName}
                    </span>
                  </div>
                  <span className="kegiatan-group-count">
                    {items.length} kegiatan
                  </span>
                </header>
                <div className="kegiatan-grid">
                  {items.map((item) => (
                    <ActivityCard
                      key={item.id}
                      item={item}
                      eager={eagerIds.has(item.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
      <footer className="kegiatan-footer lp-container">
        <span>© 2026 Trainers SuperApp</span>
      </footer>
    </div>
  );
}

export default function KegiatanPage() {
  return <KegiatanContent />;
}

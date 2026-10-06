import {
  Briefcase,
  Calendar,
  ChevronDown,
  Clock,
  Code,
  Download,
  FileDown,
  Plus,
  RefreshCw,
  Table,
  Users,
} from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AgentReportFormat } from "../../utils/exportAgentReport";

interface Props {
  nama: string;
  tim: string;
  batchName: string;
  jabatan: string | null;
  bergabungDate: string | null;
  fotoUrl: string | null;
  role: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  onExport: (format: AgentReportFormat) => void;
  onInputAudit: () => void;
  /** Tombol kembali ke direktori agen, sebaris dengan pemilih agen. */
  backAction?: ReactNode;
  /** Pemilih agen (hanya untuk staf). */
  switcher?: ReactNode;
  /** Skor bulan terbaru beserta statusnya. */
  latestScore?: ReactNode;
  /** Peringkat dan forecast tahun berjalan. */
  quickview?: ReactNode;
}

function initialsOf(nama: string): string {
  const parts = nama.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase());
  return letters.join("") || "?";
}

function computeTenure(bergabungDate: string | null): string {
  if (!bergabungDate) return "-";
  const start = new Date(bergabungDate);
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (months < 0) {
    years--;
    months += 12;
  }
  return years > 0 ? years + " tahun " + months + " bulan" : months + " bulan";
}

const exportOptions: Array<{
  format: AgentReportFormat;
  label: string;
  icon: ReactNode;
  description: string;
}> = [
  {
    format: "xlsx",
    label: "Excel (.xlsx)",
    icon: <Table aria-hidden="true" />,
    description: "Satu sheet per bagian, siap diolah di Excel atau Google Sheets",
  },
  {
    format: "html-interactive",
    label: "HTML Interaktif",
    icon: <Code aria-hidden="true" />,
    description: "Halaman web dengan tab per bagian laporan",
  },
  {
    format: "html-static",
    label: "HTML Statis",
    icon: <Code aria-hidden="true" />,
    description: "Halaman web siap cetak, tanpa interaksi",
  },
  {
    format: "pdf",
    label: "PDF",
    icon: <FileDown aria-hidden="true" />,
    // Jujur soal isinya: dokumen A4 ber-paginasi dengan teks yang bisa dicari,
    // bukan hasil tangkapan layar.
    description: "Dokumen A4; teks bisa dicari dan disalin",
  },
];

/** Jarak sidebar dari tepi atas area scroll saat menempel (`top-6`). */
const STICKY_TOP_PX = 24;

function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Sidebar hanya menempel bila seluruh isinya muat di area scroll. Bila tidak
 * muat, sidebar ikut scroll halaman biasa supaya tidak ada isi yang terpotong
 * atau butuh scroll terpisah.
 */
function useStickyWhenFits() {
  const ref = useRef<HTMLElement>(null);
  const [fits, setFits] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const viewport = scrollParentOf(el);
    const measure = () => {
      const available = viewport ? viewport.clientHeight : window.innerHeight;
      setFits(el.offsetHeight + STICKY_TOP_PX * 2 <= available);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (viewport) observer.observe(viewport);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return { ref, fits };
}

export default function AgentProfileSidebar({
  nama,
  tim,
  batchName,
  jabatan,
  bergabungDate,
  fotoUrl,
  role,
  onRefresh,
  refreshing = false,
  onExport,
  onInputAudit,
  backAction,
  switcher,
  latestScore,
  quickview,
}: Props) {
  const isStaff = role === "trainer" || role === "admin" || role === "leader";
  const masaKerja = computeTenure(bergabungDate);
  const { ref, fits } = useStickyWhenFits();
  const meta: Array<{ icon: ReactNode; label: string; text: string }> = [
    { icon: <Users aria-hidden="true" />, label: "Tim", text: tim },
    { icon: <Calendar aria-hidden="true" />, label: "Batch", text: batchName },
    {
      icon: <Briefcase aria-hidden="true" />,
      label: "Jabatan",
      text: jabatan || "Agen",
    },
    {
      icon: <Clock aria-hidden="true" />,
      label: "Masa kerja",
      text: masaKerja,
    },
  ];

  return (
    <aside
      ref={ref}
      aria-label="Profil agen"
      data-sticky={fits ? "true" : "false"}
      className={`flex min-w-0 flex-col gap-5 ${fits ? "lg:sticky lg:top-6" : ""}`}
    >
      <div className="flex items-center gap-2">
        {backAction}
        {isStaff && switcher ? (
          <div className="min-w-0 flex-1">{switcher}</div>
        ) : null}
      </div>

      <div className="flex min-w-0 items-center gap-4 lg:flex-col lg:items-start">
        <Avatar
          size="lg"
          className="!size-[96px] shrink-0 rounded-2xl border border-border bg-muted after:rounded-2xl lg:!size-[160px]"
        >
          {fotoUrl ? (
            <AvatarImage
              src={fotoUrl}
              alt={`Foto ${nama}`}
              className="rounded-2xl object-cover"
            />
          ) : null}
          <AvatarFallback className="rounded-2xl bg-muted font-outfit text-3xl font-bold tracking-tight text-muted-foreground lg:text-5xl">
            {initialsOf(nama)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <h1 className="break-words font-outfit text-xl font-bold leading-tight tracking-tight text-balance text-foreground lg:text-2xl">
            {nama}
          </h1>
          <ul
            aria-label="Info agen"
            className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground"
          >
            {meta.map((item) => (
              <li
                key={item.label}
                className="flex min-w-0 items-center gap-2 [&_svg]:size-3.5 [&_svg]:shrink-0"
              >
                {item.icon}
                <span className="sr-only">{item.label}: </span>
                <span className="truncate">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {isStaff ? (
          <Button type="button" onClick={onInputAudit} className="h-10 w-full">
            <Plus data-icon="inline-start" aria-hidden="true" />
            <span>Input Audit</span>
          </Button>
        ) : null}
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 min-w-0 flex-1 px-3"
                />
              }
            >
              <Download data-icon="inline-start" aria-hidden="true" />
              <span>Unduh Laporan</span>
              <ChevronDown data-icon="inline-end" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Pilih format laporan</DropdownMenuLabel>
                {exportOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.format}
                    onClick={() => onExport(option.format)}
                    className="min-h-11 items-start gap-3 py-2"
                  >
                    <span className="mt-0.5 text-muted-foreground">
                      {option.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-tight">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block whitespace-normal text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {onRefresh ? (
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label={
                refreshing
                  ? "Memuat ulang profil agen"
                  : "Muat ulang profil agen"
              }
              title="Muat ulang"
              className="size-10 shrink-0"
            >
              <RefreshCw
                className={
                  refreshing
                    ? "animate-spin motion-reduce:animate-none"
                    : undefined
                }
                aria-hidden="true"
              />
            </Button>
          ) : null}
        </div>
      </div>

      {latestScore || quickview ? (
        <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-1">
          {latestScore}
          {quickview}
        </div>
      ) : null}
    </aside>
  );
}

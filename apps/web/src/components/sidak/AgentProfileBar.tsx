import {
  Briefcase,
  Calendar,
  ChevronDown,
  Clock,
  Code,
  Download,
  FileText,
  Plus,
  RefreshCw,
  Table,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  return years > 0
    ? years + " tahun " + months + " bulan"
    : months + " bulan";
}

const exportOptions: Array<{
  format: AgentReportFormat;
  label: string;
  icon: ReactNode;
  description: string;
}> = [
  {
    format: "csv",
    label: "CSV",
    icon: <Table aria-hidden="true" />,
    description: "Format tabel sederhana",
  },
  {
    format: "md",
    label: "Markdown (.md)",
    icon: <FileText aria-hidden="true" />,
    description: "Dokumentasi Markdown",
  },
  {
    format: "html-interactive",
    label: "HTML Interaktif",
    icon: <Code aria-hidden="true" />,
    description: "Grafik dengan filter dan tooltip",
  },
  {
    format: "html-static",
    label: "HTML Statis",
    icon: <Code aria-hidden="true" />,
    description: "Siap cetak tanpa JavaScript",
  },
];

export default function AgentProfileBar({
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
}: Props) {
  const initial = nama.charAt(0).toUpperCase();
  const isStaff = role === "trainer" || role === "admin" || role === "leader";
  const masaKerja = computeTenure(bergabungDate);

  return (
    <Card className="relative z-50 gap-0 overflow-visible border-border bg-card py-0 text-card-foreground ring-0">
      <CardContent className="flex flex-col gap-5 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar
            size="lg"
            className="!size-24 shrink-0 rounded-2xl bg-muted sm:!size-28"
          >
            {fotoUrl ? <AvatarImage src={fotoUrl} alt="" /> : null}
            <AvatarFallback className="rounded-2xl bg-muted font-outfit text-5xl font-bold text-primary sm:text-6xl">
              {initial}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1 pt-1">
            <h1 className="break-words font-outfit text-xl font-bold leading-tight tracking-tight text-foreground sm:text-2xl">
              {nama}
            </h1>
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex min-w-0 items-center gap-1.5 break-words">
                <Users aria-hidden="true" />
                <span>{tim}</span>
              </span>
              <span aria-hidden="true">•</span>
              <span className="inline-flex min-w-0 items-center gap-1.5 break-words">
                <Calendar aria-hidden="true" />
                <span>{batchName}</span>
              </span>
              <span aria-hidden="true">•</span>
              <span className="inline-flex min-w-0 items-center gap-1.5 break-words">
                <Briefcase aria-hidden="true" />
                <span>{jabatan || "Agen"}</span>
              </span>
              <span aria-hidden="true">•</span>
              <span className="inline-flex items-center gap-1.5">
                <Clock aria-hidden="true" />
                <span>{masaKerja}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          {onRefresh ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label={
                refreshing ? "Memuat ulang profil agen" : "Muat ulang profil agen"
              }
              className="min-h-11 flex-1 sm:flex-none"
            >
              <RefreshCw
                data-icon="inline-start"
                className={refreshing ? "animate-spin motion-reduce:animate-none" : undefined}
                aria-hidden="true"
              />
              <span>{refreshing ? "Memuat…" : "Muat ulang"}</span>
            </Button>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="min-h-11 flex-1 sm:flex-none"
                />
              }
            >
              <Download data-icon="inline-start" aria-hidden="true" />
              <span>Unduh Laporan</span>
              <ChevronDown data-icon="inline-end" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Pilih format laporan</DropdownMenuLabel>
                {exportOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.format}
                    onClick={() => onExport(option.format)}
                    className="min-h-11 items-start gap-3 py-2"
                  >
                    <span className="mt-0.5 text-muted-foreground">{option.icon}</span>
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

          {isStaff ? (
            <Button
              type="button"
              size="lg"
              onClick={onInputAudit}
              className="min-h-11 flex-1 sm:flex-none"
            >
              <Plus data-icon="inline-start" aria-hidden="true" />
              <span>Input Audit</span>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

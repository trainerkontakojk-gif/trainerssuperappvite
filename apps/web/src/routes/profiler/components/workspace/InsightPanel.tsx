import { Cake, Info, PieChart } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Birthday {
  nama: string;
  tglLahir: string;
  days: number;
  age: number;
}

interface InsightPanelProps {
  upcomingBirthdays: Birthday[];
  totalPeserta: number;
  batchName: string;
  onShowBirthdays: () => void;
}

export default function InsightPanel({
  upcomingBirthdays,
  totalPeserta,
  batchName,
  onShowBirthdays,
}: InsightPanelProps) {
  const nearestBirthday = upcomingBirthdays[0] ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={onShowBirthdays}
        className="h-full min-h-28 w-full justify-start gap-4 whitespace-normal p-5 text-left"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Cake aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-col items-start gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            Ulang tahun terdekat
          </span>
          {nearestBirthday ? (
            <>
              <span className="max-w-full truncate font-outfit text-base font-semibold tracking-tight text-foreground">
                {nearestBirthday.nama}
              </span>
              <span className="text-xs text-muted-foreground">
                {nearestBirthday.days === 0
                  ? "Hari ini"
                  : `${nearestBirthday.days} hari lagi`}
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              Belum ada data ulang tahun
            </span>
          )}
        </span>
      </Button>

      <Card className="min-h-28 border-border bg-card ring-0">
        <CardHeader className="flex-row items-start gap-3 p-5 pb-0">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <PieChart aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Ringkasan batch
            </CardTitle>
            <CardDescription className="mt-1 truncate text-xs">
              {batchName}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-3">
          <p className="font-mono text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {totalPeserta}
            <span className="ml-2 font-sans text-sm font-normal text-muted-foreground">
              peserta
            </span>
          </p>
        </CardContent>
      </Card>

      <Card className="hidden min-h-28 border-dashed border-border bg-card ring-0 xl:flex">
        <CardContent className="flex items-start gap-4 p-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Info aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <Badge variant="outline" className="mb-2">
              Tips navigasi
            </Badge>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Gunakan panel hierarki untuk berpindah antar tahun, tim, dan batch
              dengan cepat.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

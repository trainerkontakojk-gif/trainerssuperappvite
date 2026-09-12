import { Layers, Plus, UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

interface BatchHeroProps {
  name: string;
  count: number;
  loading?: boolean;
  isReadOnly?: boolean;
  onAddPeserta?: () => void;
  onPickPeserta?: () => void;
}

export default function BatchHero({
  name,
  count,
  loading = false,
  isReadOnly = false,
  onAddPeserta,
  onPickPeserta,
}: BatchHeroProps) {
  return (
    <Card className="overflow-hidden border-border bg-card py-0 ring-0">
      <CardHeader className="gap-5 border-b border-border bg-muted/20 p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                <Layers data-icon="inline-start" aria-hidden="true" />
                Workspace aktif
              </Badge>
              <span className="text-xs text-muted-foreground">
                Data peserta terpilih
              </span>
            </div>
            <CardTitle className="mt-3 break-words font-outfit text-2xl font-bold tracking-tight sm:text-3xl">
              {name}
            </CardTitle>
            <CardDescription className="mt-1 max-w-2xl leading-relaxed">
              Kelola data, buka analisis, dan siapkan laporan untuk batch ini.
            </CardDescription>
          </div>

          {!isReadOnly && (
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <Button
                type="button"
                size="lg"
                onClick={onPickPeserta}
                className="min-h-11 w-full sm:w-auto"
              >
                <UserPlus data-icon="inline-start" aria-hidden="true" />
                Tambah peserta
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={onAddPeserta}
                className="min-h-11 w-full sm:w-auto"
              >
                <Plus data-icon="inline-start" aria-hidden="true" />
                Input manual
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-4 p-5 sm:p-6">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Peserta terdaftar
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold tabular-nums tracking-tight text-foreground">
              {count}
            </span>
            <span className="text-sm text-muted-foreground">peserta</span>
          </div>
        </div>

        <Separator orientation="vertical" className="hidden h-10 sm:block" />

        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Mode akses
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {isReadOnly ? "Hanya baca" : "Akses penuh"}
          </p>
        </div>

        {loading && (
          <span className="text-xs text-muted-foreground" role="status">
            Memuat peserta...
          </span>
        )}
      </CardContent>
    </Card>
  );
}

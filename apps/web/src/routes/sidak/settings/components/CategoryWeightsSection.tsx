import { useEffect, useId, useState } from "react";
import type { RuleVersion } from "@trainers/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SCORING_MODE_LABEL } from "../constants";
import { useCategoryWeightDraft } from "../hooks/useCategoryWeightDraft";

interface CategoryWeightsSectionProps {
  version: RuleVersion;
  isDraft: boolean;
  save: (versionId: string, nonCriticalPercent: number) => Promise<void>;
}

/**
 * Bobot kategori. Slider/angka hanya untuk draft dengan mode berbobot; perubahan
 * disimpan sekali per commit (lihat `useCategoryWeightDraft`).
 */
export function CategoryWeightsSection({
  version,
  isDraft,
  save,
}: CategoryWeightsSectionProps) {
  const serverPercent = Math.round(version.non_critical_weight * 100);
  const { value, status, error, change, commit } = useCategoryWeightDraft({
    versionId: version.id,
    serverPercent,
    save,
  });
  const editable = isDraft && version.scoring_mode !== "no_category";
  const shownNc = editable ? value : serverPercent;
  const shownCritical = editable ? 100 - value : Math.round(version.critical_weight * 100);

  const sliderId = useId();
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  return (
    <section aria-labelledby="bobot-kategori-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3
          id="bobot-kategori-heading"
          className="text-base font-semibold text-foreground"
        >
          Bobot kategori
        </h3>
        <p className="text-sm text-muted-foreground">
          Mode penilaian: {SCORING_MODE_LABEL[version.scoring_mode]}
        </p>
      </div>

      {version.scoring_mode === "no_category" ? (
        <p className="text-sm text-muted-foreground">
          Semua parameter dinilai tanpa pembagian kategori.
        </p>
      ) : editable ? (
        <div className="space-y-2">
          <div className="grid items-end gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <Label htmlFor={sliderId} className="mb-1 text-sm">
                Bobot Non-critical
              </Label>
              <input
                id={sliderId}
                type="range"
                min={0}
                max={100}
                step={5}
                value={value}
                onChange={(e) => change(Number(e.target.value))}
                onPointerUp={commit}
                onBlur={commit}
                className="block h-[44px] w-full cursor-pointer accent-primary"
              />
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                step={5}
                aria-label="Bobot Non-critical, angka"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  const parsed = Number.parseInt(e.target.value, 10);
                  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) {
                    change(parsed);
                  }
                }}
                onBlur={() => {
                  setText(String(value));
                  commit();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                }}
                className="!h-[44px] w-24 tabular-nums"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <p className="text-sm text-foreground">
            Critical <span className="tabular-nums">{shownCritical}%</span>
            <span className="text-muted-foreground"> (sisa dari Non-critical)</span>
          </p>
          <div className="min-h-5 text-[12px]">
            {status === "saving" && (
              <p role="status" className="text-muted-foreground">Menyimpan…</p>
            )}
            {status === "saved" && (
              <p role="status" className="text-muted-foreground">Tersimpan</p>
            )}
            {status === "error" && (
              <p role="alert" className="text-destructive">
                Gagal menyimpan bobot: {error}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-foreground">
          Non-critical <span className="tabular-nums">{shownNc}%</span>
          <span className="text-muted-foreground"> · </span>
          Critical <span className="tabular-nums">{shownCritical}%</span>
        </p>
      )}
    </section>
  );
}

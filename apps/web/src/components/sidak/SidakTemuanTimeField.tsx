import { useId } from "react";
import {
  SIDAK_TIME_SOURCE,
  type ServiceType,
  type TemuanWaktu,
} from "@trainers/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { timeDraft } from "../../lib/sidak-temuan-time";

export function SidakTemuanTimeField({
  service,
  value,
  onChange,
}: {
  service: ServiceType;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const source = SIDAK_TIME_SOURCE[service];
  if (source.kind === "none") return null;
  const isJam = source.kind === "jam";
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>{source.label} — opsional</Label>
      <Input
        id={id}
        className="min-h-[44px]"
        type={isJam ? "time" : "text"}
        value={isJam ? value.slice(0, 5) : value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={isJam ? undefined : "mm:ss"}
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {isJam ? "Jam WIB (HH:MM)." : "Menit:detik, misalnya 05:30."}
      </p>
    </div>
  );
}

export function SidakTemuanTimeValue({
  service,
  time,
}: {
  service: ServiceType;
  time: TemuanWaktu;
}) {
  const source = SIDAK_TIME_SOURCE[service];
  if (source.kind === "none") return null;
  const value = timeDraft(service, time);
  return (
    <>
      {source.label}:{" "}
      {value
        ? source.kind === "jam"
          ? `${value.slice(0, 5)} WIB`
          : value
        : "Belum diisi"}
    </>
  );
}

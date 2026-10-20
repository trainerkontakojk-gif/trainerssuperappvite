import { useState } from "react";
import { Info, RefreshCw } from "lucide-react";
import {
  detectKetikIdentityAnomalies,
  KETIK_CONSUMER_POOL,
  type KetikIdentityAnomaly,
  type KetikIdentityAnomalyField,
  type KetikIdentitySettings,
} from "@trainers/types";
import { Button } from "../../../../components/ui/button";
import {
  SettingsField,
  SettingsInput,
} from "../../../../components/settings/SettingsPrimitives";

interface KetikIdentityTabProps {
  identitySettings: KetikIdentitySettings;
  handleIdentityChange: (field: string, value: string) => void;
}

const NOTE_SUFFIX: Record<KetikIdentityAnomalyField, string> = {
  nik: "Agen akan dinilai apakah mengonfirmasi data ini.",
  email: "Agen akan dinilai apakah mengonfirmasi data ini.",
  city: "Agen akan dinilai apakah memastikan kota/kabupatennya.",
};

const BIRTH_DATE = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Neutral note under a deliberately malformed value; saving stays allowed. */
function AnomalyNote({
  id,
  anomaly,
}: {
  id: string;
  anomaly: KetikIdentityAnomaly | undefined;
}) {
  if (!anomaly) return null;
  return (
    <p id={id} className="flex gap-1.5 text-xs leading-[18px] text-fg2">
      <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>
        {anomaly.reason}. {NOTE_SUFFIX[anomaly.field]}
      </span>
    </p>
  );
}

export function KetikIdentityTab({
  identitySettings,
  handleIdentityChange,
}: KetikIdentityTabProps) {
  const anomalies = detectKetikIdentityAnomalies(identitySettings);
  const anomalyFor = (field: KetikIdentityAnomalyField) =>
    anomalies.find((anomaly) => anomaly.field === field);
  const [exampleIndex, setExampleIndex] = useState(() =>
    Math.floor(Math.random() * KETIK_CONSUMER_POOL.length),
  );
  const example = KETIK_CONSUMER_POOL[exampleIndex];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-6">
        <div className="flex max-w-[60ch] flex-col gap-1">
          <h3 className="font-display text-xl font-bold tracking-tight text-foreground">
            Identitas konsumen
          </h3>
          <p className="text-[13px] leading-5 text-fg2">
            Nama, nomor, kota, NIK, dan email konsumen di chat, serta nama agen
            di salam pembuka. Kosongkan field mana pun agar diambil acak dari
            data konsumen latihan. Isi NIK atau email yang sengaja salah, atau
            domisili yang belum spesifik (mis. Jakarta, Lampung), untuk melatih
            agen memverifikasi data.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SettingsField label="Nama konsumen" id="ketik-identity-display-name">
            <SettingsInput
              id="ketik-identity-display-name"
              placeholder="Contoh: Agus Setiawan"
              value={identitySettings.displayName || ""}
              onChange={(e) =>
                handleIdentityChange("displayName", e.target.value)
              }
            />
          </SettingsField>

          <SettingsField
            label="Nama agen di salam pembuka"
            id="ketik-identity-signature-name"
          >
            <SettingsInput
              id="ketik-identity-signature-name"
              placeholder="Contoh: Fajar"
              value={identitySettings.signatureName || ""}
              onChange={(e) =>
                handleIdentityChange("signatureName", e.target.value)
              }
            />
          </SettingsField>

          <SettingsField label="Nomor telepon" id="ketik-identity-phone">
            <SettingsInput
              id="ketik-identity-phone"
              type="tel"
              placeholder="Contoh: 0812..."
              value={identitySettings.phoneNumber || ""}
              onChange={(e) =>
                handleIdentityChange("phoneNumber", e.target.value)
              }
            />
          </SettingsField>

          <SettingsField label="Kota asal" id="ketik-identity-city">
            <SettingsInput
              id="ketik-identity-city"
              placeholder="Contoh: Jakarta Selatan"
              value={identitySettings.city || ""}
              aria-describedby={
                anomalyFor("city") ? "ketik-identity-city-note" : undefined
              }
              onChange={(e) => handleIdentityChange("city", e.target.value)}
            />
            <AnomalyNote
              id="ketik-identity-city-note"
              anomaly={anomalyFor("city")}
            />
          </SettingsField>

          <SettingsField label="NIK" id="ketik-identity-nik">
            <SettingsInput
              id="ketik-identity-nik"
              inputMode="numeric"
              autoComplete="off"
              placeholder="16 digit"
              value={identitySettings.nik || ""}
              aria-describedby={
                anomalyFor("nik") ? "ketik-identity-nik-note" : undefined
              }
              onChange={(e) => handleIdentityChange("nik", e.target.value)}
              className="font-mono"
            />
            <AnomalyNote
              id="ketik-identity-nik-note"
              anomaly={anomalyFor("nik")}
            />
          </SettingsField>

          <SettingsField label="Alamat email" id="ketik-identity-email">
            <SettingsInput
              id="ketik-identity-email"
              // type="text": a typo domain must stay saveable.
              inputMode="email"
              autoComplete="off"
              placeholder="Contoh: agus.setiawan90@gmail.com"
              value={identitySettings.email || ""}
              aria-describedby={
                anomalyFor("email") ? "ketik-identity-email-note" : undefined
              }
              onChange={(e) => handleIdentityChange("email", e.target.value)}
            />
            <AnomalyNote
              id="ketik-identity-email-note"
              anomaly={anomalyFor("email")}
            />
          </SettingsField>
        </div>
      </section>

      <section
        aria-labelledby="ketik-identity-example-title"
        className="flex flex-col gap-3 border-t border-border pt-6"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex max-w-[60ch] flex-col gap-1">
            <h4
              id="ketik-identity-example-title"
              className="text-sm font-semibold text-foreground"
            >
              Contoh identitas acak
            </h4>
            <p className="text-[13px] leading-5 text-fg2">
              Diambil dari {KETIK_CONSUMER_POOL.length} konsumen latihan. NIK
              berakhiran 0000 sehingga tidak pernah sama dengan NIK orang
              sungguhan.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setExampleIndex(
                (index) =>
                  (index + 1 + Math.floor(Math.random() * 20)) %
                  KETIK_CONSUMER_POOL.length,
              )
            }
            className="min-h-[44px] gap-2 px-3.5 text-[13px]"
          >
            <RefreshCw data-icon="inline-start" />
            Contoh lain
          </Button>
        </div>
        <dl
          aria-live="polite"
          className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border border-border bg-surface-sunken/50 p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {[
            ["Nama", example.name, false],
            ["Kota", example.city, false],
            ["Nomor telepon", example.phone, true],
            ["NIK", example.nik, true],
            ["Email", example.email, false],
            [
              "Tanggal lahir",
              BIRTH_DATE.format(new Date(`${example.birthDate}T00:00:00Z`)),
              false,
            ],
          ].map(([label, value, mono]) => (
            <div key={String(label)} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd
                className={
                  mono
                    ? "font-mono text-[13px] font-medium break-all text-foreground"
                    : "text-sm font-medium break-words text-foreground"
                }
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

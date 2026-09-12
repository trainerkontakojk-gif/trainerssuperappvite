import { Card, CardContent } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";

interface KetikIdentityTabProps {
  identitySettings: {
    displayName: string;
    signatureName: string;
    phoneNumber: string;
    city: string;
  };
  handleIdentityChange: (field: string, value: string) => void;
}

export function KetikIdentityTab({
  identitySettings,
  handleIdentityChange,
}: KetikIdentityTabProps) {
  return (
    <div className="mt-2 flex flex-col gap-6 pb-10">
      <div className="flex flex-col gap-2 border-b border-border pb-4">
        <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground">
          Identitas &amp; Greeting
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Konfigurasi profil konsumen dan identitas agen untuk salam pembuka
          yang lebih personal.
        </p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-5 p-6 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="ketik-identity-display-name"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Nama Konsumen
            </Label>
            <Input
              id="ketik-identity-display-name"
              type="text"
              className="bg-background"
              placeholder="Contoh: Agus Setiawan"
              value={identitySettings.displayName || ""}
              onChange={(e) =>
                handleIdentityChange("displayName", e.target.value)
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="ketik-identity-signature-name"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Nama Agen (Greeting)
            </Label>
            <Input
              id="ketik-identity-signature-name"
              type="text"
              className="bg-background"
              placeholder="Contoh: Fajar"
              value={identitySettings.signatureName || ""}
              onChange={(e) =>
                handleIdentityChange("signatureName", e.target.value)
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="ketik-identity-phone"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Nomor Telepon
            </Label>
            <Input
              id="ketik-identity-phone"
              type="text"
              className="bg-background"
              placeholder="Contoh: 0812..."
              value={identitySettings.phoneNumber || ""}
              onChange={(e) =>
                handleIdentityChange("phoneNumber", e.target.value)
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="ketik-identity-city"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Kota Asal
            </Label>
            <Input
              id="ketik-identity-city"
              type="text"
              className="bg-background"
              placeholder="Contoh: Jakarta"
              value={identitySettings.city || ""}
              onChange={(e) => handleIdentityChange("city", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

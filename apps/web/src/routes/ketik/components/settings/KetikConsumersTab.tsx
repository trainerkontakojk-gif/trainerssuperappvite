import { ArrowLeft, Edit2, Trash2, Plus } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { KetikAppSettings, KetikConsumerType } from "@trainers/types";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";
import { Textarea } from "../../../../components/ui/textarea";
import { useCrudForm } from "../../../../hooks/useCrudForm";
import { normalizeKetikConsumerDraft } from "./ketikDraftNormalizers";

interface KetikConsumersTabProps {
  consumerTypes: KetikConsumerType[];
  activeConsumerTypeId: string;
  consumerForm: ReturnType<typeof useCrudForm<KetikConsumerType>>;
  setLocalSettings: Dispatch<SetStateAction<KetikAppSettings>>;
}

export function KetikConsumersTab({
  consumerTypes,
  activeConsumerTypeId,
  consumerForm,
  setLocalSettings,
}: KetikConsumersTabProps) {
  const handleSelectConsumerType = (id: string) =>
    setLocalSettings((prev) => ({ ...prev, activeConsumerTypeId: id }));

  const handleDeleteConsumer = (id: string) => {
    if (window.confirm("Hapus karakteristik ini?")) {
      setLocalSettings((prev) => ({
        ...prev,
        consumerTypes: prev.consumerTypes.filter((c) => c.id !== id),
        activeConsumerTypeId:
          prev.activeConsumerTypeId === id
            ? "random"
            : prev.activeConsumerTypeId,
      }));
    }
  };

  const handleAddClick = () => {
    consumerForm.openAdd();
  };

  const handleEditClick = (consumer: KetikConsumerType) => {
    consumerForm.openEdit(consumer);
  };

  const handleSaveConsumer = () => {
    if (!consumerForm.draft.name || !consumerForm.draft.description) return;

    const normalizedDraft = normalizeKetikConsumerDraft(consumerForm.draft);

    setLocalSettings((prev) => ({
      ...prev,
      consumerTypes: consumerForm.save(prev.consumerTypes, normalizedDraft),
    }));

    consumerForm.close();
  };

  const handleCancelConsumerForm = () => {
    if (consumerForm.isDirty(consumerTypes)) {
      if (!window.confirm("Karakter belum disimpan. Buang perubahan?")) return;
    }
    consumerForm.close();
  };

  if (consumerForm.isOpen) {
    return (
      <div className="flex flex-col gap-6 pb-10">
        <div className="border-b border-border pb-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancelConsumerForm}
            className="-ml-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft data-icon="inline-start" />
            Kembali ke Daftar Karakter
          </Button>
        </div>
        <Card>
          <CardHeader className="border-b bg-muted/20 px-6 py-4">
            <CardTitle className="text-base tracking-tight">
              {consumerForm.editingId
                ? "Edit Karakter"
                : "Tambah Karakter Baru"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 p-6">
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Nama Karakter
              </Label>
              <Input
                className="bg-background"
                value={consumerForm.draft.name || ""}
                onChange={(e) =>
                  consumerForm.setDraft({ name: e.target.value })
                }
                placeholder="Contoh: Pelanggan Marah"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tingkat Kesulitan
              </Label>
              <Select
                value={consumerForm.draft.difficulty || "Sedang"}
                onValueChange={(value) => {
                  if (!value) return;
                  consumerForm.setDraft({
                    difficulty: value as KetikConsumerType["difficulty"],
                  });
                }}
              >
                <SelectTrigger className="h-10 w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mudah">Mudah</SelectItem>
                  <SelectItem value="Sedang">Sedang</SelectItem>
                  <SelectItem value="Sulit">Sulit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Deskripsi / AI Prompt
              </Label>
              <Textarea
                className="min-h-24 resize-none bg-background"
                rows={4}
                value={consumerForm.draft.description || ""}
                onChange={(e) =>
                  consumerForm.setDraft({ description: e.target.value })
                }
                placeholder="Deskripsikan bagaimana karakter ini berperilaku..."
              />
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2.5 border-t bg-muted/20 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelConsumerForm}
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={handleSaveConsumer}
              disabled={
                !consumerForm.draft.name || !consumerForm.draft.description
              }
            >
              Simpan
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-6 pb-10">
      <div className="flex flex-col gap-2 border-b border-border pb-4">
        <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground">
          Pilih Karakter Pelanggan
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Pilih satu kepribadian pelanggan yang akan Anda hadapi. Karakter ini
          akan digunakan untuk{" "}
          <span className="font-medium text-foreground">semua skenario</span>{" "}
          yang aktif.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Button
          type="button"
          variant={activeConsumerTypeId === "random" ? "secondary" : "outline"}
          aria-pressed={activeConsumerTypeId === "random"}
          onClick={() => handleSelectConsumerType("random")}
          className={`h-auto min-h-32 w-full flex-col items-stretch justify-between whitespace-normal rounded-xl p-5 text-left ${
            activeConsumerTypeId === "random"
              ? "border-primary bg-primary/5 hover:bg-primary/10"
              : "border-border bg-card/45 hover:bg-muted/40"
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Acak
            </span>
            <span
              className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${activeConsumerTypeId === "random" ? "border-primary" : "border-border"}`}
              aria-hidden="true"
            >
              {activeConsumerTypeId === "random" && (
                <span className="size-2.5 rounded-full bg-primary" />
              )}
            </span>
          </div>
          <span className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Sistem akan memilih salah satu karakter secara acak setiap kali sesi
            simulasi dimulai.
          </span>
        </Button>

        {consumerTypes.map((c) => (
          <Card
            key={c.id}
            role="button"
            tabIndex={0}
            aria-label={`Pilih karakter ${c.name}`}
            onClick={() => handleSelectConsumerType(c.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleSelectConsumerType(c.id);
              }
            }}
            className={`cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
              activeConsumerTypeId === c.id
                ? "border-primary bg-primary/5"
                : "border-border bg-card/45 hover:bg-muted/40"
            }`}
          >
            <CardContent className="flex min-h-32 flex-col justify-between gap-4 p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <h4 className="truncate text-sm font-semibold tracking-tight text-foreground">
                    {c.name}
                  </h4>
                  <Badge
                    variant={
                      c.difficulty === "Sulit"
                        ? "destructive"
                        : c.difficulty === "Sedang"
                          ? "outline"
                          : "secondary"
                    }
                    className="text-[11px]"
                  >
                    {c.difficulty}
                  </Badge>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {activeConsumerTypeId === c.id ? (
                    <span
                      className="flex size-4 items-center justify-center rounded-full border border-primary"
                      aria-label="Karakter aktif"
                    >
                      <span className="size-2.5 rounded-full bg-primary" />
                    </span>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
                        aria-label={`Edit karakter ${c.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditClick(c);
                        }}
                      >
                        <Edit2 data-icon="inline" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Hapus karakter ${c.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConsumer(c.id);
                        }}
                      >
                        <Trash2 data-icon="inline" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {c.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {!consumerForm.isOpen && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={handleAddClick}
          className="min-h-24 w-full flex-col gap-2 border-dashed text-muted-foreground hover:text-foreground"
        >
          <Plus data-icon="inline" />
          <span className="text-sm font-medium">Buat Karakteristik Baru</span>
        </Button>
      )}
    </div>
  );
}

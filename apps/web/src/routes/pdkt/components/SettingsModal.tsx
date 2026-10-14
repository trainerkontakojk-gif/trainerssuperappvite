import React, { useState } from "react";
import { Lock, X } from "lucide-react";
import { cn } from "cn";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Separator } from "../../../components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../components/ui/tabs";
import { usePdktSettingsDraft } from "./settings/usePdktSettingsDraft";
import { PdktSystemTab } from "./settings/PdktSystemTab";
import { PdktScenariosTab } from "./settings/PdktScenariosTab";
import { PdktConsumersTab } from "./settings/PdktConsumersTab";
import { PdktIdentityTab } from "./settings/PdktIdentityTab";
import type { PdktScenario, PdktConsumerType } from "@trainers/types";
import { type PdktAppSettings as AppSettings } from "../pdktSettings";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => Promise<void>;
  defaultScenarios: PdktScenario[];
  defaultConsumerTypes: PdktConsumerType[];
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  defaultScenarios,
  defaultConsumerTypes,
}) => {
  const [dialogContainer, setDialogContainer] = useState<HTMLDivElement | null>(
    null,
  );
  // Konfirmasi tutup tanpa menyimpan atau pulihkan bawaan.
  const [pendingConfirm, setPendingConfirm] = useState<
    "close" | "reset" | null
  >(null);

  const {
    activeTab,
    setActiveTab,
    localSettings,
    setLocalSettings,
    scenarioForm,
    consumerForm,
    customSenderName,
    setCustomSenderName,
    customBodyName,
    setCustomBodyName,
    customEmail,
    setCustomEmail,
    customCity,
    setCustomCity,
    enableImageGeneration,
    setEnableImageGeneration,
    globalConsumerTypeId,
    setGlobalConsumerTypeId,
    selectedModel,
    setSelectedModel,
    consumerNameMentionPattern,
    setConsumerNameMentionPattern,
    writingStyleMode,
    setWritingStyleMode,
    handleSave,
    handleResetDefaults,
    hasUnsavedChanges,
    isSaving,
    discardUnsavedChanges,
  } = usePdktSettingsDraft({
    settings,
    isOpen,
    onSave,
    onClose,
    defaultScenarios,
    defaultConsumerTypes,
  });

  const closeWithoutSaving = () => {
    setPendingConfirm(null);
    discardUnsavedChanges();
    onClose();
  };

  const requestClose = () => {
    if (isSaving) return;
    if (hasUnsavedChanges()) {
      setPendingConfirm("close");
      return;
    }
    closeWithoutSaving();
  };

  const confirmReset = async () => {
    await handleResetDefaults();
    setPendingConfirm(null);
  };

  if (!isOpen) return null;

  // Editor skenario memakai seluruh area modal, sehingga header, navigasi tab,
  // dan footer pengaturan disembunyikan selama editor terbuka.
  const wizardOpen = scenarioForm.isOpen;

  const activeScenarioCount = localSettings.scenarios.filter(
    (scenario) => scenario.isActive,
  ).length;
  const tabs = [
    {
      id: "scenarios" as const,
      label: "Skenario",
      count: String(activeScenarioCount),
    },
    { id: "consumers" as const, label: "Karakter konsumen" },
    { id: "identity" as const, label: "Identitas konsumen" },
    { id: "system" as const, label: "Gaya & AI" },
  ];
  const isDirty = hasUnsavedChanges();

  return (
    <div ref={setDialogContainer} className="contents">
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <DialogContent
          container={dialogContainer}
          showCloseButton={false}
          aria-labelledby={
            wizardOpen ? "scenario-wizard-title" : "settings-modal-title"
          }
          className="w-[calc(100vw-2rem)] max-w-5xl sm:max-w-5xl flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col gap-0 overflow-hidden bg-card p-0"
        >
          {wizardOpen ? null : (
            <DialogHeader className="shrink-0 gap-1 border-b px-5 py-4 sm:px-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="min-w-0">
                    <DialogTitle
                      id="settings-modal-title"
                      className="font-display text-lg font-bold tracking-tight sm:text-xl"
                    >
                      Pengaturan PDKT
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                      Berlaku untuk sesi yang Anda mulai berikutnya.
                    </DialogDescription>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  onClick={requestClose}
                  disabled={isSaving}
                  aria-label="Tutup pengaturan"
                >
                  <X data-icon="inline" />
                </Button>
              </div>
            </DialogHeader>
          )}

          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              if (value) {
                setActiveTab(value as typeof activeTab);
              }
            }}
            orientation="vertical"
            className="min-h-0 flex-1 flex-col md:flex-row"
          >
            <div
              className={cn(
                "flex shrink-0 flex-col border-b bg-muted/20 md:w-60 md:border-r md:border-b-0",
                wizardOpen && "hidden",
              )}
            >
              <TabsList
                variant="line"
                aria-label="Bagian pengaturan"
                className="w-full shrink-0 justify-start overflow-x-auto rounded-none p-2 max-md:flex-row! md:overflow-x-visible md:overflow-y-auto md:p-3"
              >
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="min-h-11 shrink-0 justify-start gap-2 px-3 py-2.5 text-left max-md:w-auto! max-md:after:hidden max-md:data-active:bg-background max-md:data-active:shadow-sm md:w-full"
                  >
                    <span className="flex-1">{tab.label}</span>
                    {tab.count !== undefined && (
                      <span className="text-xs font-medium text-muted-foreground">
                        {tab.count}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
              <p className="mx-3 mb-3 flex gap-2.5 rounded-lg border border-border bg-surface-elevated p-3 text-xs leading-[17px] text-fg2 md:m-3 md:mt-auto">
                <Lock
                  aria-hidden="true"
                  className="mt-px size-4 shrink-0 text-module-pdkt"
                />
                Karakter, arah balasan, dan kunci jawaban hanya terlihat di
                sini. Peserta tidak melihatnya saat simulasi.
              </p>
            </div>

            <div
              className={cn(
                "min-h-0 flex-1",
                wizardOpen
                  ? "flex flex-col overflow-hidden"
                  : "overflow-y-auto px-5 py-6 sm:px-6",
              )}
            >
              <TabsContent
                value="scenarios"
                className={cn(
                  "min-h-0",
                  wizardOpen && "flex flex-1 flex-col overflow-hidden",
                )}
              >
                <PdktScenariosTab
                  confirmContainer={dialogContainer}
                  scenarios={localSettings.scenarios}
                  scenarioForm={scenarioForm}
                  setLocalSettings={setLocalSettings}
                />
              </TabsContent>

              <TabsContent value="consumers">
                <PdktConsumersTab
                  confirmContainer={dialogContainer}
                  consumerTypes={localSettings.consumerTypes}
                  globalConsumerTypeId={globalConsumerTypeId}
                  setGlobalConsumerTypeId={setGlobalConsumerTypeId}
                  consumerForm={consumerForm}
                  setLocalSettings={setLocalSettings}
                />
              </TabsContent>

              <TabsContent value="identity">
                <PdktIdentityTab
                  customSenderName={customSenderName}
                  setCustomSenderName={setCustomSenderName}
                  customBodyName={customBodyName}
                  setCustomBodyName={setCustomBodyName}
                  customEmail={customEmail}
                  setCustomEmail={setCustomEmail}
                  customCity={customCity}
                  setCustomCity={setCustomCity}
                  consumerNameMentionPattern={consumerNameMentionPattern}
                  setConsumerNameMentionPattern={setConsumerNameMentionPattern}
                />
              </TabsContent>

              <TabsContent value="system">
                <PdktSystemTab
                  writingStyleMode={writingStyleMode}
                  setWritingStyleMode={setWritingStyleMode}
                  selectedModel={selectedModel}
                  setSelectedModel={setSelectedModel}
                  enableImageGeneration={enableImageGeneration}
                  setEnableImageGeneration={setEnableImageGeneration}
                />
              </TabsContent>
            </div>
          </Tabs>

          {wizardOpen ? null : (
            <>
              <Separator />
              <DialogFooter className="mx-0 mb-0 shrink-0 flex-row flex-wrap items-center justify-between gap-3 rounded-none border-0 bg-muted/20 px-5 py-3 sm:justify-between sm:px-6">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPendingConfirm("reset")}
                  disabled={isSaving}
                  className="-ml-2.5 min-h-11 px-2.5 text-fg2"
                >
                  Pulihkan bawaan
                </Button>
                <div className="flex flex-wrap items-center gap-3">
                  {isDirty && !isSaving && (
                    <span
                      role="status"
                      className="inline-flex items-center gap-1.5 text-xs text-fg2"
                    >
                      <span
                        aria-hidden="true"
                        className="size-1.5 rounded-full bg-chart-orange"
                      />
                      Belum disimpan
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={requestClose}
                    disabled={isSaving}
                    className="min-h-11"
                  >
                    Tutup
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="min-h-11 px-5"
                  >
                    {isSaving ? "Menyimpan…" : "Simpan"}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}

          <ConfirmDialog
            open={pendingConfirm === "close"}
            container={dialogContainer}
            title="Tutup tanpa menyimpan?"
            description="Perubahan yang belum disimpan akan hilang."
            cancelLabel="Lanjut mengubah"
            confirmLabel="Buang perubahan"
            onConfirm={closeWithoutSaving}
            onCancel={() => setPendingConfirm(null)}
          />
          <ConfirmDialog
            open={pendingConfirm === "reset"}
            container={dialogContainer}
            title="Pulihkan pengaturan bawaan?"
            description="Skenario, karakter konsumen, identitas konsumen, gaya tulisan, dan model AI kembali ke bawaan dan langsung disimpan. Skenario dan karakter buatan Anda akan hilang."
            confirmLabel="Pulihkan bawaan"
            busy={isSaving}
            busyLabel="Memulihkan…"
            onConfirm={() => void confirmReset()}
            onCancel={() => setPendingConfirm(null)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

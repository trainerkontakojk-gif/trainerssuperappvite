import { useState } from "react";
import { X } from "lucide-react";
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
import type { TelefunAppSettings as AppSettings } from "../telefunSettings";
import { useTelefunSettingsDraft } from "./settings/useTelefunSettingsDraft";
import { TelefunScenariosTab } from "./settings/TelefunScenariosTab";
import { TelefunConsumersTab } from "./settings/TelefunConsumersTab";
import { TelefunIdentityTab } from "./settings/TelefunIdentityTab";
import { TelefunSystemTab } from "./settings/TelefunSystemTab";
import { useTelefunProviderReadiness } from "../hooks/useTelefunProviderReadiness";
import { useTelefunWebRtcCapability } from "../hooks/useTelefunWebRtcCapability";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => Promise<void>;
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onSave,
}: SettingsModalProps) {
  const [dialogContainer, setDialogContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const [pendingConfirm, setPendingConfirm] = useState<
    "close" | "reset" | null
  >(null);
  const providerReadiness = useTelefunProviderReadiness(isOpen);
  const webRtcCapabilityState = useTelefunWebRtcCapability(isOpen);
  const webRtcCapability =
    webRtcCapabilityState.status === "ready"
      ? webRtcCapabilityState.capability
      : null;
  const {
    activeTab,
    setActiveTab,
    localSettings,
    setLocalSettings,
    selectedTelefunModel,
    selectedTelefunTransport,
    setSelectedTelefunModel,
    setSelectedTelefunTransport,
    scenarioForm,
    consumerForm,
    handleSelectConsumerType,
    isSaving,
    saveError,
    handleSave,
    hasUnsavedChanges,
    resetToDefaults,
  } = useTelefunSettingsDraft({
    settings,
    isOpen,
    onSave,
    onClose,
    providerReadiness,
    webRtcCapability,
  });

  const requestClose = () => {
    if (isSaving) return;
    if (hasUnsavedChanges()) {
      setPendingConfirm("close");
      return;
    }
    onClose();
  };

  const activeScenarioCount = localSettings.scenarios.filter(
    (scenario) => scenario.isActive,
  ).length;
  const tabs = [
    {
      id: "scenarios" as const,
      label: "Skenario",
      count: `${activeScenarioCount}/${localSettings.scenarios.length}`,
    },
    {
      id: "consumers" as const,
      label: "Karakter konsumen",
      count: String(localSettings.consumerTypes.length),
    },
    { id: "identity" as const, label: "Identitas konsumen" },
    { id: "system" as const, label: "Sesi & AI" },
  ];
  const isDirty = isOpen && hasUnsavedChanges();
  // Editor skenario/karakter punya tombol Simpan/Batal sendiri.
  const editorOpen = scenarioForm.isOpen || consumerForm.isOpen;

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
          data-module="telefun"
          aria-busy={isSaving}
          aria-labelledby="telefun-settings-title"
          className="w-[calc(100vw-2rem)] max-w-5xl sm:max-w-5xl flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col gap-0 overflow-hidden bg-card p-0"
        >
          <DialogHeader className="shrink-0 gap-1 border-b px-5 py-4 sm:px-6">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle
                  id="telefun-settings-title"
                  className="font-display text-lg font-bold tracking-tight sm:text-xl"
                >
                  Pengaturan Telefun
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Berlaku untuk panggilan yang Anda mulai berikutnya.
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                onClick={requestClose}
                disabled={isSaving}
                className="min-h-[44px] min-w-[44px]"
                aria-label="Tutup pengaturan"
              >
                <X data-icon="inline" />
              </Button>
            </div>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              if (value) setActiveTab(value as typeof activeTab);
            }}
            orientation="vertical"
            inert={isSaving ? true : undefined}
            className="min-h-0 flex-1 flex-col md:flex-row"
          >
            <div className="flex shrink-0 flex-col border-b bg-muted/20 md:w-60 md:border-r md:border-b-0">
              <TabsList
                variant="line"
                aria-label="Bagian pengaturan"
                className="w-full shrink-0 justify-start overflow-x-auto rounded-none p-2 max-md:flex-row! md:overflow-x-visible md:overflow-y-auto md:p-3"
              >
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="min-h-[44px] shrink-0 justify-start gap-2 px-3 py-2.5 text-left max-md:w-auto! max-md:after:hidden max-md:data-active:bg-background max-md:data-active:shadow-sm md:w-full"
                  >
                    <span className="flex-1">{tab.label}</span>
                    {tab.count !== undefined && (
                      <span className="font-mono text-xs font-medium text-muted-foreground tabular-nums">
                        {tab.count}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
              <TabsContent value="scenarios">
                <TelefunScenariosTab
                  confirmContainer={dialogContainer}
                  scenarios={localSettings.scenarios}
                  scenarioForm={scenarioForm}
                  setLocalSettings={setLocalSettings}
                />
              </TabsContent>

              <TabsContent value="consumers">
                <TelefunConsumersTab
                  confirmContainer={dialogContainer}
                  consumerTypes={localSettings.consumerTypes}
                  preferredConsumerTypeId={
                    localSettings.preferredConsumerTypeId
                  }
                  consumerForm={consumerForm}
                  handleSelectConsumerType={handleSelectConsumerType}
                  setLocalSettings={setLocalSettings}
                />
              </TabsContent>

              <TabsContent value="identity">
                <TelefunIdentityTab
                  identitySettings={localSettings.identitySettings}
                  telefunModelId={selectedTelefunModel}
                  setLocalSettings={setLocalSettings}
                />
              </TabsContent>

              <TabsContent value="system">
                <TelefunSystemTab
                  localSettings={localSettings}
                  setLocalSettings={setLocalSettings}
                  selectedTelefunModel={selectedTelefunModel}
                  selectedTelefunTransport={selectedTelefunTransport}
                  setSelectedTelefunModel={setSelectedTelefunModel}
                  setSelectedTelefunTransport={setSelectedTelefunTransport}
                  providerReadiness={providerReadiness}
                  webRtcCapability={webRtcCapability}
                />
              </TabsContent>
            </div>
          </Tabs>

          <Separator />
          <DialogFooter className="mx-0 mb-0 shrink-0 flex-row flex-wrap items-center justify-between gap-3 rounded-none border-0 bg-muted/20 px-5 py-3 sm:justify-between sm:px-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPendingConfirm("reset")}
              disabled={isSaving}
              className="-ml-2.5 min-h-[44px] px-2.5 text-fg2"
            >
              Pulihkan bawaan
            </Button>
            <div className="flex flex-wrap items-center gap-3">
              {saveError ? (
                <span role="alert" className="max-w-[40ch] text-xs text-fg2">
                  {saveError}
                </span>
              ) : (
                isDirty &&
                !isSaving && (
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
                )
              )}
              <Button
                type="button"
                variant="outline"
                onClick={requestClose}
                disabled={isSaving}
                className="min-h-[44px]"
              >
                Tutup
              </Button>
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving || editorOpen}
                className="min-h-[44px] px-5"
              >
                {isSaving ? "Menyimpan…" : "Simpan"}
              </Button>
            </div>
          </DialogFooter>

          <ConfirmDialog
            open={pendingConfirm === "close"}
            container={dialogContainer}
            title="Tutup tanpa menyimpan?"
            description="Perubahan yang belum disimpan akan hilang."
            cancelLabel="Lanjut mengubah"
            confirmLabel="Buang perubahan"
            onConfirm={() => {
              setPendingConfirm(null);
              onClose();
            }}
            onCancel={() => setPendingConfirm(null)}
          />
          <ConfirmDialog
            open={pendingConfirm === "reset"}
            container={dialogContainer}
            title="Pulihkan pengaturan bawaan?"
            description="Skenario, karakter konsumen, identitas konsumen, durasi, tempo, dan model AI kembali ke bawaan. Skenario dan karakter buatan Anda akan hilang setelah Anda memilih Simpan."
            confirmLabel="Pulihkan bawaan"
            confirmVariant="default"
            onConfirm={() => {
              resetToDefaults();
              setPendingConfirm(null);
            }}
            onCancel={() => setPendingConfirm(null)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

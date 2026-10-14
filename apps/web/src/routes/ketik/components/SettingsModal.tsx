import { useRef, useState } from "react";
import { X } from "lucide-react";
import type { KetikAppSettings, KetikQuickTemplate } from "@trainers/types";
import {
  getKetikTemplateLayers,
  useKetikSettingsDraft,
} from "./settings/useKetikSettingsDraft";
import { KetikSystemTab } from "./settings/KetikSystemTab";
import { KetikScenariosTab } from "./settings/KetikScenariosTab";
import { KetikConsumersTab } from "./settings/KetikConsumersTab";
import { KetikIdentityTab } from "./settings/KetikIdentityTab";
import { KetikTemplateTab } from "./settings/KetikTemplateTab";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../components/ui/tabs";
import { Separator } from "../../../components/ui/separator";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: KetikAppSettings;
  onSave: (newSettings: KetikAppSettings) => Promise<void>;
  canManageTemplates?: boolean;
  onSaveTemplates?: (templates: KetikQuickTemplate[]) => Promise<void>;
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onSave,
  canManageTemplates = false,
  onSaveTemplates,
}: SettingsModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
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
    templateForm,
    templateScope,
    setTemplateScope,
    customInputValue,
    durationValidationError,
    durationMode,
    handlePresetClick,
    handleCustomClick,
    handleDurationInputChange,
    handleDurationBlur,
    handleIdentityChange,
    handleSave,
    handleResetDefaults,
    hasUnsavedChanges,
    discardUnsavedChanges,
    isSaving,
  } = useKetikSettingsDraft({
    settings,
    isOpen,
    onSave,
    canManageTemplates,
    onSaveTemplates,
    onClose,
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

  const templateLayers = getKetikTemplateLayers(localSettings);
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
    {
      id: "template" as const,
      label: "Template cepat",
      count: String(
        templateLayers.global.length + templateLayers.personal.length,
      ),
    },
    { id: "system" as const, label: "Sesi & AI" },
  ];
  const isDirty = hasUnsavedChanges();
  // Editor skenario punya tombol Simpan/Batal sendiri; Simpan dialog menunggu.
  const editorOpen = scenarioForm.isOpen;

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
          data-module="ketik"
          aria-labelledby="ketik-settings-modal-title"
          className="w-[calc(100vw-2rem)] max-w-5xl sm:max-w-5xl flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col gap-0 overflow-hidden bg-card p-0"
        >
          <DialogHeader className="shrink-0 gap-1 border-b px-5 py-4 sm:px-6">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle
                  id="ketik-settings-modal-title"
                  className="font-display text-lg font-bold tracking-tight sm:text-xl"
                >
                  Pengaturan KETIK
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Berlaku untuk sesi yang Anda mulai berikutnya.
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
              if (value) {
                setActiveTab(value as typeof activeTab);
              }
            }}
            orientation="vertical"
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

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
              <TabsContent value="scenarios">
                <KetikScenariosTab
                  confirmContainer={dialogContainer}
                  scenarios={localSettings.scenarios}
                  scenarioForm={scenarioForm}
                  setLocalSettings={setLocalSettings}
                />
              </TabsContent>

              <TabsContent value="consumers">
                <KetikConsumersTab
                  confirmContainer={dialogContainer}
                  consumerTypes={localSettings.consumerTypes}
                  activeConsumerTypeId={localSettings.activeConsumerTypeId}
                  consumerForm={consumerForm}
                  setLocalSettings={setLocalSettings}
                />
              </TabsContent>

              <TabsContent value="identity">
                <KetikIdentityTab
                  identitySettings={localSettings.identitySettings}
                  handleIdentityChange={handleIdentityChange}
                />
              </TabsContent>

              <TabsContent value="template">
                <KetikTemplateTab
                  confirmContainer={dialogContainer}
                  globalTemplates={templateLayers.global}
                  personalTemplates={templateLayers.personal}
                  templateForm={templateForm}
                  templateScope={templateScope}
                  setTemplateScope={setTemplateScope}
                  setLocalSettings={setLocalSettings}
                  canManageTemplates={canManageTemplates}
                />
              </TabsContent>

              <TabsContent value="system">
                <KetikSystemTab
                  localSettings={localSettings}
                  setLocalSettings={setLocalSettings}
                  durationMode={durationMode}
                  handlePresetClick={handlePresetClick}
                  handleCustomClick={handleCustomClick}
                  customInputValue={customInputValue}
                  handleDurationInputChange={handleDurationInputChange}
                  handleDurationBlur={handleDurationBlur}
                  durationValidationError={durationValidationError}
                  inputRef={inputRef}
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
                className="min-h-[44px]"
              >
                Tutup
              </Button>
              <Button
                type="button"
                onClick={handleSave}
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
            onConfirm={closeWithoutSaving}
            onCancel={() => setPendingConfirm(null)}
          />
          <ConfirmDialog
            open={pendingConfirm === "reset"}
            container={dialogContainer}
            title="Pulihkan pengaturan bawaan?"
            description="Skenario, karakter konsumen, identitas konsumen, durasi, tempo, dan model AI kembali ke bawaan dan langsung disimpan. Skenario dan karakter buatan Anda akan hilang. Template pribadi tetap tersimpan."
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
}

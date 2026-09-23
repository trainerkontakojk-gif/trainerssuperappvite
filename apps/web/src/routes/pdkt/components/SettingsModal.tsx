import React, { useState } from "react";
import {
  X,
  User,
  Settings,
  FileText,
  Users,
  Save,
  RotateCcw,
} from "lucide-react";
import { cn } from "cn";
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

  const requestClose = () => {
    if (isSaving) return;
    if (
      hasUnsavedChanges() &&
      !window.confirm("Perubahan belum disimpan. Yakin ingin keluar?")
    )
      return;
    discardUnsavedChanges();
    onClose();
  };

  if (!isOpen) return null;

  // Wizard skenario memakai seluruh area modal, sehingga header, navigasi tab,
  // dan footer pengaturan disembunyikan selama wizard terbuka.
  const wizardOpen = scenarioForm.isOpen;

  const tabs = [
    { id: "scenarios" as const, label: "Masalah", icon: FileText },
    { id: "consumers" as const, label: "Karakter", icon: Users },
    { id: "identity" as const, label: "Identitas", icon: User },
    { id: "system" as const, label: "Sistem", icon: Settings },
  ];

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
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <DialogTitle
                    id="settings-modal-title"
                    className="text-lg tracking-tight sm:text-xl"
                  >
                    Pengaturan Simulasi
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-sm">
                    Module PDKT
                  </DialogDescription>
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
            <TabsList
              variant="line"
              className={cn(
                "w-full shrink-0 justify-start overflow-x-auto rounded-none border-b bg-muted/20 p-2 md:w-52 md:flex-col md:overflow-x-visible md:overflow-y-auto md:border-r md:border-b-0 md:p-3",
                wizardOpen && "hidden",
              )}
            >
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="min-h-11 justify-start px-3 py-2.5 text-left"
                >
                  <tab.icon aria-hidden="true" className="size-4 shrink-0" />
                  <span>{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

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
                  scenarios={localSettings.scenarios}
                  consumerTypes={localSettings.consumerTypes}
                  scenarioForm={scenarioForm}
                  enableImageGeneration={enableImageGeneration}
                  setEnableImageGeneration={setEnableImageGeneration}
                  customIdentity={{
                    senderName: customSenderName,
                    bodyName: customBodyName,
                    email: customEmail,
                    city: customCity,
                  }}
                  globalConsumerTypeId={globalConsumerTypeId}
                  setGlobalConsumerTypeId={setGlobalConsumerTypeId}
                  consumerNameMentionPattern={consumerNameMentionPattern}
                  setConsumerNameMentionPattern={setConsumerNameMentionPattern}
                  selectedModel={selectedModel}
                  setSelectedModel={setSelectedModel}
                  writingStyleMode={writingStyleMode}
                  setWritingStyleMode={setWritingStyleMode}
                  setLocalSettings={setLocalSettings}
                />
              </TabsContent>

              <TabsContent value="consumers">
                <PdktConsumersTab
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
                />
              </TabsContent>
            </div>
          </Tabs>

          {wizardOpen ? null : (
            <>
              <Separator />
              <DialogFooter className="mx-0 mb-0 shrink-0 flex-row items-center justify-between rounded-none border-0 bg-card px-5 py-4 sm:justify-between sm:px-6">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleResetDefaults}
                  disabled={isSaving}
                  className="text-destructive hover:text-destructive"
                >
                  <RotateCcw data-icon="inline-start" />
                  Reset Default
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={requestClose}
                    disabled={isSaving}
                  >
                    Batal
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    <Save data-icon="inline-start" />
                    {isSaving ? "Menyimpan..." : "Simpan Perubahan"}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

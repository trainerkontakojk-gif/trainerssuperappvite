import React, { useEffect, useRef, useState } from "react";
import { FileText, Save, Settings, User, Users, X } from "lucide-react";
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
import { TelefunAppSettings as AppSettings } from "../telefunSettings";
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

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  const [dialogContainer, setDialogContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const providerReadiness = useTelefunProviderReadiness(isOpen);
  const webRtcCapabilityState = useTelefunWebRtcCapability(isOpen);
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
    handleSelectAll,
    handleUnselectAll,
    handleToggleScenario,
    handleDeleteScenario,
    handleSelectConsumerType,
    handleDeleteConsumer,
    isSaving,
    handleSave,
    handleClose,
  } = useTelefunSettingsDraft({
    settings,
    isOpen,
    onSave,
    onClose,
    providerReadiness,
    webRtcCapability:
      webRtcCapabilityState.status === "ready"
        ? webRtcCapabilityState.capability
        : null,
  });

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusFrame = requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      cancelAnimationFrame(focusFrame);
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

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
          if (!open) handleClose();
        }}
      >
        <DialogContent
          ref={dialogRef}
          container={dialogContainer}
          showCloseButton={false}
          data-module="telefun"
          aria-busy={isSaving}
          aria-modal="true"
          aria-labelledby="telefun-settings-title"
          className="w-[calc(100vw-2rem)] max-w-5xl sm:max-w-5xl flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col gap-0 overflow-hidden bg-card p-0"
        >
          <DialogHeader className="shrink-0 gap-1 border-b px-5 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle
                  id="telefun-settings-title"
                  className="text-lg tracking-tight sm:text-xl"
                >
                  Pengaturan Simulasi
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm">
                  Module Telefun
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                onClick={handleClose}
                disabled={isSaving}
                aria-label="Tutup pengaturan simulasi"
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
            <TabsList
              variant="line"
              className="w-full shrink-0 justify-start overflow-x-auto rounded-none border-b bg-muted/20 p-2 md:w-52 md:flex-col md:overflow-x-visible md:overflow-y-auto md:border-r md:border-b-0 md:p-3"
            >
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="min-h-11 flex-none shrink-0 justify-start px-3 py-2.5 text-left"
                >
                  <tab.icon aria-hidden="true" className="size-4 shrink-0" />
                  <span>{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
              <TabsContent value="scenarios">
                <TelefunScenariosTab
                  scenarios={localSettings.scenarios}
                  scenarioForm={scenarioForm}
                  handleSelectAll={handleSelectAll}
                  handleUnselectAll={handleUnselectAll}
                  handleToggleScenario={handleToggleScenario}
                  handleDeleteScenario={handleDeleteScenario}
                  setLocalSettings={setLocalSettings}
                />
              </TabsContent>

              <TabsContent value="consumers">
                <TelefunConsumersTab
                  consumerTypes={localSettings.consumerTypes}
                  preferredConsumerTypeId={
                    localSettings.preferredConsumerTypeId
                  }
                  consumerForm={consumerForm}
                  handleSelectConsumerType={handleSelectConsumerType}
                  handleDeleteConsumer={handleDeleteConsumer}
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
                  webRtcCapability={
                    webRtcCapabilityState.status === "ready"
                      ? webRtcCapabilityState.capability
                      : null
                  }
                />
              </TabsContent>
            </div>
          </Tabs>

          <Separator />
          <DialogFooter className="!mx-0 !mb-0 shrink-0 flex-row items-center justify-end rounded-none border-0 bg-card px-5 py-4 sm:px-6">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSaving}
              >
                Batal
              </Button>
              <Button type="button" onClick={handleSave} disabled={isSaving}>
                <Save data-icon="inline-start" />
                {isSaving ? "Menyimpan…" : "Simpan Perubahan"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

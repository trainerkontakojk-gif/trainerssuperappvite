import { useRef, useState } from "react";
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
import {
  Settings,
  FileText,
  Users,
  Fingerprint,
  MessageSquare,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
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
    isSaving,
  } = useKetikSettingsDraft({
    settings,
    isOpen,
    onSave,
    canManageTemplates,
    onSaveTemplates,
    onClose,
  });

  const requestClose = () => {
    if (isSaving) return;
    onClose();
  };

  const tabs = [
    { id: "scenarios", label: "Masalah", icon: FileText },
    { id: "consumers", label: "Karakter", icon: Users },
    { id: "identity", label: "Identitas", icon: Fingerprint },
    { id: "template", label: "Template", icon: MessageSquare },
    { id: "system", label: "Sistem", icon: Settings },
  ] as const;
  const templateLayers = getKetikTemplateLayers(localSettings);

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
          className="!w-[calc(100vw-2rem)] !max-w-5xl flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col gap-0 overflow-hidden bg-card p-0"
        >
          <DialogHeader className="shrink-0 border-b px-5 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle className="text-lg tracking-tight sm:text-xl">
                  Pengaturan Simulasi
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs uppercase tracking-wide">
                  Module KETIK
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                onClick={requestClose}
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
              if (value) {
                setActiveTab(value as typeof activeTab);
              }
            }}
            orientation="vertical"
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
                  className="min-h-11 justify-start px-3 py-2.5 text-left"
                >
                  <tab.icon data-icon="inline-start" />
                  <span>{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
              <TabsContent value="scenarios">
                <KetikScenariosTab
                  scenarios={localSettings.scenarios}
                  scenarioForm={scenarioForm}
                  setLocalSettings={setLocalSettings}
                />
              </TabsContent>

              <TabsContent value="consumers">
                <KetikConsumersTab
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
          <DialogFooter className="!mx-0 !mb-0 shrink-0 flex-row items-center justify-between rounded-none border-0 bg-card px-5 py-4 sm:px-6">
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={handleResetDefaults}
              disabled={isSaving}
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
                disabled={isSaving || scenarioForm.isOpen}
              >
                <Save data-icon="inline-start" />
                {isSaving ? "Menyimpan..." : "Simpan Perubahan"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useRef } from "react";
import type { KetikAppSettings } from "@trainers/types";
import { useKetikSettingsDraft } from "./settings/useKetikSettingsDraft";
import { KetikSystemTab } from "./settings/KetikSystemTab";
import { KetikScenariosTab } from "./settings/KetikScenariosTab";
import { KetikConsumersTab } from "./settings/KetikConsumersTab";
import { KetikIdentityTab } from "./settings/KetikIdentityTab";
import { KetikTemplateTab } from "./settings/KetikTemplateTab";
import {
  X,
  RotateCcw,
  Save,
  Settings,
  FileText,
  Users,
  Fingerprint,
  MessageSquare,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: KetikAppSettings;
  onSave: (newSettings: KetikAppSettings) => Promise<void>;
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onSave,
}: SettingsModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    activeTab,
    setActiveTab,
    localSettings,
    setLocalSettings,
    scenarioForm,
    consumerForm,
    templateForm,
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
  } = useKetikSettingsDraft({ settings, isOpen, onSave, onClose });

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

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          data-module="ketik"
          className="module-clean-app fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 md:p-6"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={requestClose}
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-4xl max-h-[86vh] rounded-2xl flex flex-col overflow-hidden bg-card border border-border"
          >
            <div className="px-5 py-4 sm:px-6 border-b flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
                  Pengaturan Simulasi
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-medium text-foreground/75 uppercase tracking-wide">
                    Module KETIK
                  </span>
                </div>
              </div>
              <button
                onClick={requestClose}
                disabled={isSaving}
                className="w-8 h-8 flex items-center justify-center bg-foreground/5 hover:bg-foreground/10 rounded-lg text-foreground/75 hover:text-foreground transition-all border border-border disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
              {/* Sidebar Navigation */}
              <div className="w-full md:w-52 shrink-0 border-b md:border-b-0 md:border-r border-border bg-foreground/[0.01] flex md:flex-col overflow-x-auto md:overflow-x-visible md:overflow-y-auto p-3 gap-1 scrollbar-hide">
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center gap-3 px-3 py-2.5 text-[13px] font-medium rounded-lg transition-colors whitespace-nowrap md:w-full text-left shrink-0 ${
                        isActive
                          ? "bg-foreground/5 text-foreground border border-border/50"
                          : "text-foreground/75 hover:bg-foreground/[0.02] hover:text-foreground border border-transparent"
                      }`}
                    >
                      <tab.icon className="w-4 h-4 shrink-0" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Scrollable Content Area */}
              <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                  >
                    {activeTab === "scenarios" && (
                      <KetikScenariosTab
                        scenarios={localSettings.scenarios}
                        scenarioForm={scenarioForm}
                        setLocalSettings={setLocalSettings}
                      />
                    )}

                    {activeTab === "consumers" && (
                      <KetikConsumersTab
                        consumerTypes={localSettings.consumerTypes}
                        activeConsumerTypeId={
                          localSettings.activeConsumerTypeId
                        }
                        consumerForm={consumerForm}
                        setLocalSettings={setLocalSettings}
                      />
                    )}

                    {activeTab === "identity" && (
                      <KetikIdentityTab
                        identitySettings={localSettings.identitySettings}
                        handleIdentityChange={handleIdentityChange}
                      />
                    )}

                    {activeTab === "template" && (
                      <KetikTemplateTab
                        quickTemplates={localSettings.quickTemplates || []}
                        templateForm={templateForm}
                        setLocalSettings={setLocalSettings}
                      />
                    )}

                    {activeTab === "system" && (
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
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border flex justify-between items-center bg-card shrink-0">
              <button
                onClick={handleResetDefaults}
                disabled={isSaving}
                className="flex items-center gap-2 text-xs font-medium text-red-500/80 hover:text-red-500 transition-colors px-3 py-1.5 rounded-md hover:bg-red-500/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Default
              </button>
              <div className="flex gap-3">
                <button
                  onClick={requestClose}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-md text-sm font-medium text-foreground/80 hover:bg-foreground/5 hover:text-foreground transition-colors border border-transparent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || scenarioForm.isOpen}
                  className="px-5 py-2 bg-foreground text-background rounded-md text-[13px] font-medium hover:opacity-90 active:scale-[0.98] transition-all flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

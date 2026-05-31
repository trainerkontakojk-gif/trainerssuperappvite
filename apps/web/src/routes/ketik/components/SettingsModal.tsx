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
  onSave: (newSettings: KetikAppSettings) => void;
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
  } = useKetikSettingsDraft({ settings, isOpen, onSave, onClose });

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
            onClick={onClose}
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-4xl max-h-[86vh] rounded-[2rem] flex flex-col overflow-hidden shadow-2xl shadow-black/10 bg-card border border-border/50"
          >
            <div className="px-5 py-4 sm:px-6 sm:py-5 border-b flex justify-between items-center shrink-0 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent pointer-events-none" />
              <div className="relative z-10">
                <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                  Pengaturan Simulasi
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">
                    Module KETIK
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4 relative z-10">
                <button
                  onClick={onClose}
                  className="w-10 h-10 flex items-center justify-center bg-foreground/5 hover:bg-foreground/10 rounded-xl text-muted-foreground hover:text-foreground transition-all border border-transparent hover:border-border/50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="px-5 sm:px-6 pt-5 pb-3 shrink-0">
              <div className="flex p-2 rounded-2xl bg-foreground/[0.02] border border-border/50">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 flex items-center justify-center gap-3 py-3.5 text-[11px] font-black uppercase tracking-[0.2em] rounded-xl transition-all relative group ${activeTab === tab.id ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="activeTabKetik"
                        className="absolute inset-0 bg-background shadow-sm rounded-xl"
                        transition={{
                          type: "spring",
                          bounce: 0.15,
                          duration: 0.6,
                        }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2.5">
                      <tab.icon className="w-4 h-4" />
                      {tab.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 sm:px-6 pb-6 sm:pb-8">
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
                      activeConsumerTypeId={localSettings.activeConsumerTypeId}
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

            <div className="px-10 py-8 border-t border-border/50 flex justify-between items-center bg-card/50 backdrop-blur-2xl shrink-0">
              <button
                onClick={handleResetDefaults}
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-red-500/60 hover:text-red-500 transition-all px-6 py-3 rounded-2xl hover:bg-red-500/5 border border-transparent hover:border-red-500/20"
              >
                <RotateCcw className="w-4 h-4" />
                Reset Default
              </button>
              <div className="flex gap-4">
                <button
                  onClick={onClose}
                  className="px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-foreground/5 transition-all"
                >
                  Batal
                </button>
                <button
                  onClick={handleSave}
                  className="px-10 py-4 bg-foreground text-background rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl shadow-foreground/10 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Simpan Perubahan
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

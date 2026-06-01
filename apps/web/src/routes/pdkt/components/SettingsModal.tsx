import React from "react";
import {
  X,
  User,
  Settings,
  FileText,
  Users,
  Save,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { usePdktSettingsDraft } from "./settings/usePdktSettingsDraft";
import { PdktSystemTab } from "./settings/PdktSystemTab";
import { PdktScenariosTab } from "./settings/PdktScenariosTab";
import { PdktConsumersTab } from "./settings/PdktConsumersTab";
import { PdktIdentityTab } from "./settings/PdktIdentityTab";
import type {
  PdktScenario,
  PdktConsumerType,
} from "@trainers/types";
import { type PdktAppSettings as AppSettings } from "../pdktSettings";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
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
  } = usePdktSettingsDraft({
    settings,
    isOpen,
    onSave,
    onClose,
    defaultScenarios,
    defaultConsumerTypes,
  });

  if (!isOpen) return null;

  const tabs = [
    { id: "scenarios" as const, label: "Masalah", icon: FileText },
    { id: "consumers" as const, label: "Karakter", icon: Users },
    { id: "identity" as const, label: "Identitas", icon: User },
    { id: "system" as const, label: "Sistem", icon: Settings },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 md:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-background/80 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 15 }}
            className="relative w-full max-w-4xl max-h-[88vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl bg-card border border-border/80"
          >
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-border/40 flex justify-between items-center shrink-0 bg-muted/20 relative overflow-hidden">
              <div>
                <h2 className="text-xl font-bold text-foreground tracking-tight">
                  Pengaturan Simulasi
                </h2>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                  Modul PDKT
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-primary hover:bg-primary/95 text-primary-foreground rounded-xl font-semibold text-xs transition-all shadow-md shadow-primary/10 hover:shadow-lg hover:shadow-primary/15 hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2 group cursor-pointer"
                >
                  <Save className="w-4 h-4 group-hover:scale-105 transition-transform" />
                  <span>Simpan Perubahan</span>
                </button>
                <button
                  onClick={onClose}
                  className="w-9 h-9 flex items-center justify-center hover:bg-muted rounded-xl text-muted-foreground hover:text-foreground transition-all cursor-pointer border border-border/30 hover:border-border/60"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Segmented Control Tabs */}
            <div className="px-6 py-4 border-b border-border/30 bg-muted/5 shrink-0">
              <div className="flex p-1 rounded-xl bg-muted border border-border/30">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-2.5 py-2.5 text-xs font-semibold rounded-lg transition-all relative group cursor-pointer ${
                      activeTab === tab.id
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="activeTabPDKT"
                        className="absolute inset-0 shadow-sm rounded-lg bg-card border border-border/40"
                        transition={{
                          type: "spring",
                          bounce: 0.1,
                          duration: 0.4,
                        }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                      <tab.icon
                        className={`w-4 h-4 transition-transform group-hover:scale-105 ${activeTab === tab.id ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}
                      />
                      {tab.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar bg-card">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                >
                  {activeTab === "scenarios" && (
                    <PdktScenariosTab
                      scenarios={localSettings.scenarios}
                      scenarioForm={scenarioForm}
                      enableImageGeneration={enableImageGeneration}
                      setEnableImageGeneration={setEnableImageGeneration}
                      customIdentity={{
                        name: customSenderName,
                        bodyName: customBodyName,
                        email: customEmail,
                        city: customCity,
                      }}
                      globalConsumerTypeId={globalConsumerTypeId}
                      setLocalSettings={setLocalSettings}
                    />
                  )}

                  {activeTab === "consumers" && (
                    <PdktConsumersTab
                      consumerTypes={localSettings.consumerTypes}
                      globalConsumerTypeId={globalConsumerTypeId}
                      setGlobalConsumerTypeId={setGlobalConsumerTypeId}
                      consumerForm={consumerForm}
                      setLocalSettings={setLocalSettings}
                    />
                  )}

                  {activeTab === "identity" && (
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
                      handleResetDefaults={handleResetDefaults}
                    />
                  )}

                  {activeTab === "system" && (
                    <PdktSystemTab
                      writingStyleMode={writingStyleMode}
                      setWritingStyleMode={setWritingStyleMode}
                      selectedModel={selectedModel}
                      setSelectedModel={setSelectedModel}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

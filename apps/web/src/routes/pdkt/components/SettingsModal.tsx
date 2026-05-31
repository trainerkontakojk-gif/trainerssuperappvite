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
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-4xl max-h-[86vh] rounded-xl flex flex-col overflow-hidden shadow-xl bg-card border border-border/50"
          >
            {/* Modal Header */}
            <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-border/50 flex justify-between items-center shrink-0 relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                  Pengaturan Simulasi
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Module PDKT
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4 relative z-10">
                <button
                  onClick={handleSave}
                  className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-semibold text-[10px] uppercase tracking-widest transition-all shadow-sm flex items-center gap-2.5 group"
                >
                  <Save className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  <span>Simpan Perubahan</span>
                </button>
                <button
                  onClick={onClose}
                  className="w-10 h-10 flex items-center justify-center bg-foreground/5 hover:bg-foreground/10 rounded-xl text-muted-foreground hover:text-foreground transition-all border border-transparent hover:border-border/50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Segmented Control Tabs */}
            <div className="px-5 sm:px-6 pt-5 pb-3 shrink-0 bg-transparent">
              <div className="flex p-2 rounded-2xl bg-foreground/5">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-3 py-3.5 text-[11px] font-medium uppercase tracking-wide rounded-xl transition-all relative group ${
                      activeTab === tab.id
                        ? "text-primary"
                        : "text-muted-foreground hover:text-muted-foreground"
                    }`}
                  >
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="activeTabPDKT"
                        className="absolute inset-0 shadow-sm rounded-xl bg-card border border-border/50"
                        transition={{
                          type: "spring",
                          bounce: 0.15,
                          duration: 0.6,
                        }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2.5">
                      <tab.icon
                        className={`w-4 h-4 transition-transform group-hover:scale-110 ${activeTab === tab.id ? "text-primary" : ""}`}
                      />
                      {tab.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 pb-6 sm:pb-8 custom-scrollbar">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
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

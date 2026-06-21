import React from "react";
import {
  X,
  User,
  Settings,
  FileText,
  Users,
  Save,
  RotateCcw,
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
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-4xl max-h-[86vh] rounded-2xl flex flex-col overflow-hidden bg-card border border-border"
          >
            {/* Modal Header */}
            <div className="px-5 py-4 sm:px-6 border-b flex justify-between items-center shrink-0 bg-card">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
                  Pengaturan Simulasi
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-medium text-foreground/75 uppercase tracking-wide">
                    Module PDKT
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center bg-foreground/5 hover:bg-foreground/10 rounded-lg text-foreground/75 hover:text-foreground transition-all border border-border"
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
                      onClick={() => setActiveTab(tab.id)}
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

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6 bg-background/20">
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
                        consumerTypes={localSettings.consumerTypes}
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
            </div>

            <div className="px-6 py-4 border-t border-border flex justify-between items-center bg-card shrink-0">
              <button
                onClick={handleResetDefaults}
                className="flex items-center gap-2 text-xs font-medium text-red-500/80 hover:text-red-500 transition-colors px-3 py-1.5 rounded-md hover:bg-red-500/5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Default
              </button>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-md text-sm font-medium text-foreground/80 hover:bg-foreground/5 hover:text-foreground transition-colors border border-transparent"
                >
                  Batal
                </button>
                <button
                  onClick={handleSave}
                  className="px-5 py-2 bg-foreground text-background rounded-md text-[13px] font-medium hover:opacity-90 active:scale-[0.98] transition-all flex items-center gap-2"
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
};

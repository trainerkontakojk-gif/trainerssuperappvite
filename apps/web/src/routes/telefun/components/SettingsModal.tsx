import React from 'react';
import { X, Save, FileText, Users, User, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { TelefunAppSettings as AppSettings } from '../telefunSettings';
import { useTelefunSettingsDraft } from './settings/useTelefunSettingsDraft';
import { TelefunScenariosTab } from './settings/TelefunScenariosTab';
import { TelefunConsumersTab } from './settings/TelefunConsumersTab';
import { TelefunIdentityTab } from './settings/TelefunIdentityTab';
import { TelefunSystemTab } from './settings/TelefunSystemTab';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave }) => {
  const {
    activeTab,
    setActiveTab,
    localSettings,
    setLocalSettings,
    selectedTelefunModel,
    setSelectedTelefunModel,
    scenarioForm,
    consumerForm,
    handleSelectAll,
    handleUnselectAll,
    handleToggleScenario,
    handleDeleteScenario,
    handleSelectConsumerType,
    handleDeleteConsumer,
    handleSave,
    handleClose,
  } = useTelefunSettingsDraft({ settings, isOpen, onSave, onClose });

  if (!isOpen) return null;

  const tabs = [
    { id: 'scenarios', label: 'Masalah', icon: FileText },
    { id: 'consumers', label: 'Karakter', icon: Users },
    { id: 'identity', label: 'Identitas', icon: User },
    { id: 'system', label: 'Sistem', icon: Settings },
  ] as const;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-[150] flex items-center justify-center p-4" onClick={handleClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card w-full max-w-5xl max-h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-border"
      >
        {/* Modal Header */}
        <div className="px-8 py-6 border-b border-border flex justify-between items-center bg-card/50 backdrop-blur-xl shrink-0">
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Pengaturan Simulasi</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold text-sm transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Simpan Perubahan
            </button>
            <button
              onClick={handleClose}
              className="w-9 h-9 flex items-center justify-center bg-foreground/5 hover:bg-foreground/10 rounded-full text-muted-foreground transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Segmented Control Tabs */}
        <div className="px-8 pt-6 pb-2 shrink-0 bg-card">
          <div className="flex p-1 bg-foreground/5 rounded-xl">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all relative ${
                  activeTab === tab.id
                    ? 'text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-muted-foreground'
                }`}
              >
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeTabTele"
                    className="absolute inset-0 bg-card rounded-lg shadow-sm"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-8 bg-background">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === 'scenarios' && (
                <TelefunScenariosTab
                  scenarios={localSettings.scenarios}
                  scenarioForm={scenarioForm}
                  handleSelectAll={handleSelectAll}
                  handleUnselectAll={handleUnselectAll}
                  handleToggleScenario={handleToggleScenario}
                  handleDeleteScenario={handleDeleteScenario}
                  setLocalSettings={setLocalSettings}
                />
              )}

              {activeTab === 'consumers' && (
                <TelefunConsumersTab
                  consumerTypes={localSettings.consumerTypes}
                  preferredConsumerTypeId={localSettings.preferredConsumerTypeId}
                  consumerForm={consumerForm}
                  handleSelectConsumerType={handleSelectConsumerType}
                  handleDeleteConsumer={handleDeleteConsumer}
                  setLocalSettings={setLocalSettings}
                />
              )}

              {activeTab === 'identity' && (
                <TelefunIdentityTab
                  identitySettings={localSettings.identitySettings}
                  setLocalSettings={setLocalSettings}
                />
              )}

              {activeTab === 'system' && (
                <TelefunSystemTab
                  localSettings={localSettings}
                  setLocalSettings={setLocalSettings}
                  selectedTelefunModel={selectedTelefunModel}
                  setSelectedTelefunModel={setSelectedTelefunModel}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

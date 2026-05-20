import { useState, useEffect } from 'react';
import { MailboxSidebar } from './components/MailboxSidebar';
import { EmailDetailPane } from './components/EmailDetailPane';
import { ReplyComposer } from './components/ReplyComposer';
import { CreateEmailModal } from './components/CreateEmailModal';
import { SettingsModal } from './components/SettingsModal';
import { HistoryModal, type SessionHistory } from './components/HistoryModal';
import { UsageModal } from './components/UsageModal';
import { useApi, postApi, deleteApi, getApi } from '../../hooks/useApi';
import type { PdktMailboxItem, PdktScenario, PdktConsumerType, PdktIdentity } from '@trainers/types';
import { Loader2, Plus } from 'lucide-react';
import { 
  type PdktAppSettings, 
  generatePdktSessionConfig, 
  DEFAULT_PDKT_MODEL_ID 
} from './pdktSettings';

const defaultConsumerTypes: PdktConsumerType[] = [
  { id: 'marah', name: 'Marah & Emosional', description: 'Sangat marah, emosional, tidak sabar.', difficulty: 'Hard', tone: 'Marah, menggunakan tanda seru.' },
  { id: 'bingung', name: 'Bingung & Gaptek', description: 'Kebingungan, tidak paham teknologi.', difficulty: 'Medium', tone: 'Bingung, ragu-ragu.' },
  { id: 'kritis', name: 'Kritis & Detail', description: 'Kritis, menanyakan dasar hukum.', difficulty: 'Hard', tone: 'Kritis, logis, skeptis.' },
  { id: 'ramah', name: 'Ramah & Kooperatif', description: 'Ramah, sopan, kooperatif.', difficulty: 'Easy', tone: 'Ramah, sopan.' },
  { id: 'terburu-buru', name: 'Terburu-buru', description: 'Ingin jawaban singkat dan cepat.', difficulty: 'Medium', tone: 'Singkat, padat.' },
  { id: 'pasrah', name: 'Pasrah & Sedih', description: 'Putus asa, nada sedih.', difficulty: 'Medium', tone: 'Sedih, memohon bantuan.' },
];

export default function PdktSimulation() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isReplyOpen, setIsReplyOpen] = useState(false);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isStartingNew, setIsStartingNew] = useState(false);
  const [isReplying, setIsReplying] = useState(false);

  // Modals visibility
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isUsageOpen, setIsUsageOpen] = useState(false);

  // Settings state
  const [settings, setSettings] = useState<PdktAppSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

  // History state
  const [history, setHistory] = useState<SessionHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  
  // Timer for time_taken
  const [startTime, setStartTime] = useState<number | null>(null);

  const { data: mailboxItems, loading, error, refetch } = useApi<PdktMailboxItem[]>('/pdkt/mailbox');
  const { data: defaultScenarios } = useApi<PdktScenario[]>('/pdkt/scenarios');
  const { data: defaultConsumerTypesFromApi } = useApi<PdktConsumerType[]>('/pdkt/consumer-types');

  const selectedItem = mailboxItems?.find(item => item.id === selectedId);

  // Fetch Settings & History from DB
  const fetchSettings = async () => {
    try {
      const res = await getApi<{ success: boolean; settings: PdktAppSettings | null }>('/pdkt/settings');
      if (res && res.settings) {
        setSettings(res.settings);
      } else {
        setSettings(null);
      }
    } catch (err) {
      console.error('[PDKT] Failed to load settings:', err);
    } finally {
      setSettingsLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await getApi<any[]>('/pdkt/history');
      if (res) {
        const mapped = res.map((item: any) => ({
          id: item.id,
          timestamp: item.timestamp,
          config: item.config,
          emails: item.emails || [],
          evaluation: item.evaluation,
          evaluationStatus: item.evaluation_status || (item.evaluation ? 'completed' : 'processing'),
          evaluationError: item.evaluation_error,
          timeTaken: item.time_taken
        }));
        setHistory(mapped);
      }
    } catch (err) {
      console.error('[PDKT] Failed to load history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchHistory();
  }, []);

  useEffect(() => {
    if (!selectedId && mailboxItems && mailboxItems.length > 0) {
      setSelectedId(mailboxItems[0].id);
    }
  }, [mailboxItems, selectedId]);

  // Reset reply state and timer when selecting a new item
  useEffect(() => {
    setIsReplyOpen(false);
    setStartTime(null);
  }, [selectedId]);

  // Save Settings handler
  const handleSaveSettings = async (newSettings: PdktAppSettings) => {
    try {
      await postApi('/pdkt/settings', { settings: newSettings });
      setSettings(newSettings);
      // Refetch history as scenarios configuration might affect display
      await fetchHistory();
    } catch (err) {
      alert('Gagal menyimpan pengaturan.');
    }
  };

  // Delete specific history session
  const handleDeleteSession = async (id: string) => {
    try {
      await deleteApi(`/pdkt/history/${id}`);
      setHistory(prev => prev.filter(h => h.id !== id));
      
      // Also soft-delete matching mailbox item
      await deleteApi(`/pdkt/mailbox/${id}`);
      await refetch();
      if (selectedId === id) setSelectedId(null);
    } catch (err) {
      alert('Gagal menghapus riwayat sesi.');
    }
  };

  // Clear all history
  const handleClearHistory = async () => {
    try {
      await deleteApi('/pdkt/history');
      setHistory([]);
      
      // Clear mailbox too
      if (mailboxItems) {
        for (const item of mailboxItems) {
          await deleteApi(`/pdkt/mailbox/${item.id}`);
        }
      }
      await refetch();
      setSelectedId(null);
    } catch (err) {
      alert('Gagal membersihkan riwayat.');
    }
  };

  // Select session from history
  const handleSelectSession = (session: SessionHistory) => {
    setSelectedId(session.id);
    setIsHistoryOpen(false);
  };

  // Start new simulation session
  const handleStartNew = async (scenario: PdktScenario) => {
    setIsStartingNew(true);
    try {
      // 1. Determine Identity (Fallback)
      const fallbackIdentity = await postApi<PdktIdentity>('/pdkt/generate-identity', {});

      // 2. Build Config
      const currentSettings: PdktAppSettings = settings || {
        scenarios: defaultScenarios || [],
        consumerTypes: defaultConsumerTypesFromApi || defaultConsumerTypes,
        enableImageGeneration: true,
        globalConsumerTypeId: 'random',
        selectedModel: DEFAULT_PDKT_MODEL_ID,
        consumerNameMentionPattern: 'random',
        writingStyleMode: 'training',
      };

      const config = generatePdktSessionConfig(currentSettings, scenario, fallbackIdentity);

      // 3. Generate template or bypass if specified
      let subject = '';
      let body = '';

      if (scenario.alwaysUseSampleEmail && scenario.sampleEmailTemplate?.body) {
        subject = scenario.sampleEmailTemplate.subject || `Pertanyaan mengenai ${scenario.title}`;
        body = scenario.sampleEmailTemplate.body;
      } else {
        const templateRes = await postApi<{ subject: string; body: string }>('/pdkt/generate-template', {
          scenarioDraft: scenario,
          consumerTypeId: config.consumerType.id,
          identity: config.identity,
          selectedModel: config.selectedModel,
          resolvedConsumerNameMentionPattern: config.resolvedConsumerNameMentionPattern,
          writingStyleMode: config.writingStyleMode,
        });
        subject = templateRes.subject;
        body = templateRes.body;
      }

      // 4. Submit new mailbox batch
      const newItemId = await postApi<string>('/pdkt/mailbox/batch', {
        sender_name: config.identity.name,
        sender_email: config.identity.email,
        subject: subject,
        snippet: body.substring(0, 100),
        scenario_snapshot: scenario,
        config_snapshot: config,
        inbound_email: {
          id: 'msg_' + Date.now(),
          from: config.identity.email,
          to: 'ojk@kontak157.go.id',
          subject,
          body,
          timestamp: new Date().toISOString(),
          isAgent: false
        }
      });

      await refetch();
      await fetchHistory(); // update history list as well
      setSelectedId(newItemId);
      setIsNewModalOpen(false);
    } catch (err) {
      console.error('[PDKT] Failed to start new simulation:', err);
      alert('Gagal memulai simulasi baru.');
    } finally {
      setIsStartingNew(false);
    }
  };

  const handleReplyOpen = () => {
    setIsReplyOpen(true);
    setStartTime(Date.now());
  };

  const handleReplySubmit = async (replyText: string) => {
    if (!selectedId || !selectedItem || !startTime) return;
    setIsReplying(true);
    
    try {
      const timeTaken = Math.round((Date.now() - startTime) / 1000);
      const reply = {
        id: 'reply_' + Date.now(),
        from: 'ojk@kontak157.go.id',
        to: selectedItem.sender_email,
        subject: `Re: ${selectedItem.subject}`,
        body: replyText,
        timestamp: new Date().toISOString(),
        isAgent: true
      };

      await postApi('/pdkt/mailbox/reply', {
        mailboxId: selectedId,
        reply,
        timeTaken
      });

      await refetch();
      await fetchHistory(); // reload evaluation status in history
      setIsReplyOpen(false);
    } catch (err) {
      alert('Gagal mengirim balasan.');
    } finally {
      setIsReplying(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus email ini?')) return;
    try {
      await deleteApi(`/pdkt/mailbox/${id}`);
      await refetch();
      if (selectedId === id) setSelectedId(null);
    } catch (err) {
      alert('Gagal menghapus email.');
    }
  };

  if (loading && !mailboxItems) {
    return (
      <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
        <Loader2 className="w-8 h-8 text-sky-600 animate-spin" />
      </div>
    );
  }

  // Active scenarios for CreateEmailModal: fallback to defaultScenarios if no custom settings exist
  const activeScenarios = settings?.scenarios || defaultScenarios || [];

  // Prepared PdktAppSettings for SettingsModal
  const currentSettings: PdktAppSettings = settings || {
    scenarios: defaultScenarios || [],
    consumerTypes: defaultConsumerTypesFromApi || defaultConsumerTypes,
    enableImageGeneration: true,
    globalConsumerTypeId: 'random',
    selectedModel: 'gemini-3.1-flash-lite',
    consumerNameMentionPattern: 'random',
    writingStyleMode: 'training',
    customIdentity: {
      senderName: '',
      email: '',
      city: '',
      bodyName: ''
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm relative">
      <MailboxSidebar
        items={mailboxItems || []}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onNew={() => setIsNewModalOpen(true)}
        onSettings={() => setIsSettingsOpen(true)}
        onHistory={async () => { await fetchHistory(); setIsHistoryOpen(true); }}
        onUsage={() => setIsUsageOpen(true)}
      />

      <div className="flex-1 flex flex-col min-w-0 relative">
        {selectedItem ? (
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <EmailDetailPane
              item={selectedItem}
              onReply={handleReplyOpen}
              onDelete={() => handleDelete(selectedItem.id)}
              isComposerOpen={isReplyOpen}
            />
            {isReplyOpen && (
              <div className="shrink-0">
                <ReplyComposer
                  recipient={selectedItem.sender_email}
                  subject={`Re: ${selectedItem.subject}`}
                  onSend={handleReplySubmit}
                  onClose={() => setIsReplyOpen(false)}
                  isLoading={isReplying}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-gray-400">
            <Plus className="w-12 h-12 mb-4 text-gray-200" />
            <p className="text-sm font-medium">Pilih email atau buat simulasi baru</p>
            <div className="flex gap-2">
              <button
                onClick={() => setIsNewModalOpen(true)}
                className="mt-4 px-4 py-2 bg-sky-600 text-white rounded-xl text-xs font-bold hover:bg-sky-700 transition-all"
              >
                Simulasi Baru
              </button>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-200 transition-all"
              >
                Pengaturan
              </button>
            </div>
          </div>
        )}
      </div>

      <CreateEmailModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        scenarios={activeScenarios}
        onCreate={handleStartNew}
        isLoading={isStartingNew}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={currentSettings}
        onSave={handleSaveSettings}
        defaultScenarios={defaultScenarios || []}
        defaultConsumerTypes={defaultConsumerTypesFromApi || defaultConsumerTypes}
      />

      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onClearHistory={handleClearHistory}
      />

      <UsageModal
        isOpen={isUsageOpen}
        onClose={() => setIsUsageOpen(false)}
        module="pdkt"
      />
    </div>
  );
}

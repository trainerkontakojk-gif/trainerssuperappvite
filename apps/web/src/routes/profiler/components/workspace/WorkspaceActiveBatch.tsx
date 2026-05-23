

import React from 'react';
import BatchHero from './BatchHero';
import InsightPanel from './InsightPanel';
import ActionToolTile from './ActionToolTile';
import { 
  Plus, Upload, Table2, SlidersHorizontal, 
  Download, PieChart, Settings2 
} from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { motion } from 'framer-motion';

interface Birthday {
  nama: string;
  tglLahir: string;
  days: number;
  age: number;
}

interface WorkspaceActiveBatchProps {
  batchName: string;
  count: number;
  loadingPeserta: boolean;
  isReadOnly: boolean;
  onPickPeserta: () => void;
  upcomingBirthdays: Birthday[];
  onShowBirthdays: () => void;
}

export default function WorkspaceActiveBatch({
  batchName,
  count,
  loadingPeserta,
  isReadOnly,
  onPickPeserta,
  upcomingBirthdays,
  onShowBirthdays
}: WorkspaceActiveBatchProps) {
  const navigate = useNavigate();
  const hasPeserta = count > 0;

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar relative z-10">
      <div className="max-w-7xl mx-auto p-8 md:p-12 space-y-12">
        {/* Hero Section */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <BatchHero 
            name={batchName}
            count={count}
            loading={loadingPeserta}
            isReadOnly={isReadOnly}
            onAddPeserta={() => navigate({ to: `/profiler/add`, search: { batch: batchName } })}
            onPickPeserta={onPickPeserta}
          />
        </motion.div>

        {/* Insight Section */}
        {hasPeserta && (
          <motion.div variants={item} initial="hidden" animate="show">
            <InsightPanel 
              upcomingBirthdays={upcomingBirthdays}
              totalPeserta={count}
              batchName={batchName}
              onShowBirthdays={onShowBirthdays}
            />
          </motion.div>
        )}

        <motion.div 
          variants={container}
          initial="hidden"
          animate="show"
          className="space-y-12"
        >
          {/* Data Management Section */}
          {!isReadOnly && (
            <section className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-6 bg-primary rounded-full" />
                <h3 className="text-xl font-black tracking-tight uppercase">Manajemen Data</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <ActionToolTile 
                  icon={<Plus size={24} />}
                  accent="primary"
                  title="Input Manual"
                  desc="Antarmuka input manual untuk pendaftaran peserta baru satu per satu."
                  onClick={() => navigate({ to: `/profiler/add`, search: { batch: batchName } })}
                />
                <ActionToolTile 
                  icon={<Upload size={24} />}
                  accent="telefun"
                  title="Impor Data"
                  desc="Unggah dataset eksternal (Excel) untuk integrasi data massal."
                  onClick={() => navigate({ to: `/profiler/import`, search: { batch: batchName } })}
                />
              </div>
            </section>
          )}

          {/* Analysis & Export Section */}
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-6 bg-module-profiler rounded-full" />
              <h3 className="text-xl font-black tracking-tight uppercase">Analisis & Ekspor</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <ActionToolTile 
                disabled={!hasPeserta}
                icon={<Table2 size={24} />}
                accent="primary"
                title="Database"
                desc="Tabel database interaktif untuk audit dan manajemen data."
                onClick={() => navigate({ to: `/profiler/table`, search: { batch: batchName } })}
              />
              <ActionToolTile 
                disabled={!hasPeserta}
                icon={<SlidersHorizontal size={24} />}
                accent="pdkt"
                title="Slide Profil"
                desc="Visualisasi profil dalam format slide presentasi otomatis."
                onClick={() => navigate({ to: `/profiler/slides`, search: { batch: batchName } })}
              />
              <ActionToolTile 
                disabled={!hasPeserta}
                icon={<Download size={24} />}
                accent="sidak"
                title="Ekspor Laporan"
                desc="Generate dokumen PDF/Excel untuk laporan resmi."
                onClick={() => navigate({ to: `/profiler/export`, search: { batch: batchName } })}
              />
              <ActionToolTile 
                disabled={!hasPeserta}
                icon={<PieChart size={24} />}
                accent="telefun"
                title="Statistik Batch"
                desc="Distribusi data dan statistik demografi batch aktif."
                onClick={() => navigate({ to: `/profiler/analytics`, search: { batch: batchName } })}
              />
            </div>
          </section>

          {/* Configuration Section */}
          {!isReadOnly && (
            <section className="space-y-6 opacity-60 hover:opacity-100 transition-opacity duration-500">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-6 bg-muted-foreground/30 rounded-full" />
                <h3 className="text-xl font-black tracking-tight uppercase text-muted-foreground/60">Konfigurasi</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <ActionToolTile 
                  icon={<Settings2 size={24} />}
                  accent="slate"
                  title="Manajemen Tim"
                  desc="Atur daftar tim dan parameter organisasi modul."
                  onClick={() => navigate({ to: '/profiler/teams' })}
                />
              </div>
            </section>
          )}
        </motion.div>
      </div>
    </div>
  );
}

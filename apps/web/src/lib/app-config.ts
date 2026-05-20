import { BarChart3, LayoutDashboard, Mail, MessageSquare, Phone, Users, type LucideIcon } from 'lucide-react';

export interface AppModuleConfig {
  id: string;
  title: string;
  shortTitle: string;
  expandedTitle: string;
  description: string;
  href: string;
  icon: LucideIcon;
  accentClassName: string;
  accentSoftClassName: string;
  allowedRoles?: string[];
}

export const APP_MODULES: AppModuleConfig[] = [
  {
    id: 'dashboard',
    title: 'Unified Dashboard',
    shortTitle: 'Dashboard',
    expandedTitle: 'Unified Dashboard',
    description: 'Pusat kendali untuk memantau performa, aktivitas, dan prioritas kerja harian.',
    href: '/dashboard',
    icon: LayoutDashboard,
    accentClassName: 'text-indigo-600',
    accentSoftClassName: 'bg-indigo-100',
  },
  {
    id: 'ketik',
    title: 'KETIK',
    shortTitle: 'Ketik',
    expandedTitle: 'Kelas Etika & Trik Komunikasi',
    description: 'Simulasi chat layanan untuk melatih komunikasi tertulis yang empatik dan solutif.',
    href: '/ketik',
    icon: MessageSquare,
    accentClassName: 'text-emerald-600',
    accentSoftClassName: 'bg-emerald-100',
  },
  {
    id: 'pdkt',
    title: 'PDKT',
    shortTitle: 'PDKT',
    expandedTitle: 'Paham Dulu Kasih Tanggapan',
    description: 'Workspace korespondensi email untuk standardisasi tanggapan layanan konsumen.',
    href: '/pdkt',
    icon: Mail,
    accentClassName: 'text-sky-600',
    accentSoftClassName: 'bg-sky-100',
  },
  {
    id: 'telefun',
    title: 'TELEFUN',
    shortTitle: 'Telefun',
    expandedTitle: 'Telephone Fun',
    description: 'Simulasi komunikasi suara untuk melatih percakapan telepon yang presisi dan profesional.',
    href: '/telefun',
    icon: Phone,
    accentClassName: 'text-violet-600',
    accentSoftClassName: 'bg-violet-100',
  },
  {
    id: 'profiler',
    title: 'KTP / Profiler',
    shortTitle: 'KTP',
    expandedTitle: 'Kotak Tool Profil',
    description: 'Database profil agen dan peserta untuk operasional training yang lebih rapi dan terstruktur.',
    href: '/profiler',
    icon: Users,
    accentClassName: 'text-amber-600',
    accentSoftClassName: 'bg-amber-100',
    allowedRoles: ['trainer', 'leader', 'admin'],
  },
  {
    id: 'qa-analyzer',
    title: 'SIDAK',
    shortTitle: 'SIDAK',
    expandedTitle: 'Sistem Informasi Data Analisis Kualitas',
    description: 'Analytics kualitas untuk membaca pola temuan, ranking, dan area perbaikan lintas tim.',
    href: '/sidak',
    icon: BarChart3,
    accentClassName: 'text-rose-600',
    accentSoftClassName: 'bg-rose-100',
    allowedRoles: ['trainer', 'leader', 'admin'],
  },
];

export function normalizeRoleLabel(role?: string | null) {
  const value = role?.toLowerCase().trim();
  switch (value) {
    case 'agent':
    case 'agents':
      return 'Agent';
    case 'leader':
      return 'Leader';
    case 'trainer':
    case 'trainers':
      return 'Trainer';
    case 'admin':
      return 'Admin';
    default:
      return 'User';
  }
}

export function isRoleAllowed(role: string | undefined | null, allowedRoles?: string[]) {
  if (!allowedRoles || allowedRoles.length === 0) return true;
  const normalizedRole = role?.toLowerCase().trim();
  
  // Normalize role to singular form
  const finalRole = normalizedRole === 'trainers' ? 'trainer' : normalizedRole === 'agents' ? 'agent' : normalizedRole;
  
  return allowedRoles.includes(finalRole || '');
}

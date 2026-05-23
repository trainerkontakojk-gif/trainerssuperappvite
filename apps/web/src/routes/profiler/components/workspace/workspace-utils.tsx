import React from 'react';
import { 
  ShieldCheck, CreditCard, BarChart3,
  UserCheck, GraduationCap, Headset, Building2, Folder, Layers,
  MessageCircle, Phone, Mail, Video
} from 'lucide-react';

/**
 * Mendapatkan ikon dinamis berdasarkan nama folder/batch
 * Menggunakan regex word boundary agar tidak agresif
 */
export const getDynamicIcon = (name: string, size = 18) => {
  const n = name.toUpperCase();
  
  // High Precedence / Specific Roles
  if (/\b(SM|SITE|OFFICE)\b/i.test(n)) return <Building2 size={size} />;
  if (/\b(SV|SUPERVISOR|LEADER)\b/i.test(n)) return <UserCheck size={size} />;
  if (/\b(TR|TRAINER|INSTRUCTOR)\b/i.test(n)) return <GraduationCap size={size} />;
  
  // Communication Channels
  if (/\b(WA|WHATSAPP|CHAT|PESAN)\b/i.test(n)) return <MessageCircle size={size} />;
  if (/\b(TELEPON|PHONE|CALL|VOICE|TELP)\b/i.test(n)) return <Phone size={size} />;
  if (/\b(EMAIL|SURAT|MAIL)\b/i.test(n)) return <Mail size={size} />;
  if (/\b(VIDEO|ZOOM|MEET)\b/i.test(n)) return <Video size={size} />;

  // Functional Teams
  if (/\b(OM|OPERATIONAL|MANAGER)\b/i.test(n)) return <ShieldCheck size={size} />;
  if (/\b(SLIK|CHECKING|BI)\b/i.test(n)) return <CreditCard size={size} />;
  if (/\b(DA|ANALYST|DATA)\b/i.test(n)) return <BarChart3 size={size} />;
  if (/\b(AG|AGENT|STAFF)\b/i.test(n)) return <Headset size={size} />;
  
  // Structural
  if (/\b(BATCH|KELOMPOK|GROUP)\b/i.test(n)) return <Layers size={size} />;
  
  return <Folder size={size} />;
};

/**
 * Membersihkan label tahun dari imbuhan "Tahun"
 */
export const cleanYearLabel = (label: string) => {
  return label.replace(/Tahun\s+/gi, '').trim();
};

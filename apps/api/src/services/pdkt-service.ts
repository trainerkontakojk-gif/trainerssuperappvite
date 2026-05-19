import { PdktScenario, PdktConsumerType, PdktIdentity, EmailMessage, PdktSessionConfig } from '@trainers/types';
import { generateGeminiContent } from '../lib/gemini';
import { generateOpenRouterContent } from '../lib/openrouter';
import { resolveModelProvider } from '../lib/ai-models';
import { UsageContext } from '../lib/ai-usage';

const DEFAULT_SCENARIOS: PdktScenario[] = [
  { id: 'pinjol', category: 'Pinjol', title: 'Pinjol Ilegal', description: 'Konsumen diteror pinjol ilegal.', isActive: true, isLicensed: false },
  { id: 'penipuan', category: 'Penipuan', title: 'Penipuan Undian', description: 'Konsumen menerima pesan menang undian.', isActive: true, isLicensed: false },
  { id: 'slik', category: 'SLIK', title: 'Pengecekan SLIK', description: 'Konsumen ingin cek SLIK.', isActive: true, isLicensed: true },
  { id: 'asuransi', category: 'Asuransi', title: 'Klaim Asuransi Ditolak', description: 'Klaim asuransi ditolak.', isActive: true, isLicensed: true },
  { id: 'investasi', category: 'Investasi', title: 'Investasi Bodong', description: 'Tawaran investasi tidak wajar.', isActive: true, isLicensed: false },
  { id: 'kartu-kredit', category: 'Perbankan', title: 'Tagihan Kartu Kredit', description: 'Biaya administrasi tidak dikenal.', isActive: true, isLicensed: true },
];

const DEFAULT_CONSUMER_TYPES: PdktConsumerType[] = [
  { id: 'marah', name: 'Marah & Emosional', description: 'Sangat marah, emosional, tidak sabar.', difficulty: 'Hard', tone: 'Marah, menggunakan tanda seru.' },
  { id: 'bingung', name: 'Bingung & Gaptek', description: 'Kebingungan, tidak paham teknologi.', difficulty: 'Medium', tone: 'Bingung, ragu-ragu.' },
  { id: 'kritis', name: 'Kritis & Detail', description: 'Kritis, menanyakan dasar hukum.', difficulty: 'Hard', tone: 'Kritis, logis, skeptis.' },
  { id: 'ramah', name: 'Ramah & Kooperatif', description: 'Ramah, sopan, kooperatif.', difficulty: 'Easy', tone: 'Ramah, sopan.' },
  { id: 'terburu-buru', name: 'Terburu-buru', description: 'Ingin jawaban singkat dan cepat.', difficulty: 'Medium', tone: 'Singkat, padat.' },
  { id: 'pasrah', name: 'Pasrah & Sedih', description: 'Putus asa, nada sedih.', difficulty: 'Medium', tone: 'Sedih, memohon bantuan.' },
];

const DUMMY_PROFILES = [
  { name: 'Budi Santoso', email: 'budi.santoso88@gmail.com' },
  { name: 'Siti Aminah', email: 'siti.aminah_real@yahoo.com' },
  { name: 'Agus Setiawan', email: 'agus.setiawan.work@gmail.com' },
  { name: 'Dewi Lestari', email: 'dewi.lestari1990@outlook.com' },
  { name: 'Rudi Hartono', email: 'rudi.hartono.bisnis@gmail.com' },
];

export function getScenarios(): PdktScenario[] {
  return DEFAULT_SCENARIOS;
}

export function getConsumerTypes(): PdktConsumerType[] {
  return DEFAULT_CONSUMER_TYPES;
}

export function generateRandomIdentity(): PdktIdentity {
  const profile = DUMMY_PROFILES[Math.floor(Math.random() * DUMMY_PROFILES.length)];
  return { name: profile.name, email: profile.email, city: 'Jakarta', bodyName: profile.name.split(' ')[0] };
}

export async function generateScenarioEmailTemplate(
  scenario: PdktScenario,
  consumerType: PdktConsumerType,
  identity: PdktIdentity,
  usageContext?: UsageContext,
  userId?: string,
): Promise<{ success: boolean; subject?: string; body?: string; error?: string }> {
  const systemInstruction = `
Anda adalah asisten yang membuat email dari konsumen ke OJK.
Buat email tentang: ${scenario.description}
Karakter konsumen: ${consumerType.description} (${consumerType.tone || ''})
Nama: ${identity.name}, Email: ${identity.email}

Buat email dalam format JSON:
{ "subject": "subjek email", "body": "isi email" }

Gunakan bahasa Indonesia. ${scenario.isLicensed ? 'Gunakan nama perusahaan sesuai skenario.' : 'Gunakan nama perusahaan fiktif.'}
  `.trim();

  const { modelId, provider } = resolveModelProvider('gemini-3.1-flash-lite');
  const isOpenRouter = provider === 'openrouter';
  const callPayload = {
    model: modelId,
    systemInstruction,
    contents: [{ role: 'user' as const, parts: [{ text: `Buat email untuk skenario: ${scenario.title}` }] }],
    temperature: 0.7,
    responseMimeType: 'application/json',
    usageContext,
    userId,
  };

  try {
    const response = isOpenRouter
      ? await generateOpenRouterContent(callPayload)
      : await generateGeminiContent(callPayload);

    if (!response.success) return { success: false, error: response.error };
    if (!response.text) return { success: false, error: 'AI tidak mengembalikan teks.' };

    const json = JSON.parse(response.text);
    return { success: true, subject: json.subject || '', body: json.body || '' };
  } catch (error) {
    console.error('[PDKT] Template error:', error);
    return { success: false, error: 'Gagal generate template.' };
  }
}

export async function evaluateAgentResponse(
  config: PdktSessionConfig,
  emails: EmailMessage[],
  usageContext?: UsageContext,
  userId?: string,
): Promise<{ success: boolean; score?: number; feedback?: string; typos?: string[]; clarityIssues?: string[]; contentGaps?: string[]; error?: string }> {
  const systemInstruction = `
Anda adalah evaluator yang menilai respons agen OJK dalam simulasi email.
Nilai respon agen berdasarkan:
1. Kesesuaian solusi dengan masalah konsumen
2. Kejelasan bahasa
3. Empati dan profesionalisme
4. Typo dan tata bahasa

Kembalikan JSON:
{ "score": 0-100, "feedback": "ringkasan", "typos": [...], "clarityIssues": [...], "contentGaps": [...] }
  `.trim();

  const emailHistory = emails.map(e =>
    `${e.isAgent ? '[AGEN]' : '[KONSUMEN]'} ${e.subject ? `Subjek: ${e.subject}` : ''}\n${e.body}`
  ).join('\n\n');

  const { modelId, provider } = resolveModelProvider('gemini-3.1-flash-lite');
  const isOpenRouter = provider === 'openrouter';
  const callPayload = {
    model: modelId,
    systemInstruction,
    contents: [{ role: 'user' as const, parts: [{ text: `Riwayat email:\n${emailHistory}\n\nEvaluasi respons agen:` }] }],
    temperature: 0.5,
    responseMimeType: 'application/json',
    usageContext,
    userId,
  };

  try {
    const response = isOpenRouter
      ? await generateOpenRouterContent(callPayload)
      : await generateGeminiContent(callPayload);

    if (!response.success || !response.text) return { success: false, error: response.error };

    const result = JSON.parse(response.text);
    return {
      success: true,
      score: result.score || 0,
      feedback: result.feedback || '',
      typos: result.typos || [],
      clarityIssues: result.clarityIssues || [],
      contentGaps: result.contentGaps || [],
    };
  } catch (error) {
    console.error('[PDKT] Evaluation error:', error);
    return { success: false, error: 'Gagal evaluasi.' };
  }
}

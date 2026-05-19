import { KetikScenario, KetikConsumerType, ChatMessage, ChatSession } from '@trainers/types';
import { generateGeminiContent } from '../lib/gemini';
import { generateOpenRouterContent } from '../lib/openrouter';
import { resolveModelProvider } from '../lib/ai-models';
import { UsageContext } from '../lib/ai-usage';

const DEFAULT_SCENARIOS: KetikScenario[] = [
  { id: 'pinjol', category: 'Pinjol', title: 'Pinjol Ilegal', description: 'Konsumen diteror oleh pinjol ilegal padahal tidak pernah meminjam.', isActive: true },
  { id: 'penipuan', category: 'Penipuan', title: 'Penipuan Undian', description: 'Konsumen menerima pesan menang undian dan diminta transfer pajak.', isActive: true },
  { id: 'slik', category: 'SLIK', title: 'Pengecekan SLIK', description: 'Konsumen ingin mengecek status BI Checking / SLIK.', isActive: true },
  { id: 'asuransi', category: 'Asuransi', title: 'Klaim Asuransi Ditolak', description: 'Konsumen mengeluh klaim asuransi kesehatannya ditolak.', isActive: true },
  { id: 'investasi', category: 'Investasi', title: 'Investasi Bodong', description: 'Konsumen melaporkan tawaran investasi dengan imbal hasil tidak wajar.', isActive: true },
  { id: 'kartu-kredit', category: 'Perbankan', title: 'Tagihan Kartu Kredit', description: 'Konsumen keberatan dengan biaya administrasi di kartu kreditnya.', isActive: true },
];

const DEFAULT_CONSUMER_TYPES: KetikConsumerType[] = [
  { id: 'marah', name: 'Marah & Emosional', description: 'Konsumen sangat kesal karena merasa dirugikan. Nada chat tegas, mendesak, mudah terpancing.', difficulty: 'Sulit' },
  { id: 'bingung', name: 'Bingung & Gaptek', description: 'Konsumen awam, bingung, kurang paham istilah teknis.', difficulty: 'Sedang' },
  { id: 'kritis', name: 'Kritis & Detail', description: 'Konsumen teliti, skeptis, suka meminta dasar aturan.', difficulty: 'Sulit' },
  { id: 'ramah', name: 'Ramah & Kooperatif', description: 'Konsumen sopan, tenang, kooperatif.', difficulty: 'Mudah' },
  { id: 'terburu-buru', name: 'Terburu-buru', description: 'Konsumen sempit waktu, ingin jawaban cepat.', difficulty: 'Sedang' },
  { id: 'pasrah', name: 'Pasrah & Sedih', description: 'Konsumen lelah dan putus asa, nada chat sedih.', difficulty: 'Sedang' },
];

export function getScenarios(): KetikScenario[] {
  return DEFAULT_SCENARIOS;
}

export function getConsumerTypes(): KetikConsumerType[] {
  return DEFAULT_CONSUMER_TYPES;
}

function sanitizeConsumerText(rawText: string): string {
  if (!rawText) return rawText;
  let text = rawText.trim()
    .replace(/^(Agen|Agent|CS|Customer Service)\s*:\s*[\s\S]*?\n{1,2}/i, '')
    .replace(/^(Konsumen|Pelanggan|Customer|Nasabah|Klien|User|Pengguna|Bapak\/Ibu)\s*:\s*/i, '')
    .replace(/\(pesan chat sebelumnya\)/gi, '')
    .replace(/\[pesan( chat)? sebelumnya\]/gi, '');

  if (/(^|\n)\s*(Agen|Agent|CS|Customer Service)\s*:/i.test(text)) {
    const consumerLines = text.split('\n')
      .map(l => l.trim()).filter(Boolean)
      .filter(l => !/^(Agen|Agent|CS|Customer Service)\s*:/i.test(l))
      .map(l => l.replace(/^(Konsumen|Pelanggan|Customer|Nasabah|Klien|User|Pengguna|Bapak\/Ibu)\s*:\s*/i, ''));
    if (consumerLines.length > 0) text = consumerLines.join(' ');
  }
  return text.trim();
}

export async function generateConsumerResponse(
  config: { scenarios: KetikScenario[]; consumerType: KetikConsumerType; identity: { name: string; city: string; phone: string }; selectedModel: string; simulationDuration: number; responsePacingMode: string },
  scenario: KetikScenario,
  chatHistory: ChatMessage[],
  usageContext?: UsageContext,
  userId?: string,
): Promise<{ success: boolean; text?: string; error?: string }> {
  const scriptInstruction = scenario.script
    ? `SKRIP PERCAKAPAN:\n${scenario.script}`
    : '';

  const systemInstruction = `
ROLEPLAY: Anda adalah KONSUMEN yang menghubungi Kontak OJK 157 via chat.
IDENTITAS: Nama: ${config.identity.name}, Kota: ${config.identity.city}, HP: ${config.identity.phone}
KARAKTER: ${config.consumerType.description}
Masalah: ${scenario.description}.
${scriptInstruction}

ATURAN:
1. Balas natural, singkat, seperti chat WA. Bahasa Indonesia sehari-hari.
2. Jangan akui Anda AI. Tetaplah konsumen.
3. Jangan tulis ulang pesan agen. Jangan format transkrip.
4. Gunakan [BREAK] untuk pisah pesan (max 3 chat berturut).
5. Output hanya isi chat konsumen, bukan dialog dua arah.
6. Konsisten dengan identitas — jangan mengarang data baru.
7. Jika agen minta data, berikan data dari identitas di atas.
  `;

  const historyText = chatHistory
    .filter(m => m.sender !== 'system')
    .map(m => `${m.sender === 'agent' ? '[AGEN]' : '[KONSUMEN]'} ${m.text}`)
    .join('\n');

  const prompt = `Skenario: ${scenario.title}\n\nRiwayat Chat:\n${historyText}\n\nBalas sebagai konsumen:`;

  const { modelId, provider } = resolveModelProvider(config.selectedModel);
  const isOpenRouter = provider === 'openrouter';
  const callPayload = {
    model: modelId,
    systemInstruction,
    contents: [{ role: 'user' as const, parts: [{ text: prompt }] }],
    temperature: isOpenRouter ? 0.55 : 0.82,
    usageContext,
    userId,
  };

  try {
    const response = isOpenRouter
      ? await generateOpenRouterContent(callPayload)
      : await generateGeminiContent(callPayload);

    if (!response.success) {
      return { success: false, error: response.error || 'AI tidak tersedia.' };
    }
    const rawText = typeof response.text === 'string' ? response.text : '[NO_RESPONSE]';
    const sanitizedText = sanitizeConsumerText(rawText);
    return { success: true, text: sanitizedText || '[NO_RESPONSE]' };
  } catch (error) {
    console.error('[KETIK] Error:', error);
    return { success: false, error: 'Gangguan AI. Coba lagi.' };
  }
}

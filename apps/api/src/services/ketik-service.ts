import { KetikScenario, KetikConsumerType, ChatMessage, ChatSession, KetikAppSettings, KetikSessionHistoryItem, KetikReviewDetail, KetikSessionReview, KetikTypoFinding, DEFAULT_KETIK_SETTINGS } from '@trainers/types';
import { generateGeminiContent } from '../lib/gemini';
import { generateOpenRouterContent } from '../lib/openrouter';
import { resolveModelProvider } from '../lib/ai-models';
import { UsageContext } from '../lib/ai-usage';
import { Type } from '@google/genai';
import { createAdminClient } from '../lib/supabase';


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

export async function triggerKetikAIReview(sessionId: string, userId: string): Promise<any> {
  const adminClient = createAdminClient();
  
  const { data: session, error: sessionError } = await adminClient
    .from('ketik_history')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (sessionError || !session) {
    console.error(`[triggerKetikAIReview] Session not found or unauthorized: ${sessionId}`);
    throw new Error('Session not found or unauthorized');
  }

  if (session.review_status === 'completed') {
    return { status: 'skipped' };
  }

  const { error: jobError } = await adminClient
    .from('ketik_review_jobs')
    .upsert(
      {
        session_id: sessionId,
        status: 'queued',
        lease_owner: null,
        lease_expires_at: null,
        error_message: null,
      },
      { onConflict: 'session_id' }
    );

  if (jobError) throw jobError;
  
  await adminClient.from('ketik_history').update({ review_status: 'pending' }).eq('id', sessionId);

  return { status: 'queued' };
}

export async function claimAndProcessKetikReviewJob(
  sessionId: string,
  workerId: string = 'system-auto'
): Promise<any> {
  const adminClient = createAdminClient();

  const nowIso = new Date().toISOString();
  const leaseExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const { data: claimed, error: claimError } = await adminClient
    .from('ketik_review_jobs')
    .update({
      status: 'processing',
      lease_owner: workerId,
      lease_expires_at: leaseExpiresAt,
      error_message: null,
    })
    .eq('session_id', sessionId)
    .or(`status.eq.queued,and(status.eq.processing,lease_expires_at.lt.${nowIso})`)
    .select('id, attempt_count');

  if (claimError) throw claimError;

  if (!claimed || claimed.length === 0) {
    const { data: current } = await adminClient
      .from('ketik_review_jobs')
      .select('status')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (!current) return { status: 'skipped' };
    if (current.status === 'completed') return { status: 'completed' };
    if (current.status === 'failed') return { status: 'failed', error: 'Job previously failed' };
    return { status: 'processing' };
  }

  const nextAttempt = (claimed[0].attempt_count || 0) + 1;
  if (nextAttempt > 3) {
    await adminClient
      .from('ketik_review_jobs')
      .update({
        status: 'failed',
        error_message: 'Max attempts reached',
        lease_owner: null,
        lease_expires_at: null,
      })
      .eq('session_id', sessionId);
    await adminClient
      .from('ketik_history')
      .update({ review_status: 'failed' })
      .eq('id', sessionId);
    return { status: 'failed', error: 'Max attempts reached' };
  }

  await adminClient
    .from('ketik_review_jobs')
    .update({ attempt_count: nextAttempt })
    .eq('session_id', sessionId);

  try {
    return await processKetikReviewJob(sessionId, workerId);
  } catch (error: any) {
    const error_message = error instanceof Error ? error.message : 'Unknown processing error';
    await adminClient
      .from('ketik_review_jobs')
      .update({
        status: 'failed',
        error_message,
        lease_owner: null,
        lease_expires_at: null,
      })
      .eq('session_id', sessionId);
    await adminClient
      .from('ketik_history')
      .update({ review_status: 'failed' })
      .eq('id', sessionId);
    return { status: 'failed', error: error_message };
  }
}

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    coachingFocus: { type: Type.ARRAY, items: { type: Type.STRING } },
    scores: {
      type: Type.OBJECT,
      properties: {
        final: { type: Type.NUMBER },
        empathy: { type: Type.NUMBER },
        probing: { type: Type.NUMBER },
        typo: { type: Type.NUMBER },
        compliance: { type: Type.NUMBER },
      },
      required: ["final", "empathy", "probing", "typo", "compliance"]
    },
    typos: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          messageId: { type: Type.STRING },
          originalWord: { type: Type.STRING },
          correctedWord: { type: Type.STRING },
          severity: { type: Type.STRING, enum: ["minor", "medium", "critical"] },
        },
        required: ["messageId", "originalWord", "correctedWord", "severity"]
      }
    }
  },
  required: ["summary", "strengths", "weaknesses", "coachingFocus", "scores", "typos"]
};

export async function processKetikReviewJob(sessionId: string, leaseOwner?: string): Promise<any> {
  const adminClient = createAdminClient();
  
  const { data: session, error: sessionError } = await adminClient
    .from('ketik_history')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error('Session not found');
  }

  const transcript = JSON.stringify(session.messages);

  const systemInstruction = `
  You are an expert Quality Assurance (QA) and Coaching AI for a customer service contact center.
  Review the customer service chat transcript between an Agent (user) and a Consumer (consumer).
  
  Evaluation Categories (Skala 0-100):
  - Communication (naturalness, empathy, readability, professionalism)
  - Probing (depth, relevance, chronology gathering)
  - Resolution (clarity, actionable response, completeness)
  - Compliance (no misinformation, no victim blaming, no rude wording)
  - Typo & Writing (typo frequency, readability)

  Rubrik Penilaian (0-100):
  - 90-100: Sangat Baik (Excellent)
  - 75-89: Baik (Good)
  - 60-74: Cukup (Fair)
  - <60: Perlu Coaching (Needs Coaching)

  Rules for Typo Detection:
  - Ignore common Indonesian slang/informal words like 'yg', 'sy', 'kak', 'ga', 'gak', 'ok', 'oke'.
  - Identify formal typos that affect professionalism or readability.
  - Severity: 'minor' (small typo), 'medium' (repeated or confusing), 'critical' (changes meaning or unprofessional).

  IMPORTANT: ALL textual response (summary, strengths, weaknesses, coachingFocus) MUST be in Indonesian.
  `;

  const aiResponse = await generateGeminiContent({
    model: 'gemini-3.1-flash-lite',
    systemInstruction,
    contents: [{ role: 'user', parts: [{ text: `Transcript:\n${transcript}` }] }],
    responseMimeType: "application/json",
    responseSchema: responseSchema as any,
    usageContext: { module: 'ketik', action: 'coaching_review' },
    userId: session.user_id
  });

  if (!aiResponse.success || !aiResponse.text) {
    throw new Error(aiResponse.error || "AI Response failed or empty");
  }
  
  let reviewResult: any;
  try {
    reviewResult = JSON.parse(aiResponse.text);
    
    const clamp = (val: any) => {
      const num = Number(val);
      if (isNaN(num)) return 0;
      return Math.max(0, Math.min(100, Math.round(num)));
    };

    reviewResult.scores = {
      empathy: clamp(reviewResult.scores?.empathy),
      probing: clamp(reviewResult.scores?.probing),
      typo: clamp(reviewResult.scores?.typo),
      compliance: clamp(reviewResult.scores?.compliance),
      final: clamp(reviewResult.scores?.final),
    };

    const calculatedFinal = Math.round(
      (reviewResult.scores.empathy +
        reviewResult.scores.probing +
        reviewResult.scores.typo +
        reviewResult.scores.compliance) / 4
    );
    
    if (reviewResult.scores.final === 0 || Math.abs(reviewResult.scores.final - calculatedFinal) > 15) {
      reviewResult.scores.final = calculatedFinal;
    }

    if (!reviewResult.summary) reviewResult.summary = "Ringkasan tidak tersedia.";
    if (!Array.isArray(reviewResult.strengths) || reviewResult.strengths.length === 0) reviewResult.strengths = ["Pertahankan profesionalisme dalam berkomunikasi."];
    if (!Array.isArray(reviewResult.weaknesses) || reviewResult.weaknesses.length === 0) reviewResult.weaknesses = ["Terus latih teknik probing dan empati."];
    if (!Array.isArray(reviewResult.coachingFocus) || reviewResult.coachingFocus.length === 0) reviewResult.coachingFocus = ["Fokus pada detail kebutuhan konsumen."];

    if (
      !reviewResult ||
      typeof reviewResult !== 'object' ||
      !reviewResult.scores ||
      typeof reviewResult.scores.final !== 'number' ||
      typeof reviewResult.summary !== 'string'
    ) {
      throw new Error('Invalid AI response shape after normalization');
    }
  } catch (error) {
    console.error("[processKetikReviewJob] Failed to parse or normalize AI response:", error, aiResponse.text);
    throw new Error('AI response JSON tidak valid atau format tidak sesuai.');
  }

  if (leaseOwner) {
    const renewedLeaseExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const { data: leaseRows, error: leaseError } = await adminClient
      .from('ketik_review_jobs')
      .update({ lease_expires_at: renewedLeaseExpiresAt })
      .eq('session_id', sessionId)
      .eq('status', 'processing')
      .eq('lease_owner', leaseOwner)
      .select('id');

    if (leaseError) throw leaseError;

    if (!leaseRows || leaseRows.length === 0) {
      console.warn(`[processKetikReviewJob] Lease lost before persistence for session: ${sessionId}`);
      return { status: 'processing' };
    }
  }

  await adminClient.from('ketik_session_reviews').delete().eq('session_id', sessionId);
  
  const { error: reviewInsertError } = await adminClient
    .from('ketik_session_reviews')
    .insert({
      session_id: sessionId,
      ai_summary: reviewResult.summary,
      strengths: reviewResult.strengths,
      weaknesses: reviewResult.weaknesses,
      coaching_focus: reviewResult.coachingFocus
    });

  if (reviewInsertError) throw reviewInsertError;

  await adminClient.from('ketik_typo_findings').delete().eq('session_id', sessionId);

  if (reviewResult.typos && reviewResult.typos.length > 0) {
    const typoInserts = reviewResult.typos.map((t: any) => ({
      session_id: sessionId,
      message_id: t.messageId,
      original_word: t.originalWord,
      corrected_word: t.correctedWord,
      severity: t.severity
    }));

    const { error: typoInsertError } = await adminClient
      .from('ketik_typo_findings')
      .insert(typoInserts);

    if (typoInsertError) throw typoInsertError;
  }

  const { error: updateError } = await adminClient
    .from('ketik_history')
    .update({
      final_score: reviewResult.scores.final,
      empathy_score: reviewResult.scores.empathy,
      probing_score: reviewResult.scores.probing,
      typo_score: reviewResult.scores.typo,
      compliance_score: reviewResult.scores.compliance,
      review_status: 'completed'
    })
    .eq('id', sessionId);

  if (updateError) throw updateError;

  // Dual-update to results
  try {
    await adminClient.from('results').update({
      score: reviewResult.scores.final,
      status: 'completed'
    }).eq('session_id', sessionId).eq('module', 'ketik');
  } catch (e) {
    console.error(e);
  }

  let jobUpdateQuery = adminClient
    .from('ketik_review_jobs')
    .update({ status: 'completed', lease_owner: null, lease_expires_at: null })
    .eq('session_id', sessionId)
    .eq('status', 'processing');

  if (leaseOwner) {
    jobUpdateQuery = jobUpdateQuery.eq('lease_owner', leaseOwner);
  }

  const { error: jobUpdateError } = await jobUpdateQuery;
  if (jobUpdateError) throw jobUpdateError;

  return { status: 'completed' };
}

export async function getKetikReviewStatus(sessionId: string, userId: string): Promise<any> {
  const adminClient = createAdminClient();
  
  const { data: history, error } = await adminClient
    .from('ketik_history')
    .select('review_status, final_score, empathy_score, probing_score, typo_score, compliance_score')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (error || !history) return null;

  return {
    status: history.review_status,
    resultReady: history.review_status === 'completed',
    scores: history.review_status === 'completed' ? {
      final: history.final_score,
      empathy: history.empathy_score,
      probing: history.probing_score,
      typo: history.typo_score,
      compliance: history.compliance_score
    } : null
  };
}

const TEXT_SIMULATION_MODELS = ['gemini-3.1-flash-lite', 'gemini-1.5-pro', 'gpt-4o-mini', 'claude-3-haiku-20240307', 'openrouter/openai/gpt-4o-mini'];
const coerceKetikModelId = (modelId?: string) => TEXT_SIMULATION_MODELS.includes(modelId as any) ? modelId! : 'gemini-3.1-flash-lite';
const coerceDuration = (duration?: number) => {
  if (typeof duration !== 'number' || isNaN(duration)) return 5;
  return Math.max(1, Math.min(60, duration));
};

function parseSettings(stored: Partial<KetikAppSettings>): KetikAppSettings {
  const mergedScenarios = DEFAULT_KETIK_SETTINGS.scenarios.map(defaultItem => {
    const existing = stored.scenarios?.find(s => s.id === defaultItem.id);
    return existing ? { ...existing, description: defaultItem.description } : defaultItem;
  });
  const customScenarios = (stored.scenarios || []).filter(s => !DEFAULT_KETIK_SETTINGS.scenarios.find(d => d.id === s.id));

  const mergedConsumers = DEFAULT_KETIK_SETTINGS.consumerTypes.map(defaultItem => {
    const existing = stored.consumerTypes?.find(s => s.id === defaultItem.id);
    return existing ? { ...existing, description: defaultItem.description } : defaultItem;
  });
  const customConsumers = (stored.consumerTypes || []).filter(s => !DEFAULT_KETIK_SETTINGS.consumerTypes.find(d => d.id === s.id));

  return {
    scenarios: [...mergedScenarios, ...customScenarios],
    consumerTypes: [...mergedConsumers, ...customConsumers],
    quickTemplates: stored.quickTemplates || DEFAULT_KETIK_SETTINGS.quickTemplates,
    activeConsumerTypeId: stored.activeConsumerTypeId || 'random',
    identitySettings: {
      displayName: stored.identitySettings?.displayName || '',
      signatureName: stored.identitySettings?.signatureName || '',
      phoneNumber: stored.identitySettings?.phoneNumber || '',
      city: stored.identitySettings?.city || '',
    },
    selectedModel: coerceKetikModelId(stored.selectedModel),
    simulationDuration: coerceDuration(stored.simulationDuration),
    responsePacingMode: stored.responsePacingMode || 'realistic',
  };
}

export async function getSettings(userId: string): Promise<KetikAppSettings> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('user_settings')
    .select('settings')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data?.settings?.ketik) {
    return DEFAULT_KETIK_SETTINGS;
  }

  const stored = data.settings.ketik as Partial<KetikAppSettings>;
  return parseSettings(stored);
}

export async function saveSettings(userId: string, settings: KetikAppSettings): Promise<void> {
  const adminClient = createAdminClient();

  const { data: existing } = await adminClient
    .from('user_settings')
    .select('settings')
    .eq('user_id', userId)
    .maybeSingle();

  const updatedSettings = {
    ...(existing?.settings || {}),
    ketik: settings,
  };

  const { error } = await adminClient
    .from('user_settings')
    .upsert(
      { user_id: userId, settings: updatedSettings, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );

  if (error) throw new Error(`Gagal menyimpan pengaturan: ${error.message}`);
}

export async function getHistory(userId: string): Promise<KetikSessionHistoryItem[]> {
  const adminClient = createAdminClient();

  let data, error;
  
  // Try 1: specific columns
  const res1 = await adminClient
    .from('ketik_history')
    .select('id, date, created_at, scenario_title, consumer_name, consumer_phone, consumer_city, messages, simulation_duration, final_score, empathy_score, probing_score, typo_score, compliance_score, review_status')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(50);
    
  data = res1.data;
  error = res1.error;

  // Try 2: wildcard
  if (error) {
    const res2 = await adminClient
      .from('ketik_history')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(50);
    data = res2.data;
    error = res2.error;
  }

  // Try 3: results table fallback
  if (error) {
    const res3 = await adminClient
      .from('results')
      .select('session_id, created_at, metadata, score, status')
      .eq('user_id', userId)
      .eq('module', 'ketik')
      .order('created_at', { ascending: false })
      .limit(50);
      
    if (!res3.error && res3.data) {
      return res3.data.map((item: any) => ({
        id: item.session_id,
        date: item.created_at,
        scenarioTitle: item.metadata?.scenario_title || 'Simulation Chat',
        consumerName: item.metadata?.consumer_name || 'Consumer',
        consumerPhone: '',
        consumerCity: '',
        messages: [],
        simulationDuration: item.metadata?.simulation_duration,
        finalScore: item.score,
        reviewStatus: item.status || 'pending',
      }));
    }
    return [];
  }

  return (data || []).map((item: any) => ({
    id: item.id,
    date: item.date || item.created_at,
    scenarioTitle: item.scenario_title || 'Simulation Chat',
    consumerName: item.consumer_name || 'Consumer',
    consumerPhone: item.consumer_phone,
    consumerCity: item.consumer_city,
    messages: Array.isArray(item.messages) ? item.messages : [],
    simulationDuration: item.simulation_duration,
    finalScore: item.final_score,
    empathyScore: item.empathy_score,
    probingScore: item.probing_score,
    typoScore: item.typo_score,
    complianceScore: item.compliance_score,
    reviewStatus: item.review_status,
  }));
}

export async function persistSession(userId: string, params: {
  scenarioTitle: string;
  consumerName: string;
  consumerPhone: string;
  consumerCity: string;
  messages: ChatMessage[];
  simulationDuration?: number;
}): Promise<KetikSessionHistoryItem> {
  const adminClient = createAdminClient();

  const sessionData = {
    user_id: userId,
    date: new Date().toISOString(),
    scenario_title: params.scenarioTitle,
    consumer_name: params.consumerName,
    consumer_phone: params.consumerPhone,
    consumer_city: params.consumerCity,
    messages: params.messages,
    simulation_duration: params.simulationDuration,
  };

  const { data, error } = await adminClient
    .from('ketik_history')
    .insert([sessionData])
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Gagal menyimpan sesi.');
  }

  // Dual-write to results table for legacy compatibility
  try {
    await adminClient.from('results').insert({
      user_id: userId,
      module: 'ketik',
      session_id: data.id,
      created_at: new Date().toISOString(),
      metadata: {
        scenario_title: params.scenarioTitle,
        consumer_name: params.consumerName,
        simulation_duration: params.simulationDuration
      }
    });
  } catch (err) {
    console.error(`[KETIK] Failed to dual-write to results table for session ${data.id}:`, err);
  }

  return {
    id: data.id,
    date: data.date || data.created_at,
    scenarioTitle: data.scenario_title || params.scenarioTitle,
    consumerName: data.consumer_name || params.consumerName,
    consumerPhone: data.consumer_phone,
    consumerCity: data.consumer_city,
    messages: data.messages || params.messages,
    simulationDuration: data.simulation_duration,
    reviewStatus: data.review_status || 'pending',
  };
}

export async function deleteSession(sessionId: string, userId: string): Promise<void> {
  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from('ketik_history')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId);

  if (error) throw new Error(`Gagal menghapus sesi: ${error.message}`);

  // Dual-delete from results
  try {
    await adminClient.from('results').delete().eq('session_id', sessionId).eq('module', 'ketik');
  } catch (e) {
    console.error(e);
  }
}

export async function clearHistory(userId: string): Promise<void> {
  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from('ketik_history')
    .delete()
    .eq('user_id', userId);

  if (error) throw new Error(`Gagal menghapus riwayat: ${error.message}`);

  // Dual-delete from results
  try {
    await adminClient.from('results').delete().eq('user_id', userId).eq('module', 'ketik');
  } catch (e) {
    console.error(e);
  }
}

export async function getReviewDetail(sessionId: string, userId: string): Promise<KetikReviewDetail | null> {
  const adminClient = createAdminClient();

  const { data: history, error: historyError } = await adminClient
    .from('ketik_history')
    .select('review_status, final_score, empathy_score, probing_score, typo_score, compliance_score')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (historyError || !history || history.review_status !== 'completed') return null;

  const [{ data: reviewData }, { data: typosData }] = await Promise.all([
    adminClient.from('ketik_session_reviews').select('*').eq('session_id', sessionId).maybeSingle(),
    adminClient.from('ketik_typo_findings').select('*').eq('session_id', sessionId),
  ]);

  if (!reviewData) return null;

  const review: KetikSessionReview = {
    id: reviewData.id,
    sessionId: reviewData.session_id,
    aiSummary: reviewData.ai_summary,
    strengths: reviewData.strengths,
    weaknesses: reviewData.weaknesses,
    coachingFocus: reviewData.coaching_focus,
    createdAt: reviewData.created_at,
  };

  const typos: KetikTypoFinding[] = (typosData || []).map((t: any) => ({
    id: t.id,
    sessionId: t.session_id,
    messageId: t.message_id,
    originalWord: t.original_word,
    correctedWord: t.corrected_word,
    severity: t.severity,
    createdAt: t.created_at,
  }));

  return {
    sessionId,
    review,
    typos,
    scores: {
      final: history.final_score,
      empathy: history.empathy_score,
      probing: history.probing_score,
      typo: history.typo_score,
      compliance: history.compliance_score,
    },
  };
}

export async function processOldestQueuedJob(workerId: string = 'daemon-worker'): Promise<any> {
  const adminClient = createAdminClient();
  
  const nowIso = new Date().toISOString();
  
  // Find oldest queued or stale processing job
  const { data: job, error } = await adminClient
    .from('ketik_review_jobs')
    .select('session_id')
    .or(`status.eq.queued,and(status.eq.processing,lease_expires_at.lt.${nowIso})`)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !job) return { status: 'no_jobs' };

  return await claimAndProcessKetikReviewJob(job.session_id, workerId);
}


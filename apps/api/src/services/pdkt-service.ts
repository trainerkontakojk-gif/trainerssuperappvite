import { PdktScenario, PdktConsumerType, PdktIdentity, EmailMessage, PdktSessionConfig } from '@trainers/types';
import { generateGeminiContent } from '../lib/gemini';
import { generateOpenRouterContent } from '../lib/openrouter';
import { resolveModelProvider } from '../lib/ai-models';
import { UsageContext } from '../lib/ai-usage';
import { createAdminClient } from '../lib/supabase';


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

export async function fetchMailboxItems(supabaseClient: any, userId: string) {
  const { data, error } = await supabaseClient
    .from('pdkt_mailbox_items')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'deleted')
    .order('last_activity_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function createMailboxItem(
  supabaseClient: any,
  payload: {
    client_request_id?: string;
    sender_name: string;
    sender_email: string;
    subject: string;
    snippet: string;
    scenario_snapshot?: any;
    config_snapshot?: any;
    inbound_email?: any;
  }
) {
  const { data, error } = await supabaseClient.rpc('submit_pdkt_mailbox_batch', {
    p_client_request_id: payload.client_request_id || null,
    p_sender_name: payload.sender_name,
    p_sender_email: payload.sender_email,
    p_subject: payload.subject,
    p_snippet: payload.snippet,
    p_scenario_snapshot: payload.scenario_snapshot,
    p_config_snapshot: payload.config_snapshot,
    p_inbound_email: payload.inbound_email,
  });

  if (error) throw error;
  return data;
}

export async function softDeleteMailboxItem(supabaseClient: any, id: string, userId: string) {
  const { data, error } = await supabaseClient
    .from('pdkt_mailbox_items')
    .update({ status: 'deleted', deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
  return data;
}

export async function submitMailboxReply(
  supabaseClient: any,
  payload: {
    mailboxId: string;
    reply?: any;
    timeTaken: number;
  }
) {
  const { data: historyId, error } = await supabaseClient.rpc('submit_pdkt_mailbox_reply', {
    p_mailbox_id: payload.mailboxId,
    p_agent_reply: payload.reply,
    p_time_taken: payload.timeTaken,
  });

  if (error) throw error;

  return historyId;
}

export async function processPdktEvaluation(historyId: string, userId: string): Promise<any> {
  const adminClient = createAdminClient();

  const { data: history, error: fetchError } = await adminClient
    .from('pdkt_history')
    .select('*')
    .eq('id', historyId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !history) {
    throw new Error('PDKT History not found');
  }

  if (history.evaluation_status === 'completed' && history.evaluation) {
    return history.evaluation;
  }

  const nowIso = new Date().toISOString();
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: claimed, error: claimError } = await adminClient
    .from('pdkt_history')
    .update({
      evaluation_status: 'processing',
      evaluation_started_at: nowIso,
      evaluation_error: null,
    })
    .eq('id', historyId)
    .eq('user_id', userId)
    .or(`evaluation_started_at.is.null,evaluation_started_at.lt.${staleThreshold}`)
    .neq('evaluation_status', 'completed')
    .select('id');

  if (claimError) {
    throw new Error('Failed to claim evaluation');
  }

  if (!claimed || claimed.length === 0) {
    const { data: current } = await adminClient
      .from('pdkt_history')
      .select('evaluation_status, evaluation')
      .eq('id', historyId)
      .eq('user_id', userId)
      .maybeSingle();

    if (current?.evaluation_status === 'completed') {
      if (current.evaluation) return current.evaluation;
      throw new Error('Evaluation marked completed but no results found');
    }

    throw new Error('Evaluation is already in progress');
  }

  try {
    const config = history.config;
    const emails = history.emails;

    const result = await evaluateAgentResponse(
      config,
      emails,
      { module: 'pdkt', action: 'async_evaluate_agent_response' },
      userId
    );

    if (!result.success) {
      throw new Error(result.error || 'Evaluation failed without message');
    }

    const evaluationData = {
      score: result.score,
      feedback: result.feedback,
      typos: result.typos,
      clarityIssues: result.clarityIssues,
      contentGaps: result.contentGaps,
    };

    const { data: saved, error: updateEndError } = await adminClient
      .from('pdkt_history')
      .update({
        evaluation: evaluationData,
        evaluation_status: 'completed',
        evaluation_completed_at: new Date().toISOString(),
      })
      .eq('id', historyId)
      .eq('evaluation_started_at', nowIso)
      .select('id');

    if (updateEndError) {
      throw new Error('Failed to save evaluation results');
    }

    if (!saved || saved.length === 0) {
      console.warn(`[processPdktEvaluation] Lease lost before save for history: ${historyId}`);
      return evaluationData;
    }

    return evaluationData;
  } catch (err: any) {
    console.error(`[PDKT] Error evaluating history ${historyId}:`, err);
    await adminClient
      .from('pdkt_history')
      .update({
        evaluation_status: 'failed',
        evaluation_error: err?.message || String(err),
        evaluation_completed_at: new Date().toISOString(),
      })
      .eq('id', historyId)
      .eq('evaluation_started_at', nowIso);

    throw err;
  }
}


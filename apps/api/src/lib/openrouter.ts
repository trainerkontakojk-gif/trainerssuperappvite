import { randomUUID } from 'crypto';
import { getProviderFromModelId } from './ai-models';
import { logAiUsage, UsageContext } from './ai-usage';

export interface OpenRouterResponse {
  success: boolean;
  text?: string;
  error?: string;
}

export async function generateOpenRouterContent(options: {
  model?: string;
  systemInstruction?: string;
  contents: { role: string; parts: { text: string }[] }[];
  temperature?: number;
  responseMimeType?: string;
  usageContext?: UsageContext;
  userId?: string;
}): Promise<OpenRouterResponse> {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const modelId = options.model || 'openai/gpt-oss-120b:free';
    if (!apiKey) return { success: false, error: 'OPENROUTER_API_KEY is not set.' };

    const messages: { role: string; content: string }[] = [];
    let systemMsg = options.systemInstruction || '';
    if (options.responseMimeType === 'application/json') {
      systemMsg += '\n\nIMPORTANT: Respond in valid JSON format only.';
    }
    if (systemMsg) messages.push({ role: 'system', content: systemMsg });

    for (const content of options.contents) {
      const role = content.role === 'model' ? 'assistant' : 'user';
      messages.push({ role, content: content.parts.map(p => p.text).join(' ') });
    }

    const maxAttempts = 4;
    let lastResponse: Response | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      lastResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.VITE_APP_URL || 'http://localhost:3000',
          'X-Title': 'Trainers Superapp',
        },
        body: JSON.stringify({
          model: modelId,
          messages,
          temperature: options.temperature ?? 0.7,
          response_format:
            options.responseMimeType === 'application/json' && !modelId.includes(':free')
              ? { type: 'json_object' }
              : undefined,
        }),
      });
      if (lastResponse.ok) break;
      if (lastResponse.status === 429 && attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2500 + attempt * 1500));
        continue;
      }
      break;
    }

    if (!lastResponse?.ok) {
      const status = lastResponse?.status || 500;
      const errorText = lastResponse ? await lastResponse.text() : 'No response';
      if (status === 429) return { success: false, error: 'Server AI sedang sibuk. Coba lagi.' };
      if (status === 401) return { success: false, error: 'API Key OpenRouter tidak valid.' };
      try {
        const errJson = JSON.parse(errorText);
        return { success: false, error: errJson.error?.message || `AI Error (${status})` };
      } catch {
        return { success: false, error: `Gagal menghubungi server AI (Error ${status}).` };
      }
    }

    const data = await lastResponse.json();
    if (data.error) return { success: false, error: data.error.message || 'Model tidak tersedia.' };

    const text = data.choices?.[0]?.message?.content || '';

    if (options.usageContext && options.userId) {
      const usage = data.usage;
      if (usage) {
        const inputTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0;
        const outputTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0;
        const totalTokens = typeof usage.total_tokens === 'number' ? usage.total_tokens : inputTokens + outputTokens;

        if (inputTokens > 0 || outputTokens > 0) {
          await logAiUsage({
            requestId: `openrouter-${randomUUID()}`,
            userId: options.userId,
            provider: getProviderFromModelId(modelId) as 'gemini' | 'openrouter',
            modelId,
            usageContext: options.usageContext,
            tokens: { inputTokens, outputTokens, totalTokens },
          });
        }
      }
    }

    return { success: true, text };
  } catch (error) {
    console.error('[OpenRouter] Error:', error);
    return { success: false, error: 'Terjadi kesalahan koneksi ke server AI.' };
  }
}

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { User } from '@supabase/supabase-js';
import { generateEmailSchema, evaluateSchema, pdktMailboxBatchSchema, pdktMailboxReplySchema } from '@trainers/types';
import type { PdktSessionConfig } from '@trainers/types';
import * as pdktService from '../services/pdkt-service';
import { authMiddleware } from '../middleware/auth';
import { createUserClient, createAdminClient } from '../lib/supabase';

type Variables = { user: User; profile: any };

const pdkt = new Hono<{ Variables: Variables }>();
pdkt.use('*', authMiddleware);

pdkt.get('/scenarios', (c) => {
  return c.json({ success: true, data: pdktService.getScenarios() });
});

pdkt.get('/consumer-types', (c) => {
  return c.json({ success: true, data: pdktService.getConsumerTypes() });
});

pdkt.post('/generate-identity', (c) => {
  return c.json({ success: true, data: pdktService.generateRandomIdentity() });
});

pdkt.post('/generate-template', zValidator('json', generateEmailSchema), async (c) => {
  const body = c.req.valid('json');
  const user = c.get('user');
  const userId = user?.id;

  const scenarios = pdktService.getScenarios();
  const consumerTypes = pdktService.getConsumerTypes();
  const scenario = body.scenarioId 
    ? scenarios.find(s => s.id === body.scenarioId)
    : body.scenarioDraft;
  const consumerType = consumerTypes.find(ct => ct.id === body.consumerTypeId);

  if (!scenario || !consumerType) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Scenario atau consumer type tidak ditemukan.' } }, 404);
  }

  const result = await pdktService.generateScenarioEmailTemplate(
    scenario, consumerType, body.identity,
    { module: 'pdkt', action: 'generate_email_template' }, userId,
  );

  if (!result.success) {
    return c.json({ success: false, error: { code: 'AI_ERROR', message: result.error || 'Gagal generate template.' } }, 502);
  }

  return c.json({ success: true, data: { subject: result.subject, body: result.body } });
});

pdkt.post('/evaluate', zValidator('json', evaluateSchema), async (c) => {
  const body = c.req.valid('json');
  const user = c.get('user');
  const userId = user?.id;

  const config: PdktSessionConfig = {
    scenarios: body.config.scenarios,
    consumerType: body.config.consumerType,
    identity: body.config.identity,
    selectedModel: body.config.selectedModel,
    resolvedConsumerNameMentionPattern: body.config.resolvedConsumerNameMentionPattern as PdktSessionConfig['resolvedConsumerNameMentionPattern'],
    writingStyleMode: body.config.writingStyleMode as PdktSessionConfig['writingStyleMode'],
  };

  const result = await pdktService.evaluateAgentResponse(
    config, body.emails,
    { module: 'pdkt', action: 'evaluate_agent_response' }, userId,
  );

  if (!result.success) {
    return c.json({ success: false, error: { code: 'AI_ERROR', message: result.error || 'Gagal evaluasi.' } }, 502);
  }

  return c.json({
    success: true,
    data: { score: result.score, feedback: result.feedback, typos: result.typos, clarityIssues: result.clarityIssues, contentGaps: result.contentGaps },
  });
});

pdkt.get('/mailbox', async (c) => {
  const user = c.get('user');
  const authHeader = c.req.header('Authorization');
  const token = authHeader!.split(' ')[1];
  const userClient = createUserClient(token);

  try {
    const data = await pdktService.fetchMailboxItems(userClient, user.id);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: error?.message || 'Database error.' } }, 500);
  }
});

pdkt.post('/mailbox/batch', zValidator('json', pdktMailboxBatchSchema), async (c) => {
  const body = c.req.valid('json');
  const authHeader = c.req.header('Authorization');
  const token = authHeader!.split(' ')[1];
  const userClient = createUserClient(token);

  try {
    const data = await pdktService.createMailboxItem(userClient, body);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: error?.message || 'Database error.' } }, 500);
  }
});

pdkt.delete('/mailbox/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const authHeader = c.req.header('Authorization');
  const token = authHeader!.split(' ')[1];
  const userClient = createUserClient(token);

  try {
    await pdktService.softDeleteMailboxItem(userClient, id, user.id);
    return c.json({ success: true, message: 'Mailbox item deleted.' });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: error?.message || 'Database error.' } }, 500);
  }
});

pdkt.post('/mailbox/reply', zValidator('json', pdktMailboxReplySchema), async (c) => {
  const body = c.req.valid('json');
  const user = c.get('user');
  const authHeader = c.req.header('Authorization');
  const token = authHeader!.split(' ')[1];
  const userClient = createUserClient(token);

  try {
    const historyId = await pdktService.submitMailboxReply(userClient, body);

    // Process evaluation in background
    const evalPromise = pdktService.processPdktEvaluation(historyId, user.id);
    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(evalPromise);
    } else {
      evalPromise.catch((err) => console.error('[PDKT Async Eval Error]', err));
    }

    return c.json({ success: true, data: { historyId } });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: error?.message || 'Database error.' } }, 500);
  }
});

pdkt.get('/history/eval/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const authHeader = c.req.header('Authorization');
  const token = authHeader!.split(' ')[1];
  const userClient = createUserClient(token);

  try {
    const { data, error } = await userClient
      .from('pdkt_history')
      .select('evaluation_status, evaluation, evaluation_error')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'History not found or access denied.' } }, 404);
    }

    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: error?.message || 'Database error.' } }, 500);
  }
});

pdkt.post('/history/retry-eval', async (c) => {
  try {
    const body = await c.req.json();
    const historyId = body.historyId;
    if (!historyId) {
      return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'historyId is required' } }, 400);
    }

    const user = c.get('user');
    const authHeader = c.req.header('Authorization');
    const token = authHeader!.split(' ')[1];
    const userClient = createUserClient(token);

    // Verify ownership
    const { data, error } = await userClient
      .from('pdkt_history')
      .select('id')
      .eq('id', historyId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || !data) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'History item not found or access denied.' } }, 404);
    }

    const evalPromise = pdktService.processPdktEvaluation(historyId, user.id);
    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(evalPromise);
    } else {
      evalPromise.catch((err) => console.error('[PDKT Async Eval Retry Error]', err));
    }

    return c.json({ success: true, message: 'Evaluation retrying.' });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: error?.message || 'Database error.' } }, 500);
  }
});

pdkt.get('/settings', async (c) => {
  const user = c.get('user');
  const authHeader = c.req.header('Authorization');
  const token = authHeader!.split(' ')[1];
  const userClient = createUserClient(token);

  try {
    const { data, error } = await userClient
      .from('user_settings')
      .select('settings')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;

    return c.json({ success: true, settings: data?.settings || null });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: error?.message || 'Database error.' } }, 500);
  }
});

pdkt.post('/settings', async (c) => {
  const user = c.get('user');
  const authHeader = c.req.header('Authorization');
  const token = authHeader!.split(' ')[1];
  const userClient = createUserClient(token);
  const body = await c.req.json();

  try {
    const { data, error } = await userClient
      .from('user_settings')
      .upsert({
        user_id: user.id,
        settings: body.settings,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;

    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: error?.message || 'Database error.' } }, 500);
  }
});

pdkt.get('/history', async (c) => {
  const user = c.get('user');
  const authHeader = c.req.header('Authorization');
  const token = authHeader!.split(' ')[1];
  const userClient = createUserClient(token);

  try {
    const { data, error } = await userClient
      .from('pdkt_history')
      .select('*')
      .eq('user_id', user.id)
      .order('timestamp', { ascending: false });

    if (error) throw error;

    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: error?.message || 'Database error.' } }, 500);
  }
});

pdkt.delete('/history', async (c) => {
  const user = c.get('user');
  const adminClient = createAdminClient();

  try {
    const { error } = await adminClient
      .from('pdkt_history')
      .delete()
      .eq('user_id', user.id);

    if (error) throw error;

    return c.json({ success: true, message: 'All PDKT history deleted.' });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: error?.message || 'Database error.' } }, 500);
  }
});

pdkt.delete('/history/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const adminClient = createAdminClient();

  try {
    const { error } = await adminClient
      .from('pdkt_history')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;

    return c.json({ success: true, message: 'PDKT history item deleted.' });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: error?.message || 'Database error.' } }, 500);
  }
});

export { pdkt };


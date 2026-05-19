import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { User } from '@supabase/supabase-js';
import { generateEmailSchema, evaluateSchema } from '@trainers/types';
import type { PdktSessionConfig } from '@trainers/types';
import * as pdktService from '../services/pdkt-service';
import { authMiddleware } from '../middleware/auth';

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
  const scenario = scenarios.find(s => s.id === body.scenarioId);
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

export { pdkt };

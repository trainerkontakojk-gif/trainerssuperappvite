import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { User } from '@supabase/supabase-js';
import { generateMessageSchema } from '@trainers/types';
import * as ketikService from '../services/ketik-service';
import { authMiddleware } from '../middleware/auth';

type Variables = { user: User; profile: any };

const ketik = new Hono<{ Variables: Variables }>();
ketik.use('*', authMiddleware);

ketik.get('/scenarios', (c) => {
  return c.json({ success: true, data: ketikService.getScenarios() });
});

ketik.get('/consumer-types', (c) => {
  return c.json({ success: true, data: ketikService.getConsumerTypes() });
});

ketik.post('/generate', zValidator('json', generateMessageSchema), async (c) => {
  const body = c.req.valid('json');
  const user = c.get('user');
  const userId = user?.id;

  const scenarios = ketikService.getScenarios();
  const consumerTypes = ketikService.getConsumerTypes();
  const scenario = scenarios.find(s => s.id === body.scenarioId);
  const consumerType = consumerTypes.find(ct => ct.id === body.consumerTypeId);

  if (!scenario || !consumerType) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Scenario atau consumer type tidak ditemukan.' } }, 404);
  }

  const result = await ketikService.generateConsumerResponse(
    { scenarios: [scenario], consumerType, identity: body.identity, selectedModel: body.selectedModel, simulationDuration: body.simulationDuration, responsePacingMode: body.responsePacingMode },
    scenario,
    body.chatHistory,
    { module: 'ketik', action: 'generate_consumer_response' },
    userId,
  );

  if (!result.success) {
    return c.json({ success: false, error: { code: 'AI_ERROR', message: result.error || 'Gagal generate response.' } }, 502);
  }

  return c.json({ success: true, data: { text: result.text } });
});

export { ketik };

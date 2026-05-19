import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ApiResponse, UserProfile } from '@trainers/types';

const app = new Hono().basePath('/api');

app.use('*', cors());

const routes = app
  .get('/health', (c) => c.json({ status: 'ok' }))
  .get('/auth/me', (c) => {
    // Placeholder for auth logic
    return c.json<ApiResponse<UserProfile>>({
      success: true,
      data: {
        id: '1',
        email: 'test@example.com',
        full_name: 'Test User',
        role: 'admin'
      }
    });
  });

export type AppType = typeof routes;
export default app;

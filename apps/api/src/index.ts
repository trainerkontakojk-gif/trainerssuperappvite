import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ApiResponse, UserProfile } from '@trainers/types';
import { authMiddleware } from './middleware/auth';

const app = new Hono().basePath('/api');

app.use('*', cors());

const routes = app
  .get('/health', (c) => c.json({ status: 'ok' }))
  .get('/auth/me', (c) => {
    return c.json<ApiResponse<UserProfile>>({
      success: true,
      data: {
        id: '1',
        email: 'test@example.com',
        full_name: 'Test User',
        role: 'admin'
      }
    });
  })
  .use('/v1/*', authMiddleware)
  .get('/v1/me', (c) => {
    const user = c.get('user');
    const profile = c.get('profile');
    return c.json({ success: true, data: { user, profile } });
  });

export type AppType = typeof routes;
export default app;

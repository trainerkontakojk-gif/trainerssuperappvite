import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ApiResponse, UserProfile } from '@trainers/types';
import { authMiddleware } from './middleware/auth';

const app = new Hono().basePath('/api');

app.use('*', cors());

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// Auth me - legacy/public placeholder
app.get('/auth/me', (c) => {
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

// Protected API v1 routes
const routes = app.basePath('/api/v1');

routes.use('*', authMiddleware);

routes.get('/me', (c) => {
  const user = c.get('user');
  const profile = c.get('profile');
  return c.json({ success: true, data: { user, profile } });
});

export type AppType = typeof routes;
export default app;

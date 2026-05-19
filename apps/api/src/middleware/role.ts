import { Context, Next } from 'hono';

export function requireRole(...roles: string[]) {
  return async (c: Context, next: Next) => {
    const profile = c.get('profile') as { role?: string } | undefined;
    if (!profile || !roles.includes(profile.role ?? '')) {
      return c.json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Anda tidak memiliki akses ke resource ini.' },
      }, 403);
    }
    await next();
  };
}

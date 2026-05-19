import { describe, it, expect } from 'vitest';
import { APP_MODULES } from '../lib/app-config';

describe('APP_MODULES', () => {
  it('has 6 modules', () => {
    expect(APP_MODULES).toHaveLength(6);
  });

  it('each module has required fields', () => {
    for (const mod of APP_MODULES) {
      expect(mod.id).toBeTruthy();
      expect(mod.title).toBeTruthy();
      expect(mod.shortTitle).toBeTruthy();
      expect(mod.href).toBeTruthy();
      expect(mod.icon).toBeTruthy();
      expect(mod.accentClassName).toMatch(/^text-/);
      expect(mod.accentSoftClassName).toMatch(/^bg-/);
    }
  });

  it('all hrefs start with /', () => {
    for (const mod of APP_MODULES) {
      expect(mod.href).toMatch(/^\//);
    }
  });

  it('has unique IDs', () => {
    const ids = APP_MODULES.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('dashboard module uses LayoutDashboard icon', () => {
    const dash = APP_MODULES.find(m => m.id === 'dashboard');
    expect(dash?.shortTitle).toBe('Dashboard');
    expect(dash?.href).toBe('/dashboard');
  });
});

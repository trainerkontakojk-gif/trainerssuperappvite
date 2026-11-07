# Phase 2: Auth & Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Supabase Auth integration, Hono auth middleware with status checks, and the Vite dashboard layout.

**Architecture:** Middleware Auth (Approach A). Hono verifies JWT and profile status. Vite uses TanStack Router guards and a dashboard shell. Refer to `context7` for latest documentation on TanStack Router and Supabase Auth.

**Tech Stack:** Hono, Vite, Supabase JS, TanStack Router, Zustand, Lucide React.

---

### Task 1: Backend Auth Middleware (`apps/api`)

**Files:**
- Create: `apps/api/src/middleware/auth.ts`
- Modify: `apps/api/src/index.ts`
- Create: `apps/api/src/lib/supabase.ts`

- [ ] **Step 1: Create Supabase admin client helper**
```typescript
// apps/api/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
```

- [ ] **Step 2: Create auth middleware with status check**
```typescript
// apps/api/src/middleware/auth.ts
import { Context, Next } from 'hono';
import { supabaseAdmin } from '../lib/supabase';

export const authMiddleware = async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return c.json({ success: false, error: 'Invalid token' }, 401);
  }

  // Fetch profile status
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('status, role, full_name')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'active') {
    return c.json({ 
      success: false, 
      error: 'Account pending approval', 
      code: 'ACCOUNT_PENDING' 
    }, 403);
  }

  c.set('user', user);
  c.set('profile', profile);
  await next();
};
```

- [ ] **Step 3: Apply middleware to protected routes**
```typescript
// apps/api/src/index.ts (Snippet)
import { authMiddleware } from './middleware/auth';
// ...
const protectedRoutes = app.basePath('/api/v1')
  .use('*', authMiddleware)
  .get('/me', (c) => {
    const user = c.get('user');
    const profile = c.get('profile');
    return c.json({ success: true, data: { user, profile } });
  });
```

---

### Task 2: Frontend Auth Store & Supabase Client (`apps/web`)

**Files:**
- Create: `apps/web/src/lib/supabase.ts`
- Create: `apps/web/src/store/authStore.ts`

- [ ] **Step 1: Create Supabase browser client**
```typescript
// apps/web/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

- [ ] **Step 2: Create Zustand auth store**
```typescript
// apps/web/src/store/authStore.ts
import { create } from 'zustand';
import { UserProfile } from '@trainers/types';

interface AuthState {
  session: any | null;
  profile: UserProfile | null;
  setSession: (session: any) => void;
  setProfile: (profile: UserProfile | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
}));
```

---

### Task 3: App Shell & Routing (`apps/web`)

**Files:**
- Create: `apps/web/src/components/Layout.tsx`
- Create: `apps/web/src/routes/__root.tsx`
- Create: `apps/web/src/routes/index.tsx`
- Create: `apps/web/src/routes/dashboard.tsx`

- [ ] **Step 1: Create Dashboard Layout component with Sidebar**
```tsx
// apps/web/src/components/Layout.tsx
import { Link, Outlet } from '@tanstack/react-router';
import { LayoutDashboard, MessageSquare, Phone, Settings } from 'lucide-react';

export function DashboardLayout() {
  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r flex flex-col">
        <div className="p-6 font-bold text-xl text-primary">Trainers App</div>
        <nav className="flex-1 p-4 space-y-2">
          <Link to="/dashboard" className="flex items-center gap-3 p-2 rounded hover:bg-gray-100">
            <LayoutDashboard size={20} /> Dashboard
          </Link>
          <Link to="/sidak" className="flex items-center gap-3 p-2 rounded hover:bg-gray-100">
            <MessageSquare size={20} /> SIDAK
          </Link>
        </nav>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b flex items-center justify-end px-8">
          <div className="flex items-center gap-4">
             <span className="text-sm font-medium">User Name</span>
             <div className="w-8 h-8 rounded-full bg-primary/10" />
          </div>
        </header>
        <section className="flex-1 overflow-auto p-8">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Setup TanStack Router root with Auth Guard**
```tsx
// apps/web/src/routes/__root.tsx
import { createRootRoute, Outlet, redirect } from '@tanstack/react-router';
import { useAuthStore } from '../store/authStore';

export const Route = createRootRoute({
  beforeLoad: ({ location }) => {
    // Basic redirect for now, will refine with session check
    const hasSession = !!useAuthStore.getState().session;
    if (!hasSession && location.pathname !== '/login') {
      // throw redirect({ to: '/login' });
    }
  },
  component: () => <Outlet />,
});
```

---

### Task 4: UI Refinement & Dependencies

- [ ] **Step 1: Install required dependencies in apps/web**
Run: `pnpm add @tanstack/react-router zustand lucide-react @supabase/supabase-js` in `apps/web`.

- [ ] **Step 2: Commit all changes**
```bash
git add .
git commit -m "feat: implement auth middleware and basic dashboard layout"
```

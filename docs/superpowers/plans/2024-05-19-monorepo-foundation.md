# Trainers SuperApp Monorepo Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize a Turborepo monorepo with pnpm workspaces, scaffolding the Hono API and Vite Web apps with shared type safety.

**Architecture:** Monorepo using Turborepo for orchestration and pnpm for workspace management. Hono (backend) and Vite (frontend) will communicate via Hono RPC using a shared types package.

**Tech Stack:** Turborepo, pnpm, Hono, Vite, React, TypeScript.

---

### Task 1: Root Monorepo Setup

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "trainers-superapp",
  "private": true,
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "turbo lint",
    "format": "prettier --write \"**/*.{ts,tsx,md}\""
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "prettier": "^3.0.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^lint"]
    }
  }
}
```

- [ ] **Step 4: Verify structure**

Run: `ls -F`
Expected: `apps/`, `packages/`, `package.json`, `pnpm-workspace.yaml`, `turbo.json` visible.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json
git commit -m "chore: initialize monorepo foundation"
```

---

### Task 2: Shared Types Package Setup

**Files:**
- Create: `packages/types/package.json`
- Create: `packages/types/src/index.ts`
- Create: `packages/types/tsconfig.json`

- [ ] **Step 1: Create packages/types/package.json**

```json
{
  "name": "@trainers/types",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create initial types**

```typescript
export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'trainer' | 'leader' | 'agent';
}

export type ApiResponse<T> = 
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: any } };
```

- [ ] **Step 3: Commit**

```bash
git add packages/types
git commit -m "feat: add shared types package"
```

---

### Task 3: Hono API Scaffolding (`apps/api`)

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/tsconfig.json`

- [ ] **Step 1: Create apps/api/package.json**

```json
{
  "name": "@trainers/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "hono": "^4.0.0",
    "@trainers/types": "workspace:*",
    "@supabase/supabase-js": "^2.0.0",
    "zod": "^3.0.0"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 2: Create base Hono server with RPC export**

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add apps/api
git commit -m "feat: scaffold hono api with rpc export"
```

---

### Task 4: Vite Web Scaffolding (`apps/web`)

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/src/main.tsx`

- [ ] **Step 1: Create apps/web/package.json**

```json
{
  "name": "@trainers/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@trainers/api": "workspace:*",
    "@trainers/types": "workspace:*",
    "hono": "^4.0.0",
    "@tanstack/react-query": "^5.0.0",
    "lucide-react": "^0.475.0"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.0.0",
    "postcss": "^8.0.0",
    "tailwindcss": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create basic Vite entry with Hono Client test**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { hc } from 'hono/client';
import type { AppType } from '@trainers/api';

const client = hc<AppType>('http://localhost:3001');

function App() {
  const [data, setData] = React.useState<any>(null);

  React.useEffect(() => {
    client.api.health.$get().then(res => res.json()).then(setData);
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Trainers SuperApp</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 3: Commit**

```bash
git add apps/web
git commit -m "feat: scaffold vite web with hono rpc client"
```

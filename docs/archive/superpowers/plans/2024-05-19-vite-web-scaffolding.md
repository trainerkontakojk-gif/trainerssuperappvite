# Vite Web Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Vite frontend in `apps/web` with Hono RPC client integration.

**Architecture:** Monorepo frontend application using Vite, React, and TailwindCSS, depending on workspace packages `@trainers/api` and `@trainers/types`.

**Tech Stack:** React 19, Vite 6, TypeScript, TailwindCSS, Hono Client.

---

### Task 1: Create apps/web/package.json

**Files:**
- Create: `apps/web/package.json`

- [ ] **Step 1: Write apps/web/package.json**

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

### Task 2: Create apps/web/vite.config.ts

**Files:**
- Create: `apps/web/vite.config.ts`

- [ ] **Step 1: Write apps/web/vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
  },
});
```

### Task 3: Create apps/web/src/main.tsx

**Files:**
- Create: `apps/web/src/main.tsx`

- [ ] **Step 1: Create directory apps/web/src**

Run: `mkdir -p apps/web/src`

- [ ] **Step 2: Write apps/web/src/main.tsx**

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

### Task 4: Create apps/web/index.html

**Files:**
- Create: `apps/web/index.html`

- [ ] **Step 1: Write apps/web/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Trainers SuperApp</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### Task 5: Create TypeScript Configuration

**Files:**
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tsconfig.node.json`

- [ ] **Step 1: Write apps/web/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": false,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 2: Write apps/web/tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

### Task 6: Commit changes

- [ ] **Step 1: Commit**

Run: `git add apps/web && git commit -m "feat: scaffold vite web with hono rpc client"`

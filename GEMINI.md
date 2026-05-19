# Trainers SuperApp Rebuild - Gemini CLI Instructions

This project is a complete rebuild of the Trainers SuperApp, transitioning from a legacy Next.js codebase to a modern, lightweight Turborepo monorepo.

## Project Overview

- **Architecture:** Turborepo Monorepo with `pnpm` workspaces.
- **Backend (`apps/api`):** Hono + TypeScript. Serves as the central logic hub.
- **Frontend (`apps/web`):** Vite + React + TypeScript + TanStack Router/Query.
- **Real-time (`apps/telefun`):** Dedicated WebSocket service for persistent voice/chat simulations.
- **Database/Auth:** Supabase Postgres & Auth.
- **Type Safety:** Hono RPC provides end-to-end type safety between Backend and Frontend.

## Building and Running

This project uses `pnpm` and `turbo`.

- **Install Dependencies:** `pnpm install`
- **Development Mode:** `pnpm dev` (Runs all apps in parallel)
- **Build All:** `pnpm build`
- **Lint All:** `pnpm lint`
- **Format Code:** `pnpm format`

## Development Conventions

### 1. Monorepo Structure
- **Tooling:** Use `context7` MCP for documentation lookup and code search before executing tasks.
- `apps/api`: All business logic, AI integrations, and database mutations.
- `apps/web`: Lean UI, consumes the Hono API.
- `packages/types`: Shared Zod schemas and TypeScript interfaces.
- `reference-repo/`: The legacy Next.js project (READ-ONLY) used for business logic reference.

### 2. Backend-First Logic
- **NEVER** query Supabase directly from the frontend for sensitive data (SIDAK, AI Usage, Reports).
- **ALWAYS** route through Hono. Hono validates the Supabase JWT and enforces permissions.
- Use the **Hybrid Supabase Client** pattern:
  - Default: Use user's JWT to respect RLS.
  - Service Role: Only for background jobs, AI usage logging, and complex reporting aggregations.

### 3. Type Safety (Hono RPC)
- Define routes in `apps/api/src/index.ts` (or modular routes).
- Export `AppType` from the API.
- Consume via `hc<AppType>` in the Web app for full auto-completion and type checking.

### 4. AI & Usage
- All AI calls (Gemini/OpenRouter) must be logged via the backend to the `ai_usage_logs` table.
- Use `packages/types` to ensure consistent logging formats.

### 5. Reference Auditing
- Before implementing a feature, audit the corresponding logic in `reference-repo/app/(main)/...`.
- Do not copy-paste. Extract the business logic and reimplement it cleanly in the new stack.

### 6. Always Use Context7 for Documentation
- **MANDATORY:** Always use the `context7` MCP tool to fetch the latest documentation for Supabase, Hono, TanStack, and other libraries before writing code.
- This ensures usage of current APIs and avoids hallucinating deprecated patterns from old training data.

## Key Documentation
- `prd.md`: Original project requirements.
- `docs/superpowers/specs/`: Detailed architecture and design specs.
- `docs/superpowers/plans/`: Step-by-step implementation plans.

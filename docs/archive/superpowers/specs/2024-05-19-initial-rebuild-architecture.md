# Design Spec: Trainers SuperApp Rebuild (Clean Monorepo)

**Date:** 2024-05-19  
**Topic:** Initial Rebuild Architecture  
**Status:** Approved (Approach 1: PRD Strict)

## 1. Goal
Rebuild the Trainers SuperApp using a modern, lightweight, and type-safe monorepo stack, migrating logic from the legacy Next.js codebase to a dedicated Hono backend and Vite frontend.

## 2. Architecture Overview
- **Orchestration:** Turborepo with `pnpm` workspaces.
- **Frontend (`apps/web`):** 
  - Framework: Vite + React + TypeScript.
  - Routing: TanStack Router.
  - Data Fetching: TanStack Query + Hono RPC Client.
  - UI: Tailwind CSS + shadcn/ui.
- **Backend (`apps/api`):**
  - Framework: Hono + TypeScript.
  - Database: Supabase (Hybrid Auth: User JWT + Service Role).
  - Logic: All sensitive business logic, AI usage logging, and Excel processing.
- **Real-time (`apps/telefun`):**
  - Specialized service for persistent WebSockets.

## 3. Core Decisions
1. **Hono RPC:** Export `AppType` from `apps/api` for end-to-end type safety in `apps/web`.
2. **Hybrid Supabase Client:** 
   - Requests use User JWT by default to respect RLS.
   - Admin Client (Service Role) used for AI logging, reports, and restricted operations.
3. **Environment Variables:**
   - Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
   - Backend: `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`.
4. **Git Policy:** `.env.local` and `reference-repo` are ignored.

## 4. Phase 1 Scope (Foundation)
- Initialize monorepo structure.
- Configure `pnpm-workspace.yaml` and `turbo.json`.
- Scaffold `apps/web` and `apps/api`.
- Implement basic Auth Middleware in Hono.

## 5. Risk Mitigation
- **Data Integrity:** Reference the `reference-repo` migrations carefully to avoid schema mismatches.
- **Auth Handshake:** Ensure Hono correctly validates Supabase JWTs before processing requests.

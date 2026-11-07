# Design Spec: Auth & Layout Integration (Phase 2)

**Date:** 2024-05-19  
**Topic:** Auth Handshake and App Shell  
**Status:** Approved (Approach A: Middleware Auth + Approval Flow)

## 1. Goal
Implement a secure authentication handshake between Vite and Hono using Supabase Auth, maintaining the legacy "Pending -> Approved" user status flow, and establishing the main application layout shell.

## 2. Technical Design

### A. Backend Gatekeeper (Hono API)
- **Middleware:** `authMiddleware.ts` will intercept requests to protected `/api/*` routes.
- **JWT Verification:** Use `@supabase/supabase-js` to verify the `Authorization: Bearer <JWT>` header.
- **Profile Authorization:** 
  - After JWT verification, fetch the user's row from the `profiles` table.
  - **Status Check:** If `status !== 'active'`, return `403 Forbidden` with a specific error code (`ACCOUNT_PENDING` or `ACCOUNT_REJECTED`).
  - **Context Injection:** Set `user` and `profile` in Hono context (`c.set`) for use in route handlers.

### B. Frontend App Shell (Vite Web)
- **Routing:** TanStack Router with a protected `__root` layout.
- **Auth Store:** Zustand store to manage `session`, `user`, and `profile` state.
- **Route Guards:** `beforeLoad` in protected routes will check the Zustand store. Redirect to `/login` if no session exists.
- **Layout Components:**
  - **Sidebar:** Navigation links for SIDAK, KETIK, PDKT, Telefun, and Settings.
  - **TopBar:** Displays current user identity and account status indicator.
  - **MainContent:** Scrollable area for nested routes.

## 3. Core Logic (Auth Handshake)
1. User logs in via Supabase Auth on the client (`apps/web`).
2. Vite stores the session/JWT.
3. Every call to the Hono API (`apps/api`) includes the JWT in the headers.
4. Hono verifies the JWT and checks the `profiles` table.
5. If the user is `pending`, the UI displays a "Waiting for Approval" screen and the API blocks sensitive data.

## 4. Dependencies to Add
- **apps/api:** `@supabase/supabase-js` (already in Task 3, but now utilized).
- **apps/web:** `@tanstack/react-router`, `zustand`, `lucide-react`, `@supabase/supabase-js`.

## 5. Verification Plan
- **Backend:** Test `/api/auth/me` with:
  - No token (Expect 401).
  - Invalid token (Expect 401).
  - Valid token but `pending` status (Expect 403).
  - Valid token and `active` status (Expect 200).
- **Frontend:** Verify that navigating to `/dashboard` redirects to `/login` when logged out.

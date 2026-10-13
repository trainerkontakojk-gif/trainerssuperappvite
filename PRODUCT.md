# Trainers SuperApp — Product Definition

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Trainers SuperApp is an internal operational workspace for trainers, QA, leaders, admins, and agents. It combines communication training, quality analysis, participant/profile management, access control, monitoring, and AI-assisted feedback.

- **Trainer, QA, and Admin** configure scenarios, review outcomes, manage users and standards, and operate quality workflows.
- **Leader** inspects only approved team or participant scope and follows up on quality or coaching needs.
- **Agent** uses permitted simulation surfaces to practice communication and review feedback.

Users work in focused contexts: reading operational data, running simulations, checking scores or feedback, approving access, or responding to simulated customer interactions. The interface must surface status, scope, and next action without hiding critical context.

## Product Purpose

Trainers SuperApp consolidates the following operational surfaces:

- **KETIK** — chat communication simulation with review and educational feedback.
- **PDKT** — email communication simulation with a durable mailbox, scenario management, and evaluation.
- **Telefun** — voice communication simulation using Gemini Live. OpenAI Realtime Telefun is retired; historical records remain readable and limited cleanup remains available for old sessions.
- **KTP / Profiler** — participant, team, import, export, and profile management.
- **SIDAK** — quality audit input, scoring, ranking, forecast, agent analysis, and reports.
- **Dashboard, Monitoring, and Admin** — operational summaries, simulation history, AI usage/pricing visibility, user management, access approval, groups, and activity logs.

Success means users can understand module state, complete the next task, and trust the displayed score, access scope, or AI feedback without needing technical help. The product should feel like a precise working tool rather than a showcase.

The runtime and module contracts are maintained in [`docs/architecture.md`](docs/architecture.md) and [`docs/modules.md`](docs/modules.md). Visual rules are maintained in [`docs/design.md`](docs/design.md).

## Positioning

Trainers SuperApp keeps practice and real quality evidence in one place for the same agents:

- **Practice and audit together.** Communication simulations (KETIK, PDKT, Telefun) and real QA audit data (SIDAK) live in one workspace, so a QA finding can lead straight to targeted practice or a training-needs plan.
- **AI consumer roleplay.** AI plays an OJK consumer in Indonesian across chat, email, and voice, with automatic evaluation of the agent's response.
- **Trustworthy scores and scope.** SIDAK scoring rules and leader team scope are enforced in the backend, so displayed numbers and data coverage can be trusted.
- **Replaces manual recaps.** It replaces spreadsheet and per-team folder recaps for finding input, ranking, and reports.

## Operating Context

- Internal tool for the trainer and QA team of the Kontak OJK 157 consumer service contact center.
- Agents are trained and audited per service channel: Call, Chat (WhatsApp), Email, CSO, Pencatatan, BKO, and SLIK.
- KETIK, PDKT, and Telefun simulate consumers contacting OJK; SIDAK records monthly QA periods and findings per agent and channel.
- Used mainly on office laptops and desktops; phones are a secondary, quick-check context.

## Brand Personality

Professional, calm, precise.

The product voice should be clear, direct, and supportive. It should explain what happened, what needs attention, and what action is available without over-celebrating normal workflow steps.

## Anti-references

Avoid interfaces that feel decorative, noisy, or AI-generated: ornamental badges, neon or excessive gradients, floating decorations, generic repeated card grids, nested cards, oversized rounded panels, low-contrast gray text, and dashboards that require too much scanning effort.

Avoid treating operational modules like marketing pages. KETIK, PDKT, Telefun, KTP/Profiler, SIDAK, Monitoring, and Admin should prioritize task clarity, readable data, stable controls, and predictable state changes.

## Evidence on Hand

- Agent names, scores, and findings are sensitive internal data. Public mockups, screenshots, and demos must use sample data, never real records.
- There are no testimonials, impact figures, or official case studies. Do not invent such claims, including on the landing page.
- The OJK logo is a display asset (for example in KETIK). Do not present Trainers SuperApp as an official OJK product.

## Product Principles

1. Evidence leads to practice: surfaces should connect what QA found to what the agent practices next.
2. Numbers must be defensible: every score, count, and scope shown must match backend rules, and missing or partial data is stated rather than hidden.
3. Scope is part of the answer: users always know whose data they are looking at (all agents, their team, or themselves).
4. Built for the daily desk: optimize for repeated desktop use by trainers and QA; keep phone use workable for quick checks.

## Design Principles

1. Task clarity first: each screen should make the current workflow, status, and next action obvious.
2. Trust the data: scores, access states, evaluation results, and monitoring totals must be visually clear and match the underlying behavior.
3. Consistent module language: module identity colors can orient users, but layout, controls, typography, and states should stay consistent across the SuperApp.
4. Dense but readable: operational users need enough information on screen to compare, decide, and act without visual clutter.
5. Calm feedback: loading, error, empty, disabled, and success states should be human-readable and actionable, not raw technical output.

## Accessibility & Inclusion

Target WCAG AA readability for product UI. Body text should meet at least 4.5:1 contrast, primary task text should be stronger where possible, and muted text should only be used for non-critical metadata.

All core actions must be keyboard reachable, icon-only controls need accessible labels or titles, mobile touch targets should be comfortable, and destructive actions need clear confirmation or recovery affordances.

Motion should be subtle, state-driven, and respectful of reduced-motion preferences. Product flows should not rely on hover-only cues, color-only meaning, or tiny controls that are hard to use on mobile.

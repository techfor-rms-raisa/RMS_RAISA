# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev       # Start dev server on port 3000
npm run build     # Production build (outputs to dist/)
npm run preview   # Preview production build locally
```

There is no test runner, linter, or formatter configured in the project. TypeScript type-checking is done implicitly by Vite during build (`noEmit: true` in tsconfig).

Deployment is on **Vercel** — serverless functions in `api/` are deployed automatically. Cron jobs are configured in `vercel.json`.

## Architecture Overview

**RMS-RAISA.ai** is an AI-powered Recruitment & Risk Management platform built with React 19 + TypeScript (Vite) on the frontend and Vercel Serverless Functions on the backend. Database is Supabase (PostgreSQL).

### Three Application Modules

The app has no router library — navigation is state-driven via `currentView` in `App.tsx`, rendered through a large `switch` statement. Views are string literals defined in the `View` type (`src/types/types_models.ts`) and centralized as constants in `src/constants/routes.ts`.

1. **RMS** — Risk Management System: dashboard, consultant scorecards (1-5 risk scale), client/user management, compliance, quarantine, analytics
2. **RAISA** — Recruitment AI System Assistant: job openings (vagas), applications (candidaturas), talent pool (pessoas), pipeline, AI-powered CV analysis, technical interviews, candidate distribution
3. **Atividades** — Activity tracking: insert/query/export consultant activities and monthly reports

### Data Flow

`src/hooks/useSupabaseData.ts` is the **main data orchestrator**. It composes ~11 modular hooks from `src/hooks/supabase/` (useUsers, useClients, useVagas, useCandidaturas, etc.) and exposes all CRUD operations + data arrays to `App.tsx`, which passes them as props to child components.

### AI Integration — Dual-Model Architecture

The system uses two AI providers via the `src/services/aiRouter.ts` router (70% Gemini / 30% Claude):

- **Google Gemini** (`geminiService.ts`) — High-volume tasks: CV extraction, behavioral flags, candidate scoring, report analysis. Called via `/api/gemini-analyze`, `/api/gemini-cv`, `/api/gemini-cv-generator-v2`, `/api/gemini-audio-transcription`
- **Anthropic Claude** (`claudeService.ts`) — Premium decisions: gap analysis (technical, experience, education), interview evaluation, cultural fit, final recommendations with score. Called via `/api/claude-analyze`

AI features are gated by `src/config/aiConfig.ts` with feature flags and minimum data thresholds for phased rollout. Some features (rejection analysis, risk prediction) only activate after accumulating enough historical data.

### Serverless API (`api/`)

All backend endpoints are Vercel Serverless Functions (1024MB, 60s timeout). Key patterns:
- AI proxy endpoints (`gemini-*.ts`, `claude-analyze.ts`) — keep API keys server-side
- CRUD endpoints (`envios/`, `linkedin/`) — business logic that needs server context
- Cron jobs (`cron/`) — scheduled: reprioritization every 4h, monthly analysis 1st of month, notification cleanup weekly

### Authentication & Permissions

No external auth service — users are stored in Supabase `app_users` table. `AuthContext` provides user state; `usePermissions` hook provides RBAC checks. Roles: Administrador, Gestao de R&S, Gestao Comercial, Gestao de Pessoas, Analista de R&S, Consulta (read-only), Cliente.

## Key Conventions

### Path Aliases

Configured in both `tsconfig.json` and `vite.config.ts`:
- `@/*` → `src/*`
- `@/types`, `@/components`, `@/services`, `@/hooks`, `@/config`

Use `import { User, Vaga } from '@/types'` — types are re-exported from `src/types/types_index.ts` (aliased as `index.ts` via barrel files named `models.ts`, `users.ts`, `reports.ts`, `compliance.ts`).

### File Naming

- Types: `types_models.ts`, `types_users.ts`, `types_reports.ts`, `types_compliance.ts`, `cvTypes.ts`
- Hooks: `src/hooks/supabase/use<Entity>.ts` (e.g., `useVagas.ts`, `useCandidaturas.ts`)
- Services: `src/services/<feature>Service.ts` (e.g., `geminiService.ts`, `cvExtractionService.ts`)
- RAISA components: `src/components/raisa/<ComponentName>.tsx`
- Atividades components: `src/components/atividades/<ComponentName>.tsx`

### Language

All UI text, variable names, database columns, and comments are in **Brazilian Portuguese**. Type names and some service file names use English.

### Core Data Models

- **Vaga** (Job opening): titulo, descricao, senioridade, stack_tecnologica, status (aberta/pausada/fechada/etc), cliente_id, analista_id
- **Pessoa** (Candidate): nome, email, titulo_profissional, senioridade, cv_processado, cv_texto_original
- **Candidatura** (Application): vaga_id, pessoa_id, status (triagem/entrevista/aprovado/reprovado/etc), curriculo_texto, analista_id
- **Consultant**: nome, email, cargo, status (Ativo/Perdido/Encerrado), monthly risk scorecards (parecer_1 through parecer_12, scale 1-5)
- **User**: nome_usuario, email_usuario, tipo_usuario (role), senha_hash

### Environment Variables

Frontend (prefixed `VITE_`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GEMINI_API_KEY`, `VITE_EMAILJS_*`
Backend (server-only): `API_KEY` (Gemini), `RESEND_API_KEY`, `ANTHROPIC_API_KEY`

### Database

PostgreSQL via Supabase. Schema scripts are in `database/` — `SCRIPT_UNICO_COMPLETO_SUPABASE.sql` is the master schema. Incremental migrations are separate SQL files (entrevistas, workflow_vagas, priorizacao_distribuicao, etc.).

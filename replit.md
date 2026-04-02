# SOTRASER - Fleet Intelligence Dashboard

## Overview
A comprehensive fleet management system for a Chilean trucking company (~800 trucks). Integrates real-time GPS tracking and telemetry from Volvo Connect (rFMS) with fuel transaction data from the Sigetra portal to optimize fleet operations, detect fuel anomalies, and provide AI-driven insights.

## Data Sources (2 active)
- **Volvo Connect rFMS**: GPS positions, fuel consumption, odometer, speed via official API (sync every 90s)
- **Sigetra**: Fuel loading transactions (litros, estacion, km, conductor) via API (sync every 1 hour)

## Architecture
- **Full-stack monorepo**: Express backend serves both the API and the Vite-bundled React frontend
- **Single port**: Both API and frontend run on port 5000 in development
- **Database**: PostgreSQL (Neon/Railway production DB loaded via `.env` file, overrides Replit's managed DATABASE_URL)
- **GitHub auto-sync**: `server/github-sync.ts` pushes to `github.com/albertohellerMaker/sotraser-tower` every 10 minutes using `GITHUB_TOKEN`

## Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui, Recharts, Leaflet maps, wouter routing
- **Backend**: Node.js, Express 5, TypeScript (ESM)
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: Anthropic Claude (fleet diagnostics and conversational assistant)
- **Build**: Vite (frontend), esbuild (backend production bundle)
- **Package manager**: npm

## Project Structure
```
client/          # React frontend (Vite)
  src/
    components/  # UI components including shadcn/ui primitives
    pages/       # App views (dashboard, geovalidator, operative-brain, validador-cruzado, etc.)
    lib/         # Frontend utilities, API clients, fuel calculation logic
server/          # Express backend
  agentes/       # AI agent logic (CEO, Operations Manager, etc.)
  utils/         # GPS filtering, VIN mapping, truck matching (gps-unificado.ts)
  *-routes.ts    # Domain-specific API routes
  aprendizaje-engine.ts  # Adaptive learning background engine
  github-sync.ts # Auto-push to GitHub every 10 min
  validador-cruzado.ts   # Cross-validation Volvo + Sigetra
shared/          # Shared code
  schema.ts      # Drizzle DB schema + TypeScript types
migrations/      # SQL migration files
```

## Key Features
- **Tower/Cerebro**: Fleet-wide analytical hub
- **Operative Brain**: Real-time GPS tracking, daily reports, driver evaluation
- **Cuadratura System**: ECU vs Sigetra fuel reconciliation
- **Validador Cruzado**: Cross-validation between Volvo Connect + Sigetra data sources
- **Sistema Inteligente**: CEO-level interface with AI natural language queries
- **GeoValidator**: Station detection and route reconstruction
- **Multi-agent system**: Autonomous background agents (Operations, Contracts, General Manager)

## Development Setup
- Run: `npm run dev` (starts Express + Vite dev server on port 5000)
- Dev script loads `.env` file: `sh -c 'set -a && . ./.env && set +a && NODE_ENV=development tsx server/index.ts'`
- DB schema: `npm run db:push` (same `.env` loading pattern)
- Build: `npm run build`

## Environment Variables
Set via Replit Secrets/Env Vars:
- `DATABASE_URL` - PostgreSQL connection (overridden by `.env` for Neon DB)
- `ANTHROPIC_API_KEY` - For Claude AI features
- `SIGETRA_URL`, `SIGETRA_USER`, `SIGETRA_PASSWORD` - Sigetra fuel portal
- `VOLVO_CONNECT_USER`, `VOLVO_CONNECT_PASSWORD` - Volvo Connect rFMS API
- `GITHUB_TOKEN` - For auto-sync to GitHub
- `VITE_GOOGLE_MAPS_KEY` - Google Maps (loaded as env var, not hardcoded)
- `SESSION_SECRET` - Express session secret
- `PORT` - Set to 5000

## Deployment
- Target: autoscale
- Build: `npm run build`
- Run: `node dist/index.cjs`

## Notes
- WiseTrack GPS was fully removed from the codebase (April 2026). Only Volvo Connect + Sigetra remain as data sources.
- Volvo API currently returns 401 — credentials may be expired or IP not whitelisted.
- Database has real data: 819 trucks, 1754 geocercas, 11 contracts, 176 VINs mapped.

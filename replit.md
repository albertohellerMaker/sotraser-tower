# SOTRASER - Fleet Intelligence Dashboard

## Overview
A comprehensive fleet management system for a Chilean trucking company. Integrates real-time GPS tracking and telemetry from Volvo Connect (rFMS) with fuel transaction data from the Sigetra portal to optimize fleet operations, detect fuel anomalies, and provide AI-driven insights.

## Architecture
- **Full-stack monorepo**: Express backend serves both the API and the Vite-bundled React frontend
- **Single port**: Both API and frontend run on port 5000 in development
- **Database**: PostgreSQL (Replit-managed) via Drizzle ORM

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
    pages/       # App views (dashboard, geovalidator, operative-brain, etc.)
    lib/         # Frontend utilities, API clients, fuel calculation logic
server/          # Express backend
  agentes/       # AI agent logic (CEO, Operations Manager, etc.)
  utils/         # GPS filtering, VIN mapping, truck matching
  *-routes.ts    # Domain-specific API routes
  aprendizaje-engine.ts  # Adaptive learning background engine
shared/          # Shared code
  schema.ts      # Drizzle DB schema + TypeScript types
migrations/      # SQL migration files
```

## Key Features
- **Tower/Cerebro**: Fleet-wide analytical hub
- **Operative Brain**: Real-time GPS tracking, daily reports, driver evaluation
- **Cuadratura System**: ECU vs Sigetra fuel reconciliation
- **Sistema Inteligente**: CEO-level interface with AI natural language queries
- **GeoValidator**: Station detection and route reconstruction
- **Multi-agent system**: Autonomous background agents (Operations, Contracts, General Manager)

## Development Setup
- Run: `npm run dev` (starts Express + Vite dev server on port 5000)
- DB schema: `npm run db:push`
- Build: `npm run build`

## Environment Variables
Set via Replit Secrets/Env Vars:
- `DATABASE_URL` - PostgreSQL connection (Replit-managed)
- `ANTHROPIC_API_KEY` - For Claude AI features
- `SIGETRA_URL`, `SIGETRA_USER`, `SIGETRA_PASSWORD` - Sigetra fuel portal
- `VOLVO_CONNECT_USER`, `VOLVO_CONNECT_PASSWORD` - Volvo Connect API
- `SESSION_SECRET` - Express session secret
- `PORT` - Set to 5000

## Credentials loaded from .env
The dev script uses `--env-file=.env` to load additional credentials (API keys, passwords) that aren't set as Replit secrets.

## Deployment
- Target: autoscale
- Build: `npm run build`
- Run: `node dist/index.cjs`

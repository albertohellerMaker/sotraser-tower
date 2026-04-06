# SOTRASER - Fleet Intelligence Dashboard

## Overview
Fleet management system for Chilean trucking company SOTRASER. **WiseTrack official API only** — all Volvo Connect and WiseTrack portal scraping code has been removed. Single data source via `ei.wisetrack.cl/Sotraser/TelemetriaDetalle`.

## Data Source
- **WiseTrack Official API**: `https://ei.wisetrack.cl/Sotraser/TelemetriaDetalle` — GET with Bearer token, SSL self-signed cert (`rejectUnauthorized: false`). Buffer empties after read — poll every 60s. Rich telemetry: GPS, fuel, RPM, torque, engine temp, horometer, consumption breakdown. Tables: `wisetrack_telemetria` (API data by wt_id), `wisetrack_vehiculos` (movil→patente mapping), `wisetrack_posiciones` (GPS positions). 63 Cencosud trucks.
- **TMS Trip Detection**: Fully automatic using `wisetrack_posiciones`. `viajes-historico.ts` builds trips from GPS positions using sustained-stop segmentation (30min dwell threshold) and odometer/fuel deltas. `t1-reconstructor.ts` reconstructs T-1 daily trips from WiseTrack data. No Volvo ECU dependency.
- **WiseTrack Token**: stored as `WISETRACK_API_TOKEN` env var

## Architecture
- **npm workspaces monorepo**: Root manages 3 workspaces (`shared/`, `server/`, `client/`) with per-workspace `package.json`. Root has devDependencies and scripts.
- **Single port**: Both API and frontend run on port 5000 in development
- **Database**: PostgreSQL (Neon/Railway production DB loaded via `.env` file, overrides Replit's managed DATABASE_URL)
- **GitHub auto-sync**: `server/github-sync.ts` pushes to `github.com/albertohellerMaker/sotraser-tower` every 10 minutes using `GITHUB_TOKEN`

## Authentication
- **Session-based login**: express-session with cookie auth (30-day expiry)
- **Credentials**: usuario `beto`, clave `1234`
- **Protection**: All `/api/*` routes require authenticated session (except `/api/auth/*`)
- **Cookie**: httpOnly, sameSite=lax, secure in production

## Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui, Recharts, Google Maps (`@vis.gl/react-google-maps`)
- **Backend**: Node.js, Express 5, TypeScript (ESM), Zod request validation middleware
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: Anthropic Claude (fleet diagnostics and conversational assistant)
- **Build**: Vite (frontend), esbuild (backend production bundle)
- **Package manager**: npm
- **Maps**: Google Maps ONLY (`@vis.gl/react-google-maps`). Key: `VITE_GOOGLE_MAPS_KEY`. All Leaflet fully removed.
- **Workers**: Background jobs and agents run in separate child processes via `server/worker-manager.ts` (uses `child_process.fork` + tsx). Workers: `server/workers/jobs-worker.ts` (data sync, scoring, geocercas), `server/workers/agents-worker.ts` (multi-agent AI system). Auto-restart with exponential backoff on crash.
- **Conductor API**: `/api/conductor/*` endpoints for the driver-facing app. Auth via `X-API-Key` header (env: `CONDUCTOR_API_KEY`). Bypasses Tower session auth.

## Project Structure
```
client/                    # React frontend (Vite)
  src/
    components/            # UI components
      ui/                  # shadcn/ui primitives
      mapa-geocercas-cencosud.tsx # Cencosud geofence map
    pages/                 # Active pages
      flota.tsx            # Fleet overview (EN VIVO + COMBUSTIBLE sub-tabs)
      cencosud.tsx         # Dedicated Cencosud TMS view (EN VIVO real-time tracking, P&L, viajes, tarifas, mapeo)
      wisetrack-app.tsx    # TOWER main app shell — FLOTA dashboard (RESUMEN/COMBUSTIBLE/ANOMALIAS/MAPA EN VIVO), CAMIONES, TMS CENCOSUD, SISTEMA tabs
      operative-brain.tsx  # AI brain with multi-agent chat
      conductores-panel.tsx # Conductores management
      camiones.tsx         # Individual truck view with faena filter
    lib/                   # Frontend utilities, API clients
      fuel-utils.ts        # Fuel analysis utilities (rendimiento, percentiles)
server/                    # Express backend
  routes.ts                # Main route registration
  wisetrack-scraper.ts     # WiseTrack official API client + DB-backed fetchSeguimiento
  wisetrack-routes.ts      # WiseTrack REST endpoints
  geo-routes.ts            # GPS/geocerca endpoints
  estaciones-routes.ts     # Fuel station analytics
  drivers-routes.ts        # Driver analytics
  aprendizaje-engine.ts    # Learning engine for fuel anomaly detection
  workers/
    jobs-worker.ts         # Background sync jobs
    agents-worker.ts       # Multi-agent AI system
shared/
  schema.ts                # Drizzle ORM schema (PostgreSQL)
```

## Navigation Flow
Login → SplashScreen → WiseTrackApp (tabs: FLOTA / CAMIONES / TMS CENCOSUD / SISTEMA)
- FLOTA tab has sub-tabs: RESUMEN (fleet summary + operational alerts), COMBUSTIBLE (fuel performance + low-tank alerts), ANOMALIAS (trip anomaly detection from viajes_aprendizaje), MAPA EN VIVO (live GPS tracking map)
- Header shows "SOTRASER · TOWER · LIVE"
- All Volvo Connect references cleaned from main dashboard and key components

## Key Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- `WISETRACK_API_TOKEN`: Bearer token for WiseTrack API (value: 77b95789-a047-3186-86cf-90c83583b352)
- `ANTHROPIC_API_KEY`: Claude AI API key
- `GITHUB_TOKEN`: GitHub sync token
- `VITE_GOOGLE_MAPS_KEY`: Google Maps API key (must be in .env for Vite injection)
- `CONDUCTOR_API_KEY`: Driver app API key

## Deleted Systems (cleanup completed)
- Volvo Connect pipeline: `server/volvo-api.ts`, `server/volvo-vin-sync.ts`, `server/volvo-backfill.ts`, `client/src/pages/volvo.tsx`, `client/src/components/volvo-truck-modal.tsx`
- WiseTrack portal scraping: `loginPortal`, `fetchSeguimiento` (portal-based), `syncVehiculoMap` removed from scraper
- GPS unification: `server/utils/gps-unificado.ts`, `server/utils/vin-patente.ts`, `server/utils/snapshots-carga.ts` deleted
- All `/api/volvo/*` routes removed from `routes.ts`

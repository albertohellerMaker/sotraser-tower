# SOTRASER - Fleet Intelligence Dashboard

## Overview
Fleet management system for Chilean trucking company SOTRASER. **WiseTrack official API only** — single data source via `ei.wisetrack.cl/Sotraser/TelemetriaDetalle`. Deployed 24/7 on Replit VM.

## Data Source
- **WiseTrack Official API**: `https://ei.wisetrack.cl/Sotraser/TelemetriaDetalle` — GET with Bearer token, SSL self-signed cert (`rejectUnauthorized: false`). Buffer empties after read — poll every 60s. Rich telemetry: GPS, fuel, RPM, torque, engine temp, horometer, consumption breakdown.
- **DB Tables**: `wisetrack_telemetria` (raw API data by wt_id), `wisetrack_vehiculos` (movil→patente mapping, 476 entries), `wisetrack_posiciones` (processed GPS + fuel positions, auto-created by API client)
- **TMS Trip Detection**: Fully automatic using `wisetrack_posiciones`. `viajes-historico.ts` builds trips from GPS positions using sustained-stop segmentation (30min dwell threshold) and odometer/fuel deltas. `t1-reconstructor.ts` reconstructs T-1 daily trips.
- **WiseTrack Token**: stored as `WISETRACK_API_TOKEN` env var

## Architecture
- **npm workspaces monorepo**: Root manages 3 workspaces (`shared/`, `server/`, `client/`) with per-workspace `package.json`
- **Single port**: Both API and frontend run on the same port (default 5000, configurable via PORT env var)
- **Database**: PostgreSQL on Neon — connected via `NEON_DATABASE_URL` env var (priority) or `DATABASE_URL` fallback. Code in `server/db.ts`.
- **Hosting**: Replit VM deployment (24/7). No Railway, no GitHub sync.

## Authentication
- **Session-based login**: express-session with cookie auth (30-day expiry)
- **Credentials**: usuario `beto`, clave `1234`
- **Protection**: All `/api/*` routes require authenticated session (except `/api/auth/*`, `/api/conductor/*`)

## Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui, Recharts, Leaflet maps (`react-leaflet@4.2.1` + `leaflet@1.9.4`)
- **Backend**: Node.js, Express 5, TypeScript (ESM), Zod request validation middleware
- **Database**: PostgreSQL (Neon) with Drizzle ORM — 83 tables
- **AI**: Anthropic Claude (fleet diagnostics and conversational assistant via BRAIN)
- **Build**: Vite (frontend), esbuild (backend production bundle)
- **Package manager**: npm
- **Workers**: Background jobs and agents run in separate child processes via `server/worker-manager.ts`. Workers: `server/workers/jobs-worker.ts` (data sync, scoring, geocercas), `server/workers/agents-worker.ts` (multi-agent AI system)
- **Conductor API**: `/api/conductor/*` endpoints for the driver-facing app. Auth via `X-API-Key` header

## Project Structure
```
client/                    # React frontend (Vite)
  src/
    pages/
      wisetrack-app.tsx    # TOWER main app shell — FLOTA/CAMIONES/TMS CENCOSUD/SISTEMA tabs
      cencosud.tsx         # Cencosud TMS view (EN VIVO, P&L, viajes, tarifas, mapeo)
      operative-brain.tsx  # AI brain with multi-agent chat
      conductores-panel.tsx # Conductores management
    components/
      leaflet-map.tsx      # Shared Leaflet wrapper (LeafletMap, DivMarker, CircleMarker, FitBounds, Polyline)
server/
  db.ts                    # Database connection (NEON_DATABASE_URL || DATABASE_URL)
  routes.ts                # Main route registration (all API endpoints)
  tower-routes.ts          # /api/tower/* — fuel analysis, stops, fleet summary (100% WiseTrack)
  brain-routes.ts          # /api/brain/* — AI executive assistant, anomaly detection, predictions
  wisetrack-api.ts         # WiseTrack API client + DB sync (tables auto-created)
  wisetrack-routes.ts      # /api/wisetrack/* — en-vivo, historial, TMS en-vivo
  combustible-routes.ts    # /api/combustible/* — fuel validation, ADN, fraud detection
  cencosud-routes.ts       # /api/cencosud/* — dashboard, P&L, viajes, tarifas, alias
  t1-reconstructor.ts      # T-1 trip reconstruction from GPS (790 lines)
  pl-engine.ts             # P&L calculation engine
  viajes-historico.ts      # Trip reconstruction from GPS positions
  faena-filter.ts          # Contract filtering (CONTRATOS_ACTIVOS, dynamic from DB)
  supervision-engine.ts    # Predictive monitoring (actual vs expected)
  workers/
    jobs-worker.ts         # Background: viajes, parametros, geocercas, scoring
    agents-worker.ts       # Background: multi-agent AI (operaciones, contratos, gerente)
  agentes/                 # 12 AI agents (operaciones, gerente-general, cencosud, etc.)
shared/
  schema.ts                # Drizzle ORM schema (PostgreSQL)
```

## Navigation Flow
Login → SplashScreen → WiseTrackApp → **CENCOSUD (landing/default)**
- **CENCOSUD tab** (HOME — primary focus): Cencosud contract control panel
  - Sub-tabs: EN VIVO / CONTROL / RESUMEN / VIAJES / ERRORES / RUTAS / FLOTA / AGENTE / TARIFAS / MAPA
  - **CONTROL tab**: Daily operational control — KPIs (km, liters, fuel efficiency, speed violations), hourly speed chart, per-truck detail table, speed excess log, daily trips summary. Endpoint: `/api/cencosud/control-diario?fecha=YYYY-MM-DD`
  - Trip reconciliation (cuadratura): GPS trips matched to tarifario via geocerca aliases
  - Trip states: CRUZADO (billable), PARCIAL (one end mapped), SIN_ALIAS (unmapped)
  - Interactive mapping: manual assignment of contract names to unmatched trips
  - T1 Reconstructor: automatic trip detection from GPS dwell-time at geocercas
- **FLOTA tab** (informational): general fleet overview with sub-tabs RESUMEN / COMBUSTIBLE / PARADAS / ANOMALIAS / MAPA EN VIVO
- **CAMIONES tab** (informational): per-truck detail, GPS historial, telemetry
- **SISTEMA tab** (informational): WiseTrack API health, system status, sync info

## Key Environment Variables
- `NEON_DATABASE_URL`: PostgreSQL connection string (Neon — primary, used in dev and prod)
- `DATABASE_URL`: Fallback PostgreSQL connection (Replit built-in — empty, only used if NEON not set)
- `WISETRACK_API_TOKEN`: Bearer token for WiseTrack API
- `ANTHROPIC_API_KEY`: Claude AI API key
- `CONDUCTOR_API_KEY`: Driver app API key

## Alias Dedup Strategy (Critical)
- **All queries** joining `geocerca_alias_contrato` must use `DISTINCT ON (va.id) ... ORDER BY va.id, crt.tarifa DESC NULLS LAST` to prevent row duplication when a geocerca matches multiple aliases
- **Aggregate queries** use CTE pattern: `WITH dedup AS (SELECT DISTINCT ON ...)` then aggregate from the CTE

## TMS Route Matching & Trip Logic
- **Trip definition**: A trip = truck leaves a CD → delivers at 1+ destinations → arrives at another CD (or returns). NO split into segments.
- **T-1 reconstructor** filters `wisetrack_posiciones` by `grupo1 = 'CENCOSUD'` — processes only ~63 Cencosud trucks
- **`construirViajes`**: Trips start only at CD/BASE, collect all delivery stops until reaching next CD
- **Trip states**: FACTURADO (tarifa > 0), TRANSITO (ruta reconocida, tarifa $0), PENDIENTE (sin match)
- **P&L engine** (`pl-engine.ts`): Routes with tarifa=0 correctly count as `sinTarifa` but still get `tarifa_id` assigned

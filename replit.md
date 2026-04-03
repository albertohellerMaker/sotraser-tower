# SOTRASER - Fleet Intelligence Dashboard

## Overview
A comprehensive fleet management system for a Chilean trucking company (~825 trucks). Integrates real-time GPS tracking and telemetry from Volvo Connect (rFMS) with fuel transaction data from the Sigetra portal to optimize fleet operations, detect fuel anomalies, and provide AI-driven insights.

## Data Sources (2 active)
- **Volvo Connect rFMS**: GPS positions, fuel consumption, odometer, speed via official API (sync every 90s)
- **Sigetra**: Fuel loading transactions (litros, estacion, km, conductor) via API (sync every 1 hour)

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
- **Conductor API**: `/api/conductor/*` endpoints for the driver-facing app. Auth via `X-API-Key` header (env: `CONDUCTOR_API_KEY`). Bypasses Tower session auth. Endpoints: login, viajes del día, paradas, confirmar parada, enviar ubicación, reportar novedad, info camión.
- **Conductor Panel**: Tower tab "CONDUCTORES" with 4 sub-tabs: Viajes en Vivo (live map tracking + GPS validation), Asignar Viaje (Uber-style trip creation with paradas), Gestión (conductor roster), Novedades (incident reports). Routes: `/api/conductor-panel/*`.

## Project Structure
```
client/                    # React frontend (Vite)
  src/
    components/            # UI components
      ui/                  # shadcn/ui primitives (cleaned: only used ones remain)
      viaje-mapa-modal.tsx # GPS route viewer (Google Maps, Strava-style)
      mapa-geocercas-cencosud.tsx # Cencosud geofence map
      carga-modal.tsx      # Fuel load modal
      ficha-camion-modal.tsx # Truck detail modal
      status-tag.tsx       # Status tag component
      volvo-truck-modal.tsx # Volvo truck detail
    pages/                 # Active pages
      flota.tsx            # Fleet overview (P90/P75/P50 tables, rankings)
      viajes-tms.tsx       # Trip analysis (executive summary, daily/monthly, GPS route viewer)
      combustible-tms.tsx  # Fuel management
      operative-brain.tsx  # AI brain with multi-agent chat
      cencosud.tsx         # Dedicated Cencosud TMS
      anglo.tsx            # Anglo American Cargas Varias TMS
      geovalidator.tsx     # Route validation and geofence management
      volvo.tsx            # Volvo Connect truck status and map
      camiones.tsx         # Individual truck view with faena filter
      ranking-conductores.tsx # Driver performance ranking
      sigetra-fusion.tsx   # Sigetra data fusion analysis
      micro-cargas.tsx     # Suspicious micro-fuel-load detection
      errores.tsx          # Data quality errors
      geo-tabs/            # 6 geo sub-tab components
        mapa-en-vivo.tsx   # Live fleet map
        viajes-cerrados.tsx # Completed trips
        rutas-operacionales.tsx # Operational routes
        acumulacion-tab.tsx # Accumulation analysis
        analisis-ia-tab.tsx # AI route analysis
        estaciones-tab.tsx  # Fuel station monitoring
        shared-components.tsx # Shared UI
        types.ts           # Shared types
    lib/                   # Frontend utilities, API clients
server/                    # Express backend
  agentes/                 # AI agent logic (Operations, Contracts, General Manager)
  utils/                   # GPS filtering, VIN mapping, truck matching
  middleware/              # Express middleware
    validate.ts            # Zod request validation (params, query, body)
  *-routes.ts              # Domain-specific API routes (22 route files, all mounted)
  t1-reconstructor.ts      # T-1 billing reconstruction
  github-sync.ts           # Auto-push to GitHub every 10 min
  scripts/                 # Standalone maintenance scripts
shared/                    # Shared code
  schema.ts                # Drizzle DB schema + TypeScript types
migrations/                # SQL migration files
```

## App Navigation (Tower mode)
| Tab | Component | Purpose |
|-----|-----------|---------|
| FLOTA | `Flota` (flota.tsx) | Fleet-wide performance, P90/P75/P50 tables, ranking, errors |
| VIAJES | `ViajesTMS` (viajes-tms.tsx) | Trip analysis: executive summary, daily detail, rankings |
| CONTRATOS | Inline `ContratosUnificado` | Per-contract KPIs, routes, top/bottom trucks |
| COMBUSTIBLE | `EstacionesTab` | Fuel stations, irregular loads, fraud detection |
| CAMIONES | Inline `CamionesUnificado` | Individual truck search, monthly calendar |
| CONTROL | Inline `ControlCenter` | Speed alerts, fuel deviations, route anomalies |
| BRAIN | `OperativeBrain` | Executive summary: multi-contract KPIs, 7-day trend, billing T-1, agent panels |
| SISTEMA | Inline `SistemaTab` | Sync status, Volvo+Sigetra matching, geocercas |

## Cencosud TMS — Trip Detection & Billing
- **96 KML geocercas** imported to `cencosud_geocercas_kml`
- **Point-in-polygon** (ray-casting) detection in `geocerca-inteligente.ts`
- **10-minute dwell time** required to activate a geocerca
- **Billing flow**: GPS → KML polygon → geocerca name → alias → tarifa → facturación
- **T-1 Reconstructor** (`t1-reconstructor.ts`): Post-hoc trip reconstruction from previous day GPS data. 100% tariff match. Runs at 05:00 daily.
- **Super Agente Cencosud** (`super-agente-cencosud.ts`): runs every 30 min

## Anglo American TMS — Cargas Varias (Componente Variable 28T)
- **Contrato N° 4.22.0015.1**: Vigencia Mar 2023 - Jun 2027, 74 camiones
- **Componente variable**: Tarifa por ruta OD a 28 toneladas. 35 rutas tarifadas clase VAR-28T
- **Reajuste cuatrimestral** (Mar, Jul, Nov)
- **Super Agente Anglo** (`super-agente-anglo.ts`): Mining-aware agent, runs every 30 min

## Background Processes
- Multi-agent AI: Operations + General Manager (every 15 min), Contracts (every 1 hour)
- Super Agente Cencosud (every 30 min) — billing intelligence + auto-alias
- Super Agente Anglo (every 30 min) — mining-aware billing + cerro monitoring
- Sigetra fuel sync (every 1 hour)
- Daily report at 06:00
- Overnight reconciliation at 03:00
- GitHub auto-push every 10 minutes
- VIN-patente refresh on boot

## Development Setup
- Run: `npm run dev` (starts Express + Vite dev server on port 5000)
- DB schema: `npm run db:push`
- Build: `npm run build`

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection
- `ANTHROPIC_API_KEY` - For Claude AI features
- `SIGETRA_URL`, `SIGETRA_USER`, `SIGETRA_PASSWORD` - Sigetra fuel portal
- `VOLVO_CONNECT_USER`, `VOLVO_CONNECT_PASSWORD` - Volvo Connect rFMS API
- `GITHUB_TOKEN` - For auto-sync to GitHub
- `VITE_GOOGLE_MAPS_KEY` - Google Maps API key
- `SESSION_SECRET` - Express session secret
- `PORT` - Set to 5000

## Deployment
- Target: autoscale
- Build: `npm run build`
- Run: `node dist/index.cjs`

## Cleanup History
- **April 2026 Audit**: Removed 61 dead prompt text files from attached_assets/, 6 orphan frontend files (validador-cruzado.tsx, not-found.tsx, camion-modal.tsx, faena-modal.tsx, kpi-card.tsx, splash-aprendizaje.tsx), 33 unused shadcn/ui components, 18+ unused npm packages (wouter, ws, memorystore, passport, passport-local, connect-pg-simple, date-fns, framer-motion, react-icons, next-themes, jspdf, jspdf-autotable, pdfkit, supercluster, tw-animate-css, zod-validation-error, @jridgewell/trace-mapping).
- WiseTrack GPS fully removed (April 2026).
- 27 orphaned frontend pages deleted previously.
- Duplicate `client 2/` directory removed.
- Leaflet migration to Google Maps in progress (viaje-mapa-modal done, 9 legacy pages pending).

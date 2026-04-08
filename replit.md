# SOTRASER - Fleet Intelligence Dashboard

## Overview
Fleet management system for Chilean trucking company SOTRASER. **WiseTrack official API only** — single data source via `ei.wisetrack.cl/Sotraser/TelemetriaDetalle`. All Volvo Connect code removed.

## Data Source
- **WiseTrack Official API**: `https://ei.wisetrack.cl/Sotraser/TelemetriaDetalle` — GET with Bearer token, SSL self-signed cert (`rejectUnauthorized: false`). Buffer empties after read — poll every 60s. Rich telemetry: GPS, fuel, RPM, torque, engine temp, horometer, consumption breakdown.
- **DB Tables**: `wisetrack_telemetria` (raw API data by wt_id), `wisetrack_vehiculos` (movil→patente mapping, 476 entries), `wisetrack_posiciones` (processed GPS + fuel positions, auto-created by API client)
- **TMS Trip Detection**: Fully automatic using `wisetrack_posiciones`. `viajes-historico.ts` builds trips from GPS positions using sustained-stop segmentation (30min dwell threshold) and odometer/fuel deltas. `t1-reconstructor.ts` reconstructs T-1 daily trips.
- **WiseTrack Token**: stored as `WISETRACK_API_TOKEN` env var

## Architecture
- **npm workspaces monorepo**: Root manages 3 workspaces (`shared/`, `server/`, `client/`) with per-workspace `package.json`
- **Single port**: Both API and frontend run on the same port (default 5000, configurable via PORT env var)
- **Database**: PostgreSQL (Neon/Railway production DB loaded via `.env` file)
- **GitHub auto-sync**: `server/github-sync.ts` pushes to GitHub every 10 minutes using `GITHUB_TOKEN`

## Authentication
- **Session-based login**: express-session with cookie auth (30-day expiry)
- **Credentials**: usuario `beto`, clave `1234`
- **Protection**: All `/api/*` routes require authenticated session (except `/api/auth/*`, `/api/conductor/*`)

## Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui, Recharts, Leaflet maps (`react-leaflet@4.2.1` + `leaflet@1.9.4`)
- **Backend**: Node.js, Express 5, TypeScript (ESM), Zod request validation middleware
- **Database**: PostgreSQL with Drizzle ORM
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
server/
  routes.ts                # Main route registration (all API endpoints)
  tower-routes.ts          # /api/tower/* — fuel analysis, stops, fleet summary (100% WiseTrack)
  brain-routes.ts          # /api/brain/* — AI executive assistant, anomaly detection, predictions
  wisetrack-api.ts         # WiseTrack API client + DB sync (tables auto-created)
  wisetrack-routes.ts      # /api/wisetrack/* — en-vivo, historial, TMS en-vivo
  combustible-routes.ts    # /api/combustible/* — fuel validation, ADN, fraud detection
  viajes-historico.ts      # Trip reconstruction from GPS positions
  faena-filter.ts          # Contract filtering (CONTRATOS_ACTIVOS, dynamic from DB)
  workers/
    jobs-worker.ts         # Background: viajes, parametros, geocercas, scoring
    agents-worker.ts       # Background: multi-agent AI (operaciones, contratos, gerente)
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
  - Partial trip resolution: `/api/cencosud/viajes-parciales` + `/api/cencosud/resolver-parcial` for PARCIAL trips
  - Geo-references: KML polygons, operational geofences, auto-detected points
  - T1 Reconstructor: automatic trip detection from GPS dwell-time at geocercas
  - Round trip billing: evaluates if tarifario has separate ida/vuelta prices, splits billing accordingly
  - Auto-alias engine: KML polygon match (instant), GPS proximity + Levenshtein name similarity scoring
  - Geocerca promotion: Cencosud points promoted after 2 visits (100m radius), others after 3 (50m)
- **FLOTA tab** (informational): general fleet overview with sub-tabs RESUMEN / COMBUSTIBLE / PARADAS / ANOMALIAS / MAPA EN VIVO
- **CAMIONES tab** (informational): per-truck detail, GPS historial, telemetry
- **SISTEMA tab** (informational): WiseTrack API health, system status, sync info

## Key API Routes
| Route | Source | Purpose |
|-------|--------|---------|
| `/api/wisetrack/en-vivo` | wisetrack_posiciones | Live fleet view with status classification |
| `/api/tower/combustible` | wisetrack_posiciones | 7-day fuel analysis with percentiles |
| `/api/tower/paradas` | wisetrack_posiciones | 48h stop detection and analysis |
| `/api/tower/resumen-flota` | wisetrack_posiciones + viajes_aprendizaje | Fleet summary dashboard |
| `/api/brain/chat` | Claude AI + real WiseTrack context | AI executive assistant |
| `/api/brain/resumen-ejecutivo` | viajes_aprendizaje + wisetrack_posiciones | Contract-level KPIs |
| `/api/brain/anomalias-macro` | viajes_aprendizaje | Route deviation detection |
| `/api/viajes/stats` | viajes_aprendizaje | Trip statistics and anomalies |
| `/api/combustible/resumen` | validaciones_carga | Fuel fraud detection dashboard |
| `/api/datos/excesos-velocidad` | wisetrack_posiciones | Speed violation tracking (>90 km/h) |

## Key Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- `WISETRACK_API_TOKEN`: Bearer token for WiseTrack API
- `ANTHROPIC_API_KEY`: Claude AI API key
- `GITHUB_TOKEN`: GitHub sync token
- `VITE_GOOGLE_MAPS_KEY`: Google Maps API key (must be in .env for Vite injection)
- `CONDUCTOR_API_KEY`: Driver app API key

## Alias Dedup Strategy (Critical)
- **All queries** joining `geocerca_alias_contrato` must use `DISTINCT ON (va.id) ... ORDER BY va.id, crt.tarifa DESC NULLS LAST` to prevent row duplication when a geocerca matches multiple aliases
- **Aggregate queries** use CTE pattern: `WITH dedup AS (SELECT DISTINCT ON ...)` then aggregate from the CTE
- **Bad aliases fixed**: "CD CHILLAN"→"CD Chillán", removed wrong mappings (Chillán→Temuco, Los Ángeles→Puerto Montt, Temuco→Los Ángeles, Mulchén→Los Ángeles)
- **Admin endpoints**: `/api/cencosud/alias-audit` (GET) and `/api/cencosud/alias-fix` (POST) for alias maintenance
- **Do NOT add `mapId`** to Google Maps components unless creating real Map IDs in Google Cloud Console

## TMS Cencosud — Only Cencosud Trucks
- **`fetchSeguimiento(grupo)` now filters by `grupo1`** — Previously ignored the parameter (prefixed with `_`), returning ALL 476 vehicles from all clients (Glencore, Mininco, Indura, Anglo, etc.) in the Cencosud TMS view
- **Fix**: SQL WHERE clause `AND grupo1 = $1` applied when grupo is provided. Only `fetchSeguimiento()` without argument returns all vehicles (used only for `/api/wisetrack/grupos` endpoint)
- **Affected endpoints**: `/api/wisetrack/en-vivo`, `/api/wisetrack/flota`, `/api/wisetrack/tms/en-vivo` — all pass `"CENCOSUD"` and now correctly filter

## TMS Route Matching & Trip Logic (April 7 2026)
- **Trip definition redesigned**: A trip = truck leaves a CD → delivers at 1+ destinations → arrives at another CD (or returns). NO split into segments. Previous logic broke CD Chillán→Los Ángeles→Temuco into 2 trips; now it's 1 trip with multiple deliveries.
- **T-1 reconstructor** now filters `wisetrack_posiciones` by `grupo1 = 'CENCOSUD'` — was processing all 476 vehicles instead of ~63 Cencosud trucks
- **`construirViajes` rewritten**: Trips start only at CD/BASE, collect all delivery stops until reaching next CD. Round-trip = returns to same CD. Intermediate deliveries stored in `paradas_intermedias`.
- **Route matching improved to 100%** — added 13 missing routes to `contrato_rutas_tarifas`:
  - Return/transit routes (tarifa $0): Mulchén→CD Chillán, Temuco→CD Chillán, Victoria→CD Chillán, Los Ángeles→Temuco, Temuco→Los Ángeles, Los Ángeles→Valdivia, Victoria→Osorno, Osorno→Puerto Montt, Los Ángeles→CD Puerto Madero, Los Ángeles→Noviciado, Curicó→Noviciado
  - City routes: Chillán→Los Ángeles, Chillán→Victoria
- **Trip states**: FACTURADO (tarifa > 0), TRANSITO (ruta reconocida, tarifa $0), PENDIENTE (sin match)
- **P&L engine** (`pl-engine.ts`): Routes with tarifa=0 correctly count as `sinTarifa` but still get `tarifa_id` assigned

## Audit Fixes Applied (April 2026)
- **Fixed**: `saveTelemetria` now uses `ConsumoLitros_Total` instead of `ConsumoLitros_Conduccion` — fuel data was under-reported
- **Fixed**: `wisetrack_posiciones` table auto-created by scraper on startup
- **Fixed**: `fetchSeguimiento` handles Date objects from PostgreSQL (was crashing with `.replace is not a function`)
- **Fixed**: `/api/camiones` no longer filters by VIN (was hiding trucks)
- **Fixed**: `/api/dashboard/hero` now pulls real km/litros from wisetrack_posiciones instead of returning zeros
- **Fixed**: `/api/datos/excesos-velocidad` now queries wisetrack_posiciones for speed events instead of returning empty
- **Fixed**: `/api/faenas/en-movimiento` now returns real counts from wisetrack_posiciones
- **Fixed**: `/api/brain/comparacion-fuentes` SQL — window function moved to CTE (was invalid nested aggregate)
- **Fixed**: Status message updated to "WiseTrack API"
- **Added**: PARADAS sub-tab in FLOTA dashboard
- **Added**: Tower API endpoints: `/api/tower/combustible`, `/api/tower/paradas`, `/api/tower/resumen-flota`

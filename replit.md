# SOTRASER - Fleet Intelligence Dashboard

## Overview
Fleet management system for Chilean trucking company SOTRASER. **72 active trucks** with GPS Volvo Connect (rFMS), focused on Cencosud TMS (~95%+ tariff billing) with Anglo American mining contracts. Single data source: Volvo Connect GPS + ECU telemetry.

## Data Sources (1 active)
- **Volvo Connect rFMS**: GPS positions, fuel consumption, odometer, speed via official API (sync every 90s). 72 camiones with VIN.

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
- **APP CONDUCTOR Hub** (`app-conductor-hub.tsx`): Full management hub accessed from Welcome screen and Tower navbar.

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
      operative-brain.tsx  # AI brain with multi-agent chat
      conductores-panel.tsx # Conductores management
      app-conductor-hub.tsx # Driver app management hub
      camiones.tsx         # Individual truck view with faena filter (CamionesUnificado in App.tsx)
    lib/                   # Frontend utilities, API clients
server/                    # Express backend
  agentes/                 # AI agent logic
  utils/                   # GPS filtering, VIN mapping
  middleware/              # Express middleware
  *-routes.ts              # Domain-specific API routes
  github-sync.ts           # Auto-push to GitHub every 10 min
shared/                    # Shared code
  schema.ts                # Drizzle DB schema + TypeScript types
migrations/                # SQL migration files
```

## App Navigation (Tower mode)
| Tab | Component | Purpose |
|-----|-----------|---------|
| FLOTA | `Flota` (flota.tsx) | Fleet GPS en vivo + combustible sub-tabs |
| VIAJES | `ViajesTMS` (viajes-tms.tsx) | Trip analysis: executive summary, daily detail, rankings |
| CONTRATOS | Inline `ContratosUnificado` | Per-contract KPIs, routes, top/bottom trucks |
| COMBUSTIBLE | `EstacionesTab` | Fuel stations, ECU consumption monitoring |
| CAMIONES | Inline `CamionesUnificado` | Individual truck search, monthly calendar |
| CONTROL | Inline `ControlCenter` | Speed alerts, fuel deviations, route anomalies |
| BRAIN | `OperativeBrain` | AI multi-agent chat and fleet diagnostics |
| CONDUCTORES | `ConductoresPanel` | Driver management |
| APP CONDUCTOR | `AppConductorHub` | Driver app management |
| SISTEMA | Inline `SistemaTab` | Volvo Connect status, geocercas, motor aprendizaje |

## Fleet Composition (72 trucks)
| Faena | Camiones |
|-------|----------|
| CENCOSUD | 41 |
| ANGLO-COCU | 14 |
| ANGLO-CARGAS VARIAS | 12 |
| ANGLO-CAL | 5 |

## Cencosud TMS — Trip Detection & Billing
- **96 KML geocercas** imported to `cencosud_geocercas_kml` (primary source)
- **Point-in-polygon** (ray-casting) detection in `geocerca-inteligente.ts`
- **T-1 Reconstructor v2** (`t1-reconstructor.ts`): Post-hoc trip reconstruction from GPS data
  - Detección: point-in-polygon con polígonos KML reales (96 geocercas), radio 150m fallback solo para geocercas operacionales sin polígono
  - Dwell: CDs 15min, other 10min (reduced from 30min)
  - Only creates trips between geocercas WITH confirmed alias (no noise from unmapped geocercas)
  - Saves ALL trips: FACTURADO (with tarifa) or PENDIENTE (without)
  - Loads KML geocercas first, then geocercas_operacionales (no duplicates)
  - ~67-76% facturable rate on real data
- **Anglo data purged**: All Anglo geocercas, aliases, tarifas, trips, and GPS removed (April 2026)
- **Billing flow**: GPS → geocerca → alias → tarifa → facturación
- **Super Agente Cencosud** (`super-agente-cencosud.ts`): runs every 30 min
- **P&L Engine** (`pl-engine.ts`): Per-trip cost/revenue/margin calculation
  - `calcularPLViajes()`: Backfills all trips with cost_diesel, cost_cvm, ingreso_tarifa, margen_bruto
  - `calcularPLResumenDiario(fecha)`: Daily P&L aggregation
  - `calcularPLResumenMes(YYYY-MM)`: Monthly P&L aggregation
  - Auto-runs after T-1 reconstruction and after interactive geocerca mapping
  - **Parameters** (`cencosud_parametros` table): precio_diesel=1110, cvm_km=450, costo_conductor_dia=45000, costo_fijo_dia=35000
  - **P&L columns** on `viajes_aprendizaje`: costo_diesel, costo_cvm, costo_total, ingreso_tarifa, margen_bruto, tarifa_id, tarifa_clase
  - **API endpoints**: GET `/api/cencosud/pl/mes?mes=YYYY-MM`, GET `/api/cencosud/pl/dia?fecha=YYYY-MM-DD`, POST `/api/cencosud/pl/calcular`

## Background Processes
- Multi-agent AI: Operations + General Manager (every 15 min), Contracts (every 1 hour)
- Super Agente Cencosud (every 30 min) — billing intelligence + auto-alias
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
- `VOLVO_CONNECT_USER`, `VOLVO_CONNECT_PASSWORD` - Volvo Connect rFMS API
- `GITHUB_TOKEN` - For auto-sync to GitHub
- `VITE_GOOGLE_MAPS_KEY` - Google Maps API key
- `SESSION_SECRET` - Express session secret
- `PORT` - Set to 5000

## Deployment
- Target: autoscale
- Build: `npm run build`
- Run: `node dist/index.cjs`

## Tower Navigation (6 tabs)
- **FLOTA**: Live GPS map, fleet status, positions, speed
- **CAMIONES**: Individual truck detail, monthly calendar, rendimiento
- **BRAIN**: AI multi-agent chat, predictions, anomalies
- **CONDUCTORES**: Driver management panel
- **APP CONDUCTOR**: Driver app hub
- **SISTEMA**: System health, geocercas, data flow diagram

Removed tabs: VIAJES (Sigetra dependency), CONTRATOS (phantom contracts), COMBUSTIBLE (Sigetra comparison), CONTROL (fuel deviations needed Sigetra). TMS Cencosud is accessed from Welcome screen as a standalone view.

## Cleanup History
- **April 2026 Tower Cleanup**: Removed 4 dead tabs (VIAJES, CONTRATOS, COMBUSTIBLE, CONTROL) from Tower. Removed ~420 lines of dead code (ContratosUnificado, ControlCenter, MiniMapaGoogle, focoAlerta). Tower now has 6 focused tabs. TMS Cencosud accessed from Welcome screen.
- **April 2026 Anglo Purge**: All Anglo geocercas, aliases, tarifas, trips, and GPS removed. VOLVO_ECU Cencosud trips purged (1,392 deleted). T-1 Reconstructor v2 is the only source for Cencosud trips.
- **April 2026 Major Cleanup**: Removed Sigetra completely (API, components, all UI references). Removed WiseTrack GPS. Cleaned database from ~825 to 72 active Volvo-only trucks. Removed dead pages (ranking-conductores sub-tab, errores sub-tab, anglo.tsx, super-agente-anglo.ts). Updated all UI text from "581 camiones" to "72 camiones". Removed all Sigetra labels, matching panels, cuadratura sections, and comparison tables from SISTEMA tab. Leaflet fully removed — all maps use Google Maps.

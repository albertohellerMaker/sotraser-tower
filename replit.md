# SOTRASER - Fleet Intelligence Dashboard

## Overview
A comprehensive fleet management system for a Chilean trucking company (~968 trucks). Integrates real-time GPS tracking and telemetry from Volvo Connect (rFMS) with fuel transaction data from the Sigetra portal to optimize fleet operations, detect fuel anomalies, and provide AI-driven insights.

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
client/                    # React frontend (Vite)
  src/
    components/            # UI components including shadcn/ui primitives
    pages/                 # 21 page files (cleaned from 48)
      flota.tsx            # Fleet overview (P90/P75/P50 tables, rankings)
      viajes-tms.tsx       # Trip analysis (executive summary, daily/monthly)
      combustible-tms.tsx  # Fuel management
      operative-brain.tsx  # AI brain with multi-agent chat
      cencosud.tsx         # Dedicated Cencosud TMS
      geovalidator.tsx     # Route validation and geofence management
      validador-cruzado.tsx # Cross-validation Volvo + Sigetra (6 sub-tabs)
      volvo.tsx            # Volvo Connect truck status and map
      camiones.tsx         # Individual truck view with faena filter
      ranking-conductores.tsx # Driver performance ranking
      sigetra-fusion.tsx   # Sigetra data fusion analysis
      micro-cargas.tsx     # Suspicious micro-fuel-load detection
      errores.tsx          # Data quality errors (physically impossible values)
      not-found.tsx        # 404 page
      geo-tabs/            # 6 geo sub-tab components
        mapa-en-vivo.tsx   # Live fleet map
        viajes-cerrados.tsx # Completed trips
        rutas-operacionales.tsx # Operational routes
        acumulacion-tab.tsx # Accumulation analysis
        analisis-ia-tab.tsx # AI route analysis
        estaciones-tab.tsx  # Fuel station monitoring
        shared-components.tsx # Shared UI (status dots, badges)
    lib/                   # Frontend utilities, API clients, fuel calculation logic
server/                    # Express backend
  agentes/                 # AI agent logic (Operations, Contracts, General Manager)
  utils/                   # GPS filtering, VIN mapping, truck matching (gps-unificado.ts)
  *-routes.ts              # Domain-specific API routes
  validador-cruzado.ts     # Cross-validation Volvo + Sigetra
  github-sync.ts           # Auto-push to GitHub every 10 min
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
| CAMIONES | Inline `CamionesUnificado` | Individual truck search, monthly calendar, Sigetra cargas |
| CONTROL | Inline `ControlCenter` | Speed alerts, fuel deviations, route anomalies |
| BRAIN | `OperativeBrain` | AI chat with fleet data, PDF reports, autonomous agents |
| SISTEMA | Inline `SistemaTab` | Sync status, Volvo+Sigetra matching, geocercas |

## Cencosud TMS — Trip Detection & Billing
- **96 KML geocercas** imported to `cencosud_geocercas_kml` (30 Santa Isabel, 17 Jumbo, 10 Clientes, 8 CDs, 8 Copec, 6 Zonas, 6 Bases, 5 Peajes, 4 Descanso)
- **Point-in-polygon** (ray-casting) detection in `geocerca-inteligente.ts` — exact KML coordinates, no modifications
- **10-minute dwell time** required to activate a geocerca as trip origin/destination
- **Copec/Shell/Servicentro** = fuel stops (`es_combustible: true`), NOT trip destinations
- **KML priority**: Only evaluated for contrato=CENCOSUD; non-Cencosud trips skip KML entirely
- **Billing flow**: GPS → KML polygon → geocerca name → alias (`geocerca_alias_contrato`) → tarifa (`contrato_rutas_tarifas`) → facturación
- **Super Agente Cencosud** (`super-agente-cencosud.ts`): runs every 30 min, GPS-proximity auto-aliasing (30km radius, 5km for CD/CT), trayecto consolidation (4h window), billing intelligence. Dedicated UI tab (AGENTE) with sub-tabs: INTELIGENCIA (billing by lote, trayectos, sin mapear), ALIAS GPS (confirm/manage), ALERTAS, PARÁMETROS, CHAT
- **Trayecto consolidation** (`cencosud-trayectos.ts`): merges GPS segments into full point-to-point trajectories — fuel stops and base passes become `paradas_intermedias`, trip closes only at real KML destination with ≥10 min dwell. MAX_GAP=6h, MAX_CONSOLIDAR=8. Stored in `cencosud_trayectos` table. Job runs every 15 min. API: `GET /api/cencosud/trayectos?fecha=YYYY-MM-DD&dias=7`

## Background Processes
- Multi-agent AI: Operations + General Manager (every 15 min), Contracts (every 1 hour)
- Super Agente Cencosud (every 30 min) — billing intelligence + auto-alias
- Sigetra fuel sync (every 1 hour)
- Daily report at 06:00
- Overnight reconciliation at 03:00
- GitHub auto-push every 10 minutes
- Trayecto consolidation every 15 min (3 min delay on boot)
- VIN-patente refresh on boot

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

## Database Stats
- 972 trucks (323 with Volvo VIN, 649 Sigetra-only)
- 1754 geocercas operacionales
- 96 KML geocercas Cencosud
- 909 aliases geocerca → ciudad contrato (auto-geo-30km)
- 141 tarifas activas Cencosud (inter-CD, inversas, inter-ciudad)
- 11 active contracts
- 176 VINs mapped via camion_identidades
- ~302K GPS points (294K live + 8K backfill)
- ~35K fuel snapshots (162 VINs)

## Volvo Connect Historical Backfill
- **`server/volvo-backfill.ts`**: Fetches historical GPS positions + fuel/distance snapshots from Volvo rFMS API
- **API endpoints**: `POST /api/geo/backfill` (trigger), `GET /api/geo/backfill/progress` (status)
- **rFMS limitation**: Only last 14 days of historical data available via API
- **Range functions**: `getVehicleStatusesRange()` and `getVehiclePositionsRange()` in `volvo-api.ts` use `starttime`/`stoptime` params with pagination (max pages configurable)
- **Rate limiting**: 1.1s delay between API pages, 1.5s between chunks to respect Volvo's 1 req/s limit
- **Data stored**: GPS → `geo_puntos` (fuente='VOLVO_BACKFILL') + `gps_unificado`, Fuel → `volvo_fuel_snapshots`
- **Trip rebuild**: After backfill, trigger `POST /api/viajes/sync-historico` to reconstruct trips from enriched data

## Cleanup History
- WiseTrack GPS fully removed (April 2026). Code, DB tables (wisetrack_snapshots, wt_productividad_diaria, wt_viajes), and all "triple verificado" / "3 sistemas" DNA eliminated.
- 27 orphaned frontend pages deleted (reduced from 48 to 21 active pages).
- 37 dead trucks removed (no VIN, no recent Sigetra cargas).
- Duplicate `client 2/` directory removed.
- Volvo Connect credentials fixed (April 2026): User=1615691745, password corrected (O not 0).

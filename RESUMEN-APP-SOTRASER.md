# SOTRASER Fleet Intelligence Dashboard — Resumen por Unidad de Negocio

## Contexto General
App de gestión de flota para SOTRASER, empresa de transporte chilena. Monorepo npm (client + server + shared). React 18 + Express 5 + PostgreSQL (Neon). Fuente de datos GPS: WiseTrack API (`ei.wisetrack.cl/Sotraser/TelemetriaDetalle`). Publicada en Replit (VM 24/7).

**Base de datos Neon:** 83 tablas, 1M+ posiciones GPS, 125 camiones, 308 geocercas operacionales, 1,144 alias de geocercas, 151 rutas tarifadas, 170 perfiles de conductores, 1,474 cargas de combustible.

---

## 1. UNIDAD CENCOSUD (Foco Principal)

### Descripcion
Contrato de distribución retail. Es la unidad con mayor desarrollo en la app: dashboard propio, P&L, control diario, mapa en vivo, sistema de tarifas, y agente IA dedicado.

### Frontend (`client/src/pages/cencosud.tsx`)
10 tabs internos:
- **EN VIVO**: Mapa Leaflet con camiones en tiempo real, trails GPS, seguimiento por patente
- **CONTROL**: Panel de control diario — estado operacional por camión
- **RESUMEN**: KPIs mensuales (viajes, km, rendimiento, ingreso proyectado)
- **VIAJES**: Detalle de viajes con cruce de tarifas y estado de facturación
- **ERR** (Estado de Resultados): P&L diario y mensual con ingresos vs costos
- **RUTAS**: Gestión de rutas GPS y mapeo interactivo
- **FLOTA**: Camiones asignados al contrato
- **AGENTE**: Chat IA (Super Agente Cencosud) con análisis automático
- **TARIFAS**: CRUD de rutas tarifadas (origen → destino → tarifa CLP)
- **MAPA**: Mapeo interactivo de geocercas GPS a nombres contractuales

### Backend
- **`server/cencosud-routes.ts`** (1,407 líneas): Dashboard, resumen-mes, viajes-mes, control-diario, P&L, ERR, gestión de alias, tarifas, reconstrucción T-1
- **`server/cencosud-filter.ts`**: Filtrado optimizado de flota CENCOSUD
- **`server/t1-reconstructor.ts`** (790 líneas): Reconstrucción automática de viajes T-1 desde GPS. Usa geocercas + polígonos KML para detectar origen/destino. Inserta en `viajes_aprendizaje`
- **`server/agentes/super-agente-cencosud.ts`**: Agente IA dedicado — reconstruye viajes diarios, ejecuta backlog de 30 días, genera alias GPS automáticos
- **`server/agentes/cencosud.ts`**: Análisis contractual IA específico
- **`server/pl-engine.ts`**: Motor de P&L — calcula ingresos estimados cruzando viajes con tarifas

### Tablas clave
- `viajes_aprendizaje` — viajes reconstruidos por T-1 (origen, destino, km, duración, tarifa)
- `geocerca_alias_contrato` — mapeo entre nombre GPS (ej: "CD CENCOSUD LO ESPEJO") y nombre contractual (ej: "CD Lo Espejo")
- `contrato_rutas_tarifas` — tarifas por ruta (origen_contrato → destino_contrato → CLP)
- `cencosud_geocercas` / `cencosud_geocercas_kml` — geocercas con polígonos KML para detección precisa
- `cencosud_trayectos` — trayectos consolidados para análisis de rutas

### Estado actual
- 35 viajes reconstruidos en `viajes_aprendizaje` (solo 3 días con GPS suficiente: marzo 6-9)
- 2,078 viajes en `viajes_diarios` (todos los contratos, marzo 17-31)
- GPS CENCOSUD: solo 9 días con datos (marzo 6-9 con volumen, resto disperso)
- Último dato GPS CENCOSUD: 6 de abril 2026

---

## 2. UNIDAD GPS / WISETRACK (Motor de Datos)

### Descripcion
Sistema central de captura y procesamiento de datos GPS. Es el motor que alimenta todas las demás unidades.

### Frontend (`client/src/pages/wisetrack-app.tsx`)
Tab SISTEMA en la app principal — monitoreo de conexión WiseTrack, historial de sync, estado de API.

### Backend
- **`server/wisetrack-api.ts`**: Cliente API WiseTrack. Polling cada 60s, consume buffer de telemetría. SSL con `rejectUnauthorized: false`. Token: `WISETRACK_API_TOKEN`
- **`server/wisetrack-routes.ts`**: Endpoints en-vivo, historial GPS, TMS en-vivo, detalle de telemetría por camión

### Workers
- **Sync continuo**: Consume 1,000 registros por ciclo desde el buffer WiseTrack
- **Vehículos**: 476 entradas en `wisetrack_vehiculos` (mapeo movil → patente)

### Tablas clave
- `wisetrack_posiciones` — 1M+ registros GPS (patente, fecha, lat, lng, velocidad, ignicion, grupo1, conductor, kms_total, consumo_litros, rpm, temp_motor)
- `wisetrack_telemetria` — datos crudos por wt_id
- `wisetrack_vehiculos` — registro de vehículos WiseTrack

---

## 3. UNIDAD COMBUSTIBLE (Fuel Intelligence)

### Descripcion
Análisis de rendimiento de combustible, detección de fraude, validación de cargas ECU vs surtidor.

### Frontend
- Tab COMBUSTIBLE en vista Flota
- `client/src/pages/micro-cargas.tsx` — detección de cargas sospechosas de bajo volumen
- Componentes de ADN de combustible por camión

### Backend
- **`server/combustible-routes.ts`**: Validación de cargas, detección de fraude, ADN de combustible, rankings de eficiencia
- **`server/tower-routes.ts`**: Análisis de rendimiento por percentiles, detección de paradas, resumen de flota

### Tablas clave
- `cargas` — 1,474 eventos de carga (litros, proveedor, odómetro)
- `patrones_carga_combustible` — patrones históricos por camión y par camión-estación
- `desviacion_checks` — flags de camiones con rendimiento anómalo
- `adn_combustible` — fingerprint de consumo por camión
- `alzas_nivel_sin_carga` — detección de alzas de nivel sin evento de carga registrado

---

## 4. UNIDAD FLOTA GENERAL (Fleet Overview)

### Descripcion
Vista operacional general de toda la flota, sin filtro de contrato.

### Frontend
- `client/src/pages/flota.tsx` — grid de camiones activos (ignición, velocidad, combustible)
- `client/src/pages/camiones.tsx` — ficha detallada por camión (GPS histórico, RPM, temperatura)
- `client/src/pages/geo-tabs/mapa-en-vivo.tsx` — mapa operacional con todos los camiones

### Backend
- **`server/routes.ts`**: CRUD de faenas, camiones, cargas. Dashboard KPIs generales
- **`server/supervision-engine.ts`**: Monitoreo predictivo — compara estado actual vs esperado por camión

### Tablas clave
- `camiones` — 125 camiones (patente, VIN, modelo, specs)
- `camion_identidades` — mapeo multi-ID (VIN, patente, números internos)
- `camiones_perfil` — métricas de rendimiento por camión
- `estado_camion_esperado` — expectativas calculadas para supervisión predictiva
- `faenas` — sitios operacionales / minas / bases

---

## 5. UNIDAD CONDUCTORES (Driver Performance)

### Descripcion
Evaluación de conductores por seguridad y eficiencia de combustible.

### Frontend
- `client/src/pages/conductores-panel.tsx` — rankings, perfiles de conducción
- `client/src/pages/app-conductor-hub.tsx` — vista mobile para conductores (sus propios stats)

### Backend
- **`server/conductor-routes.ts`**: API para app de conductores (login, viajes asignados, ubicación, novedades/incidentes)
- **`server/conductor-panel-routes.ts`**: Panel de gestión desde el lado operaciones
- **`server/drivers-routes.ts`**: Evaluación de conductores y scoring

### Tablas clave
- `conductores_perfil` — 170 perfiles (km total, eficiencia promedio, score de seguridad)
- `parametros_score_conduccion` — benchmarks (percentiles) para rankings
- `mensajes_conductor` — comunicación con conductores
- `novedades_conductor` — incidentes reportados (accidentes, retrasos)

---

## 6. UNIDAD GEO / GEOCERCAS (Spatial Intelligence)

### Descripcion
Motor espacial: geocercas, detección de visitas, reconstrucción de trayectorias, reverse geocoding.

### Frontend
- `client/src/components/mapa-geocercas-cencosud.tsx` — visualización de geocercas en mapa
- `client/src/pages/geo-tabs/estaciones-tab.tsx` — gestión de estaciones y geocercas

### Backend
- **`server/geo-routes.ts`**: CRUD geocercas/bases, reconstrucción de trayectorias, detección de viajes desde GPS
- **`server/rutas-gps-routes.ts`**: Acumulación de viajes GPS, rutas automáticas

### Tablas clave
- `geocercas_operacionales` — 308 geocercas (nombre, lat, lng, radio, tipo)
- `geo_lugares` — puntos de interés (bases, CDs, estaciones)
- `geo_puntos` — puntos GPS procesados para trayectorias
- `geo_visitas` — log de entrada/salida a geocercas
- `geo_trayectorias` — reconstrucción de rutas
- `geo_bases` — bases operacionales con radios definidos

---

## 7. UNIDAD IA / MULTI-AGENTE (Artificial Intelligence)

### Descripcion
Sistema de agentes IA autónomos que simulan roles organizacionales. Usan Claude (Anthropic).

### Backend — Agentes (`server/agentes/`)
| Agente | Archivo | Función |
|--------|---------|---------|
| Operaciones | `operaciones.ts` | Detecta alertas (excesos velocidad, baja eficiencia, pérdida GPS) |
| Gerente General | `gerente-general.ts` | Prioriza alertas, evalúa salud general, emite directivas |
| Gerente Ops | `gerente-ops.ts` | Salud del sistema, memoria de patrones aprendidos |
| Contrato | `contrato.ts` | Análisis KPI por contrato (viajes, consumo, score) |
| Cencosud | `cencosud.ts` | Georeferenciación y tarifas específicas Cencosud |
| Super Agente Cencosud | `super-agente-cencosud.ts` | Reconstrucción T-1, backlog 30 días, alias GPS |
| Predictor | `predictor.ts` | Proyecciones de KPIs |
| CEO | `ceo.ts` | Resúmenes ejecutivos |
| Analista | `analista.ts` | Análisis profundos |
| Reportero | `reportero.ts` | Generación de reportes automáticos |
| Monitor | `monitor.ts` | Monitoreo continuo |
| Gestor | `gestor.ts` | Gestión de acciones |

### Rutas IA
- **`server/brain-routes.ts`**: Chat IA ejecutivo, predicciones, detección de anomalías macro
- **`server/ia-routes.ts`**: Insights IA, detección de patrones fraude/robo, reportes semanales
- **`server/cerebro-routes.ts`**: Estado de madurez del sistema, objetivos de aprendizaje
- **`server/agentes-routes.ts`**: Control del sistema multi-agente (status, mensajes, forzar ejecución)

### Workers
- **Ciclo rápido (15 min)**: Agente Operaciones + Predictor + Gerente General
- **Ciclo profundo (1 hora)**: Agente Contrato + Cencosud + Gerente Ops

### Tablas clave
- `agentes` — estado de cada agente
- `agente_mensajes` / `agente_acciones` — comunicación inter-agentes
- `geo_analisis_ia` — análisis periódicos
- `alertas_aprendizaje` — anomalías detectadas
- `aprendizaje_feedback` — feedback humano sobre decisiones IA
- `reportes_sistema` — resúmenes ejecutivos generados
- `parametros_adaptativos` — umbrales estadísticos que evolucionan

---

## 8. UNIDAD TMS (Transport Management System)

### Descripcion
Sistema de gestión de transporte — contratos, viajes formales, paradas.

### Backend
- **`server/tms-routes.ts`**: CRUD de contratos TMS, asignación de faenas a contratos
- **`server/viajes-tms-routes.ts`**: Viajes TMS formales con origen/destino/timestamps

### Tablas clave
- `tms_contratos` — contratos de transporte
- `tms_viajes` — viajes formales (origen, destino, odómetro, estado DETECTADO)
- `tms_paradas` / `tms_puntos` — checkpoints y puntos de ruta

---

## 9. CONTRATOS ACTIVOS (Dinámicos desde DB)

Los contratos se detectan dinámicamente desde `viajes_aprendizaje` (km_ecu > 0 en últimos 7-30 días). Incluyen:

| Tipo | Contratos |
|------|-----------|
| **Retail** | CENCOSUD (principal), Walmart, Jumbo, Lider, Santa Isabel, Unimarc |
| **Minería** | Anglo American (Los Bronces, El Soldado), Glencore (Ácido, Ánodos, PLS), Codelco |
| **Forestal** | Mininco |
| **Industrial** | Indura |
| **Lácteos** | Estanques Lecheros |
| **Combustible** | Copec, Shell, Petrobras, Enex, Terpel |

---

## Arquitectura Técnica

### Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui, Recharts, Leaflet (react-leaflet 4.2.1)
- **Backend**: Node.js, Express 5, TypeScript (ESM), esbuild
- **Database**: PostgreSQL (Neon) — 83 tablas, Drizzle ORM
- **IA**: Anthropic Claude via `ANTHROPIC_API_KEY`
- **GPS**: WiseTrack API (polling 60s, SSL self-signed)
- **Hosting**: Replit VM (24/7)

### Archivos de rutas (21 archivos)
```
server/routes.ts                  — Core entities + dashboard
server/cencosud-routes.ts         — Contrato CENCOSUD (1,407 líneas)
server/wisetrack-routes.ts        — GPS en vivo + historial
server/brain-routes.ts            — IA ejecutiva + chat
server/tower-routes.ts            — Monitoreo operacional
server/combustible-routes.ts      — Fuel analysis
server/ceo-routes.ts              — KPIs ejecutivos
server/ia-routes.ts               — Insights IA
server/agentes-routes.ts          — Control multi-agente
server/gerente-routes.ts          — Gerente Ops
server/conductor-routes.ts        — API conductores (mobile)
server/conductor-panel-routes.ts  — Panel conductores
server/drivers-routes.ts          — Evaluación conductores
server/geo-routes.ts              — Geocercas + spatial
server/cerebro-routes.ts          — Brain status
server/tms-routes.ts              — TMS contratos
server/viajes-tms-routes.ts       — Viajes TMS
server/rutas-gps-routes.ts        — Rutas GPS automáticas
server/estaciones-routes.ts       — Estaciones combustible
server/bi-routes.ts               — Business intelligence
server/welcome-routes.ts          — Onboarding
```

### Workers (procesos separados)
```
server/workers/jobs-worker.ts     — Jobs cada 5-30min + diarios
server/workers/agents-worker.ts   — Agentes IA cada 15min-1h
server/worker-manager.ts          — Spawn + monitor de workers
```

### Archivos clave del motor
```
server/wisetrack-api.ts           — Cliente WiseTrack API
server/t1-reconstructor.ts        — Reconstrucción de viajes T-1 (790 líneas)
server/pl-engine.ts               — Motor P&L
server/supervision-engine.ts      — Supervisión predictiva
server/viajes-historico.ts        — Detección de viajes desde GPS
server/faena-filter.ts            — Filtro de contratos activos
server/github-sync.ts             — Auto-push a GitHub cada 10min
```

### Conexión a DB
- **Desarrollo**: `.env` file override → Neon production DB
- **Producción**: `NEON_DATABASE_URL` env var → Neon (priority over Replit's empty DB)
- Código en `server/db.ts`: `const dbUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL`

### Credenciales
- Login app: usuario=`beto`, clave=`1234`
- WiseTrack Token: env var `WISETRACK_API_TOKEN`
- Anthropic: env var `ANTHROPIC_API_KEY`
- GitHub sync: env var `GITHUB_TOKEN`
- Conductor API: header `X-API-Key` con `CONDUCTOR_API_KEY`

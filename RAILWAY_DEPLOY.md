# Deploy SOTRASER en Railway (24/7)

## 1. Conectar repo en Railway
1. Ir a https://railway.app → **New Project** → **Deploy from GitHub repo**
2. Autorizar acceso al repo `albertohellerMaker/sotraser-tower`
3. Seleccionar branch `main`

## 2. Variables de entorno (obligatorias)
Pegar en Railway → Service → Variables:

| Variable | Valor / Origen |
|---|---|
| `NEON_DATABASE_URL` | Cadena Neon completa (`postgresql://...`) — la misma del `.env` actual |
| `ANTHROPIC_API_KEY` | Tu key de Anthropic |
| `WISETRACK_USER` | Usuario WiseTrack |
| `WISETRACK_PASS` | Password WiseTrack |
| `SIGETRA_URL` | URL Sigetra |
| `SIGETRA_USER` | Usuario Sigetra |
| `SIGETRA_PASSWORD` | Password Sigetra |
| `VOLVO_CONNECT_USER` | Usuario Volvo Connect |
| `VOLVO_CONNECT_PASSWORD` | Password Volvo Connect |
| `SESSION_SECRET` | String aleatorio largo (ej: `openssl rand -hex 32`) |
| `VITE_GOOGLE_MAPS_KEY` | Key Google Maps |
| `NODE_ENV` | `production` |

> `PORT` lo asigna Railway automáticamente. No setearlo a mano.

## 3. Build & deploy
- Railway detecta `railway.json` y `nixpacks.toml` automáticamente.
- Builder: **NIXPACKS** (Node 22)
- Start: `npm start` (corre `dist/index.cjs`)
- Healthcheck: `GET /healthz` (timeout 60s)
- Restart policy: **ON_FAILURE** (hasta 10 reintentos)

## 4. Verificar que funciona
1. Abrir `https://<tu-dominio>.up.railway.app/healthz` → debe devolver `{ ok: true, ... }`
2. Abrir `https://<tu-dominio>.up.railway.app` → splash + login
3. Login: `beto` / `1234`
4. Logs Railway deben mostrar:
   - `[express] serving on port XXXX`
   - `[WISETRACK] Sync engine iniciando`
   - `[T1] ═══ Reconstrucción T-1 v2 para YYYY-MM-DD ═══`

## 5. Dominio custom (opcional)
Railway → Settings → Networking → **Generate Domain** o **Custom Domain**.

## 6. Mantener 24/7
- Railway por defecto NO duerme el servicio (a diferencia de free tier de otros).
- Usage limit del Hobby plan: $5/mes incluido. Monitorear en Railway → Usage.
- Para que el T-1 corra todos los días sin parar: el scheduler interno (`super-cencosud`) ya está programado para las 05:00 UTC.

## 7. Si algo falla
- Logs: Railway → Deployments → últimas líneas del log
- Common errors:
  - `DATABASE_URL must be set` → falta `NEON_DATABASE_URL` en variables
  - `EADDRINUSE` → reiniciar el deployment
  - `Module not found` → revisar que `npm install` corrió en build (Railway lo hace automático con nixpacks)

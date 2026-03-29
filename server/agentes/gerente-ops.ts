import { pool } from "../db";
import { enviarMensaje } from "./index";

export const agenteGerenteOps = {
  id: "agente-gerente-ops",

  async ejecutar() {
    console.log("[GERENTE-OPS] Ejecutando...");
    try {
      const [r1, r2, r3] = await Promise.allSettled([
        this.resolverPuntosDesconocidos(),
        this.ajustarParametros(),
        this.aprenderCorredores(),
      ]);
      await pool.query("UPDATE agentes SET ultimo_ciclo = NOW(), ciclos_completados = ciclos_completados + 1, errores_consecutivos = 0 WHERE id = $1", ["agente-gerente-ops"]);
      console.log("[GERENTE-OPS] Ciclo completado");
    } catch (e: any) { console.error("[GERENTE-OPS]", e.message); }
  },

  // ── CAPACIDAD 1: Resolver puntos desconocidos
  async resolverPuntosDesconocidos() {
    const viajes = await pool.query(`
      SELECT va.id, c.patente, va.contrato, va.origen_nombre, va.destino_nombre,
        va.origen_lat::float as olat, va.origen_lng::float as olng, va.destino_lat::float as dlat, va.destino_lng::float as dlng
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE (va.origen_nombre = 'Punto desconocido' OR va.origen_nombre IS NULL OR va.destino_nombre = 'Punto desconocido' OR va.destino_nombre IS NULL)
        AND va.fecha_inicio >= NOW() - INTERVAL '7 days' AND va.km_ecu > 20
        AND (va.origen_lat IS NOT NULL OR va.destino_lat IS NOT NULL)
      LIMIT 100
    `);

    let resueltos = 0;
    for (const v of viajes.rows) {
      if ((!v.origen_nombre || v.origen_nombre === "Punto desconocido") && v.olat) {
        const nombre = await this.resolverCoordenadas(v.olat, v.olng);
        if (nombre) { await pool.query("UPDATE viajes_aprendizaje SET origen_nombre = $1 WHERE id = $2", [nombre, v.id]); resueltos++; }
      }
      if ((!v.destino_nombre || v.destino_nombre === "Punto desconocido") && v.dlat) {
        const nombre = await this.resolverCoordenadas(v.dlat, v.dlng);
        if (nombre) { await pool.query("UPDATE viajes_aprendizaje SET destino_nombre = $1 WHERE id = $2", [nombre, v.id]); resueltos++; }
      }
    }

    if (resueltos > 0) {
      await this.registrarAprendizaje("LUGAR_RESUELTO", `Resolvió ${resueltos} puntos desconocidos`, {}, { resueltos }, 0.8, resueltos);
      console.log(`[GERENTE-OPS] ${resueltos} puntos resueltos`);
    }
    return resueltos;
  },

  async resolverCoordenadas(lat: number, lng: number): Promise<string | null> {
    // 1. Buscar en geocercas operacionales
    const geo = await pool.query(`SELECT nombre FROM geocercas_operacionales WHERE activa = true AND ABS(lat - $1) < 0.05 AND ABS(lng - $2) < 0.05 ORDER BY ABS(lat - $1) + ABS(lng - $2) LIMIT 1`, [lat, lng]);
    if (geo.rows.length > 0) return geo.rows[0].nombre;

    // 2. Buscar en lugares conocidos
    const lc = await pool.query(`SELECT nombre FROM lugares_conocidos WHERE activa = true AND ABS(lat - $1) < 0.02 AND ABS(lng - $2) < 0.02 ORDER BY ABS(lat - $1) + ABS(lng - $2) LIMIT 1`, [lat, lng]);
    if (lc.rows.length > 0) return lc.rows[0].nombre;

    // 3. Buscar en viajes históricos con nombre
    const hist = await pool.query(`SELECT origen_nombre as nombre FROM viajes_aprendizaje WHERE origen_nombre IS NOT NULL AND origen_nombre != 'Punto desconocido' AND ABS(origen_lat::float - $1) < 0.01 AND ABS(origen_lng::float - $2) < 0.01 LIMIT 1`, [lat, lng]);
    if (hist.rows.length > 0) {
      // Aprender para el futuro
      await pool.query(`INSERT INTO lugares_conocidos (nombre, lat, lng, tipo, fuente) VALUES ($1, $2, $3, 'PARADA', 'GERENTE_BOT') ON CONFLICT DO NOTHING`, [hist.rows[0].nombre, lat, lng]);
      return hist.rows[0].nombre;
    }

    // 4. Google Maps reverse geocoding
    try {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return null;
      const https = require("https");
      const result: any = await new Promise((resolve) => {
        https.get(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&language=es&result_type=locality|sublocality|route`, (res: any) => {
          let data = ""; res.on("data", (c: string) => data += c);
          res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
        }).on("error", () => resolve(null));
      });

      if (result?.status === "OK" && result.results?.[0]) {
        const addr = result.results[0].address_components || [];
        const locality = addr.find((c: any) => c.types.includes("locality"))?.long_name;
        const route = addr.find((c: any) => c.types.includes("route"))?.long_name;
        let nombre = route ? `${route} · ${locality || ""}` : locality || null;
        if (nombre) {
          nombre = nombre.substring(0, 50);
          await pool.query(`INSERT INTO lugares_conocidos (nombre, lat, lng, tipo, fuente) VALUES ($1, $2, $3, 'PARADA', 'GERENTE_BOT') ON CONFLICT DO NOTHING`, [nombre, lat, lng]);
          return nombre;
        }
      }
    } catch { /* silent */ }

    return null;
  },

  // ── CAPACIDAD 2: Ajustar parámetros adaptativos
  async ajustarParametros() {
    const rendFlota = await pool.query(`
      SELECT ROUND(AVG(rendimiento_real)::numeric, 2) as prom, ROUND(STDDEV(rendimiento_real)::numeric, 2) as desv
      FROM viajes_aprendizaje WHERE fecha_inicio >= NOW() - INTERVAL '14 days' AND rendimiento_real > 0 AND rendimiento_real < 10 AND km_ecu > 50
    `);
    const r = rendFlota.rows[0];
    if (r.prom && r.desv) {
      const nuevoCritico = Math.max(1.5, parseFloat(r.prom) - 2 * parseFloat(r.desv));
      const actual = await pool.query("SELECT valor::float as v FROM sistema_parametros WHERE clave = 'rendimiento_critico_kmL'");
      const act = actual.rows[0]?.v || 2.0;
      if (Math.abs(nuevoCritico - act) > 0.1) {
        await pool.query("UPDATE sistema_parametros SET valor = $1, modificado_por = 'GERENTE_BOT', ultima_modificacion = NOW() WHERE clave = 'rendimiento_critico_kmL'", [nuevoCritico.toFixed(2)]);
        await this.registrarAprendizaje("PARAMETRO_AJUSTADO", `Rendimiento crítico: ${act} → ${nuevoCritico.toFixed(2)} km/L`, { anterior: act }, { nuevo: nuevoCritico.toFixed(2) }, 0.85, 0);
        console.log(`[GERENTE-OPS] Umbral rendimiento: ${act} → ${nuevoCritico.toFixed(2)}`);
      }
    }
  },

  // ── CAPACIDAD 3: Aprender corredores nuevos
  async aprenderCorredores() {
    const rutas = await pool.query(`
      SELECT origen_nombre, destino_nombre, contrato, COUNT(*)::int as veces,
        ROUND(AVG(km_ecu)::numeric) as km_prom, ROUND(AVG(rendimiento_real) FILTER (WHERE rendimiento_real > 0 AND rendimiento_real < 10)::numeric, 2) as rend_prom
      FROM viajes_aprendizaje
      WHERE origen_nombre IS NOT NULL AND destino_nombre IS NOT NULL AND origen_nombre != 'Punto desconocido' AND destino_nombre != 'Punto desconocido'
        AND corredor_id IS NULL AND km_ecu > 30 AND fecha_inicio >= NOW() - INTERVAL '30 days'
      GROUP BY origen_nombre, destino_nombre, contrato HAVING COUNT(*) >= 3
      ORDER BY veces DESC LIMIT 20
    `);

    let nuevos = 0;
    for (const r of rutas.rows) {
      const existe = await pool.query("SELECT id FROM corredores WHERE origen_nombre = $1 AND destino_nombre = $2 AND contrato = $3 AND activo = true", [r.origen_nombre, r.destino_nombre, r.contrato]);
      if (existe.rows.length === 0) {
        try {
          await pool.query(`INSERT INTO corredores (nombre, contrato, origen_nombre, destino_nombre, km_promedio, rendimiento_promedio, total_viajes_base, activo, creado_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())`, [`${r.origen_nombre} → ${r.destino_nombre}`, r.contrato, r.origen_nombre, r.destino_nombre, r.km_prom, r.rend_prom, r.veces]);
          nuevos++;
        } catch { /* duplicate */ }
      }
    }

    if (nuevos > 0) {
      await this.registrarAprendizaje("CORREDOR_APRENDIDO", `${nuevos} corredores nuevos`, {}, { nuevos }, 0.9, rutas.rows.reduce((s: number, r: any) => s + r.veces, 0));
      console.log(`[GERENTE-OPS] ${nuevos} corredores aprendidos`);
    }
  },

  async registrarAprendizaje(tipo: string, desc: string, antes: any, despues: any, confianza: number, impacto: number) {
    await pool.query("INSERT INTO gerente_aprendizaje (tipo, descripcion, datos_antes, datos_despues, confianza, impacto_viajes) VALUES ($1,$2,$3,$4,$5,$6)", [tipo, desc, JSON.stringify(antes), JSON.stringify(despues), confianza, impacto]);
  },
};

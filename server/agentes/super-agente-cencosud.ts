import { pool } from "../db";
import { reconstruirAyer, reconstruirDiaT1 } from "../t1-reconstructor";

async function getParams(): Promise<Record<string, number>> {
  const r = await pool.query("SELECT clave, valor::float as valor FROM cencosud_parametros");
  const p: Record<string, number> = {};
  r.rows.forEach((row: any) => { p[row.clave] = row.valor; });
  return p;
}

async function guardarMensaje(tipo: string, prioridad: string, titulo: string, contenido: string, datos: any = {}) {
  await pool.query("INSERT INTO cencosud_agente_mensajes (tipo, prioridad, titulo, contenido, datos) VALUES ($1,$2,$3,$4,$5)", [tipo, prioridad, titulo, contenido, JSON.stringify(datos)]);
  await pool.query("UPDATE cencosud_agente_estado SET alertas_hoy = alertas_hoy + 1 WHERE id = 1");
}

function distKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const RADIO_ALIAS_KM = 30;
const RADIO_ALIAS_CD_KM = 5;
const MIN_VIAJES_PARA_ALIAS = 2;
const VENTANA_CONSOLIDACION_HORAS = 4;
const GPS_INVALIDO_LAT = -22.198;

interface CiudadContrato {
  nombre: string;
  lat: number;
  lng: number;
  esCD: boolean;
  esCT: boolean;
}

let _ciudadesCache: CiudadContrato[] = [];
let _ciudadesCacheTs = 0;

async function getCiudadesContrato(): Promise<CiudadContrato[]> {
  if (Date.now() - _ciudadesCacheTs < 10 * 60 * 1000 && _ciudadesCache.length > 0) return _ciudadesCache;

  const r = await pool.query(`
    SELECT nc as nombre, ROUND(AVG(lat)::numeric, 4)::float as lat, ROUND(AVG(lng)::numeric, 4)::float as lng, COUNT(*)::int as refs
    FROM (
      SELECT a.nombre_contrato as nc, v.origen_lat::float as lat, v.origen_lng::float as lng
      FROM geocerca_alias_contrato a
      JOIN viajes_aprendizaje v ON v.origen_nombre = a.geocerca_nombre
      WHERE a.contrato = 'CENCOSUD' AND v.origen_lat IS NOT NULL AND v.origen_lat BETWEEN -56 AND -17
      UNION ALL
      SELECT a.nombre_contrato, v.destino_lat::float, v.destino_lng::float
      FROM geocerca_alias_contrato a
      JOIN viajes_aprendizaje v ON v.destino_nombre = a.geocerca_nombre
      WHERE a.contrato = 'CENCOSUD' AND v.destino_lat IS NOT NULL AND v.destino_lat BETWEEN -56 AND -17
    ) sub
    GROUP BY nc HAVING COUNT(*) >= 2
  `);

  _ciudadesCache = r.rows
    .filter((c: any) => c.lat && c.lng && !c.nombre.startsWith("Geocerca Zona"))
    .map((c: any) => ({
      nombre: c.nombre,
      lat: c.lat,
      lng: c.lng,
      esCD: c.nombre.startsWith("CD "),
      esCT: c.nombre.startsWith("CT "),
    }));
  _ciudadesCacheTs = Date.now();
  return _ciudadesCache;
}

function encontrarCiudadMasCercana(lat: number, lng: number, ciudades: CiudadContrato[]): { ciudad: CiudadContrato; distancia: number } | null {
  if (Math.abs(lat - GPS_INVALIDO_LAT) < 0.1) return null;
  if (lat < -56 || lat > -17 || lng < -76 || lng > -66) return null;

  let mejor: { ciudad: CiudadContrato; distancia: number } | null = null;
  for (const c of ciudades) {
    const d = distKm(lat, lng, c.lat, c.lng);
    const radio = (c.esCD || c.esCT) ? RADIO_ALIAS_CD_KM : RADIO_ALIAS_KM;
    if (d <= radio && (!mejor || d < mejor.distancia)) {
      mejor = { ciudad: c, distancia: d };
    }
  }
  return mejor;
}

export const superAgenteCencosud = {
  id: "super-agente-cencosud",

  _t1Ejecutado: false as boolean,

  async iniciar() {
    console.log("[SUPER-CENCOSUD] Iniciando agente T-1 + GPS-proximity...");
    setInterval(async () => { try { await this.ejecutarCiclo(); } catch (e: any) { console.error("[SUPER-CENCOSUD]", e.message); } }, 30 * 60 * 1000);
    setTimeout(async () => { try { await this.ejecutarCiclo(); } catch (e: any) { console.error("[SUPER-CENCOSUD]", e.message); } }, 20000);

    this.programarT1Diario();
  },

  programarT1Diario() {
    const ahora = new Date();
    const target = new Date();
    target.setHours(5, 0, 0, 0);
    if (target <= ahora) target.setDate(target.getDate() + 1);
    const ms = target.getTime() - ahora.getTime();
    const minutos = Math.round(ms / 60000);
    console.log(`[SUPER-CENCOSUD] T-1 diario programado para las 05:00 (en ${minutos} min)`);

    setTimeout(async () => {
      try {
        console.log("[SUPER-CENCOSUD] ═══ Ejecutando T-1 diario ═══");
        const result = await reconstruirAyer();
        console.log(`[SUPER-CENCOSUD] T-1 completado: ${result.viajes_creados} viajes (${result.viajes_round_trip} RT)`);
        await guardarMensaje("T1_RECONSTRUCCION", "NORMAL",
          `T-1 completado: ${result.viajes_creados} viajes reconstruidos`,
          `Camiones: ${result.camiones_procesados}, Viajes: ${result.viajes_creados} (${result.viajes_round_trip} round-trip, ${result.viajes_ida} ida), Descanso: ${result.camiones_descanso}`,
          result);
      } catch (e: any) {
        console.error("[SUPER-CENCOSUD] T-1 error:", e.message);
      }
      this.programarT1Diario();
    }, ms);
  },

  async ejecutarCiclo() {
    console.log("[SUPER-CENCOSUD] ─── Ciclo inicio ───");
    try {
      if (!this._t1Ejecutado) {
        try {
          const fecha = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
          const result = await reconstruirDiaT1(fecha);
          console.log(`[SUPER-CENCOSUD] T-1 inicial (${fecha}): ${result.viajes_creados} viajes`);
          this._t1Ejecutado = true;
        } catch (e: any) {
          console.error("[SUPER-CENCOSUD] T-1 inicial error:", e.message);
        }
      }

      const aliasResult = await this.autoAliasGPS();
      const facResult = await this.inteligenciaFacturacion();
      await this.verificarMetas();
      await this.detectarAnomalias();

      await pool.query("UPDATE cencosud_agente_estado SET ultimo_ciclo = NOW(), ciclos_hoy = ciclos_hoy + 1, updated_at = NOW() WHERE id = 1");
      console.log(`[SUPER-CENCOSUD] OK: +${aliasResult.nuevos} alias GPS, billing: ${facResult.conTarifa}/${facResult.totalViajes} (${facResult.pctFacturable}%) = $${facResult.ingresoTarifa.toLocaleString()}`);
    } catch (e: any) { console.error("[SUPER-CENCOSUD] Error ciclo:", e.message); }
  },

  async autoAliasGPS() {
    const ciudades = await getCiudadesContrato();
    if (ciudades.length === 0) return { nuevos: 0, evaluados: 0 };

    const sinAlias = await pool.query(`
      SELECT nombre, lat, lng, viajes FROM (
        SELECT v.origen_nombre as nombre, v.origen_lat::float as lat, v.origen_lng::float as lng, COUNT(*)::int as viajes
        FROM viajes_aprendizaje v
        LEFT JOIN geocerca_alias_contrato a ON a.geocerca_nombre = v.origen_nombre AND a.contrato = 'CENCOSUD'
        WHERE v.contrato = 'CENCOSUD' AND v.fecha_inicio >= NOW() - INTERVAL '30 days'
          AND v.origen_lat IS NOT NULL AND a.id IS NULL
          AND v.origen_nombre IS NOT NULL AND v.origen_nombre != 'Punto desconocido'
        GROUP BY v.origen_nombre, v.origen_lat, v.origen_lng
        UNION ALL
        SELECT v.destino_nombre, v.destino_lat::float, v.destino_lng::float, COUNT(*)::int
        FROM viajes_aprendizaje v
        LEFT JOIN geocerca_alias_contrato a ON a.geocerca_nombre = v.destino_nombre AND a.contrato = 'CENCOSUD'
        WHERE v.contrato = 'CENCOSUD' AND v.fecha_inicio >= NOW() - INTERVAL '30 days'
          AND v.destino_lat IS NOT NULL AND a.id IS NULL
          AND v.destino_nombre IS NOT NULL AND v.destino_nombre != 'Punto desconocido'
        GROUP BY v.destino_nombre, v.destino_lat, v.destino_lng
      ) sub
      WHERE viajes >= ${MIN_VIAJES_PARA_ALIAS}
      ORDER BY viajes DESC
      LIMIT 200
    `);

    let nuevos = 0;
    const aliasCreados: string[] = [];

    for (const punto of sinAlias.rows) {
      if (!punto.lat || !punto.lng) continue;
      const match = encontrarCiudadMasCercana(punto.lat, punto.lng, ciudades);
      if (!match) continue;

      const confianza = match.distancia <= 5 ? true : match.distancia <= 15;
      try {
        const res = await pool.query(
          `INSERT INTO geocerca_alias_contrato (geocerca_nombre, nombre_contrato, contrato, confirmado, creado_por)
           VALUES ($1, $2, 'CENCOSUD', $3, 'AGENTE_GPS')
           ON CONFLICT (geocerca_nombre, nombre_contrato, contrato) DO NOTHING`,
          [punto.nombre, match.ciudad.nombre, confianza]
        );
        if (res.rowCount && res.rowCount > 0) {
          nuevos++;
          aliasCreados.push(`${punto.nombre} → ${match.ciudad.nombre} (${match.distancia.toFixed(1)}km, ${punto.viajes}v)`);
        }
      } catch {}
    }

    if (nuevos > 0) {
      console.log(`[SUPER-CENCOSUD] GPS-Alias: +${nuevos} nuevos`);
      for (const a of aliasCreados.slice(0, 10)) console.log(`  → ${a}`);
      _ciudadesCacheTs = 0;

      await guardarMensaje("APRENDIZAJE", "NORMAL",
        `Auto-alias GPS: +${nuevos} geocercas mapeadas`,
        `El agente usó coordenadas GPS para mapear ${nuevos} geocercas a ciudades del contrato:\n${aliasCreados.slice(0, 8).join("\n")}${aliasCreados.length > 8 ? `\n... y ${aliasCreados.length - 8} más` : ""}`,
        { nuevos, detalle: aliasCreados.slice(0, 20) });
    }

    return { nuevos, evaluados: sinAlias.rows.length };
  },

  async consolidarTrayectos() {
    const camiones = await pool.query(`
      SELECT DISTINCT camion_id FROM viajes_aprendizaje
      WHERE contrato = 'CENCOSUD' AND fecha_inicio >= NOW() - INTERVAL '30 days' AND km_ecu > 5
    `);

    let consolidados = 0;
    let revenue = 0;

    for (const cam of camiones.rows) {
      const viajes = await pool.query(`
        SELECT v.id, v.camion_id, v.fecha_inicio, v.fecha_fin,
               COALESCE(a1.nombre_contrato, v.origen_nombre) as origen_c,
               COALESCE(a2.nombre_contrato, v.destino_nombre) as destino_c,
               v.origen_nombre, v.destino_nombre,
               v.origen_lat::float as olat, v.origen_lng::float as olng,
               v.destino_lat::float as dlat, v.destino_lng::float as dlng,
               v.km_ecu
        FROM viajes_aprendizaje v
        LEFT JOIN geocerca_alias_contrato a1 ON a1.geocerca_nombre = v.origen_nombre AND a1.contrato = 'CENCOSUD'
        LEFT JOIN geocerca_alias_contrato a2 ON a2.geocerca_nombre = v.destino_nombre AND a2.contrato = 'CENCOSUD'
        WHERE v.camion_id = $1 AND v.contrato = 'CENCOSUD' AND v.fecha_inicio >= NOW() - INTERVAL '30 days' AND v.km_ecu > 5
        ORDER BY v.fecha_inicio
      `, [cam.camion_id]);

      const trips = viajes.rows;
      if (trips.length < 2) continue;

      let i = 0;
      while (i < trips.length) {
        const first = trips[i];
        const esOrigenCD = first.origen_c?.startsWith("CD ") || first.origen_c?.startsWith("CT ");
        if (!esOrigenCD) { i++; continue; }

        const cdOrigen = first.origen_c;
        let lastDestino = first.destino_c;
        let lastFin = new Date(first.fecha_fin || first.fecha_inicio);
        let kmTotal = parseFloat(first.km_ecu || 0);
        const segmentoIds = [first.id];
        let j = i + 1;

        while (j < trips.length) {
          const next = trips[j];
          const nextInicio = new Date(next.fecha_inicio);
          const horasGap = (nextInicio.getTime() - lastFin.getTime()) / (1000 * 60 * 60);

          if (horasGap > VENTANA_CONSOLIDACION_HORAS) break;

          const nextOrigenEsCD = next.origen_c?.startsWith("CD ") || next.origen_c?.startsWith("CT ");
          if (nextOrigenEsCD && next.origen_c !== cdOrigen) break;

          segmentoIds.push(next.id);
          lastDestino = next.destino_c;
          lastFin = new Date(next.fecha_fin || next.fecha_inicio);
          kmTotal += parseFloat(next.km_ecu || 0);
          j++;
        }

        if (segmentoIds.length >= 2 && cdOrigen && lastDestino && cdOrigen !== lastDestino) {
          const tarifaCheck = await pool.query(
            `SELECT tarifa::float FROM contrato_rutas_tarifas
             WHERE contrato = 'CENCOSUD' AND activo = true AND origen = $1 AND destino = $2
             ORDER BY CASE clase WHEN 'FLF' THEN 1 WHEN 'S2P' THEN 2 WHEN 'CON' THEN 3 END
             LIMIT 1`,
            [cdOrigen, lastDestino]
          );

          if (tarifaCheck.rows.length > 0) {
            const tarifa = tarifaCheck.rows[0].tarifa;
            const yaExiste = await pool.query(
              `SELECT id FROM viajes_aprendizaje
               WHERE camion_id = $1 AND contrato = 'CENCOSUD'
                 AND origen_nombre = $2 AND destino_nombre = $3
                 AND DATE(fecha_inicio) = DATE($4::timestamp)
                 AND trayecto_consolidado = true`,
              [cam.camion_id, `[TRAYECTO] ${cdOrigen}`, `[TRAYECTO] ${lastDestino}`, first.fecha_inicio]
            );

            if (yaExiste.rows.length === 0) {
              await pool.query(
                `INSERT INTO viajes_aprendizaje (camion_id, contrato, fecha_inicio, fecha_fin, origen_nombre, destino_nombre, origen_lat, origen_lng, destino_lat, destino_lng, km_ecu, trayecto_consolidado, segmento_ids)
                 VALUES ($1, 'CENCOSUD', $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11)`,
                [cam.camion_id, first.fecha_inicio, lastFin.toISOString(),
                 `[TRAYECTO] ${cdOrigen}`, `[TRAYECTO] ${lastDestino}`,
                 first.olat, first.olng, trips[j-1]?.dlat || first.dlat, trips[j-1]?.dlng || first.dlng,
                 Math.round(kmTotal), segmentoIds]
              );

              await pool.query(
                `INSERT INTO geocerca_alias_contrato (geocerca_nombre, nombre_contrato, contrato, confirmado, creado_por)
                 VALUES ($1, $2, 'CENCOSUD', true, 'AGENTE_TRAYECTO') ON CONFLICT DO NOTHING`,
                [`[TRAYECTO] ${cdOrigen}`, cdOrigen]
              );
              await pool.query(
                `INSERT INTO geocerca_alias_contrato (geocerca_nombre, nombre_contrato, contrato, confirmado, creado_por)
                 VALUES ($1, $2, 'CENCOSUD', true, 'AGENTE_TRAYECTO') ON CONFLICT DO NOTHING`,
                [`[TRAYECTO] ${lastDestino}`, lastDestino]
              );

              consolidados++;
              revenue += tarifa;
            }
          }
        }
        i = j;
      }
    }

    if (consolidados > 0) {
      console.log(`[SUPER-CENCOSUD] Trayectos: +${consolidados} consolidados = +$${Math.round(revenue).toLocaleString()}`);
      await guardarMensaje("TRAYECTO", "ALTA",
        `${consolidados} trayectos consolidados = +$${Math.round(revenue).toLocaleString()}`,
        `El agente unió segmentos de viaje en rutas completas CD→destino que ahora son facturables.\nEsto recupera revenue que se perdía por detección fragmentada de viajes.`,
        { consolidados, revenue: Math.round(revenue) });
    }

    return { consolidados, revenue };
  },

  async inteligenciaFacturacion() {
    const viajesR = await pool.query(`
      SELECT DISTINCT ON (v.id) v.id, v.origen_nombre, v.destino_nombre, v.km_ecu,
             COALESCE(a1.nombre_contrato, v.origen_nombre) as o_c,
             COALESCE(a2.nombre_contrato, v.destino_nombre) as d_c,
             t.tarifa::float as tarifa
      FROM viajes_aprendizaje v
      LEFT JOIN geocerca_alias_contrato a1 ON a1.geocerca_nombre = v.origen_nombre AND a1.contrato = 'CENCOSUD'
      LEFT JOIN geocerca_alias_contrato a2 ON a2.geocerca_nombre = v.destino_nombre AND a2.contrato = 'CENCOSUD'
      LEFT JOIN contrato_rutas_tarifas t ON t.contrato = 'CENCOSUD' AND t.activo = true
        AND t.origen = COALESCE(a1.nombre_contrato, v.origen_nombre)
        AND t.destino = COALESCE(a2.nombre_contrato, v.destino_nombre)
      WHERE v.contrato = 'CENCOSUD' AND v.fecha_inicio >= DATE_TRUNC('month', NOW()) AND v.km_ecu > 10
      ORDER BY v.id, CASE t.clase WHEN 'FLF' THEN 1 WHEN 'S2P' THEN 2 WHEN 'CON' THEN 3 ELSE 4 END
    `);

    let conTarifa = 0;
    let sinTarifa = 0;
    let ingresoTarifa = 0;
    const sinAlias = new Map<string, { count: number; lat: number | null; lng: number | null }>();
    const sinRuta = new Map<string, number>();

    for (const v of viajesR.rows) {
      if (v.tarifa) {
        conTarifa++;
        ingresoTarifa += v.tarifa;
      } else {
        sinTarifa++;
        if (v.o_c && v.d_c && v.o_c !== v.origen_nombre) {
          const rutaKey = `${v.o_c} → ${v.d_c}`;
          sinRuta.set(rutaKey, (sinRuta.get(rutaKey) || 0) + 1);
        }
      }
    }

    const totalViajes = conTarifa + sinTarifa;
    const pctFacturable = totalViajes > 0 ? Math.round(conTarifa / totalViajes * 100) : 0;

    if (sinRuta.size > 0) {
      const topSinRuta = [...sinRuta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      if (topSinRuta.some(([_, cnt]) => cnt >= 2)) {
        const detalle = topSinRuta.map(([ruta, cnt]) => `${ruta} (${cnt} viajes)`).join("\n");
        await guardarMensaje("FACTURACION", "CRITICA",
          `${sinRuta.size} rutas con alias pero SIN TARIFA`,
          `Estas rutas están mapeadas pero no hay tarifa en el contrato:\n${detalle}`,
          { sinRuta: topSinRuta });
      }
    }

    return { conTarifa, sinTarifa, totalViajes, ingresoTarifa, pctFacturable };
  },

  async verificarMetas() {
    const params = await getParams();
    const dia = new Date().getDate();
    const diasMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

    const proy = await pool.query(`
      SELECT ROUND(SUM(km_dia)::numeric) as acum, ROUND(AVG(km_dia)::numeric) as prom FROM (
        SELECT DATE(va.fecha_inicio), SUM(va.km_ecu) as km_dia FROM viajes_aprendizaje va
        WHERE va.fecha_inicio >= DATE_TRUNC('month', NOW()) AND va.contrato = 'CENCOSUD' AND va.km_ecu > 0
        GROUP BY DATE(va.fecha_inicio)
      ) d
    `);
    if (!proy.rows[0]?.acum) return;
    const acum = parseFloat(proy.rows[0].acum);
    const pctMeta = Math.round(acum / params.meta_km_mes * 100);
    const pctEsperado = Math.round(dia / diasMes * 100);

    if (pctMeta < pctEsperado - 15 && dia > 5) {
      await guardarMensaje("META", pctMeta < pctEsperado - 25 ? "ALTA" : "NORMAL",
        `Meta en riesgo: ${pctMeta}% (esperado ${pctEsperado}%)`,
        `Acumulado ${acum.toLocaleString()} km de ${params.meta_km_mes.toLocaleString()} km meta.`,
        { acum, pctMeta, pctEsperado });
    }
  },

  async detectarAnomalias() {
    const params = await getParams();
    const rendBajo = await pool.query(`
      SELECT c.patente, ROUND(AVG(va.rendimiento_real)::numeric, 2) as rend, COUNT(*)::int as viajes
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.fecha_inicio >= NOW() - INTERVAL '48 hours' AND va.contrato = 'CENCOSUD' AND va.rendimiento_real > 0 AND va.rendimiento_real < 10 AND va.km_ecu > 30
      GROUP BY c.patente HAVING AVG(va.rendimiento_real) < $1
    `, [params.alerta_rendimiento_critico]);

    for (const c of rendBajo.rows) {
      await guardarMensaje("ANOMALIA", parseFloat(c.rend) < 2.0 ? "CRITICA" : "ALTA",
        `Rendimiento: ${c.patente} - ${c.rend} km/L`, `${c.viajes} viajes en 48h bajo ${params.alerta_rendimiento_critico} km/L`, c);
    }
  },

  async chat(mensaje: string): Promise<string> {
    try {
      const params = await getParams();
      const hoy = new Date().toISOString().slice(0, 10);

      const [ctx, geoCount, facData, aliasData, tarifaData] = await Promise.all([
        pool.query(`SELECT COUNT(DISTINCT c.patente)::int as camiones, COUNT(*)::int as viajes,
          ROUND(SUM(va.km_ecu)::numeric) as km, ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
          FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
          WHERE DATE(va.fecha_inicio) = $1 AND va.contrato = 'CENCOSUD' AND va.km_ecu > 0`, [hoy]),
        pool.query("SELECT COUNT(*)::int as total FROM cencosud_geocercas_kml WHERE activa = true"),
        pool.query(`
          SELECT COUNT(DISTINCT v.id)::int as total,
                 COUNT(DISTINCT CASE WHEN t.tarifa IS NOT NULL THEN v.id END)::int as con_tarifa,
                 COALESCE(SUM(t.tarifa) FILTER (WHERE t.tarifa IS NOT NULL), 0)::float as ingreso
          FROM viajes_aprendizaje v
          LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = v.origen_nombre AND ao.contrato = 'CENCOSUD'
          LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = v.destino_nombre AND ad.contrato = 'CENCOSUD'
          LEFT JOIN contrato_rutas_tarifas t ON t.origen = ao.nombre_contrato AND t.destino = ad.nombre_contrato AND t.contrato = 'CENCOSUD' AND t.activo = true
          WHERE v.fecha_inicio >= DATE_TRUNC('month', NOW()) AND v.contrato = 'CENCOSUD' AND v.km_ecu > 10
        `),
        pool.query("SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE confirmado = true)::int as confirmados FROM geocerca_alias_contrato WHERE contrato = 'CENCOSUD'"),
        pool.query("SELECT COUNT(*)::int as total FROM contrato_rutas_tarifas WHERE contrato = 'CENCOSUD' AND activo = true"),
      ]);

      const c = ctx.rows[0];
      const fac = facData.rows[0];
      const alias = aliasData.rows[0];
      const pctFact = fac.total > 0 ? Math.round(fac.con_tarifa / fac.total * 100) : 0;

      const hist = await pool.query("SELECT rol, mensaje FROM cencosud_agente_chat ORDER BY created_at DESC LIMIT 8");
      await pool.query("INSERT INTO cencosud_agente_chat (rol, mensaje) VALUES ('CEO', $1)", [mensaje]);

      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const resp = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514", max_tokens: 500,
        system: `Eres el Super Agente TMS Cencosud de Sotraser. Tu prioridad #1 es MAXIMIZAR LA FACTURACIÓN. Cada viaje sin tarifa = plata perdida.

DATOS REALES HOY ${hoy}:
- Flota: ${c.camiones} camiones activos, ${c.viajes} viajes, ${c.km || 0} km, ${c.rend || 0} km/L
- Geocercas KML: ${geoCount.rows[0].total} polígonos exactos

FACTURACIÓN MES:
- ${fac.total} viajes totales | ${fac.con_tarifa} con tarifa (${pctFact}%) | ${fac.total - fac.con_tarifa} SIN TARIFA
- Ingreso tarifado: $${Math.round(fac.ingreso).toLocaleString()}
- ${alias.total} alias (${alias.confirmados} confirmados) | ${tarifaData.rows[0].total} rutas tarifadas

CAPACIDADES DEL AGENTE:
1. Auto-alias GPS: mapea geocercas sin alias a ciudades del contrato usando proximidad GPS (30km)
2. Consolidación de trayectos: une segmentos CD→A→B→C en ruta facturable CD→C
3. Aprendizaje: cada ciclo mejora el mapeo automáticamente

Responde en español, max 200 palabras, con datos reales. Siempre piensa en cómo ganar más facturación.`,
        messages: [...hist.rows.reverse().map((h: any) => ({ role: h.rol === "CEO" ? "user" as const : "assistant" as const, content: h.mensaje })), { role: "user" as const, content: mensaje }],
      });
      const texto = resp.content[0].type === "text" ? resp.content[0].text : "Error.";
      await pool.query("INSERT INTO cencosud_agente_chat (rol, mensaje) VALUES ('AGENTE', $1)", [texto]);
      return texto;
    } catch (e: any) {
      console.error("[SUPER-CENCOSUD] Chat:", e.message);
      return "Error al procesar consulta.";
    }
  },
};

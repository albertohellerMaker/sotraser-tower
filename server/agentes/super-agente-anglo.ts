import { pool } from "../db";

const CONTRATO = "ANGLO-CARGAS VARIAS";

const ZONAS_MINERAS: Record<string, { altitud: number; tipo: string; riesgo: string }> = {
  "Mina Los Bronces": { altitud: 3500, tipo: "MINA_RAJO", riesgo: "ALTO" },
  "Mina Los Bronces · Lo Barnechea": { altitud: 3500, tipo: "MINA_RAJO", riesgo: "ALTO" },
  "Planta Anglo Los Bronces": { altitud: 1800, tipo: "PLANTA", riesgo: "MEDIO" },
  "Mina El Soldado": { altitud: 1600, tipo: "MINA_RAJO", riesgo: "ALTO" },
  "Mina El Soldado · Nogales": { altitud: 1200, tipo: "ACCESO_MINA", riesgo: "MEDIO" },
  "Los Colorados · Lo Barnechea": { altitud: 2200, tipo: "INSTALACION", riesgo: "ALTO" },
  "Las Condes · Lo Barnechea (Camino a Farellones)": { altitud: 1600, tipo: "ACCESO_MINA", riesgo: "MEDIO" },
  "Sector Las Condes / Lo Barnechea": { altitud: 1400, tipo: "ACCESO_MINA", riesgo: "MEDIO" },
  "Sector Los Andes": { altitud: 820, tipo: "LOGISTICA", riesgo: "BAJO" },
  "Los Andes Centro": { altitud: 820, tipo: "LOGISTICA", riesgo: "BAJO" },
};

const RADIO_ALIAS_KM = 15;
const MIN_VIAJES_ALIAS = 2;

async function getParams(): Promise<Record<string, number>> {
  const r = await pool.query("SELECT clave, valor::float as valor FROM anglo_parametros");
  const p: Record<string, number> = {};
  r.rows.forEach((row: any) => { p[row.clave] = row.valor; });
  return p;
}

async function guardarMensaje(tipo: string, prioridad: string, titulo: string, contenido: string, datos: any = {}) {
  await pool.query("INSERT INTO anglo_agente_mensajes (tipo, prioridad, titulo, contenido, datos) VALUES ($1,$2,$3,$4,$5)", [tipo, prioridad, titulo, contenido, JSON.stringify(datos)]);
  await pool.query("UPDATE anglo_agente_estado SET alertas_hoy = alertas_hoy + 1 WHERE id = 1");
}

function distKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clasificarRuta(origen: string, destino: string): { tipo: string; altitudMax: number; riesgo: string } {
  const zonaOrigen = ZONAS_MINERAS[origen];
  const zonaDestino = ZONAS_MINERAS[destino];
  const altMax = Math.max(zonaOrigen?.altitud || 0, zonaDestino?.altitud || 0);
  let riesgo = "BAJO";
  let tipo = "URBANA";
  if (altMax >= 3000) { riesgo = "ALTO"; tipo = "ACCESO_MINA_ALTA"; }
  else if (altMax >= 1500) { riesgo = "MEDIO"; tipo = "CERRO"; }
  else if (altMax >= 800) { riesgo = "BAJO"; tipo = "PRECORDILLERA"; }
  return { tipo, altitudMax: altMax, riesgo };
}

export const superAgenteAnglo = {
  id: "super-agente-anglo",

  async iniciar() {
    console.log("[SUPER-ANGLO] Iniciando agente minero con GPS-proximity...");
    setInterval(async () => { try { await this.ejecutarCiclo(); } catch (e: any) { console.error("[SUPER-ANGLO]", e.message); } }, 30 * 60 * 1000);
    setTimeout(async () => { try { await this.ejecutarCiclo(); } catch (e: any) { console.error("[SUPER-ANGLO]", e.message); } }, 25000);
  },

  async ejecutarCiclo() {
    console.log("[SUPER-ANGLO] ─── Ciclo inicio ───");
    try {
      const aliasResult = await this.autoAliasGPS();
      const facResult = await this.inteligenciaFacturacion();
      await this.verificarMetas();
      await this.detectarAnomaliasCerro();
      await this.monitoreoAltitud();

      await pool.query("UPDATE anglo_agente_estado SET ultimo_ciclo = NOW(), ciclos_totales = ciclos_totales + 1 WHERE id = 1");
      console.log(`[SUPER-ANGLO] OK: +${aliasResult.nuevos} alias, billing: ${facResult.conTarifa}/${facResult.totalViajes} (${facResult.pctFacturable}%) = $${facResult.ingresoTarifa.toLocaleString()}`);
    } catch (e: any) { console.error("[SUPER-ANGLO] Error ciclo:", e.message); }
  },

  async autoAliasGPS() {
    const tarifas = await pool.query("SELECT DISTINCT origen as name FROM contrato_rutas_tarifas WHERE contrato = $1 AND activo = true UNION SELECT DISTINCT destino FROM contrato_rutas_tarifas WHERE contrato = $1 AND activo = true", [CONTRATO]);
    const tarifaNames = tarifas.rows.map((r: any) => r.name);

    const existing = await pool.query("SELECT geocerca_nombre, nombre_contrato FROM geocerca_alias_contrato WHERE contrato = $1", [CONTRATO]);
    const existingSet = new Set(existing.rows.map((r: any) => r.geocerca_nombre));

    const sinAlias = await pool.query(`
      SELECT nombre, lat, lng, viajes FROM (
        SELECT v.origen_nombre as nombre, v.origen_lat::float as lat, v.origen_lng::float as lng, COUNT(*)::int as viajes
        FROM viajes_aprendizaje v
        WHERE v.contrato = $1 AND v.fecha_inicio >= NOW() - INTERVAL '30 days'
          AND v.origen_lat IS NOT NULL AND v.origen_nombre IS NOT NULL AND v.origen_nombre != 'Punto desconocido' AND v.km_ecu > 0
        GROUP BY v.origen_nombre, v.origen_lat, v.origen_lng
        UNION ALL
        SELECT v.destino_nombre, v.destino_lat::float, v.destino_lng::float, COUNT(*)::int
        FROM viajes_aprendizaje v
        WHERE v.contrato = $1 AND v.fecha_inicio >= NOW() - INTERVAL '30 days'
          AND v.destino_lat IS NOT NULL AND v.destino_nombre IS NOT NULL AND v.destino_nombre != 'Punto desconocido' AND v.km_ecu > 0
        GROUP BY v.destino_nombre, v.destino_lat, v.destino_lng
      ) sub WHERE viajes >= ${MIN_VIAJES_ALIAS} ORDER BY viajes DESC LIMIT 200
    `, [CONTRATO]);

    const geoCoords = await pool.query("SELECT nombre, lat::float as lat, lng::float as lng FROM geocercas_operacionales WHERE contrato = $1", [CONTRATO]);
    const geoMap = new Map(geoCoords.rows.map((g: any) => [g.nombre, { lat: g.lat, lng: g.lng }]));

    let nuevos = 0;
    const aliasCreados: string[] = [];

    for (const punto of sinAlias.rows) {
      if (existingSet.has(punto.nombre)) continue;
      if (!punto.lat || !punto.lng || Math.abs(punto.lat + 22.198) < 0.1) continue;

      let bestMatch: string | null = null;
      let bestDist = RADIO_ALIAS_KM;

      for (const tn of tarifaNames) {
        const coords = geoMap.get(tn);
        if (!coords) continue;
        const d = distKm(punto.lat, punto.lng, coords.lat, coords.lng);
        if (d < bestDist) { bestDist = d; bestMatch = tn; }
      }

      if (!bestMatch) {
        const stripped = punto.nombre.replace(/\s*\(\d+m\)\s*$/, '').trim();
        for (const tn of tarifaNames) {
          if (punto.nombre.startsWith(tn) || stripped.startsWith(tn) || stripped === tn) {
            bestMatch = tn; break;
          }
        }
      }

      if (bestMatch) {
        try {
          const res = await pool.query(
            `INSERT INTO geocerca_alias_contrato (geocerca_nombre, nombre_contrato, contrato, confirmado, creado_por)
             VALUES ($1, $2, $3, true, 'SUPER_AGENTE_ANGLO') ON CONFLICT (geocerca_nombre, nombre_contrato, contrato) DO NOTHING`,
            [punto.nombre, bestMatch, CONTRATO]
          );
          if (res.rowCount && res.rowCount > 0) {
            nuevos++;
            aliasCreados.push(`${punto.nombre} → ${bestMatch} (${punto.viajes}v)`);
            existingSet.add(punto.nombre);
          }
        } catch {}
      }
    }

    if (nuevos > 0) {
      console.log(`[SUPER-ANGLO] GPS-Alias: +${nuevos} nuevos`);
      aliasCreados.slice(0, 5).forEach(a => console.log(`  → ${a}`));
      await guardarMensaje("APRENDIZAJE", "NORMAL",
        `Auto-alias: +${nuevos} geocercas mapeadas`,
        `Geocercas mapeadas a puntos del contrato minero:\n${aliasCreados.slice(0, 8).join("\n")}`,
        { nuevos, detalle: aliasCreados.slice(0, 20) });
    }

    return { nuevos, evaluados: sinAlias.rows.length };
  },

  async inteligenciaFacturacion() {
    const viajesR = await pool.query(`
      SELECT DISTINCT ON (v.id) v.id, v.origen_nombre, v.destino_nombre, v.km_ecu,
             COALESCE(a1.nombre_contrato, v.origen_nombre) as o_c,
             COALESCE(a2.nombre_contrato, v.destino_nombre) as d_c,
             t.tarifa::float as tarifa
      FROM viajes_aprendizaje v
      LEFT JOIN geocerca_alias_contrato a1 ON a1.geocerca_nombre = v.origen_nombre AND a1.contrato = $1
      LEFT JOIN geocerca_alias_contrato a2 ON a2.geocerca_nombre = v.destino_nombre AND a2.contrato = $1
      LEFT JOIN contrato_rutas_tarifas t ON t.contrato = $1 AND t.activo = true
        AND t.origen = COALESCE(a1.nombre_contrato, v.origen_nombre)
        AND t.destino = COALESCE(a2.nombre_contrato, v.destino_nombre)
      WHERE v.contrato = $1 AND v.fecha_inicio >= DATE_TRUNC('month', NOW()) AND v.km_ecu > 5
      ORDER BY v.id
    `, [CONTRATO]);

    let conTarifa = 0, sinTarifa = 0, ingresoTarifa = 0;
    const sinRuta = new Map<string, number>();

    for (const v of viajesR.rows) {
      if (v.tarifa) { conTarifa++; ingresoTarifa += v.tarifa; }
      else {
        sinTarifa++;
        if (v.o_c && v.d_c) {
          const k = `${v.o_c} → ${v.d_c}`;
          sinRuta.set(k, (sinRuta.get(k) || 0) + 1);
        }
      }
    }

    const totalViajes = conTarifa + sinTarifa;
    const pctFacturable = totalViajes > 0 ? Math.round(conTarifa / totalViajes * 100) : 0;

    if (sinRuta.size > 0) {
      const topSinRuta = [...sinRuta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      if (topSinRuta.some(([_, cnt]) => cnt >= 3)) {
        const detalle = topSinRuta.filter(([_, cnt]) => cnt >= 2).map(([ruta, cnt]) => `${ruta} (${cnt} viajes)`).join("\n");
        await guardarMensaje("FACTURACION", "CRITICA",
          `${sinRuta.size} rutas sin tarifa = revenue perdido`,
          `Rutas con alias pero sin tarifa en contrato:\n${detalle}\nAcción: agregar estas rutas al cuadro tarifario.`,
          { sinRuta: topSinRuta });
      }
    }

    return { conTarifa, sinTarifa, totalViajes, ingresoTarifa, pctFacturable };
  },

  async verificarMetas() {
    const params = await getParams();
    const dia = new Date().getDate();
    const diasMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const metaKm = params.META_KM_CAMION || 8000;
    const camionesContrato = params.CAMIONES_CONTRATO || 74;

    const proy = await pool.query(`
      SELECT COUNT(DISTINCT c.patente)::int as camiones_activos,
        ROUND(SUM(va.km_ecu)::numeric) as km_total
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.contrato = $1 AND va.fecha_inicio >= DATE_TRUNC('month', NOW()) AND va.km_ecu > 0
    `, [CONTRATO]);

    if (!proy.rows[0]?.km_total) return;
    const { camiones_activos, km_total } = proy.rows[0];
    const kmPorCamion = camiones_activos > 0 ? parseFloat(km_total) / camiones_activos : 0;
    const proyKm = dia > 0 ? Math.round(kmPorCamion / dia * diasMes) : 0;
    const pctMeta = Math.round(proyKm / metaKm * 100);

    if (pctMeta < 80 && dia > 5) {
      await guardarMensaje("META", pctMeta < 60 ? "CRITICA" : "ALTA",
        `Productividad en riesgo: ${proyKm.toLocaleString()} km/camión proyectado (meta: ${metaKm.toLocaleString()})`,
        `${camiones_activos} de ${camionesContrato} camiones activos. KM acumulado promedio: ${Math.round(kmPorCamion).toLocaleString()} km.\nEn minería, la baja productividad puede deberse a: cierres de camino por clima, mantención de maquinaria, o restricciones operacionales de la mina.`,
        { camiones_activos, camionesContrato, kmPorCamion: Math.round(kmPorCamion), proyKm, metaKm, pctMeta });
    }

    if (camiones_activos < camionesContrato * 0.5) {
      await guardarMensaje("FLOTA", "CRITICA",
        `Solo ${camiones_activos}/${camionesContrato} camiones activos (${Math.round(camiones_activos / camionesContrato * 100)}%)`,
        `La mitad de la flota contratada no registra viajes este mes. Verificar: camiones en mantención, camiones sin GPS, camiones reasignados a otro contrato.`,
        { camiones_activos, camionesContrato });
    }
  },

  async detectarAnomaliasCerro() {
    const rendBajo = await pool.query(`
      SELECT c.patente, 
        ROUND(AVG(va.rendimiento_real)::numeric, 2) as rend, 
        COUNT(*)::int as viajes,
        ROUND(MAX(va.velocidad_maxima)::numeric) as vel_max,
        ROUND(AVG(va.duracion_minutos)::numeric) as dur_prom
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.fecha_inicio >= NOW() - INTERVAL '72 hours' 
        AND va.contrato = $1 
        AND va.rendimiento_real > 0 AND va.rendimiento_real < 10 AND va.km_ecu > 20
      GROUP BY c.patente HAVING AVG(va.rendimiento_real) < 1.8
    `, [CONTRATO]);

    for (const c of rendBajo.rows) {
      const rend = parseFloat(c.rend);
      await guardarMensaje("ANOMALIA_CERRO", rend < 1.5 ? "CRITICA" : "ALTA",
        `Rendimiento cerro: ${c.patente} - ${c.rend} km/L`,
        `${c.viajes} viajes en 72h. Vel.máx: ${c.vel_max} km/h, dur.prom: ${c.dur_prom} min.\nEn rutas de cerro (altitud >1500m), el rendimiento baja por pendiente y altura. Rendimiento < 1.5 km/L puede indicar problema mecánico o sobrecarga.`,
        { patente: c.patente, rendimiento: rend, viajes: c.viajes, vel_max: c.vel_max });
    }

    const excesos = await pool.query(`
      SELECT c.patente, va.velocidad_maxima, va.origen_nombre, va.destino_nombre, va.fecha_inicio::text
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.contrato = $1 AND va.fecha_inicio >= NOW() - INTERVAL '24 hours'
        AND va.velocidad_maxima > 80 AND va.km_ecu > 10
      ORDER BY va.velocidad_maxima DESC LIMIT 10
    `, [CONTRATO]);

    if (excesos.rows.length > 0) {
      const topExceso = excesos.rows[0];
      const esRutaMinera = Object.keys(ZONAS_MINERAS).some(z => topExceso.origen_nombre?.includes(z) || topExceso.destino_nombre?.includes(z));
      if (esRutaMinera || topExceso.velocidad_maxima > 90) {
        await guardarMensaje("SEGURIDAD", "CRITICA",
          `Exceso velocidad en ruta minera: ${topExceso.patente} - ${topExceso.velocidad_maxima} km/h`,
          `Ruta: ${topExceso.origen_nombre} → ${topExceso.destino_nombre}\nEn caminos mineros con pendiente y curvas, velocidad >80 km/h es riesgo crítico de seguridad. Límite típico en minas: 40-60 km/h.`,
          { patente: topExceso.patente, vel: topExceso.velocidad_maxima, excesos_total: excesos.rows.length });
      }
    }
  },

  async monitoreoAltitud() {
    const rutasAltas = await pool.query(`
      SELECT va.origen_nombre, va.destino_nombre, COUNT(*)::int as viajes,
        ROUND(AVG(va.km_ecu)::numeric,1) as km_prom,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
        ROUND(AVG(va.duracion_minutos)::numeric) as dur_prom
      FROM viajes_aprendizaje va
      WHERE va.contrato = $1 AND va.fecha_inicio >= NOW() - INTERVAL '7 days' AND va.km_ecu > 10
        AND (va.origen_nombre ILIKE '%bronce%' OR va.destino_nombre ILIKE '%bronce%'
          OR va.origen_nombre ILIKE '%soldado%' OR va.destino_nombre ILIKE '%soldado%'
          OR va.origen_nombre ILIKE '%barnechea%' OR va.destino_nombre ILIKE '%barnechea%'
          OR va.origen_nombre ILIKE '%farellones%' OR va.destino_nombre ILIKE '%farellones%'
          OR va.origen_nombre ILIKE '%colorados%' OR va.destino_nombre ILIKE '%colorados%')
      GROUP BY va.origen_nombre, va.destino_nombre
      ORDER BY viajes DESC LIMIT 10
    `, [CONTRATO]);

    if (rutasAltas.rows.length > 0) {
      const total = rutasAltas.rows.reduce((s: number, r: any) => s + r.viajes, 0);
      const rendProm = rutasAltas.rows.filter((r: any) => r.rend).reduce((s: number, r: any) => s + parseFloat(r.rend), 0) / (rutasAltas.rows.filter((r: any) => r.rend).length || 1);
      const detalle = rutasAltas.rows.map((r: any) => `${r.origen_nombre} → ${r.destino_nombre}: ${r.viajes}v, ${r.km_prom}km, ${r.rend || '?'}km/L`).join("\n");

      if (rendProm < 2.0 && rendProm > 0) {
        await guardarMensaje("ALTITUD", "ALTA",
          `Rutas de cerro: rendimiento promedio ${rendProm.toFixed(2)} km/L (${total} viajes/7d)`,
          `Detalle rutas alta montaña:\n${detalle}\nRendimiento <2.0 km/L es normal en altitud >2000m por menor oxígeno y pendientes. Monitorear tendencia.`,
          { total_viajes: total, rend_promedio: rendProm, rutas: rutasAltas.rows.length });
      }
    }
  },

  async chat(mensaje: string): Promise<string> {
    try {
      const params = await getParams();
      const hoy = new Date().toISOString().slice(0, 10);

      const [ctx, facData, aliasData, tarifaData, rutasAltas, flotaData] = await Promise.all([
        pool.query(`SELECT COUNT(DISTINCT c.patente)::int as camiones, COUNT(*)::int as viajes,
          ROUND(SUM(va.km_ecu)::numeric) as km, 
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
          ROUND(AVG(va.duracion_minutos)::numeric) as dur_prom,
          ROUND(MAX(va.velocidad_maxima)::numeric) as vel_max
          FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
          WHERE DATE(va.fecha_inicio) = $1 AND va.contrato = $2 AND va.km_ecu > 0`, [hoy, CONTRATO]),
        pool.query(`
          SELECT COUNT(DISTINCT v.id)::int as total,
                 COUNT(DISTINCT CASE WHEN t.tarifa IS NOT NULL THEN v.id END)::int as con_tarifa,
                 COALESCE(SUM(t.tarifa) FILTER (WHERE t.tarifa IS NOT NULL), 0)::float as ingreso
          FROM viajes_aprendizaje v
          LEFT JOIN geocerca_alias_contrato a1 ON a1.geocerca_nombre = v.origen_nombre AND a1.contrato = $1
          LEFT JOIN geocerca_alias_contrato a2 ON a2.geocerca_nombre = v.destino_nombre AND a2.contrato = $1
          LEFT JOIN contrato_rutas_tarifas t ON t.origen = a1.nombre_contrato AND t.destino = a2.nombre_contrato AND t.contrato = $1 AND t.activo = true
          WHERE v.fecha_inicio >= DATE_TRUNC('month', NOW()) AND v.contrato = $1 AND v.km_ecu > 5
        `, [CONTRATO]),
        pool.query("SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE confirmado = true)::int as confirmados FROM geocerca_alias_contrato WHERE contrato = $1", [CONTRATO]),
        pool.query("SELECT COUNT(*)::int as total FROM contrato_rutas_tarifas WHERE contrato = $1 AND activo = true", [CONTRATO]),
        pool.query(`
          SELECT COUNT(*)::int as viajes_cerro,
            ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend_cerro
          FROM viajes_aprendizaje va
          WHERE va.contrato = $1 AND va.fecha_inicio >= NOW() - INTERVAL '7 days' AND va.km_ecu > 10
            AND (va.origen_nombre ILIKE '%bronce%' OR va.destino_nombre ILIKE '%bronce%'
              OR va.origen_nombre ILIKE '%soldado%' OR va.destino_nombre ILIKE '%soldado%'
              OR va.origen_nombre ILIKE '%barnechea%' OR va.destino_nombre ILIKE '%barnechea%')
        `, [CONTRATO]),
        pool.query(`SELECT COUNT(DISTINCT c.patente)::int as activos FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id WHERE va.contrato = $1 AND va.fecha_inicio >= DATE_TRUNC('month', NOW())`, [CONTRATO]),
      ]);

      const c = ctx.rows[0];
      const fac = facData.rows[0];
      const alias = aliasData.rows[0];
      const cerro = rutasAltas.rows[0];
      const pctFact = fac.total > 0 ? Math.round(fac.con_tarifa / fac.total * 100) : 0;

      const hist = await pool.query("SELECT rol, mensaje FROM anglo_agente_chat ORDER BY created_at DESC LIMIT 8");
      await pool.query("INSERT INTO anglo_agente_chat (rol, mensaje) VALUES ('CEO', $1)", [mensaje]);

      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const resp = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514", max_tokens: 600,
        system: `Eres el Super Agente TMS Anglo American de Sotraser, especializado en TRANSPORTE MINERO.
Tu contexto: camiones de 28 toneladas que operan en rutas de CERRO y ALTA MONTAÑA (Mina Los Bronces a 3,500m, El Soldado a 1,600m, accesos por Lo Barnechea y Los Andes).

CONTRATO: N° 4.22.0015.1 "Cargas Varias" Anglo American Sur S.A.
- Vigencia: Mar 2023 - Jun 2027
- Componente Variable: 28 toneladas, tarifa por ruta OD
- Reajuste cuatrimestral: FR = 60% IPC + 30% P.DIESEL + 10% DÓLAR (base Nov 2022)
- ${params.CAMIONES_CONTRATO || 74} camiones contratados, ${flotaData.rows[0]?.activos || 0} activos este mes

DATOS REALES HOY ${hoy}:
- Operación: ${c.camiones} camiones, ${c.viajes} viajes, ${c.km || 0} km, rend: ${c.rend || 'N/A'} km/L
- Vel.máx registrada: ${c.vel_max || 'N/A'} km/h

FACTURACIÓN MES (comp. variable 28T):
- ${fac.total} viajes | ${fac.con_tarifa} con tarifa (${pctFact}%) | Ingreso: $${Math.round(fac.ingreso).toLocaleString()}
- ${alias.total} alias (${alias.confirmados} confirmados) | ${tarifaData.rows[0].total} rutas tarifadas

RUTAS DE CERRO (7 días):
- ${cerro.viajes_cerro || 0} viajes a zonas mineras | Rendimiento cerro: ${cerro.rend_cerro || 'N/A'} km/L

CONOCIMIENTO MINERO:
- Rutas de alta montaña: rendimiento normal 1.5-2.5 km/L (vs 3-4 km/L en plano)
- Velocidad segura en mina: 40-60 km/h máximo
- Factores de cerro: pendiente, curvas, altitud (menor O2), clima (nieve/hielo en invierno), polvo
- Los Bronces: acceso por Camino a Farellones / Lo Barnechea, restricciones por clima invernal
- El Soldado: acceso por Nogales, camino minero interior

CAPACIDADES:
1. Auto-alias GPS: mapea geocercas a puntos del contrato
2. Detección anomalías cerro: rendimiento bajo, excesos velocidad en rutas mineras
3. Monitoreo altitud: seguimiento de rutas alta montaña
4. Facturación inteligente: cruce viajes × tarifas componente variable 28T

Responde en español, max 250 palabras, con datos reales. Piensa como operador minero: seguridad primero, luego productividad y facturación.`,
        messages: [...hist.rows.reverse().map((h: any) => ({ role: h.rol === "CEO" ? "user" as const : "assistant" as const, content: h.mensaje })), { role: "user" as const, content: mensaje }],
      });
      const texto = resp.content[0].type === "text" ? resp.content[0].text : "Error.";
      await pool.query("INSERT INTO anglo_agente_chat (rol, mensaje) VALUES ('AGENTE', $1)", [texto]);
      return texto;
    } catch (e: any) {
      console.error("[SUPER-ANGLO] Chat:", e.message);
      return `Error: ${e.message}. Verifica que ANTHROPIC_API_KEY está configurada.`;
    }
  },
};

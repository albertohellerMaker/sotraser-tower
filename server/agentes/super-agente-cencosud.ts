import { pool } from "../db";

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

export const superAgenteCencosud = {
  id: "super-agente-cencosud",

  async iniciar() {
    console.log("[SUPER-CENCOSUD] Iniciando...");
    setInterval(async () => { try { await this.ejecutarCiclo(); } catch (e: any) { console.error("[SUPER-CENCOSUD]", e.message); } }, 30 * 60 * 1000);
    setTimeout(async () => { try { await this.ejecutarCiclo(); } catch (e: any) { console.error("[SUPER-CENCOSUD]", e.message); } }, 20000);
  },

  async ejecutarCiclo() {
    console.log("[SUPER-CENCOSUD] Ciclo...");
    try {
      // PRIORIDAD 1: Construir geocercas propias
      const geoResult = await this.construirGeoReferencias();
      // PRIORIDAD 2: Clasificar viajes con geocercas propias
      const clasResult = await this.clasificarViajes();
      // PRIORIDAD 3: Análisis financiero y operativo
      await this.analizarFinanciero();
      await this.verificarMetas();
      await this.detectarAnomalias();

      await pool.query("UPDATE cencosud_agente_estado SET ultimo_ciclo = NOW(), ciclos_hoy = ciclos_hoy + 1, updated_at = NOW() WHERE id = 1");
      console.log(`[SUPER-CENCOSUD] OK: +${geoResult.nuevas} geocercas, ${clasResult.clasificados} viajes clasificados`);
    } catch (e: any) { console.error("[SUPER-CENCOSUD] Error:", e.message); }
  },

  // ═══════════════════════════════════════════════════
  // CONSTRUIR GEOCERCAS PROPIAS (usa Google Maps)
  // ═══════════════════════════════════════════════════
  async construirGeoReferencias() {
    // ── REGLA ABSOLUTA: cargar geocercas KML primero ──
    // Las geocercas importadas desde KML NO se modifican ni se duplican.
    let geocercasKml: any[] = [];
    try {
      const kmlRes = await pool.query("SELECT lat::float, lng::float, radio_m FROM cencosud_geocercas_kml WHERE activa = true");
      geocercasKml = kmlRes.rows;
    } catch { /* tabla aún no existe */ }

    // Cargar geocercas auto-aprendidas del TMS
    const geos = await pool.query("SELECT * FROM cencosud_geocercas WHERE activa = true");
    // Combinar ambas para evitar duplicados
    const geocercas = [...geos.rows, ...geocercasKml];

    // Buscar puntos de viajes Cencosud que NO caen en ninguna geocerca (KML o auto)
    const puntos = await pool.query(`
      SELECT DISTINCT ROUND(lat::numeric, 4) as lat, ROUND(lng::numeric, 4) as lng, COUNT(*)::int as viajes FROM (
        SELECT va.origen_lat::float as lat, va.origen_lng::float as lng
        FROM viajes_aprendizaje va
        WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= NOW() - INTERVAL '14 days' AND va.km_ecu > 0 AND va.origen_lat IS NOT NULL
        UNION ALL
        SELECT va.destino_lat::float, va.destino_lng::float
        FROM viajes_aprendizaje va
        WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= NOW() - INTERVAL '14 days' AND va.km_ecu > 0 AND va.destino_lat IS NOT NULL
      ) sub WHERE lat IS NOT NULL
      GROUP BY ROUND(lat::numeric, 4), ROUND(lng::numeric, 4)
      HAVING COUNT(*) >= 2
      ORDER BY viajes DESC LIMIT 50
    `);

    let nuevas = 0;
    for (const p of puntos.rows) {
      // Verificar si ya cae en una geocerca existente
      const enGeo = geocercas.find((g: any) => distKm(p.lat, p.lng, g.lat, g.lng) * 1000 < g.radio_m);
      if (enGeo) continue;

      // Punto nuevo — usar Google Maps para identificarlo
      const info = await this.reverseGeocode(p.lat, p.lng);
      if (!info) continue;

      // Determinar tipo y nombre contrato
      const { nombre, ciudad, esCD } = this.clasificarPunto(info, p.lat, p.lng);
      if (!ciudad) continue;

      // Buscar si esta ciudad existe en las rutas del contrato
      const rutaMatch = await pool.query(
        "SELECT DISTINCT destino FROM contrato_rutas_tarifas WHERE contrato = 'CENCOSUD' AND (destino ILIKE $1 OR origen ILIKE $1) LIMIT 1",
        [`%${ciudad}%`]
      );
      const nombreContrato = rutaMatch.rows[0]?.destino || ciudad;

      try {
        await pool.query(
          `INSERT INTO cencosud_geocercas (nombre, nombre_contrato, tipo, lat, lng, radio_m, ciudad, viajes_detectados, creado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'AGENTE_AUTO') ON CONFLICT DO NOTHING`,
          [nombre, nombreContrato, esCD ? "CD" : "LOCAL", p.lat, p.lng, esCD ? 2000 : 1500, ciudad, p.viajes]
        );
        nuevas++;
      } catch { /* duplicate */ }
    }

    if (nuevas > 0) {
      await guardarMensaje("GEOCERCA", "NORMAL",
        `${nuevas} geocercas creadas automáticamente`,
        `El agente identificó ${nuevas} puntos nuevos usando Google Maps y los asoció al contrato.`,
        { nuevas });
    }

    return { nuevas };
  },

  // Reverse geocode con Google Maps
  async reverseGeocode(lat: number, lng: number): Promise<any | null> {
    try {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) return null;
      const https = require("https");
      const result: any = await new Promise((resolve) => {
        https.get(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&language=es&result_type=street_address|establishment|route|locality`, (res: any) => {
          let data = ""; res.on("data", (c: string) => data += c);
          res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
        }).on("error", () => resolve(null));
      });
      if (result?.status !== "OK" || !result.results?.[0]) return null;
      return result.results[0];
    } catch { return null; }
  },

  // Clasificar un punto geocodificado
  clasificarPunto(gmResult: any, lat: number, lng: number): { nombre: string; ciudad: string | null; esCD: boolean } {
    const addr = gmResult.address_components || [];
    const formatted = gmResult.formatted_address || "";

    const locality = addr.find((c: any) => c.types.includes("locality"))?.long_name;
    const route = addr.find((c: any) => c.types.includes("route"))?.long_name;
    const sublocality = addr.find((c: any) => c.types.includes("sublocality"))?.long_name;
    const premise = addr.find((c: any) => c.types.includes("premise"))?.long_name;

    // Detectar si es un CD/CT (centro de distribución)
    const esCDText = formatted.toLowerCase();
    const esCD = esCDText.includes("centro de distribución") || esCDText.includes("bodega") || esCDText.includes("galpón") || esCDText.includes("warehouse");

    // Nombre descriptivo
    let nombre = "";
    if (premise) nombre = premise;
    else if (route && locality) nombre = `${route}, ${locality}`;
    else if (sublocality && locality) nombre = `${sublocality}, ${locality}`;
    else if (locality) nombre = locality;
    else nombre = formatted.split(",")[0];

    // Detectar si es Jumbo o Santa Isabel
    if (formatted.toLowerCase().includes("jumbo")) nombre = `Jumbo ${locality || sublocality || ""}`.trim();
    if (formatted.toLowerCase().includes("santa isabel")) nombre = `Santa Isabel ${locality || sublocality || ""}`.trim();

    return { nombre: nombre.substring(0, 60), ciudad: locality || null, esCD };
  },

  // ═══════════════════════════════════════════════════
  // CLASIFICAR VIAJES — KML primero (regla absoluta)
  // ═══════════════════════════════════════════════════
  async clasificarViajes() {
    // 1. Geocercas KML oficiales (prioridad absoluta)
    let geocercasKml: any[] = [];
    try {
      const kmlRes = await pool.query("SELECT id, nombre, lat::float, lng::float, radio_m FROM cencosud_geocercas_kml WHERE activa = true");
      geocercasKml = kmlRes.rows.map((g: any) => ({ ...g, fuente: "KML" }));
    } catch { /* tabla no existe aún */ }

    // 2. Geocercas auto-aprendidas (solo si KML no resuelve)
    const geos = await pool.query("SELECT id, nombre, nombre_contrato, lat::float, lng::float, radio_m FROM cencosud_geocercas WHERE activa = true");
    const geocercasAuto = geos.rows.map((g: any) => ({ ...g, fuente: "AUTO" }));

    // KML siempre primero
    const todasGeo = [...geocercasKml, ...geocercasAuto];

    // Viajes sin clasificar (origen o destino sin nombre de contrato)
    const viajes = await pool.query(`
      SELECT va.id, va.origen_lat::float as olat, va.origen_lng::float as olng,
        va.destino_lat::float as dlat, va.destino_lng::float as dlng,
        va.origen_nombre, va.destino_nombre
      FROM viajes_aprendizaje va
      WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= NOW() - INTERVAL '14 days' AND va.km_ecu > 0
        AND (va.origen_nombre IS NULL OR va.origen_nombre = 'Punto desconocido'
          OR va.destino_nombre IS NULL OR va.destino_nombre = 'Punto desconocido')
      LIMIT 100
    `);

    let clasificados = 0;
    for (const v of viajes.rows) {
      // Clasificar origen — KML tiene prioridad
      if ((!v.origen_nombre || v.origen_nombre === "Punto desconocido") && v.olat) {
        const match = todasGeo.find((g: any) => distKm(v.olat, v.olng, g.lat, g.lng) * 1000 < g.radio_m);
        if (match) {
          await pool.query("UPDATE viajes_aprendizaje SET origen_nombre = $1 WHERE id = $2", [`[TMS] ${match.nombre}`, v.id]);
          if (match.fuente === "AUTO") {
            await pool.query("UPDATE cencosud_geocercas SET viajes_detectados = viajes_detectados + 1 WHERE id = $1", [match.id]);
          }
          clasificados++;
        }
      }
      // Clasificar destino — KML tiene prioridad
      if ((!v.destino_nombre || v.destino_nombre === "Punto desconocido") && v.dlat) {
        const match = todasGeo.find((g: any) => distKm(v.dlat, v.dlng, g.lat, g.lng) * 1000 < g.radio_m);
        if (match) {
          await pool.query("UPDATE viajes_aprendizaje SET destino_nombre = $1 WHERE id = $2", [`[TMS] ${match.nombre}`, v.id]);
          if (match.fuente === "AUTO") {
            await pool.query("UPDATE cencosud_geocercas SET viajes_detectados = viajes_detectados + 1 WHERE id = $1", [match.id]);
          }
          clasificados++;
        }
      }
    }

    // Auto-crear alias para geocercas TMS nuevas (solo AUTO, las KML ya tienen alias)
    for (const g of geocercasAuto) {
      try {
        await pool.query(
          "INSERT INTO geocerca_alias_contrato (geocerca_nombre, nombre_contrato, contrato, confirmado, creado_por) VALUES ($1,$2,'CENCOSUD',true,'TMS_AUTO') ON CONFLICT DO NOTHING",
          [`[TMS] ${g.nombre}`, g.nombre_contrato]
        );
      } catch {}
    }

    return { clasificados, pendientes: viajes.rows.length - clasificados };
  },

  // ═══════════════════════════════════════════════════
  // ANÁLISIS FINANCIERO
  // ═══════════════════════════════════════════════════
  async analizarFinanciero() {
    const params = await getParams();
    const hoy = new Date().toISOString().slice(0, 10);
    const retornoFactor = 1 + params.pct_retorno / 100;

    const viajes = await pool.query(`
      SELECT c.patente, ROUND(SUM(va.km_ecu)::numeric) as km,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
        COUNT(*)::int as viajes
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE DATE(va.fecha_inicio) = $1 AND va.contrato = 'CENCOSUD' AND va.km_ecu > 0
      GROUP BY c.patente
    `, [hoy]);

    for (const v of viajes.rows) {
      const km = parseFloat(v.km || 0) * retornoFactor;
      const rend = parseFloat(v.rend || params.meta_rendimiento);
      const litros = km / Math.max(rend, 0.1);
      const costoTotal = litros * params.precio_diesel + km * params.cvm_km + params.costo_conductor_dia + params.costo_fijo_dia;
      const ingreso = km * params.tarifa_km_cargado;
      const margenPct = ingreso > 0 ? (ingreso - costoTotal) / ingreso * 100 : 0;

      if (margenPct < params.alerta_margen_minimo && km > 50) {
        await guardarMensaje("FINANCIERO", margenPct < 0 ? "CRITICA" : "ALTA",
          `Margen bajo: ${v.patente} al ${Math.round(margenPct)}%`,
          `${Math.round(km)}km | Ingreso $${Math.round(ingreso).toLocaleString()} | Costo $${Math.round(costoTotal).toLocaleString()} | Margen ${Math.round(margenPct)}%`,
          { patente: v.patente, km, ingreso, costo: costoTotal, margenPct: Math.round(margenPct) });
      }
    }
  },

  // ═══════════════════════════════════════════════════
  // VERIFICAR METAS
  // ═══════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════
  // ANOMALÍAS
  // ═══════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════
  // CHAT IA
  // ═══════════════════════════════════════════════════
  async chat(mensaje: string): Promise<string> {
    try {
      const params = await getParams();
      const hoy = new Date().toISOString().slice(0, 10);
      const retornoFactor = 1 + params.pct_retorno / 100;

      const [ctx, geoCount] = await Promise.all([
        pool.query(`SELECT COUNT(DISTINCT c.patente)::int as camiones, COUNT(*)::int as viajes,
          ROUND(SUM(va.km_ecu)::numeric) as km, ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
          FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
          WHERE DATE(va.fecha_inicio) = $1 AND va.contrato = 'CENCOSUD' AND va.km_ecu > 0`, [hoy]),
        pool.query("SELECT COUNT(*)::int as total FROM cencosud_geocercas WHERE activa = true"),
      ]);
      const c = ctx.rows[0];
      const km = parseFloat(c.km || 0) * retornoFactor;
      const ingreso = km * params.tarifa_km_cargado;
      const litros = km / Math.max(parseFloat(c.rend || 3), 0.1);
      const costo = litros * params.precio_diesel + km * params.cvm_km + parseInt(c.camiones || 0) * (params.costo_conductor_dia + params.costo_fijo_dia);

      const hist = await pool.query("SELECT rol, mensaje FROM cencosud_agente_chat ORDER BY created_at DESC LIMIT 8");
      await pool.query("INSERT INTO cencosud_agente_chat (rol, mensaje) VALUES ('CEO', $1)", [mensaje]);

      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const resp = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514", max_tokens: 400,
        system: `Eres el Super Agente TMS del contrato Cencosud de Sotraser. Datos reales, español, max 150 palabras.
HOY ${hoy}: ${c.camiones} cam, ${c.viajes} viajes, ${Math.round(km).toLocaleString()} km, ${c.rend} km/L
Ingreso: $${Math.round(ingreso).toLocaleString()} | Costo: $${Math.round(costo).toLocaleString()} | Margen: $${Math.round(ingreso - costo).toLocaleString()} (${Math.round((ingreso - costo) / Math.max(ingreso, 1) * 100)}%)
Geocercas TMS: ${geoCount.rows[0].total} | Diesel $${params.precio_diesel}/L | Tarifa $${params.tarifa_km_cargado}/km | Meta ${params.meta_km_mes.toLocaleString()} km/mes
Contrato: 83 camiones, 7 lotes, CDs Vespucio/Lo Aguirre/Noviciado/Chillán, destinos Jumbo y Santa Isabel`,
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

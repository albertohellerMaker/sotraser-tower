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
      const geoResult = await this.construirGeoReferencias();
      const clasResult = await this.clasificarViajes();
      const facResult = await this.inteligenciaFacturacion();
      await this.analizarFinanciero();
      await this.verificarMetas();
      await this.detectarAnomalias();

      await pool.query("UPDATE cencosud_agente_estado SET ultimo_ciclo = NOW(), ciclos_hoy = ciclos_hoy + 1, updated_at = NOW() WHERE id = 1");
      console.log(`[SUPER-CENCOSUD] OK: +${geoResult.nuevas} geocercas, ${clasResult.clasificados} viajes clasificados, facturación: ${facResult.conTarifa}/${facResult.totalViajes} con tarifa ($${facResult.ingresoTarifa.toLocaleString()})`);
    } catch (e: any) { console.error("[SUPER-CENCOSUD] Error:", e.message); }
  },

  async construirGeoReferencias() {
    let geocercasKml: any[] = [];
    try {
      const kmlRes = await pool.query("SELECT lat::float, lng::float, radio_m FROM cencosud_geocercas_kml WHERE activa = true");
      geocercasKml = kmlRes.rows;
    } catch {}

    const geos = await pool.query("SELECT * FROM cencosud_geocercas WHERE activa = true");
    const geocercas = [...geos.rows, ...geocercasKml];

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
      const enGeo = geocercas.find((g: any) => distKm(p.lat, p.lng, g.lat, g.lng) * 1000 < g.radio_m);
      if (enGeo) continue;

      const info = await this.reverseGeocode(p.lat, p.lng);
      if (!info) continue;

      const { nombre, ciudad, esCD } = this.clasificarPunto(info, p.lat, p.lng);
      if (!ciudad) continue;

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
      } catch {}
    }

    if (nuevas > 0) {
      await guardarMensaje("GEOCERCA", "NORMAL",
        `${nuevas} geocercas creadas automáticamente`,
        `El agente identificó ${nuevas} puntos nuevos usando Google Maps y los asoció al contrato.`,
        { nuevas });
    }

    return { nuevas };
  },

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

  clasificarPunto(gmResult: any, lat: number, lng: number): { nombre: string; ciudad: string | null; esCD: boolean } {
    const addr = gmResult.address_components || [];
    const formatted = gmResult.formatted_address || "";

    const locality = addr.find((c: any) => c.types.includes("locality"))?.long_name;
    const route = addr.find((c: any) => c.types.includes("route"))?.long_name;
    const sublocality = addr.find((c: any) => c.types.includes("sublocality"))?.long_name;
    const premise = addr.find((c: any) => c.types.includes("premise"))?.long_name;

    const esCDText = formatted.toLowerCase();
    const esCD = esCDText.includes("centro de distribución") || esCDText.includes("bodega") || esCDText.includes("galpón") || esCDText.includes("warehouse");

    let nombre = "";
    if (premise) nombre = premise;
    else if (route && locality) nombre = `${route}, ${locality}`;
    else if (sublocality && locality) nombre = `${sublocality}, ${locality}`;
    else if (locality) nombre = locality;
    else nombre = formatted.split(",")[0];

    if (formatted.toLowerCase().includes("jumbo")) nombre = `Jumbo ${locality || sublocality || ""}`.trim();
    if (formatted.toLowerCase().includes("santa isabel")) nombre = `Santa Isabel ${locality || sublocality || ""}`.trim();

    return { nombre: nombre.substring(0, 60), ciudad: locality || null, esCD };
  },

  async clasificarViajes() {
    let geocercasKml: any[] = [];
    try {
      const kmlRes = await pool.query("SELECT id, nombre, lat::float, lng::float, radio_m FROM cencosud_geocercas_kml WHERE activa = true");
      geocercasKml = kmlRes.rows.map((g: any) => ({ ...g, fuente: "KML" }));
    } catch {}

    const geos = await pool.query("SELECT id, nombre, nombre_contrato, lat::float, lng::float, radio_m FROM cencosud_geocercas WHERE activa = true");
    const geocercasAuto = geos.rows.map((g: any) => ({ ...g, fuente: "AUTO" }));

    const todasGeo = [...geocercasKml, ...geocercasAuto];

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

  async inteligenciaFacturacion() {
    const tarifasR = await pool.query(`
      SELECT origen, destino, tarifa::float FROM contrato_rutas_tarifas
      WHERE contrato = 'CENCOSUD' AND activo = true
    `);
    const tarifas = tarifasR.rows;

    const aliasR = await pool.query(`
      SELECT geocerca_nombre, nombre_contrato FROM geocerca_alias_contrato
      WHERE contrato = 'CENCOSUD' AND confirmado = true
    `);
    const aliasMap = new Map<string, string>();
    aliasR.rows.forEach((a: any) => aliasMap.set(a.geocerca_nombre, a.nombre_contrato));

    const viajesR = await pool.query(`
      SELECT va.id, va.origen_nombre, va.destino_nombre, va.km_ecu, va.fecha_inicio,
             c.patente
      FROM viajes_aprendizaje va
      JOIN camiones c ON c.id = va.camion_id
      WHERE va.contrato = 'CENCOSUD'
        AND va.fecha_inicio >= DATE_TRUNC('month', NOW())
        AND va.km_ecu > 10
      ORDER BY va.fecha_inicio DESC
    `);

    let conTarifa = 0;
    let sinTarifa = 0;
    let ingresoTarifa = 0;
    const sinAlias = new Map<string, number>();
    const sinRuta = new Map<string, number>();

    for (const v of viajesR.rows) {
      const origenAlias = aliasMap.get(v.origen_nombre) || null;
      const destinoAlias = aliasMap.get(v.destino_nombre) || null;

      if (!origenAlias && v.origen_nombre && v.origen_nombre !== "Punto desconocido") {
        sinAlias.set(v.origen_nombre, (sinAlias.get(v.origen_nombre) || 0) + 1);
      }
      if (!destinoAlias && v.destino_nombre && v.destino_nombre !== "Punto desconocido") {
        sinAlias.set(v.destino_nombre, (sinAlias.get(v.destino_nombre) || 0) + 1);
      }

      if (origenAlias && destinoAlias) {
        const tarifa = tarifas.find(t => t.origen === origenAlias && t.destino === destinoAlias);
        if (tarifa) {
          conTarifa++;
          ingresoTarifa += tarifa.tarifa;
        } else {
          sinTarifa++;
          const rutaKey = `${origenAlias} → ${destinoAlias}`;
          sinRuta.set(rutaKey, (sinRuta.get(rutaKey) || 0) + 1);
        }
      } else {
        sinTarifa++;
      }
    }

    const totalViajes = conTarifa + sinTarifa;
    const pctFacturable = totalViajes > 0 ? Math.round(conTarifa / totalViajes * 100) : 0;

    if (sinAlias.size > 0) {
      const topSinAlias = [...sinAlias.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const detalle = topSinAlias.map(([nombre, cnt]) => `${nombre} (${cnt} viajes)`).join("\n");

      await this.autoCrearAlias(topSinAlias);

      if (topSinAlias.some(([_, cnt]) => cnt >= 3)) {
        await guardarMensaje("FACTURACION", "ALTA",
          `${sinAlias.size} geocercas sin alias = viajes sin facturar`,
          `Estos puntos aparecen en viajes pero no tienen traducción al contrato comercial:\n${detalle}\n\nSin alias, estos viajes NO se pueden facturar a Cencosud.`,
          { sinAlias: topSinAlias, perdidaEstimada: sinTarifa });
      }
    }

    if (sinRuta.size > 0) {
      const topSinRuta = [...sinRuta.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const detalle = topSinRuta.map(([ruta, cnt]) => `${ruta} (${cnt} viajes)`).join("\n");

      if (topSinRuta.some(([_, cnt]) => cnt >= 2)) {
        await guardarMensaje("FACTURACION", "CRITICA",
          `${sinRuta.size} rutas con alias pero SIN TARIFA = $0 facturación`,
          `Estas rutas tienen alias mapeado pero no existe tarifa en el contrato:\n${detalle}\n\nEstos viajes se hicieron pero NO generan ingreso. Hay que agregar la tarifa o negociarla con Cencosud.`,
          { sinRuta: topSinRuta });
      }
    }

    if (pctFacturable < 70 && totalViajes > 10) {
      await guardarMensaje("FACTURACION", "CRITICA",
        `Solo ${pctFacturable}% de viajes facturables (${conTarifa}/${totalViajes})`,
        `De ${totalViajes} viajes este mes, solo ${conTarifa} tienen tarifa asignada.\nIngreso confirmado: $${ingresoTarifa.toLocaleString()}\nViajes sin facturar: ${sinTarifa} (= plata perdida).\n\nEl agente está intentando auto-crear alias para resolver esto.`,
        { conTarifa, sinTarifa, totalViajes, pctFacturable, ingresoTarifa });
    }

    return { conTarifa, sinTarifa, totalViajes, ingresoTarifa, pctFacturable };
  },

  async autoCrearAlias(sinAlias: [string, number][]) {
    const tarifasR = await pool.query(`
      SELECT DISTINCT origen FROM contrato_rutas_tarifas WHERE contrato = 'CENCOSUD' AND activo = true
      UNION
      SELECT DISTINCT destino FROM contrato_rutas_tarifas WHERE contrato = 'CENCOSUD' AND activo = true
    `);
    const nombresContrato = tarifasR.rows.map((r: any) => r.origen);

    let creados = 0;
    for (const [nombreGeo, viajes] of sinAlias) {
      if (viajes < 2) continue;
      const geoUp = nombreGeo.toUpperCase().replace(/\[TMS\]\s*/g, "");

      let mejorMatch: string | null = null;
      let mejorScore = 0;

      for (const nc of nombresContrato) {
        const ncUp = nc.toUpperCase();

        if (geoUp.includes(ncUp) || ncUp.includes(geoUp)) {
          mejorMatch = nc;
          mejorScore = 100;
          break;
        }

        const palabrasGeo = geoUp.split(/[\s,\-_]+/).filter(p => p.length > 2);
        const palabrasNc = ncUp.split(/[\s,\-_]+/).filter(p => p.length > 2);
        let coincidencias = 0;
        for (const pg of palabrasGeo) {
          if (palabrasNc.some(pn => pn.includes(pg) || pg.includes(pn))) coincidencias++;
        }
        const score = palabrasGeo.length > 0 ? (coincidencias / palabrasGeo.length) * 100 : 0;
        if (score > mejorScore && score >= 50) {
          mejorScore = score;
          mejorMatch = nc;
        }
      }

      if (mejorMatch && mejorScore >= 50) {
        try {
          await pool.query(
            `INSERT INTO geocerca_alias_contrato (geocerca_nombre, nombre_contrato, contrato, confirmado, creado_por)
             VALUES ($1, $2, 'CENCOSUD', $3, 'AGENTE_AUTO')
             ON CONFLICT (geocerca_nombre, nombre_contrato, contrato) DO NOTHING`,
            [nombreGeo, mejorMatch, mejorScore >= 80]
          );
          creados++;
        } catch {}
      }
    }

    if (creados > 0) {
      console.log(`[SUPER-CENCOSUD] Auto-creó ${creados} alias para facturación`);
    }
  },

  async analizarFinanciero() {
    const params = await getParams();
    const hoy = new Date().toISOString().slice(0, 10);

    const facturacion = await pool.query(`
      SELECT c.patente,
             COUNT(*)::int as viajes,
             ROUND(SUM(va.km_ecu)::numeric) as km,
             COUNT(crt.tarifa)::int as viajes_con_tarifa,
             COALESCE(SUM(crt.tarifa), 0)::float as ingreso_tarifa,
             ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
      FROM viajes_aprendizaje va
      JOIN camiones c ON c.id = va.camion_id
      LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = 'CENCOSUD'
      LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = 'CENCOSUD'
      LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = 'CENCOSUD' AND crt.activo = true
      WHERE DATE(va.fecha_inicio) = $1 AND va.contrato = 'CENCOSUD' AND va.km_ecu > 0
      GROUP BY c.patente
    `, [hoy]);

    const retornoFactor = 1 + params.pct_retorno / 100;

    for (const v of facturacion.rows) {
      const km = parseFloat(v.km || 0) * retornoFactor;
      const rend = parseFloat(v.rend || params.meta_rendimiento);
      const litros = km / Math.max(rend, 0.1);
      const costoTotal = litros * params.precio_diesel + km * params.cvm_km + params.costo_conductor_dia + params.costo_fijo_dia;
      const ingreso = v.ingreso_tarifa > 0 ? v.ingreso_tarifa : km * params.tarifa_km_cargado;
      const margenPct = ingreso > 0 ? (ingreso - costoTotal) / ingreso * 100 : 0;

      if (v.viajes > 0 && v.viajes_con_tarifa === 0 && km > 50) {
        await guardarMensaje("FACTURACION", "CRITICA",
          `${v.patente}: ${v.viajes} viajes SIN TARIFA = $0`,
          `Camión ${v.patente} hizo ${v.viajes} viajes hoy (${Math.round(km)}km) pero ninguno tiene tarifa asignada. Estos viajes no generan ingreso.`,
          { patente: v.patente, viajes: v.viajes, km: Math.round(km), ingreso: 0 });
      } else if (margenPct < params.alerta_margen_minimo && km > 50) {
        await guardarMensaje("FINANCIERO", margenPct < 0 ? "CRITICA" : "ALTA",
          `Margen bajo: ${v.patente} al ${Math.round(margenPct)}%`,
          `${Math.round(km)}km | ${v.viajes_con_tarifa}/${v.viajes} viajes tarifados | Ingreso $${Math.round(ingreso).toLocaleString()} | Costo $${Math.round(costoTotal).toLocaleString()} | Margen ${Math.round(margenPct)}%`,
          { patente: v.patente, km, ingreso, costo: costoTotal, margenPct: Math.round(margenPct), viajesConTarifa: v.viajes_con_tarifa, viajesSinTarifa: v.viajes - v.viajes_con_tarifa });
      }
    }
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

    const facMes = await pool.query(`
      SELECT COUNT(*)::int as total,
             COUNT(crt.tarifa)::int as con_tarifa,
             COALESCE(SUM(crt.tarifa), 0)::float as ingreso_tarifa
      FROM viajes_aprendizaje va
      LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = 'CENCOSUD'
      LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = 'CENCOSUD'
      LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = 'CENCOSUD' AND crt.activo = true
      WHERE va.fecha_inicio >= DATE_TRUNC('month', NOW()) AND va.contrato = 'CENCOSUD' AND va.km_ecu > 10
    `);

    const fac = facMes.rows[0];
    const pctFacturable = fac.total > 0 ? Math.round(fac.con_tarifa / fac.total * 100) : 0;

    if (pctMeta < pctEsperado - 15 && dia > 5) {
      await guardarMensaje("META", pctMeta < pctEsperado - 25 ? "ALTA" : "NORMAL",
        `Meta en riesgo: ${pctMeta}% (esperado ${pctEsperado}%)`,
        `Acumulado ${acum.toLocaleString()} km de ${params.meta_km_mes.toLocaleString()} km meta.\nFacturación mes: $${Math.round(fac.ingreso_tarifa).toLocaleString()} (${fac.con_tarifa}/${fac.total} viajes tarifados = ${pctFacturable}%)`,
        { acum, pctMeta, pctEsperado, ingresoMes: fac.ingreso_tarifa, pctFacturable });
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
          SELECT COUNT(*)::int as total,
                 COUNT(crt.tarifa)::int as con_tarifa,
                 COALESCE(SUM(crt.tarifa), 0)::float as ingreso
          FROM viajes_aprendizaje va
          LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = 'CENCOSUD'
          LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = 'CENCOSUD'
          LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = 'CENCOSUD' AND crt.activo = true
          WHERE va.fecha_inicio >= DATE_TRUNC('month', NOW()) AND va.contrato = 'CENCOSUD' AND va.km_ecu > 10
        `),
        pool.query(`
          SELECT COUNT(*)::int as total,
                 COUNT(*) FILTER (WHERE confirmado = true)::int as confirmados
          FROM geocerca_alias_contrato WHERE contrato = 'CENCOSUD'
        `),
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
- Geocercas KML: ${geoCount.rows[0].total} polígonos exactos (30 Santa Isabel, 17 Jumbo, 8 CD, 8 Copec, etc.)
- Copec/Shell = paradas de combustible (NO son destinos de viaje)
- Dwell time: 10 min mínimo dentro del polígono para activar geocerca

FACTURACIÓN MES:
- ${fac.total} viajes totales | ${fac.con_tarifa} con tarifa (${pctFact}%) | ${fac.total - fac.con_tarifa} SIN TARIFA
- Ingreso tarifado: $${Math.round(fac.ingreso).toLocaleString()}
- ${alias.total} alias (${alias.confirmados} confirmados) | ${tarifaData.rows[0].total} rutas tarifadas

LÓGICA DE NEGOCIO:
1. GPS detecta parada en polígono KML → nombre geocerca
2. Alias traduce nombre → nombre comercial del contrato
3. Tarifa cruza origen+destino → precio por viaje
4. Si falta alias o tarifa → viaje NO se factura = pérdida

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

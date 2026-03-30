import { pool } from "../db";
import { enviarMensaje } from "./index";

export const agenteCencosud = {
  id: "agente-admin-contrato",

  // ═══════════════════════════════════════════════════
  // ADMINISTRADOR DE CONTRATO CENCOSUD
  // Foco: georeferencias + cruce tarifas + reportería
  // Reporta a: Gerente Ops, CEO
  // ═══════════════════════════════════════════════════

  async ejecutar() {
    console.log("[ADMIN-CONTRATO] Ciclo Cencosud...");
    try {
      const hoy = new Date().toISOString().slice(0, 10);

      // FASE 1: Georeferencias (prioridad máxima)
      const geo = await this.trabajarGeoReferencias();

      // FASE 2: Validar alias existentes (auto-corrección)
      const validacion = await this.validarAliasExistentes();

      // FASE 3: Cruzar viajes con tarifas
      const cruce = await this.cruzarRutasTarifas(hoy);

      // FASE 4: Detectar rutas del contrato sin uso
      const rutasSinUso = await this.detectarRutasSinUso();

      // FASE 5: Productividad
      const prod = await this.calcularProductividad();

      // FASE 6: Guardar ficha
      await this.guardarFicha(hoy, cruce, prod, geo);

      // FASE 7: Reportar a estructura de bots
      await this.reportar(hoy, cruce, prod, geo, validacion, rutasSinUso);

      await pool.query("UPDATE agentes SET ultimo_ciclo = NOW(), ciclos_completados = ciclos_completados + 1, errores_consecutivos = 0 WHERE id = $1", [this.id]);
      console.log(`[ADMIN-CONTRATO] OK: geo:${geo.nuevos}/${geo.pendientes} | cruce:${cruce.matcheados}/${cruce.total} (${cruce.pct}%) | $${Math.round(cruce.ingreso).toLocaleString()}`);
    } catch (e: any) {
      console.error("[ADMIN-CONTRATO]", e.message);
      await pool.query("UPDATE agentes SET errores_consecutivos = errores_consecutivos + 1 WHERE id = $1", [this.id]);
    }
  },

  // ═══════════════════════════════════════════════════
  // FASE 1: GEOREFERENCIAS — el trabajo principal
  // ═══════════════════════════════════════════════════
  async trabajarGeoReferencias() {
    // 1A: Mapear por coordenadas (puntos nuevos)
    const sinAlias = await pool.query(`
      SELECT DISTINCT sub.nombre, sub.lat, sub.lng, sub.viajes FROM (
        SELECT va.origen_nombre as nombre, va.origen_lat::float as lat, va.origen_lng::float as lng, COUNT(*)::int as viajes
        FROM viajes_aprendizaje va
        LEFT JOIN geocerca_alias_contrato gac ON gac.geocerca_nombre = va.origen_nombre AND gac.contrato = 'CENCOSUD'
        WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= NOW() - INTERVAL '30 days'
          AND va.origen_nombre IS NOT NULL AND va.origen_nombre != 'Punto desconocido'
          AND gac.id IS NULL AND va.km_ecu > 0 AND va.origen_lat IS NOT NULL
        GROUP BY va.origen_nombre, va.origen_lat, va.origen_lng
        UNION ALL
        SELECT va.destino_nombre, va.destino_lat::float, va.destino_lng::float, COUNT(*)::int
        FROM viajes_aprendizaje va
        LEFT JOIN geocerca_alias_contrato gac ON gac.geocerca_nombre = va.destino_nombre AND gac.contrato = 'CENCOSUD'
        WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= NOW() - INTERVAL '30 days'
          AND va.destino_nombre IS NOT NULL AND va.destino_nombre != 'Punto desconocido'
          AND gac.id IS NULL AND va.km_ecu > 0 AND va.destino_lat IS NOT NULL
        GROUP BY va.destino_nombre, va.destino_lat, va.destino_lng
      ) sub ORDER BY viajes DESC LIMIT 200
    `);

    let nuevos = 0;
    for (const s of sinAlias.rows) {
      if (!s.lat || !s.lng) continue;
      const match = this.buscarCiudadCercana(s.lat, s.lng);
      if (match) {
        try {
          await pool.query("INSERT INTO geocerca_alias_contrato (geocerca_nombre, nombre_contrato, contrato, confirmado, creado_por) VALUES ($1,$2,'CENCOSUD',true,'ADMIN_CONTRATO') ON CONFLICT DO NOTHING", [s.nombre, match.nombre]);
          nuevos++;
        } catch {}
      }
    }

    // 1B: Intentar mapear "Punto desconocido" usando coordenadas directamente
    const desconocidos = await pool.query(`
      SELECT va.id, va.origen_lat::float as olat, va.origen_lng::float as olng,
        va.destino_lat::float as dlat, va.destino_lng::float as dlng,
        va.origen_nombre, va.destino_nombre
      FROM viajes_aprendizaje va
      WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= NOW() - INTERVAL '7 days' AND va.km_ecu > 0
        AND (va.origen_nombre = 'Punto desconocido' OR va.origen_nombre IS NULL
          OR va.destino_nombre = 'Punto desconocido' OR va.destino_nombre IS NULL)
      LIMIT 50
    `);

    let puntosResueltos = 0;
    for (const v of desconocidos.rows) {
      if ((!v.origen_nombre || v.origen_nombre === "Punto desconocido") && v.olat) {
        const match = this.buscarCiudadCercana(v.olat, v.olng);
        if (match) {
          const nombre = `Local Cencosud ${match.nombre} (${Math.round(match.dist)}km)`;
          await pool.query("UPDATE viajes_aprendizaje SET origen_nombre = $1 WHERE id = $2", [nombre, v.id]);
          // Crear alias automático
          try { await pool.query("INSERT INTO geocerca_alias_contrato (geocerca_nombre, nombre_contrato, contrato, confirmado, creado_por) VALUES ($1,$2,'CENCOSUD',true,'ADMIN_CONTRATO') ON CONFLICT DO NOTHING", [nombre, match.nombre]); } catch {}
          puntosResueltos++;
        }
      }
      if ((!v.destino_nombre || v.destino_nombre === "Punto desconocido") && v.dlat) {
        const match = this.buscarCiudadCercana(v.dlat, v.dlng);
        if (match) {
          const nombre = `Local Cencosud ${match.nombre} (${Math.round(match.dist)}km)`;
          await pool.query("UPDATE viajes_aprendizaje SET destino_nombre = $1 WHERE id = $2", [nombre, v.id]);
          try { await pool.query("INSERT INTO geocerca_alias_contrato (geocerca_nombre, nombre_contrato, contrato, confirmado, creado_por) VALUES ($1,$2,'CENCOSUD',true,'ADMIN_CONTRATO') ON CONFLICT DO NOTHING", [nombre, match.nombre]); } catch {}
          puntosResueltos++;
        }
      }
    }

    if (nuevos > 0 || puntosResueltos > 0) {
      console.log(`[ADMIN-CONTRATO] Geo: ${nuevos} alias nuevos, ${puntosResueltos} puntos desconocidos resueltos`);
    }

    return { nuevos, puntos_resueltos: puntosResueltos, pendientes: sinAlias.rows.length - nuevos };
  },

  // ═══════════════════════════════════════════════════
  // FASE 2: VALIDAR alias existentes
  // ═══════════════════════════════════════════════════
  async validarAliasExistentes() {
    // Buscar alias donde la geocerca tiene coordenadas y verificar que el alias sea correcto
    const aliasConCoord = await pool.query(`
      SELECT gac.id, gac.geocerca_nombre, gac.nombre_contrato, gac.confirmado,
        va.origen_lat::float as lat, va.origen_lng::float as lng
      FROM geocerca_alias_contrato gac
      JOIN viajes_aprendizaje va ON va.origen_nombre = gac.geocerca_nombre
      WHERE gac.contrato = 'CENCOSUD' AND gac.confirmado = false
        AND va.origen_lat IS NOT NULL AND va.fecha_inicio >= NOW() - INTERVAL '14 days'
      LIMIT 50
    `);

    let corregidos = 0, confirmados = 0;
    for (const a of aliasConCoord.rows) {
      if (!a.lat || !a.lng) continue;
      const match = this.buscarCiudadCercana(a.lat, a.lng);
      if (match) {
        if (match.nombre !== a.nombre_contrato) {
          // El alias actual es incorrecto, corregir
          await pool.query("UPDATE geocerca_alias_contrato SET nombre_contrato = $1, confirmado = true, creado_por = 'ADMIN_CORREGIDO' WHERE id = $2", [match.nombre, a.id]);
          corregidos++;
        } else {
          // Confirmar el alias
          await pool.query("UPDATE geocerca_alias_contrato SET confirmado = true WHERE id = $1", [a.id]);
          confirmados++;
        }
      }
    }

    return { corregidos, confirmados };
  },

  // ═══════════════════════════════════════════════════
  // FASE 3: Cruzar viajes con tarifas
  // ═══════════════════════════════════════════════════
  async cruzarRutasTarifas(fecha: string) {
    const viajes = await pool.query(`
      SELECT va.id, va.origen_nombre, va.destino_nombre, va.km_ecu,
        ao.nombre_contrato as origen_contrato, ad.nombre_contrato as destino_contrato,
        crt.tarifa, crt.lote, crt.clase
      FROM viajes_aprendizaje va
      LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = 'CENCOSUD'
      LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = 'CENCOSUD'
      LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = 'CENCOSUD' AND crt.activo = true
      WHERE va.contrato = 'CENCOSUD' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
    `, [fecha]);

    let matcheados = 0, ingreso = 0;
    let conAmbosAlias = 0, sinOrigen = 0, sinDestino = 0;
    for (const v of viajes.rows) {
      if (v.tarifa) { matcheados++; ingreso += v.tarifa; }
      if (v.origen_contrato && v.destino_contrato) conAmbosAlias++;
      if (!v.origen_contrato) sinOrigen++;
      if (!v.destino_contrato) sinDestino++;
    }

    return {
      total: viajes.rows.length, matcheados, ingreso,
      pct: viajes.rows.length > 0 ? Math.round(matcheados / viajes.rows.length * 100) : 0,
      con_ambos_alias: conAmbosAlias, sin_origen: sinOrigen, sin_destino: sinDestino,
    };
  },

  // ═══════════════════════════════════════════════════
  // FASE 4: Detectar rutas del contrato sin uso
  // ═══════════════════════════════════════════════════
  async detectarRutasSinUso() {
    const r = await pool.query(`
      SELECT crt.origen, crt.destino, crt.lote, crt.tarifa
      FROM contrato_rutas_tarifas crt
      WHERE crt.contrato = 'CENCOSUD' AND crt.activo = true
        AND NOT EXISTS (
          SELECT 1 FROM viajes_aprendizaje va
          JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = 'CENCOSUD' AND ao.nombre_contrato = crt.origen
          JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = 'CENCOSUD' AND ad.nombre_contrato = crt.destino
          WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= NOW() - INTERVAL '30 days' AND va.km_ecu > 0
        )
      ORDER BY crt.tarifa DESC LIMIT 20
    `);
    return r.rows;
  },

  // ═══════════════════════════════════════════════════
  // FASE 5: Productividad
  // ═══════════════════════════════════════════════════
  async calcularProductividad() {
    const r = await pool.query(`
      SELECT c.patente, COUNT(*)::int as viajes,
        ROUND(SUM(va.km_ecu)::numeric) as km_mes,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= DATE_TRUNC('month', CURRENT_DATE) AND va.km_ecu > 0
      GROUP BY c.patente
    `);

    const dia = new Date().getDate();
    const diasMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

    let sobreMeta = 0, bajoMeta = 0, critico = 0;
    for (const c of r.rows) {
      const proy = dia > 0 ? parseFloat(c.km_mes) / dia * diasMes : 0;
      const pct = proy / 11000 * 100;
      if (pct >= 100) sobreMeta++; else if (pct >= 60) bajoMeta++; else critico++;
    }

    return { camiones: r.rows.length, sobre_meta: sobreMeta, bajo_meta: bajoMeta, critico, km_promedio: r.rows.length > 0 ? Math.round(r.rows.reduce((s: number, c: any) => s + parseFloat(c.km_mes), 0) / r.rows.length) : 0 };
  },

  // ═══════════════════════════════════════════════════
  // FASE 6: Guardar ficha
  // ═══════════════════════════════════════════════════
  async guardarFicha(fecha: string, cruce: any, prod: any, geo: any) {
    await pool.query(`
      INSERT INTO contrato_inteligencia (contrato, fecha, camiones_activos, viajes_dia, km_dia, rend_dia, anomalias, resumen, salud, updated_at)
      SELECT 'CENCOSUD', $1::date,
        COUNT(DISTINCT c.patente)::int, COUNT(*)::int, ROUND(SUM(va.km_ecu)::numeric),
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2),
        $2::jsonb, $3, $4, NOW()
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.contrato = 'CENCOSUD' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
      ON CONFLICT (contrato, fecha) DO UPDATE SET
        camiones_activos = EXCLUDED.camiones_activos, viajes_dia = EXCLUDED.viajes_dia, km_dia = EXCLUDED.km_dia,
        rend_dia = EXCLUDED.rend_dia, anomalias = EXCLUDED.anomalias, resumen = EXCLUDED.resumen, salud = EXCLUDED.salud, updated_at = NOW()
    `, [fecha, JSON.stringify({ cruce, productividad: prod, geo }),
      `CENCOSUD: ${cruce.matcheados}/${cruce.total} (${cruce.pct}%) $${Math.round(cruce.ingreso).toLocaleString()} | ${prod.camiones}cam | geo:+${geo.nuevos}`,
      Math.min(100, cruce.pct + (prod.camiones >= 58 ? 20 : 0))]);
  },

  // ═══════════════════════════════════════════════════
  // FASE 7: REPORTAR a estructura de bots
  // ═══════════════════════════════════════════════════
  async reportar(fecha: string, cruce: any, prod: any, geo: any, validacion: any, rutasSinUso: any[]) {
    // Al Gerente de Operaciones: reporte operativo
    await enviarMensaje({
      de: this.id, para: "agente-gerente-ops", tipo: "REPORTE_CONTRATO",
      prioridad: cruce.pct < 30 ? "ALTA" : "NORMAL",
      titulo: `Cencosud ${fecha}: ${cruce.pct}% cruzado · $${Math.round(cruce.ingreso).toLocaleString()} · ${prod.camiones}/83 cam`,
      contenido: [
        `Georef: +${geo.nuevos} alias, ${geo.puntos_resueltos} desconocidos resueltos, ${geo.pendientes} pendientes`,
        `Validación: ${validacion.corregidos} corregidos, ${validacion.confirmados} confirmados`,
        `Cruce: ${cruce.matcheados}/${cruce.total} viajes (${cruce.pct}%). Sin origen: ${cruce.sin_origen}, sin destino: ${cruce.sin_destino}`,
        `Productividad: ${prod.km_promedio}km/cam. Sobre meta: ${prod.sobre_meta}, bajo: ${prod.bajo_meta}, crítico: ${prod.critico}`,
        rutasSinUso.length > 0 ? `Rutas sin uso (30d): ${rutasSinUso.slice(0, 3).map(r => `${r.origen}→${r.destino}`).join(", ")}` : "Todas las rutas con actividad",
      ].join("\n"),
      datos: { cruce, prod, geo, validacion, rutas_sin_uso: rutasSinUso.length }
    });

    // Al CEO: solo si hay algo relevante
    if (prod.camiones < 58 && new Date().getDate() > 5) {
      await enviarMensaje({
        de: this.id, para: "agente-gerente-general", tipo: "CENCOSUD_FLOTA_BAJA",
        prioridad: "ALTA",
        titulo: `Cencosud: ${prod.camiones}/83 camiones — riesgo incumplimiento`,
        contenido: `Solo ${prod.camiones} de 83 camiones contratados operaron este mes. Meta productividad comprometida.`,
        datos: { activos: prod.camiones, contratados: 83 }
      });
    }

    if (cruce.pct >= 50 && cruce.ingreso > 0) {
      await enviarMensaje({
        de: this.id, para: "agente-gerente-general", tipo: "CENCOSUD_INGRESO",
        prioridad: "NORMAL",
        titulo: `Cencosud ${fecha}: ingreso estimado $${Math.round(cruce.ingreso).toLocaleString()}`,
        contenido: `${cruce.matcheados} viajes cruzados con tarifa. ${prod.camiones} camiones activos.`,
        datos: { ingreso: cruce.ingreso, viajes: cruce.matcheados }
      });
    }

    // Al Analista: si hay anomalías de rendimiento
    if (prod.critico > 5) {
      await enviarMensaje({
        de: this.id, para: "agente-analista", tipo: "CENCOSUD_RENDIMIENTO",
        prioridad: "ALTA",
        titulo: `Cencosud: ${prod.critico} camiones en estado crítico de productividad`,
        contenido: `${prod.critico} camiones proyectan menos del 60% de la meta (11,000 km/mes). Investigar causas.`,
        datos: { critico: prod.critico }
      });
    }
  },

  // ═══════════════════════════════════════════════════
  // UTILIDADES
  // ═══════════════════════════════════════════════════
  ciudadesContrato: [
    { nombre: "CD Lo Aguirre", lat: -33.475, lng: -70.790, radio: 10 },
    { nombre: "CD Noviciado", lat: -33.420, lng: -70.730, radio: 10 },
    { nombre: "CD Vespucio", lat: -33.500, lng: -70.650, radio: 12 },
    { nombre: "CD Chillán", lat: -36.620, lng: -72.100, radio: 8 },
    { nombre: "CD Puerto Madero", lat: -33.510, lng: -70.700, radio: 8 },
    { nombre: "CD Boxmart", lat: -33.460, lng: -70.680, radio: 8 },
    { nombre: "CT Coquimbo", lat: -29.953, lng: -71.343, radio: 10 },
    { nombre: "CT Concepción", lat: -36.827, lng: -73.050, radio: 12 },
    { nombre: "Chillán", lat: -36.620, lng: -72.100, radio: 15 },
    { nombre: "Copiapó", lat: -27.366, lng: -70.332, radio: 15 },
    { nombre: "Coquimbo", lat: -29.953, lng: -71.343, radio: 12 },
    { nombre: "La Serena", lat: -29.907, lng: -71.254, radio: 12 },
    { nombre: "Ovalle", lat: -30.601, lng: -71.199, radio: 12 },
    { nombre: "Vallenar", lat: -28.576, lng: -70.758, radio: 12 },
    { nombre: "Huasco", lat: -28.468, lng: -71.219, radio: 12 },
    { nombre: "Curicó", lat: -34.983, lng: -71.237, radio: 15 },
    { nombre: "Molina", lat: -35.117, lng: -71.283, radio: 12 },
    { nombre: "Talca", lat: -35.426, lng: -71.655, radio: 12 },
    { nombre: "Linares", lat: -35.847, lng: -71.593, radio: 15 },
    { nombre: "Concepción", lat: -36.827, lng: -73.050, radio: 15 },
    { nombre: "Los Ángeles", lat: -37.469, lng: -72.354, radio: 20 },
    { nombre: "Mulchén", lat: -37.718, lng: -72.242, radio: 15 },
    { nombre: "Victoria", lat: -38.233, lng: -72.333, radio: 15 },
    { nombre: "Temuco", lat: -38.735, lng: -72.590, radio: 15 },
    { nombre: "Valdivia", lat: -39.814, lng: -73.246, radio: 15 },
    { nombre: "La Unión", lat: -40.295, lng: -73.083, radio: 12 },
    { nombre: "Osorno", lat: -40.573, lng: -73.136, radio: 12 },
    { nombre: "Puerto Montt", lat: -41.471, lng: -72.937, radio: 12 },
    { nombre: "Puerto Varas", lat: -41.316, lng: -72.986, radio: 12 },
  ] as { nombre: string; lat: number; lng: number; radio: number }[],

  buscarCiudadCercana(lat: number, lng: number): { nombre: string; dist: number } | null {
    let mejor: { nombre: string; dist: number } | null = null;
    for (const c of this.ciudadesContrato) {
      const dist = this.distanciaKm(lat, lng, c.lat, c.lng);
      if (dist < c.radio && (!mejor || dist < mejor.dist)) {
        mejor = { nombre: c.nombre, dist };
      }
    }
    return mejor;
  },

  distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  },
};

import { Router } from "express";
import { pool } from "./db";
import { calcularPLViajes, calcularPLResumenDiario, calcularPLResumenMes } from "./pl-engine";

const router = Router();

// ═══ DASHBOARD: viajes cruzados con tarifas via alias ═══
router.get("/dashboard", async (req, res) => {
  try {
    const fecha = (req.query.fecha as string) || new Date().toISOString().slice(0, 10);

    const [resumen, porRuta, camiones, sinCruce] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int as viajes, COUNT(DISTINCT c.patente)::int as camiones,
          ROUND(SUM(va.km_ecu)::numeric) as km_total,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
          ROUND(SUM(va.duracion_minutos)::numeric / 60, 1) as horas_total,
          COUNT(*) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 2.0)::int as criticos,
          COUNT(*) FILTER (WHERE va.velocidad_maxima > 100)::int as excesos_vel
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.contrato = 'CENCOSUD' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
      `, [fecha]),
      // Rutas con cruce via alias
      pool.query(`
        SELECT va.origen_nombre, va.destino_nombre,
          ao.nombre_contrato as origen_contrato, ad.nombre_contrato as destino_contrato,
          crt.tarifa, crt.lote, crt.clase,
          COUNT(*)::int as viajes, COUNT(DISTINCT c.patente)::int as camiones,
          ROUND(SUM(va.km_ecu)::numeric) as km,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = 'CENCOSUD'
        LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = 'CENCOSUD'
        LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = 'CENCOSUD' AND crt.activo = true
        WHERE va.contrato = 'CENCOSUD' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
          AND va.origen_nombre IS NOT NULL AND va.destino_nombre IS NOT NULL
          AND va.origen_nombre != 'Punto desconocido' AND va.destino_nombre != 'Punto desconocido'
        GROUP BY va.origen_nombre, va.destino_nombre, ao.nombre_contrato, ad.nombre_contrato, crt.tarifa, crt.lote, crt.clase
        ORDER BY viajes DESC
      `, [fecha]),
      pool.query(`
        SELECT c.patente, COUNT(*)::int as viajes, ROUND(SUM(va.km_ecu)::numeric) as km,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
          va.conductor
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.contrato = 'CENCOSUD' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
        GROUP BY c.patente, va.conductor ORDER BY km DESC
      `, [fecha]),
      pool.query(`
        SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE va.origen_nombre = 'Punto desconocido' OR va.origen_nombre IS NULL)::int as origen_desc,
          COUNT(*) FILTER (WHERE va.destino_nombre = 'Punto desconocido' OR va.destino_nombre IS NULL)::int as destino_desc
        FROM viajes_aprendizaje va
        WHERE va.contrato = 'CENCOSUD' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
      `, [fecha]),
    ]);

    const rutasCruzadas = (porRuta.rows || []).map((r: any) => ({
      ...r,
      ingreso_estimado: r.tarifa ? r.tarifa * r.viajes : null,
      estado_match: r.tarifa ? "CRUZADO" : r.origen_contrato || r.destino_contrato ? "PARCIAL" : "SIN_ALIAS",
    }));

    const ingresoEstimado = rutasCruzadas.reduce((s: number, r: any) => s + (r.ingreso_estimado || 0), 0);
    const totalCruzados = rutasCruzadas.filter((r: any) => r.tarifa).reduce((s: number, r: any) => s + r.viajes, 0);

    res.json({
      fecha,
      resumen: resumen.rows[0],
      rutas: rutasCruzadas,
      camiones: camiones.rows,
      cobertura: sinCruce.rows[0],
      ingreso_estimado: ingresoEstimado,
      viajes_cruzados: totalCruzados,
      pct_cruzados: resumen.rows[0].viajes > 0 ? Math.round(totalCruzados / resumen.rows[0].viajes * 100) : 0,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══ RESUMEN MENSUAL con financiero ═══
router.get("/resumen-mes", async (_req, res) => {
  try {
    const [flota, diario, cruce] = await Promise.all([
      pool.query(`
        SELECT COUNT(DISTINCT c.patente)::int as camiones, COUNT(*)::int as viajes,
          ROUND(SUM(va.km_ecu)::numeric) as km, ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= DATE_TRUNC('month', CURRENT_DATE) AND va.km_ecu > 0
      `),
      pool.query(`
        SELECT DATE(va.fecha_inicio)::text as dia, COUNT(*)::int as viajes, COUNT(DISTINCT c.patente)::int as camiones,
          ROUND(SUM(va.km_ecu)::numeric) as km,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= DATE_TRUNC('month', CURRENT_DATE) AND va.km_ecu > 0
        GROUP BY DATE(va.fecha_inicio) ORDER BY dia
      `),
      // Cruce financiero mes completo
      pool.query(`
        SELECT COUNT(*)::int as total_viajes,
          COUNT(*) FILTER (WHERE crt.tarifa IS NOT NULL)::int as cruzados,
          COALESCE(SUM(crt.tarifa) FILTER (WHERE crt.tarifa IS NOT NULL), 0)::bigint as ingreso_cruzado
        FROM viajes_aprendizaje va
        LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = 'CENCOSUD'
        LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = 'CENCOSUD'
        LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = 'CENCOSUD' AND crt.activo = true
        WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= DATE_TRUNC('month', CURRENT_DATE) AND va.km_ecu > 0
      `),
    ]);

    const dia_actual = new Date().getDate();
    const dias_mes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const f = flota.rows[0];
    const c = cruce.rows[0];
    const ingreso_proyectado = dia_actual > 0 ? Math.round(parseInt(c.ingreso_cruzado) / dia_actual * dias_mes) : 0;

    res.json({
      flota: f,
      financiero: {
        ingreso_acumulado: parseInt(c.ingreso_cruzado),
        ingreso_proyectado,
        viajes_cruzados: c.cruzados,
        pct_cruzados: c.total_viajes > 0 ? Math.round(c.cruzados / c.total_viajes * 100) : 0,
      },
      productividad: {
        km_promedio_camion: f.camiones > 0 ? Math.round(parseFloat(f.km) / f.camiones) : 0,
        km_proyectado_camion: f.camiones > 0 && dia_actual > 0 ? Math.round(parseFloat(f.km) / f.camiones / dia_actual * dias_mes) : 0,
        meta_km_camion: 11000,
        camiones_contrato: 83,
      },
      tendencia: diario.rows,
      dia_actual, dias_mes,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══ SEMANAL ═══
router.get("/semanal", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT DATE(va.fecha_inicio)::text as dia, COUNT(*)::int as viajes, COUNT(DISTINCT c.patente)::int as camiones,
        ROUND(SUM(va.km_ecu)::numeric) as km,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= CURRENT_DATE - 7 AND va.km_ecu > 0
      GROUP BY DATE(va.fecha_inicio) ORDER BY dia
    `);
    res.json({ dias: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══ FLOTA: detalle por camión ═══
router.get("/flota", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT c.patente, va.conductor, COUNT(*)::int as viajes,
        ROUND(SUM(va.km_ecu)::numeric) as km_mes,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
        COUNT(DISTINCT DATE(va.fecha_inicio))::int as dias_activo,
        MAX(va.fecha_inicio)::text as ultimo_viaje
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= DATE_TRUNC('month', CURRENT_DATE) AND va.km_ecu > 0
      GROUP BY c.patente, va.conductor ORDER BY km_mes DESC
    `);
    const dia = new Date().getDate();
    const diasMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const camiones = r.rows.map((c: any) => {
      const proy = dia > 0 ? Math.round(parseFloat(c.km_mes) / dia * diasMes) : 0;
      return { ...c, km_proyectado: proy, pct_meta: Math.round(proy / 11000 * 100), estado: proy >= 11000 ? "OK" : proy >= 6600 ? "BAJO" : "CRITICO" };
    });
    res.json({ camiones, total: camiones.length, contratados: 83 });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══ TARIFAS del contrato ═══
router.get("/tarifas", async (_req, res) => {
  try {
    const r = await pool.query("SELECT lote, clase, origen, destino, tarifa FROM contrato_rutas_tarifas WHERE contrato = 'CENCOSUD' AND activo = true ORDER BY lote::int, tarifa DESC");
    res.json({ tarifas: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══ ALIAS: ver y gestionar ═══
router.get("/alias", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM geocerca_alias_contrato WHERE contrato = 'CENCOSUD' ORDER BY confirmado DESC, geocerca_nombre");
    res.json({ alias: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/alias", async (req, res) => {
  const { geocerca_nombre, nombre_contrato } = req.body;
  if (!geocerca_nombre || !nombre_contrato) return res.status(400).json({ error: "geocerca_nombre y nombre_contrato requeridos" });
  try {
    await pool.query("INSERT INTO geocerca_alias_contrato (geocerca_nombre, nombre_contrato, contrato, confirmado, creado_por) VALUES ($1,$2,'CENCOSUD',true,'MANUAL') ON CONFLICT (geocerca_nombre, nombre_contrato, contrato) DO UPDATE SET confirmado = true", [geocerca_nombre, nombre_contrato]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/alias/:id/confirmar", async (req, res) => {
  await pool.query("UPDATE geocerca_alias_contrato SET confirmado = true WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

// ═══ SIN MAPEAR: viajes sin alias ═══
router.get("/sin-mapear", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT nombre, tipo, SUM(viajes)::int as viajes FROM (
        SELECT va.origen_nombre as nombre, 'ORIGEN' as tipo, COUNT(*)::int as viajes
        FROM viajes_aprendizaje va
        LEFT JOIN geocerca_alias_contrato gac ON gac.geocerca_nombre = va.origen_nombre AND gac.contrato = 'CENCOSUD'
        WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= NOW() - INTERVAL '30 days'
          AND va.origen_nombre IS NOT NULL AND va.origen_nombre != 'Punto desconocido' AND gac.id IS NULL AND va.km_ecu > 0
        GROUP BY va.origen_nombre
        UNION ALL
        SELECT va.destino_nombre, 'DESTINO', COUNT(*)::int
        FROM viajes_aprendizaje va
        LEFT JOIN geocerca_alias_contrato gac ON gac.geocerca_nombre = va.destino_nombre AND gac.contrato = 'CENCOSUD'
        WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= NOW() - INTERVAL '30 days'
          AND va.destino_nombre IS NOT NULL AND va.destino_nombre != 'Punto desconocido' AND gac.id IS NULL AND va.km_ecu > 0
        GROUP BY va.destino_nombre
      ) sub GROUP BY nombre, tipo ORDER BY viajes DESC
    `);
    res.json({ sin_mapear: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══ VIAJES MES: todos los viajes del mes con cruce tarifa ═══
router.get("/viajes-mes", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT va.id, c.patente, va.conductor, va.contrato,
        DATE(va.fecha_inicio)::text as fecha, va.origen_nombre, va.destino_nombre,
        va.km_ecu::float as km, va.rendimiento_real::float as rend,
        va.duracion_minutos::int as min, va.velocidad_maxima::float as vel_max,
        ao.nombre_contrato as origen_contrato, ad.nombre_contrato as destino_contrato,
        crt.tarifa, crt.lote, crt.clase,
        va.ingreso_tarifa::int as ingreso_tarifa, va.costo_total::int as costo_total,
        va.costo_diesel::int as costo_diesel, va.costo_cvm::int as costo_cvm,
        va.margen_bruto::int as margen_bruto
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = 'CENCOSUD'
      LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = 'CENCOSUD'
      LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = 'CENCOSUD' AND crt.activo = true
      WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= DATE_TRUNC('month', CURRENT_DATE) AND va.km_ecu > 0
      ORDER BY va.fecha_inicio DESC
    `);

    const viajes = r.rows;
    const conTarifa = viajes.filter((v: any) => v.tarifa);
    const sinTarifa = viajes.filter((v: any) => !v.tarifa);
    const ingresoTotal = conTarifa.reduce((s: number, v: any) => s + v.tarifa, 0);

    res.json({
      total: viajes.length,
      con_tarifa: conTarifa.length,
      sin_tarifa: sinTarifa.length,
      pct_cruzados: viajes.length > 0 ? Math.round(conTarifa.length / viajes.length * 100) : 0,
      ingreso_total: ingresoTotal,
      viajes_con_tarifa: conTarifa,
      viajes_sin_tarifa: sinTarifa,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══ ERR: Estado de Resultados por fecha ═══
router.get("/err", async (req, res) => {
  try {
    const fecha = (req.query.fecha as string) || new Date().toISOString().slice(0, 10);

    const [viajes, porRuta, porCamion, circuitos] = await Promise.all([
      // Viajes con cruce tarifa
      pool.query(`
        SELECT va.id, c.patente, va.conductor, va.origen_nombre, va.destino_nombre,
          va.km_ecu::float as km, va.rendimiento_real::float as rend, va.duracion_minutos::int as min,
          va.fecha_inicio::text, va.velocidad_maxima::float as vel_max,
          ao.nombre_contrato as o_c, ad.nombre_contrato as d_c,
          crt.tarifa, crt.lote, crt.clase
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = 'CENCOSUD'
        LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = 'CENCOSUD'
        LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = 'CENCOSUD' AND crt.activo = true
        WHERE va.contrato = 'CENCOSUD' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
        ORDER BY va.fecha_inicio
      `, [fecha]),

      // Resumen por ruta contrato
      pool.query(`
        SELECT ao.nombre_contrato as origen, ad.nombre_contrato as destino,
          crt.tarifa, crt.lote, crt.clase,
          COUNT(*)::int as viajes, ROUND(SUM(va.km_ecu)::numeric) as km,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
        FROM viajes_aprendizaje va
        JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = 'CENCOSUD'
        JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = 'CENCOSUD'
        JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = 'CENCOSUD' AND crt.activo = true
        WHERE va.contrato = 'CENCOSUD' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
        GROUP BY ao.nombre_contrato, ad.nombre_contrato, crt.tarifa, crt.lote, crt.clase
        ORDER BY viajes DESC
      `, [fecha]),

      // Resumen por camión
      pool.query(`
        SELECT c.patente, va.conductor, COUNT(*)::int as viajes,
          ROUND(SUM(va.km_ecu)::numeric) as km,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
          ROUND(SUM(va.duracion_minutos)::numeric / 60, 1) as horas,
          COALESCE(SUM(crt.tarifa), 0)::bigint as ingreso
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = 'CENCOSUD'
        LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = 'CENCOSUD'
        LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = 'CENCOSUD' AND crt.activo = true
        WHERE va.contrato = 'CENCOSUD' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
        GROUP BY c.patente, va.conductor ORDER BY ingreso DESC
      `, [fecha]),

      // Circuitos: camiones con múltiples viajes = ida y vuelta
      pool.query(`
        SELECT c.patente, va.conductor, COUNT(*)::int as viajes,
          ARRAY_AGG(COALESCE(ao.nombre_contrato, va.origen_nombre) || ' → ' || COALESCE(ad.nombre_contrato, va.destino_nombre) ORDER BY va.fecha_inicio) as secuencia,
          ROUND(SUM(va.km_ecu)::numeric) as km_circuito,
          COALESCE(SUM(crt.tarifa), 0)::bigint as ingreso_circuito
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = 'CENCOSUD'
        LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = 'CENCOSUD'
        LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = 'CENCOSUD' AND crt.activo = true
        WHERE va.contrato = 'CENCOSUD' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
        GROUP BY c.patente, va.conductor HAVING COUNT(*) >= 2
        ORDER BY km_circuito DESC
      `, [fecha]),
    ]);

    // Totales ERR
    const totalViajes = viajes.rows.length;
    const totalKm = viajes.rows.reduce((s: number, v: any) => s + (v.km || 0), 0);
    const totalIngreso = viajes.rows.reduce((s: number, v: any) => s + (v.tarifa || 0), 0);
    const viajesCruzados = viajes.rows.filter((v: any) => v.tarifa).length;
    const rendProm = viajes.rows.filter((v: any) => v.rend > 0 && v.rend < 10).reduce((s: number, v: any, _, a) => s + v.rend / a.length, 0);
    const camiones = new Set(viajes.rows.map((v: any) => v.patente)).size;

    res.json({
      fecha,
      err: {
        camiones,
        viajes: totalViajes,
        viajes_cruzados: viajesCruzados,
        pct_cruzados: totalViajes > 0 ? Math.round(viajesCruzados / totalViajes * 100) : 0,
        km_total: Math.round(totalKm),
        rend_promedio: Math.round(rendProm * 100) / 100,
        ingreso_estimado: totalIngreso,
      },
      por_ruta: porRuta.rows,
      por_camion: porCamion.rows,
      circuitos: circuitos.rows,
      viajes_detalle: viajes.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══ GEOCERCAS TMS PROPIAS (auto-aprendidas) ═══
router.get("/geocercas-tms", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM cencosud_geocercas WHERE activa = true ORDER BY tipo, viajes_detectados DESC");
    res.json({ geocercas: r.rows, total: r.rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══ GEOCERCAS KML — REGLA ABSOLUTA ═══
// Devuelve los polígonos exactos importados desde el KML oficial.
// Incluye centroide, radio y coordenadas del polígono para renderizado en mapa.
router.get("/geocercas-mapa", async (_req, res) => {
  try {
    // Verificar que la tabla existe
    const existe = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'cencosud_geocercas_kml'
      ) as ok
    `);
    if (!existe.rows[0].ok) {
      return res.json({ geocercas: [], total: 0, mensaje: "Tabla no creada. Ejecuta el script de importación KML." });
    }

    const r = await pool.query(`
      SELECT id, kml_id, nombre, tipo, lat::float, lng::float, radio_m,
             poligono, nombre_contrato, activa, importado_at
      FROM cencosud_geocercas_kml
      WHERE activa = true
      ORDER BY tipo, nombre
    `);

    // Estadísticas por tipo
    const porTipo: Record<string, number> = {};
    for (const row of r.rows) {
      porTipo[row.tipo] = (porTipo[row.tipo] || 0) + 1;
    }

    res.json({ geocercas: r.rows, total: r.rows.length, por_tipo: porTipo });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══ PARÁMETROS EDITABLES ═══
router.get("/parametros", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM cencosud_parametros ORDER BY categoria, nombre");
    res.json({ parametros: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/parametros/:clave", async (req, res) => {
  const { valor } = req.body;
  if (valor === undefined) return res.status(400).json({ error: "valor requerido" });
  await pool.query("UPDATE cencosud_parametros SET valor = $1, modificado_por = 'USUARIO', updated_at = NOW() WHERE clave = $2", [valor, req.params.clave]);
  res.json({ ok: true });
});

// ═══ SUPER AGENTE ═══
router.get("/agente/estado", async (_req, res) => {
  try {
    const [estado, msgs] = await Promise.all([
      pool.query("SELECT * FROM cencosud_agente_estado WHERE id = 1"),
      pool.query("SELECT tipo, prioridad, COUNT(*)::int as total, COUNT(*) FILTER (WHERE leido = false)::int as no_leidos FROM cencosud_agente_mensajes WHERE created_at >= NOW() - INTERVAL '24 hours' GROUP BY tipo, prioridad ORDER BY total DESC"),
    ]);
    res.json({ estado: estado.rows[0], mensajes_resumen: msgs.rows, total_no_leidos: msgs.rows.reduce((s: number, m: any) => s + parseInt(m.no_leidos), 0) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/agente/mensajes", async (_req, res) => {
  const r = await pool.query("SELECT * FROM cencosud_agente_mensajes WHERE created_at >= NOW() - INTERVAL '48 hours' ORDER BY CASE prioridad WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 ELSE 3 END, created_at DESC LIMIT 30");
  res.json({ mensajes: r.rows });
});

router.post("/agente/mensajes/leer", async (_req, res) => {
  await pool.query("UPDATE cencosud_agente_mensajes SET leido = true WHERE leido = false");
  res.json({ ok: true });
});

router.post("/agente/ejecutar", async (_req, res) => {
  try {
    const { superAgenteCencosud } = await import("./agentes/super-agente-cencosud");
    await superAgenteCencosud.ejecutarCiclo();
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/trayectos", async (req, res) => {
  try {
    const fecha = (req.query.fecha as string) || new Date().toISOString().slice(0, 10);
    const dias = parseInt(req.query.dias as string) || 7;

    const r = await pool.query(`
      SELECT t.id, t.patente, t.origen_nombre, t.destino_nombre,
             t.km_total, t.litros_total, t.rendimiento_real,
             t.fecha_inicio, t.fecha_fin, t.duracion_minutos,
             t.paradas_intermedias, t.segmentos_count,
             t.origen_confianza, t.destino_confianza,
             t.tarifa_aplicada, t.facturado,
             ao.nombre_contrato as origen_contrato,
             ad.nombre_contrato as destino_contrato,
             crt.tarifa, crt.lote
      FROM cencosud_trayectos t
      LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = t.origen_nombre AND ao.contrato = 'CENCOSUD'
      LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = t.destino_nombre AND ad.contrato = 'CENCOSUD'
      LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = 'CENCOSUD' AND crt.activo = true
      WHERE t.fecha_inicio >= $1::date - ($2 || ' days')::interval
        AND t.fecha_inicio <= $1::date + INTERVAL '1 day'
      ORDER BY t.fecha_inicio DESC
      LIMIT 500
    `, [fecha, dias]);

    const trayectos = r.rows;
    const conTarifa = trayectos.filter((t: any) => t.tarifa).length;
    const sinTarifa = trayectos.length - conTarifa;
    const ingresoTotal = trayectos.reduce((s: number, t: any) => s + (parseFloat(t.tarifa) || 0), 0);

    res.json({
      total: trayectos.length,
      con_tarifa: conTarifa,
      sin_tarifa: sinTarifa,
      ingreso_total: ingresoTotal,
      trayectos,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/agente/chat", async (req, res) => {
  const { mensaje } = req.body;
  if (!mensaje) return res.status(400).json({ error: "mensaje requerido" });
  try {
    const { superAgenteCencosud } = await import("./agentes/super-agente-cencosud");
    const respuesta = await superAgenteCencosud.chat(mensaje);
    res.json({ respuesta });
  } catch (e: any) { res.json({ respuesta: "Error: " + e.message }); }
});

router.get("/agente/chat-historial", async (_req, res) => {
  const r = await pool.query("SELECT * FROM cencosud_agente_chat ORDER BY created_at DESC LIMIT 20");
  res.json({ historial: r.rows.reverse() });
});

router.get("/agente/inteligencia", async (_req, res) => {
  try {
    const [aliasR, trayR, billR, loteR, sinMapR, recentAliasR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE confirmado)::int as confirmados, COUNT(*) FILTER (WHERE creado_por IN ('SUPER_AGENTE','AGENTE_GEO','GPS_PROXIMITY'))::int as auto_gps, COUNT(*) FILTER (WHERE creado_por = 'MANUAL')::int as manuales FROM geocerca_alias_contrato WHERE contrato = 'CENCOSUD'`),
      pool.query(`SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE trayecto_consolidado = true)::int as consolidados FROM viajes_aprendizaje WHERE contrato = 'CENCOSUD' AND fecha_inicio >= NOW() - INTERVAL '30 days'`),
      pool.query(`
        WITH trip_tarifa AS (
          SELECT DISTINCT ON (v.id) v.id, t.tarifa, t.lote
          FROM viajes_aprendizaje v
          LEFT JOIN geocerca_alias_contrato a1 ON a1.geocerca_nombre = v.origen_nombre AND a1.contrato = 'CENCOSUD'
          LEFT JOIN geocerca_alias_contrato a2 ON a2.geocerca_nombre = v.destino_nombre AND a2.contrato = 'CENCOSUD'
          LEFT JOIN contrato_rutas_tarifas t ON t.contrato = 'CENCOSUD' AND t.activo = true
            AND t.origen = COALESCE(a1.nombre_contrato, v.origen_nombre)
            AND t.destino = COALESCE(a2.nombre_contrato, v.destino_nombre)
          WHERE v.contrato = 'CENCOSUD' AND v.fecha_inicio >= DATE_TRUNC('month', NOW())
          ORDER BY v.id, CASE t.clase WHEN 'FLF' THEN 1 WHEN 'S2P' THEN 2 WHEN 'CON' THEN 3 ELSE 4 END
        )
        SELECT COUNT(*)::int as total, COUNT(CASE WHEN tarifa IS NOT NULL THEN 1 END)::int as con_tarifa, COALESCE(ROUND(SUM(CASE WHEN tarifa IS NOT NULL THEN tarifa ELSE 0 END)::numeric),0)::bigint as revenue, ROUND(COUNT(CASE WHEN tarifa IS NOT NULL THEN 1 END)::numeric / NULLIF(COUNT(*),0) * 100, 1) as pct FROM trip_tarifa
      `),
      pool.query(`
        WITH trip_tarifa AS (
          SELECT DISTINCT ON (v.id) v.id, t.tarifa, t.lote
          FROM viajes_aprendizaje v
          LEFT JOIN geocerca_alias_contrato a1 ON a1.geocerca_nombre = v.origen_nombre AND a1.contrato = 'CENCOSUD'
          LEFT JOIN geocerca_alias_contrato a2 ON a2.geocerca_nombre = v.destino_nombre AND a2.contrato = 'CENCOSUD'
          JOIN contrato_rutas_tarifas t ON t.contrato = 'CENCOSUD' AND t.activo = true
            AND t.origen = COALESCE(a1.nombre_contrato, v.origen_nombre)
            AND t.destino = COALESCE(a2.nombre_contrato, v.destino_nombre)
          WHERE v.contrato = 'CENCOSUD' AND v.fecha_inicio >= DATE_TRUNC('month', NOW())
          ORDER BY v.id, CASE t.clase WHEN 'FLF' THEN 1 WHEN 'S2P' THEN 2 WHEN 'CON' THEN 3 ELSE 4 END
        )
        SELECT lote, COUNT(*)::int as trips, COALESCE(ROUND(SUM(tarifa)::numeric),0)::bigint as rev FROM trip_tarifa GROUP BY lote ORDER BY lote
      `),
      pool.query(`SELECT nombre, tipo, viajes FROM (SELECT origen_nombre as nombre, 'ORIGEN' as tipo, COUNT(*)::int as viajes FROM viajes_aprendizaje WHERE contrato = 'CENCOSUD' AND fecha_inicio >= NOW() - INTERVAL '30 days' AND origen_nombre NOT IN (SELECT geocerca_nombre FROM geocerca_alias_contrato WHERE contrato = 'CENCOSUD') GROUP BY origen_nombre UNION ALL SELECT destino_nombre, 'DESTINO', COUNT(*)::int FROM viajes_aprendizaje WHERE contrato = 'CENCOSUD' AND fecha_inicio >= NOW() - INTERVAL '30 days' AND destino_nombre NOT IN (SELECT geocerca_nombre FROM geocerca_alias_contrato WHERE contrato = 'CENCOSUD') GROUP BY destino_nombre) sub ORDER BY viajes DESC LIMIT 30`),
      pool.query(`SELECT id, geocerca_nombre, nombre_contrato, creado_por, confirmado, created_at FROM geocerca_alias_contrato WHERE contrato = 'CENCOSUD' ORDER BY created_at DESC LIMIT 60`),
    ]);
    const al = aliasR.rows[0];
    const bl = billR.rows[0];
    res.json({
      alias: { total: al.total, confirmados: al.confirmados, auto_gps: al.auto_gps, manuales: al.manuales, recientes: recentAliasR.rows },
      trayectos: { total: trayR.rows[0].total, consolidados: trayR.rows[0].consolidados },
      billing: { total: bl.total, con_tarifa: bl.con_tarifa, revenue: Number(bl.revenue), pct: Number(bl.pct) || 0, por_lote: loteR.rows },
      sin_mapear: sinMapR.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══ VIAJES SIN TARIFA — INTERACTIVO CON MAPA ═══
router.get("/viajes-sin-tarifa-mapa", async (req, res) => {
  try {
    const dias = Math.min(parseInt(req.query.dias as string) || 30, 90);
    const [viajesR, rutasR, nombresR] = await Promise.all([
      pool.query(`
        SELECT va.id, c.patente, va.conductor, va.origen_nombre, va.destino_nombre,
          va.km_ecu::float as km, va.rendimiento_real::float as rend,
          va.duracion_minutos::int as min, va.velocidad_maxima::float as vel_max,
          va.origen_lat::float, va.origen_lng::float, va.destino_lat::float, va.destino_lng::float,
          va.fecha_inicio::text as fecha, DATE(va.fecha_inicio)::text as dia,
          ao.nombre_contrato as origen_contrato, ad.nombre_contrato as destino_contrato
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = 'CENCOSUD'
        LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = 'CENCOSUD'
        LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = COALESCE(ao.nombre_contrato, va.origen_nombre)
          AND crt.destino = COALESCE(ad.nombre_contrato, va.destino_nombre) AND crt.contrato = 'CENCOSUD' AND crt.activo = true
        WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= NOW() - ($1 || ' days')::interval
          AND va.km_ecu > 5 AND crt.id IS NULL
        ORDER BY va.fecha_inicio DESC
        LIMIT 200
      `, [dias]),
      pool.query(`SELECT DISTINCT origen, destino, tarifa, lote, clase FROM contrato_rutas_tarifas WHERE contrato = 'CENCOSUD' AND activo = true ORDER BY origen, destino`),
      pool.query(`
        SELECT DISTINCT nombre FROM (
          SELECT DISTINCT origen as nombre FROM contrato_rutas_tarifas WHERE contrato = 'CENCOSUD' AND activo = true
          UNION SELECT DISTINCT destino FROM contrato_rutas_tarifas WHERE contrato = 'CENCOSUD' AND activo = true
        ) x ORDER BY nombre
      `),
    ]);

    const viajes = viajesR.rows.map((v: any) => {
      const sugerencias: any[] = [];
      const oNom = (v.origen_nombre || "").toLowerCase();
      const dNom = (v.destino_nombre || "").toLowerCase();
      for (const r of rutasR.rows) {
        let score = 0;
        const rO = r.origen.toLowerCase();
        const rD = r.destino.toLowerCase();
        if (oNom.includes(rO.replace("cd ", "").replace("ct ", "")) || rO.includes(oNom.split(" ")[0])) score += 40;
        if (dNom.includes(rD.replace("cd ", "").replace("ct ", "")) || rD.includes(dNom.split(" ")[0])) score += 40;
        if (v.origen_contrato && v.origen_contrato === r.origen) score += 50;
        if (v.destino_contrato && v.destino_contrato === r.destino) score += 50;
        const kmDiff = Math.abs(v.km - (r.tarifa / 150));
        if (kmDiff < 100) score += 10;
        if (score >= 30) sugerencias.push({ origen: r.origen, destino: r.destino, tarifa: r.tarifa, lote: r.lote, clase: r.clase, score });
      }
      sugerencias.sort((a: any, b: any) => b.score - a.score);
      return { ...v, sugerencias: sugerencias.slice(0, 5) };
    });

    res.json({
      total: viajes.length,
      viajes,
      rutas_disponibles: rutasR.rows,
      nombres_contrato: nombresR.rows.map((r: any) => r.nombre),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══ MAPEAR VIAJE: crear alias y aprendizaje ═══
router.post("/mapear-viaje", async (req, res) => {
  try {
    const { viaje_id, origen_nombre, destino_nombre, origen_contrato, destino_contrato } = req.body;
    if (!origen_contrato || !destino_contrato) return res.status(400).json({ error: "origen_contrato y destino_contrato requeridos" });

    const creados: string[] = [];
    if (origen_nombre && origen_contrato) {
      await pool.query(
        `INSERT INTO geocerca_alias_contrato (geocerca_nombre, nombre_contrato, contrato, confirmado, creado_por)
         VALUES ($1, $2, 'CENCOSUD', true, 'MAPEO_INTERACTIVO')
         ON CONFLICT (geocerca_nombre, nombre_contrato, contrato) DO UPDATE SET confirmado = true`,
        [origen_nombre, origen_contrato]
      );
      creados.push(`${origen_nombre} → ${origen_contrato}`);
    }
    if (destino_nombre && destino_contrato) {
      await pool.query(
        `INSERT INTO geocerca_alias_contrato (geocerca_nombre, nombre_contrato, contrato, confirmado, creado_por)
         VALUES ($1, $2, 'CENCOSUD', true, 'MAPEO_INTERACTIVO')
         ON CONFLICT (geocerca_nombre, nombre_contrato, contrato) DO UPDATE SET confirmado = true`,
        [destino_nombre, destino_contrato]
      );
      creados.push(`${destino_nombre} → ${destino_contrato}`);
    }

    const matchR = await pool.query(
      `SELECT tarifa, lote, clase FROM contrato_rutas_tarifas WHERE contrato = 'CENCOSUD' AND activo = true AND origen = $1 AND destino = $2 LIMIT 1`,
      [origen_contrato, destino_contrato]
    );

    const viajesAfectados = await pool.query(
      `SELECT COUNT(*)::int as total FROM viajes_aprendizaje va
       WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= NOW() - INTERVAL '60 days'
         AND (va.origen_nombre = $1 OR va.destino_nombre = $2)`,
      [origen_nombre || '', destino_nombre || '']
    );

    res.json({
      ok: true,
      alias_creados: creados,
      tarifa_match: matchR.rows[0] || null,
      viajes_afectados: viajesAfectados.rows[0].total,
      ruta: `${origen_contrato} → ${destino_contrato}`,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══ DESCARTAR VIAJE: marcar como no-Cencosud ═══
router.post("/descartar-viaje", async (req, res) => {
  try {
    const { viaje_id, motivo } = req.body;
    if (!viaje_id) return res.status(400).json({ error: "viaje_id requerido" });
    await pool.query(`UPDATE viajes_aprendizaje SET contrato = 'DESCARTADO' WHERE id = $1`, [viaje_id]);
    res.json({ ok: true, viaje_id, motivo });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/t1-reconstruir", async (req, res) => {
  try {
    const { fecha, desde, hasta } = req.body;
    if (desde && hasta) {
      const { reconstruirRango } = await import("./t1-reconstructor");
      const resultados = await reconstruirRango(desde, hasta);
      return res.json({ ok: true, resultados });
    }
    const { reconstruirDiaT1 } = await import("./t1-reconstructor");
    const f = fecha || new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
    const result = await reconstruirDiaT1(f);
    res.json({ ok: true, fecha: f, ...result });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/t1-resultado", async (req, res) => {
  try {
    const fecha = (req.query.fecha as string) || new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
    const viajes = await pool.query(`
      SELECT va.id, c.patente, va.origen_nombre, va.destino_nombre,
             va.km_ecu as km, va.duracion_minutos as duracion,
             va.fecha_inicio, va.fecha_fin, va.estado, va.paradas
      FROM viajes_aprendizaje va
      JOIN camiones c ON c.id = va.camion_id
      WHERE va.contrato = 'CENCOSUD' AND va.fuente_viaje = 'T1_RECONSTRUCTOR'
        AND DATE(va.fecha_inicio) = $1
      ORDER BY va.fecha_inicio
    `, [fecha]);
    const total = viajes.rows.length;
    const rt = viajes.rows.filter((v: any) => {
      const p = typeof v.paradas === "object" ? v.paradas : (() => { try { return JSON.parse(v.paradas || "{}"); } catch { return {}; } })();
      return p?.tipo === "ROUND_TRIP";
    }).length;
    const facturados = viajes.rows.filter((v: any) => v.estado === "FACTURADO").length;
    res.json({ fecha, total, round_trip: rt, ida: total - rt, facturados, viajes: viajes.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/parametros", async (_req, res) => {
  try {
    const r = await pool.query(`SELECT clave, valor FROM cencosud_parametros ORDER BY clave`);
    const params: Record<string, string> = {};
    r.rows.forEach((row: any) => { params[row.clave] = row.valor; });
    res.json(params);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/parametros", async (req, res) => {
  try {
    const updates = req.body as Record<string, string>;
    const allowed = ['precio_diesel','cvm_km','tarifa_km_cargado','tarifa_km_vacio','costo_conductor_dia','costo_fijo_dia','meta_km_dia','meta_km_mes','meta_rendimiento','pct_retorno','tiempo_max_cd','capacidad_estanque','alerta_rendimiento_critico','alerta_margen_minimo','alerta_dias_inactivo'];
    let updated = 0;
    for (const [k, v] of Object.entries(updates)) {
      if (allowed.includes(k)) {
        await pool.query(`UPDATE cencosud_parametros SET valor = $1 WHERE clave = $2`, [String(v), k]);
        updated++;
      }
    }
    res.json({ ok: true, updated });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/pl/calcular", async (req, res) => {
  try {
    const fecha = req.body?.fecha as string | undefined;
    const result = await calcularPLViajes(fecha);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/pl/dia", async (req, res) => {
  try {
    const fecha = (req.query.fecha as string) || new Date().toISOString().slice(0, 10);
    const result = await calcularPLResumenDiario(fecha);
    res.json({ fecha, ...result });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/pl/mes", async (req, res) => {
  try {
    const mes = (req.query.mes as string) || new Date().toISOString().slice(0, 7);
    const result = await calcularPLResumenMes(mes);
    res.json({ mes, ...result });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;

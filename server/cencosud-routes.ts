import { Router } from "express";
import { pool } from "./db";
import { calcularPLViajes, calcularPLResumenDiario, calcularPLResumenMes } from "./pl-engine";
import { ejecutarAutoCierre, cruzarSigetra, detectarParadasHuerfanas, nombrarParadasConIA } from "./auto-cierre-brecha";

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
        WHERE va.contrato = 'CENCOSUD' AND va.fuente_viaje = 'T1_RECONSTRUCTOR' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
      `, [fecha]),
      // Rutas con cruce via alias
      pool.query(`
        WITH dedup AS (
          SELECT DISTINCT ON (va.id) va.id, va.origen_nombre, va.destino_nombre, va.km_ecu, va.rendimiento_real, c.patente,
            ao.nombre_contrato as origen_contrato, ad.nombre_contrato as destino_contrato,
            crt.tarifa, crt.lote, crt.clase
          FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
          LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = 'CENCOSUD'
          LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = 'CENCOSUD'
          LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = 'CENCOSUD' AND crt.activo = true
          WHERE va.contrato = 'CENCOSUD' AND va.fuente_viaje = 'T1_RECONSTRUCTOR' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
            AND va.origen_nombre IS NOT NULL AND va.destino_nombre IS NOT NULL
            AND va.origen_nombre != 'Punto desconocido' AND va.destino_nombre != 'Punto desconocido'
          ORDER BY va.id, crt.tarifa DESC NULLS LAST
        )
        SELECT origen_nombre, destino_nombre, origen_contrato, destino_contrato, tarifa, lote, clase,
          COUNT(*)::int as viajes, COUNT(DISTINCT patente)::int as camiones,
          ROUND(SUM(km_ecu)::numeric) as km,
          ROUND(AVG(rendimiento_real) FILTER (WHERE rendimiento_real > 0 AND rendimiento_real < 10)::numeric, 2) as rend
        FROM dedup
        GROUP BY origen_nombre, destino_nombre, origen_contrato, destino_contrato, tarifa, lote, clase
        ORDER BY viajes DESC
      `, [fecha]),
      pool.query(`
        SELECT c.patente, COUNT(*)::int as viajes, ROUND(SUM(va.km_ecu)::numeric) as km,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
          va.conductor
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.contrato = 'CENCOSUD' AND va.fuente_viaje = 'T1_RECONSTRUCTOR' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
        GROUP BY c.patente, va.conductor ORDER BY km DESC
      `, [fecha]),
      pool.query(`
        SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE va.origen_nombre = 'Punto desconocido' OR va.origen_nombre IS NULL)::int as origen_desc,
          COUNT(*) FILTER (WHERE va.destino_nombre = 'Punto desconocido' OR va.destino_nombre IS NULL)::int as destino_desc
        FROM viajes_aprendizaje va
        WHERE va.contrato = 'CENCOSUD' AND va.fuente_viaje = 'T1_RECONSTRUCTOR' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
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
        WHERE va.contrato = 'CENCOSUD' AND va.fuente_viaje = 'T1_RECONSTRUCTOR' AND va.fecha_inicio >= DATE_TRUNC('month', CURRENT_DATE) AND va.km_ecu >= 15
      `),
      pool.query(`
        SELECT DATE(va.fecha_inicio)::text as dia, COUNT(*)::int as viajes, COUNT(DISTINCT c.patente)::int as camiones,
          ROUND(SUM(va.km_ecu)::numeric) as km,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.contrato = 'CENCOSUD' AND va.fuente_viaje = 'T1_RECONSTRUCTOR' AND va.fecha_inicio >= DATE_TRUNC('month', CURRENT_DATE) AND va.km_ecu >= 15
        GROUP BY DATE(va.fecha_inicio) ORDER BY dia
      `),
      pool.query(`
        WITH dedup AS (
          SELECT DISTINCT ON (va.id) va.id, crt.tarifa
          FROM viajes_aprendizaje va
          LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = 'CENCOSUD'
          LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = 'CENCOSUD'
          LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = 'CENCOSUD' AND crt.activo = true
          WHERE va.contrato = 'CENCOSUD' AND va.fuente_viaje = 'T1_RECONSTRUCTOR' AND va.fecha_inicio >= DATE_TRUNC('month', CURRENT_DATE) AND va.km_ecu >= 15
          ORDER BY va.id, crt.tarifa DESC NULLS LAST
        )
        SELECT COUNT(*)::int as total_viajes,
          COUNT(*) FILTER (WHERE tarifa IS NOT NULL)::int as cruzados,
          COALESCE(SUM(tarifa) FILTER (WHERE tarifa IS NOT NULL), 0)::bigint as ingreso_cruzado
        FROM dedup
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
      WHERE va.contrato = 'CENCOSUD' AND va.fuente_viaje = 'T1_RECONSTRUCTOR' AND va.fecha_inicio >= CURRENT_DATE - 7 AND va.km_ecu > 0
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
      WHERE va.contrato = 'CENCOSUD' AND va.fuente_viaje = 'T1_RECONSTRUCTOR' AND va.fecha_inicio >= DATE_TRUNC('month', CURRENT_DATE) AND va.km_ecu >= 15
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
        WHERE va.contrato = 'CENCOSUD' AND va.fuente_viaje = 'T1_RECONSTRUCTOR' AND va.fecha_inicio >= NOW() - INTERVAL '30 days'
          AND va.origen_nombre IS NOT NULL AND va.origen_nombre != 'Punto desconocido' AND gac.id IS NULL AND va.km_ecu > 0
        GROUP BY va.origen_nombre
        UNION ALL
        SELECT va.destino_nombre, 'DESTINO', COUNT(*)::int
        FROM viajes_aprendizaje va
        LEFT JOIN geocerca_alias_contrato gac ON gac.geocerca_nombre = va.destino_nombre AND gac.contrato = 'CENCOSUD'
        WHERE va.contrato = 'CENCOSUD' AND va.fuente_viaje = 'T1_RECONSTRUCTOR' AND va.fecha_inicio >= NOW() - INTERVAL '30 days'
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
      SELECT DISTINCT ON (va.id) va.id, c.patente, va.conductor, va.contrato,
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
      WHERE va.contrato = 'CENCOSUD' AND va.fuente_viaje = 'T1_RECONSTRUCTOR' AND va.fecha_inicio >= DATE_TRUNC('month', CURRENT_DATE) AND va.km_ecu >= 15
      ORDER BY va.id, crt.tarifa DESC NULLS LAST
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
        SELECT DISTINCT ON (va.id) va.id, c.patente, va.conductor, va.origen_nombre, va.destino_nombre,
          va.km_ecu::float as km, va.rendimiento_real::float as rend, va.duracion_minutos::int as min,
          va.fecha_inicio::text, va.velocidad_maxima::float as vel_max,
          ao.nombre_contrato as o_c, ad.nombre_contrato as d_c,
          crt.tarifa, crt.lote, crt.clase
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = 'CENCOSUD'
        LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = 'CENCOSUD'
        LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = 'CENCOSUD' AND crt.activo = true
        WHERE va.contrato = 'CENCOSUD' AND va.fuente_viaje = 'T1_RECONSTRUCTOR' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
        ORDER BY va.id, crt.tarifa DESC NULLS LAST
      `, [fecha]),

      pool.query(`
        WITH dedup AS (
          SELECT DISTINCT ON (va.id) va.id, va.km_ecu, va.rendimiento_real, va.duracion_minutos, va.fecha_inicio, c.patente, va.conductor,
            ao.nombre_contrato as origen_contrato, ad.nombre_contrato as destino_contrato, va.origen_nombre, va.destino_nombre,
            crt.tarifa, crt.lote, crt.clase
          FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
          LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = 'CENCOSUD'
          LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = 'CENCOSUD'
          LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = 'CENCOSUD' AND crt.activo = true
          WHERE va.contrato = 'CENCOSUD' AND va.fuente_viaje = 'T1_RECONSTRUCTOR' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
          ORDER BY va.id, crt.tarifa DESC NULLS LAST
        )
        SELECT origen_contrato as origen, destino_contrato as destino, tarifa, lote, clase,
          COUNT(*)::int as viajes, ROUND(SUM(km_ecu)::numeric) as km,
          ROUND(AVG(rendimiento_real) FILTER (WHERE rendimiento_real > 0 AND rendimiento_real < 10)::numeric, 2) as rend
        FROM dedup WHERE tarifa IS NOT NULL
        GROUP BY origen_contrato, destino_contrato, tarifa, lote, clase
        ORDER BY viajes DESC
      `, [fecha]),

      pool.query(`
        WITH dedup AS (
          SELECT DISTINCT ON (va.id) va.id, va.km_ecu, va.rendimiento_real, va.duracion_minutos, c.patente, va.conductor, crt.tarifa
          FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
          LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = 'CENCOSUD'
          LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = 'CENCOSUD'
          LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = 'CENCOSUD' AND crt.activo = true
          WHERE va.contrato = 'CENCOSUD' AND va.fuente_viaje = 'T1_RECONSTRUCTOR' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
          ORDER BY va.id, crt.tarifa DESC NULLS LAST
        )
        SELECT patente, conductor, COUNT(*)::int as viajes,
          ROUND(SUM(km_ecu)::numeric) as km,
          ROUND(AVG(rendimiento_real) FILTER (WHERE rendimiento_real > 0 AND rendimiento_real < 10)::numeric, 2) as rend,
          ROUND(SUM(duracion_minutos)::numeric / 60, 1) as horas,
          COALESCE(SUM(tarifa), 0)::bigint as ingreso
        FROM dedup GROUP BY patente, conductor ORDER BY ingreso DESC
      `, [fecha]),

      pool.query(`
        WITH dedup AS (
          SELECT DISTINCT ON (va.id) va.id, va.km_ecu, va.fecha_inicio, c.patente, va.conductor,
            COALESCE(ao.nombre_contrato, va.origen_nombre) as o_label,
            COALESCE(ad.nombre_contrato, va.destino_nombre) as d_label,
            crt.tarifa
          FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
          LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = 'CENCOSUD'
          LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = 'CENCOSUD'
          LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = 'CENCOSUD' AND crt.activo = true
          WHERE va.contrato = 'CENCOSUD' AND va.fuente_viaje = 'T1_RECONSTRUCTOR' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
          ORDER BY va.id, crt.tarifa DESC NULLS LAST
        )
        SELECT patente, conductor, COUNT(*)::int as viajes,
          ARRAY_AGG(o_label || ' → ' || d_label ORDER BY fecha_inicio) as secuencia,
          ROUND(SUM(km_ecu)::numeric) as km_circuito,
          COALESCE(SUM(tarifa), 0)::bigint as ingreso_circuito
        FROM dedup GROUP BY patente, conductor HAVING COUNT(*) >= 2
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
      SELECT DISTINCT ON (t.id) t.id, t.patente, t.origen_nombre, t.destino_nombre,
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
      ORDER BY t.id, crt.tarifa DESC NULLS LAST
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

router.get("/viaje-ruta/:id", async (req, res) => {
  try {
    const viajeId = parseInt(req.params.id);
    if (!viajeId) return res.status(400).json({ error: "ID inválido" });

    const vr = await pool.query(`
      SELECT va.id, va.camion_id, c.patente, va.conductor, va.contrato,
        va.fecha_inicio, va.fecha_fin,
        va.origen_nombre, va.destino_nombre,
        va.origen_lat::float, va.origen_lng::float,
        va.destino_lat::float, va.destino_lng::float,
        va.km_ecu::float as km, va.rendimiento_real::float as rend,
        va.duracion_minutos::int as duracion_min,
        va.velocidad_promedio::float as vel_prom,
        va.velocidad_maxima::float as vel_max,
        va.litros_consumidos_ecu::float as litros,
        va.paradas,
        va.origen_contrato, va.destino_contrato,
        va.ingreso_tarifa::float, va.costo_total::float, va.margen_bruto::float,
        va.estado
      FROM viajes_aprendizaje va
      JOIN camiones c ON c.id = va.camion_id
      WHERE va.id = $1
    `, [viajeId]);

    if (vr.rows.length === 0) return res.status(404).json({ error: "Viaje no encontrado" });
    const viaje = vr.rows[0];

    const puntosR = await pool.query(`
      SELECT lat::float, lng::float, fecha, velocidad::float, ignicion,
        kms_total::float, rpm::int, temp_motor::int
      FROM wisetrack_posiciones
      WHERE patente = $1 AND fecha >= $2 AND fecha <= $3
      ORDER BY fecha ASC
    `, [viaje.patente, viaje.fecha_inicio, viaje.fecha_fin]);

    const puntos = puntosR.rows;
    const velMax = puntos.length > 0 ? Math.max(...puntos.map((p: any) => p.velocidad || 0)) : (viaje.vel_max || 0);
    const velProm = puntos.length > 0 ? Math.round(puntos.filter((p: any) => p.velocidad > 0).reduce((s: number, p: any) => s + p.velocidad, 0) / Math.max(1, puntos.filter((p: any) => p.velocidad > 0).length)) : (viaje.vel_prom || 0);
    const tiempoDetenido = puntos.filter((p: any) => p.velocidad === 0 || !p.ignicion).length;
    const tiempoMovimiento = puntos.filter((p: any) => p.velocidad > 0 && p.ignicion).length;

    const paradasNorm = Array.isArray(viaje.paradas) ? viaje.paradas :
      (viaje.paradas?.paradas && Array.isArray(viaje.paradas.paradas)) ? viaje.paradas.paradas : [];

    res.json({
      viaje: {
        ...viaje,
        paradas: paradasNorm,
        vel_max_gps: velMax,
        vel_prom_gps: velProm,
        pct_detenido: puntos.length > 0 ? Math.round(tiempoDetenido / puntos.length * 100) : 0,
        pct_movimiento: puntos.length > 0 ? Math.round(tiempoMovimiento / puntos.length * 100) : 0,
      },
      puntos: puntos.map((p: any) => ({
        lat: p.lat, lng: p.lng,
        fecha: p.fecha,
        vel: p.velocidad || 0,
        ign: p.ignicion,
        km: p.kms_total,
      })),
      total_puntos: puntos.length,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══ VIAJES SIN TARIFA — INTERACTIVO CON MAPA ═══
router.get("/viajes-sin-tarifa-mapa", async (req, res) => {
  try {
    const dias = Math.min(parseInt(req.query.dias as string) || 30, 90);
    const [viajesR, rutasR, nombresR] = await Promise.all([
      pool.query(`
        SELECT DISTINCT ON (va.id) va.id, c.patente, va.conductor, va.origen_nombre, va.destino_nombre,
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
        WHERE va.contrato = 'CENCOSUD' AND va.fuente_viaje = 'T1_RECONSTRUCTOR' AND va.fecha_inicio >= NOW() - ($1 || ' days')::interval
          AND va.km_ecu > 5 AND crt.id IS NULL
        ORDER BY va.id, va.fecha_inicio DESC
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
       WHERE va.contrato = 'CENCOSUD' AND va.fuente_viaje = 'T1_RECONSTRUCTOR' AND va.fecha_inicio >= NOW() - INTERVAL '60 days'
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

    calcularPLViajes().catch(err => console.error("[MAPEO] P&L recalc error:", err.message));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══ VIAJES PARCIALES: tienen un alias pero no cuadran con tarifa ═══
router.get("/viajes-parciales", async (req, res) => {
  try {
    const dias = Math.min(parseInt(req.query.dias as string) || 30, 90);
    const viajesR = await pool.query(`
      SELECT DISTINCT ON (va.id) va.id, c.patente, va.conductor, va.origen_nombre, va.destino_nombre,
        va.km_ecu::float as km, va.duracion_minutos::int as min,
        va.origen_lat::float, va.origen_lng::float, va.destino_lat::float, va.destino_lng::float,
        va.fecha_inicio::text as fecha, DATE(va.fecha_inicio)::text as dia,
        ao.nombre_contrato as origen_contrato, ad.nombre_contrato as destino_contrato,
        CASE
          WHEN ao.nombre_contrato IS NOT NULL AND ad.nombre_contrato IS NULL THEN 'FALTA_DESTINO'
          WHEN ao.nombre_contrato IS NULL AND ad.nombre_contrato IS NOT NULL THEN 'FALTA_ORIGEN'
          ELSE 'AMBOS_SIN_TARIFA'
        END as tipo_parcial
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = 'CENCOSUD'
      LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = 'CENCOSUD'
      LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = COALESCE(ao.nombre_contrato, va.origen_nombre)
        AND crt.destino = COALESCE(ad.nombre_contrato, va.destino_nombre) AND crt.contrato = 'CENCOSUD' AND crt.activo = true
      WHERE va.contrato = 'CENCOSUD' AND va.fuente_viaje = 'T1_RECONSTRUCTOR'
        AND va.fecha_inicio >= NOW() - ($1 || ' days')::interval
        AND va.km_ecu > 5 AND crt.id IS NULL
        AND (ao.nombre_contrato IS NOT NULL OR ad.nombre_contrato IS NOT NULL)
      ORDER BY va.id, va.fecha_inicio DESC
      LIMIT 200
    `, [dias]);

    const rutasR = await pool.query(`SELECT DISTINCT origen, destino, tarifa, lote, clase FROM contrato_rutas_tarifas WHERE contrato = 'CENCOSUD' AND activo = true ORDER BY origen, destino`);
    const nombresR = await pool.query(`
      SELECT DISTINCT nombre FROM (
        SELECT DISTINCT origen as nombre FROM contrato_rutas_tarifas WHERE contrato = 'CENCOSUD' AND activo = true
        UNION SELECT DISTINCT destino FROM contrato_rutas_tarifas WHERE contrato = 'CENCOSUD' AND activo = true
      ) x ORDER BY nombre
    `);

    const viajes = viajesR.rows.map((v: any) => {
      const sugerencias: any[] = [];
      const conocido = v.tipo_parcial === 'FALTA_DESTINO' ? v.origen_contrato : v.destino_contrato;
      for (const r of rutasR.rows) {
        let score = 0;
        if (v.tipo_parcial === 'FALTA_DESTINO') {
          if (r.origen === conocido) score += 60;
          const dNom = (v.destino_nombre || "").toLowerCase();
          if (dNom.includes(r.destino.toLowerCase().replace("cd ", "").replace("ct ", "")) || r.destino.toLowerCase().includes(dNom.split(" ")[0])) score += 40;
        } else if (v.tipo_parcial === 'FALTA_ORIGEN') {
          if (r.destino === conocido) score += 60;
          const oNom = (v.origen_nombre || "").toLowerCase();
          if (oNom.includes(r.origen.toLowerCase().replace("cd ", "").replace("ct ", "")) || r.origen.toLowerCase().includes(oNom.split(" ")[0])) score += 40;
        } else {
          if (v.origen_contrato && r.origen === v.origen_contrato) score += 50;
          if (v.destino_contrato && r.destino === v.destino_contrato) score += 50;
        }
        const kmDiff = Math.abs(v.km - (r.tarifa / 150));
        if (kmDiff < 100) score += 10;
        if (score >= 30) sugerencias.push({ origen: r.origen, destino: r.destino, tarifa: r.tarifa, lote: r.lote, clase: r.clase, score });
      }
      sugerencias.sort((a: any, b: any) => b.score - a.score);
      return { ...v, sugerencias: sugerencias.slice(0, 5) };
    });

    const resumen = {
      total: viajes.length,
      falta_destino: viajes.filter((v: any) => v.tipo_parcial === 'FALTA_DESTINO').length,
      falta_origen: viajes.filter((v: any) => v.tipo_parcial === 'FALTA_ORIGEN').length,
      ambos_sin_tarifa: viajes.filter((v: any) => v.tipo_parcial === 'AMBOS_SIN_TARIFA').length,
    };

    res.json({
      resumen,
      viajes,
      nombres_contrato: nombresR.rows.map((r: any) => r.nombre),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/resolver-parcial", async (req, res) => {
  try {
    const { viaje_id, geocerca_nombre, nombre_contrato } = req.body;
    if (!geocerca_nombre || !nombre_contrato) return res.status(400).json({ error: "geocerca_nombre y nombre_contrato requeridos" });

    await pool.query(
      `INSERT INTO geocerca_alias_contrato (geocerca_nombre, nombre_contrato, contrato, confirmado, creado_por)
       VALUES ($1, $2, 'CENCOSUD', true, 'RESOLVER_PARCIAL')
       ON CONFLICT (geocerca_nombre, nombre_contrato, contrato) DO UPDATE SET confirmado = true`,
      [geocerca_nombre, nombre_contrato]
    );

    const afectados = await pool.query(
      `SELECT COUNT(*)::int as total FROM viajes_aprendizaje
       WHERE contrato = 'CENCOSUD' AND fuente_viaje = 'T1_RECONSTRUCTOR'
         AND fecha_inicio >= NOW() - INTERVAL '60 days'
         AND (origen_nombre = $1 OR destino_nombre = $1)`,
      [geocerca_nombre]
    );

    res.json({
      ok: true,
      alias: `${geocerca_nombre} → ${nombre_contrato}`,
      viajes_afectados: afectados.rows[0].total,
    });

    calcularPLViajes().catch(err => console.error("[RESOLVER-PARCIAL] P&L recalc error:", err.message));
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


router.get("/brecha", async (req, res) => {
  try {
    const dias = parseInt((req.query.dias as string) || "30");
    const esperadoMes = parseInt((req.query.esperado_mes as string) || "800000000");

    const facturado = await pool.query(`
      SELECT
        COUNT(*) as total_viajes,
        COUNT(*) FILTER (WHERE estado = 'FACTURADO') as facturados,
        COUNT(*) FILTER (WHERE estado != 'FACTURADO') as sin_tarifa,
        COALESCE(SUM(ingreso_tarifa), 0)::bigint as monto_detectado
      FROM viajes_aprendizaje
      WHERE contrato = 'CENCOSUD'
        AND fecha_inicio >= CURRENT_DATE - ($1::int || ' days')::interval
    `, [dias]);

    const stats = facturado.rows[0] as any;
    const montoDetectado = Number(stats.monto_detectado || 0);
    const factorMes = 30 / dias;
    const detectadoMensualizado = Math.round(montoDetectado * factorMes);
    const brecha = Math.max(0, esperadoMes - detectadoMensualizado);
    const pctCaptura = esperadoMes > 0 ? Math.round((detectadoMensualizado / esperadoMes) * 100) : 0;

    const topSinTarifa = await pool.query(`
      SELECT origen_nombre, destino_nombre, COUNT(*) as veces,
             ROUND(AVG(km_ecu)) as km_promedio
      FROM viajes_aprendizaje
      WHERE contrato = 'CENCOSUD'
        AND fecha_inicio >= CURRENT_DATE - ($1::int || ' days')::interval
        AND (estado IS NULL OR estado != 'FACTURADO')
        AND ingreso_tarifa IS NULL OR ingreso_tarifa = 0
      GROUP BY origen_nombre, destino_nombre
      ORDER BY veces DESC
      LIMIT 15
    `, [dias]);

    const camionesSinViaje = await pool.query(`
      SELECT wp.patente,
             ROUND(SUM(haversine_dist)::numeric, 0) as km_aprox,
             COUNT(*) as puntos
      FROM (
        SELECT patente,
               LAG(lat) OVER (PARTITION BY patente ORDER BY fecha) as plat,
               LAG(lng) OVER (PARTITION BY patente ORDER BY fecha) as plng,
               lat, lng,
               CASE WHEN LAG(lat) OVER (PARTITION BY patente ORDER BY fecha) IS NOT NULL
                    THEN 6371 * 2 * asin(sqrt(
                      power(sin(radians((lat - LAG(lat) OVER (PARTITION BY patente ORDER BY fecha))/2)), 2) +
                      cos(radians(LAG(lat) OVER (PARTITION BY patente ORDER BY fecha))) * cos(radians(lat)) *
                      power(sin(radians((lng - LAG(lng) OVER (PARTITION BY patente ORDER BY fecha))/2)), 2)
                    ))
                    ELSE 0 END as haversine_dist
        FROM wisetrack_posiciones
        WHERE grupo1 = 'CENCOSUD'
          AND fecha >= CURRENT_DATE - ($1::int || ' days')::interval
      ) wp
      WHERE wp.haversine_dist < 5
      GROUP BY wp.patente
      HAVING SUM(haversine_dist) > 100
        AND wp.patente NOT IN (
          SELECT DISTINCT c.patente FROM viajes_aprendizaje va
          JOIN camiones c ON c.id = va.camion_id
          WHERE va.contrato = 'CENCOSUD'
            AND va.fecha_inicio >= CURRENT_DATE - ($1::int || ' days')::interval
        )
      ORDER BY km_aprox DESC
      LIMIT 20
    `, [dias]).catch(() => ({ rows: [] }));

    const origenNoCD = await pool.query(`
      SELECT origen_nombre, COUNT(*) as veces
      FROM viajes_aprendizaje
      WHERE contrato = 'CENCOSUD'
        AND fecha_inicio >= CURRENT_DATE - ($1::int || ' days')::interval
        AND origen_nombre NOT ILIKE 'CD %'
        AND origen_nombre NOT ILIKE 'CT %'
        AND origen_nombre NOT ILIKE '%base sotraser%'
      GROUP BY origen_nombre
      ORDER BY veces DESC
      LIMIT 10
    `, [dias]);

    res.json({
      periodo_dias: dias,
      esperado_mes: esperadoMes,
      detectado_periodo: montoDetectado,
      detectado_mensualizado: detectadoMensualizado,
      brecha_mensual: brecha,
      pct_captura: pctCaptura,
      total_viajes: Number(stats.total_viajes),
      viajes_facturados: Number(stats.facturados),
      viajes_sin_tarifa: Number(stats.sin_tarifa),
      top_sin_tarifa: topSinTarifa.rows,
      camiones_sin_viaje: camionesSinViaje.rows,
      origen_no_cd: origenNoCD.rows,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
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

// ═══ EN VIVO: Real-time trip detection for Cencosud trucks ═══
router.get("/en-vivo", async (req, res) => {
  try {
    const ahora = new Date();
    const hoyStr = ahora.toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

    const TRANSITO_PATTERNS = [
      'peaje', 'copec', 'descanso', 'pesaje', 'hosteria', 'estacionamiento',
      'watts', 'prolesur', 'kaufman', 'embonor', 'blue express', 'tiltil',
      'sotraser', 'bodegas san francisco',
    ];

    function isCD(nombre: string): boolean {
      const n = nombre.toLowerCase();
      return n.startsWith('cd ') || n.includes('centro de distribución') || n.includes('centro de transferencia');
    }
    function isTransito(nombre: string): boolean {
      const n = nombre.toLowerCase();
      return TRANSITO_PATTERNS.some(p => n.includes(p));
    }

    const [camionesRes, geocercasRes, aliasRes] = await Promise.all([
      pool.query(`
        SELECT u.patente, u.lat, u.lng, u.velocidad, u.rumbo, u.timestamp_gps,
               u.odometro, u.conductor, u.combustible_nivel
        FROM ultima_posicion_camion u
        JOIN camiones c ON c.patente = u.patente
        JOIN faenas f ON f.id = c.faena_id
        WHERE f.nombre = 'CENCOSUD'
          AND u.lat IS NOT NULL AND u.lat != 0
      `),
      pool.query(`
        SELECT nombre, lat, lng, poligono FROM cencosud_geocercas_kml
        WHERE lat IS NOT NULL AND lat != 0
      `),
      pool.query(`
        SELECT geocerca_nombre, nombre_contrato 
        FROM geocerca_alias_contrato 
        WHERE contrato = 'CENCOSUD' AND confirmado = true
      `),
    ]);

    const aliasMap = new Map<string, string>();
    for (const a of aliasRes.rows as any[]) {
      aliasMap.set(a.geocerca_nombre.toLowerCase(), a.nombre_contrato);
    }

    const geocercas = (geocercasRes.rows as any[]).map(g => {
      const nc = aliasMap.get(g.nombre.toLowerCase()) || g.nombre;
      return {
        nombre: g.nombre,
        nombre_contrato: nc,
        lat: parseFloat(g.lat),
        lng: parseFloat(g.lng),
        poligono: g.poligono && Array.isArray(g.poligono) && g.poligono.length >= 3 ? g.poligono : null,
        tipo: isCD(nc) ? "cd" as const : isTransito(nc) ? "transito" as const : "tienda" as const,
      };
    });

    const cds = geocercas.filter(g => g.tipo === "cd");
    const tiendas = geocercas.filter(g => g.tipo === "tienda");

    function pipCheck(lat: number, lng: number, poligono: [number, number][]): boolean {
      let inside = false;
      for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
        const yi = poligono[i][0], xi = poligono[i][1];
        const yj = poligono[j][0], xj = poligono[j][1];
        if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
      }
      return inside;
    }
    function hav(lat1: number, lon1: number, lat2: number, lon2: number): number {
      const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    function findGeocerca(lat: number, lng: number) {
      for (const g of geocercas) {
        if (g.poligono) { if (pipCheck(lat, lng, g.poligono)) return g; }
        else if (hav(lat, lng, g.lat, g.lng) < 0.5) return g;
      }
      return null;
    }
    function findNearestOfType(lat: number, lng: number, list: typeof geocercas, exclude?: string) {
      let best = null;
      let bestDist = Infinity;
      const seen = new Set<string>();
      for (const g of list) {
        const nc = g.nombre_contrato;
        if (seen.has(nc)) continue;
        seen.add(nc);
        if (exclude && nc === exclude) continue;
        const d = hav(lat, lng, g.lat, g.lng);
        if (d < bestDist) { bestDist = d; best = g; }
      }
      return best ? { geo: best, dist: Math.round(bestDist) } : null;
    }

    const enRuta: any[] = [];
    const enCD: any[] = [];
    const sinGps: any[] = [];

    const allPatentes = (camionesRes.rows as any[]).filter(c => {
      const ts = new Date(c.timestamp_gps);
      return (ahora.getTime() - ts.getTime()) / 60000 <= 120;
    }).map(c => c.patente);

    let gpsBulk = new Map<string, any[]>();
    if (allPatentes.length > 0) {
      const gpsRes = await pool.query(`
        SELECT patente, lat, lng, timestamp_gps, velocidad
        FROM gps_unificado
        WHERE patente = ANY($1) AND DATE(timestamp_gps) = $2
        ORDER BY patente, timestamp_gps ASC
      `, [allPatentes, hoyStr]);
      for (const row of gpsRes.rows as any[]) {
        if (!gpsBulk.has(row.patente)) gpsBulk.set(row.patente, []);
        gpsBulk.get(row.patente)!.push(row);
      }
    }

    for (const cam of camionesRes.rows as any[]) {
      const lat = parseFloat(cam.lat);
      const lng = parseFloat(cam.lng);
      const tsGps = new Date(cam.timestamp_gps);
      const minutosDesde = (ahora.getTime() - tsGps.getTime()) / 60000;

      if (minutosDesde > 120) {
        sinGps.push({
          patente: cam.patente,
          lat, lng,
          ultimo_gps: cam.timestamp_gps,
          minutos_sin_gps: Math.round(minutosDesde),
          conductor: cam.conductor,
        });
        continue;
      }

      const geoActual = findGeocerca(lat, lng);

      if (geoActual && geoActual.tipo !== "transito") {
        enCD.push({
          patente: cam.patente,
          lat, lng,
          velocidad: parseFloat(cam.velocidad || 0),
          geocerca: geoActual.nombre_contrato || geoActual.nombre,
          tipo_geocerca: geoActual.tipo,
          timestamp_gps: cam.timestamp_gps,
          conductor: cam.conductor,
          odometro: cam.odometro ? parseFloat(cam.odometro) : null,
        });
      } else {
        const puntos = gpsBulk.get(cam.patente) || [];
        let ultimoCD: typeof geocercas[0] | null = null;
        let horaSalidaCD: string | null = null;
        let ultimaTienda: typeof geocercas[0] | null = null;
        let horaTienda: string | null = null;
        let kmRecorridos = 0;

        for (let i = 0; i < puntos.length; i++) {
          const pLat = parseFloat(puntos[i].lat);
          const pLng = parseFloat(puntos[i].lng);
          const geo = findGeocerca(pLat, pLng);
          if (geo) {
            if (geo.tipo === "cd") {
              ultimoCD = geo;
              horaSalidaCD = null;
              ultimaTienda = null;
              horaTienda = null;
            } else if (geo.tipo === "tienda") {
              ultimaTienda = geo;
              horaTienda = puntos[i].timestamp_gps;
            }
          } else if (ultimoCD && !horaSalidaCD) {
            horaSalidaCD = puntos[i].timestamp_gps;
          }
          if (i > 0) {
            const d = hav(parseFloat(puntos[i - 1].lat), parseFloat(puntos[i - 1].lng), pLat, pLng);
            if (d < 10) kmRecorridos += d;
          }
        }

        let fase: "ida" | "vuelta" | "desconocido" = "desconocido";
        let destino: { nombre: string; lat: number; lng: number; km_restante: number } | null = null;

        if (ultimoCD) {
          if (ultimaTienda) {
            fase = "vuelta";
            destino = {
              nombre: ultimoCD.nombre_contrato || ultimoCD.nombre,
              lat: ultimoCD.lat, lng: ultimoCD.lng,
              km_restante: Math.round(hav(lat, lng, ultimoCD.lat, ultimoCD.lng)),
            };
          } else {
            fase = "ida";
            const nearest = findNearestOfType(lat, lng, tiendas);
            if (nearest) {
              destino = {
                nombre: nearest.geo.nombre_contrato || nearest.geo.nombre,
                lat: nearest.geo.lat, lng: nearest.geo.lng,
                km_restante: nearest.dist,
              };
            }
          }
        } else {
          const nearCD = findNearestOfType(lat, lng, cds);
          if (nearCD) {
            fase = "vuelta";
            destino = {
              nombre: nearCD.geo.nombre_contrato || nearCD.geo.nombre,
              lat: nearCD.geo.lat, lng: nearCD.geo.lng,
              km_restante: nearCD.dist,
            };
          }
        }

        enRuta.push({
          patente: cam.patente,
          lat, lng,
          velocidad: parseFloat(cam.velocidad || 0),
          rumbo: parseFloat(cam.rumbo || 0),
          timestamp_gps: cam.timestamp_gps,
          conductor: cam.conductor,
          odometro: cam.odometro ? parseFloat(cam.odometro) : null,
          fase,
          origen: ultimoCD ? {
            nombre: ultimoCD.nombre_contrato || ultimoCD.nombre,
            lat: ultimoCD.lat, lng: ultimoCD.lng,
          } : null,
          hora_salida: horaSalidaCD,
          km_recorridos: Math.round(kmRecorridos),
          entrega: ultimaTienda ? {
            nombre: ultimaTienda.nombre_contrato || ultimaTienda.nombre,
            lat: ultimaTienda.lat, lng: ultimaTienda.lng,
            hora: horaTienda,
          } : null,
          destino_probable: destino,
        });
      }
    }

    enRuta.sort((a, b) => (b.km_recorridos || 0) - (a.km_recorridos || 0));

    const geocercasMap: any[] = [];
    const seenGeo = new Set<string>();
    for (const g of geocercas) {
      if (g.tipo === "transito") continue;
      const nc = g.nombre_contrato || g.nombre;
      if (seenGeo.has(nc)) continue;
      seenGeo.add(nc);
      geocercasMap.push({ nombre: nc, lat: g.lat, lng: g.lng, tipo: g.tipo });
    }

    res.json({
      timestamp: ahora.toISOString(),
      fecha: hoyStr,
      resumen: {
        total_cencosud: camionesRes.rows.length,
        en_ruta: enRuta.length,
        en_cd: enCD.length,
        sin_gps: sinGps.length,
      },
      en_ruta: enRuta,
      en_cd: enCD,
      sin_gps: sinGps,
      geocercas: geocercasMap,
    });
  } catch (e: any) {
    console.error("[EN-VIVO]", e);
    res.status(500).json({ error: e.message });
  }
});

// ═══ EN VIVO: GPS trail for specific truck today ═══
router.get("/en-vivo/trail/:patente", async (req, res) => {
  try {
    const { patente } = req.params;
    const hoyStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
    const result = await pool.query(`
      SELECT lat, lng, velocidad, timestamp_gps, odometro
      FROM gps_unificado
      WHERE patente = $1 AND DATE(timestamp_gps) = $2
      ORDER BY timestamp_gps ASC
    `, [patente, hoyStr]);
    res.json({ patente, puntos: result.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══ CONTROL OPERACIONAL DIARIO — velocidad, km, paradas, rendimiento por camión ═══
router.get("/control-diario", async (req, res) => {
  try {
    const fechaRaw = (req.query.fecha as string) || new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaRaw)) return res.status(400).json({ error: "Fecha inválida, use YYYY-MM-DD" });
    const fecha = fechaRaw;

    const [flota, excesos, paradas, viajes, velocidadHora] = await Promise.all([
      pool.query(`
        SELECT c.patente, c.modelo,
          MIN(wp.kms_total)::float as odo_ini, MAX(wp.kms_total)::float as odo_fin,
          ROUND((MAX(wp.kms_total) - MIN(wp.kms_total))::numeric) as km_dia,
          ROUND(MAX(wp.velocidad)::numeric) as vel_max,
          ROUND(AVG(wp.velocidad) FILTER (WHERE wp.velocidad > 3)::numeric) as vel_prom,
          COUNT(*) FILTER (WHERE wp.velocidad > 90)::int as puntos_sobre_90,
          COUNT(*) FILTER (WHERE wp.velocidad > 105)::int as puntos_sobre_105,
          MIN(wp.consumo_litros)::float as litros_ini, MAX(wp.consumo_litros)::float as litros_fin,
          ROUND((MAX(wp.consumo_litros) - MIN(wp.consumo_litros))::numeric, 1) as litros_dia,
          ROUND(CASE WHEN (MAX(wp.consumo_litros) - MIN(wp.consumo_litros)) > 0
            THEN (MAX(wp.kms_total) - MIN(wp.kms_total)) / NULLIF(MAX(wp.consumo_litros) - MIN(wp.consumo_litros), 0)
            ELSE NULL END::numeric, 2) as rendimiento,
          MIN(wp.nivel_estanque)::int as tanque_min,
          MAX(wp.nivel_estanque)::int as tanque_max,
          MIN(wp.creado_at)::text as primera_pos,
          MAX(wp.creado_at)::text as ultima_pos,
          COUNT(*)::int as total_puntos,
          ROUND(SUM(CASE WHEN wp.velocidad < 3 AND wp.ignicion = true THEN 1 ELSE 0 END)::numeric * 100.0 / NULLIF(COUNT(*), 0), 1) as pct_ralenti,
          wp.conductor
        FROM wisetrack_posiciones wp
        JOIN camiones c ON c.patente = wp.patente
        JOIN faenas f ON f.id = c.faena_id
        WHERE f.nombre ILIKE '%CENCOSUD%'
          AND wp.creado_at >= $1::date AND wp.creado_at < ($1::date + interval '1 day')
          AND wp.kms_total > 0
        GROUP BY c.patente, c.modelo, wp.conductor
        HAVING (MAX(wp.kms_total) - MIN(wp.kms_total)) >= 0
        ORDER BY km_dia DESC NULLS LAST
      `, [fecha]),

      pool.query(`
        SELECT c.patente, wp.velocidad::int as velocidad, wp.lat, wp.lng,
          wp.creado_at::text as hora, wp.conductor
        FROM wisetrack_posiciones wp
        JOIN camiones c ON c.patente = wp.patente
        JOIN faenas f ON f.id = c.faena_id
        WHERE f.nombre ILIKE '%CENCOSUD%'
          AND wp.creado_at >= $1::date AND wp.creado_at < ($1::date + interval '1 day')
          AND wp.velocidad > 90
        ORDER BY wp.velocidad DESC
        LIMIT 100
      `, [fecha]),

      pool.query(`
        WITH gaps AS (
          SELECT c.patente, wp.lat, wp.lng, wp.creado_at,
            LAG(wp.creado_at) OVER (PARTITION BY c.patente ORDER BY wp.creado_at) as prev_at,
            wp.velocidad
          FROM wisetrack_posiciones wp
          JOIN camiones c ON c.patente = wp.patente
          JOIN faenas f ON f.id = c.faena_id
          WHERE f.nombre ILIKE '%CENCOSUD%'
            AND wp.creado_at >= $1::date AND wp.creado_at < ($1::date + interval '1 day')
            AND wp.velocidad < 3
        )
        SELECT patente, COUNT(*)::int as puntos_detenido,
          ROUND(COUNT(*)::numeric / 60, 1) as horas_estimadas_detenido
        FROM gaps
        GROUP BY patente
        ORDER BY puntos_detenido DESC
      `, [fecha]),

      pool.query(`
        SELECT DISTINCT ON (va.id) c.patente, va.origen_nombre, va.destino_nombre,
          va.km_ecu::float as km, va.duracion_minutos::int as duracion,
          va.rendimiento_real::float as rendimiento,
          va.velocidad_maxima::float as vel_max,
          va.fecha_inicio::text, va.fecha_fin::text,
          COALESCE(ao.nombre_contrato, va.origen_nombre) as origen_contrato,
          COALESCE(ad.nombre_contrato, va.destino_nombre) as destino_contrato,
          CASE WHEN crt.tarifa IS NOT NULL THEN 'CRUZADO' ELSE 'PENDIENTE' END as estado_factura,
          crt.tarifa::float
        FROM viajes_aprendizaje va
        JOIN camiones c ON c.id = va.camion_id
        LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = 'CENCOSUD'
        LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = 'CENCOSUD'
        LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = COALESCE(ao.nombre_contrato, va.origen_nombre)
          AND crt.destino = COALESCE(ad.nombre_contrato, va.destino_nombre) AND crt.contrato = 'CENCOSUD' AND crt.activo = true
        WHERE va.contrato = 'CENCOSUD' AND va.fuente_viaje = 'T1_RECONSTRUCTOR'
          AND DATE(va.fecha_inicio) = $1 AND va.km_ecu >= 15
        ORDER BY va.id, crt.tarifa DESC NULLS LAST
      `, [fecha]),

      pool.query(`
        SELECT EXTRACT(HOUR FROM wp.creado_at) as hora,
          ROUND(AVG(wp.velocidad) FILTER (WHERE wp.velocidad > 3)::numeric) as vel_prom,
          ROUND(MAX(wp.velocidad)::numeric) as vel_max,
          COUNT(DISTINCT c.patente)::int as camiones_activos,
          COUNT(*) FILTER (WHERE wp.velocidad > 90)::int as excesos
        FROM wisetrack_posiciones wp
        JOIN camiones c ON c.patente = wp.patente
        JOIN faenas f ON f.id = c.faena_id
        WHERE f.nombre ILIKE '%CENCOSUD%'
          AND wp.creado_at >= $1::date AND wp.creado_at < ($1::date + interval '1 day')
        GROUP BY EXTRACT(HOUR FROM wp.creado_at)
        ORDER BY hora
      `, [fecha]),
    ]);

    const camiones = flota.rows;
    const kmTotal = camiones.reduce((s: number, c: any) => s + (parseFloat(c.km_dia) || 0), 0);
    const litrosTotal = camiones.reduce((s: number, c: any) => s + (parseFloat(c.litros_dia) || 0), 0);
    const excesosTotal = camiones.reduce((s: number, c: any) => s + (c.puntos_sobre_90 || 0), 0);
    const excesosCriticos = camiones.reduce((s: number, c: any) => s + (c.puntos_sobre_105 || 0), 0);
    const velMaxFlota = camiones.length > 0 ? Math.max(...camiones.map((c: any) => parseFloat(c.vel_max) || 0)) : 0;
    const rendProm = camiones.filter((c: any) => c.rendimiento > 0 && c.rendimiento < 10);
    const rendimientoFlota = rendProm.length > 0 ? rendProm.reduce((s: number, c: any) => s + parseFloat(c.rendimiento), 0) / rendProm.length : 0;

    const viajesData = viajes.rows;
    const ingresoEstimado = viajesData.filter((v: any) => v.tarifa).reduce((s: number, v: any) => s + v.tarifa, 0);
    const viajesCruzados = viajesData.filter((v: any) => v.estado_factura === 'CRUZADO').length;

    res.json({
      fecha,
      resumen: {
        camiones_activos: camiones.length,
        km_total: Math.round(kmTotal),
        litros_total: Math.round(litrosTotal * 10) / 10,
        rendimiento_flota: Math.round(rendimientoFlota * 100) / 100,
        vel_max_flota: velMaxFlota,
        excesos_90: excesosTotal,
        excesos_105: excesosCriticos,
        viajes_total: viajesData.length,
        viajes_cruzados: viajesCruzados,
        ingreso_estimado: Math.round(ingresoEstimado),
        pct_facturado: viajesData.length > 0 ? Math.round(viajesCruzados / viajesData.length * 100) : 0,
      },
      camiones,
      excesos_detalle: excesos.rows,
      paradas: paradas.rows,
      viajes: viajesData,
      velocidad_por_hora: velocidadHora.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/alias-audit", async (_req, res) => {
  try {
    const r = await pool.query(`SELECT id, geocerca_nombre, nombre_contrato, confirmado FROM geocerca_alias_contrato WHERE contrato = 'CENCOSUD' ORDER BY geocerca_nombre`);
    res.json({ total: r.rows.length, aliases: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/alias-fix", async (_req, res) => {
  try {
    const fixes: string[] = [];

    const upCD = await pool.query(`UPDATE geocerca_alias_contrato SET nombre_contrato = 'CD Chillán' WHERE contrato = 'CENCOSUD' AND nombre_contrato = 'CD CHILLAN' RETURNING id`);
    if (upCD.rowCount) fixes.push(`CD CHILLAN → CD Chillán: ${upCD.rowCount} fixed`);

    const badAliases = await pool.query(`
      SELECT id, geocerca_nombre, nombre_contrato FROM geocerca_alias_contrato
      WHERE contrato = 'CENCOSUD' AND (
        (geocerca_nombre = 'Chillán' AND nombre_contrato = 'Temuco')
        OR (geocerca_nombre = 'Los Ángeles' AND nombre_contrato = 'Puerto Montt')
        OR (geocerca_nombre = 'Temuco' AND nombre_contrato = 'Los Ángeles')
        OR (geocerca_nombre = 'Mulchén' AND nombre_contrato = 'Los Ángeles')
      )
    `);

    if (badAliases.rows.length > 0) {
      const ids = badAliases.rows.map((r: any) => r.id);
      await pool.query(`DELETE FROM geocerca_alias_contrato WHERE id = ANY($1)`, [ids]);
      fixes.push(`Deleted ${ids.length} incorrect aliases: ${badAliases.rows.map((r: any) => `${r.geocerca_nombre}→${r.nombre_contrato}`).join(', ')}`);
    }

    const missingAliases = [
      { geo: 'Chillán', contrato: 'Chillán' },
      { geo: 'Mulchén', contrato: 'Mulchén' },
    ];
    for (const m of missingAliases) {
      const exists = await pool.query(`SELECT 1 FROM geocerca_alias_contrato WHERE geocerca_nombre = $1 AND nombre_contrato = $2 AND contrato = 'CENCOSUD'`, [m.geo, m.contrato]);
      if (exists.rows.length === 0) {
        await pool.query(`INSERT INTO geocerca_alias_contrato (geocerca_nombre, nombre_contrato, contrato, confirmado) VALUES ($1, $2, 'CENCOSUD', true)`, [m.geo, m.contrato]);
        fixes.push(`Added: ${m.geo} → ${m.contrato}`);
      }
    }

    res.json({ ok: true, fixes });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══ CRUCE SIGETRA: cargas combustible ↔ viajes WiseTrack ═══
router.get("/cruce-sigetra", async (req, res) => {
  try {
    const dias = parseInt(req.query.dias as string) || 30;

    const [resumen, viajesConCarga, cargasSinViaje, deltasTop, patentesNoMatch] = await Promise.all([
      // Resumen global de cruce — normalizamos patentes (quitamos guiones)
      pool.query(`
        WITH cenco AS (
          SELECT DISTINCT REPLACE(patente, '-', '') AS pat_norm
          FROM wisetrack_posiciones WHERE grupo1='CENCOSUD'
        ),
        viajes AS (
          SELECT v.* FROM viajes_aprendizaje v
          WHERE v.contrato='CENCOSUD' AND v.fecha_inicio >= CURRENT_DATE - $1::int
        ),
        cargas_cenco AS (
          SELECT c.* FROM cargas c
          WHERE REPLACE(c.patente, '-', '') IN (SELECT pat_norm FROM cenco)
            AND c.fecha::timestamp >= (CURRENT_DATE - $1::int)::timestamp
        )
        SELECT
          (SELECT COUNT(*) FROM viajes) AS viajes_total,
          (SELECT COUNT(*) FROM viajes WHERE sigetra_cruzado=true) AS viajes_cruzados,
          (SELECT COUNT(*) FROM cargas_cenco) AS cargas_cenco,
          (SELECT COALESCE(SUM(litros_surtidor), 0) FROM cargas_cenco) AS litros_cenco,
          (SELECT COUNT(*) FROM cargas WHERE fecha::timestamp >= (CURRENT_DATE - $1::int)::timestamp) AS cargas_total_sistema,
          (SELECT COUNT(DISTINCT patente) FROM cargas_cenco) AS patentes_con_cargas,
          (SELECT COUNT(*) FROM cenco) AS patentes_cenco
      `, [dias]),
      // Viajes con cruce Sigetra (top deltas)
      pool.query(`
        SELECT v.id, v.fecha_inicio, v.origen_nombre, v.destino_nombre,
               v.km_ecu, v.km_declarado_sigetra,
               v.litros_consumidos_ecu, v.litros_cargados_sigetra,
               v.delta_cuadratura, v.rendimiento_real,
               (SELECT patente FROM camiones WHERE id=v.camion_id) as patente
        FROM viajes_aprendizaje v
        WHERE v.contrato='CENCOSUD' AND v.fecha_inicio >= CURRENT_DATE - $1::int
          AND v.sigetra_cruzado=true
        ORDER BY ABS(COALESCE(v.delta_cuadratura, 0)) DESC LIMIT 20
      `, [dias]),
      // Cargas Sigetra de patentes CENCOSUD sin viaje matcheado (normalizado)
      pool.query(`
        SELECT c.id, c.fecha, c.patente, c.litros_surtidor, c.km_anterior, c.km_actual,
               c.lugar_consumo, c.proveedor, c.conductor
        FROM cargas c
        WHERE REPLACE(c.patente, '-', '') IN (
            SELECT DISTINCT REPLACE(patente, '-', '')
            FROM wisetrack_posiciones WHERE grupo1='CENCOSUD'
          )
          AND c.fecha::timestamp >= (CURRENT_DATE - $1::int)::timestamp
          AND NOT EXISTS (
            SELECT 1 FROM viajes_aprendizaje v
            JOIN camiones cam ON cam.id = v.camion_id
            WHERE v.contrato='CENCOSUD'
              AND ABS(EXTRACT(EPOCH FROM (v.fecha_inicio - c.fecha::timestamp))) < 86400
              AND REPLACE(cam.patente, '-', '') = REPLACE(c.patente, '-', '')
          )
        ORDER BY c.fecha DESC LIMIT 30
      `, [dias]),
      // Top desviaciones (alertas)
      pool.query(`
        SELECT v.id, v.fecha_inicio, v.origen_nombre, v.destino_nombre,
               v.delta_cuadratura, v.km_ecu, v.km_declarado_sigetra,
               (SELECT patente FROM camiones WHERE id=v.camion_id) as patente
        FROM viajes_aprendizaje v
        WHERE v.contrato='CENCOSUD' AND v.fecha_inicio >= CURRENT_DATE - $1::int
          AND ABS(v.delta_cuadratura) > 20
        ORDER BY ABS(v.delta_cuadratura) DESC LIMIT 15
      `, [dias]),
      // Patentes Sigetra que NO matchean con flota CENCOSUD (normalizado)
      pool.query(`
        SELECT c.patente, COUNT(*) as cargas, SUM(c.litros_surtidor) as litros
        FROM cargas c
        WHERE c.fecha::timestamp >= (CURRENT_DATE - $1::int)::timestamp
          AND REPLACE(c.patente, '-', '') NOT IN (
            SELECT DISTINCT REPLACE(patente, '-', '')
            FROM wisetrack_posiciones WHERE grupo1='CENCOSUD'
          )
        GROUP BY c.patente ORDER BY cargas DESC LIMIT 20
      `, [dias]),
    ]);

    const r = resumen.rows[0] || {};
    const viajesT = Number(r.viajes_total) || 0;
    const cruzados = Number(r.viajes_cruzados) || 0;
    res.json({
      dias,
      resumen: {
        viajes_total: viajesT,
        viajes_cruzados: cruzados,
        pct_cruzados: viajesT > 0 ? Math.round(cruzados * 100 / viajesT) : 0,
        cargas_cenco: Number(r.cargas_cenco) || 0,
        litros_cenco: Number(r.litros_cenco) || 0,
        cargas_total_sistema: Number(r.cargas_total_sistema) || 0,
        patentes_con_cargas: Number(r.patentes_con_cargas) || 0,
        patentes_cenco: Number(r.patentes_cenco) || 0,
      },
      viajes_cruzados: viajesConCarga.rows,
      cargas_sin_viaje: cargasSinViaje.rows,
      top_desviaciones: deltasTop.rows,
      patentes_no_match: patentesNoMatch.rows,
    });
  } catch (e: any) {
    console.error("[cruce-sigetra]", e);
    res.status(500).json({ error: e.message });
  }
});

// ═══ VIAJES PROPUESTOS: camiones con km GPS sin viaje detectado ═══
router.get("/viajes-propuestos", async (req, res) => {
  try {
    const fecha = (req.query.fecha as string) || new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // 1) Patentes CENCOSUD con movimiento GPS pero sin viaje detectado ese día
    const sinViaje = await pool.query(`
      WITH movimiento AS (
        SELECT patente,
               COUNT(*) as puntos,
               COUNT(DISTINCT date_trunc('hour', fecha)) as horas_activas,
               MIN(fecha) as primer_pt, MAX(fecha) as ultimo_pt
        FROM wisetrack_posiciones
        WHERE grupo1='CENCOSUD'
          AND fecha::date = $1::date
        GROUP BY patente
        HAVING COUNT(*) > 50
      ),
      con_viaje AS (
        SELECT DISTINCT (SELECT patente FROM camiones WHERE id=v.camion_id) as patente
        FROM viajes_aprendizaje v
        WHERE v.contrato='CENCOSUD' AND v.fecha_inicio::date = $1::date
      )
      SELECT m.* FROM movimiento m
      WHERE m.patente NOT IN (SELECT patente FROM con_viaje WHERE patente IS NOT NULL)
      ORDER BY m.puntos DESC
    `, [fecha]);

    // 2) Para cada uno, calcular paradas (clusters de >20min sin moverse) → destinos candidatos
    const propuestos = [];
    for (const row of sinViaje.rows) {
      // Gap-and-island: islas de puntos con vel<=5 separados por movimientos
      const paradas = await pool.query(`
        WITH pts AS (
          SELECT fecha, lat, lng, velocidad,
                 SUM(CASE WHEN velocidad > 8 THEN 1 ELSE 0 END)
                   OVER (ORDER BY fecha) AS island_id
          FROM wisetrack_posiciones
          WHERE patente = $1 AND fecha::date = $2::date
        )
        SELECT
          AVG(lat) AS lat, AVG(lng) AS lng,
          MIN(fecha) AS desde, MAX(fecha) AS hasta,
          EXTRACT(EPOCH FROM (MAX(fecha) - MIN(fecha)))/60 AS duracion_min,
          COUNT(*) AS puntos
        FROM pts
        WHERE velocidad <= 8
        GROUP BY island_id
        HAVING EXTRACT(EPOCH FROM (MAX(fecha) - MIN(fecha)))/60 >= 20
           AND COUNT(*) >= 5
        ORDER BY desde
        LIMIT 8
      `, [row.patente, fecha]);

      // 3) Para cada parada, buscar geocerca cercana (<2km) via haversine
      const paradasConNombre = await Promise.all(paradas.rows.map(async (p: any) => {
        const geo = await pool.query(`
          SELECT nombre,
            (6371000 * acos(LEAST(1, GREATEST(-1,
              cos(radians($2)) * cos(radians(lat)) *
              cos(radians(lng) - radians($1)) +
              sin(radians($2)) * sin(radians(lat))
            )))) as dist_m
          FROM geo_bases
          WHERE lat IS NOT NULL AND lng IS NOT NULL AND activa=true
          ORDER BY dist_m ASC LIMIT 1
        `, [p.lng, p.lat]).catch(() => ({ rows: [] as any[] }));
        const cercana = geo.rows[0];
        return {
          ...p,
          lugar_sugerido: cercana && cercana.dist_m < 2000 ? cercana.nombre : null,
          dist_m: cercana?.dist_m ? Math.round(cercana.dist_m) : null,
        };
      }));

      // Sugerir viaje: primera parada significativa = origen, última = destino
      const significativas = paradasConNombre.filter(p => p.duracion_min >= 30);
      const origen = significativas[0];
      const destino = significativas[significativas.length - 1];

      propuestos.push({
        patente: row.patente,
        puntos: Number(row.puntos),
        horas_activas: Number(row.horas_activas),
        primer_pt: row.primer_pt,
        ultimo_pt: row.ultimo_pt,
        paradas: paradasConNombre,
        viaje_sugerido: origen && destino && origen !== destino ? {
          origen: origen.lugar_sugerido || `(${origen.lat?.toFixed(4)}, ${origen.lng?.toFixed(4)})`,
          destino: destino.lugar_sugerido || `(${destino.lat?.toFixed(4)}, ${destino.lng?.toFixed(4)})`,
          origen_lat: origen.lat, origen_lng: origen.lng,
          destino_lat: destino.lat, destino_lng: destino.lng,
          duracion_origen_min: Math.round(origen.duracion_min),
          duracion_destino_min: Math.round(destino.duracion_min),
          requiere_geocerca_origen: !origen.lugar_sugerido,
          requiere_geocerca_destino: !destino.lugar_sugerido,
        } : null,
      });
    }

    res.json({ fecha, total: propuestos.length, propuestos });
  } catch (e: any) {
    console.error("[viajes-propuestos]", e);
    res.status(500).json({ error: e.message });
  }
});

// ═══ Crear geocerca desde un punto sugerido ═══
router.post("/geocerca-desde-punto", async (req, res) => {
  try {
    const { nombre, lat, lng, radio_m, tipo } = req.body;
    if (!nombre || !lat || !lng) {
      return res.status(400).json({ error: "nombre, lat, lng requeridos" });
    }
    const r = await pool.query(`
      INSERT INTO geo_bases (nombre, lat, lng, radio_metros, contrato, activa)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING id, nombre
    `, [nombre, lat, lng, radio_m || 200, "CENCOSUD"]);
    res.json({ ok: true, geocerca: r.rows[0] });
  } catch (e: any) {
    console.error("[geocerca-desde-punto]", e);
    res.status(500).json({ error: e.message });
  }
});

// ═══ AUTO-CIERRE DE BRECHA: cruza Sigetra + propone geocercas con IA ═══
router.post("/auto-cierre/ejecutar", async (req, res) => {
  try {
    const fecha = (req.body.fecha as string) || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const diasAtras = parseInt(req.body.dias_atras) || 14;
    const autoCrear = !!req.body.auto_crear;
    const umbral = parseFloat(req.body.umbral_confianza) || 0.85;
    const result = await ejecutarAutoCierre({
      fecha, diasAtras, autoCrearGeocercas: autoCrear, umbralConfianza: umbral,
    });
    res.json(result);
  } catch (e: any) {
    console.error("[auto-cierre/ejecutar]", e);
    res.status(500).json({ error: e.message });
  }
});

router.get("/auto-cierre/estado", async (_req, res) => {
  try {
    const [crucesUlt, geocercasIA, paradas] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE sigetra_cruzado = true)::int AS cruzados,
          COUNT(*)::int AS total,
          ROUND(COALESCE(SUM(litros_cargados_sigetra) FILTER (WHERE sigetra_cruzado = true), 0)::numeric)::int AS litros,
          ROUND(COALESCE(SUM(km_declarado_sigetra) FILTER (WHERE sigetra_cruzado = true), 0)::numeric)::int AS km
        FROM viajes_aprendizaje
        WHERE contrato='CENCOSUD' AND fecha_inicio >= CURRENT_DATE - 30
      `),
      pool.query(`
        SELECT id, nombre, lat, lng, radio_metros, creado_at
        FROM geo_bases
        WHERE contrato='CENCOSUD' AND activa=true AND nombre LIKE 'IA:%'
        ORDER BY id DESC LIMIT 50
      `).catch(() => ({ rows: [] })),
      detectarParadasHuerfanas(14),
    ]);
    res.json({
      cruces_30d: crucesUlt.rows[0],
      geocercas_ia_creadas: geocercasIA.rows,
      paradas_huerfanas_actuales: paradas.length,
      paradas_huerfanas_top: paradas.slice(0, 10),
    });
  } catch (e: any) {
    console.error("[auto-cierre/estado]", e);
    res.status(500).json({ error: e.message });
  }
});

router.post("/auto-cierre/cruzar-rango", async (req, res) => {
  try {
    const dias = Math.min(parseInt(req.body.dias) || 30, 90);
    const fechaHasta = new Date().toISOString().slice(0, 10);
    const fechaDesde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
    const r = await cruzarSigetra({ fechaDesde, fechaHasta });
    res.json({
      dias_procesados: dias,
      desde: fechaDesde,
      hasta: fechaHasta,
      total_cruces: r.cruces,
      total_litros: Math.round(r.litros),
      total_km: Math.round(r.km),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/auto-cierre/aprobar-geocerca", async (req, res) => {
  try {
    const { lat, lng, nombre, radio_m } = req.body;
    if (!lat || !lng || !nombre) return res.status(400).json({ error: "lat, lng, nombre requeridos" });
    const r = await pool.query(
      `INSERT INTO geo_bases (nombre, lat, lng, radio_metros, contrato, activa)
       VALUES ($1, $2, $3, $4, 'CENCOSUD', true) RETURNING id, nombre`,
      [nombre, lat, lng, radio_m || 200]
    );
    res.json({ ok: true, geocerca: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

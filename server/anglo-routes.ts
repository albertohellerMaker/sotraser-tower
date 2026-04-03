import { Router } from "express";
import { pool } from "./db";
import { superAgenteAnglo } from "./agentes/super-agente-anglo";

const router = Router();
const CONTRATO = "ANGLO-CARGAS VARIAS";

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS anglo_agente_estado (
        id SERIAL PRIMARY KEY, ultimo_ciclo TIMESTAMPTZ, ciclos_totales INT DEFAULT 0,
        alias_sugeridos INT DEFAULT 0, alertas_hoy INT DEFAULT 0, estado TEXT DEFAULT 'ACTIVO'
      );
      INSERT INTO anglo_agente_estado (id, estado) VALUES (1, 'ACTIVO') ON CONFLICT (id) DO NOTHING;
      CREATE TABLE IF NOT EXISTS anglo_agente_mensajes (
        id SERIAL PRIMARY KEY, tipo TEXT NOT NULL, prioridad TEXT DEFAULT 'MEDIA',
        titulo TEXT, contenido TEXT, datos JSONB DEFAULT '{}', leido BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS anglo_agente_chat (
        id SERIAL PRIMARY KEY, rol TEXT NOT NULL, mensaje TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS anglo_parametros (
        id SERIAL PRIMARY KEY, clave TEXT UNIQUE NOT NULL, valor NUMERIC, nombre TEXT,
        descripcion TEXT, categoria TEXT DEFAULT 'GENERAL', modificado_por TEXT DEFAULT 'SISTEMA', updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS anglo_reajuste (
        id SERIAL PRIMARY KEY, periodo TEXT NOT NULL, fecha_aplicacion DATE NOT NULL,
        ipc1 NUMERIC, diesel1 NUMERIC, dolar1 NUMERIC, fr_fijo NUMERIC, fr_variable NUMERIC,
        activo BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    const params = [
      ['IPC0', 128.65, 'IPC Base Nov 2022', 'Indice base IPC noviembre 2022', 'REAJUSTE'],
      ['DIESEL0', 1025851.30, 'Diesel Base Nov 2022', 'Precio diesel base DIRPLAN noviembre 2022', 'REAJUSTE'],
      ['DOLAR0', 917.05, 'Dolar Base Nov 2022', 'Dolar observado promedio mensual base noviembre 2022', 'REAJUSTE'],
      ['CAMIONES_CONTRATO', 74, 'Camiones Contrato', 'Cantidad de camiones en contrato Anglo Cargas Varias', 'FLOTA'],
      ['META_KM_CAMION', 8000, 'Meta KM/Camion/Mes', 'Meta de km por camion por mes', 'PRODUCTIVIDAD'],
      ['FR_IPC_PCT', 60, 'Pct IPC en FR Variable', 'Ponderacion IPC en factor reajuste variable', 'REAJUSTE'],
      ['FR_DIESEL_PCT', 30, 'Pct Diesel en FR Variable', 'Ponderacion diesel en factor reajuste variable', 'REAJUSTE'],
      ['FR_DOLAR_PCT', 10, 'Pct Dolar en FR Variable', 'Ponderacion dolar en factor reajuste variable', 'REAJUSTE'],
    ];
    for (const [clave, valor, nombre, desc, cat] of params) {
      await pool.query('INSERT INTO anglo_parametros (clave, valor, nombre, descripcion, categoria) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (clave) DO NOTHING', [clave, valor, nombre, desc, cat]);
    }
    console.log("[ANGLO] DB tables verified");
  } catch (e: any) { console.error("[ANGLO] DB bootstrap error:", e.message); }
})();

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
        WHERE va.contrato = $1 AND DATE(va.fecha_inicio) = $2 AND va.km_ecu > 0
      `, [CONTRATO, fecha]),
      pool.query(`
        SELECT va.origen_nombre, va.destino_nombre,
          ao.nombre_contrato as origen_contrato, ad.nombre_contrato as destino_contrato,
          crt.tarifa, crt.clase,
          COUNT(*)::int as viajes, COUNT(DISTINCT c.patente)::int as camiones,
          ROUND(SUM(va.km_ecu)::numeric) as km,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = $1
        LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = $1
        LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = $1 AND crt.activo = true
        WHERE va.contrato = $1 AND DATE(va.fecha_inicio) = $2 AND va.km_ecu > 0
          AND va.origen_nombre IS NOT NULL AND va.destino_nombre IS NOT NULL
          AND va.origen_nombre != 'Punto desconocido' AND va.destino_nombre != 'Punto desconocido'
        GROUP BY va.origen_nombre, va.destino_nombre, ao.nombre_contrato, ad.nombre_contrato, crt.tarifa, crt.clase
        ORDER BY viajes DESC
      `, [CONTRATO, fecha]),
      pool.query(`
        SELECT c.patente, COUNT(*)::int as viajes, ROUND(SUM(va.km_ecu)::numeric) as km,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
          va.conductor
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.contrato = $1 AND DATE(va.fecha_inicio) = $2 AND va.km_ecu > 0
        GROUP BY c.patente, va.conductor ORDER BY km DESC
      `, [CONTRATO, fecha]),
      pool.query(`
        SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE va.origen_nombre = 'Punto desconocido' OR va.origen_nombre IS NULL)::int as origen_desc,
          COUNT(*) FILTER (WHERE va.destino_nombre = 'Punto desconocido' OR va.destino_nombre IS NULL)::int as destino_desc
        FROM viajes_aprendizaje va
        WHERE va.contrato = $1 AND DATE(va.fecha_inicio) = $2 AND va.km_ecu > 0
      `, [CONTRATO, fecha]),
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

router.get("/resumen-mes", async (_req, res) => {
  try {
    const paramsR = await pool.query("SELECT clave, valor::float as valor FROM anglo_parametros");
    const params: Record<string, number> = {};
    paramsR.rows.forEach((r: any) => { params[r.clave] = r.valor; });
    const camionesContrato = params.CAMIONES_CONTRATO || 74;
    const metaKm = params.META_KM_CAMION || 8000;

    const [flota, diario, cruce] = await Promise.all([
      pool.query(`
        SELECT COUNT(DISTINCT c.patente)::int as camiones, COUNT(*)::int as viajes,
          ROUND(SUM(va.km_ecu)::numeric) as km, ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.contrato = $1 AND va.fecha_inicio >= DATE_TRUNC('month', CURRENT_DATE) AND va.km_ecu > 0
      `, [CONTRATO]),
      pool.query(`
        SELECT DATE(va.fecha_inicio)::text as dia, COUNT(*)::int as viajes, COUNT(DISTINCT c.patente)::int as camiones,
          ROUND(SUM(va.km_ecu)::numeric) as km,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.contrato = $1 AND va.fecha_inicio >= DATE_TRUNC('month', CURRENT_DATE) AND va.km_ecu > 0
        GROUP BY DATE(va.fecha_inicio) ORDER BY dia
      `, [CONTRATO]),
      pool.query(`
        SELECT COUNT(*)::int as total_viajes,
          COUNT(*) FILTER (WHERE crt.tarifa IS NOT NULL)::int as cruzados,
          COALESCE(SUM(crt.tarifa) FILTER (WHERE crt.tarifa IS NOT NULL), 0)::bigint as ingreso_cruzado
        FROM viajes_aprendizaje va
        LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = $1
        LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = $1
        LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = $1 AND crt.activo = true
        WHERE va.contrato = $1 AND va.fecha_inicio >= DATE_TRUNC('month', CURRENT_DATE) AND va.km_ecu > 0
      `, [CONTRATO]),
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
        meta_km_camion: metaKm,
        camiones_contrato: camionesContrato,
      },
      tendencia: diario.rows,
      dia_actual, dias_mes,
      contrato_info: {
        nombre: "ANGLO AMERICAN - CARGAS VARIAS",
        numero: "4.22.0015.1",
        vigencia_inicio: "2023-03-01",
        vigencia_fin: "2027-06-30",
        camiones: camionesContrato,
        reajuste_formula: "FR = 60% IPC + 30% P.DIESEL + 10% DOLAR",
        bases: { ipc0: params.IPC0, diesel0: params.DIESEL0, dolar0: params.DOLAR0 },
      },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/semanal", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT DATE(va.fecha_inicio)::text as dia, COUNT(*)::int as viajes, COUNT(DISTINCT c.patente)::int as camiones,
        ROUND(SUM(va.km_ecu)::numeric) as km,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.contrato = $1 AND va.fecha_inicio >= CURRENT_DATE - 7 AND va.km_ecu > 0
      GROUP BY DATE(va.fecha_inicio) ORDER BY dia
    `, [CONTRATO]);
    res.json({ dias: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/flota", async (_req, res) => {
  try {
    const paramsR = await pool.query("SELECT clave, valor::float as valor FROM anglo_parametros WHERE clave IN ('CAMIONES_CONTRATO','META_KM_CAMION')");
    const params: Record<string, number> = {};
    paramsR.rows.forEach((r: any) => { params[r.clave] = r.valor; });
    const metaKm = params.META_KM_CAMION || 8000;

    const r = await pool.query(`
      SELECT c.patente, va.conductor, COUNT(*)::int as viajes,
        ROUND(SUM(va.km_ecu)::numeric) as km_mes,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
        COUNT(DISTINCT DATE(va.fecha_inicio))::int as dias_activo,
        MAX(va.fecha_inicio)::text as ultimo_viaje
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.contrato = $1 AND va.fecha_inicio >= DATE_TRUNC('month', CURRENT_DATE) AND va.km_ecu > 0
      GROUP BY c.patente, va.conductor ORDER BY km_mes DESC
    `, [CONTRATO]);
    const dia = new Date().getDate();
    const diasMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const camiones = r.rows.map((c: any) => {
      const proy = dia > 0 ? Math.round(parseFloat(c.km_mes) / dia * diasMes) : 0;
      return { ...c, km_proyectado: proy, pct_meta: Math.round(proy / metaKm * 100), estado: proy >= metaKm ? "OK" : proy >= metaKm * 0.6 ? "BAJO" : "CRITICO" };
    });
    res.json({ camiones, total: camiones.length, contratados: params.CAMIONES_CONTRATO || 74 });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/tarifas", async (_req, res) => {
  try {
    const r = await pool.query("SELECT clase, origen, destino, tarifa FROM contrato_rutas_tarifas WHERE contrato = $1 AND activo = true ORDER BY tarifa DESC", [CONTRATO]);
    res.json({ tarifas: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/alias", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM geocerca_alias_contrato WHERE contrato = $1 ORDER BY confirmado DESC, geocerca_nombre", [CONTRATO]);
    res.json({ alias: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/alias", async (req, res) => {
  const { geocerca_nombre, nombre_contrato } = req.body;
  if (!geocerca_nombre || !nombre_contrato) return res.status(400).json({ error: "geocerca_nombre y nombre_contrato requeridos" });
  try {
    await pool.query("INSERT INTO geocerca_alias_contrato (geocerca_nombre, nombre_contrato, contrato, confirmado, creado_por) VALUES ($1,$2,$3,true,'MANUAL') ON CONFLICT (geocerca_nombre, nombre_contrato, contrato) DO UPDATE SET confirmado = true", [geocerca_nombre, nombre_contrato, CONTRATO]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/alias/:id/confirmar", async (req, res) => {
  try {
    await pool.query("UPDATE geocerca_alias_contrato SET confirmado = true WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/sin-mapear", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT nombre, tipo, SUM(viajes)::int as viajes FROM (
        SELECT va.origen_nombre as nombre, 'ORIGEN' as tipo, COUNT(*)::int as viajes
        FROM viajes_aprendizaje va
        LEFT JOIN geocerca_alias_contrato gac ON gac.geocerca_nombre = va.origen_nombre AND gac.contrato = $1
        WHERE va.contrato = $1 AND va.fecha_inicio >= NOW() - INTERVAL '30 days'
          AND va.origen_nombre IS NOT NULL AND va.origen_nombre != 'Punto desconocido' AND gac.id IS NULL AND va.km_ecu > 0
        GROUP BY va.origen_nombre
        UNION ALL
        SELECT va.destino_nombre, 'DESTINO', COUNT(*)::int
        FROM viajes_aprendizaje va
        LEFT JOIN geocerca_alias_contrato gac ON gac.geocerca_nombre = va.destino_nombre AND gac.contrato = $1
        WHERE va.contrato = $1 AND va.fecha_inicio >= NOW() - INTERVAL '30 days'
          AND va.destino_nombre IS NOT NULL AND va.destino_nombre != 'Punto desconocido' AND gac.id IS NULL AND va.km_ecu > 0
        GROUP BY va.destino_nombre
      ) sub GROUP BY nombre, tipo ORDER BY viajes DESC
    `, [CONTRATO]);
    res.json({ sin_mapear: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/viajes-mes", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT va.id, c.patente, va.conductor, va.contrato,
        DATE(va.fecha_inicio)::text as fecha, va.origen_nombre, va.destino_nombre,
        va.km_ecu::float as km, va.rendimiento_real::float as rend,
        va.duracion_minutos::int as min, va.velocidad_maxima::float as vel_max,
        ao.nombre_contrato as origen_contrato, ad.nombre_contrato as destino_contrato,
        crt.tarifa, crt.clase
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = $1
      LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = $1
      LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = $1 AND crt.activo = true
      WHERE va.contrato = $1 AND va.fecha_inicio >= DATE_TRUNC('month', CURRENT_DATE) AND va.km_ecu > 0
      ORDER BY va.fecha_inicio DESC
    `, [CONTRATO]);

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

router.get("/err", async (req, res) => {
  try {
    const fecha = (req.query.fecha as string) || new Date().toISOString().slice(0, 10);

    const [viajes, porRuta, porCamion] = await Promise.all([
      pool.query(`
        SELECT va.id, c.patente, va.conductor, va.origen_nombre, va.destino_nombre,
          va.km_ecu::float as km, va.rendimiento_real::float as rend, va.duracion_minutos::int as min,
          va.fecha_inicio::text, va.velocidad_maxima::float as vel_max,
          ao.nombre_contrato as o_c, ad.nombre_contrato as d_c,
          crt.tarifa, crt.clase
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = $1
        LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = $1
        LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = $1 AND crt.activo = true
        WHERE va.contrato = $1 AND DATE(va.fecha_inicio) = $2 AND va.km_ecu > 0
        ORDER BY va.fecha_inicio
      `, [CONTRATO, fecha]),
      pool.query(`
        SELECT ao.nombre_contrato as origen, ad.nombre_contrato as destino,
          crt.tarifa, crt.clase,
          COUNT(*)::int as viajes, ROUND(SUM(va.km_ecu)::numeric) as km,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
        FROM viajes_aprendizaje va
        JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = $1
        JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = $1
        JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = $1 AND crt.activo = true
        WHERE va.contrato = $1 AND DATE(va.fecha_inicio) = $2 AND va.km_ecu > 0
        GROUP BY ao.nombre_contrato, ad.nombre_contrato, crt.tarifa, crt.clase
        ORDER BY viajes DESC
      `, [CONTRATO, fecha]),
      pool.query(`
        SELECT c.patente, va.conductor, COUNT(*)::int as viajes,
          ROUND(SUM(va.km_ecu)::numeric) as km,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
          ROUND(SUM(va.duracion_minutos)::numeric / 60, 1) as horas,
          COALESCE(SUM(crt.tarifa), 0)::bigint as ingreso
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = $1
        LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = $1
        LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = $1 AND crt.activo = true
        WHERE va.contrato = $1 AND DATE(va.fecha_inicio) = $2 AND va.km_ecu > 0
        GROUP BY c.patente, va.conductor ORDER BY ingreso DESC
      `, [CONTRATO, fecha]),
    ]);

    const totalViajes = viajes.rows.length;
    const totalKm = viajes.rows.reduce((s: number, v: any) => s + (v.km || 0), 0);
    const totalIngreso = viajes.rows.reduce((s: number, v: any) => s + (v.tarifa || 0), 0);
    const viajesCruzados = viajes.rows.filter((v: any) => v.tarifa).length;
    const rendProm = viajes.rows.filter((v: any) => v.rend > 0 && v.rend < 10).reduce((s: number, v: any, _, a) => s + v.rend / a.length, 0);
    const camiones = new Set(viajes.rows.map((v: any) => v.patente)).size;

    res.json({
      fecha,
      err: { camiones, viajes: totalViajes, viajes_cruzados: viajesCruzados, pct_cruzados: totalViajes > 0 ? Math.round(viajesCruzados / totalViajes * 100) : 0, km_total: Math.round(totalKm), rend_promedio: Math.round(rendProm * 100) / 100, ingreso_estimado: totalIngreso },
      por_ruta: porRuta.rows,
      por_camion: porCamion.rows,
      viajes_detalle: viajes.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/reajuste", async (_req, res) => {
  try {
    const paramsR = await pool.query("SELECT clave, valor::float as valor FROM anglo_parametros");
    const p: Record<string, number> = {};
    paramsR.rows.forEach((r: any) => { p[r.clave] = r.valor; });

    const historial = await pool.query("SELECT * FROM anglo_reajuste ORDER BY fecha_aplicacion DESC");

    const ipc0 = p.IPC0 || 128.65;
    const diesel0 = p.DIESEL0 || 1025851.30;
    const dolar0 = p.DOLAR0 || 917.05;

    res.json({
      formula: {
        fijo: "FR = 100% IPC",
        variable: "FR = 60% IPC + 30% P.DIESEL + 10% DOLAR",
      },
      bases: { ipc0, diesel0, dolar0, mes_base: "Noviembre 2022" },
      meses_reajuste: ["Marzo", "Julio", "Noviembre"],
      historial: historial.rows,
      ponderaciones: { ipc: p.FR_IPC_PCT || 60, diesel: p.FR_DIESEL_PCT || 30, dolar: p.FR_DOLAR_PCT || 10 },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/reajuste/calcular", async (req, res) => {
  try {
    const { periodo, ipc1, diesel1, dolar1 } = req.body;
    if (!periodo || !ipc1 || !diesel1 || !dolar1) return res.status(400).json({ error: "periodo, ipc1, diesel1, dolar1 requeridos" });

    const paramsR = await pool.query("SELECT clave, valor::float as valor FROM anglo_parametros");
    const p: Record<string, number> = {};
    paramsR.rows.forEach((r: any) => { p[r.clave] = r.valor; });

    const ipc0 = p.IPC0 || 128.65;
    const diesel0 = p.DIESEL0 || 1025851.30;
    const dolar0 = p.DOLAR0 || 917.05;

    const varIpc = ipc1 / ipc0;
    const varDiesel = diesel1 / diesel0;
    const varDolar = dolar1 / dolar0;

    const frFijo = varIpc;
    const frVariable = 0.6 * varIpc + 0.3 * varDiesel + 0.1 * varDolar;

    await pool.query(
      "INSERT INTO anglo_reajuste (periodo, fecha_aplicacion, ipc1, diesel1, dolar1, fr_fijo, fr_variable) VALUES ($1, NOW(), $2, $3, $4, $5, $6)",
      [periodo, ipc1, diesel1, dolar1, frFijo, frVariable]
    );

    res.json({
      periodo,
      variaciones: { ipc: Math.round((varIpc - 1) * 10000) / 100, diesel: Math.round((varDiesel - 1) * 10000) / 100, dolar: Math.round((varDolar - 1) * 10000) / 100 },
      fr_fijo: Math.round(frFijo * 10000) / 10000,
      fr_variable: Math.round(frVariable * 10000) / 10000,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/parametros", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM anglo_parametros ORDER BY categoria, nombre");
    res.json({ parametros: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/parametros/:clave", async (req, res) => {
  const { valor } = req.body;
  if (valor === undefined) return res.status(400).json({ error: "valor requerido" });
  try {
    await pool.query("UPDATE anglo_parametros SET valor = $1, modificado_por = 'USUARIO', updated_at = NOW() WHERE clave = $2", [valor, req.params.clave]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/agente/estado", async (_req, res) => {
  try {
    const [estado, msgs] = await Promise.all([
      pool.query("SELECT * FROM anglo_agente_estado WHERE id = 1"),
      pool.query("SELECT tipo, prioridad, COUNT(*)::int as total, COUNT(*) FILTER (WHERE leido = false)::int as no_leidos FROM anglo_agente_mensajes WHERE created_at >= NOW() - INTERVAL '24 hours' GROUP BY tipo, prioridad ORDER BY total DESC"),
    ]);
    res.json({ estado: estado.rows[0], mensajes_resumen: msgs.rows, total_no_leidos: msgs.rows.reduce((s: number, m: any) => s + parseInt(m.no_leidos), 0) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/agente/mensajes", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM anglo_agente_mensajes WHERE created_at >= NOW() - INTERVAL '48 hours' ORDER BY CASE prioridad WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 ELSE 3 END, created_at DESC LIMIT 30");
    res.json({ mensajes: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/agente/mensajes/leer", async (_req, res) => {
  try {
    await pool.query("UPDATE anglo_agente_mensajes SET leido = true WHERE leido = false");
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/agente/inteligencia", async (_req, res) => {
  try {
    const [aliasR, billR, sinMapR, recentAliasR, reajusteR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE confirmado)::int as confirmados, COUNT(*) FILTER (WHERE creado_por IN ('SUPER_AGENTE','SUPER_AGENTE_ANGLO','AGENTE_GEO','GPS_PROXIMITY','AUTO_TARIFA'))::int as auto_gps, COUNT(*) FILTER (WHERE creado_por = 'MANUAL')::int as manuales FROM geocerca_alias_contrato WHERE contrato = $1`, [CONTRATO]),
      pool.query(`
        WITH trip_tarifa AS (
          SELECT DISTINCT ON (v.id) v.id, t.tarifa
          FROM viajes_aprendizaje v
          LEFT JOIN geocerca_alias_contrato a1 ON a1.geocerca_nombre = v.origen_nombre AND a1.contrato = $1
          LEFT JOIN geocerca_alias_contrato a2 ON a2.geocerca_nombre = v.destino_nombre AND a2.contrato = $1
          LEFT JOIN contrato_rutas_tarifas t ON t.contrato = $1 AND t.activo = true
            AND t.origen = COALESCE(a1.nombre_contrato, v.origen_nombre)
            AND t.destino = COALESCE(a2.nombre_contrato, v.destino_nombre)
          WHERE v.contrato = $1 AND v.fecha_inicio >= DATE_TRUNC('month', NOW())
          ORDER BY v.id
        )
        SELECT COUNT(*)::int as total, COUNT(CASE WHEN tarifa IS NOT NULL THEN 1 END)::int as con_tarifa, COALESCE(ROUND(SUM(CASE WHEN tarifa IS NOT NULL THEN tarifa ELSE 0 END)::numeric),0)::bigint as revenue, ROUND(COUNT(CASE WHEN tarifa IS NOT NULL THEN 1 END)::numeric / NULLIF(COUNT(*),0) * 100, 1) as pct FROM trip_tarifa
      `, [CONTRATO]),
      pool.query(`SELECT nombre, tipo, viajes FROM (SELECT origen_nombre as nombre, 'ORIGEN' as tipo, COUNT(*)::int as viajes FROM viajes_aprendizaje WHERE contrato = $1 AND fecha_inicio >= NOW() - INTERVAL '30 days' AND origen_nombre NOT IN (SELECT geocerca_nombre FROM geocerca_alias_contrato WHERE contrato = $1) AND origen_nombre IS NOT NULL AND origen_nombre != 'Punto desconocido' AND km_ecu > 0 GROUP BY origen_nombre UNION ALL SELECT destino_nombre, 'DESTINO', COUNT(*)::int FROM viajes_aprendizaje WHERE contrato = $1 AND fecha_inicio >= NOW() - INTERVAL '30 days' AND destino_nombre NOT IN (SELECT geocerca_nombre FROM geocerca_alias_contrato WHERE contrato = $1) AND destino_nombre IS NOT NULL AND destino_nombre != 'Punto desconocido' AND km_ecu > 0 GROUP BY destino_nombre) sub ORDER BY viajes DESC LIMIT 30`, [CONTRATO]),
      pool.query(`SELECT id, geocerca_nombre, nombre_contrato, creado_por, confirmado, created_at FROM geocerca_alias_contrato WHERE contrato = $1 ORDER BY created_at DESC LIMIT 60`, [CONTRATO]),
      pool.query("SELECT * FROM anglo_reajuste ORDER BY fecha_aplicacion DESC LIMIT 1"),
    ]);
    const al = aliasR.rows[0];
    const bl = billR.rows[0];

    const cerroR = await pool.query(`
      SELECT COUNT(*)::int as viajes_cerro,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend_cerro,
        COUNT(DISTINCT c.patente)::int as camiones_cerro
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.contrato = $1 AND va.fecha_inicio >= NOW() - INTERVAL '7 days' AND va.km_ecu > 10
        AND (va.origen_nombre ILIKE '%bronce%' OR va.destino_nombre ILIKE '%bronce%'
          OR va.origen_nombre ILIKE '%soldado%' OR va.destino_nombre ILIKE '%soldado%'
          OR va.origen_nombre ILIKE '%barnechea%' OR va.destino_nombre ILIKE '%barnechea%')
    `, [CONTRATO]);

    res.json({
      alias: { total: al.total, confirmados: al.confirmados, auto_gps: al.auto_gps, manuales: al.manuales, recientes: recentAliasR.rows },
      billing: { total: bl.total, con_tarifa: bl.con_tarifa, revenue: Number(bl.revenue), pct: Number(bl.pct) || 0 },
      sin_mapear: sinMapR.rows,
      ultimo_reajuste: reajusteR.rows[0] || null,
      cerro: cerroR.rows[0] || { viajes_cerro: 0, rend_cerro: null, camiones_cerro: 0 },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/agente/chat", async (req, res) => {
  try {
    const { mensaje } = req.body;
    if (!mensaje) return res.status(400).json({ error: "mensaje requerido" });
    const respuesta = await superAgenteAnglo.chat(mensaje);
    res.json({ respuesta });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/agente/chat/historial", async (_req, res) => {
  try {
    const r = await pool.query("SELECT rol, mensaje, created_at FROM anglo_agente_chat ORDER BY created_at DESC LIMIT 30");
    res.json({ mensajes: r.rows.reverse() });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/rutas-top", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT va.origen_nombre, va.destino_nombre,
        COUNT(*)::int as viajes, COUNT(DISTINCT c.patente)::int as camiones,
        ROUND(AVG(va.km_ecu)::numeric, 1) as km_promedio,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
        ROUND(AVG(va.duracion_minutos)::numeric) as min_promedio,
        ao.nombre_contrato as o_c, ad.nombre_contrato as d_c,
        crt.tarifa
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = $1
      LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = $1
      LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = $1 AND crt.activo = true
      WHERE va.contrato = $1 AND va.fecha_inicio >= NOW() - INTERVAL '30 days'
        AND va.origen_nombre IS NOT NULL AND va.destino_nombre IS NOT NULL
        AND va.origen_nombre != 'Punto desconocido' AND va.destino_nombre != 'Punto desconocido'
        AND va.origen_nombre != va.destino_nombre AND va.km_ecu > 5
      GROUP BY va.origen_nombre, va.destino_nombre, ao.nombre_contrato, ad.nombre_contrato, crt.tarifa
      ORDER BY viajes DESC LIMIT 30
    `, [CONTRATO]);
    res.json({ rutas: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;

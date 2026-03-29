import { Router } from "express";
import { pool } from "./db";

const router = Router();

// Dashboard Cencosud: viajes del día cruzados con rutas contratadas
router.get("/dashboard", async (req, res) => {
  try {
    const fecha = (req.query.fecha as string) || new Date().toISOString().slice(0, 10);

    const [resumen, porRuta, camiones, sinCruce, tarifas] = await Promise.all([
      // Resumen general del día
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

      // Viajes agrupados por ruta (origen → destino)
      pool.query(`
        SELECT va.origen_nombre, va.destino_nombre, COUNT(*)::int as viajes,
          COUNT(DISTINCT c.patente)::int as camiones,
          ROUND(SUM(va.km_ecu)::numeric) as km,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
          ROUND(AVG(va.duracion_minutos)::numeric) as duracion_prom
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.contrato = 'CENCOSUD' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
          AND va.origen_nombre IS NOT NULL AND va.destino_nombre IS NOT NULL
          AND va.origen_nombre != 'Punto desconocido' AND va.destino_nombre != 'Punto desconocido'
        GROUP BY va.origen_nombre, va.destino_nombre
        ORDER BY viajes DESC
      `, [fecha]),

      // Detalle por camión
      pool.query(`
        SELECT c.patente, COUNT(*)::int as viajes, ROUND(SUM(va.km_ecu)::numeric) as km,
          ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
          va.conductor,
          ARRAY_AGG(DISTINCT va.origen_nombre || ' → ' || va.destino_nombre) FILTER (WHERE va.origen_nombre IS NOT NULL AND va.destino_nombre IS NOT NULL) as rutas
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE va.contrato = 'CENCOSUD' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
        GROUP BY c.patente, va.conductor ORDER BY km DESC
      `, [fecha]),

      // Viajes sin geocerca resuelta
      pool.query(`
        SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE va.origen_nombre = 'Punto desconocido' OR va.origen_nombre IS NULL)::int as origen_desc,
          COUNT(*) FILTER (WHERE va.destino_nombre = 'Punto desconocido' OR va.destino_nombre IS NULL)::int as destino_desc
        FROM viajes_aprendizaje va
        WHERE va.contrato = 'CENCOSUD' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
      `, [fecha]),

      // Tarifas contratadas para referencia
      pool.query(`
        SELECT lote, clase, origen, destino, tarifa FROM contrato_rutas_tarifas
        WHERE contrato = 'CENCOSUD' AND activo = true ORDER BY lote, origen, destino
      `),
    ]);

    // Intentar cruzar rutas detectadas con tarifas contratadas
    const rutasCruzadas = (porRuta.rows || []).map((r: any) => {
      // Buscar coincidencia en tarifas (fuzzy match por nombre)
      const match = (tarifas.rows || []).find((t: any) => {
        const orMatch = r.origen_nombre?.toUpperCase().includes(t.origen.toUpperCase()) || t.origen.toUpperCase().includes(r.origen_nombre?.toUpperCase() || "");
        const destMatch = r.destino_nombre?.toUpperCase().includes(t.destino.toUpperCase()) || t.destino.toUpperCase().includes(r.destino_nombre?.toUpperCase() || "");
        return orMatch && destMatch;
      });
      return {
        ...r,
        tarifa_contrato: match?.tarifa || null,
        lote: match?.lote || null,
        clase: match?.clase || null,
        ingreso_estimado: match ? match.tarifa * r.viajes : null,
      };
    });

    const ingresoEstimado = rutasCruzadas.reduce((s: number, r: any) => s + (r.ingreso_estimado || 0), 0);

    res.json({
      fecha,
      resumen: resumen.rows[0],
      rutas: rutasCruzadas,
      camiones: camiones.rows,
      cobertura: sinCruce.rows[0],
      ingreso_estimado: ingresoEstimado,
      total_rutas_contrato: tarifas.rows.length,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Tarifas del contrato
router.get("/tarifas", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT lote, clase, origen, destino, tarifa FROM contrato_rutas_tarifas
      WHERE contrato = 'CENCOSUD' AND activo = true ORDER BY lote::int, tarifa DESC
    `);
    res.json({ tarifas: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Productividad vs meta contrato
router.get("/productividad", async (_req, res) => {
  try {
    // Metas del contrato: Norte 11,005 km/mes/camión, Sur Media 9,526, Sur 11,139
    const r = await pool.query(`
      SELECT c.patente, COUNT(*)::int as viajes_mes,
        ROUND(SUM(va.km_ecu)::numeric) as km_mes,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= DATE_TRUNC('month', CURRENT_DATE) AND va.km_ecu > 0
      GROUP BY c.patente ORDER BY km_mes DESC
    `);

    const meta_km_mes = 11000; // promedio ponderado
    const dias_mes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const dia_actual = new Date().getDate();

    const camiones = r.rows.map((c: any) => {
      const km_proyectado = dia_actual > 0 ? Math.round(parseFloat(c.km_mes) / dia_actual * dias_mes) : 0;
      return {
        ...c,
        km_proyectado,
        pct_meta: Math.round(km_proyectado / meta_km_mes * 100),
        sobre_meta: km_proyectado >= meta_km_mes,
      };
    });

    res.json({
      meta_km_mes,
      dia_actual,
      dias_mes,
      camiones,
      promedio_flota: camiones.length > 0 ? Math.round(camiones.reduce((s: number, c: any) => s + parseFloat(c.km_mes), 0) / camiones.length) : 0,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Resumen semanal acumulado
router.get("/semanal", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT DATE(va.fecha_inicio)::text as dia,
        COUNT(*)::int as viajes, COUNT(DISTINCT c.patente)::int as camiones,
        ROUND(SUM(va.km_ecu)::numeric) as km,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= CURRENT_DATE - 7 AND va.km_ecu > 0
      GROUP BY DATE(va.fecha_inicio) ORDER BY dia
    `);
    res.json({ dias: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;

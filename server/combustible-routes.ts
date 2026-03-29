import { Router } from "express";
import { pool } from "./db";

const router = Router();

// Resumen general
router.get("/resumen", async (req, res) => {
  try {
    const contrato = (req.query.contrato as string) || "TODOS";
    const [stats, alertas, alzas] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int as total, COUNT(CASE WHEN resultado = 'OK' THEN 1 END)::int as ok,
          COUNT(CASE WHEN resultado = 'SOSPECHOSO' THEN 1 END)::int as sospechosos,
          COUNT(CASE WHEN resultado LIKE 'ALERTA_FRAUDE%' THEN 1 END)::int as fraudes,
          COUNT(CASE WHEN resultado = 'CARGA_SIN_SUBIDA' THEN 1 END)::int as sin_subida,
          COUNT(CASE WHEN resultado = 'SIN_DATOS_ECU' THEN 1 END)::int as sin_ecu,
          ROUND(SUM(CASE WHEN resultado LIKE 'ALERTA%' THEN ABS(COALESCE(litros_diferencia,0)) ELSE 0 END)::numeric) as litros_sospechosos
        FROM validaciones_carga WHERE fecha_carga::timestamp >= NOW() - INTERVAL '30 days'
          AND ($1 = 'TODOS' OR contrato = $1)
      `, [contrato]),
      pool.query(`
        SELECT id, patente, contrato, fecha_carga::text as fecha, litros_declarados, litros_confirmados_ecu, litros_diferencia,
          diferencia_pct, nivel_antes_pct, nivel_despues_pct, resultado, conductor, estacion, gestionado
        FROM validaciones_carga WHERE resultado NOT IN ('OK','SIN_DATOS_ECU','CARGA_MINIMA_IGNORADA','SIN_VENTANA_ECU')
          AND NOT gestionado AND fecha_carga::timestamp >= NOW() - INTERVAL '30 days' AND ($1 = 'TODOS' OR contrato = $1)
        ORDER BY CASE resultado WHEN 'ALERTA_FRAUDE' THEN 1 WHEN 'CARGA_SIN_SUBIDA' THEN 2 WHEN 'SOSPECHOSO' THEN 3 ELSE 4 END, fecha_carga DESC LIMIT 50
      `, [contrato]),
      pool.query(`
        SELECT patente, contrato, fecha::text, nivel_antes_pct, nivel_despues_pct, litros_estimados
        FROM alzas_nivel_sin_carga WHERE NOT gestionado AND fecha >= NOW() - INTERVAL '30 days' AND ($1 = 'TODOS' OR contrato = $1)
        ORDER BY fecha DESC LIMIT 20
      `, [contrato]),
    ]);
    res.json({ stats: stats.rows[0], alertas: alertas.rows, alzas_sin_carga: alzas.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ADN por camion
router.get("/adn/:patente", async (req, res) => {
  try {
    const { patente } = req.params;
    const [adn, historial] = await Promise.all([
      pool.query("SELECT * FROM adn_combustible WHERE patente = $1", [patente]),
      pool.query(`
        SELECT vc.fecha_carga::text as fecha, vc.litros_declarados, vc.litros_confirmados_ecu, vc.diferencia_pct,
          vc.nivel_antes_pct, vc.nivel_despues_pct, vc.resultado, vc.estacion, vc.conductor
        FROM validaciones_carga vc WHERE vc.patente = $1 ORDER BY vc.fecha_carga DESC LIMIT 20
      `, [patente]),
    ]);
    res.json({ adn: adn.rows[0] || null, historial: historial.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Cargas del dia
router.get("/cargas-dia", async (req, res) => {
  try {
    const fecha = (req.query.fecha as string) || new Date().toISOString().slice(0, 10);
    const contrato = (req.query.contrato as string) || "TODOS";
    const cargas = await pool.query(`
      SELECT c.id, c.patente, c.faena as contrato, c.fecha::text, c.litros_surtidor as litros, c.lugar_consumo as estacion, c.conductor,
        vc.resultado, vc.nivel_antes_pct, vc.nivel_despues_pct, vc.litros_confirmados_ecu, vc.diferencia_pct, vc.litros_diferencia,
        adn.rend_promedio, adn.estanque_estimado_litros, adn.confianza as adn_confianza
      FROM cargas c LEFT JOIN validaciones_carga vc ON vc.carga_id = c.id
        LEFT JOIN adn_combustible adn ON adn.patente = c.patente
      WHERE DATE(c.fecha::timestamp) = $1 AND c.litros_surtidor >= 20 AND ($2 = 'TODOS' OR c.faena = $2)
      ORDER BY CASE vc.resultado WHEN 'ALERTA_FRAUDE' THEN 1 WHEN 'CARGA_SIN_SUBIDA' THEN 2 WHEN 'SOSPECHOSO' THEN 3 ELSE 5 END, c.fecha DESC
    `, [fecha, contrato]);
    res.json({ fecha, total: cargas.rows.length, cargas: cargas.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Gestionar
router.post("/gestionar/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, nota } = req.body;
    await pool.query("UPDATE validaciones_carga SET gestionado = true, decision = $1, nota = $2, fecha_gestion = NOW() WHERE id = $3", [decision, nota, id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Ranking camiones
router.get("/ranking-camiones", async (req, res) => {
  try {
    const contrato = (req.query.contrato as string) || "TODOS";
    const r = await pool.query(`
      SELECT vc.patente, vc.contrato, COUNT(*)::int as total,
        COUNT(CASE WHEN resultado = 'OK' THEN 1 END)::int as ok,
        COUNT(CASE WHEN resultado IN ('SOSPECHOSO','ALERTA_FRAUDE','CARGA_SIN_SUBIDA') THEN 1 END)::int as alertas,
        ROUND(SUM(CASE WHEN resultado LIKE 'ALERTA%' THEN ABS(COALESCE(litros_diferencia,0)) ELSE 0 END)::numeric) as litros_sosp,
        adn.rend_promedio, adn.confianza as adn_confianza
      FROM validaciones_carga vc LEFT JOIN adn_combustible adn ON adn.patente = vc.patente
      WHERE vc.resultado NOT IN ('SIN_DATOS_ECU','CARGA_MINIMA_IGNORADA','SIN_VENTANA_ECU')
        AND vc.fecha_carga::timestamp >= NOW() - INTERVAL '30 days' AND ($1 = 'TODOS' OR vc.contrato = $1)
      GROUP BY vc.patente, vc.contrato, adn.rend_promedio, adn.confianza
      ORDER BY alertas DESC
    `, [contrato]);
    res.json({ camiones: r.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;

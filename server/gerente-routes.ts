import { Router } from "express";
import { pool } from "./db";

const router = Router();

router.get("/estado", async (_req, res) => {
  try {
    const [aprendizaje, params, lugares] = await Promise.all([
      pool.query("SELECT tipo, COUNT(*)::int as total, SUM(impacto_viajes)::int as viajes_mejorados FROM gerente_aprendizaje WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY tipo ORDER BY total DESC"),
      pool.query("SELECT clave, valor, descripcion, modificado_por, ultima_modificacion::text FROM sistema_parametros ORDER BY clave"),
      pool.query("SELECT tipo, COUNT(*)::int as total, COUNT(*) FILTER (WHERE confirmado)::int as confirmados FROM lugares_conocidos WHERE activa = true GROUP BY tipo ORDER BY total DESC"),
    ]);
    res.json({ aprendizaje: aprendizaje.rows, parametros: params.rows, lugares: lugares.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/puntos-resueltos", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE origen_nombre IS NOT NULL AND origen_nombre != 'Punto desconocido')::int as origen_ok,
        COUNT(*) FILTER (WHERE destino_nombre IS NOT NULL AND destino_nombre != 'Punto desconocido')::int as destino_ok,
        ROUND(COUNT(*) FILTER (WHERE origen_nombre IS NOT NULL AND origen_nombre != 'Punto desconocido' AND destino_nombre IS NOT NULL AND destino_nombre != 'Punto desconocido')::numeric / NULLIF(COUNT(*),0) * 100, 1) as pct_completamente_resuelto
      FROM viajes_aprendizaje WHERE fecha_inicio >= NOW() - INTERVAL '30 days' AND km_ecu > 20
    `);
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/aprendizaje", async (_req, res) => {
  const r = await pool.query("SELECT * FROM gerente_aprendizaje ORDER BY created_at DESC LIMIT 50");
  res.json({ aprendizaje: r.rows });
});

router.post("/ejecutar", async (_req, res) => {
  try {
    const { agenteGerenteOps } = await import("./agentes/gerente-ops");
    await agenteGerenteOps.ejecutar();
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/parametros/:clave", async (req, res) => {
  const { valor } = req.body;
  await pool.query("UPDATE sistema_parametros SET valor = $1, modificado_por = 'HUMANO', ultima_modificacion = NOW() WHERE clave = $2", [valor, req.params.clave]);
  res.json({ ok: true });
});

export default router;

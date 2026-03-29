import { Router } from "express";
import { pool } from "./db";
import { consultarViajeEnBI, testBIConnection } from "./bi-service";

const router = Router();

// Test connection
router.get("/test", async (_req, res) => {
  const result = await testBIConnection();
  res.json(result);
});

// Validate viaje against BI
router.get("/validar/:viajeId", async (req, res) => {
  const { viajeId } = req.params;
  try {
    const biData = await consultarViajeEnBI(viajeId);
    const { camionId, clienteContrato } = req.query as any;
    let umbrales = null;
    if (camionId && clienteContrato) {
      try {
        const r = await pool.query(
          "SELECT * FROM bi_umbrales WHERE camion_id = $1 AND cliente_contrato = $2 LIMIT 1",
          [camionId, clienteContrato]
        );
        umbrales = r.rows[0] || null;
      } catch { /* table may not exist yet */ }
    }
    res.json({ ok: true, bi: biData, umbrales });
  } catch (err: any) {
    res.json({ ok: false, bi: null, umbrales: null, error: err.message });
  }
});

// Save resolution
router.post("/resolucion", async (req, res) => {
  const { viajeId, camionId, clienteContrato, ruta, towerData, biData, valorReal, fuenteVerdad, notaOperador, resueltoPor } = req.body;
  try {
    await pool.query(`
      INSERT INTO bi_calibraciones (viaje_id, camion_id, cliente_contrato, ruta,
        tower_toneladas, tower_km, tower_combustible, tower_costo,
        bi_toneladas, bi_km, bi_combustible, bi_costo,
        valor_real_toneladas, valor_real_km, valor_real_combustible, valor_real_costo,
        fuente_verdad, nota_operador, resuelto_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
    `, [viajeId, camionId, clienteContrato, ruta,
      towerData?.toneladas, towerData?.km, towerData?.combustible, towerData?.costo,
      biData?.toneladas, biData?.km, biData?.combustible, biData?.costo,
      valorReal?.toneladas, valorReal?.km, valorReal?.combustible, valorReal?.costo,
      fuenteVerdad, notaOperador, resueltoPor]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;

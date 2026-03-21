import { pool } from "./db";

export type ScoreParam = "ANT" | "VEL" | "MOT" | "CMB";

const UMBRALES_EXIGENTES = {
  ANT: {
    excelente:  { max_eventos_100km: 1,  score: 95 },
    bueno:      { max_eventos_100km: 3,  score: 80 },
    aceptable:  { max_eventos_100km: 6,  score: 65 },
    malo:       { max_eventos_100km: 10, score: 45 },
    critico:    { max_eventos_100km: 999, score: 20 },
  },
  VEL: {
    excelente:  { max_pct_exceso: 0,   score: 100 },
    bueno:      { max_pct_exceso: 1,   score: 82 },
    aceptable:  { max_pct_exceso: 3,   score: 65 },
    malo:       { max_pct_exceso: 8,   score: 40 },
    critico:    { max_pct_exceso: 999, score: 15 },
    vel_maxima_absoluta: 110,
    penalizacion_sobre_maxima: 25,
  },
  MOT: {
    excelente:  { max_ralenti_pct: 12, score: 95 },
    bueno:      { max_ralenti_pct: 20, score: 78 },
    aceptable:  { max_ralenti_pct: 28, score: 60 },
    malo:       { max_ralenti_pct: 38, score: 40 },
    critico:    { max_ralenti_pct: 999, score: 20 },
  },
  CMB: {
    excelente:  { min_pct_sobre_meta:  10, score: 100 },
    bueno:      { min_pct_sobre_meta:   0, score: 82 },
    aceptable:  { min_pct_sobre_meta: -10, score: 62 },
    malo:       { min_pct_sobre_meta: -20, score: 40 },
    critico:    { min_pct_sobre_meta: -999, score: 15 },
    penalizacion_tendencia_bajando: 8,
  },
};

export interface ScoreResult {
  score: number;
  fuente: "ADAPTATIVO" | "ESTATICO";
  confianza: string;
  contexto: string;
}

export async function calcularScoreAdaptativo(
  _patente: string,
  contrato: string,
  param: ScoreParam,
  scoreNormalizado: number
): Promise<ScoreResult> {
  try {
    const contratoNorm = normalizarContrato(contrato);
    const result = await pool.query(
      `SELECT * FROM parametros_score_conduccion
       WHERE scope_tipo = 'CONTRATO' AND scope_id = $1 AND parametro = $2
       LIMIT 1`,
      [contratoNorm, param]
    );

    if (result.rows.length > 0 && result.rows[0].total_muestras >= 20) {
      const p = result.rows[0];

      if (scoreNormalizado >= p.p75) {
        var score = 85 + (p.p75 > 0 ? Math.min(15, ((scoreNormalizado - p.p75) / (100 - p.p75 || 1)) * 15) : 15);
      } else if (scoreNormalizado >= p.p50) {
        const range = p.p75 - p.p50;
        var score = 65 + (range > 0 ? ((scoreNormalizado - p.p50) / range) * 20 : 0);
      } else if (scoreNormalizado >= p.p25) {
        const range = p.p50 - p.p25;
        var score = 40 + (range > 0 ? ((scoreNormalizado - p.p25) / range) * 25 : 0);
      } else {
        var score = Math.max(10, 40 * (scoreNormalizado / (p.p25 || 1)));
      }

      score = Math.round(Math.min(100, Math.max(0, score)));

      return {
        score,
        fuente: "ADAPTATIVO",
        confianza: p.confianza || "MEDIA",
        contexto: `Basado en ${p.total_muestras} registros del contrato ${contratoNorm}`,
      };
    }
  } catch (e: any) {
    console.warn("[SCORE] Error buscando params adaptativos:", e.message);
  }

  return {
    score: scoreNormalizado,
    fuente: "ESTATICO",
    confianza: "BAJA",
    contexto: "Calibrando — parametros conservadores",
  };
}

function normalizarContrato(raw: string): string {
  const upper = (raw || "").toUpperCase();
  if (upper.includes("CENCOSUD")) return "CENCOSUD";
  if (upper.includes("CARGAS VARIAS") || upper.includes("CARGAS-VARIAS")) return "ANGLO-CARGAS VARIAS";
  if (upper.includes("COCU")) return "ANGLO-COCU";
  if (upper.includes("CAL") && upper.includes("ANGLO")) return "ANGLO-CAL";
  if (upper.includes("ANGLO")) return "ANGLO-CARGAS VARIAS";
  return upper || "X ASIGNAR";
}

export function calcularScoreEstatico(param: ScoreParam, valor: number): number {
  if (param === "ANT") {
    const u = UMBRALES_EXIGENTES.ANT;
    if (valor <= u.excelente.max_eventos_100km) return u.excelente.score;
    if (valor <= u.bueno.max_eventos_100km)     return u.bueno.score;
    if (valor <= u.aceptable.max_eventos_100km) return u.aceptable.score;
    if (valor <= u.malo.max_eventos_100km)      return u.malo.score;
    return u.critico.score;
  }

  if (param === "VEL") {
    const u = UMBRALES_EXIGENTES.VEL;
    if (valor <= u.excelente.max_pct_exceso) return u.excelente.score;
    if (valor <= u.bueno.max_pct_exceso)     return u.bueno.score;
    if (valor <= u.aceptable.max_pct_exceso) return u.aceptable.score;
    if (valor <= u.malo.max_pct_exceso)      return u.malo.score;
    return u.critico.score;
  }

  if (param === "MOT") {
    const u = UMBRALES_EXIGENTES.MOT;
    if (valor <= u.excelente.max_ralenti_pct) return u.excelente.score;
    if (valor <= u.bueno.max_ralenti_pct)     return u.bueno.score;
    if (valor <= u.aceptable.max_ralenti_pct) return u.aceptable.score;
    if (valor <= u.malo.max_ralenti_pct)      return u.malo.score;
    return u.critico.score;
  }

  if (param === "CMB") {
    const u = UMBRALES_EXIGENTES.CMB;
    if (valor >= u.excelente.min_pct_sobre_meta) return u.excelente.score;
    if (valor >= u.bueno.min_pct_sobre_meta)     return u.bueno.score;
    if (valor >= u.aceptable.min_pct_sobre_meta) return u.aceptable.score;
    if (valor >= u.malo.min_pct_sobre_meta)      return u.malo.score;
    return u.critico.score;
  }

  return 50;
}

export function scoreNivelGlobal(score: number): { nivel: string; color: string } {
  if (score >= 85) return { nivel: "OPTIMO", color: "#00ff88" };
  if (score >= 72) return { nivel: "NORMAL", color: "#00d4ff" };
  if (score >= 58) return { nivel: "REVISAR", color: "#ffcc00" };
  if (score >= 42) return { nivel: "ALERTA", color: "#ff6b35" };
  return { nivel: "CRITICO", color: "#ff2244" };
}

export async function aprenderUmbralesScore(): Promise<void> {
  console.log("[SCORE] Calibrando umbrales adaptativos...");

  try {
    const contratosResult = await pool.query(`SELECT DISTINCT nombre FROM faenas WHERE nombre IS NOT NULL`);
    const contratosRaw = contratosResult.rows.map((r: any) => r.nombre);
    const contratoSet = new Set<string>();
    const contratoToFaenas = new Map<string, string[]>();
    for (const raw of contratosRaw) {
      const norm = normalizarContrato(raw);
      contratoSet.add(norm);
      if (!contratoToFaenas.has(norm)) contratoToFaenas.set(norm, []);
      contratoToFaenas.get(norm)!.push(raw);
    }
    const contratos = Array.from(contratoSet);

    let totalUpdated = 0;

    for (const contrato of contratos) {
      const faenaNames = contratoToFaenas.get(contrato) || [];
      if (faenaNames.length === 0) continue;
      const camionesResult = await pool.query(
        `SELECT c.patente FROM camiones c
         JOIN faenas f ON c.faena_id = f.id
         WHERE f.nombre = ANY($1) AND c.sync_ok = true AND c.patente IS NOT NULL`,
        [faenaNames]
      );

      if (camionesResult.rows.length < 3) continue;

      const patentes = camionesResult.rows.map((r: any) => r.patente);

      for (const param of ["ANT", "VEL", "MOT", "CMB"] as const) {
        const valores = await getValoresHistoricosParam(patentes, param);

        if (valores.length < 20) continue;

        const sorted = [...valores].sort((a, b) => a - b);
        const p25 = sorted[Math.floor(sorted.length * 0.25)];
        const p50 = sorted[Math.floor(sorted.length * 0.50)];
        const p75 = sorted[Math.floor(sorted.length * 0.75)];
        const p90 = sorted[Math.floor(sorted.length * 0.90)];

        const promedio = valores.reduce((s, v) => s + v, 0) / valores.length;
        const desv = Math.sqrt(
          valores.reduce((s, v) => s + (v - promedio) ** 2, 0) / valores.length
        );

        const confianza =
          valores.length >= 200 ? "EXPERTA" :
          valores.length >= 50  ? "ALTA" :
          valores.length >= 20  ? "MEDIA" : "BAJA";

        await pool.query(
          `INSERT INTO parametros_score_conduccion
            (scope_tipo, scope_id, parametro, p25, p50, p75, p90,
             promedio_flota, desviacion_flota, total_muestras, confianza, ultima_actualizacion)
           VALUES ('CONTRATO', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
           ON CONFLICT (scope_tipo, scope_id, parametro)
           DO UPDATE SET
             p25 = EXCLUDED.p25, p50 = EXCLUDED.p50, p75 = EXCLUDED.p75, p90 = EXCLUDED.p90,
             promedio_flota = EXCLUDED.promedio_flota, desviacion_flota = EXCLUDED.desviacion_flota,
             total_muestras = EXCLUDED.total_muestras, confianza = EXCLUDED.confianza,
             ultima_actualizacion = now()`,
          [contrato, param, p25, p50, p75, p90, promedio, desv, valores.length, confianza]
        );
        totalUpdated++;
      }
    }

    console.log(`[SCORE] Calibracion completada: ${totalUpdated} parametros actualizados para ${contratos.length} contratos`);
  } catch (err: any) {
    console.error("[SCORE] Error en calibracion:", err.message);
  }
}

async function getValoresHistoricosParam(patentes: string[], param: ScoreParam): Promise<number[]> {
  const valores: number[] = [];

  try {
    if (param === "VEL") {
      const result = await pool.query(
        `SELECT velocidad_promedio, velocidad_maxima FROM viajes_aprendizaje
         WHERE camion_id IN (SELECT id FROM camiones WHERE patente = ANY($1))
         AND velocidad_promedio IS NOT NULL
         AND fecha_inicio >= NOW() - INTERVAL '30 days'`,
        [patentes]
      );
      for (const row of result.rows) {
        const vMax = parseFloat(row.velocidad_maxima || "0");
        const vProm = parseFloat(row.velocidad_promedio || "0");
        if (vProm > 0) {
          let score = 75;
          if (vMax > 110) score -= 25;
          else if (vMax > 100) score -= 15;
          if (vProm > 90) score -= 15;
          else if (vProm > 80) score -= 5;
          else if (vProm < 70) score += 10;
          valores.push(Math.min(100, Math.max(0, score)));
        }
      }
    } else if (param === "MOT") {
      const result = await pool.query(
        `SELECT c.horas_motor, c.horas_ralenti FROM camiones c
         WHERE c.patente = ANY($1) AND c.horas_motor > 0 AND c.horas_ralenti IS NOT NULL`,
        [patentes]
      );
      for (const row of result.rows) {
        const motor = row.horas_motor || 1;
        const ralenti = row.horas_ralenti || 0;
        const pctRalenti = motor > 0 ? (ralenti / motor) * 100 : 30;
        let score = 80;
        if (pctRalenti > 38) score = 20;
        else if (pctRalenti > 28) score = 40;
        else if (pctRalenti > 20) score = 60;
        else if (pctRalenti > 12) score = 78;
        else score = 95;
        valores.push(score);
      }
    } else if (param === "CMB") {
      const result = await pool.query(
        `SELECT va.rendimiento_real, c.meta_km_l FROM viajes_aprendizaje va
         JOIN camiones c ON va.camion_id = c.id
         WHERE c.patente = ANY($1) AND va.rendimiento_real IS NOT NULL AND va.rendimiento_real > 0
         AND va.fecha_inicio >= NOW() - INTERVAL '30 days'`,
        [patentes]
      );
      for (const row of result.rows) {
        const rend = parseFloat(row.rendimiento_real);
        const meta = parseFloat(row.meta_km_l || "2.1");
        if (rend > 0 && meta > 0) {
          const pctSobreMeta = ((rend - meta) / meta) * 100;
          let score: number;
          if (pctSobreMeta >= 10) score = 100;
          else if (pctSobreMeta >= 0) score = 82;
          else if (pctSobreMeta >= -10) score = 62;
          else if (pctSobreMeta >= -20) score = 40;
          else score = 15;
          valores.push(score);
        }
      }
    } else if (param === "ANT") {
      const result = await pool.query(
        `SELECT va.velocidad_maxima, va.velocidad_promedio
         FROM viajes_aprendizaje va
         JOIN camiones c ON va.camion_id = c.id
         WHERE c.patente = ANY($1) AND va.velocidad_maxima IS NOT NULL
         AND fecha_inicio >= NOW() - INTERVAL '30 days'`,
        [patentes]
      );
      for (const row of result.rows) {
        const vMax = parseFloat(row.velocidad_maxima || "0");
        const vProm = parseFloat(row.velocidad_promedio || "0");
        const diff = vMax - vProm;
        let score = 80;
        if (diff > 40) score = 20;
        else if (diff > 30) score = 45;
        else if (diff > 20) score = 65;
        else if (diff > 10) score = 80;
        else score = 95;
        valores.push(score);
      }
    }
  } catch (e: any) {
    console.warn(`[SCORE] Error obteniendo historico ${param}:`, e.message);
  }

  return valores;
}

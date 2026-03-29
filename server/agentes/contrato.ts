import { pool } from "../db";
import { enviarMensaje } from "./index";

export const agenteContrato = {
  id: "agente-contrato",

  async ejecutar() {
    console.log("[CONTRATO] Analizando contratos...");
    try {
      const hoy = new Date().toISOString().slice(0, 10);

      // Obtener contratos activos (con viajes en últimos 7 días)
      const contratos = await pool.query(`
        SELECT DISTINCT contrato FROM viajes_aprendizaje
        WHERE fecha_inicio >= NOW() - INTERVAL '7 days' AND contrato IS NOT NULL AND km_ecu > 0
        ORDER BY contrato
      `);

      let fichasGeneradas = 0;
      let alertasEnviadas = 0;

      for (const { contrato } of contratos.rows) {
        try {
          const ficha = await this.analizarContrato(contrato, hoy);
          if (ficha) fichasGeneradas++;
          if (ficha?.alertas_enviadas) alertasEnviadas += ficha.alertas_enviadas;
        } catch (e: any) {
          console.error(`[CONTRATO] Error ${contrato}:`, e.message);
        }
      }

      await pool.query("UPDATE agentes SET ultimo_ciclo = NOW(), ciclos_completados = ciclos_completados + 1, errores_consecutivos = 0 WHERE id = $1", [this.id]);
      console.log(`[CONTRATO] ${fichasGeneradas} fichas generadas, ${alertasEnviadas} alertas`);
    } catch (e: any) {
      console.error("[CONTRATO]", e.message);
      await pool.query("UPDATE agentes SET errores_consecutivos = errores_consecutivos + 1 WHERE id = $1", [this.id]);
    }
  },

  async analizarContrato(contrato: string, hoy: string) {
    // ── KPIs del día ──
    const dia = await pool.query(`
      SELECT COUNT(DISTINCT c.patente)::int as camiones, COUNT(*)::int as viajes,
        ROUND(SUM(va.km_ecu)::numeric) as km,
        ROUND(SUM(va.litros_consumidos_ecu) FILTER (WHERE va.litros_consumidos_ecu > 0)::numeric) as litros,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
        COUNT(*) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 2.0)::int as criticos,
        COUNT(*) FILTER (WHERE va.origen_nombre = 'Punto desconocido' OR va.destino_nombre = 'Punto desconocido')::int as desconocidos
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.contrato = $1 AND DATE(va.fecha_inicio) = $2 AND va.km_ecu > 0
    `, [contrato, hoy]);

    const d = dia.rows[0];
    if (!d || d.viajes === 0) return null; // Sin actividad hoy

    // ── Promedio histórico (últimos 30 días) ──
    const hist = await pool.query(`
      SELECT ROUND(AVG(rend_dia)::numeric, 2) as rend_hist,
        ROUND(AVG(viajes_dia)::numeric) as viajes_hist,
        ROUND(AVG(km_dia)::numeric) as km_hist,
        ROUND(AVG(camiones_activos)::numeric) as cam_hist
      FROM contrato_inteligencia
      WHERE contrato = $1 AND fecha >= CURRENT_DATE - 30 AND fecha < CURRENT_DATE
    `, [contrato]);

    const h = hist.rows[0];
    const rendHist = parseFloat(h?.rend_hist) || parseFloat(d.rend) || 0;
    const deltaRend = rendHist > 0 ? Math.round((parseFloat(d.rend || 0) - rendHist) / rendHist * 100) : 0;

    // ── Detectar anomalías ──
    const anomalias: any[] = [];
    let salud = 100;

    // Rendimiento cayendo >15%
    if (deltaRend < -15 && rendHist > 0) {
      anomalias.push({ tipo: "REND_BAJO", desc: `Rendimiento ${d.rend} km/L vs histórico ${rendHist} km/L (${deltaRend}%)`, severidad: deltaRend < -25 ? "ALTA" : "MEDIA" });
      salud -= Math.abs(deltaRend) > 25 ? 25 : 15;
    }

    // Viajes críticos >20% del total
    if (d.criticos > 0 && d.viajes > 3 && d.criticos / d.viajes > 0.2) {
      anomalias.push({ tipo: "CRITICOS", desc: `${d.criticos} de ${d.viajes} viajes con rendimiento crítico (<2.0 km/L)`, severidad: "ALTA" });
      salud -= 20;
    }

    // Muchos puntos desconocidos
    if (d.desconocidos > 3 && d.viajes > 5 && d.desconocidos / d.viajes > 0.3) {
      anomalias.push({ tipo: "GEOCERCAS", desc: `${d.desconocidos} viajes con origen/destino desconocido (${Math.round(d.desconocidos / d.viajes * 100)}%)`, severidad: "MEDIA" });
      salud -= 10;
    }

    // Menos camiones que el histórico (>30% caída)
    const camHist = parseFloat(h?.cam_hist) || 0;
    if (camHist > 3 && d.camiones < camHist * 0.7) {
      anomalias.push({ tipo: "FLOTA_BAJA", desc: `Solo ${d.camiones} camiones vs promedio ${Math.round(camHist)}`, severidad: "MEDIA" });
      salud -= 10;
    }

    salud = Math.max(0, salud);

    // ── Generar resumen ──
    const resumen = `${contrato}: ${d.camiones}cam ${d.viajes}v ${Math.round(d.km || 0)}km ${d.rend || "--"}km/L` +
      (anomalias.length > 0 ? ` | ${anomalias.length} anomalía(s)` : " | OK");

    // ── Guardar ficha ──
    await pool.query(`
      INSERT INTO contrato_inteligencia (contrato, fecha, camiones_activos, viajes_dia, km_dia, litros_dia, rend_dia, rend_historico, delta_rend_pct, viajes_criticos, puntos_desconocidos, anomalias, resumen, salud, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      ON CONFLICT (contrato, fecha) DO UPDATE SET
        camiones_activos = EXCLUDED.camiones_activos, viajes_dia = EXCLUDED.viajes_dia, km_dia = EXCLUDED.km_dia,
        litros_dia = EXCLUDED.litros_dia, rend_dia = EXCLUDED.rend_dia, rend_historico = EXCLUDED.rend_historico,
        delta_rend_pct = EXCLUDED.delta_rend_pct, viajes_criticos = EXCLUDED.viajes_criticos,
        puntos_desconocidos = EXCLUDED.puntos_desconocidos, anomalias = EXCLUDED.anomalias,
        resumen = EXCLUDED.resumen, salud = EXCLUDED.salud, updated_at = NOW()
    `, [contrato, hoy, d.camiones, d.viajes, d.km || 0, d.litros || 0, d.rend || 0, rendHist, deltaRend, d.criticos, d.desconocidos, JSON.stringify(anomalias), resumen, salud]);

    // ── Enviar alertas si hay anomalías graves ──
    let alertas_enviadas = 0;
    const graves = anomalias.filter(a => a.severidad === "ALTA");
    if (graves.length > 0) {
      await enviarMensaje({
        de: this.id, para: "agente-ceo", tipo: "CONTRATO_ALERTA",
        prioridad: "ALTA",
        titulo: `${contrato}: ${graves.length} anomalía(s) grave(s)`,
        contenido: graves.map(a => `• ${a.desc}`).join("\n"),
        datos: { contrato, salud, anomalias: graves }
      });
      alertas_enviadas = graves.length;
    }

    return { contrato, salud, anomalias: anomalias.length, alertas_enviadas };
  },
};

import { pool } from "../db";
import { enviarMensaje } from "./index";

// ═══════════════════════════════════════════════════
// GERENTE GENERAL — Reemplaza al CEO pasivo
// Toma decisiones, prioriza, genera resumen ejecutivo
// ═══════════════════════════════════════════════════

export const agenteGerenteGeneral = {
  id: "agente-gerente-general",

  async ejecutar() {
    try {
      // 1. Leer todos los mensajes no procesados
      const msgs = await pool.query(`
        SELECT m.*, a.nombre as nombre_agente
        FROM agente_mensajes m LEFT JOIN agentes a ON a.id = m.de_agente
        WHERE m.para_agente = $1 AND m.leido = false AND m.created_at >= NOW() - INTERVAL '24 hours'
        ORDER BY CASE m.prioridad WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 ELSE 3 END, m.created_at DESC
      `, [this.id]);

      const criticos = msgs.rows.filter((m: any) => m.prioridad === "CRITICA");
      const altos = msgs.rows.filter((m: any) => m.prioridad === "ALTA");
      const normales = msgs.rows.filter((m: any) => m.prioridad === "NORMAL");

      // 2. Procesar críticos: marcar como leídos y registrar decisión
      for (const m of criticos) {
        await pool.query("UPDATE agente_mensajes SET leido = true WHERE id = $1", [m.id]);
        // Registrar que se procesó
        try {
          await pool.query("INSERT INTO gerente_decisiones (tipo, descripcion, contexto, exito, impacto_score) VALUES ($1,$2,$3,$4,$5)",
            ["CRITICO_PROCESADO", `${m.nombre_agente}: ${m.titulo}`, JSON.stringify({ de: m.de_agente, tipo: m.tipo, prioridad: m.prioridad }), true, 1.0]);
        } catch {}
      }

      // 3. Generar resumen ejecutivo diario (una vez al día, después de las 7am)
      const hora = new Date().getHours();
      if (hora >= 7 && hora <= 8) {
        await this.generarResumenEjecutivo();
      }

      // 4. Evaluar salud general y decidir acciones
      const salud = await this.evaluarSaludGeneral();

      // 5. Si hay problemas graves, enviar directiva a Gerente Ops
      if (salud.nivel === "CRITICO") {
        await enviarMensaje({
          de: this.id, para: "agente-gerente-ops", tipo: "DIRECTIVA",
          prioridad: "CRITICA",
          titulo: `DIRECTIVA: ${salud.problemas.length} problemas críticos requieren acción`,
          contenido: salud.problemas.join("\n"),
          datos: salud
        });
      }

      await pool.query("UPDATE agentes SET ultimo_ciclo = NOW(), ciclos_completados = ciclos_completados + 1, errores_consecutivos = 0 WHERE id = $1", [this.id]);

      if (criticos.length > 0 || altos.length > 0) {
        console.log(`[GERENTE-GRAL] ${criticos.length} críticos, ${altos.length} altos, ${normales.length} normales procesados`);
      }
    } catch (e: any) {
      console.error("[GERENTE-GRAL]", e.message);
      await pool.query("UPDATE agentes SET errores_consecutivos = errores_consecutivos + 1 WHERE id = $1", [this.id]);
    }
  },

  async evaluarSaludGeneral() {
    const [agentes, flota, viajes, contratos] = await Promise.all([
      pool.query("SELECT id, estado, errores_consecutivos, ultimo_ciclo FROM agentes WHERE estado = 'ACTIVO'"),
      pool.query("SELECT COUNT(DISTINCT patente) FILTER (WHERE minutos_desde_ultimo < 120)::int as activos, COUNT(DISTINCT patente)::int as total FROM ultima_posicion_camion"),
      pool.query("SELECT COUNT(*)::int as hoy FROM viajes_aprendizaje WHERE DATE(fecha_inicio) = CURRENT_DATE AND km_ecu > 0"),
      pool.query("SELECT COUNT(DISTINCT contrato)::int as activos FROM contrato_inteligencia WHERE fecha = CURRENT_DATE"),
    ]);

    const problemas: string[] = [];
    let nivel = "OK";

    // Agentes con errores
    const agentesConError = agentes.rows.filter((a: any) => a.errores_consecutivos > 3);
    if (agentesConError.length > 0) {
      problemas.push(`${agentesConError.length} agentes con errores consecutivos: ${agentesConError.map((a: any) => a.id).join(", ")}`);
      nivel = "ALTO";
    }

    // Flota
    const f = flota.rows[0];
    const pctActivo = f.total > 0 ? f.activos / f.total * 100 : 0;
    if (pctActivo < 10 && new Date().getHours() >= 8 && new Date().getHours() <= 20) {
      problemas.push(`Solo ${f.activos}/${f.total} camiones con GPS activo (${Math.round(pctActivo)}%)`);
      nivel = "CRITICO";
    }

    // Viajes
    if (viajes.rows[0].hoy < 10 && new Date().getHours() > 12) {
      problemas.push(`Solo ${viajes.rows[0].hoy} viajes detectados hoy — posible falla en detección`);
      nivel = "ALTO";
    }

    return { nivel, problemas, flota: f, viajes_hoy: viajes.rows[0].hoy, contratos_activos: contratos.rows[0].activos };
  },

  async generarResumenEjecutivo() {
    // Verificar que no se generó ya hoy
    const yaGenerado = await pool.query(`SELECT id FROM agente_mensajes WHERE de_agente = $1 AND tipo = 'RESUMEN_EJECUTIVO' AND DATE(created_at) = CURRENT_DATE`, [this.id]);
    if (yaGenerado.rows.length > 0) return;

    const [flota, viajes, alertas, contratos] = await Promise.all([
      pool.query("SELECT COUNT(DISTINCT patente) FILTER (WHERE minutos_desde_ultimo < 120)::int as activos, COUNT(DISTINCT patente)::int as total FROM ultima_posicion_camion"),
      pool.query(`SELECT COUNT(*)::int as ayer, ROUND(AVG(rendimiento_real) FILTER (WHERE rendimiento_real > 0 AND rendimiento_real < 10)::numeric, 2) as rend,
        ROUND(SUM(km_ecu)::numeric) as km FROM viajes_aprendizaje WHERE DATE(fecha_inicio) = CURRENT_DATE - 1 AND km_ecu > 0`),
      pool.query("SELECT COUNT(*)::int as pendientes FROM agente_mensajes WHERE leido = false AND prioridad IN ('CRITICA','ALTA') AND created_at >= NOW() - INTERVAL '24 hours'"),
      pool.query("SELECT contrato, salud, viajes_dia, km_dia::float FROM contrato_inteligencia WHERE fecha = CURRENT_DATE - 1 ORDER BY km_dia DESC"),
    ]);

    const f = flota.rows[0];
    const v = viajes.rows[0];

    const resumen = [
      `RESUMEN EJECUTIVO SOTRASER`,
      `Flota: ${f.activos}/${f.total} GPS activos`,
      `Ayer: ${v.ayer} viajes, ${Math.round(v.km || 0).toLocaleString()} km, ${v.rend || "--"} km/L`,
      `Alertas pendientes: ${alertas.rows[0].pendientes}`,
      `Contratos activos: ${contratos.rows.length}`,
      contratos.rows.length > 0 ? `Top: ${contratos.rows.slice(0, 3).map((c: any) => `${c.contrato}(${c.viajes_dia}v)`).join(", ")}` : "",
    ].filter(Boolean).join("\n");

    // Este mensaje es para que el usuario lo vea en el panel
    await enviarMensaje({
      de: this.id, para: this.id, tipo: "RESUMEN_EJECUTIVO",
      prioridad: "NORMAL",
      titulo: `Resumen ${new Date().toLocaleDateString("es-CL")}`,
      contenido: resumen,
      datos: { flota: f, viajes: v, alertas: alertas.rows[0].pendientes }
    });
  },
};

import { pool } from "../db";
import { enviarMensaje } from "./index";

// ═══════════════════════════════════════════════════
// AGENTE OPERACIONES — Fusión de Monitor+Analista+Gestor
// Detecta, analiza Y actúa en un solo ciclo
// ═══════════════════════════════════════════════════

export const agenteOperaciones = {
  id: "agente-operaciones",

  async ejecutar() {
    try {
      const alertas: any[] = [];
      let acciones = 0;

      // ── DETECTAR (ex-Monitor) ──
      const [vel, rend, sinGps, atrasos] = await Promise.all([
        pool.query(`SELECT c.patente, va.contrato, ROUND(MAX(va.velocidad_maxima)::numeric) as vel_max
          FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
          WHERE va.velocidad_maxima > 100 AND va.fecha_inicio >= NOW() - INTERVAL '2 hours' AND va.km_ecu > 0
          GROUP BY c.patente, va.contrato ORDER BY vel_max DESC LIMIT 10`),
        pool.query(`SELECT c.patente, va.contrato, ROUND(AVG(va.rendimiento_real)::numeric, 2) as rend, COUNT(*)::int as viajes
          FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
          WHERE DATE(va.fecha_inicio) = CURRENT_DATE AND va.rendimiento_real > 0 AND va.rendimiento_real < 2.0 AND va.km_ecu > 50
          GROUP BY c.patente, va.contrato ORDER BY rend LIMIT 10`),
        pool.query(`SELECT COUNT(*)::int as n FROM ultima_posicion_camion WHERE minutos_desde_ultimo > 120`),
        // Viajes muy largos (posible atraso en entrega)
        pool.query(`SELECT c.patente, va.contrato, va.origen_nombre, va.destino_nombre,
          va.duracion_minutos::int as duracion, va.km_ecu::float as km
          FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
          WHERE va.fecha_inicio >= NOW() - INTERVAL '4 hours' AND va.duracion_minutos > 480 AND va.km_ecu > 100
          ORDER BY va.duracion_minutos DESC LIMIT 5`),
      ]);

      // ── ANALIZAR Y DECIDIR (ex-Analista) ──
      if (vel.rows.length > 0) {
        const criticos = vel.rows.filter((v: any) => v.vel_max > 110);
        alertas.push({
          tipo: "VELOCIDAD", severidad: criticos.length > 0 ? "CRITICA" : "ALTA",
          titulo: `${vel.rows.length} excesos velocidad (máx ${vel.rows[0].vel_max}km/h)`,
          detalle: vel.rows.map((v: any) => `${v.patente} ${v.vel_max}km/h [${v.contrato}]`).join(", "),
          accion: criticos.length > 0 ? "Notificar supervisor INMEDIATO" : "Registrar y monitorear",
          datos: vel.rows
        });
      }

      if (rend.rows.length > 0) {
        alertas.push({
          tipo: "RENDIMIENTO", severidad: rend.rows.length > 5 ? "ALTA" : "NORMAL",
          titulo: `${rend.rows.length} camiones con rendimiento crítico (<2.0 km/L)`,
          detalle: rend.rows.map((r: any) => `${r.patente} ${r.rend}km/L ${r.viajes}v [${r.contrato}]`).join(", "),
          accion: "Revisar mantención y condiciones de ruta",
          datos: rend.rows
        });
      }

      const gpsPerdidos = parseInt(sinGps.rows[0].n);
      if (gpsPerdidos > 100) {
        alertas.push({
          tipo: "GPS", severidad: gpsPerdidos > 300 ? "ALTA" : "NORMAL",
          titulo: `${gpsPerdidos} camiones sin señal GPS >2h`,
          detalle: `Posible: horario nocturno, zona sin cobertura, o falla de antena`,
          accion: gpsPerdidos > 300 ? "Verificar conectividad WiseTrack" : "Monitorear",
          datos: { sin_gps: gpsPerdidos }
        });
      }

      if (atrasos.rows.length > 0) {
        alertas.push({
          tipo: "ATRASO", severidad: "ALTA",
          titulo: `${atrasos.rows.length} viajes con duración excesiva (>8h)`,
          detalle: atrasos.rows.map((a: any) => `${a.patente} ${a.duracion}min ${a.origen_nombre}→${a.destino_nombre}`).join(", "),
          accion: "Verificar estado del conductor y ETA",
          datos: atrasos.rows
        });
      }

      // ── ACTUAR (ex-Gestor) ──
      // Auto-cerrar alertas no críticas >8h
      const autoCerradas = await pool.query(`
        UPDATE alertas_aprendizaje SET gestionado = true, decision = 'AUTO_OPS'
        WHERE gestionado = false AND fecha < NOW() - INTERVAL '8 hours'
          AND tipo NOT IN ('VELOCIDAD', 'COMBUSTIBLE_FRAUDE')
        RETURNING id
      `);
      acciones += autoCerradas.rowCount || 0;

      // Escalar alertas críticas >2h sin gestionar
      const escalaciones = await pool.query(`
        SELECT id, tipo, contrato, EXTRACT(EPOCH FROM (NOW() - fecha))/3600 as horas
        FROM alertas_aprendizaje WHERE gestionado = false AND fecha >= NOW() - INTERVAL '24 hours'
          AND tipo IN ('VELOCIDAD', 'COMBUSTIBLE_FRAUDE')
          AND EXTRACT(EPOCH FROM (NOW() - fecha))/3600 > 2
        LIMIT 5
      `);

      if (escalaciones.rows.length > 0) {
        alertas.push({
          tipo: "ESCALACION", severidad: "CRITICA",
          titulo: `${escalaciones.rows.length} alertas críticas sin gestionar >2h`,
          detalle: escalaciones.rows.map((e: any) => `${e.tipo} ${e.contrato} (${Math.round(e.horas)}h)`).join(", "),
          accion: "Requiere intervención humana",
          datos: escalaciones.rows
        });
      }

      // ── REPORTAR al Gerente General ──
      for (const a of alertas) {
        await enviarMensaje({
          de: this.id, para: "agente-gerente-general", tipo: a.tipo,
          prioridad: a.severidad,
          titulo: a.titulo,
          contenido: `${a.detalle}\n\nAcción: ${a.accion}`,
          datos: a.datos
        });
      }

      await pool.query("UPDATE agentes SET ultimo_ciclo = NOW(), ciclos_completados = ciclos_completados + 1, errores_consecutivos = 0 WHERE id = $1", [this.id]);
      console.log(`[OPERACIONES] ${alertas.length} alertas, ${acciones} acciones automáticas`);
    } catch (e: any) {
      console.error("[OPERACIONES]", e.message);
      await pool.query("UPDATE agentes SET errores_consecutivos = errores_consecutivos + 1 WHERE id = $1", [this.id]);
    }
  }
};

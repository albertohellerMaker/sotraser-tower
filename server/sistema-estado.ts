import { pool } from "./db";

export interface SistemaEstado {
  dias_aprendiendo: number;
  total_viajes_procesados: number;
  total_corredores_conocidos: number;
  total_conductores_analizados: number;
  total_camiones_perfilados: number;
  total_snapshots_volvo: number;
  alertas_patron_activas: number;
  parametros_calibrados: number;
  confianza_global: string;
  madurez_pct: number;
  alertas_recientes: any[];
  primer_dato: string | null;
  estado_mensaje: string;
  timestamp: string;
}

let estadoCache: { data: SistemaEstado; timestamp: number } | null = null;
const CACHE_TTL = 60_000;

export async function getSistemaEstado(): Promise<SistemaEstado> {
  if (estadoCache && Date.now() - estadoCache.timestamp < CACHE_TTL) {
    return estadoCache.data;
  }

  try {
    const primerSnapshotR = await pool.query(`
      SELECT captured_at FROM volvo_fuel_snapshots ORDER BY captured_at ASC LIMIT 1
    `);

    const primerViajeR = await pool.query(`
      SELECT fecha_inicio FROM viajes_aprendizaje ORDER BY fecha_inicio ASC LIMIT 1
    `);

    const primerFecha = primerSnapshotR.rows[0]?.captured_at || primerViajeR.rows[0]?.fecha_inicio || null;
    const diasAprendiendo = primerFecha
      ? Math.floor((Date.now() - new Date(primerFecha).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const [totalViajesR, totalCorredoresR, totalConductoresR, totalCamionesR, totalSnapshotsR, alertasActivasR, parametrosAltaR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int as count FROM viajes_aprendizaje`),
      pool.query(`SELECT COUNT(*)::int as count FROM corredores WHERE total_viajes_base >= 3`),
      pool.query(`SELECT COUNT(*)::int as count FROM conductores_perfil`),
      pool.query(`SELECT COUNT(*)::int as count FROM camiones_perfil`),
      pool.query(`SELECT COUNT(*)::int as count FROM volvo_fuel_snapshots`),
      pool.query(`SELECT COUNT(*)::int as count FROM alertas_aprendizaje WHERE gestionado = false`),
      pool.query(`SELECT COUNT(*)::int as count FROM parametros_adaptativos WHERE confianza IN ('ALTA', 'EXPERTA')`),
    ]);

    const totalViajes = totalViajesR.rows[0]?.count || 0;
    const totalCorredores = totalCorredoresR.rows[0]?.count || 0;
    const totalConductores = totalConductoresR.rows[0]?.count || 0;
    const totalCamiones = totalCamionesR.rows[0]?.count || 0;
    const totalSnapshots = totalSnapshotsR.rows[0]?.count || 0;
    const alertasActivas = alertasActivasR.rows[0]?.count || 0;
    const parametrosCal = parametrosAltaR.rows[0]?.count || 0;

    const confianzaGlobal =
      totalViajes >= 1000 ? "EXPERTA" :
      totalViajes >= 200 ? "ALTA" :
      totalViajes >= 50 ? "MEDIA" : "BAJA";

    const madurez = Math.min(100, Math.floor(
      Math.min(diasAprendiendo * 2, 40) +
      Math.min(totalViajes / 10, 40) +
      Math.min(totalCorredores * 2, 20)
    ));

    const alertasR = await pool.query(`
      SELECT * FROM alertas_aprendizaje
      WHERE gestionado = false
      ORDER BY fecha DESC LIMIT 5
    `);

    const estado: SistemaEstado = {
      dias_aprendiendo: diasAprendiendo,
      total_viajes_procesados: totalViajes,
      total_corredores_conocidos: totalCorredores,
      total_conductores_analizados: totalConductores,
      total_camiones_perfilados: totalCamiones,
      total_snapshots_volvo: totalSnapshots,
      alertas_patron_activas: alertasActivas,
      parametros_calibrados: parametrosCal,
      confianza_global: confianzaGlobal,
      madurez_pct: madurez,
      alertas_recientes: alertasR.rows,
      primer_dato: primerFecha ? new Date(primerFecha).toISOString() : null,
      estado_mensaje: generarMensajeEstado(diasAprendiendo, totalViajes, confianzaGlobal),
      timestamp: new Date().toISOString(),
    };

    estadoCache = { data: estado, timestamp: Date.now() };
    console.log("[SISTEMA-ESTADO] Estado calculado:", {
      dias: diasAprendiendo, viajes: totalViajes, corredores: totalCorredores,
      confianza: confianzaGlobal, madurez
    });
    return estado;
  } catch (error: any) {
    console.error("[SISTEMA-ESTADO] Error:", error.message);
    throw error;
  }
}

function generarMensajeEstado(dias: number, viajes: number, confianza: string): string {
  if (dias === 0) return "Sistema iniciando — recopilando primeros datos de Volvo Connect";
  if (confianza === "BAJA") return `${dias} dias activo con ${viajes} viajes — acumulando datos para calibrar parametros`;
  if (confianza === "MEDIA") return `${dias} dias activo — ${viajes} viajes procesados, parametros tomando forma por contrato`;
  if (confianza === "ALTA") return `Sistema calibrado — ${viajes} viajes analizados en ${dias} dias, deteccion confiable activa`;
  return `Sistema experto — modelo altamente preciso con ${viajes} viajes en ${dias} dias`;
}

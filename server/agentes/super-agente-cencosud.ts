import { pool } from "../db";

async function getParams(): Promise<Record<string, number>> {
  const r = await pool.query("SELECT clave, valor::float as valor FROM cencosud_parametros");
  const p: Record<string, number> = {};
  r.rows.forEach((row: any) => { p[row.clave] = row.valor; });
  return p;
}

async function guardarMensaje(tipo: string, prioridad: string, titulo: string, contenido: string, datos: any = {}) {
  await pool.query("INSERT INTO cencosud_agente_mensajes (tipo, prioridad, titulo, contenido, datos) VALUES ($1,$2,$3,$4,$5)", [tipo, prioridad, titulo, contenido, JSON.stringify(datos)]);
}

export const superAgenteCencosud = {
  id: "super-agente-cencosud",

  async iniciar() {
    console.log("[SUPER-CENCOSUD] Iniciando...");
    // Ciclo cada 30 min
    setInterval(async () => { try { await this.ejecutarCiclo(); } catch (e: any) { console.error("[SUPER-CENCOSUD]", e.message); } }, 30 * 60 * 1000);
    // Primer ciclo en 20s
    setTimeout(async () => { try { await this.ejecutarCiclo(); } catch (e: any) { console.error("[SUPER-CENCOSUD]", e.message); } }, 20000);
  },

  async ejecutarCiclo() {
    console.log("[SUPER-CENCOSUD] Ciclo...");
    try {
      await Promise.allSettled([
        this.monitorearOperacion(),
        this.analizarFinanciero(),
        this.detectarAnomalias(),
        this.verificarMetas(),
        this.analizarConductores(),
      ]);
      await pool.query("UPDATE cencosud_agente_estado SET ultimo_ciclo = NOW(), ciclos_hoy = ciclos_hoy + 1, updated_at = NOW() WHERE id = 1");
      console.log("[SUPER-CENCOSUD] Ciclo OK");
    } catch (e: any) { console.error("[SUPER-CENCOSUD] Error:", e.message); }
  },

  // ── MONITOREO OPERACIÓN ──
  async monitorearOperacion() {
    const params = await getParams();
    const hoy = new Date().toISOString().slice(0, 10);
    const activos = await pool.query(`
      SELECT COUNT(DISTINCT c.patente)::int as total, COUNT(*)::int as viajes,
        ROUND(SUM(va.km_ecu)::numeric) as km_total,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend_prom
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE DATE(va.fecha_inicio) = $1 AND va.contrato = 'CENCOSUD' AND va.km_ecu > 0
    `, [hoy]);
    const a = activos.rows[0];
    const kmTotal = parseFloat(a.km_total || 0);
    const camiones = parseInt(a.total || 0);
    const metaDia = params.meta_km_dia * camiones;

    if (metaDia > 0 && kmTotal < metaDia * 0.6 && camiones > 0 && new Date().getHours() >= 14) {
      const pctMeta = Math.round(kmTotal / metaDia * 100);
      await guardarMensaje("OPERACION", pctMeta < 40 ? "ALTA" : "NORMAL",
        `Operación al ${pctMeta}% de la meta diaria`,
        `${camiones} camiones, ${kmTotal.toLocaleString()} km. Meta: ${metaDia.toLocaleString()} km. ${a.viajes} viajes.`,
        { camiones, km: kmTotal, meta: metaDia, pct: pctMeta });
    }
  },

  // ── ANÁLISIS FINANCIERO ──
  async analizarFinanciero() {
    const params = await getParams();
    const hoy = new Date().toISOString().slice(0, 10);
    const retornoFactor = 1 + params.pct_retorno / 100;

    const viajes = await pool.query(`
      SELECT c.patente, ROUND(SUM(va.km_ecu)::numeric) as km,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend,
        COUNT(*)::int as viajes
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE DATE(va.fecha_inicio) = $1 AND va.contrato = 'CENCOSUD' AND va.km_ecu > 0
      GROUP BY c.patente
    `, [hoy]);

    for (const v of viajes.rows) {
      const km = parseFloat(v.km || 0) * retornoFactor;
      const rend = parseFloat(v.rend || params.meta_rendimiento);
      const litros = km / Math.max(rend, 0.1);
      const costoDiesel = litros * params.precio_diesel;
      const costoVar = km * params.cvm_km;
      const costoTotal = costoDiesel + costoVar + params.costo_conductor_dia + params.costo_fijo_dia;
      const ingreso = km * params.tarifa_km_cargado;
      const margen = ingreso - costoTotal;
      const margenPct = ingreso > 0 ? margen / ingreso * 100 : 0;

      if (margenPct < params.alerta_margen_minimo && km > 50) {
        await guardarMensaje("FINANCIERO", margenPct < 0 ? "CRITICA" : "ALTA",
          `Margen bajo: ${v.patente} al ${Math.round(margenPct)}%`,
          `${v.patente}: ${Math.round(km)} km | Ingreso: $${Math.round(ingreso).toLocaleString()} | Costo: $${Math.round(costoTotal).toLocaleString()} | Margen: $${Math.round(margen).toLocaleString()} (${Math.round(margenPct)}%)`,
          { patente: v.patente, km, rend, ingreso, costo: costoTotal, margen, margenPct: Math.round(margenPct) });
      }
    }
  },

  // ── ANOMALÍAS ──
  async detectarAnomalias() {
    const params = await getParams();
    // Rendimiento crítico
    const rendBajo = await pool.query(`
      SELECT c.patente, ROUND(AVG(va.rendimiento_real)::numeric, 2) as rend, COUNT(*)::int as viajes, MAX(va.conductor) as conductor
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.fecha_inicio >= NOW() - INTERVAL '48 hours' AND va.contrato = 'CENCOSUD' AND va.rendimiento_real > 0 AND va.rendimiento_real < 10 AND va.km_ecu > 30
      GROUP BY c.patente HAVING AVG(va.rendimiento_real) < $1
    `, [params.alerta_rendimiento_critico]);

    for (const c of rendBajo.rows) {
      await guardarMensaje("ANOMALIA", parseFloat(c.rend) < 2.0 ? "CRITICA" : "ALTA",
        `Rendimiento crítico: ${c.patente} - ${c.rend} km/L`,
        `${c.patente} con ${c.rend} km/L en 48h. Conductor: ${c.conductor || "?"}. ${c.viajes} viajes.`, c);
    }

    // Camiones inactivos
    const inactivos = await pool.query(`
      SELECT c.patente, MAX(va.fecha_inicio)::text as ultimo, EXTRACT(DAY FROM NOW() - MAX(va.fecha_inicio))::int as dias
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.contrato = 'CENCOSUD' AND va.km_ecu > 0 AND va.fecha_inicio >= NOW() - INTERVAL '30 days'
      GROUP BY c.patente HAVING MAX(va.fecha_inicio) < NOW() - ($1 || ' days')::interval
    `, [params.alerta_dias_inactivo]);

    for (const c of inactivos.rows) {
      await guardarMensaje("INACTIVIDAD", "NORMAL",
        `Camión inactivo: ${c.patente} - ${c.dias} días`, `Sin viajes hace ${c.dias} días. Último: ${c.ultimo?.slice(0, 10)}`, c);
    }
  },

  // ── VERIFICAR METAS ──
  async verificarMetas() {
    const params = await getParams();
    const dia = new Date().getDate();
    const diasMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

    const proy = await pool.query(`
      SELECT ROUND(SUM(km_dia)::numeric) as acum, ROUND(AVG(km_dia)::numeric) as prom_dia FROM (
        SELECT DATE(va.fecha_inicio), SUM(va.km_ecu) as km_dia
        FROM viajes_aprendizaje va WHERE va.fecha_inicio >= DATE_TRUNC('month', NOW()) AND va.contrato = 'CENCOSUD' AND va.km_ecu > 0
        GROUP BY DATE(va.fecha_inicio)
      ) d
    `);
    const p = proy.rows[0];
    if (!p.acum) return;
    const acum = parseFloat(p.acum);
    const promDia = parseFloat(p.prom_dia || 0);
    const proyectado = acum + promDia * (diasMes - dia);
    const meta = params.meta_km_mes;
    const pctMeta = Math.round(acum / meta * 100);
    const pctEsperado = Math.round(dia / diasMes * 100);

    if (pctMeta < pctEsperado - 15 && dia > 5) {
      await guardarMensaje("META", pctMeta < pctEsperado - 25 ? "ALTA" : "NORMAL",
        `Meta mensual en riesgo: ${pctMeta}% (esperado ${pctEsperado}%)`,
        `Acumulado: ${acum.toLocaleString()} km de ${meta.toLocaleString()} km. Proyección: ${Math.round(proyectado).toLocaleString()} km. ${diasMes - dia} días restantes.`,
        { acum, proyectado: Math.round(proyectado), meta, pctMeta, pctEsperado });
    }
  },

  // ── CONDUCTORES ──
  async analizarConductores() {
    const conductores = await pool.query(`
      SELECT va.conductor, COUNT(DISTINCT c.patente)::int as camiones, COUNT(*)::int as viajes,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= NOW() - INTERVAL '7 days' AND va.conductor IS NOT NULL AND va.conductor != '' AND va.km_ecu > 30
      GROUP BY va.conductor HAVING COUNT(*) >= 3 ORDER BY rend ASC LIMIT 5
    `);
    const peor = conductores.rows[0];
    if (peor && parseFloat(peor.rend) < 2.3) {
      await guardarMensaje("CONDUCTOR", "NORMAL",
        `Conductor bajo rendimiento: ${peor.conductor} - ${peor.rend} km/L`,
        `${peor.conductor}: ${peor.rend} km/L en ${peor.viajes} viajes, ${peor.camiones} camiones.`, peor);
    }
  },

  // ── CHAT IA ──
  async chat(mensaje: string): Promise<string> {
    try {
      const params = await getParams();
      const hoy = new Date().toISOString().slice(0, 10);
      const retornoFactor = 1 + params.pct_retorno / 100;

      const ctx = await pool.query(`
        SELECT COUNT(DISTINCT c.patente)::int as camiones, COUNT(*)::int as viajes,
          ROUND(SUM(va.km_ecu)::numeric) as km, ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
        FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
        WHERE DATE(va.fecha_inicio) = $1 AND va.contrato = 'CENCOSUD' AND va.km_ecu > 0
      `, [hoy]);
      const c = ctx.rows[0];
      const km = parseFloat(c.km || 0) * retornoFactor;
      const ingreso = km * params.tarifa_km_cargado;
      const litros = km / Math.max(parseFloat(c.rend || 3), 0.1);
      const costo = litros * params.precio_diesel + km * params.cvm_km + parseInt(c.camiones || 0) * (params.costo_conductor_dia + params.costo_fijo_dia);
      const margen = ingreso - costo;

      const hist = await pool.query("SELECT rol, mensaje FROM cencosud_agente_chat ORDER BY created_at DESC LIMIT 8");
      await pool.query("INSERT INTO cencosud_agente_chat (rol, mensaje) VALUES ('CEO', $1)", [mensaje]);

      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const resp = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514", max_tokens: 400,
        system: `Eres el Super Agente del contrato Cencosud de Sotraser S.A. Respondes en español, directo, con números reales. Max 150 palabras.
DATOS HOY ${hoy}: ${c.camiones} camiones, ${c.viajes} viajes, ${Math.round(km).toLocaleString()} km (con retorno), ${c.rend} km/L
Ingreso: $${Math.round(ingreso).toLocaleString()} | Costo: $${Math.round(costo).toLocaleString()} | Margen: $${Math.round(margen).toLocaleString()} (${Math.round(margen / Math.max(ingreso, 1) * 100)}%)
PARAMS: Diesel $${params.precio_diesel}/L, CVM $${params.cvm_km}/km, Tarifa $${params.tarifa_km_cargado}/km, Meta ${params.meta_km_mes.toLocaleString()} km/mes`,
        messages: [...hist.rows.reverse().map((h: any) => ({ role: h.rol === "CEO" ? "user" as const : "assistant" as const, content: h.mensaje })), { role: "user" as const, content: mensaje }],
      });

      const texto = resp.content[0].type === "text" ? resp.content[0].text : "Error.";
      await pool.query("INSERT INTO cencosud_agente_chat (rol, mensaje) VALUES ('AGENTE', $1)", [texto]);
      return texto;
    } catch (e: any) {
      console.error("[SUPER-CENCOSUD] Chat:", e.message);
      return "Error al procesar consulta.";
    }
  },
};

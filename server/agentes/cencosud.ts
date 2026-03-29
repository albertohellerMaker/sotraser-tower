import { pool } from "../db";
import { enviarMensaje } from "./index";

export const agenteCencosud = {
  id: "agente-cencosud",

  async ejecutar() {
    console.log("[CENCOSUD] Analizando contrato...");
    try {
      const hoy = new Date().toISOString().slice(0, 10);

      // 1. Cruzar viajes con tarifas via alias
      const cruce = await this.cruzarRutasTarifas(hoy);

      // 2. Detectar geocercas sin mapear y sugerir alias
      await this.sugerirAlias();

      // 3. Calcular productividad por zona
      const prod = await this.calcularProductividad();

      // 4. Guardar ficha diaria en contrato_inteligencia
      await this.guardarFicha(hoy, cruce, prod);

      await pool.query("UPDATE agentes SET ultimo_ciclo = NOW(), ciclos_completados = ciclos_completados + 1, errores_consecutivos = 0 WHERE id = $1", [this.id]);
      console.log(`[CENCOSUD] Ciclo OK: ${cruce.matcheados}/${cruce.total} viajes cruzados, ingreso $${Math.round(cruce.ingreso).toLocaleString()}`);
    } catch (e: any) {
      console.error("[CENCOSUD]", e.message);
      await pool.query("UPDATE agentes SET errores_consecutivos = errores_consecutivos + 1 WHERE id = $1", [this.id]);
    }
  },

  async cruzarRutasTarifas(fecha: string) {
    // Viajes Cencosud del día con intento de cruce via alias
    const viajes = await pool.query(`
      SELECT va.id, va.origen_nombre, va.destino_nombre, va.km_ecu,
        ao.nombre_contrato as origen_contrato,
        ad.nombre_contrato as destino_contrato,
        crt.tarifa, crt.lote, crt.clase
      FROM viajes_aprendizaje va
      LEFT JOIN geocerca_alias_contrato ao ON ao.geocerca_nombre = va.origen_nombre AND ao.contrato = 'CENCOSUD'
      LEFT JOIN geocerca_alias_contrato ad ON ad.geocerca_nombre = va.destino_nombre AND ad.contrato = 'CENCOSUD'
      LEFT JOIN contrato_rutas_tarifas crt ON crt.origen = ao.nombre_contrato AND crt.destino = ad.nombre_contrato AND crt.contrato = 'CENCOSUD' AND crt.activo = true
      WHERE va.contrato = 'CENCOSUD' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
    `, [fecha]);

    let matcheados = 0, ingreso = 0;
    for (const v of viajes.rows) {
      if (v.tarifa) { matcheados++; ingreso += v.tarifa; }
    }

    return { total: viajes.rows.length, matcheados, ingreso, pct: viajes.rows.length > 0 ? Math.round(matcheados / viajes.rows.length * 100) : 0 };
  },

  async sugerirAlias() {
    // Buscar nombres de geocerca en viajes Cencosud que no tienen alias
    const sinAlias = await pool.query(`
      SELECT DISTINCT va.origen_nombre as nombre, 'ORIGEN' as tipo, COUNT(*)::int as viajes
      FROM viajes_aprendizaje va
      LEFT JOIN geocerca_alias_contrato gac ON gac.geocerca_nombre = va.origen_nombre AND gac.contrato = 'CENCOSUD'
      WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= NOW() - INTERVAL '7 days'
        AND va.origen_nombre IS NOT NULL AND va.origen_nombre != 'Punto desconocido'
        AND gac.id IS NULL AND va.km_ecu > 0
      GROUP BY va.origen_nombre
      UNION ALL
      SELECT DISTINCT va.destino_nombre, 'DESTINO', COUNT(*)::int
      FROM viajes_aprendizaje va
      LEFT JOIN geocerca_alias_contrato gac ON gac.geocerca_nombre = va.destino_nombre AND gac.contrato = 'CENCOSUD'
      WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= NOW() - INTERVAL '7 days'
        AND va.destino_nombre IS NOT NULL AND va.destino_nombre != 'Punto desconocido'
        AND gac.id IS NULL AND va.km_ecu > 0
      GROUP BY va.destino_nombre
      ORDER BY viajes DESC LIMIT 20
    `);

    if (sinAlias.rows.length > 0) {
      // Obtener nombres del contrato para sugerir
      const nombresContrato = await pool.query("SELECT DISTINCT origen as nombre FROM contrato_rutas_tarifas WHERE contrato = 'CENCOSUD' UNION SELECT DISTINCT destino FROM contrato_rutas_tarifas WHERE contrato = 'CENCOSUD'");
      const nombres = nombresContrato.rows.map((r: any) => r.nombre);

      let sugeridos = 0;
      for (const s of sinAlias.rows) {
        // Intentar match simple: si el nombre de geocerca contiene el nombre del contrato
        const match = nombres.find(n => {
          const nNorm = n.replace(/CD |CT /g, "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const gNorm = s.nombre.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return gNorm.includes(nNorm) || nNorm.includes(gNorm.split("/")[0].trim().split("·")[0].trim());
        });

        if (match) {
          try {
            await pool.query("INSERT INTO geocerca_alias_contrato (geocerca_nombre, nombre_contrato, contrato, confirmado, creado_por) VALUES ($1,$2,'CENCOSUD',false,'AGENTE') ON CONFLICT DO NOTHING", [s.nombre, match]);
            sugeridos++;
          } catch {}
        }
      }

      if (sinAlias.rows.length > 5) {
        await enviarMensaje({
          de: this.id, para: "agente-gerente-ops", tipo: "GEOCERCA_SIN_MAPEAR",
          prioridad: "NORMAL",
          titulo: `Cencosud: ${sinAlias.rows.length} geocercas sin alias`,
          contenido: `Nombres sin mapear: ${sinAlias.rows.slice(0, 5).map((r: any) => r.nombre).join(", ")}. ${sugeridos} sugeridos automáticamente.`,
          datos: { sin_alias: sinAlias.rows.length, sugeridos }
        });
      }
    }
  },

  async calcularProductividad() {
    const r = await pool.query(`
      SELECT c.patente, COUNT(*)::int as viajes,
        ROUND(SUM(va.km_ecu)::numeric) as km_mes,
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2) as rend
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.contrato = 'CENCOSUD' AND va.fecha_inicio >= DATE_TRUNC('month', CURRENT_DATE) AND va.km_ecu > 0
      GROUP BY c.patente
    `);

    const dia = new Date().getDate();
    const diasMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const meta = 11000;

    let sobreMeta = 0, bajoMeta = 0, critico = 0;
    for (const c of r.rows) {
      const proy = dia > 0 ? parseFloat(c.km_mes) / dia * diasMes : 0;
      const pct = proy / meta * 100;
      if (pct >= 100) sobreMeta++;
      else if (pct >= 60) bajoMeta++;
      else critico++;
    }

    // Alertar si flota baja
    if (r.rows.length < 58 && new Date().getDate() > 5) { // menos del 70% de 83
      await enviarMensaje({
        de: this.id, para: "agente-ceo", tipo: "CENCOSUD_FLOTA_BAJA",
        prioridad: "ALTA",
        titulo: `Cencosud: solo ${r.rows.length}/83 camiones activos este mes`,
        contenido: `La flota contratada es de 83 camiones pero solo ${r.rows.length} han operado. Riesgo de incumplimiento.`,
        datos: { activos: r.rows.length, contratados: 83 }
      });
    }

    return { camiones: r.rows.length, sobre_meta: sobreMeta, bajo_meta: bajoMeta, critico, km_promedio: r.rows.length > 0 ? Math.round(r.rows.reduce((s: number, c: any) => s + parseFloat(c.km_mes), 0) / r.rows.length) : 0 };
  },

  async guardarFicha(fecha: string, cruce: any, prod: any) {
    await pool.query(`
      INSERT INTO contrato_inteligencia (contrato, fecha, camiones_activos, viajes_dia, km_dia, rend_dia, anomalias, resumen, salud, updated_at)
      SELECT 'CENCOSUD', $1::date,
        COUNT(DISTINCT c.patente)::int,
        COUNT(*)::int,
        ROUND(SUM(va.km_ecu)::numeric),
        ROUND(AVG(va.rendimiento_real) FILTER (WHERE va.rendimiento_real > 0 AND va.rendimiento_real < 10)::numeric, 2),
        $2::jsonb, $3, $4, NOW()
      FROM viajes_aprendizaje va JOIN camiones c ON c.id = va.camion_id
      WHERE va.contrato = 'CENCOSUD' AND DATE(va.fecha_inicio) = $1 AND va.km_ecu > 0
      ON CONFLICT (contrato, fecha) DO UPDATE SET
        camiones_activos = EXCLUDED.camiones_activos, viajes_dia = EXCLUDED.viajes_dia, km_dia = EXCLUDED.km_dia,
        rend_dia = EXCLUDED.rend_dia, anomalias = EXCLUDED.anomalias, resumen = EXCLUDED.resumen, salud = EXCLUDED.salud, updated_at = NOW()
    `, [fecha, JSON.stringify({ cruce, productividad: prod }),
      `CENCOSUD: ${cruce.matcheados}/${cruce.total} cruzados (${cruce.pct}%) | $${Math.round(cruce.ingreso).toLocaleString()} | ${prod.camiones}cam`,
      Math.min(100, cruce.pct + (prod.camiones >= 58 ? 20 : 0))]);
  },
};

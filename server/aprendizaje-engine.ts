import { pool, db } from "./db";
import { buscarLugarCercano } from "./viajes-historico";
import { sql } from "drizzle-orm";


export async function procesarViajesNuevos(): Promise<number> {
  const result = await pool.query(`
    SELECT * FROM viajes_aprendizaje
    WHERE procesado_aprendizaje = false
    ORDER BY fecha_inicio ASC
    LIMIT 50
  `);

  const viajes = result.rows;
  if (viajes.length === 0) return 0;

  console.log(`[APRENDIZAJE] Procesando ${viajes.length} viajes nuevos`);
  let procesados = 0;

  for (const viaje of viajes) {
    try {
      const corredorId = await asignarCorredor(viaje);
      viaje.corredor_id = corredorId || viaje.corredor_id;

      if (viaje.conductor) {
        await actualizarPerfilConductor(viaje);
      }

      await actualizarPerfilCamion(viaje);

      const evaluacion = await evaluarViaje(viaje);

      await pool.query(`
        UPDATE viajes_aprendizaje SET
          procesado_aprendizaje = true,
          estado = $1,
          score_anomalia = $2
        WHERE id = $3
      `, [evaluacion.estado, evaluacion.score, viaje.id]);

      procesados++;
    } catch (err: any) {
      console.error(`[APRENDIZAJE] Error en viaje ${viaje.id}:`, err.message);
    }
  }

  console.log(`[APRENDIZAJE] ${procesados}/${viajes.length} viajes procesados`);
  return procesados;
}

function getRadioCorredor(kmViaje: number | null): number {
  if (!kmViaje || kmViaje === 0) return 3;
  if (kmViaje < 50) return 1;
  if (kmViaje < 200) return 3;
  if (kmViaje < 500) return 5;
  return 8;
}

async function asignarCorredor(viaje: any): Promise<number | null> {
  if (!viaje.origen_lat || !viaje.origen_lng || !viaje.destino_lat || !viaje.destino_lng) return null;
  if (viaje.corredor_id) return viaje.corredor_id;

  const radioKm = getRadioCorredor(parseFloat(viaje.km_gps) || parseFloat(viaje.km_ecu) || null);

  const corredoresR = await pool.query(`
    SELECT * FROM corredores WHERE activo = true AND contrato = $1
  `, [viaje.contrato || '']);

  let corredorMatch: any = null;

  for (const c of corredoresR.rows) {
    if (!c.origen_lat || !c.destino_lat) continue;
    const distOrigen = haversineKm(
      parseFloat(viaje.origen_lat), parseFloat(viaje.origen_lng),
      parseFloat(c.origen_lat), parseFloat(c.origen_lng)
    );
    const distDestino = haversineKm(
      parseFloat(viaje.destino_lat), parseFloat(viaje.destino_lng),
      parseFloat(c.destino_lat), parseFloat(c.destino_lng)
    );

    if (distOrigen < radioKm && distDestino < radioKm) {
      corredorMatch = c;
      break;
    }
  }

  if (corredorMatch) {
    const statsR = await pool.query(`
      SELECT
        COUNT(*)::int as total,
        AVG(rendimiento_real::float) FILTER (WHERE rendimiento_real::float > 0 AND rendimiento_real::float < 15) as rend_prom,
        STDDEV(rendimiento_real::float) FILTER (WHERE rendimiento_real::float > 0 AND rendimiento_real::float < 15) as rend_desv
      FROM viajes_aprendizaje WHERE corredor_id = $1
    `, [corredorMatch.id]);

    const stats = statsR.rows[0];
    await pool.query(`
      UPDATE corredores SET
        total_viajes_base = $1,
        rendimiento_promedio = $2,
        rendimiento_desviacion = $3,
        actualizado_at = NOW()
      WHERE id = $4
    `, [stats.total || 0, stats.rend_prom || null, stats.rend_desv || null, corredorMatch.id]);

    await pool.query(`UPDATE viajes_aprendizaje SET corredor_id = $1 WHERE id = $2`, [corredorMatch.id, viaje.id]);
    return corredorMatch.id;
  } else {
    const nombreOrigen = geocodearLugar(parseFloat(viaje.origen_lat), parseFloat(viaje.origen_lng));
    const nombreDestino = geocodearLugar(parseFloat(viaje.destino_lat), parseFloat(viaje.destino_lng));

    const nombreFinal = (nombreOrigen === nombreDestino)
      ? `${nombreOrigen} → [circular]`
      : `${nombreOrigen} → ${nombreDestino}`;

    const insertR = await pool.query(`
      INSERT INTO corredores (nombre, contrato, origen_nombre, destino_nombre,
        origen_lat, origen_lng, destino_lat, destino_lng,
        radio_tolerancia_km, total_viajes_base, activo, actualizado_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, true, NOW())
      RETURNING id
    `, [
      nombreFinal,
      viaje.contrato || '', nombreOrigen, nombreDestino,
      viaje.origen_lat, viaje.origen_lng, viaje.destino_lat, viaje.destino_lng,
      radioKm
    ]);

    await pool.query(`UPDATE viajes_aprendizaje SET corredor_id = $1 WHERE id = $2`, [insertR.rows[0].id, viaje.id]);
    return insertR.rows[0].id;
  }
  return null;
}

async function actualizarPerfilConductor(viaje: any) {
  const nombre = viaje.conductor;
  if (!nombre) return;

  const existeR = await pool.query(`SELECT * FROM conductores_perfil WHERE nombre = $1 LIMIT 1`, [nombre]);

  const km = parseFloat(viaje.km_ecu) || 0;
  const litros = parseFloat(viaje.litros_consumidos_ecu) || 0;
  const durMin = viaje.duracion_minutos || 0;
  const velMax = parseFloat(viaje.velocidad_maxima) || 0;

  if (existeR.rows.length > 0) {
    const p = existeR.rows[0];
    const nuevoTotal = (p.total_jornadas || 0) + 1;
    const nuevoKm = parseFloat(p.km_total || "0") + km;
    const nuevoLitros = parseFloat(p.litros_total_ecu || "0") + litros;
    const nuevoHoras = parseFloat(p.horas_total_activo || "0") + (durMin / 60);
    const nuevoRend = nuevoKm > 0 && nuevoLitros > 0 ? nuevoKm / nuevoLitros : p.rendimiento_promedio;
    const nuevoVelMax = Math.max(parseFloat(p.velocidad_max_registrada || "0"), velMax);

    await pool.query(`
      UPDATE conductores_perfil SET
        total_jornadas = $1, km_total = $2, litros_total_ecu = $3,
        rendimiento_promedio = $4, horas_total_activo = $5,
        velocidad_max_registrada = $6, ultima_jornada = $7, contrato = $8
      WHERE id = $9
    `, [nuevoTotal, nuevoKm, nuevoLitros, nuevoRend, nuevoHoras, nuevoVelMax,
        viaje.fecha_inicio, viaje.contrato, p.id]);
  } else {
    const rend = km > 0 && litros > 0 ? km / litros : null;
    await pool.query(`
      INSERT INTO conductores_perfil (nombre, contrato, total_jornadas, km_total, litros_total_ecu,
        rendimiento_promedio, velocidad_max_registrada, horas_total_activo,
        ultima_jornada, primera_jornada)
      VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $8)
    `, [nombre, viaje.contrato, km, litros, rend, velMax, durMin / 60, viaje.fecha_inicio]);
  }
}

async function actualizarPerfilCamion(viaje: any) {
  if (!viaje.camion_id) return;

  const patenteR = await pool.query(`SELECT patente, vin FROM camiones WHERE id = $1 LIMIT 1`, [viaje.camion_id]);
  if (patenteR.rows.length === 0) return;
  const { patente, vin } = patenteR.rows[0];
  if (!patente) return;

  const km = parseFloat(viaje.km_ecu) || 0;
  const litros = parseFloat(viaje.litros_consumidos_ecu) || 0;
  const durMin = viaje.duracion_minutos || 0;
  const velMax = parseFloat(viaje.velocidad_maxima) || 0;

  const existeR = await pool.query(`SELECT * FROM camiones_perfil WHERE patente = $1 LIMIT 1`, [patente]);

  if (existeR.rows.length > 0) {
    const p = existeR.rows[0];
    const nuevoTotal = (p.total_jornadas || 0) + 1;
    const nuevoKm = parseFloat(p.km_total || "0") + km;
    const nuevoLitros = parseFloat(p.litros_total_ecu || "0") + litros;
    const nuevoHoras = parseFloat(p.horas_motor_total || "0") + (durMin / 60);
    const nuevoRend = nuevoKm > 0 && nuevoLitros > 0 ? nuevoKm / nuevoLitros : p.rendimiento_promedio;
    const nuevoVelMax = Math.max(parseFloat(p.velocidad_max_registrada || "0"), velMax);

    await pool.query(`
      UPDATE camiones_perfil SET
        total_jornadas = $1, km_total = $2, litros_total_ecu = $3,
        rendimiento_promedio = $4, horas_motor_total = $5,
        velocidad_max_registrada = $6, ultima_jornada = $7, contrato = $8
      WHERE id = $9
    `, [nuevoTotal, nuevoKm, nuevoLitros, nuevoRend, nuevoHoras, nuevoVelMax,
        viaje.fecha_inicio, viaje.contrato, p.id]);
  } else {
    const rend = km > 0 && litros > 0 ? km / litros : null;
    await pool.query(`
      INSERT INTO camiones_perfil (camion_id, patente, vin, contrato, total_jornadas,
        km_total, litros_total_ecu, rendimiento_promedio,
        velocidad_max_registrada, horas_motor_total,
        ultima_jornada, primera_jornada)
      VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, $9, $10, $10)
    `, [viaje.camion_id, patente, vin, viaje.contrato, km, litros, rend, velMax, durMin / 60, viaje.fecha_inicio]);
  }
}

async function evaluarViaje(viaje: any): Promise<{ estado: string; score: number }> {
  if (!viaje.corredor_id) return { estado: "PENDIENTE", score: 0 };

  const paramsR = await pool.query(`
    SELECT * FROM parametros_adaptativos
    WHERE scope_tipo = 'CORREDOR' AND scope_id = $1 AND parametro = 'rendimiento_kmL'
    LIMIT 1
  `, [String(viaje.corredor_id)]);

  if (paramsR.rows.length === 0 || paramsR.rows[0].total_muestras < 3) {
    return { estado: "PENDIENTE", score: 0 };
  }

  const p = paramsR.rows[0];
  const rend = parseFloat(viaje.rendimiento_real) || 0;
  if (rend <= 0) return { estado: "PENDIENTE", score: 0 };

  const prom = parseFloat(p.valor_promedio);
  const desv = parseFloat(p.valor_desviacion);
  if (desv <= 0) return { estado: "NORMAL", score: 0 };

  const zScore = (prom - rend) / desv;

  if (zScore <= 1.0) return { estado: "NORMAL", score: 0 };
  if (zScore <= 1.5) return { estado: "REVISAR", score: 25 };
  if (zScore <= 2.0) return { estado: "ANOMALIA", score: 60 };
  return { estado: "CRITICO", score: 90 };
}

export async function calcularParametros(): Promise<number> {
  console.log("[PARAMETROS] Recalculando parametros adaptativos...");

  const corredoresR = await pool.query(`SELECT id FROM corredores WHERE activo = true`);
  let actualizados = 0;

  for (const corredor of corredoresR.rows) {
    const viajesR = await pool.query(`
      SELECT rendimiento_real::float as rend
      FROM viajes_aprendizaje
      WHERE corredor_id = $1 AND rendimiento_real IS NOT NULL
        AND rendimiento_real::float > 0 AND rendimiento_real::float < 15
    `, [corredor.id]);

    const rendimientos = viajesR.rows.map((v: any) => v.rend).filter((r: number) => r > 0);
    if (rendimientos.length < 3) continue;

    const prom = media(rendimientos);
    const desv = stdDev(rendimientos);
    const confianza =
      rendimientos.length >= 200 ? "EXPERTA" :
      rendimientos.length >= 50 ? "ALTA" :
      rendimientos.length >= 10 ? "MEDIA" : "BAJA";

    await pool.query(`
      INSERT INTO parametros_adaptativos
        (scope_tipo, scope_id, parametro, valor_promedio,
         valor_desviacion, valor_minimo, valor_maximo,
         umbral_revisar, umbral_anomalia, umbral_critico,
         total_muestras, confianza, ultima_actualizacion)
      VALUES
        ('CORREDOR', $1, 'rendimiento_kmL',
         $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (scope_tipo, scope_id, parametro)
      DO UPDATE SET
        valor_promedio = EXCLUDED.valor_promedio,
        valor_desviacion = EXCLUDED.valor_desviacion,
        valor_minimo = EXCLUDED.valor_minimo,
        valor_maximo = EXCLUDED.valor_maximo,
        umbral_revisar = EXCLUDED.umbral_revisar,
        umbral_anomalia = EXCLUDED.umbral_anomalia,
        umbral_critico = EXCLUDED.umbral_critico,
        total_muestras = EXCLUDED.total_muestras,
        confianza = EXCLUDED.confianza,
        ultima_actualizacion = NOW()
    `, [
      String(corredor.id), prom, desv,
      Math.min(...rendimientos), Math.max(...rendimientos),
      prom - 1.5 * desv, prom - 2.0 * desv, prom - 3.0 * desv,
      rendimientos.length, confianza
    ]);

    actualizados++;
  }

  console.log(`[PARAMETROS] ${actualizados} corredores actualizados`);
  return actualizados;
}

export async function detectarCambiosPatron(): Promise<number> {
  console.log("[PATRONES] Detectando cambios de patron...");

  const conductoresR = await pool.query(`
    SELECT * FROM conductores_perfil WHERE total_jornadas >= 5
  `);
  let alertasCreadas = 0;

  for (const conductor of conductoresR.rows) {
    const ultimosR = await pool.query(`
      SELECT rendimiento_real::float as rend
      FROM viajes_aprendizaje
      WHERE conductor = $1 AND rendimiento_real IS NOT NULL
        AND rendimiento_real::float > 0
      ORDER BY fecha_inicio DESC LIMIT 3
    `, [conductor.nombre]);

    if (ultimosR.rows.length < 3) continue;

    const rendReciente = media(ultimosR.rows.map((v: any) => v.rend));
    const rendHistorico = parseFloat(conductor.rendimiento_promedio);
    if (!rendHistorico || rendReciente === 0) continue;

    const diferenciaPct = ((rendReciente - rendHistorico) / rendHistorico) * 100;

    if (diferenciaPct < -20) {
      const existeR = await pool.query(`
        SELECT id FROM alertas_aprendizaje
        WHERE entidad_nombre = $1 AND tipo = 'CAMBIO_PATRON_CONDUCTOR' AND gestionado = false
        LIMIT 1
      `, [conductor.nombre]);

      if (existeR.rows.length === 0) {
        await pool.query(`
          INSERT INTO alertas_aprendizaje
            (tipo, entidad_tipo, entidad_nombre, contrato, descripcion,
             valor_reciente, valor_historico, diferencia_pct)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          "CAMBIO_PATRON_CONDUCTOR", "conductor", conductor.nombre,
          conductor.contrato || "",
          `Rendimiento cayo ${Math.abs(diferenciaPct).toFixed(0)}% en ultimos 3 viajes vs historial. Reciente: ${rendReciente.toFixed(2)} km/L, Historico: ${rendHistorico.toFixed(2)} km/L`,
          rendReciente, rendHistorico, diferenciaPct
        ]);
        alertasCreadas++;
        console.log(`[PATRONES] Alerta creada: ${conductor.nombre} bajo ${Math.abs(diferenciaPct).toFixed(0)}%`);
      }
    }
  }

  console.log(`[PATRONES] ${alertasCreadas} alertas creadas`);
  return alertasCreadas;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function media(vals: number[]): number {
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function stdDev(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = media(vals);
  return Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length);
}

function geocodearLugar(lat: number, lng: number): string {
  try {
    const lugar = buscarLugarCercano(lat, lng);
    return lugar ? lugar.nombre : "Punto desconocido";
  } catch {
    return "Punto desconocido";
  }
}

/* ═══════════════════════════════════════════════════
   CIERRE AUTOMÁTICO DE OPERACIONES
   Procesa pares de cargas y calcula balance ECU
   ═══════════════════════════════════════════════════ */

export async function procesarCierreAutomatico(diasAtras: number = 7, limite: number = 100): Promise<number> {
  try {
    const calcularPeriodoEntreCargas = async (_p: string, _a: any, _b: any): Promise<any> => ({ kmEcu: 0, litrosConsumidosEcu: 0, snapCount: 0, periodoAbierto: true, horasPeriodo: 0, rendimientoEcu: 0, coberturaPct: 0, calidadDatos: "SIN_DATOS" });

    // Pares de cargas consecutivas sin procesar
    // nota: cargas.fecha es text, necesita cast a timestamp
    const paresR = await pool.query(`
      SELECT
        c1.id as carga_a_id, c1.patente, c1.fecha as fecha_a,
        c1.litros_surtidor::float as litros_a, c1.lugar_consumo as estacion_a,
        c1.conductor, c1.faena as contrato,
        c2.id as carga_b_id, c2.fecha as fecha_b,
        c2.litros_surtidor::float as litros_b, c2.lugar_consumo as estacion_b,
        cam.vin
      FROM cargas c1
      JOIN cargas c2 ON c2.patente = c1.patente
        AND c2.fecha::timestamp > c1.fecha::timestamp
        AND c2.fecha::timestamp <= c1.fecha::timestamp + INTERVAL '96 hours'
        AND c2.id = (
          SELECT id FROM cargas
          WHERE patente = c1.patente AND fecha::timestamp > c1.fecha::timestamp
          ORDER BY fecha::timestamp ASC LIMIT 1
        )
      JOIN camiones cam ON cam.patente = c1.patente AND cam.vin IS NOT NULL AND cam.vin != ''
      LEFT JOIN operaciones_cerradas oc ON oc.carga_a_id = c1.id
      WHERE c1.fecha::timestamp >= NOW() - INTERVAL '${diasAtras} days'
        AND c1.litros_surtidor > 0
        AND oc.id IS NULL
      ORDER BY c1.fecha::timestamp ASC
      LIMIT $1
    `, [limite]);

    let cerradas = 0;

    for (const par of paresR.rows) {
      try {
        const periodo = await calcularPeriodoEntreCargas(
          par.patente,
          { fecha: new Date(par.fecha_a), litros: par.litros_a },
          { fecha: new Date(par.fecha_b), litros: par.litros_b }
        );

        if (!periodo.kmEcu || periodo.kmEcu < 50) continue;
        if (!periodo.litrosConsumidosEcu) continue;
        if (periodo.snapCount < 5) continue;

        const balanceLitros = par.litros_a - periodo.litrosConsumidosEcu;
        const balancePct = Math.round(balanceLitros / periodo.litrosConsumidosEcu * 100);

        let nivelAnomalia = "NORMAL";
        if (periodo.kmEcu >= 200 && periodo.snapCount >= 15 && !periodo.periodoAbierto) {
          if (balancePct > 80 && balanceLitros > 100) nivelAnomalia = "CRITICO";
          else if (balancePct > 40 && balanceLitros > 50) nivelAnomalia = "SOSPECHOSO";
          else if (balancePct > 20) nivelAnomalia = "REVISAR";
        }

        await pool.query(`
          INSERT INTO operaciones_cerradas (
            patente, vin, conductor, contrato,
            carga_a_id, carga_a_fecha, carga_a_litros, carga_a_estacion,
            carga_b_id, carga_b_fecha, carga_b_litros, carga_b_estacion,
            horas_periodo, km_ecu, litros_consumidos_ecu, rendimiento_ecu,
            litros_cargados, balance_litros, balance_pct,
            snap_count, cobertura_pct, calidad_datos,
            nivel_anomalia
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
          ON CONFLICT (carga_a_id) DO NOTHING
        `, [
          par.patente, par.vin, par.conductor, par.contrato,
          par.carga_a_id, par.fecha_a, par.litros_a, par.estacion_a,
          par.carga_b_id, par.fecha_b, par.litros_b, par.estacion_b,
          periodo.horasPeriodo, periodo.kmEcu, periodo.litrosConsumidosEcu, periodo.rendimientoEcu,
          par.litros_a, balanceLitros, balancePct,
          periodo.snapCount, periodo.coberturaPct, periodo.calidadDatos,
          nivelAnomalia,
        ]);

        cerradas++;
      } catch (e: any) {
        // Skip individual errors
      }
    }

    if (cerradas > 0) console.log(`[CIERRE-AUTO] ${cerradas} operaciones cerradas de ${paresR.rows.length} pares`);
    return cerradas;
  } catch (e: any) {
    console.error("[CIERRE-AUTO] Error:", e.message);
    return 0;
  }
}

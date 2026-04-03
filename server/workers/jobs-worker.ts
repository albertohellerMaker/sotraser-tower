function send(msg: any) {
  if (process.send) process.send(msg);
}

function log(msg: string) {
  const line = `[WORKER:JOBS] ${msg}`;
  console.log(line);
}

function logError(msg: string) {
  const line = `[WORKER:JOBS] ${msg}`;
  console.error(line);
}

async function main() {
  log("Inicializando worker de jobs...");

  const { syncSigetraToCargas } = await import("../sigetra-api");
  const { calcularExpectativasDiarias, compararRealVsEsperado } = await import("../supervision-engine");
  const { procesarViajesNuevos, calcularParametros, detectarCambiosPatron, cruzarConSigetra, procesarCierreAutomatico } = await import("../aprendizaje-engine");
  const { syncViajesHistorico } = await import("../viajes-historico");
  const { procesarProductividadDiaria } = await import("../productividad");
  const { getSistemaEstado } = await import("../sistema-estado");
  const { aprenderUmbralesScore } = await import("../score-conduccion");
  const { promoverPuntosNuevos } = await import("../geocerca-inteligente");
  const { consolidarTrayectosCencosud, crearTablaTrayectos } = await import("../cencosud-trayectos");
  const { pool, getDefaultDesde } = await import("../db");
  const { cargas, camiones } = await import("../../shared/schema");
  const { and, isNotNull, sql } = await import("drizzle-orm");
  const { db } = await import("../db");

  interface JobDef {
    nombre: string;
    intervalo: number | null;
    fn: () => Promise<void>;
  }

  const JOBS: Record<string, JobDef> = {
    VIAJES_NUEVOS: {
      intervalo: 5 * 60 * 1000,
      nombre: "VIAJES_NUEVOS",
      fn: async () => {
        await procesarViajesNuevos();
        await procesarCierreAutomatico(7, 50);
        await procesarProductividadDiaria();
        try {
          await pool.query(`
            UPDATE viajes_aprendizaje va SET conductor = sig.conductor
            FROM (SELECT DISTINCT ON (va2.id) va2.id, c.conductor FROM viajes_aprendizaje va2
              JOIN camion_identidades ci ON va2.vin = ci.vin
              JOIN cargas c ON c.patente = ANY(ci.ids_validos) AND c.conductor IS NOT NULL AND c.conductor != ''
              AND c.fecha::timestamp >= va2.fecha_inicio - INTERVAL '24 hours'
              AND c.fecha::timestamp <= COALESCE(va2.fecha_fin, va2.fecha_inicio) + INTERVAL '24 hours'
              WHERE va2.fecha_inicio >= NOW() - INTERVAL '3 days' AND (va2.conductor IS NULL OR va2.conductor = '')
              ORDER BY va2.id, ABS(EXTRACT(EPOCH FROM (c.fecha::timestamp - va2.fecha_inicio)))
            ) sig WHERE va.id = sig.id
          `);
        } catch (e: any) { logError("Cross-validate error: " + e.message); }
      },
    },

    TRAYECTOS_CENCOSUD: {
      intervalo: 15 * 60 * 1000,
      nombre: "TRAYECTOS_CENCOSUD",
      fn: async () => {
        await crearTablaTrayectos();
        await consolidarTrayectosCencosud();
      },
    },

    PARAMETROS: {
      intervalo: 30 * 60 * 1000,
      nombre: "PARAMETROS",
      fn: async () => {
        await calcularParametros();
      },
    },

    PATRONES: {
      intervalo: 30 * 60 * 1000,
      nombre: "PATRONES",
      fn: async () => {
        await detectarCambiosPatron();
      },
    },

    CUADRATURA_SIGETRA: {
      intervalo: null,
      nombre: "CUADRATURA_SIGETRA",
      fn: async () => {
        await cruzarConSigetra();
      },
    },

    SIGETRA_SYNC: {
      intervalo: null,
      nombre: "SIGETRA_SYNC",
      fn: async () => {
        const desde = getDefaultDesde(7);
        const hasta = new Date();
        await syncSigetraToCargas(desde, hasta);
        await procesarCierreAutomatico(7, 200);
      },
    },

    REPORTE_DIARIO: {
      intervalo: null,
      nombre: "REPORTE_DIARIO",
      fn: async () => {
        await generarReporteDiario();
      },
    },

    APRENDIZAJE_COMBUSTIBLE: {
      intervalo: 6 * 60 * 60 * 1000,
      nombre: "APRENDIZAJE_COMBUSTIBLE",
      fn: async () => {
        await aprenderPatronesCombustible();
      },
    },

    SCORE_CONDUCCION: {
      intervalo: 30 * 60 * 1000,
      nombre: "SCORE_CONDUCCION",
      fn: async () => {
        await aprenderUmbralesScore();
      },
    },

    GEOCERCA_PROMOCION: {
      intervalo: 6 * 60 * 60 * 1000,
      nombre: "GEOCERCA_PROMOCION",
      fn: async () => {
        const n = await promoverPuntosNuevos();
        if (n > 0) log(`${n} puntos nuevos promovidos a geocercas de 50m`);
      },
    },

    CUADRATURA_NOCTURNA: {
      intervalo: null,
      nombre: "CUADRATURA_NOCTURNA",
      fn: async () => {
        try {
          const port = process.env.PORT || "5000";
          const response = await fetch(`http://localhost:${port}/api/admin/recalcular-cuadratura`, { method: "POST" });
          const data = await response.json() as any;
          log(`Cuadratura: ${data.actualizados} actualizados, ${data.sin_cargas} sin cargas, ${data.pendientes_totales} pendientes`);

          try {
            const coberturaR = await pool.query(`
              SELECT
                COUNT(*)::int as total_entre_cargas,
                COUNT(CASE WHEN litros_consumidos_ecu > 0 THEN 1 END)::int as con_ecu,
                ROUND(
                  COUNT(CASE WHEN litros_consumidos_ecu > 0 THEN 1 END) * 100.0 / GREATEST(COUNT(*), 1), 1
                ) as cobertura_pct
              FROM viajes_aprendizaje
              WHERE fecha_inicio >= NOW() - INTERVAL '7 days'
            `);
            const s = coberturaR.rows[0];
            log(`Cobertura ECU ultimos 7 dias: ${s.cobertura_pct}% (${s.con_ecu}/${s.total_entre_cargas})`);
          } catch (logErr: any) {
            logError("Error al calcular cobertura: " + logErr.message);
          }
        } catch (err: any) {
          logError("Cuadratura nocturna error: " + err.message);
        }
      },
    },

    VIN_PATENTE_REFRESH: {
      intervalo: 60 * 60 * 1000,
      nombre: "VIN_PATENTE_REFRESH",
      fn: async () => {
        const { invalidarCache, diagnosticoVinPatente } = await import("../utils/vin-patente");
        invalidarCache();
        const diag = await diagnosticoVinPatente();
        log(`VIN Refresh: ${diag.vins_resueltos} VINs, ${diag.patentes_mapeadas} patentes, ${diag.vins_con_duplicados} duplicados`);
      },
    },
  };

  const jobsEnCurso = new Set<string>();

  async function runJob(job: JobDef) {
    if (jobsEnCurso.has(job.nombre)) {
      log(`${job.nombre} ya en curso, saltando`);
      return;
    }
    jobsEnCurso.add(job.nombre);
    const inicio = Date.now();
    try {
      log(`Iniciando ${job.nombre}`);
      send({ type: "status", job: job.nombre, status: "running" });
      await job.fn();
      const ms = Date.now() - inicio;
      log(`${job.nombre} completado en ${ms}ms`);
      send({ type: "status", job: job.nombre, status: "done", ms });
    } catch (error: any) {
      logError(`${job.nombre} fallo: ${error.message}`);
      send({ type: "status", job: job.nombre, status: "error", error: error.message });
    } finally {
      jobsEnCurso.delete(job.nombre);
    }
  }

  async function aprenderPatronesCombustible() {
    const camionesConVin = await db.select()
      .from(camiones)
      .where(isNotNull(camiones.vin));
    const patentesVolvo = new Set(camionesConVin.filter(c => c.patente && c.vin).map(c => c.patente!));

    const allCargasRaw = await db.select({
      patente: cargas.patente,
      lugarConsumo: cargas.lugarConsumo,
      litrosSurtidor: cargas.litrosSurtidor,
      fecha: cargas.fecha,
      contrato: cargas.faena,
    }).from(cargas).where(
      and(
        isNotNull(cargas.patente),
        isNotNull(cargas.lugarConsumo),
        sql`${cargas.litrosSurtidor} > 0`
      )
    );

    const allCargas = allCargasRaw.filter(c => c.patente && patentesVolvo.has(c.patente));

    const porCamion = new Map<string, { litros: number[], contrato: string | null, ultimaFecha: string }>();
    const porCamionEstacion = new Map<string, { litros: number[], patente: string, estacion: string, contrato: string | null, ultimaFecha: string }>();

    for (const c of allCargas) {
      if (!c.patente || !c.lugarConsumo) continue;
      const pat = c.patente.trim();
      const est = c.lugarConsumo.trim();
      const litros = Number(c.litrosSurtidor);
      if (litros <= 0 || !pat || !est) continue;

      if (!porCamion.has(pat)) porCamion.set(pat, { litros: [], contrato: c.contrato, ultimaFecha: c.fecha });
      const cm = porCamion.get(pat)!;
      cm.litros.push(litros);
      if (c.fecha > cm.ultimaFecha) cm.ultimaFecha = c.fecha;

      const key = `${pat}||${est}`;
      if (!porCamionEstacion.has(key)) porCamionEstacion.set(key, { litros: [], patente: pat, estacion: est, contrato: c.contrato, ultimaFecha: c.fecha });
      const ce = porCamionEstacion.get(key)!;
      ce.litros.push(litros);
      if (c.fecha > ce.ultimaFecha) ce.ultimaFecha = c.fecha;
    }

    function calcStats(litros: number[]) {
      const n = litros.length;
      const mean = litros.reduce((s, v) => s + v, 0) / n;
      const variance = litros.reduce((s, v) => s + (v - mean) ** 2, 0) / (n > 1 ? n - 1 : 1);
      const stddev = Math.sqrt(variance);
      let confianza = "BAJA";
      if (n >= 30) confianza = "EXPERTA";
      else if (n >= 15) confianza = "ALTA";
      else if (n >= 5) confianza = "MEDIA";
      return { mean: Math.round(mean * 100) / 100, stddev: Math.round(stddev * 100) / 100, min: Math.min(...litros), max: Math.max(...litros), confianza, n };
    }

    const inserts: any[] = [];

    for (const [pat, data] of porCamion) {
      if (data.litros.length < 3) continue;
      const stats = calcStats(data.litros);
      inserts.push({
        scopeTipo: "CAMION", scopeId: pat, patente: pat, contrato: data.contrato,
        cargaTipica: String(stats.mean), cargaDesviacion: String(stats.stddev),
        cargaMinima: String(stats.min), cargaMaxima: String(stats.max),
        totalCargas: stats.n, confianza: stats.confianza,
        ultimaCarga: data.ultimaFecha ? new Date(data.ultimaFecha) : null, activo: true,
      });
    }

    for (const [, data] of porCamionEstacion) {
      if (data.litros.length < 3 || !data.estacion) continue;
      const stats = calcStats(data.litros);
      inserts.push({
        scopeTipo: "CAMION_ESTACION", scopeId: `${data.patente}||${data.estacion}`,
        patente: data.patente, estacionNombre: data.estacion, contrato: data.contrato,
        cargaTipica: String(stats.mean), cargaDesviacion: String(stats.stddev),
        cargaMinima: String(stats.min), cargaMaxima: String(stats.max),
        totalCargas: stats.n, confianza: stats.confianza,
        ultimaCarga: data.ultimaFecha ? new Date(data.ultimaFecha) : null, activo: true,
      });
    }

    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_patrones_scope ON patrones_carga_combustible (scope_tipo, scope_id)`);

    let upserted = 0;
    for (const ins of inserts) {
      await pool.query(`
        INSERT INTO patrones_carga_combustible
          (scope_tipo, scope_id, patente, estacion_nombre, contrato,
           carga_tipica, carga_desviacion, carga_minima, carga_maxima,
           total_cargas, confianza, ultima_carga, activo, ultima_actualizacion)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,NOW())
        ON CONFLICT (scope_tipo, scope_id)
        DO UPDATE SET
          carga_tipica = EXCLUDED.carga_tipica,
          carga_desviacion = EXCLUDED.carga_desviacion,
          carga_minima = EXCLUDED.carga_minima,
          carga_maxima = EXCLUDED.carga_maxima,
          total_cargas = EXCLUDED.total_cargas,
          confianza = EXCLUDED.confianza,
          ultima_carga = EXCLUDED.ultima_carga,
          ultima_actualizacion = NOW()
      `, [
        ins.scopeTipo, ins.scopeId, ins.patente, ins.estacionNombre || null, ins.contrato || null,
        ins.cargaTipica, ins.cargaDesviacion, ins.cargaMinima, ins.cargaMaxima,
        ins.totalCargas, ins.confianza, ins.ultimaCarga
      ]);
      upserted++;
    }

    const cam = inserts.filter(i => i.scopeTipo === "CAMION").length;
    const ce = inserts.filter(i => i.scopeTipo === "CAMION_ESTACION").length;
    log(`Combustible: ${upserted} upserted: ${cam} patrones camion + ${ce} pares camion-estacion de ${allCargas.length} cargas`);
  }

  async function generarReporteDiario() {
    try {
      const estado = await getSistemaEstado();

      const ayer = new Date();
      ayer.setDate(ayer.getDate() - 1);
      ayer.setHours(0, 0, 0, 0);
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      const anomaliasR = await pool.query(`
        SELECT COUNT(*)::int as count FROM viajes_aprendizaje
        WHERE fecha_inicio >= $1 AND fecha_inicio < $2
          AND estado IN ('ANOMALIA', 'REVISAR', 'CRITICO')
      `, [ayer, hoy]);

      const cuadraturaR = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE sigetra_cruzado = true)::int as cruzados,
          COUNT(*) FILTER (WHERE delta_cuadratura IS NOT NULL AND delta_cuadratura > 20)::int as desvios_altos
        FROM viajes_aprendizaje
        WHERE fecha_inicio >= $1 AND fecha_inicio < $2
      `, [ayer, hoy]);

      log(`REPORTE DIARIO ${ayer.toISOString().slice(0, 10)}`);
      log(`  Anomalias detectadas: ${anomaliasR.rows[0].count}`);
      log(`  Viajes totales procesados: ${estado.total_viajes_procesados}`);
      log(`  Confianza global: ${estado.confianza_global}`);
      log(`  Cuadratura: ${cuadraturaR.rows[0].cruzados} cruzados, ${cuadraturaR.rows[0].desvios_altos} desvios >20L`);
    } catch (err: any) {
      logError("Reporte diario error: " + err.message);
    }
  }

  function programarSigetra() {
    const INTERVALO_MS = 60 * 60 * 1000;
    log("Sigetra sync cada 1 hora");

    setTimeout(() => {
      log("Ejecutando sync Sigetra inicial...");
      runJob(JOBS.SIGETRA_SYNC).then(() => {
        log("Cuadratura inicial en 2 min...");
        setTimeout(() => runJob(JOBS.CUADRATURA_SIGETRA), 2 * 60 * 1000);
      });
    }, 60 * 1000);

    setInterval(async () => {
      try {
        await runJob(JOBS.SIGETRA_SYNC);
        setTimeout(() => runJob(JOBS.CUADRATURA_SIGETRA), 2 * 60 * 60 * 1000);
      } catch (e: any) {
        logError("Sigetra sync horario error: " + e.message);
      }
    }, INTERVALO_MS);
  }

  function programarReporteDiario() {
    const ahora = new Date();
    const proximas6am = new Date();
    proximas6am.setHours(6, 0, 0, 0);
    if (proximas6am <= ahora) proximas6am.setDate(proximas6am.getDate() + 1);
    const msHasta6am = proximas6am.getTime() - ahora.getTime();

    setTimeout(() => {
      runJob(JOBS.REPORTE_DIARIO);
      setInterval(() => runJob(JOBS.REPORTE_DIARIO), 24 * 60 * 60 * 1000);
    }, msHasta6am);

    log(`Reporte diario programado para las 06:00 (en ${Math.round(msHasta6am / 60000)} min)`);
  }

  function programarCuadraturaNocturna() {
    const ahora = new Date();
    const proximas3am = new Date();
    proximas3am.setHours(3, 0, 0, 0);
    if (proximas3am <= ahora) proximas3am.setDate(proximas3am.getDate() + 1);
    const msHasta = proximas3am.getTime() - ahora.getTime();

    setTimeout(() => {
      runJob(JOBS.CUADRATURA_NOCTURNA);
      setInterval(() => runJob(JOBS.CUADRATURA_NOCTURNA), 24 * 60 * 60 * 1000);
    }, msHasta);

    log(`Cuadratura nocturna programada para las 03:00 (en ${Math.round(msHasta / 60000)} min)`);
  }

  log("Iniciando sistema de jobs en background...");

  setTimeout(() => {
    runJob(JOBS.VIAJES_NUEVOS);
    setInterval(() => runJob(JOBS.VIAJES_NUEVOS), JOBS.VIAJES_NUEVOS.intervalo!);
  }, 30 * 1000);

  setTimeout(() => {
    runJob(JOBS.PARAMETROS);
    setInterval(() => runJob(JOBS.PARAMETROS), JOBS.PARAMETROS.intervalo!);
  }, 2 * 60 * 1000);

  setTimeout(() => {
    runJob(JOBS.PATRONES);
    setInterval(() => runJob(JOBS.PATRONES), JOBS.PATRONES.intervalo!);
  }, 15 * 60 * 1000);

  setTimeout(() => {
    runJob(JOBS.APRENDIZAJE_COMBUSTIBLE);
    setInterval(() => runJob(JOBS.APRENDIZAJE_COMBUSTIBLE), JOBS.APRENDIZAJE_COMBUSTIBLE.intervalo!);
  }, 45 * 1000);

  setTimeout(() => {
    runJob(JOBS.SCORE_CONDUCCION);
    setInterval(() => runJob(JOBS.SCORE_CONDUCCION), JOBS.SCORE_CONDUCCION.intervalo!);
  }, 7 * 60 * 1000);

  programarSigetra();
  programarReporteDiario();
  programarCuadraturaNocturna();

  setTimeout(() => {
    runJob(JOBS.VIN_PATENTE_REFRESH);
    setInterval(() => runJob(JOBS.VIN_PATENTE_REFRESH), JOBS.VIN_PATENTE_REFRESH.intervalo!);
  }, 10 * 1000);

  setTimeout(() => {
    runJob(JOBS.TRAYECTOS_CENCOSUD);
    setInterval(() => runJob(JOBS.TRAYECTOS_CENCOSUD), JOBS.TRAYECTOS_CENCOSUD.intervalo!);
  }, 3 * 60 * 1000);

  setTimeout(async () => {
    try {
      await calcularExpectativasDiarias();
      await compararRealVsEsperado();
      log("Supervisión inicial ejecutada");
    } catch (e: any) { logError("Supervisión inicial error: " + e.message); }
  }, 30 * 1000);

  setInterval(async () => {
    const h = new Date().getHours();
    if (h === 0) {
      try { await calcularExpectativasDiarias(); } catch {}
    }
  }, 60 * 60 * 1000);

  setInterval(async () => {
    try { await compararRealVsEsperado(); } catch {}
  }, 60 * 60 * 1000);

  setInterval(async () => {
    try {
      log("Iniciando sync viajes historico (3 dias)...");
      await syncViajesHistorico(3);
      log("Sync viajes historico completado");
    } catch (e: any) {
      logError("Sync viajes historico error: " + e.message);
    }
  }, 2 * 60 * 60 * 1000);

  setInterval(async () => {
    try {
      await pool.query(`
        INSERT INTO camion_identidades (vin, numero_interno, patente_actual, ids_validos, id_display, tipo_display)
        SELECT vin,
          MAX(patente) FILTER (WHERE patente ~ '^\\d+$'),
          MAX(patente) FILTER (WHERE patente !~ '^\\d+$'),
          ARRAY_AGG(DISTINCT patente) FILTER (WHERE patente IS NOT NULL),
          CASE WHEN bool_or(patente ~ '^\\d+$') THEN MAX(patente) FILTER (WHERE patente ~ '^\\d+$') ELSE MAX(patente) END,
          CASE WHEN bool_or(patente ~ '^\\d+$') THEN 'NUMERO' ELSE 'PATENTE' END
        FROM camiones WHERE vin IS NOT NULL AND vin != '' GROUP BY vin
        ON CONFLICT (vin) DO UPDATE SET
          ids_validos = EXCLUDED.ids_validos, id_display = EXCLUDED.id_display,
          numero_interno = EXCLUDED.numero_interno, patente_actual = EXCLUDED.patente_actual,
          ultima_actualizacion = NOW()
      `);
      await pool.query(`UPDATE cargas c SET vin_resuelto = ci.vin FROM camion_identidades ci WHERE c.patente = ANY(ci.ids_validos) AND c.vin_resuelto IS NULL`);
      log("camion_identidades y vin_resuelto actualizados");
    } catch (e: any) { logError("Identidades error: " + e.message); }
  }, 6 * 60 * 60 * 1000);

  setTimeout(() => {
    runJob(JOBS.GEOCERCA_PROMOCION);
    setInterval(() => runJob(JOBS.GEOCERCA_PROMOCION), JOBS.GEOCERCA_PROMOCION.intervalo!);
  }, 20 * 60 * 1000);

  log("Todos los jobs programados");
  send({ type: "ready" });
}

main().catch(err => {
  console.error("[WORKER:JOBS] Fatal error:", err);
  send({ type: "fatal", error: err.message });
  process.exit(1);
});

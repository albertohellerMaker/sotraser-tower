import type { Express, Request, Response } from "express";
import { db, pool } from "./db";
import { camiones, cargas, volvoFuelSnapshots, patronesCargaCombustible } from "@shared/schema";
import { count } from "drizzle-orm";
import { eq, desc, and, gte, lte, sql, asc, isNotNull, ne } from "drizzle-orm";
import { ESTACIONES_COMBUSTIBLE } from "./geo-routes";

export function registerEstacionesRoutes(app: Express) {

  app.get("/api/estaciones/analisis", async (req: Request, res: Response) => {
    try {
      const hoy = new Date();
      const anteayer = new Date(hoy);
      anteayer.setDate(anteayer.getDate() - 2);

      const desde = new Date(anteayer);
      desde.setHours(0, 0, 0, 0);

      const hasta = new Date(anteayer);
      hasta.setHours(23, 59, 59, 999);

      const desdeStr = desde.toISOString();
      const hastaStr = hasta.toISOString();

      const camionesConVin = await db.select()
        .from(camiones)
        .where(and(isNotNull(camiones.vin), ne(camiones.vin, "")));

      const vinPorPatente: Record<string, string> = {};
      for (const c of camionesConVin) {
        if (c.patente && c.vin) vinPorPatente[c.patente] = c.vin;
      }

      const patentesVolvo = new Set(Object.keys(vinPorPatente));

      const cargasSigetraAll = await db.select()
        .from(cargas)
        .where(and(gte(cargas.fecha, desdeStr), lte(cargas.fecha, hastaStr)))
        .orderBy(desc(cargas.fecha));

      const cargasVolvo = cargasSigetraAll.filter(c => c.patente && patentesVolvo.has(c.patente));
      const cargasExcluidas = cargasSigetraAll.length - cargasVolvo.length;

      const ECU_VENTANA_ANTES_MS = 45 * 60 * 1000;
      const ECU_VENTANA_DESPUES_MS = 45 * 60 * 1000;

      const snapDesde = new Date(desde.getTime() - ECU_VENTANA_ANTES_MS).toISOString();
      const snapHasta = new Date(hasta.getTime() + ECU_VENTANA_DESPUES_MS).toISOString();
      const snapshotsData = await db.select()
        .from(volvoFuelSnapshots)
        .where(and(
          gte(volvoFuelSnapshots.capturedAt, snapDesde),
          lte(volvoFuelSnapshots.capturedAt, snapHasta)
        ))
        .orderBy(asc(volvoFuelSnapshots.capturedAt));

      const snapsByVin: Record<string, typeof snapshotsData> = {};
      for (const s of snapshotsData) {
        if (!snapsByVin[s.vin]) snapsByVin[s.vin] = [];
        snapsByVin[s.vin].push(s);
      }

      const cargasSigetra = cargasVolvo;
      let cargasConCruceCount = 0;
      for (const c of cargasSigetra) {
        const vin = c.patente ? vinPorPatente[c.patente] : null;
        if (!vin) continue;
        const vinSnaps = snapsByVin[vin] || [];
        const fechaCarga = new Date(c.fecha);
        const ventanaAntes = new Date(fechaCarga.getTime() - ECU_VENTANA_ANTES_MS);
        const ventanaDespues = new Date(fechaCarga.getTime() + ECU_VENTANA_DESPUES_MS);
        const tieneAntes = vinSnaps.some(s => new Date(s.capturedAt) >= ventanaAntes && new Date(s.capturedAt) <= fechaCarga);
        const tieneDespues = vinSnaps.some(s => new Date(s.capturedAt) > fechaCarga && new Date(s.capturedAt) <= ventanaDespues);
        if (tieneAntes && tieneDespues) cargasConCruceCount++;
      }
      const cargasSinCruceCount = cargasVolvo.length - cargasConCruceCount;

      const patronesResult = await pool.query(
        `SELECT scope_tipo, scope_id, patente, estacion_nombre, contrato, carga_tipica, carga_desviacion, total_cargas
         FROM patrones_carga_combustible WHERE activo = true`
      );
      const patronesPorCamionEstacion: Record<string, { litrosPromedio: number; totalCargas: number }> = {};
      const patronesPorCamion: Record<string, { litrosPromedio: number; totalCargas: number }> = {};
      for (const p of patronesResult.rows) {
        if (p.scope_tipo === 'CAMION_ESTACION' && p.patente && p.estacion_nombre) {
          patronesPorCamionEstacion[`${p.patente}||${p.estacion_nombre}`] = {
            litrosPromedio: Number(p.carga_tipica),
            totalCargas: Number(p.total_cargas),
          };
        }
        if (p.scope_tipo === 'CAMION' && p.patente) {
          patronesPorCamion[p.patente] = {
            litrosPromedio: Number(p.carga_tipica),
            totalCargas: Number(p.total_cargas),
          };
        }
      }

      const adaptativosResult = await pool.query(
        `SELECT scope_tipo, scope_id, parametro, valor_promedio, valor_desviacion, umbral_anomalia, umbral_critico, umbral_revisar, total_muestras
         FROM parametros_adaptativos WHERE activo = true AND parametro IN ('litros_carga_minimo', 'horas_minimas_entre_cargas', 'fuel_level_antes_carga')`
      );
      const adaptativosPorScope: Record<string, { valor_promedio: number; valor_desviacion: number; umbral_anomalia: number; umbral_critico: number; umbral_revisar: number; total_muestras: number }> = {};
      for (const a of adaptativosResult.rows) {
        const key = `${a.scope_tipo}||${a.scope_id}||${a.parametro}`;
        adaptativosPorScope[key] = {
          valor_promedio: Number(a.valor_promedio),
          valor_desviacion: Number(a.valor_desviacion),
          umbral_anomalia: Number(a.umbral_anomalia),
          umbral_critico: Number(a.umbral_critico),
          umbral_revisar: Number(a.umbral_revisar),
          total_muestras: Number(a.total_muestras),
        };
      }

      function getUmbralCarga(patente: string, estacion: string, contrato: string, tipoUmbral: 'critico' | 'sospechoso' | 'revisar'): number | null {
        const patronKey = `${patente}||${estacion}`;
        const patronEsp = patronesPorCamionEstacion[patronKey];
        if (patronEsp && patronEsp.totalCargas >= 5) {
          const prom = patronEsp.litrosPromedio;
          if (tipoUmbral === 'critico') return prom * 0.35;
          if (tipoUmbral === 'sospechoso') return prom * 0.55;
          return prom * 0.70;
        }

        const patronCam = patronesPorCamion[patente];
        if (patronCam && patronCam.totalCargas >= 3) {
          const prom = patronCam.litrosPromedio;
          if (tipoUmbral === 'critico') return prom * 0.35;
          if (tipoUmbral === 'sospechoso') return prom * 0.55;
          return prom * 0.70;
        }

        const paramContrato = adaptativosPorScope[`CONTRATO||${contrato}||litros_carga_minimo`];
        if (paramContrato && paramContrato.total_muestras >= 10) {
          const umbral = paramContrato.umbral_anomalia;
          if (tipoUmbral === 'critico') return umbral * 0.5;
          if (tipoUmbral === 'sospechoso') return umbral * 0.7;
          return umbral * 0.85;
        }

        const paramGlobal = adaptativosPorScope[`GLOBAL||global||litros_carga_minimo`];
        if (paramGlobal) {
          const umbral = paramGlobal.umbral_anomalia;
          if (tipoUmbral === 'critico') return umbral * 0.5;
          if (tipoUmbral === 'sospechoso') return umbral * 0.7;
          return umbral * 0.85;
        }

        return null;
      }

      function getUmbralEntreCargas(contrato: string): number {
        const param = adaptativosPorScope[`CONTRATO||${contrato}||horas_minimas_entre_cargas`];
        if (param && param.total_muestras >= 10 && param.umbral_anomalia > 0) return param.umbral_anomalia;

        const global = adaptativosPorScope[`GLOBAL||global||horas_minimas_entre_cargas`];
        if (global && global.umbral_anomalia > 0) return global.umbral_anomalia;

        return 8;
      }

      function getUmbralEstanqueLleno(patente: string, contrato: string): number {
        const paramCamion = adaptativosPorScope[`CAMION||${patente}||fuel_level_antes_carga`];
        if (paramCamion && paramCamion.total_muestras >= 5) return paramCamion.umbral_anomalia;

        const paramContrato = adaptativosPorScope[`CONTRATO||${contrato}||fuel_level_antes_carga`];
        if (paramContrato && paramContrato.total_muestras >= 10) return paramContrato.umbral_anomalia;

        return 75;
      }

      interface CargaAnomalia {
        id: number;
        patente: string;
        conductor: string;
        contrato: string;
        fecha: string;
        hora: string;
        litros_sigetra: number;
        ecu_consumo_periodo: number | null;
        ecu_km_periodo: number | null;
        litros_delta: number | null;
        nivel_alerta: "NORMAL" | "REVISAR" | "SOSPECHOSO" | "CRITICO";
        tiene_cruce_ecu: boolean;
        razones: string[];
        odometro: number | null;
        criterio_tipo: string[];
      }

      function analizarCarga(carga: typeof cargasSigetra[0], todasCargasDia: typeof cargasSigetra): CargaAnomalia {
        const vin = carga.patente ? vinPorPatente[carga.patente] : null;
        const fechaCarga = new Date(carga.fecha);
        const ventanaAntes = new Date(fechaCarga.getTime() - ECU_VENTANA_ANTES_MS);
        const ventanaDespues = new Date(fechaCarga.getTime() + ECU_VENTANA_DESPUES_MS);
        const contrato = carga.faena?.trim() || "DEFAULT";

        let nivelAlerta: CargaAnomalia["nivel_alerta"] = "NORMAL";
        const razones: string[] = [];
        const criterioTipo: string[] = [];
        let litrosDelta: number | null = null;
        let ecuConsumoEntrePeriodo: number | null = null;
        let ecuKmEntrePeriodo: number | null = null;
        let tieneCruceEcu = false;

        if (vin) {
          const vinSnaps = snapsByVin[vin] || [];
          const snapsAntes = vinSnaps.filter(s =>
            new Date(s.capturedAt) >= ventanaAntes &&
            new Date(s.capturedAt) <= fechaCarga
          ).sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());

          const snapsDespues = vinSnaps.filter(s =>
            new Date(s.capturedAt) > fechaCarga &&
            new Date(s.capturedAt) <= ventanaDespues
          ).sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());

          if (snapsAntes.length > 0 && snapsDespues.length > 0) {
            tieneCruceEcu = true;
            const fuelUsedAntes = snapsAntes[0].totalFuelUsed;
            const fuelUsedDespues = snapsDespues[0].totalFuelUsed;
            const consumoEntrePeriodo = (fuelUsedDespues - fuelUsedAntes) / 1000;

            const distAntes = snapsAntes[0].totalDistance || 0;
            const distDespues = snapsDespues[0].totalDistance || 0;
            const kmEntrePeriodo = (distDespues - distAntes) / 1000;

            if (consumoEntrePeriodo < 0 || kmEntrePeriodo < 0) {
              ecuConsumoEntrePeriodo = null;
              ecuKmEntrePeriodo = null;
              razones.push("Datos ECU inconsistentes (posible reinicio de contador)");
              nivelAlerta = nivelAlerta === "NORMAL" ? "REVISAR" : nivelAlerta;
            } else {
              ecuConsumoEntrePeriodo = consumoEntrePeriodo;
              ecuKmEntrePeriodo = kmEntrePeriodo;

              if (carga.litrosSurtidor > 0 && consumoEntrePeriodo > carga.litrosSurtidor) {
                litrosDelta = consumoEntrePeriodo - carga.litrosSurtidor;
                const pctExceso = (litrosDelta / carga.litrosSurtidor) * 100;
                if (litrosDelta > 50 && pctExceso > 20) {
                  nivelAlerta = "CRITICO";
                  criterioTipo.push("ECU_VS_SIGETRA");
                  razones.push(
                    `ECU reporta ${consumoEntrePeriodo.toFixed(0)}L consumidos entre snapshots, pero Sigetra solo registro ${carga.litrosSurtidor}L cargados. Posible desvio de ${litrosDelta.toFixed(0)}L`
                  );
                } else if (litrosDelta > 25 && pctExceso > 10) {
                  nivelAlerta = "SOSPECHOSO";
                  criterioTipo.push("ECU_VS_SIGETRA");
                  razones.push(
                    `Alto consumo ECU (${consumoEntrePeriodo.toFixed(0)}L) vs carga Sigetra (${carga.litrosSurtidor}L) con solo ${kmEntrePeriodo.toFixed(0)}km recorridos`
                  );
                }
              }
            }
          }

          if (snapsAntes.length > 0 && carga.patente) {
            const snapMasReciente = snapsAntes[0];
            const fuelLevelPct = (snapMasReciente as any).fuelLevel1 || (snapMasReciente as any).fuelLevel || null;
            if (fuelLevelPct != null) {
              const nivel = Number(fuelLevelPct);
              const umbralAnticipada = getUmbralEstanqueLleno(carga.patente, contrato);
              if (nivel > umbralAnticipada) {
                nivelAlerta = nivelAlerta === "NORMAL" ? "SOSPECHOSO" : nivelAlerta;
                criterioTipo.push("CARGA_ANTICIPADA");
                razones.push(`Cargo con estanque al ${nivel}% — supera umbral de ${umbralAnticipada.toFixed(0)}%`);
              } else if (nivel > umbralAnticipada * 0.85) {
                nivelAlerta = nivelAlerta === "NORMAL" ? "REVISAR" : nivelAlerta;
                criterioTipo.push("CARGA_ANTICIPADA");
                razones.push(`Cargo con estanque al ${nivel}% — cercano al umbral de ${umbralAnticipada.toFixed(0)}%`);
              }
            }
          }

          if (carga.patente && !criterioTipo.includes("DOBLE_CARGA_RAPIDA")) {
            const umbralHoras = getUmbralEntreCargas(contrato);
            {
              const cargasMismaPatente = todasCargasDia.filter(c => c.patente === carga.patente && c.id !== carga.id);
              const fechaActual = fechaCarga.getTime();
              let dobleCargaDetectada = false;
              for (const otra of cargasMismaPatente) {
                if (dobleCargaDetectada) break;
                const fechaOtra = new Date(otra.fecha).getTime();
                const diffHoras = Math.abs(fechaActual - fechaOtra) / (1000 * 60 * 60);
                if (diffHoras < umbralHoras && fechaOtra < fechaActual) {
                  const vinSnapsAll = snapsByVin[vin!] || [];
                  const snapEntre1 = vinSnapsAll.filter(s => {
                    const t = new Date(s.capturedAt).getTime();
                    return t >= fechaOtra && t <= fechaActual;
                  }).sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
                  if (snapEntre1.length >= 2) {
                    const primero = snapEntre1[0];
                    const ultimo = snapEntre1[snapEntre1.length - 1];
                    const distDelta = ((ultimo.totalDistance || 0) - (primero.totalDistance || 0));
                    if (distDelta < 0) continue;
                    const kmEntre = distDelta / 1000;
                    if (kmEntre < 100) {
                      nivelAlerta = "CRITICO";
                      criterioTipo.push("DOBLE_CARGA_RAPIDA");
                      razones.push(`Dos cargas en ${diffHoras.toFixed(1)}h con solo ${kmEntre.toFixed(0)}km recorridos segun ECU — minimo aprendido: ${umbralHoras.toFixed(1)}h entre cargas`);
                      dobleCargaDetectada = true;
                    } else if (kmEntre < 200) {
                      nivelAlerta = nivelAlerta === "NORMAL" ? "SOSPECHOSO" : nivelAlerta;
                      criterioTipo.push("DOBLE_CARGA_RAPIDA");
                      razones.push(`Segunda carga en ${diffHoras.toFixed(1)}h con ${kmEntre.toFixed(0)}km — verificar necesidad operacional`);
                      dobleCargaDetectada = true;
                    }
                  } else if (diffHoras < umbralHoras * 0.5) {
                    nivelAlerta = nivelAlerta === "NORMAL" ? "REVISAR" : nivelAlerta;
                    criterioTipo.push("DOBLE_CARGA_RAPIDA");
                    razones.push(`Doble carga en ${diffHoras.toFixed(1)}h cuando el minimo aprendido es ${umbralHoras.toFixed(1)}h — sin datos ECU para validar km`);
                    dobleCargaDetectada = true;
                  }
                }
              }
            }
          }
        }

        const litros = carga.litrosSurtidor || 0;
        if (litros > 0 && carga.patente) {
          const estacion = carga.lugarConsumo?.trim() || "";
          const umbralCritico = getUmbralCarga(carga.patente, estacion, contrato, 'critico');
          const umbralSospechoso = getUmbralCarga(carga.patente, estacion, contrato, 'sospechoso');
          const umbralRevisar = getUmbralCarga(carga.patente, estacion, contrato, 'revisar');

          if (umbralCritico === null) {
            razones.push("Sin historial suficiente para evaluar esta carga — acumulando datos");
          } else {
            if (litros < umbralCritico) {
              nivelAlerta = "CRITICO";
              criterioTipo.push("MICRO_CARGA");
              razones.push(`Micro carga: ${litros}L muy por debajo del minimo aprendido (${umbralCritico.toFixed(0)}L) basado en historial real de este camion`);
            } else if (umbralSospechoso !== null && litros < umbralSospechoso) {
              nivelAlerta = nivelAlerta === "NORMAL" ? "SOSPECHOSO" : nivelAlerta;
              criterioTipo.push("MICRO_CARGA");
              razones.push(`Carga baja: ${litros}L bajo el umbral aprendido de ${umbralSospechoso.toFixed(0)}L`);
            } else if (umbralRevisar !== null && litros < umbralRevisar) {
              nivelAlerta = nivelAlerta === "NORMAL" ? "REVISAR" : nivelAlerta;
              criterioTipo.push("MICRO_CARGA");
              razones.push(`Carga menor al promedio historico de este camion en esta estacion`);
            }
          }
        }

        if (!carga.lugarConsumo || carga.lugarConsumo.trim() === "") {
          nivelAlerta = nivelAlerta === "NORMAL" ? "REVISAR" : nivelAlerta;
          razones.push("Carga sin lugar de consumo registrado en Sigetra");
        }

        return {
          id: carga.id,
          patente: carga.patente || "Sin patente",
          conductor: carga.conductor || "Sin asignar",
          contrato,
          fecha: carga.fecha,
          hora: fechaCarga.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
          litros_sigetra: litros,
          ecu_consumo_periodo: ecuConsumoEntrePeriodo,
          ecu_km_periodo: ecuKmEntrePeriodo,
          litros_delta: litrosDelta,
          nivel_alerta: nivelAlerta,
          tiene_cruce_ecu: tieneCruceEcu,
          razones,
          odometro: carga.kmActual || null,
          criterio_tipo: criterioTipo,
        };
      }

      const porEstacion: Record<string, {
        nombre: string;
        ciudad: string;
        lat: number | null;
        lng: number | null;
        cargas: CargaAnomalia[];
        total_litros: number;
        total_cargas: number;
        camiones_distintos: number;
        tiene_anomalias: boolean;
        alertas_count: number;
      }> = {};

      for (const carga of cargasSigetra) {
        const lugar = carga.lugarConsumo || "Desconocido";

        if (!porEstacion[lugar]) {
          const est = ESTACIONES_COMBUSTIBLE[lugar];
          porEstacion[lugar] = {
            nombre: lugar,
            ciudad: est?.ciudad || "",
            lat: est?.lat || null,
            lng: est?.lng || null,
            cargas: [],
            total_litros: 0,
            total_cargas: 0,
            camiones_distintos: 0,
            tiene_anomalias: false,
            alertas_count: 0,
          };
        }

        const anomalia = analizarCarga(carga, cargasSigetra);
        porEstacion[lugar].cargas.push(anomalia);
        porEstacion[lugar].total_litros += carga.litrosSurtidor || 0;
        porEstacion[lugar].total_cargas++;

        if (anomalia.nivel_alerta !== "NORMAL") {
          porEstacion[lugar].tiene_anomalias = true;
          porEstacion[lugar].alertas_count++;
        }
      }

      for (const est of Object.values(porEstacion)) {
        const patentes = new Set(est.cargas.map(c => c.patente));
        est.camiones_distintos = patentes.size;
      }

      const estaciones = Object.values(porEstacion)
        .sort((a, b) => {
          if (a.alertas_count !== b.alertas_count) return b.alertas_count - a.alertas_count;
          return b.total_litros - a.total_litros;
        });

      interface BalancePeriodo {
        patente: string;
        contrato: string;
        litros_cargados_sigetra: number;
        litros_consumidos_ecu: number;
        km_ecu: number;
        diferencia: number;
        pct_exceso: number;
        nivel: "NORMAL" | "SOSPECHOSO" | "CRITICO";
        mensaje: string;
        fecha_inicio: string;
        fecha_fin: string;
        rendimiento: number | null;
      }
      const balancesDia: BalancePeriodo[] = [];

      const viajesR = await pool.query(`
        SELECT v.id, v.vin, v.fecha_inicio, v.fecha_fin, v.contrato,
               v.km_ecu, v.litros_consumidos_ecu, v.litros_cargados_sigetra,
               v.rendimiento_real, v.delta_cuadratura,
               c.patente
        FROM viajes_aprendizaje v
        JOIN camiones c ON v.camion_id = c.id
        WHERE v.fecha_inicio >= $1 AND v.fecha_inicio <= $2
          AND v.sigetra_cruzado = true
          AND v.litros_cargados_sigetra IS NOT NULL
          AND v.litros_cargados_sigetra > 0
          AND v.km_ecu IS NOT NULL AND CAST(v.km_ecu AS numeric) >= 100
          AND v.litros_consumidos_ecu IS NOT NULL AND CAST(v.litros_consumidos_ecu AS numeric) >= 50
        ORDER BY v.delta_cuadratura DESC NULLS LAST
      `, [desdeStr, hastaStr]);

      for (const viaje of viajesR.rows) {
        const litrosCargados = parseFloat(viaje.litros_cargados_sigetra) || 0;
        const litrosEcu = parseFloat(viaje.litros_consumidos_ecu) || 0;
        const kmEcu = parseFloat(viaje.km_ecu) || 0;
        const rendimiento = viaje.rendimiento_real ? parseFloat(viaje.rendimiento_real) : null;

        if (litrosEcu <= 0) continue;

        const diferencia = litrosCargados - litrosEcu;
        const pctExceso = (litrosCargados / litrosEcu - 1) * 100;
        const contrato = viaje.contrato || "";

        let nivel: BalancePeriodo["nivel"] = "NORMAL";
        let mensaje = "";

        if (litrosCargados > litrosEcu * 1.8 && diferencia > 100) {
          nivel = "CRITICO";
          mensaje = `Periodo ${viaje.patente}: cargo ${Math.round(litrosCargados)}L pero ECU consumio ${Math.round(litrosEcu)}L en ${Math.round(kmEcu)}km. Exceso: ${Math.round(diferencia)}L (${Math.round(pctExceso)}%) — ${contrato}`;
        } else if (litrosCargados > litrosEcu * 1.4 && diferencia > 50) {
          nivel = "SOSPECHOSO";
          mensaje = `Periodo ${viaje.patente}: cargo ${Math.round(litrosCargados)}L pero ECU consumio ${Math.round(litrosEcu)}L en ${Math.round(kmEcu)}km. Exceso: ${Math.round(diferencia)}L (${Math.round(pctExceso)}%) — ${contrato}`;
        }

        if (nivel !== "NORMAL") {
          balancesDia.push({
            patente: viaje.patente || "Sin patente",
            contrato,
            litros_cargados_sigetra: Math.round(litrosCargados),
            litros_consumidos_ecu: Math.round(litrosEcu),
            km_ecu: Math.round(kmEcu),
            diferencia: Math.round(diferencia),
            pct_exceso: Math.round(pctExceso),
            nivel,
            mensaje,
            fecha_inicio: viaje.fecha_inicio,
            fecha_fin: viaje.fecha_fin,
            rendimiento,
          });
        }
      }
      balancesDia.sort((a, b) => b.pct_exceso - a.pct_exceso);

      const resumen = {
        total_estaciones: estaciones.length,
        total_cargas: cargasSigetra.length,
        total_litros: cargasSigetra.reduce((s, c) => s + (c.litrosSurtidor || 0), 0),
        estaciones_con_anomalias: estaciones.filter(e => e.tiene_anomalias).length,
        cargas_anomalas: estaciones.reduce((s, e) => s + e.alertas_count, 0),
        cargas_criticas: estaciones.reduce((s, e) =>
          s + e.cargas.filter(c => c.nivel_alerta === "CRITICO").length, 0),
        balance_periodos: {
          total_analizados: viajesR.rows.length,
          sospechosos: balancesDia.filter(b => b.nivel === "SOSPECHOSO").length,
          criticos: balancesDia.filter(b => b.nivel === "CRITICO").length,
        },
        cobertura: {
          camiones_volvo: patentesVolvo.size,
          cargas_con_cruce_ecu: cargasConCruceCount,
          cargas_volvo_sin_cruce: cargasSinCruceCount,
          cargas_total_sigetra: cargasSigetraAll.length,
          cargas_no_volvo: cargasExcluidas,
        },
        periodo: {
          desde: desde.toISOString(),
          hasta: hasta.toISOString(),
          label: `Anteayer ${anteayer.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}`,
        },
      };

      res.json({ resumen, estaciones, balances_dia: balancesDia });
    } catch (error: any) {
      console.error("[estaciones] Error analisis:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/estaciones/aprender", async (req: Request, res: Response) => {
    try {
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
        if (litros <= 0 || !pat) continue;

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
        const min = Math.min(...litros);
        const max = Math.max(...litros);
        let confianza = "BAJA";
        if (n >= 30) confianza = "EXPERTA";
        else if (n >= 15) confianza = "ALTA";
        else if (n >= 5) confianza = "MEDIA";
        return { mean: Math.round(mean * 100) / 100, stddev: Math.round(stddev * 100) / 100, min, max, confianza, n };
      }

      const inserts: any[] = [];

      for (const [pat, data] of porCamion) {
        if (data.litros.length < 3) continue;
        const stats = calcStats(data.litros);
        inserts.push({
          scopeTipo: "CAMION",
          scopeId: pat,
          patente: pat,
          contrato: data.contrato,
          cargaTipica: String(stats.mean),
          cargaDesviacion: String(stats.stddev),
          cargaMinima: String(stats.min),
          cargaMaxima: String(stats.max),
          totalCargas: stats.n,
          confianza: stats.confianza,
          ultimaCarga: data.ultimaFecha ? new Date(data.ultimaFecha) : null,
          activo: true,
        });
      }

      for (const [, data] of porCamionEstacion) {
        if (data.litros.length < 3) continue;
        if (!data.estacion) continue;
        const stats = calcStats(data.litros);
        inserts.push({
          scopeTipo: "CAMION_ESTACION",
          scopeId: `${data.patente}||${data.estacion}`,
          patente: data.patente,
          estacionNombre: data.estacion,
          contrato: data.contrato,
          cargaTipica: String(stats.mean),
          cargaDesviacion: String(stats.stddev),
          cargaMinima: String(stats.min),
          cargaMaxima: String(stats.max),
          totalCargas: stats.n,
          confianza: stats.confianza,
          ultimaCarga: data.ultimaFecha ? new Date(data.ultimaFecha) : null,
          activo: true,
        });
      }

      await db.transaction(async (tx) => {
        await tx.delete(patronesCargaCombustible).where(sql`1=1`);
        if (inserts.length > 0) {
          const batch = 100;
          for (let i = 0; i < inserts.length; i += batch) {
            await tx.insert(patronesCargaCombustible).values(inserts.slice(i, i + batch));
          }
        }
      });

      const totalCamion = inserts.filter(i => i.scopeTipo === "CAMION").length;
      const totalCamionEstacion = inserts.filter(i => i.scopeTipo === "CAMION_ESTACION").length;

      const porContrato = new Map<string, number[]>();
      const litrosPorCamion = new Map<string, number[]>();
      const horasEntreCargas = new Map<string, number[]>();

      const cargasOrdenadas = [...allCargas].sort((a, b) => {
        if (a.patente !== b.patente) return (a.patente || "").localeCompare(b.patente || "");
        return a.fecha.localeCompare(b.fecha);
      });

      let prevPorPatente: Record<string, { fecha: string }> = {};
      for (const c of cargasOrdenadas) {
        const litros = Number(c.litrosSurtidor);
        if (litros <= 0 || !c.patente) continue;
        const contrato = c.contrato || "DEFAULT";

        if (!porContrato.has(contrato)) porContrato.set(contrato, []);
        porContrato.get(contrato)!.push(litros);

        if (!litrosPorCamion.has(c.patente)) litrosPorCamion.set(c.patente, []);
        litrosPorCamion.get(c.patente)!.push(litros);

        if (prevPorPatente[c.patente]) {
          const diffMs = new Date(c.fecha).getTime() - new Date(prevPorPatente[c.patente].fecha).getTime();
          const diffHoras = diffMs / (1000 * 60 * 60);
          if (diffHoras > 0 && diffHoras < 168) {
            if (!horasEntreCargas.has(contrato)) horasEntreCargas.set(contrato, []);
            horasEntreCargas.get(contrato)!.push(diffHoras);
          }
        }
        prevPorPatente[c.patente] = { fecha: c.fecha };
      }

      function calcStatsFull(values: number[]) {
        const n = values.length;
        if (n < 3) return null;
        const mean = values.reduce((s, v) => s + v, 0) / n;
        const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n > 1 ? n - 1 : 1);
        const stddev = Math.sqrt(variance);
        const confianza = n >= 200 ? "EXPERTA" : n >= 50 ? "ALTA" : n >= 10 ? "MEDIA" : "BAJA";
        return { mean, stddev, min: Math.min(...values), max: Math.max(...values), confianza, n };
      }

      let adaptativosCreados = 0;

      for (const [contrato, litros] of porContrato) {
        const stats = calcStatsFull(litros);
        if (!stats) continue;
        await pool.query(`
          INSERT INTO parametros_adaptativos
            (scope_tipo, scope_id, parametro, valor_promedio, valor_desviacion, valor_minimo, valor_maximo,
             umbral_revisar, umbral_anomalia, umbral_critico, total_muestras, confianza, ultima_actualizacion)
          VALUES ('CONTRATO', $1, 'litros_carga_minimo', $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (scope_tipo, scope_id, parametro) DO UPDATE SET
            valor_promedio = EXCLUDED.valor_promedio, valor_desviacion = EXCLUDED.valor_desviacion,
            valor_minimo = EXCLUDED.valor_minimo, valor_maximo = EXCLUDED.valor_maximo,
            umbral_revisar = EXCLUDED.umbral_revisar, umbral_anomalia = EXCLUDED.umbral_anomalia,
            umbral_critico = EXCLUDED.umbral_critico, total_muestras = EXCLUDED.total_muestras,
            confianza = EXCLUDED.confianza, ultima_actualizacion = NOW()
        `, [contrato, stats.mean, stats.stddev, stats.min, stats.max,
            stats.mean * 0.70, stats.mean * 0.55, stats.mean * 0.35,
            stats.n, stats.confianza]);
        adaptativosCreados++;
      }

      const allLitros = [...porContrato.values()].flat();
      const globalStats = calcStatsFull(allLitros);
      if (globalStats) {
        await pool.query(`
          INSERT INTO parametros_adaptativos
            (scope_tipo, scope_id, parametro, valor_promedio, valor_desviacion, valor_minimo, valor_maximo,
             umbral_revisar, umbral_anomalia, umbral_critico, total_muestras, confianza, ultima_actualizacion)
          VALUES ('GLOBAL', 'global', 'litros_carga_minimo', $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (scope_tipo, scope_id, parametro) DO UPDATE SET
            valor_promedio = EXCLUDED.valor_promedio, valor_desviacion = EXCLUDED.valor_desviacion,
            valor_minimo = EXCLUDED.valor_minimo, valor_maximo = EXCLUDED.valor_maximo,
            umbral_revisar = EXCLUDED.umbral_revisar, umbral_anomalia = EXCLUDED.umbral_anomalia,
            umbral_critico = EXCLUDED.umbral_critico, total_muestras = EXCLUDED.total_muestras,
            confianza = EXCLUDED.confianza, ultima_actualizacion = NOW()
        `, [globalStats.mean, globalStats.stddev, globalStats.min, globalStats.max,
            globalStats.mean * 0.70, globalStats.mean * 0.55, globalStats.mean * 0.35,
            globalStats.n, globalStats.confianza]);
        adaptativosCreados++;
      }

      for (const [contrato, horas] of horasEntreCargas) {
        const stats = calcStatsFull(horas);
        if (!stats) continue;
        const percentile10 = [...horas].sort((a, b) => a - b)[Math.floor(horas.length * 0.10)] || stats.min;
        await pool.query(`
          INSERT INTO parametros_adaptativos
            (scope_tipo, scope_id, parametro, valor_promedio, valor_desviacion, valor_minimo, valor_maximo,
             umbral_revisar, umbral_anomalia, umbral_critico, total_muestras, confianza, ultima_actualizacion)
          VALUES ('CONTRATO', $1, 'horas_minimas_entre_cargas', $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (scope_tipo, scope_id, parametro) DO UPDATE SET
            valor_promedio = EXCLUDED.valor_promedio, valor_desviacion = EXCLUDED.valor_desviacion,
            valor_minimo = EXCLUDED.valor_minimo, valor_maximo = EXCLUDED.valor_maximo,
            umbral_revisar = EXCLUDED.umbral_revisar, umbral_anomalia = EXCLUDED.umbral_anomalia,
            umbral_critico = EXCLUDED.umbral_critico, total_muestras = EXCLUDED.total_muestras,
            confianza = EXCLUDED.confianza, ultima_actualizacion = NOW()
        `, [contrato, stats.mean, stats.stddev, stats.min, stats.max,
            percentile10 * 0.75, percentile10, percentile10 * 0.5,
            stats.n, stats.confianza]);
        adaptativosCreados++;
      }

      const allHoras = [...horasEntreCargas.values()].flat();
      const globalHoras = calcStatsFull(allHoras);
      if (globalHoras) {
        const p10 = [...allHoras].sort((a, b) => a - b)[Math.floor(allHoras.length * 0.10)] || globalHoras.min;
        await pool.query(`
          INSERT INTO parametros_adaptativos
            (scope_tipo, scope_id, parametro, valor_promedio, valor_desviacion, valor_minimo, valor_maximo,
             umbral_revisar, umbral_anomalia, umbral_critico, total_muestras, confianza, ultima_actualizacion)
          VALUES ('GLOBAL', 'global', 'horas_minimas_entre_cargas', $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (scope_tipo, scope_id, parametro) DO UPDATE SET
            valor_promedio = EXCLUDED.valor_promedio, valor_desviacion = EXCLUDED.valor_desviacion,
            valor_minimo = EXCLUDED.valor_minimo, valor_maximo = EXCLUDED.valor_maximo,
            umbral_revisar = EXCLUDED.umbral_revisar, umbral_anomalia = EXCLUDED.umbral_anomalia,
            umbral_critico = EXCLUDED.umbral_critico, total_muestras = EXCLUDED.total_muestras,
            confianza = EXCLUDED.confianza, ultima_actualizacion = NOW()
        `, [globalHoras.mean, globalHoras.stddev, globalHoras.min, globalHoras.max,
            p10 * 0.75, p10, p10 * 0.5,
            globalHoras.n, globalHoras.confianza]);
        adaptativosCreados++;
      }

      console.log(`[aprendizaje] Patrones generados: ${totalCamion} CAMION + ${totalCamionEstacion} CAMION_ESTACION de ${allCargas.length} cargas. Adaptativos: ${adaptativosCreados}`);
      res.json({
        ok: true,
        patrones_camion: totalCamion,
        patrones_camion_estacion: totalCamionEstacion,
        cargas_procesadas: allCargas.length,
        adaptativos_generados: adaptativosCreados,
      });
    } catch (error: any) {
      console.error("[aprendizaje] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/estaciones/aprendizaje", async (req: Request, res: Response) => {
    try {
      const patronesPorConfianza = await db.select({
        confianza: patronesCargaCombustible.confianza,
        cantidad: count(),
      }).from(patronesCargaCombustible)
        .where(eq(patronesCargaCombustible.activo, true))
        .groupBy(patronesCargaCombustible.confianza);

      const camionesConPatron = await db.select({
        cantidad: count(),
      }).from(patronesCargaCombustible)
        .where(and(
          eq(patronesCargaCombustible.scopeTipo, "CAMION"),
          eq(patronesCargaCombustible.activo, true),
        ));

      const estacionesConocidas = await db.select({
        cantidad: count(),
      }).from(patronesCargaCombustible)
        .where(and(
          eq(patronesCargaCombustible.scopeTipo, "CAMION_ESTACION"),
          eq(patronesCargaCombustible.activo, true),
        ));

      const camionesConVinA = await db.select()
        .from(camiones)
        .where(isNotNull(camiones.vin));
      const patentesVolvoA = new Set(camionesConVinA.filter(c => c.patente && c.vin).map(c => c.patente!));

      const totalCargasRaw = await db.select({
        patente: cargas.patente,
      }).from(cargas).where(and(isNotNull(cargas.patente), sql`${cargas.litrosSurtidor} > 0`));
      const totalCargasHistoricasCount = totalCargasRaw.filter(c => c.patente && patentesVolvoA.has(c.patente)).length;

      const topCamiones = await db.select()
        .from(patronesCargaCombustible)
        .where(and(
          eq(patronesCargaCombustible.scopeTipo, "CAMION"),
          eq(patronesCargaCombustible.activo, true),
        ))
        .orderBy(desc(patronesCargaCombustible.totalCargas))
        .limit(5);

      const topEstaciones = await db.select({
        estacion: patronesCargaCombustible.estacionNombre,
        total_cargas: sql<number>`SUM(${patronesCargaCombustible.totalCargas})::int`,
        camiones: count(),
      }).from(patronesCargaCombustible)
        .where(and(
          eq(patronesCargaCombustible.scopeTipo, "CAMION_ESTACION"),
          eq(patronesCargaCombustible.activo, true),
        ))
        .groupBy(patronesCargaCombustible.estacionNombre)
        .orderBy(desc(sql`SUM(${patronesCargaCombustible.totalCargas})`))
        .limit(5);

      const ultimaAct = await db.select({
        ultima: sql<string>`MAX(${patronesCargaCombustible.ultimaActualizacion})`,
      }).from(patronesCargaCombustible);

      const totalPatrones = patronesPorConfianza.reduce((s, p) => s + Number(p.cantidad), 0);
      const patronesAltos = patronesPorConfianza
        .filter(p => ["ALTA", "EXPERTA"].includes(p.confianza || ""))
        .reduce((s, p) => s + Number(p.cantidad), 0);
      const madurezPct = totalPatrones > 0 ? Math.round((patronesAltos / totalPatrones) * 100) : 0;

      const porConfianza = patronesPorConfianza.reduce((acc, p) => {
        acc[p.confianza || "BAJA"] = Number(p.cantidad);
        return acc;
      }, {} as Record<string, number>);

      function generarMensajeAprendizaje(patrones: number, madurez: number, cargasCount: number): string {
        if (patrones === 0) return "Iniciando aprendizaje — procesando primeras cargas historicas";
        if (madurez < 20) return `Aprendiendo — ${patrones} patrones identificados con ${cargasCount.toLocaleString("es-CL")} cargas historicas. Confianza aumenta con el tiempo.`;
        if (madurez < 50) return `Sistema en calibracion — ${patrones} patrones activos. Deteccion mejorando semana a semana.`;
        if (madurez < 80) return `Sistema calibrado — ${patrones} patrones con alta confianza. Deteccion de anomalias confiable.`;
        return `Sistema experto — ${patrones} patrones calibrados. Deteccion precisa basada en historial real.`;
      }

      res.json({
        resumen: {
          total_patrones: totalPatrones,
          camiones_con_patron: Number(camionesConPatron[0]?.cantidad || 0),
          pares_camion_estacion: Number(estacionesConocidas[0]?.cantidad || 0),
          estaciones_conocidas: Number(estacionesConocidas[0]?.cantidad || 0),
          cargas_historicas: totalCargasHistoricasCount,
          madurez_pct: madurezPct,
          ultima_actualizacion: ultimaAct[0]?.ultima || null,
          por_confianza: {
            experta: porConfianza["EXPERTA"] || 0,
            alta: porConfianza["ALTA"] || 0,
            media: porConfianza["MEDIA"] || 0,
            baja: porConfianza["BAJA"] || 0,
          },
          mensaje: generarMensajeAprendizaje(totalPatrones, madurezPct, totalCargasHistoricasCount),
        },
        total_patrones: totalPatrones,
        patrones_por_confianza: porConfianza,
        camiones_con_patron: Number(camionesConPatron[0]?.cantidad || 0),
        pares_camion_estacion: Number(estacionesConocidas[0]?.cantidad || 0),
        total_cargas_historicas: totalCargasHistoricasCount,
        madurez_pct: madurezPct,
        top_camiones: topCamiones.map(p => ({
          patente: p.patente,
          contrato: p.contrato,
          carga_tipica: Number(p.cargaTipica),
          desviacion: Number(p.cargaDesviacion),
          total_cargas: p.totalCargas,
          totalCargas: p.totalCargas,
          confianza: p.confianza,
        })),
        top_estaciones: topEstaciones.map(e => ({
          estacion: e.estacion,
          total_cargas: Number(e.total_cargas),
          camiones: Number(e.camiones),
        })),
        ultima_actualizacion: ultimaAct[0]?.ultima || null,
      });
    } catch (error: any) {
      console.error("[aprendizaje] Error GET:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/estaciones/resumen-inteligencia", async (req: Request, res: Response) => {
    try {
      const allPatrones = await db.select().from(patronesCargaCombustible).where(eq(patronesCargaCombustible.activo, true));

      const patronesCamion = allPatrones.filter(p => p.scopeTipo === "CAMION");
      const patronesCamionEstacion = allPatrones.filter(p => p.scopeTipo === "CAMION_ESTACION");

      const totalCargas = allPatrones.reduce((s, p) => s + (p.totalCargas || 0), 0);
      const confianzaCount: Record<string, number> = {};
      for (const p of allPatrones) {
        confianzaCount[p.confianza || "BAJA"] = (confianzaCount[p.confianza || "BAJA"] || 0) + 1;
      }

      const estacionesUnicas = new Set(patronesCamionEstacion.map(p => p.estacionNombre).filter(Boolean));
      const patentesUnicas = new Set(patronesCamion.map(p => p.patente).filter(Boolean));

      const cargasTipicas = patronesCamion.map(p => Number(p.cargaTipica)).filter(v => v > 0);
      const avgCargaFlota = cargasTipicas.length > 0 ? Math.round(cargasTipicas.reduce((a, b) => a + b, 0) / cargasTipicas.length) : 0;
      const maxCarga = cargasTipicas.length > 0 ? Math.round(Math.max(...cargasTipicas)) : 0;
      const minCarga = cargasTipicas.length > 0 ? Math.round(Math.min(...cargasTipicas)) : 0;

      const desviaciones = patronesCamion.map(p => Number(p.cargaDesviacion)).filter(v => v >= 0);
      const avgDesviacion = desviaciones.length > 0 ? Math.round(desviaciones.reduce((a, b) => a + b, 0) / desviaciones.length) : 0;

      const camionesExpertos = patronesCamion.filter(p => p.confianza === "EXPERTA");
      const camionesAltos = patronesCamion.filter(p => p.confianza === "ALTA");

      const topConsumidores = [...patronesCamion].sort((a, b) => Number(b.cargaTipica) - Number(a.cargaTipica)).slice(0, 3);
      const topEficientes = [...patronesCamion].sort((a, b) => Number(a.cargaTipica) - Number(b.cargaTipica)).slice(0, 3);
      const masConsistentes = [...patronesCamion].filter(p => (p.totalCargas ?? 0) >= 5).sort((a, b) => Number(a.cargaDesviacion) - Number(b.cargaDesviacion)).slice(0, 3);
      const menosConsistentes = [...patronesCamion].filter(p => (p.totalCargas ?? 0) >= 5).sort((a, b) => Number(b.cargaDesviacion) - Number(a.cargaDesviacion)).slice(0, 3);

      const estacionStats = new Map<string, { totalCargas: number; camiones: Set<string>; avgLitros: number[] }>();
      for (const p of patronesCamionEstacion) {
        const key = p.estacionNombre || "Desconocida";
        if (!estacionStats.has(key)) estacionStats.set(key, { totalCargas: 0, camiones: new Set(), avgLitros: [] });
        const s = estacionStats.get(key)!;
        s.totalCargas += p.totalCargas || 0;
        if (p.patente) s.camiones.add(p.patente);
        s.avgLitros.push(Number(p.cargaTipica));
      }

      const estacionesRanked = [...estacionStats.entries()]
        .map(([nombre, s]) => ({
          nombre,
          totalCargas: s.totalCargas,
          camiones: s.camiones.size,
          avgLitros: Math.round(s.avgLitros.reduce((a, b) => a + b, 0) / s.avgLitros.length),
        }))
        .sort((a, b) => b.totalCargas - a.totalCargas);

      const contratos = new Set(patronesCamion.map(p => p.contrato).filter(Boolean));
      const contratoStats: { contrato: string; camiones: number; avgCarga: number }[] = [];
      for (const c of contratos) {
        const pats = patronesCamion.filter(p => p.contrato === c);
        const avg = pats.reduce((s, p) => s + Number(p.cargaTipica), 0) / pats.length;
        contratoStats.push({ contrato: c!, camiones: pats.length, avgCarga: Math.round(avg) });
      }
      contratoStats.sort((a, b) => b.camiones - a.camiones);

      const insights: string[] = [];

      insights.push(`El sistema ha analizado ${totalCargas.toLocaleString("es-CL")} cargas historicas y ha generado ${allPatrones.length.toLocaleString("es-CL")} patrones de comportamiento para ${patentesUnicas.size} camiones en ${estacionesUnicas.size} estaciones.`);

      if (camionesExpertos.length > 0 || camionesAltos.length > 0) {
        insights.push(`Confianza del modelo: ${camionesExpertos.length} camiones con nivel EXPERTA (30+ cargas) y ${camionesAltos.length} con nivel ALTA (15-29 cargas). Estos camiones tienen patrones estables que permiten detectar anomalias con precision.`);
      }

      insights.push(`Carga tipica de la flota: promedio ${avgCargaFlota} L por carga, rango entre ${minCarga} L y ${maxCarga} L. La desviacion promedio es de ${avgDesviacion} L.`);

      if (topConsumidores.length > 0) {
        const tc = topConsumidores.map(p => `${p.patente} (${Math.round(Number(p.cargaTipica))} L)`).join(", ");
        insights.push(`Camiones con mayor carga tipica: ${tc}.`);
      }
      if (topEficientes.length > 0) {
        const te = topEficientes.map(p => `${p.patente} (${Math.round(Number(p.cargaTipica))} L)`).join(", ");
        insights.push(`Camiones con menor carga tipica: ${te}.`);
      }
      if (masConsistentes.length > 0) {
        const mc = masConsistentes.map(p => `${p.patente} (desv. ${Math.round(Number(p.cargaDesviacion))} L)`).join(", ");
        insights.push(`Camiones mas consistentes (menor desviacion): ${mc}. Estos camiones cargan cantidades muy similares cada vez.`);
      }
      if (menosConsistentes.length > 0) {
        const lc = menosConsistentes.map(p => `${p.patente} (desv. ${Math.round(Number(p.cargaDesviacion))} L)`).join(", ");
        insights.push(`Camiones mas variables (mayor desviacion): ${lc}. Patrones irregulares pueden indicar rutas diversas o anomalias en carga.`);
      }

      if (estacionesRanked.length > 0) {
        const topEst = estacionesRanked.slice(0, 3);
        const estDesc = topEst.map(e => `${e.nombre} (${e.totalCargas} cargas, ${e.camiones} camiones, prom. ${e.avgLitros} L)`).join("; ");
        insights.push(`Estaciones mas frecuentadas: ${estDesc}.`);
      }

      if (contratoStats.length > 0) {
        const cDesc = contratoStats.map(c => `${c.contrato}: ${c.camiones} camiones, prom. ${c.avgCarga} L`).join("; ");
        insights.push(`Comportamiento por contrato: ${cDesc}.`);
      }

      const patronesBaja = confianzaCount["BAJA"] || 0;
      const patronesMedia = confianzaCount["MEDIA"] || 0;
      if (patronesBaja + patronesMedia > 0) {
        insights.push(`Hay ${patronesBaja + patronesMedia} patrones con confianza BAJA o MEDIA que necesitan mas datos para ser fiables. Con mas cargas historicas, estos patrones mejoraran automaticamente.`);
      }

      res.json({
        insights,
        stats: {
          total_patrones: allPatrones.length,
          patrones_camion: patronesCamion.length,
          patrones_camion_estacion: patronesCamionEstacion.length,
          camiones: patentesUnicas.size,
          estaciones: estacionesUnicas.size,
          avg_carga_flota: avgCargaFlota,
          desviacion_promedio: avgDesviacion,
          rango: { min: minCarga, max: maxCarga },
          confianza: confianzaCount,
          contratos: contratoStats,
          top_consumidores: topConsumidores.map(p => ({ patente: p.patente, litros: Math.round(Number(p.cargaTipica)), cargas: p.totalCargas })),
          top_eficientes: topEficientes.map(p => ({ patente: p.patente, litros: Math.round(Number(p.cargaTipica)), cargas: p.totalCargas })),
          top_estaciones: estacionesRanked.slice(0, 5),
        },
      });
    } catch (error: any) {
      console.error("[resumen-inteligencia] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/estaciones/periodos-entre-cargas", async (req: Request, res: Response) => {
    try {
      const calcularPeriodoEntreCargas = async (_p: string, _a: any, _b: any): Promise<any> => ({ kmEcu: 0, litrosConsumidosEcu: 0, snapCount: 0, periodoAbierto: true, horasPeriodo: 0, rendimientoEcu: 0, coberturaPct: 0, calidadDatos: "SIN_DATOS" });
      const evaluarPeriodo = (_p: any): any => ({ ok: false, detalle: "No disponible", nivel: "SIN_DATOS", razones: [], score: 0, evaluable: false, balanceLitros: 0, balancePct: 0, rendimientoReal: 0 });

      const hoy = new Date();
      const anteayer = new Date(hoy);
      anteayer.setDate(anteayer.getDate() - 2);
      const desdeAyer = new Date(anteayer);
      desdeAyer.setHours(0, 0, 0, 0);
      const hastaAyer = new Date(anteayer);
      hastaAyer.setHours(23, 59, 59, 999);

      const camionesConVin = await db.select().from(camiones).where(
        and(isNotNull(camiones.vin), ne(camiones.vin, ""))
      );
      const vinPorPatente: Record<string, string> = {};
      for (const c of camionesConVin) {
        if (c.patente && c.vin) vinPorPatente[c.patente] = c.vin;
      }
      const patentesVolvo = new Set(Object.keys(vinPorPatente));

      const desdePrevio = new Date(desdeAyer);
      desdePrevio.setDate(desdePrevio.getDate() - 2);
      const hastaPost = new Date(hastaAyer);
      hastaPost.setDate(hastaPost.getDate() + 1);
      hastaPost.setHours(23, 59, 59, 999);

      const cargasAmpliadas = await db.select()
        .from(cargas)
        .where(and(gte(cargas.fecha, desdePrevio.toISOString()), lte(cargas.fecha, hastaPost.toISOString())))
        .orderBy(asc(cargas.fecha));

      const cargasVolvoAll = cargasAmpliadas.filter(c => c.patente && patentesVolvo.has(c.patente));

      const porPatente = new Map<string, typeof cargasVolvoAll>();
      for (const c of cargasVolvoAll) {
        if (!c.patente) continue;
        if (!porPatente.has(c.patente)) porPatente.set(c.patente, []);
        porPatente.get(c.patente)!.push(c);
      }

      const periodos: any[] = [];

      const ayerInicio = desdeAyer.getTime();
      const ayerFin = hastaAyer.getTime();

      for (const [patente, cargasPat] of porPatente) {
        const sorted = [...cargasPat].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

        for (let i = 0; i < sorted.length; i++) {
          const cargaA = sorted[i];
          const cargaATime = new Date(cargaA.fecha).getTime();
          if (cargaATime < ayerInicio || cargaATime > ayerFin) continue;
          const cargaB = sorted[i + 1] || null;

          const resultado = await calcularPeriodoEntreCargas(
            patente,
            { fecha: new Date(cargaA.fecha), litros: cargaA.litrosSurtidor || 0 },
            cargaB ? { fecha: new Date(cargaB.fecha), litros: cargaB.litrosSurtidor || 0 } : null
          );

          const evaluacion = evaluarPeriodo({
            kmEcu: resultado.kmEcu,
            litrosEcu: resultado.litrosConsumidosEcu,
            litrosCargados: cargaA.litrosSurtidor || 0,
            rendimientoHistorico: null,
            nivelEstanqueAntesPct: null,
            calidadCruce: resultado.calidadDatos,
            snapCount: resultado.snapCount,
            periodoAbierto: resultado.periodoAbierto,
            coberturaPct: resultado.coberturaPct,
          });

          periodos.push({
            patente,
            conductor: cargaA.conductor || "Sin asignar",
            contrato: cargaA.faena || "",
            carga_a: {
              fecha: cargaA.fecha,
              litros: cargaA.litrosSurtidor || 0,
              estacion: cargaA.lugarConsumo || "Desconocido",
            },
            carga_b: cargaB ? {
              fecha: cargaB.fecha,
              litros: cargaB.litrosSurtidor || 0,
              estacion: cargaB.lugarConsumo || "Desconocido",
            } : null,
            ecu: {
              km: resultado.kmEcu,
              litros_consumidos: resultado.litrosConsumidosEcu,
              rendimiento: resultado.rendimientoEcu,
              horas_periodo: resultado.horasPeriodo,
              snap_count: resultado.snapCount,
              cobertura_pct: resultado.coberturaPct,
              calidad: resultado.calidadDatos,
              periodo_abierto: resultado.periodoAbierto,
            },
            evaluacion: {
              nivel: evaluacion.nivel,
              razones: evaluacion.razones,
              score: evaluacion.score,
              evaluable: evaluacion.evaluable,
              balance_litros: evaluacion.balanceLitros,
              balance_pct: evaluacion.balancePct,
              rendimiento_real: evaluacion.rendimientoReal,
            },
          });
        }
      }

      periodos.sort((a, b) => {
        const order: Record<string, number> = { CRITICO: 0, SOSPECHOSO: 1, REVISAR: 2, NORMAL: 3, PENDIENTE: 4, SIN_DATOS: 5 };
        return (order[a.evaluacion.nivel] ?? 5) - (order[b.evaluacion.nivel] ?? 5);
      });

      const resumen = {
        total_periodos: periodos.length,
        evaluables: periodos.filter(p => p.evaluacion.evaluable).length,
        criticos: periodos.filter(p => p.evaluacion.nivel === "CRITICO").length,
        sospechosos: periodos.filter(p => p.evaluacion.nivel === "SOSPECHOSO").length,
        revisar: periodos.filter(p => p.evaluacion.nivel === "REVISAR").length,
        normales: periodos.filter(p => p.evaluacion.nivel === "NORMAL").length,
        pendientes: periodos.filter(p => p.evaluacion.nivel === "PENDIENTE").length,
        sin_datos: periodos.filter(p => p.evaluacion.nivel === "SIN_DATOS").length,
        patentes_analizadas: porPatente.size,
        periodo_label: `Anteayer ${anteayer.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}`,
      };

      res.json({ resumen, periodos });
    } catch (error: any) {
      console.error("[periodos] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  // Resumen rápido para card de inicio
  app.get("/api/estaciones/resumen-rapido", async (_req: Request, res: Response) => {
    try {
      const hoy = new Date();
      const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

      const anomR = await pool.query(`
        SELECT COUNT(*)::int as total FROM operaciones_cerradas
        WHERE nivel_anomalia IN ('CRITICO','SOSPECHOSO') AND km_ecu >= 200 AND snap_count >= 15 AND horas_periodo >= 24 AND revisado = false
      `);
      const hoyR = await pool.query(`SELECT COUNT(*)::int as total FROM cargas WHERE fecha::timestamp >= $1 AND litros_surtidor > 0`, [inicioHoy]);
      const mesR = await pool.query(`SELECT COUNT(*)::int as total_cargas, COALESCE(SUM(litros_surtidor::float), 0) as total_litros FROM cargas WHERE fecha::timestamp >= $1 AND litros_surtidor > 0`, [inicioMes]);

      res.json({
        anomalias_activas: anomR.rows[0]?.total || 0,
        cargas_hoy: hoyR.rows[0]?.total || 0,
        cargas_mes: mesR.rows[0]?.total_cargas || 0,
        litros_mes: Math.round(parseFloat(mesR.rows[0]?.total_litros || "0")),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

}

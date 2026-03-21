import { pool } from "../db";
import { resolverPatenteAVin } from "./vin-patente";

export interface SnapshotsCarga {
  vin: string | null;

  snapAntes: {
    capturedAt: string;
    totalFuelUsedMl: number;
    totalDistanceM: number;
    minutosAntes: number;
  } | null;

  snapDespues: {
    capturedAt: string;
    totalFuelUsedMl: number;
    totalDistanceM: number;
    minutosDespues: number;
  } | null;

  calidadCruce: "EXCELENTE" | "BUENA" | "REGULAR" | "MALA" | "SIN_DATOS";
}

export async function encontrarSnapshotsParaCarga(
  patente: string,
  fechaCarga: Date,
  ventanaMinutos: number = 60
): Promise<SnapshotsCarga> {
  const vin = await resolverPatenteAVin(patente);

  if (!vin) {
    return { vin: null, snapAntes: null, snapDespues: null, calidadCruce: "SIN_DATOS" };
  }

  const ventanaMs = ventanaMinutos * 60 * 1000;
  const desde = new Date(fechaCarga.getTime() - ventanaMs);
  const hasta = new Date(fechaCarga.getTime() + ventanaMs);

  const result = await pool.query(
    `SELECT id, vin, total_fuel_used, total_distance, captured_at
     FROM volvo_fuel_snapshots
     WHERE vin = $1 AND captured_at >= $2 AND captured_at <= $3
     ORDER BY captured_at ASC`,
    [vin, desde.toISOString(), hasta.toISOString()]
  );

  if (result.rows.length === 0) {
    return { vin, snapAntes: null, snapDespues: null, calidadCruce: "SIN_DATOS" };
  }

  const fechaCargaMs = fechaCarga.getTime();

  const antesDeCargar = result.rows
    .filter((s: any) => new Date(s.captured_at).getTime() <= fechaCargaMs)
    .sort((a: any, b: any) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime());

  const despuesDeCargar = result.rows
    .filter((s: any) => new Date(s.captured_at).getTime() > fechaCargaMs)
    .sort((a: any, b: any) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());

  const mejorAntes = antesDeCargar[0] || null;
  const mejorDespues = despuesDeCargar[0] || null;

  let calidadCruce: SnapshotsCarga["calidadCruce"] = "SIN_DATOS";

  if (mejorAntes && mejorDespues) {
    const minAntes = (fechaCargaMs - new Date(mejorAntes.captured_at).getTime()) / 60000;
    const minDespues = (new Date(mejorDespues.captured_at).getTime() - fechaCargaMs) / 60000;
    const maxMin = Math.max(minAntes, minDespues);

    if (maxMin <= 15) calidadCruce = "EXCELENTE";
    else if (maxMin <= 30) calidadCruce = "BUENA";
    else if (maxMin <= 60) calidadCruce = "REGULAR";
    else calidadCruce = "MALA";
  } else if (mejorAntes || mejorDespues) {
    calidadCruce = "MALA";
  }

  return {
    vin,
    snapAntes: mejorAntes
      ? {
          capturedAt: mejorAntes.captured_at,
          totalFuelUsedMl: mejorAntes.total_fuel_used || 0,
          totalDistanceM: mejorAntes.total_distance || 0,
          minutosAntes: Math.round((fechaCargaMs - new Date(mejorAntes.captured_at).getTime()) / 60000),
        }
      : null,
    snapDespues: mejorDespues
      ? {
          capturedAt: mejorDespues.captured_at,
          totalFuelUsedMl: mejorDespues.total_fuel_used || 0,
          totalDistanceM: mejorDespues.total_distance || 0,
          minutosDespues: Math.round((new Date(mejorDespues.captured_at).getTime() - fechaCargaMs) / 60000),
        }
      : null,
    calidadCruce,
  };
}

export interface PeriodoEntreCargas {
  vin: string;
  kmEcu: number | null;
  litrosConsumidosEcu: number | null;
  rendimientoEcu: number | null;
  horasPeriodo: number | null;
  calidadDatos: "ALTA" | "MEDIA" | "BAJA" | "SIN_DATOS";
  snapCount: number;
  coberturaPct: number;
  periodoAbierto: boolean;
}

export async function calcularPeriodoEntreCargas(
  patente: string,
  cargaA: { fecha: Date; litros: number },
  cargaB: { fecha: Date; litros: number } | null
): Promise<PeriodoEntreCargas> {
  const vin = await resolverPatenteAVin(patente);

  if (!vin) {
    return {
      vin: "",
      kmEcu: null,
      litrosConsumidosEcu: null,
      rendimientoEcu: null,
      horasPeriodo: cargaB ? (cargaB.fecha.getTime() - cargaA.fecha.getTime()) / 3600000 : null,
      calidadDatos: "SIN_DATOS",
      snapCount: 0,
      coberturaPct: 0,
      periodoAbierto: !cargaB,
    };
  }

  const finVentana = cargaB
    ? cargaB.fecha.toISOString()
    : new Date().toISOString();

  const result = await pool.query(
    `SELECT total_fuel_used, total_distance, captured_at
     FROM volvo_fuel_snapshots
     WHERE vin = $1 AND captured_at >= $2 AND captured_at <= $3
     ORDER BY captured_at ASC`,
    [vin, cargaA.fecha.toISOString(), finVentana]
  );

  if (result.rows.length < 2) {
    return {
      vin,
      kmEcu: null,
      litrosConsumidosEcu: null,
      rendimientoEcu: null,
      horasPeriodo: cargaB ? (cargaB.fecha.getTime() - cargaA.fecha.getTime()) / 3600000 : null,
      calidadDatos: "SIN_DATOS",
      snapCount: result.rows.length,
      coberturaPct: 0,
      periodoAbierto: !cargaB,
    };
  }

  const snaps = result.rows;

  const snapInicio =
    snaps.filter((s: any) => new Date(s.captured_at).getTime() >= cargaA.fecha.getTime() + 30 * 60 * 1000)[0] ||
    snaps[0];

  const snapFin = cargaB
    ? snaps
        .filter((s: any) => new Date(s.captured_at).getTime() <= cargaB.fecha.getTime())
        .sort((a: any, b: any) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime())[0]
    : snaps[snaps.length - 1];

  if (!snapInicio || !snapFin || snapInicio === snapFin) {
    return {
      vin,
      kmEcu: null,
      litrosConsumidosEcu: null,
      rendimientoEcu: null,
      horasPeriodo: null,
      calidadDatos: "SIN_DATOS",
      snapCount: snaps.length,
      coberturaPct: 0,
      periodoAbierto: !cargaB,
    };
  }

  const fuelDeltaMl = (snapFin.total_fuel_used || 0) - (snapInicio.total_fuel_used || 0);
  const distDeltaM = (snapFin.total_distance || 0) - (snapInicio.total_distance || 0);

  if (fuelDeltaMl < 0 || distDeltaM < 0) {
    return {
      vin,
      kmEcu: null,
      litrosConsumidosEcu: null,
      rendimientoEcu: null,
      horasPeriodo: null,
      calidadDatos: "SIN_DATOS",
      snapCount: snaps.length,
      coberturaPct: 0,
      periodoAbierto: !cargaB,
    };
  }

  const litrosConsumidos = fuelDeltaMl / 1000;
  const kmRecorridos = distDeltaM / 1000;

  const rendimiento =
    litrosConsumidos > 5 && kmRecorridos > 10
      ? Math.round((kmRecorridos / litrosConsumidos) * 100) / 100
      : null;

  const horasPeriodo =
    (new Date(snapFin.captured_at).getTime() - new Date(snapInicio.captured_at).getTime()) / 3600000;

  const snapsPorHora = horasPeriodo > 0 ? snaps.length / horasPeriodo : 0;
  const coberturaPct = Math.min(100, Math.round(snapsPorHora / 40 * 100));

  let calidadDatos: PeriodoEntreCargas["calidadDatos"] = "SIN_DATOS";
  if (coberturaPct >= 80) calidadDatos = "ALTA";
  else if (coberturaPct >= 40) calidadDatos = "MEDIA";
  else if (coberturaPct >= 10) calidadDatos = "BAJA";

  return {
    vin,
    kmEcu: kmRecorridos > 0 ? Math.round(kmRecorridos * 10) / 10 : null,
    litrosConsumidosEcu: litrosConsumidos > 0 ? Math.round(litrosConsumidos * 10) / 10 : null,
    rendimientoEcu: rendimiento,
    horasPeriodo: Math.round(horasPeriodo * 10) / 10,
    calidadDatos,
    snapCount: snaps.length,
    coberturaPct,
    periodoAbierto: !cargaB,
  };
}

export interface EvaluacionPeriodo {
  nivel: "NORMAL" | "REVISAR" | "SOSPECHOSO" | "CRITICO" | "PENDIENTE" | "SIN_DATOS";
  razones: string[];
  score: number;
  evaluable: boolean;
  balanceLitros: number | null;
  balancePct: number | null;
  rendimientoReal: number | null;
}

export function evaluarPeriodo(datos: {
  kmEcu: number | null;
  litrosEcu: number | null;
  litrosCargados: number;
  rendimientoHistorico: number | null;
  nivelEstanqueAntesPct: number | null;
  capacidadEstanqueLitros?: number | null;
  calidadCruce: string;
  snapCount: number;
  periodoAbierto: boolean;
  coberturaPct: number;
}): EvaluacionPeriodo {
  const razones: string[] = [];
  let nivel: EvaluacionPeriodo["nivel"] = "NORMAL";
  let score = 100;

  if (datos.periodoAbierto) {
    return {
      nivel: "PENDIENTE",
      razones: ["Periodo abierto — esperando proxima carga"],
      score: 100,
      evaluable: false,
      balanceLitros: null,
      balancePct: null,
      rendimientoReal: null,
    };
  }

  if (datos.kmEcu == null || datos.litrosEcu == null) {
    return {
      nivel: "SIN_DATOS",
      razones: ["Sin snapshots Volvo para este periodo"],
      score: 100,
      evaluable: false,
      balanceLitros: null,
      balancePct: null,
      rendimientoReal: null,
    };
  }

  if (datos.coberturaPct < 20) {
    razones.push(
      `Cruce parcial: ${datos.snapCount} snapshots (${datos.coberturaPct}% de cobertura esperada). Resultado orientativo.`
    );
  }

  const balance = datos.litrosCargados - datos.litrosEcu;
  const balancePct = datos.litrosEcu > 0 ? Math.round((balance / datos.litrosEcu) * 100) : 0;

  if (balance > 0) {
    if (datos.nivelEstanqueAntesPct !== null) {
      const capacidad = datos.capacidadEstanqueLitros || 600;
      const litrosEnEstanque = (datos.nivelEstanqueAntesPct / 100) * capacidad;
      const espacioDisponible = capacidad - litrosEnEstanque;

      if (datos.litrosCargados > espacioDisponible * 1.15) {
        nivel = "CRITICO";
        score -= 50;
        razones.push(
          `Fisicamente imposible: estanque al ${datos.nivelEstanqueAntesPct}% (~${litrosEnEstanque.toFixed(0)}L), solo cabian ~${espacioDisponible.toFixed(0)}L, declaro ${datos.litrosCargados}L`
        );
      }
    }

    if (balancePct > 80 && balance > 100) {
      nivel = nivel === "NORMAL" ? "CRITICO" : nivel;
      score -= 40;
      razones.push(
        `Cargo ${datos.litrosCargados}L pero el periodo (${datos.kmEcu.toFixed(0)}km) solo consumio ${datos.litrosEcu.toFixed(0)}L segun ECU. Exceso: ${balance.toFixed(0)}L (${balancePct}%)`
      );
    } else if (balancePct > 40 && balance > 50) {
      nivel = nivel === "NORMAL" ? "SOSPECHOSO" : nivel;
      score -= 20;
      razones.push(
        `Cargo ${balance.toFixed(0)}L mas de lo consumido en el periodo segun ECU`
      );
    } else if (balancePct > 20 && balance > 30) {
      nivel = nivel === "NORMAL" ? "REVISAR" : nivel;
      score -= 8;
      razones.push(
        `Balance levemente alto: +${balance.toFixed(0)}L vs consumo ECU del periodo`
      );
    }
  }

  if (datos.rendimientoHistorico && datos.litrosEcu > 10 && datos.kmEcu > 20) {
    const rendReal = datos.kmEcu / datos.litrosEcu;
    const desviacion = ((rendReal - datos.rendimientoHistorico) / datos.rendimientoHistorico) * 100;

    if (desviacion < -30) {
      nivel = nivel === "NORMAL" ? "REVISAR" : nivel;
      score -= 15;
      razones.push(
        `Rendimiento del periodo: ${rendReal.toFixed(2)} km/L vs historico ${datos.rendimientoHistorico.toFixed(2)} km/L (${Math.abs(desviacion).toFixed(0)}% bajo lo esperado)`
      );
    }
  }

  return {
    nivel,
    razones,
    score: Math.max(0, score),
    evaluable: true,
    balanceLitros: Math.round(balance),
    balancePct,
    rendimientoReal: datos.litrosEcu > 0 ? Math.round(datos.kmEcu / datos.litrosEcu * 100) / 100 : null,
  };
}

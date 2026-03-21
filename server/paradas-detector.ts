import { pool } from "./db";
import { buscarLugarCercano } from "./viajes-historico";

interface PuntoGPS {
  id: number;
  patente: string;
  camion_id: number | null;
  lat: number;
  lng: number;
  timestamp_punto: Date;
  velocidad_kmh: number;
  km_odometro: number | null;
}

interface ParadaDetectada {
  patente: string;
  camion_id: number | null;
  contrato: string | null;
  inicio: Date;
  fin: Date;
  duracion_min: number;
  lat: number;
  lng: number;
  tipo: "COMBUSTIBLE" | "OPERACION" | "DESCANSO" | "INCIDENCIA" | "PERNOCTA";
  lugar_nombre: string | null;
  lugar_tipo: string | null;
  distancia_lugar_m: number | null;
  carga_id: number | null;
  litros_cargados: number | null;
  km_odometro_inicio: number | null;
  km_odometro_fin: number | null;
}

const UMBRAL_VELOCIDAD = 5;
const MIN_DURACION_MIN = 15;

function haversineMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clasificarParada(
  duracion_min: number,
  lugar: { nombre: string; tipo: string; distancia_m: number } | null,
  carga: { id: number; litros: number } | null,
  horaInicio: Date
): "COMBUSTIBLE" | "OPERACION" | "DESCANSO" | "INCIDENCIA" | "PERNOCTA" {
  const hora = horaInicio.getUTCHours();
  const esNocturno = hora >= 22 || hora < 6;

  if (esNocturno && duracion_min >= 240) return "PERNOCTA";

  if (carga && lugar && lugar.tipo === "estacion") return "COMBUSTIBLE";
  if (carga) return "COMBUSTIBLE";

  if (lugar && ["cd", "mina", "descarga", "carga", "puerto"].includes(lugar.tipo) && duracion_min >= 30) {
    return "OPERACION";
  }

  if (duracion_min >= 120 && (!lugar || lugar.distancia_m > 2000)) {
    return "INCIDENCIA";
  }

  return "DESCANSO";
}

export async function detectarParadas(fecha?: string): Promise<{
  paradasNuevas: number;
  camionesAnalizados: number;
  porTipo: Record<string, number>;
}> {
  const targetDate = fecha || new Date(Date.now() - 86400000).toISOString().split("T")[0];

  const puntosResult = await pool.query(`
    SELECT g.id, g.patente, g.camion_id, g.lat::float as lat, g.lng::float as lng,
           g.timestamp_punto, g.velocidad_kmh::float as velocidad_kmh,
           g.km_odometro::float as km_odometro
    FROM geo_puntos g
    WHERE DATE(g.timestamp_punto) = $1
    ORDER BY g.patente, g.timestamp_punto
  `, [targetDate]);

  const puntos: PuntoGPS[] = puntosResult.rows;
  if (puntos.length === 0) return { paradasNuevas: 0, camionesAnalizados: 0, porTipo: {} };

  const porPatente = new Map<string, PuntoGPS[]>();
  for (const p of puntos) {
    if (!porPatente.has(p.patente)) porPatente.set(p.patente, []);
    porPatente.get(p.patente)!.push(p);
  }

  const contratoMap = new Map<string, string>();
  const camResult = await pool.query(`
    SELECT c.patente, f.nombre as contrato
    FROM camiones c
    JOIN faenas f ON c.faena_id = f.id
    WHERE c.patente IS NOT NULL
  `);
  for (const row of camResult.rows) {
    contratoMap.set(row.patente, row.contrato);
  }

  const todasParadas: ParadaDetectada[] = [];

  for (const [patente, pts] of porPatente) {
    if (pts.length < 3) continue;

    const contrato = contratoMap.get(patente) || null;
    let paradaInicio: PuntoGPS | null = null;
    let paradaPuntos: PuntoGPS[] = [];

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const detenido = (p.velocidad_kmh || 0) < UMBRAL_VELOCIDAD;

      if (detenido) {
        if (!paradaInicio) {
          paradaInicio = p;
          paradaPuntos = [p];
        } else {
          paradaPuntos.push(p);
        }
      }

      if ((!detenido || i === pts.length - 1) && paradaInicio && paradaPuntos.length > 0) {
        const ultimo = paradaPuntos[paradaPuntos.length - 1];
        const durMs = new Date(ultimo.timestamp_punto).getTime() -
                      new Date(paradaInicio.timestamp_punto).getTime();
        const durMin = Math.round(durMs / 60000);

        if (durMin >= MIN_DURACION_MIN) {
          const avgLat = paradaPuntos.reduce((s, pp) => s + pp.lat, 0) / paradaPuntos.length;
          const avgLng = paradaPuntos.reduce((s, pp) => s + pp.lng, 0) / paradaPuntos.length;

          const lugarCercano = buscarLugarCercano(avgLat, avgLng, contrato || undefined);
          let lugarInfo: { nombre: string; tipo: string; distancia_m: number } | null = null;
          if (lugarCercano) {
            const dist = haversineMetros(avgLat, avgLng, lugarCercano.lat, lugarCercano.lng);
            lugarInfo = { nombre: lugarCercano.nombre, tipo: lugarCercano.tipo, distancia_m: Math.round(dist) };
          }

          const inicioTs = new Date(paradaInicio.timestamp_punto);
          const finTs = new Date(ultimo.timestamp_punto);

          let cargaInfo: { id: number; litros: number } | null = null;
          const cargaResult = await pool.query(`
            SELECT id, litros_surtidor::float as litros
            FROM cargas
            WHERE patente = $1
              AND fecha::timestamp BETWEEN $2::timestamp - INTERVAL '30 minutes'
                                      AND $3::timestamp + INTERVAL '30 minutes'
            ORDER BY ABS(EXTRACT(EPOCH FROM fecha::timestamp - $2::timestamp))
            LIMIT 1
          `, [patente, inicioTs.toISOString(), finTs.toISOString()]);
          if (cargaResult.rows.length > 0) {
            cargaInfo = { id: cargaResult.rows[0].id, litros: cargaResult.rows[0].litros };
          }

          const tipo = clasificarParada(durMin, lugarInfo, cargaInfo, inicioTs);

          todasParadas.push({
            patente,
            camion_id: paradaInicio.camion_id,
            contrato,
            inicio: inicioTs,
            fin: finTs,
            duracion_min: durMin,
            lat: avgLat,
            lng: avgLng,
            tipo,
            lugar_nombre: lugarInfo?.nombre || null,
            lugar_tipo: lugarInfo?.tipo || null,
            distancia_lugar_m: lugarInfo?.distancia_m || null,
            carga_id: cargaInfo?.id || null,
            litros_cargados: cargaInfo?.litros || null,
            km_odometro_inicio: paradaInicio.km_odometro,
            km_odometro_fin: ultimo.km_odometro,
          });
        }

        paradaInicio = null;
        paradaPuntos = [];
      }
    }
  }

  if (todasParadas.length === 0) {
    return { paradasNuevas: 0, camionesAnalizados: porPatente.size, porTipo: {} };
  }

  await pool.query(`DELETE FROM paradas_detectadas WHERE DATE(inicio) = $1`, [targetDate]);

  for (const p of todasParadas) {
    await pool.query(`
      INSERT INTO paradas_detectadas
        (patente, camion_id, contrato, inicio, fin, duracion_min, lat, lng, tipo,
         lugar_nombre, lugar_tipo, distancia_lugar_m, carga_id, litros_cargados,
         km_odometro_inicio, km_odometro_fin)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    `, [
      p.patente, p.camion_id, p.contrato,
      p.inicio, p.fin, p.duracion_min,
      p.lat, p.lng, p.tipo,
      p.lugar_nombre, p.lugar_tipo, p.distancia_lugar_m,
      p.carga_id, p.litros_cargados,
      p.km_odometro_inicio, p.km_odometro_fin
    ]);
  }

  const porTipo: Record<string, number> = {};
  for (const p of todasParadas) {
    porTipo[p.tipo] = (porTipo[p.tipo] || 0) + 1;
  }

  return {
    paradasNuevas: todasParadas.length,
    camionesAnalizados: porPatente.size,
    porTipo
  };
}

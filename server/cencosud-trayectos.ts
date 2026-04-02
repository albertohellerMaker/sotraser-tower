import { pool } from "./db";
import { resolverGeocerca } from "./geocerca-inteligente";

const TIPOS_PARADA_INTERMEDIA = ["COPEC", "SHELL", "SERVICENTRO", "ESTACION", "GASOLINERA", "BENCINERA", "BASE", "PEAJE", "DESCANSO"];

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function esParadaIntermedia(nombre: string | null, tipo: string | null): boolean {
  if (!nombre && !tipo) return false;
  const n = (nombre || "").toUpperCase();
  const t = (tipo || "").toUpperCase();
  return TIPOS_PARADA_INTERMEDIA.some(p => n.includes(p) || t.includes(p));
}

function esDestinoReal(confianza: string | undefined, esCombustible: boolean | undefined): boolean {
  if (esCombustible) return false;
  if (confianza === "KML_POLIGONO" || confianza === "DOBLE_VALIDADO" || confianza === "EXACTO" || confianza === "CONFIRMADO") return true;
  return false;
}

interface TrayectoConsolidado {
  viaje_ids: number[];
  origen_id: number;
  destino_id: number;
  origen_lat: number;
  origen_lng: number;
  origen_nombre: string;
  destino_lat: number;
  destino_lng: number;
  destino_nombre: string;
  km_total: number;
  litros_total: number;
  fecha_inicio: Date;
  fecha_fin: Date;
  duracion_minutos: number;
  paradas_intermedias: Array<{
    nombre: string;
    tipo: string;
    lat: number;
    lng: number;
    minutos_detenido: number;
  }>;
  rendimiento_real: number;
}

const MAX_GAP_HORAS = 6;
const MAX_CONSOLIDAR = 8;

export async function consolidarTrayectosCencosud(): Promise<{ consolidados: number; segmentos_fusionados: number }> {
  console.log("[TRAYECTOS-CENCOSUD] Iniciando consolidación...");

  const viajesR = await pool.query(`
    SELECT va.id, va.camion_id, va.origen_lat::float as olat, va.origen_lng::float as olng,
           va.destino_lat::float as dlat, va.destino_lng::float as dlng,
           va.origen_nombre, va.destino_nombre,
           va.km_ecu::float as km, va.litros_consumidos_ecu::float as litros,
           va.rendimiento_real::float as rend,
           va.fecha_inicio, va.fecha_fin, va.duracion_minutos::int as duracion,
           c.patente
    FROM viajes_aprendizaje va
    JOIN camiones c ON c.id = va.camion_id
    WHERE va.contrato = 'CENCOSUD'
      AND va.fecha_inicio >= NOW() - INTERVAL '30 days'
      AND va.km_ecu > 5
      AND va.trayecto_consolidado_id IS NULL
      AND va.es_segmento_intermedio IS NOT TRUE
    ORDER BY va.camion_id, va.fecha_inicio
  `);

  if (viajesR.rows.length === 0) {
    console.log("[TRAYECTOS-CENCOSUD] Sin viajes para consolidar");
    return { consolidados: 0, segmentos_fusionados: 0 };
  }

  const viajesPorCamion = new Map<number, any[]>();
  for (const v of viajesR.rows) {
    if (!viajesPorCamion.has(v.camion_id)) viajesPorCamion.set(v.camion_id, []);
    viajesPorCamion.get(v.camion_id)!.push(v);
  }

  let consolidados = 0;
  let segmentosFusionados = 0;

  for (const [camionId, viajes] of viajesPorCamion) {
    viajes.sort((a: any, b: any) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime());

    let i = 0;
    while (i < viajes.length) {
      const cadena: any[] = [viajes[i]];

      const origenGeo = await resolverGeocerca(viajes[i].olat, viajes[i].olng, 15, "CENCOSUD");
      const esOrigenReal = esDestinoReal(origenGeo.confianza, origenGeo.es_combustible);

      let j = i + 1;
      while (j < viajes.length && cadena.length < MAX_CONSOLIDAR) {
        const prev = cadena[cadena.length - 1];
        const curr = viajes[j];

        const gapHoras = (new Date(curr.fecha_inicio).getTime() - new Date(prev.fecha_fin).getTime()) / 3600000;
        if (gapHoras > MAX_GAP_HORAS) break;

        const distEntrePuntos = haversineKm(prev.dlat, prev.dlng, curr.olat, curr.olng);
        if (distEntrePuntos > 15) break;

        const destinoPrevGeo = await resolverGeocerca(prev.dlat, prev.dlng, Math.round(gapHoras * 60), "CENCOSUD");

        if (destinoPrevGeo.es_combustible || esParadaIntermedia(prev.destino_nombre, destinoPrevGeo.fuente)) {
          cadena.push(curr);
          j++;
          continue;
        }

        if (destinoPrevGeo.confianza === "KML_POLIGONO" && !destinoPrevGeo.es_combustible) {
          break;
        }

        if (gapHoras < 2 && !esDestinoReal(destinoPrevGeo.confianza, destinoPrevGeo.es_combustible)) {
          cadena.push(curr);
          j++;
          continue;
        }

        break;
      }

      if (cadena.length >= 2) {
        const ultimo = cadena[cadena.length - 1];
        const destinoGeo = await resolverGeocerca(ultimo.dlat, ultimo.dlng, 15, "CENCOSUD");

        const paradasIntermedias: any[] = [];
        for (let k = 0; k < cadena.length - 1; k++) {
          const seg = cadena[k];
          const geoParada = await resolverGeocerca(seg.dlat, seg.dlng, 10, "CENCOSUD");
          const siguienteSeg = cadena[k + 1];
          const minutosDetenido = Math.round((new Date(siguienteSeg.fecha_inicio).getTime() - new Date(seg.fecha_fin).getTime()) / 60000);

          paradasIntermedias.push({
            nombre: geoParada.nombre || seg.destino_nombre || "Parada",
            tipo: geoParada.es_combustible ? "COMBUSTIBLE" : (geoParada.confianza || "DESCONOCIDO"),
            lat: seg.dlat,
            lng: seg.dlng,
            minutos_detenido: minutosDetenido,
          });
        }

        const kmTotal = cadena.reduce((s: number, v: any) => s + (v.km || 0), 0);
        const litrosTotal = cadena.reduce((s: number, v: any) => s + (v.litros || 0), 0);
        const fechaInicio = new Date(cadena[0].fecha_inicio);
        const fechaFin = new Date(ultimo.fecha_fin);
        const duracion = Math.round((fechaFin.getTime() - fechaInicio.getTime()) / 60000);
        const rendimiento = litrosTotal > 0 ? Math.round(kmTotal / litrosTotal * 100) / 100 : 0;

        const origenNombreFinal = origenGeo.nombre || cadena[0].origen_nombre || "Origen";
        const destinoNombreFinal = destinoGeo.nombre || ultimo.destino_nombre || "Destino";

        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          const trayectoR = await client.query(`
            INSERT INTO cencosud_trayectos (
              camion_id, patente,
              origen_lat, origen_lng, origen_nombre,
              destino_lat, destino_lng, destino_nombre,
              km_total, litros_total, rendimiento_real,
              fecha_inicio, fecha_fin, duracion_minutos,
              paradas_intermedias, segmentos_count,
              viaje_ids, origen_confianza, destino_confianza
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
            RETURNING id
          `, [
            camionId, cadena[0].patente,
            cadena[0].olat, cadena[0].olng, origenNombreFinal,
            ultimo.dlat, ultimo.dlng, destinoNombreFinal,
            Math.round(kmTotal * 10) / 10,
            Math.round(litrosTotal * 100) / 100,
            rendimiento,
            fechaInicio, fechaFin, duracion,
            JSON.stringify(paradasIntermedias),
            cadena.length,
            JSON.stringify(cadena.map((v: any) => v.id)),
            origenGeo.confianza,
            destinoGeo.confianza,
          ]);

          const trayectoId = trayectoR.rows[0].id;

          const idsSegmentos = cadena.map((v: any) => v.id);
          await client.query(`
            UPDATE viajes_aprendizaje
            SET trayecto_consolidado_id = $1,
                es_segmento_intermedio = true
            WHERE id = ANY($2)
          `, [trayectoId, idsSegmentos]);

          await client.query(`
            UPDATE viajes_aprendizaje
            SET es_segmento_intermedio = false
            WHERE id = $1
          `, [idsSegmentos[0]]);

          await client.query(`
            UPDATE viajes_aprendizaje
            SET origen_nombre = $1, destino_nombre = $2,
                km_ecu = $3, litros_consumidos_ecu = $4,
                rendimiento_real = $5, duracion_minutos = $6,
                fecha_fin = $7, destino_lat = $8, destino_lng = $9,
                paradas = $10
            WHERE id = $11
          `, [
            origenNombreFinal, destinoNombreFinal,
            Math.round(kmTotal * 10) / 10,
            Math.round(litrosTotal * 100) / 100,
            rendimiento, duracion,
            fechaFin, ultimo.dlat, ultimo.dlng,
            JSON.stringify(paradasIntermedias),
            idsSegmentos[0],
          ]);

          await client.query("COMMIT");

          consolidados++;
          segmentosFusionados += cadena.length;

          console.log(`[TRAYECTOS] ${cadena[0].patente}: ${origenNombreFinal} → ${destinoNombreFinal} (${Math.round(kmTotal)}km, ${cadena.length} segmentos, ${paradasIntermedias.filter(p => p.tipo === "COMBUSTIBLE").length} paradas combustible)`);
        } catch (err: any) {
          await client.query("ROLLBACK").catch(() => {});
          console.error(`[TRAYECTOS] Error consolidando: ${err.message}`);
        } finally {
          client.release();
        }
      }

      i = j > i ? j : i + 1;
    }
  }

  console.log(`[TRAYECTOS-CENCOSUD] Consolidación completa: ${consolidados} trayectos, ${segmentosFusionados} segmentos fusionados`);
  return { consolidados, segmentos_fusionados: segmentosFusionados };
}

export async function crearTablaTrayectos() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cencosud_trayectos (
      id serial PRIMARY KEY,
      camion_id integer NOT NULL,
      patente text,
      origen_lat float, origen_lng float, origen_nombre text,
      destino_lat float, destino_lng float, destino_nombre text,
      km_total float, litros_total float, rendimiento_real float,
      fecha_inicio timestamp, fecha_fin timestamp, duracion_minutos integer,
      paradas_intermedias jsonb DEFAULT '[]',
      segmentos_count integer DEFAULT 1,
      viaje_ids jsonb DEFAULT '[]',
      origen_confianza text,
      destino_confianza text,
      tarifa_aplicada float,
      facturado boolean DEFAULT false,
      created_at timestamp DEFAULT NOW()
    )
  `);

  try {
    await pool.query(`ALTER TABLE viajes_aprendizaje ADD COLUMN IF NOT EXISTS trayecto_consolidado_id integer`);
    await pool.query(`ALTER TABLE viajes_aprendizaje ADD COLUMN IF NOT EXISTS es_segmento_intermedio boolean DEFAULT false`);
  } catch {}
}

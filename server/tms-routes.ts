import type { Express } from "express";
import { storage } from "./storage";
import { getFleetStatus } from "./volvo-api";
import { getCachedFuelData, getSigetraFuelSummary } from "./sigetra-api";
import Anthropic from "@anthropic-ai/sdk";
import { getCencosudFaenaId } from "./cencosud-filter";
import { DATA_START } from "./db";

const MODEL = "claude-sonnet-4-20250514";
const DATA_START_STR = DATA_START.toISOString().slice(0,10);

function getClient(): Anthropic {
  return new Anthropic();
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function generateCodigo(contratoId: number, prefix: string, index: number): string {
  return `VJ-C${contratoId}-${prefix.substring(0, 4).toUpperCase()}-${String(index).padStart(3, "0")}`;
}

export function registerTMSRoutes(app: Express) {

  app.get("/api/tms/contratos", async (_req, res) => {
    try {
      const allContratos = await storage.getTmsContratos();
      const faenas = await storage.getFaenas();
      const camiones = await storage.getCamiones();
      const cencFId = await getCencosudFaenaId();
      const contratos = allContratos.filter(c => c.faenaId === cencFId);

      const allViajes: any[] = [];
      for (const c of contratos) {
        const cv = await storage.getTmsViajes(c.id);
        allViajes.push(...cv);
      }
      const result = contratos.map(c => {
        const faena = faenas.find(f => f.id === c.faenaId);
        const trucks = camiones.filter(t => t.faenaId === c.faenaId);
        const contratoViajes = allViajes.filter(v => v.contratoId === c.id);
        const trucksWithStats = trucks.map(t => {
          const tViajes = contratoViajes.filter(v => v.camionId === t.id);
          const tKm = tViajes.reduce((s, v) => s + (parseFloat(v.kmRecorridos || "0") || 0), 0);
          return { ...t, viajesCount: tViajes.length, kmTotal: Math.round(tKm) };
        }).sort((a, b) => b.viajesCount - a.viajesCount || b.kmTotal - a.kmTotal);
        return { ...c, faenaNombre: faena?.nombre, truckCount: trucks.length, trucks: trucksWithStats };
      });
      res.json(result);
    } catch (error: any) {
      console.error("[tms] Error fetching contratos:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/tms/contratos", async (req, res) => {
    try {
      const { faenaId, descripcion } = req.body;
      if (!faenaId) return res.status(400).json({ message: "faenaId requerido" });

      const faena = await storage.getFaena(faenaId);
      if (!faena) return res.status(404).json({ message: "Faena no encontrada" });

      const existing = await storage.getTmsContratos();
      if (existing.find(c => c.faenaId === faenaId)) {
        return res.status(400).json({ message: "Ya existe un contrato para esta faena" });
      }

      const contrato = await storage.createTmsContrato({
        faenaId,
        nombre: faena.nombre,
        cliente: faena.nombre,
        descripcion: descripcion || null,
        fechaInicio: DATA_START_STR,
        activo: true,
      });
      res.json(contrato);
    } catch (error: any) {
      console.error("[tms] Error creating contrato:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/tms/contratos/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });

      const contrato = await storage.getTmsContrato(id);
      if (!contrato) return res.status(404).json({ message: "Contrato no encontrado" });

      const allCamiones = await storage.getCamiones();
      const camiones = allCamiones.filter(c => c.faenaId === contrato.faenaId);
      const viajes = await storage.getTmsViajes(id);
      const puntos = await storage.getTmsPuntos(id);

      const totalKm = viajes.reduce((s, v) => s + (parseFloat(v.kmRecorridos || "0") || 0), 0);
      const totalLitros = viajes.reduce((s, v) => s + (parseFloat(v.litrosSigetra || "0") || 0), 0);
      const rendimientos = viajes.filter(v => v.rendimientoReal).map(v => parseFloat(v.rendimientoReal!));
      const rendimientoProm = rendimientos.length > 0 ? rendimientos.reduce((a, b) => a + b, 0) / rendimientos.length : 0;

      res.json({
        ...contrato,
        camiones,
        viajes: viajes.slice(0, 20),
        puntos,
        stats: {
          totalCamiones: camiones.length,
          totalViajes: viajes.length,
          totalKm: Math.round(totalKm * 10) / 10,
          totalLitros: Math.round(totalLitros * 100) / 100,
          rendimientoProm: Math.round(rendimientoProm * 100) / 100,
        },
      });
    } catch (error: any) {
      console.error("[tms] Error fetching contrato:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/tms/contratos/:id/analizar", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });

      const contrato = await storage.getTmsContrato(id);
      if (!contrato) return res.status(404).json({ message: "Contrato no encontrado" });

      const allCamiones = await storage.getCamiones();
      const camiones = allCamiones.filter(c => c.faenaId === contrato.faenaId);

      if (camiones.length === 0) {
        return res.json({ message: "Sin camiones en esta faena", viajesDetectados: 0, puntosDetectados: 0, kmTotal: 0, litrosTotal: 0, camionesAnalizados: 0, iaResumen: null });
      }

      console.log(`[tms-analisis] Analizando contrato ${contrato.nombre} con ${camiones.length} camiones`);

      await storage.deleteTmsViajesByContrato(id);
      await storage.deleteTmsPuntosByContrato(id);

      const from = new Date(DATA_START.getTime());
      const to = new Date();

      let fleetStatus: any[] = [];
      try { fleetStatus = await getFleetStatus(); } catch {}

      let fuelData: any[] = [];
      try { fuelData = await getCachedFuelData(from, to); } catch {}

      const snapshots = await storage.getVolvoFuelSnapshotsInRange(
        camiones.map(c => c.vin).filter((v): v is string => !!v),
        from, to
      );

      interface GpsPoint { lat: number; lng: number; time: Date; speed: number; km: number }
      interface DetectedStop { lat: number; lng: number; arrivalTime: Date; departureTime: Date; durationMin: number }
      interface DetectedTrip { camionId: number; patente: string; conductor: string | null; stops: DetectedStop[]; startTime: Date; endTime: Date; kmStart: number; kmEnd: number; kmDist: number }

      const allTrips: DetectedTrip[] = [];
      const allStopClusters: { lat: number; lng: number; camionId: number; count: number; durationMin: number; firstVisit: Date; lastVisit: Date }[] = [];

      for (const camion of camiones) {
        if (!camion.vin) continue;

        const gpsPoints: GpsPoint[] = [];

        const volvoStatus = fleetStatus.find((v: any) => v.vin === camion.vin);
        if (volvoStatus?.gps?.latitude && volvoStatus?.gps?.longitude) {
          gpsPoints.push({
            lat: volvoStatus.gps.latitude,
            lng: volvoStatus.gps.longitude,
            time: new Date(volvoStatus.gps.positionDateTime || volvoStatus.createdDateTime || Date.now()),
            speed: volvoStatus.gps.speed || 0,
            km: volvoStatus.totalDistance ? volvoStatus.totalDistance / 1000 : (camion.odometro || 0),
          });
        }

        const camionSnapshots = snapshots.filter(s => s.vin === camion.vin).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

        for (let i = 0; i < camionSnapshots.length; i++) {
          const snap = camionSnapshots[i];
          const km = snap.totalDistance ? snap.totalDistance / 1000 : 0;
          const prevKm = i > 0 && camionSnapshots[i - 1].totalDistance ? camionSnapshots[i - 1].totalDistance! / 1000 : km;
          const deltaKm = km - prevKm;

          if (km > 0) {
            gpsPoints.push({
              lat: 0, lng: 0,
              time: new Date(snap.capturedAt),
              speed: deltaKm > 0 ? 30 : 0,
              km,
            });
          }
        }


        gpsPoints.sort((a, b) => a.time.getTime() - b.time.getTime());

        const stops: DetectedStop[] = [];
        for (let i = 1; i < gpsPoints.length; i++) {
          const prev = gpsPoints[i - 1];
          const curr = gpsPoints[i];
          const timeDiffMin = (curr.time.getTime() - prev.time.getTime()) / (1000 * 60);
          const distKm = (prev.lat && curr.lat) ? haversineKm(prev.lat, prev.lng, curr.lat, curr.lng) : Math.abs(curr.km - prev.km);

          if (timeDiffMin >= 30 && distKm < 0.5) {
            stops.push({
              lat: curr.lat || prev.lat,
              lng: curr.lng || prev.lng,
              arrivalTime: prev.time,
              departureTime: curr.time,
              durationMin: Math.round(timeDiffMin),
            });
          }
        }

        for (const stop of stops) {
          if (stop.lat === 0 && stop.lng === 0) continue;
          const existing = allStopClusters.find(c =>
            c.camionId === camion.id && haversineKm(c.lat, c.lng, stop.lat, stop.lng) < 0.5
          );
          if (existing) {
            existing.count++;
            existing.durationMin = Math.round((existing.durationMin * (existing.count - 1) + stop.durationMin) / existing.count);
            if (stop.arrivalTime < existing.firstVisit) existing.firstVisit = stop.arrivalTime;
            if (stop.departureTime > existing.lastVisit) existing.lastVisit = stop.departureTime;
          } else {
            allStopClusters.push({
              lat: stop.lat, lng: stop.lng, camionId: camion.id, count: 1,
              durationMin: stop.durationMin, firstVisit: stop.arrivalTime, lastVisit: stop.departureTime,
            });
          }
        }

        const totalKm = gpsPoints.length > 0 ? gpsPoints[gpsPoints.length - 1].km - gpsPoints[0].km : 0;
        if (totalKm >= 20) {
          const tripCount = Math.max(1, Math.floor(totalKm / 200));

          for (let t = 0; t < tripCount; t++) {
            const startIdx = Math.floor((t / tripCount) * gpsPoints.length);
            const endIdx = Math.min(Math.floor(((t + 1) / tripCount) * gpsPoints.length), gpsPoints.length - 1);
            const startPt = gpsPoints[startIdx];
            const endPt = gpsPoints[endIdx];
            const segKm = endPt.km - startPt.km;

            if (segKm >= 20) {
              const tripStops = stops.filter(s =>
                s.arrivalTime >= startPt.time && s.departureTime <= endPt.time
              );

              allTrips.push({
                camionId: camion.id,
                patente: camion.patente,
                conductor: camion.conductor,
                stops: tripStops,
                startTime: startPt.time,
                endTime: endPt.time,
                kmStart: startPt.km,
                kmEnd: endPt.km,
                kmDist: Math.round(segKm * 10) / 10,
              });
            }
          }
        }
      }

      const prefix = contrato.nombre.replace(/[^A-Z0-9]/gi, "").substring(0, 4) || "CONT";
      let viajeIdx = 1;
      let totalKmSaved = 0;
      let totalLitrosSaved = 0;

      for (const trip of allTrips) {
        const codigo = generateCodigo(id, prefix, viajeIdx++);

        const numVeh = parseInt(trip.patente, 10);
        const truckFuel = fuelData.filter((c: any) => {
          if (!isNaN(numVeh) && c.numVeh === numVeh) return true;
          return c.patente === trip.patente;
        }).filter((c: any) => {
          const fecha = new Date(c.fechaConsumo);
          return fecha >= trip.startTime && fecha <= trip.endTime;
        });

        const litrosSigetra = truckFuel.reduce((s: number, c: any) => s + (c.cantidadLt || 0), 0);

        const camionSnaps = snapshots.filter(s => {
          const cam = camiones.find(c => c.id === trip.camionId);
          return cam?.vin && s.vin === cam.vin;
        }).filter(s => {
          const t = new Date(s.capturedAt);
          return t >= trip.startTime && t <= trip.endTime;
        }).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

        let litrosEcu: number | null = null;
        if (camionSnaps.length >= 2) {
          litrosEcu = Math.round((camionSnaps[camionSnaps.length - 1].totalFuelUsed - camionSnaps[0].totalFuelUsed) / 1000 * 100) / 100;
        }

        const diferenciaLitros = (litrosSigetra > 0 && litrosEcu != null) ? Math.round((litrosSigetra - litrosEcu) * 100) / 100 : null;
        const rendimiento = (trip.kmDist > 0 && litrosEcu && litrosEcu > 0) ? Math.round((trip.kmDist / litrosEcu) * 100) / 100 : null;

        const viaje = await storage.createTmsViaje({
          contratoId: id,
          camionId: trip.camionId,
          codigo,
          conductor: trip.conductor,
          origenNombre: null,
          origenLat: trip.stops.length > 0 && trip.stops[0].lat ? String(trip.stops[0].lat) : null,
          origenLng: trip.stops.length > 0 && trip.stops[0].lng ? String(trip.stops[0].lng) : null,
          destinoNombre: null,
          destinoLat: trip.stops.length > 1 && trip.stops[trip.stops.length - 1].lat ? String(trip.stops[trip.stops.length - 1].lat) : null,
          destinoLng: trip.stops.length > 1 && trip.stops[trip.stops.length - 1].lng ? String(trip.stops[trip.stops.length - 1].lng) : null,
          fechaSalida: trip.startTime,
          fechaLlegada: trip.endTime,
          estado: "DETECTADO",
          kmInicio: String(Math.round(trip.kmStart)),
          kmCierre: String(Math.round(trip.kmEnd)),
          kmRecorridos: String(trip.kmDist),
          litrosSigetra: litrosSigetra > 0 ? String(Math.round(litrosSigetra * 100) / 100) : null,
          litrosEcu: litrosEcu != null ? String(litrosEcu) : null,
          diferenciaLitros: diferenciaLitros != null ? String(diferenciaLitros) : null,
          rendimientoReal: rendimiento != null ? String(rendimiento) : null,
          detectadoPorIa: true,
          confirmado: false,
        });

        for (let si = 0; si < trip.stops.length; si++) {
          const stop = trip.stops[si];
          if (stop.lat === 0 && stop.lng === 0) continue;
          await storage.createTmsParada({
            viajeId: viaje.id,
            orden: si + 1,
            nombre: null,
            lat: String(stop.lat),
            lng: String(stop.lng),
            tipo: si === 0 ? "CARGA" : "ENTREGA",
            estado: "COMPLETADO",
            horaEstimada: stop.arrivalTime,
            horaReal: stop.departureTime,
          });
        }

        totalKmSaved += trip.kmDist;
        totalLitrosSaved += litrosSigetra;
      }

      for (const cluster of allStopClusters) {
        await storage.createTmsPunto({
          contratoId: id,
          camionId: cluster.camionId,
          lat: String(cluster.lat),
          lng: String(cluster.lng),
          tipo: null,
          vecesVisitado: cluster.count,
          duracionPromedioMin: cluster.durationMin,
          primeraVisita: cluster.firstVisit,
          ultimaVisita: cluster.lastVisit,
          confirmado: false,
        });
      }

      await storage.updateTmsContrato(id, {
        totalViajes: allTrips.length,
        kmTotal: String(Math.round(totalKmSaved * 10) / 10),
        litrosTotal: String(Math.round(totalLitrosSaved * 100) / 100),
      });

      let iaResumen: string | null = null;
      if (allTrips.length > 0) {
        try {
          const tripsForIa = allTrips.slice(0, 30).map(t => ({
            patente: t.patente,
            conductor: t.conductor,
            km: t.kmDist,
            inicio: t.startTime.toISOString().slice(0, 10),
            fin: t.endTime.toISOString().slice(0, 10),
            paradas: t.stops.length,
          }));

          const puntosForIa = allStopClusters.slice(0, 20).map(p => ({
            lat: p.lat.toFixed(4),
            lng: p.lng.toFixed(4),
            visitas: p.count,
            duracionMin: p.durationMin,
          }));

          const prompt = `Analiza el historial de transporte del contrato "${contrato.nombre}" desde ${DATA_START_STR}.
Camiones analizados: ${camiones.length}
Viajes detectados: ${allTrips.length}
Datos de viajes (muestra): ${JSON.stringify(tripsForIa)}
Puntos frecuentes detectados: ${JSON.stringify(puntosForIa)}

Responde en español con:
1. RESUMEN EJECUTIVO del contrato (3-4 lineas)
2. PATRONES DETECTADOS: dias y horarios frecuentes, camiones mas activos
3. ALERTAS si algún camión tiene comportamiento inusual o rendimiento bajo
4. RECOMENDACION para optimizar este contrato

Se especifico con datos reales. Menciona patentes cuando sea relevante. No uses emojis.`;

          const response = await getClient().messages.create({
            model: MODEL,
            max_tokens: 1500,
            messages: [{ role: "user", content: prompt }],
          });

          iaResumen = (response.content[0] as any).text || null;
        } catch (e: any) {
          console.error("[tms-analisis] Error IA:", e.message);
        }
      }

      console.log(`[tms-analisis] Contrato ${contrato.nombre}: ${allTrips.length} viajes, ${allStopClusters.length} puntos detectados`);

      res.json({
        viajesDetectados: allTrips.length,
        puntosDetectados: allStopClusters.length,
        kmTotal: Math.round(totalKmSaved * 10) / 10,
        litrosTotal: Math.round(totalLitrosSaved * 100) / 100,
        camionesAnalizados: camiones.length,
        iaResumen,
      });
    } catch (error: any) {
      console.error("[tms-analisis] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/tms/contratos/:id/viajes", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });

      const estado = req.query.estado as string | undefined;
      const camionId = req.query.camion_id ? parseInt(req.query.camion_id as string) : undefined;
      const desde = req.query.desde ? new Date(req.query.desde as string) : undefined;
      const hasta = req.query.hasta ? new Date(req.query.hasta as string) : undefined;

      const filters: any = {};
      if (estado && estado !== "TODOS") filters.estado = estado;
      if (camionId) filters.camionId = camionId;
      if (desde) filters.fechaDesde = desde;
      if (hasta) filters.fechaHasta = hasta;

      const viajes = await storage.getTmsViajes(id, Object.keys(filters).length > 0 ? filters : undefined);

      const result = await Promise.all(viajes.map(async v => {
        const paradas = await storage.getTmsParadas(v.id);
        return { ...v, paradas };
      }));

      res.json(result);
    } catch (error: any) {
      console.error("[tms] Error fetching viajes:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/tms/contratos/:contratoId/camion/:camionId", async (req, res) => {
    try {
      const contratoId = parseInt(req.params.contratoId);
      const camionId = parseInt(req.params.camionId);
      if (isNaN(contratoId) || isNaN(camionId)) return res.status(400).json({ message: "Invalid IDs" });

      const camion = await storage.getCamion(camionId);
      if (!camion) return res.status(404).json({ message: "Camion no encontrado" });

      const viajes = await storage.getTmsViajes(contratoId, { camionId });
      const paradas = await Promise.all(viajes.map(async v => {
        const p = await storage.getTmsParadas(v.id);
        return { ...v, paradas: p };
      }));

      const viajesOrdenados = paradas.sort((a, b) =>
        new Date(b.fechaSalida || 0).getTime() - new Date(a.fechaSalida || 0).getTime()
      );

      const ultimoViaje = viajesOrdenados[0] || null;

      let viajeSimilarPropuesto: any = null;
      if (viajesOrdenados.length >= 2 && ultimoViaje) {
        const lastKm = parseFloat(ultimoViaje.kmRecorridos || "0") || 0;
        const lastRend = parseFloat(ultimoViaje.rendimientoReal || "0") || 0;

        const anteriores = viajesOrdenados.slice(1);
        const kmValues = anteriores.map(v => parseFloat(v.kmRecorridos || "0") || 0).filter(k => k > 0);
        const rendValues = anteriores.map(v => parseFloat(v.rendimientoReal || "0") || 0).filter(r => r > 0);
        const litrosValues = anteriores.map(v => parseFloat(v.litrosSigetra || "0") || 0).filter(l => l > 0);

        const avgKm = kmValues.length > 0 ? kmValues.reduce((s, v) => s + v, 0) / kmValues.length : 0;
        const avgRend = rendValues.length > 0 ? rendValues.reduce((s, v) => s + v, 0) / rendValues.length : 0;
        const avgLitros = litrosValues.length > 0 ? litrosValues.reduce((s, v) => s + v, 0) / litrosValues.length : 0;

        const minKm = kmValues.length > 0 ? Math.min(...kmValues) : 0;
        const maxKm = kmValues.length > 0 ? Math.max(...kmValues) : 0;
        const minRend = rendValues.length > 0 ? Math.min(...rendValues) : 0;
        const maxRend = rendValues.length > 0 ? Math.max(...rendValues) : 0;

        const mejorViaje = anteriores.reduce((best, v) => {
          const r = parseFloat(v.rendimientoReal || "0") || 0;
          const br = parseFloat(best.rendimientoReal || "0") || 0;
          return r > br ? v : best;
        }, anteriores[0]);

        const peorViaje = anteriores.reduce((worst, v) => {
          const r = parseFloat(v.rendimientoReal || "0") || 0;
          const wr = parseFloat(worst.rendimientoReal || "0") || 0;
          return (r > 0 && (wr === 0 || r < wr)) ? v : worst;
        }, anteriores[0]);

        const conKm = anteriores.filter(v => (parseFloat(v.kmRecorridos || "0") || 0) > 0);
        const viajeMasSimilar = conKm.length > 0
          ? conKm.sort((a, b) => {
              const aKm = parseFloat(a.kmRecorridos || "0") || 0;
              const bKm = parseFloat(b.kmRecorridos || "0") || 0;
              return Math.abs(aKm - lastKm) - Math.abs(bKm - lastKm);
            })[0]
          : null;

        const lastVsAvgKm = avgKm > 0 ? ((lastKm - avgKm) / avgKm * 100) : 0;
        const lastVsAvgRend = avgRend > 0 ? ((lastRend - avgRend) / avgRend * 100) : 0;

        viajeSimilarPropuesto = {
          promedioHistorico: {
            km: Math.round(avgKm * 10) / 10,
            rendimiento: Math.round(avgRend * 100) / 100,
            litros: Math.round(avgLitros * 100) / 100,
            rangoKm: [Math.round(minKm * 10) / 10, Math.round(maxKm * 10) / 10],
            rangoRendimiento: [Math.round(minRend * 100) / 100, Math.round(maxRend * 100) / 100],
            totalViajesAnalizados: anteriores.length,
          },
          viajeMasSimilar: viajeMasSimilar ? {
            codigo: viajeMasSimilar.codigo,
            fecha: viajeMasSimilar.fechaSalida,
            km: parseFloat(viajeMasSimilar.kmRecorridos || "0"),
            rendimiento: parseFloat(viajeMasSimilar.rendimientoReal || "0"),
            litros: parseFloat(viajeMasSimilar.litrosSigetra || "0"),
          } : null,
          mejorViaje: {
            codigo: mejorViaje.codigo,
            fecha: mejorViaje.fechaSalida,
            km: parseFloat(mejorViaje.kmRecorridos || "0"),
            rendimiento: parseFloat(mejorViaje.rendimientoReal || "0"),
          },
          peorViaje: {
            codigo: peorViaje.codigo,
            fecha: peorViaje.fechaSalida,
            km: parseFloat(peorViaje.kmRecorridos || "0"),
            rendimiento: parseFloat(peorViaje.rendimientoReal || "0"),
          },
          comparacionUltimoViaje: {
            kmVsPromedio: Math.round(lastVsAvgKm * 10) / 10,
            rendVsPromedio: Math.round(lastVsAvgRend * 10) / 10,
          },
          proximoViajeProbable: {
            kmEstimado: Math.round(avgKm * 10) / 10,
            litrosEstimados: avgRend > 0 ? Math.round((avgKm / avgRend) * 100) / 100 : 0,
            rendimientoEsperado: Math.round(avgRend * 100) / 100,
            basadoEn: `${anteriores.length} viajes anteriores`,
          },
        };
      }

      let viajesProyectados: any[] = [];
      if (viajesOrdenados.length >= 2) {
        const fechas = viajesOrdenados
          .map(v => new Date(v.fechaSalida || 0).getTime())
          .filter(t => t > 0)
          .sort((a, b) => a - b);

        const kmVals = viajesOrdenados.map(v => parseFloat(v.kmRecorridos || "0") || 0).filter(k => k > 0);
        const rendVals = viajesOrdenados.map(v => parseFloat(v.rendimientoReal || "0") || 0).filter(r => r > 0);
        const litVals = viajesOrdenados.map(v => parseFloat(v.litrosSigetra || "0") || 0).filter(l => l > 0);
        const avgKmP = kmVals.length > 0 ? kmVals.reduce((s, v) => s + v, 0) / kmVals.length : 0;
        const avgRendP = rendVals.length > 0 ? rendVals.reduce((s, v) => s + v, 0) / rendVals.length : 0;
        const avgLitP = litVals.length > 0 ? litVals.reduce((s, v) => s + v, 0) / litVals.length : 0;

        let avgIntervalMs = 0;
        if (fechas.length >= 2) {
          const totalSpan = fechas[fechas.length - 1] - fechas[0];
          avgIntervalMs = totalSpan / (fechas.length - 1);
        }
        if (avgIntervalMs < 3600000) avgIntervalMs = 24 * 3600000;

        const now = new Date();
        const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
        const inicioMesMs = inicioMes.getTime();
        const nowMs = now.getTime();

        const viajesRealesDelMes = viajesOrdenados.filter(v => {
          const fs = new Date(v.fechaSalida || 0).getTime();
          return fs >= inicioMesMs && fs <= nowMs;
        });

        let cursor = inicioMesMs;
        let idx = 0;
        const contrato = await storage.getTmsContrato(contratoId);
        const contratoNombre = contrato?.nombre || "CONTRATO";

        while (cursor <= nowMs) {
          const fechaProyectada = new Date(cursor);
          const yaExiste = viajesRealesDelMes.find(v => {
            const fs = new Date(v.fechaSalida || 0).getTime();
            return Math.abs(fs - cursor) < avgIntervalMs * 0.4;
          });

          if (yaExiste) {
            viajesProyectados.push({
              tipo: "REAL",
              codigo: yaExiste.codigo,
              fecha: yaExiste.fechaSalida,
              km: parseFloat(yaExiste.kmRecorridos || "0") || 0,
              rendimiento: parseFloat(yaExiste.rendimientoReal || "0") || 0,
              litros: parseFloat(yaExiste.litrosSigetra || "0") || 0,
              estado: yaExiste.estado,
              viajeId: yaExiste.id,
            });
          } else {
            idx++;
            const variacion = 0.85 + Math.random() * 0.3;
            const kmProyectado = Math.round(avgKmP * variacion * 10) / 10;
            const rendProyectado = Math.round(avgRendP * (0.9 + Math.random() * 0.2) * 100) / 100;
            const litProyectado = rendProyectado > 0 ? Math.round((kmProyectado / rendProyectado) * 100) / 100 : 0;

            viajesProyectados.push({
              tipo: "PROYECTADO",
              codigo: `PRY-${camion.patente}-${String(idx).padStart(3, "0")}`,
              fecha: fechaProyectada.toISOString(),
              km: kmProyectado,
              rendimiento: rendProyectado,
              litros: litProyectado,
              estado: "FINALIZADO",
              viajeId: null,
            });
          }
          cursor += avgIntervalMs;
        }

        viajesProyectados.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
      }

      const totalProyectados = viajesProyectados.filter(v => v.tipo === "PROYECTADO").length;
      const totalRealesEnMes = viajesProyectados.filter(v => v.tipo === "REAL").length;
      const kmProyectadoMes = Math.round(viajesProyectados.reduce((s, v) => s + (v.km || 0), 0) * 10) / 10;
      const litrosProyectadoMes = Math.round(viajesProyectados.reduce((s, v) => s + (v.litros || 0), 0) * 100) / 100;

      res.json({
        camion,
        viajes: viajesOrdenados,
        ultimoViaje,
        viajeSimilarPropuesto,
        viajesProyectados,
        resumenMes: {
          totalViajes: viajesProyectados.length,
          viajesReales: totalRealesEnMes,
          viajesProyectados: totalProyectados,
          kmTotal: kmProyectadoMes,
          litrosTotal: litrosProyectadoMes,
        },
        resumen: {
          totalViajes: viajesOrdenados.length,
          totalKm: Math.round(viajesOrdenados.reduce((s, v) => s + (parseFloat(v.kmRecorridos || "0") || 0), 0) * 10) / 10,
          totalLitros: Math.round(viajesOrdenados.reduce((s, v) => s + (parseFloat(v.litrosSigetra || "0") || 0), 0) * 100) / 100,
          rendimientoProm: (() => {
            const rends = viajesOrdenados.map(v => parseFloat(v.rendimientoReal || "0") || 0).filter(r => r > 0);
            return rends.length > 0 ? Math.round(rends.reduce((s, v) => s + v, 0) / rends.length * 100) / 100 : 0;
          })(),
        },
      });
    } catch (error: any) {
      console.error("[tms] Error fetching camion detail:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/tms/contratos/:id/mapa", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });

      const puntos = await storage.getTmsPuntos(id);
      const viajes = await storage.getTmsViajes(id);

      const routes = await Promise.all(
        viajes.filter(v => v.origenLat && v.destinoLat).slice(0, 50).map(async v => {
          const paradas = await storage.getTmsParadas(v.id);
          return {
            id: v.id,
            codigo: v.codigo,
            camionId: v.camionId,
            estado: v.estado,
            origenLat: v.origenLat,
            origenLng: v.origenLng,
            destinoLat: v.destinoLat,
            destinoLng: v.destinoLng,
            kmRecorridos: v.kmRecorridos,
            rendimientoReal: v.rendimientoReal,
            paradas: paradas.map(p => ({ lat: p.lat, lng: p.lng, nombre: p.nombre, tipo: p.tipo })),
          };
        })
      );

      let livePositions: { camionId: number; patente: string; lat: number; lng: number; speed: number }[] = [];
      try {
        const allCamiones = await storage.getCamiones();
        const contrato = await storage.getTmsContrato(id);
        if (contrato) {
          const contractTrucks = allCamiones.filter(c => c.faenaId === contrato.faenaId);
          const fleet = await getFleetStatus();
          for (const truck of contractTrucks) {
            if (!truck.vin) continue;
            const match = fleet.find((v: any) => v.vin === truck.vin);
            if (match?.gps?.latitude && match?.gps?.longitude) {
              livePositions.push({
                camionId: truck.id,
                patente: truck.patente,
                lat: match.gps.latitude,
                lng: match.gps.longitude,
                speed: match.gps.speed || 0,
              });
            }
          }
        }
      } catch {}

      res.json({ puntos, routes, livePositions });
    } catch (error: any) {
      console.error("[tms] Error fetching mapa:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/tms/contratos/:id/stats", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });

      const contrato = await storage.getTmsContrato(id);
      if (!contrato) return res.status(404).json({ message: "Contrato no encontrado" });

      const viajes = await storage.getTmsViajes(id);
      const allCamiones = await storage.getCamiones();
      const camiones = allCamiones.filter(c => c.faenaId === contrato.faenaId);

      const totalKm = viajes.reduce((s, v) => s + (parseFloat(v.kmRecorridos || "0") || 0), 0);
      const totalLitros = viajes.reduce((s, v) => s + (parseFloat(v.litrosSigetra || "0") || 0), 0);
      const rendimientos = viajes.filter(v => v.rendimientoReal).map(v => ({ camionId: v.camionId, rend: parseFloat(v.rendimientoReal!) }));
      const rendProm = rendimientos.length > 0 ? rendimientos.reduce((s, r) => s + r.rend, 0) / rendimientos.length : 0;
      const kmPorViaje = viajes.length > 0 ? totalKm / viajes.length : 0;

      const byTruck = new Map<number, { km: number; viajes: number; rend: number[] }>();
      for (const v of viajes) {
        if (!v.camionId) continue;
        const existing = byTruck.get(v.camionId) || { km: 0, viajes: 0, rend: [] };
        existing.km += parseFloat(v.kmRecorridos || "0") || 0;
        existing.viajes++;
        if (v.rendimientoReal) existing.rend.push(parseFloat(v.rendimientoReal));
        byTruck.set(v.camionId, existing);
      }

      let mejorCamion: { patente: string; rend: number } | null = null;
      let peorCamion: { patente: string; rend: number } | null = null;

      for (const [camionId, data] of byTruck) {
        if (data.rend.length === 0) continue;
        const avgRend = data.rend.reduce((a, b) => a + b, 0) / data.rend.length;
        const cam = camiones.find(c => c.id === camionId);
        if (!cam) continue;

        if (!mejorCamion || avgRend > mejorCamion.rend) {
          mejorCamion = { patente: cam.patente, rend: Math.round(avgRend * 100) / 100 };
        }
        if (!peorCamion || avgRend < peorCamion.rend) {
          peorCamion = { patente: cam.patente, rend: Math.round(avgRend * 100) / 100 };
        }
      }

      res.json({
        totalViajes: viajes.length,
        totalCamiones: camiones.length,
        totalKm: Math.round(totalKm * 10) / 10,
        totalLitros: Math.round(totalLitros * 100) / 100,
        kmPorViaje: Math.round(kmPorViaje * 10) / 10,
        rendimientoProm: Math.round(rendProm * 100) / 100,
        mejorCamion,
        peorCamion,
        viajesPorEstado: {
          detectados: viajes.filter(v => v.estado === "DETECTADO").length,
          confirmados: viajes.filter(v => v.estado === "CONFIRMADO").length,
          enRuta: viajes.filter(v => v.estado === "EN_RUTA").length,
          completados: viajes.filter(v => v.estado === "COMPLETADO").length,
        },
      });
    } catch (error: any) {
      console.error("[tms] Error fetching stats:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/tms/viajes/:id/confirmar", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });

      const viaje = await storage.getTmsViaje(id);
      if (!viaje) return res.status(404).json({ message: "Viaje no encontrado" });

      const updated = await storage.updateTmsViaje(id, { estado: "CONFIRMADO", confirmado: true });
      res.json(updated);
    } catch (error: any) {
      console.error("[tms] Error confirming viaje:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/tms/viajes/:id/cerrar", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });

      const viaje = await storage.getTmsViaje(id);
      if (!viaje) return res.status(404).json({ message: "Viaje no encontrado" });

      const kmCierre = req.body.kmCierre ? parseFloat(req.body.kmCierre) : null;
      const notas = req.body.notas || null;

      const kmInicio = parseFloat(viaje.kmInicio || "0");
      const kmRecorridos = kmCierre ? Math.round((kmCierre - kmInicio) * 10) / 10 : parseFloat(viaje.kmRecorridos || "0");

      const updated = await storage.updateTmsViaje(id, {
        estado: "COMPLETADO",
        fechaCierre: new Date(),
        kmCierre: kmCierre ? String(kmCierre) : viaje.kmCierre,
        kmRecorridos: String(kmRecorridos),
        notas: notas || viaje.notas,
      });

      res.json(updated);
    } catch (error: any) {
      console.error("[tms] Error closing viaje:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/tms/contratos/:id/viajes", async (req, res) => {
    try {
      const contratoId = parseInt(req.params.id);
      if (isNaN(contratoId)) return res.status(400).json({ message: "Invalid ID" });

      const contrato = await storage.getTmsContrato(contratoId);
      if (!contrato) return res.status(404).json({ message: "Contrato no encontrado" });

      const { paradas: paradasData, ...viajeData } = req.body;

      if (viajeData.camionId) {
        const allCamiones = await storage.getCamiones();
        const contractTrucks = allCamiones.filter(c => c.faenaId === contrato.faenaId);
        if (!contractTrucks.find(c => c.id === viajeData.camionId)) {
          return res.status(400).json({ message: "El camion no pertenece a la faena de este contrato" });
        }
      }

      const existingViajes = await storage.getTmsViajes(contratoId);
      const prefix = contrato.nombre.replace(/[^A-Z0-9]/gi, "").substring(0, 4) || "CONT";
      const nextIdx = existingViajes.length + 1;
      const codigo = viajeData.codigo || generateCodigo(contratoId, prefix, nextIdx);

      const viaje = await storage.createTmsViaje({
        ...viajeData,
        contratoId,
        codigo,
        estado: viajeData.estado || "CONFIRMADO",
        detectadoPorIa: false,
        confirmado: true,
      });

      const createdParadas = [];
      if (Array.isArray(paradasData)) {
        for (let i = 0; i < paradasData.length; i++) {
          const p = paradasData[i];
          if (!p.nombre && !p.lat) continue;
          const parada = await storage.createTmsParada({
            viajeId: viaje.id,
            orden: p.orden || i + 1,
            nombre: p.nombre || null,
            lat: p.lat || null,
            lng: p.lng || null,
            tipo: p.tipo || "ENTREGA",
            estado: "PENDIENTE",
            horaEstimada: p.horaEstimada ? new Date(p.horaEstimada) : null,
          });
          createdParadas.push(parada);
        }
      }

      res.json({ ...viaje, paradas: createdParadas });
    } catch (error: any) {
      console.error("[tms] Error creating viaje:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/tms/puntos/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });

      const allowed = ["nombreInferido", "tipo", "confirmado"];
      const data: any = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) data[key] = req.body[key];
      }

      const updated = await storage.updateTmsPunto(id, data);
      if (!updated) return res.status(404).json({ message: "Punto no encontrado" });
      res.json(updated);
    } catch (error: any) {
      console.error("[tms] Error updating punto:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  let autoSyncRunning = false;

  app.post("/api/tms/auto-sync", async (_req, res) => {
    if (autoSyncRunning) {
      return res.status(409).json({ message: "Sincronizacion ya en progreso" });
    }
    autoSyncRunning = true;
    try {
      console.log("[tms-auto-sync] Iniciando sincronizacion automatica...");

      const from = new Date(DATA_START.getTime());
      const to = new Date();

      let summaries: any[] = [];
      try {
        summaries = await getSigetraFuelSummary(from, to);
      } catch (e: any) {
        console.error("[tms-auto-sync] Error Sigetra:", e.message);
        return res.status(502).json({ message: `Error conectando con Sigetra: ${e.message}` });
      }

      const sigetraFaenas = [...new Set(
        summaries
          .map(s => s.faenaPri?.trim())
          .filter((f): f is string => !!f && f.length > 0)
      )];

      console.log(`[tms-auto-sync] Faenas Sigetra detectadas: ${sigetraFaenas.length}`);

      const existingFaenas = await storage.getFaenas();
      const existingContratos = await storage.getTmsContratos();
      const camiones = await storage.getCamiones();

      const faenaNameMap = new Map(existingFaenas.map(f => [f.nombre.toLowerCase().trim(), f]));
      const contratoByFaenaId = new Map(existingContratos.map(c => [c.faenaId, c]));

      const colorsPool = ["#1A8FFF", "#FF6B35", "#00C49A", "#FFD93D", "#6C5CE7", "#E17055", "#00B894", "#FD79A8", "#74B9FF", "#A29BFE"];
      let faenasCreadas = 0;
      let contratosCreados = 0;
      const contratosParaAnalizar: number[] = [];

      for (const faenaName of sigetraFaenas) {
        const key = faenaName.toLowerCase().trim();
        let faena = faenaNameMap.get(key);

        if (!faena) {
          faena = await storage.createFaena({
            nombre: faenaName,
            color: colorsPool[faenasCreadas % colorsPool.length],
          });
          faenaNameMap.set(key, faena);
          faenasCreadas++;
          console.log(`[tms-auto-sync] Faena creada: ${faenaName}`);
        }

        const matchingSummaries = summaries.filter(s => s.faenaPri?.trim().toLowerCase() === key);

        for (const summ of matchingSummaries) {
          const numVehStr = String(summ.numVeh || "").trim();
          const patenteStr = (summ.patente || "").trim();
          const cam = camiones.find(c => {
            const cp = c.patente.trim();
            return cp === numVehStr || cp === patenteStr;
          });
          if (cam && cam.faenaId !== faena.id) {
            await storage.updateCamion(cam.id, { faenaId: faena.id });
            (cam as any).faenaId = faena.id;
          }
        }

        if (!contratoByFaenaId.has(faena.id)) {
          const hasTrucks = camiones.some(c => c.faenaId === faena!.id);

          if (hasTrucks) {
            const contrato = await storage.createTmsContrato({
              faenaId: faena.id,
              nombre: faena.nombre,
              cliente: faena.nombre,
              descripcion: `Auto-creado desde Sigetra`,
              fechaInicio: DATA_START_STR,
              activo: true,
            });
            contratoByFaenaId.set(faena.id, contrato);
            contratosCreados++;
            contratosParaAnalizar.push(contrato.id);
            console.log(`[tms-auto-sync] Contrato creado: ${faena.nombre}`);
          }
        } else {
          const existingContrato = contratoByFaenaId.get(faena.id)!;
          if (existingContrato.totalViajes === 0 || existingContrato.totalViajes === null) {
            contratosParaAnalizar.push(existingContrato.id);
          }
        }
      }

      console.log(`[tms-auto-sync] Contratos por analizar: ${contratosParaAnalizar.length}`);

      let fleetStatus: any[] = [];
      try { fleetStatus = await getFleetStatus(); } catch {}

      let fuelData: any[] = [];
      try { fuelData = await getCachedFuelData(from, to); } catch {}

      const updatedCamiones = await storage.getCamiones();
      const allVins = updatedCamiones.map(c => c.vin).filter((v): v is string => !!v);
      const snapshots = allVins.length > 0
        ? await storage.getVolvoFuelSnapshotsInRange(allVins, from, to)
        : [];

      const resultados: { contratoId: number; nombre: string; viajes: number; puntos: number }[] = [];

      for (const contratoId of contratosParaAnalizar) {
        const contrato = await storage.getTmsContrato(contratoId);
        if (!contrato) continue;

        const camionesContrato = updatedCamiones.filter(c => c.faenaId === contrato.faenaId);
        if (camionesContrato.length === 0) continue;

        console.log(`[tms-auto-sync] Analizando ${contrato.nombre} (${camionesContrato.length} camiones)...`);

        await storage.deleteTmsViajesByContrato(contratoId);
        await storage.deleteTmsPuntosByContrato(contratoId);

        interface GpsPoint { lat: number; lng: number; time: Date; speed: number; km: number }
        interface DetectedStop { lat: number; lng: number; arrivalTime: Date; departureTime: Date; durationMin: number }
        interface DetectedTrip { camionId: number; patente: string; conductor: string | null; stops: DetectedStop[]; startTime: Date; endTime: Date; kmStart: number; kmEnd: number; kmDist: number }

        const allTrips: DetectedTrip[] = [];
        const allStopClusters: { lat: number; lng: number; camionId: number; count: number; durationMin: number; firstVisit: Date; lastVisit: Date }[] = [];

        for (const camion of camionesContrato) {
          if (!camion.vin) continue;

          const gpsPoints: GpsPoint[] = [];

          const volvoStatus = fleetStatus.find((v: any) => v.vin === camion.vin);
          if (volvoStatus?.gps?.latitude && volvoStatus?.gps?.longitude) {
            gpsPoints.push({
              lat: volvoStatus.gps.latitude,
              lng: volvoStatus.gps.longitude,
              time: new Date(volvoStatus.gps.positionDateTime || volvoStatus.createdDateTime || Date.now()),
              speed: volvoStatus.gps.speed || 0,
              km: volvoStatus.totalDistance ? volvoStatus.totalDistance / 1000 : (camion.odometro || 0),
            });
          }

          const camionSnapshots = snapshots.filter(s => s.vin === camion.vin).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

          for (let i = 0; i < camionSnapshots.length; i++) {
            const snap = camionSnapshots[i];
            const km = snap.totalDistance ? snap.totalDistance / 1000 : 0;
            const prevKm = i > 0 && camionSnapshots[i - 1].totalDistance ? camionSnapshots[i - 1].totalDistance! / 1000 : km;
            const deltaKm = km - prevKm;

            if (km > 0) {
              gpsPoints.push({
                lat: 0, lng: 0,
                time: new Date(snap.capturedAt),
                speed: deltaKm > 0 ? 30 : 0,
                km,
              });
            }
          }

          gpsPoints.sort((a, b) => a.time.getTime() - b.time.getTime());

          const stops: DetectedStop[] = [];
          for (let i = 1; i < gpsPoints.length; i++) {
            const prev = gpsPoints[i - 1];
            const curr = gpsPoints[i];
            const timeDiffMin = (curr.time.getTime() - prev.time.getTime()) / (1000 * 60);
            const distKm = (prev.lat && curr.lat) ? haversineKm(prev.lat, prev.lng, curr.lat, curr.lng) : Math.abs(curr.km - prev.km);

            if (timeDiffMin >= 30 && distKm < 0.5) {
              stops.push({
                lat: curr.lat || prev.lat,
                lng: curr.lng || prev.lng,
                arrivalTime: prev.time,
                departureTime: curr.time,
                durationMin: Math.round(timeDiffMin),
              });
            }
          }

          for (const stop of stops) {
            if (stop.lat === 0 && stop.lng === 0) continue;
            const existing = allStopClusters.find(c =>
              c.camionId === camion.id && haversineKm(c.lat, c.lng, stop.lat, stop.lng) < 0.5
            );
            if (existing) {
              existing.count++;
              existing.durationMin = Math.round((existing.durationMin * (existing.count - 1) + stop.durationMin) / existing.count);
              if (stop.arrivalTime < existing.firstVisit) existing.firstVisit = stop.arrivalTime;
              if (stop.departureTime > existing.lastVisit) existing.lastVisit = stop.departureTime;
            } else {
              allStopClusters.push({
                lat: stop.lat, lng: stop.lng, camionId: camion.id, count: 1,
                durationMin: stop.durationMin, firstVisit: stop.arrivalTime, lastVisit: stop.departureTime,
              });
            }
          }

          const totalKm = gpsPoints.length > 0 ? gpsPoints[gpsPoints.length - 1].km - gpsPoints[0].km : 0;
          if (totalKm >= 20) {
            const tripCount = Math.max(1, Math.floor(totalKm / 200));

            for (let t = 0; t < tripCount; t++) {
              const startIdx = Math.floor((t / tripCount) * gpsPoints.length);
              const endIdx = Math.min(Math.floor(((t + 1) / tripCount) * gpsPoints.length), gpsPoints.length - 1);
              const startPt = gpsPoints[startIdx];
              const endPt = gpsPoints[endIdx];
              const segKm = endPt.km - startPt.km;

              if (segKm >= 20) {
                const tripStops = stops.filter(s =>
                  s.arrivalTime >= startPt.time && s.departureTime <= endPt.time
                );

                allTrips.push({
                  camionId: camion.id,
                  patente: camion.patente,
                  conductor: camion.conductor,
                  stops: tripStops,
                  startTime: startPt.time,
                  endTime: endPt.time,
                  kmStart: startPt.km,
                  kmEnd: endPt.km,
                  kmDist: Math.round(segKm * 10) / 10,
                });
              }
            }
          }
        }

        const prefix = contrato.nombre.replace(/[^A-Z0-9]/gi, "").substring(0, 4) || "CONT";
        let viajeIdx = 1;
        let totalKmSaved = 0;
        let totalLitrosSaved = 0;

        for (const trip of allTrips) {
          const codigo = generateCodigo(contratoId, prefix, viajeIdx++);

          const numVeh = parseInt(trip.patente, 10);
          const truckFuel = fuelData.filter((c: any) => {
            if (!isNaN(numVeh) && c.numVeh === numVeh) return true;
            return c.patente === trip.patente;
          }).filter((c: any) => {
            const fecha = new Date(c.fechaConsumo);
            return fecha >= trip.startTime && fecha <= trip.endTime;
          });

          const litrosSigetra = truckFuel.reduce((s: number, c: any) => s + (c.cantidadLt || 0), 0);

          const camionSnaps = snapshots.filter(s => {
            const cam = camionesContrato.find(c => c.id === trip.camionId);
            return cam?.vin && s.vin === cam.vin;
          }).filter(s => {
            const t = new Date(s.capturedAt);
            return t >= trip.startTime && t <= trip.endTime;
          }).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

          let litrosEcu: number | null = null;
          if (camionSnaps.length >= 2) {
            litrosEcu = Math.round((camionSnaps[camionSnaps.length - 1].totalFuelUsed - camionSnaps[0].totalFuelUsed) / 1000 * 100) / 100;
          }

          const diferenciaLitros = (litrosSigetra > 0 && litrosEcu != null) ? Math.round((litrosSigetra - litrosEcu) * 100) / 100 : null;
          const rendimiento = (trip.kmDist > 0 && litrosEcu && litrosEcu > 0) ? Math.round((trip.kmDist / litrosEcu) * 100) / 100 : null;

          const viaje = await storage.createTmsViaje({
            contratoId,
            camionId: trip.camionId,
            codigo,
            conductor: trip.conductor,
            origenNombre: null,
            origenLat: trip.stops.length > 0 && trip.stops[0].lat ? String(trip.stops[0].lat) : null,
            origenLng: trip.stops.length > 0 && trip.stops[0].lng ? String(trip.stops[0].lng) : null,
            destinoNombre: null,
            destinoLat: trip.stops.length > 1 && trip.stops[trip.stops.length - 1].lat ? String(trip.stops[trip.stops.length - 1].lat) : null,
            destinoLng: trip.stops.length > 1 && trip.stops[trip.stops.length - 1].lng ? String(trip.stops[trip.stops.length - 1].lng) : null,
            fechaSalida: trip.startTime,
            fechaLlegada: trip.endTime,
            estado: "DETECTADO",
            kmInicio: String(Math.round(trip.kmStart)),
            kmCierre: String(Math.round(trip.kmEnd)),
            kmRecorridos: String(trip.kmDist),
            litrosSigetra: litrosSigetra > 0 ? String(Math.round(litrosSigetra * 100) / 100) : null,
            litrosEcu: litrosEcu != null ? String(litrosEcu) : null,
            diferenciaLitros: diferenciaLitros != null ? String(diferenciaLitros) : null,
            rendimientoReal: rendimiento != null ? String(rendimiento) : null,
            detectadoPorIa: true,
            confirmado: false,
          });

          for (let si = 0; si < trip.stops.length; si++) {
            const stop = trip.stops[si];
            if (stop.lat === 0 && stop.lng === 0) continue;
            await storage.createTmsParada({
              viajeId: viaje.id,
              orden: si + 1,
              nombre: null,
              lat: String(stop.lat),
              lng: String(stop.lng),
              tipo: si === 0 ? "CARGA" : "ENTREGA",
              estado: "COMPLETADO",
              horaEstimada: stop.arrivalTime,
              horaReal: stop.departureTime,
            });
          }

          totalKmSaved += trip.kmDist;
          totalLitrosSaved += litrosSigetra;
        }

        for (const cluster of allStopClusters) {
          await storage.createTmsPunto({
            contratoId,
            camionId: cluster.camionId,
            lat: String(cluster.lat),
            lng: String(cluster.lng),
            tipo: null,
            vecesVisitado: cluster.count,
            duracionPromedioMin: cluster.durationMin,
            primeraVisita: cluster.firstVisit,
            ultimaVisita: cluster.lastVisit,
            confirmado: false,
          });
        }

        await storage.updateTmsContrato(contratoId, {
          totalViajes: allTrips.length,
          kmTotal: String(Math.round(totalKmSaved * 10) / 10),
          litrosTotal: String(Math.round(totalLitrosSaved * 100) / 100),
        });

        resultados.push({
          contratoId,
          nombre: contrato.nombre,
          viajes: allTrips.length,
          puntos: allStopClusters.length,
        });

        console.log(`[tms-auto-sync] ${contrato.nombre}: ${allTrips.length} viajes, ${allStopClusters.length} puntos`);
      }

      const totalViajes = resultados.reduce((s, r) => s + r.viajes, 0);
      console.log(`[tms-auto-sync] Completado: ${faenasCreadas} faenas, ${contratosCreados} contratos, ${totalViajes} viajes`);

      res.json({
        faenasSigetra: sigetraFaenas.length,
        faenasCreadas,
        contratosCreados,
        contratosAnalizados: contratosParaAnalizar.length,
        totalViajes,
        resultados,
      });
    } catch (error: any) {
      console.error("[tms-auto-sync] Error:", error.message);
      res.status(500).json({ message: error.message });
    } finally {
      autoSyncRunning = false;
    }
  });
}

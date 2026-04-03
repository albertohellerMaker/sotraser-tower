const RFMS_BASE = "https://api.volvotrucks.com/rfms";

function getAuthHeader(): string {
  const user = process.env.VOLVO_CONNECT_USER;
  const pass = process.env.VOLVO_CONNECT_PASSWORD;
  if (!user || !pass) throw new Error("Volvo Connect credentials not configured");
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

async function rfmsGet<T>(path: string, accept: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${RFMS_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
  }

  const isHistorical = !!(params?.starttime || params?.startTime);
  const timeoutMs = isHistorical ? 30000 : 15000;
  console.log(`[volvo-api] GET ${url.toString()}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: getAuthHeader(),
        Accept: accept,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[volvo-api] ${res.status} ${res.statusText}: ${body}`);
      throw new Error(`Volvo API ${res.status}: ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error("Volvo API timeout (15s)");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export interface RfmsVehicle {
  VIN: string;
  CustomerVehicleName?: string;
  Brand?: string;
  Model?: string;
  Type?: string;
  ChassisType?: string;
  BodyType?: string;
  EmissionLevel?: string;
  NoOfAxles?: number;
  TotalFuelTankVolume?: number;
  GearboxType?: string;
  PossibleFuelType?: string[];
  ProductionDate?: { Year?: number; Month?: number; Day?: number };
}

export interface RfmsVehiclesResponse {
  Vehicle?: RfmsVehicle[];
  MoreDataAvailable?: boolean;
}

export interface RfmsGNSSPosition {
  Latitude?: number;
  Longitude?: number;
  Altitude?: number;
  Heading?: number;
  Speed?: number;
  PositionDateTime?: string;
}

export interface RfmsSnapshot {
  FuelLevel1?: number;
  EngineSpeed?: number;
  WheelBasedSpeed?: number;
  TachographSpeed?: number;
  AmbientAirTemperature?: number;
  CatalystFuelLevel?: number;
  GNSSPosition?: RfmsGNSSPosition;
  Driver1WorkingState?: string;
}

export interface RfmsVehicleStatus {
  Vin: string;
  CreatedDateTime: string;
  ReceivedDateTime: string;
  HRTotalVehicleDistance?: number;
  TotalEngineHours?: number;
  EngineTotalFuelUsed?: number;
  GrossCombinationVehicleWeight?: number;
  Driver1Id?: { OemDriverIdentification?: { IdType?: string; DriverIdentification?: string } };
  SnapshotData?: RfmsSnapshot;
  TriggerType?: { TriggerType: string; Context: string };
}

export interface RfmsVehicleStatusesResponse {
  VehicleStatus?: RfmsVehicleStatus[];
  MoreDataAvailable?: boolean;
  RequestServerDateTime?: string;
}

export interface RfmsVehiclePosition {
  VIN: string;
  CreatedDateTime: string;
  ReceivedDateTime: string;
  GNSSPosition?: RfmsGNSSPosition;
  WheelBasedSpeed?: number;
  TachographSpeed?: number;
  TriggerType?: { TriggerType: string; Context: string };
}

export interface RfmsVehiclePositionsResponse {
  VehiclePosition?: RfmsVehiclePosition[];
  MoreDataAvailable?: boolean;
  RequestServerDateTime?: string;
}

export async function getVehicles(): Promise<RfmsVehicle[]> {
  const allVehicles: RfmsVehicle[] = [];
  let lastVin: string | undefined;
  let hasMore = true;
  const MAX_PAGES = 50;
  let page = 0;

  while (hasMore && page < MAX_PAGES) {
    const params: Record<string, string> = {};
    if (lastVin) params.lastVin = lastVin;

    const data = await rfmsGet<RfmsVehiclesResponse>(
      "/vehicles",
      "application/vnd.fmsstandard.com.Vehicles.v2.1+json",
      params
    );

    if (!data.Vehicle || data.Vehicle.length === 0) break;

    const newLastVin = data.Vehicle[data.Vehicle.length - 1].VIN;
    if (newLastVin === lastVin) break;

    allVehicles.push(...data.Vehicle);
    lastVin = newLastVin;
    hasMore = data.MoreDataAvailable === true;
    page++;
  }

  console.log(`[volvo-api] Fetched ${allVehicles.length} vehicles in ${page} pages`);
  return allVehicles;
}

export async function getVehicleStatuses(vin?: string, latestOnly = true): Promise<RfmsVehicleStatus[]> {
  const params: Record<string, string> = {};
  if (vin) params.vin = vin;
  if (latestOnly) params.latestOnly = "true";

  const data = await rfmsGet<RfmsVehicleStatusesResponse>(
    "/vehiclestatuses",
    "application/vnd.fmsstandard.com.Vehiclestatuses.v2.1+json",
    params
  );

  return data.VehicleStatus || [];
}

export async function getVehiclePositions(vin?: string, latestOnly = true): Promise<RfmsVehiclePosition[]> {
  const params: Record<string, string> = {};
  if (vin) params.vin = vin;
  if (latestOnly) params.latestOnly = "true";

  const data = await rfmsGet<RfmsVehiclePositionsResponse>(
    "/vehiclepositions",
    "application/vnd.fmsstandard.com.Vehiclepositions.v2.1+json",
    params
  );

  return data.VehiclePosition || [];
}

export async function getVehicleStatusesRange(
  startTime: string, stopTime: string
): Promise<RfmsVehicleStatus[]> {
  const all: RfmsVehicleStatus[] = [];
  let hasMore = true;
  let pages = 0;
  const MAX_PAGES = 200;
  let cursor = startTime;

  while (hasMore && pages < MAX_PAGES) {
    if (new Date(cursor) >= new Date(stopTime)) break;

    const data = await rfmsGet<RfmsVehicleStatusesResponse>(
      "/vehiclestatuses",
      "application/vnd.fmsstandard.com.Vehiclestatuses.v2.1+json",
      { starttime: cursor, stoptime: stopTime }
    );

    const batch = data.VehicleStatus || [];
    if (batch.length === 0) break;
    all.push(...batch);
    hasMore = data.MoreDataAvailable === true;
    if (hasMore) {
      const lastTs = batch[batch.length - 1].ReceivedDateTime || batch[batch.length - 1].CreatedDateTime;
      if (!lastTs || lastTs <= cursor) break;
      cursor = lastTs;
    }
    pages++;
    if (pages % 10 === 0) {
      console.log(`[volvo-api] statusesRange page ${pages}, ${all.length} records so far`);
    }
    await new Promise(r => setTimeout(r, 1100));
  }

  console.log(`[volvo-api] statusesRange: ${all.length} records in ${pages} pages (${startTime} → ${stopTime})`);
  return all;
}

export async function getVehiclePositionsRange(
  startTime: string, stopTime: string
): Promise<RfmsVehiclePosition[]> {
  const all: RfmsVehiclePosition[] = [];
  let hasMore = true;
  let pages = 0;
  const MAX_PAGES = 200;
  let cursor = startTime;

  while (hasMore && pages < MAX_PAGES) {
    if (new Date(cursor) >= new Date(stopTime)) break;

    const data = await rfmsGet<RfmsVehiclePositionsResponse>(
      "/vehiclepositions",
      "application/vnd.fmsstandard.com.Vehiclepositions.v2.1+json",
      { starttime: cursor, stoptime: stopTime }
    );

    const batch = data.VehiclePosition || [];
    if (batch.length === 0) break;
    all.push(...batch);
    hasMore = data.MoreDataAvailable === true;
    if (hasMore) {
      const lastTs = batch[batch.length - 1].ReceivedDateTime || batch[batch.length - 1].CreatedDateTime;
      if (!lastTs || lastTs <= cursor) break;
      cursor = lastTs;
    }
    pages++;
    if (pages % 10 === 0) {
      console.log(`[volvo-api] positionsRange page ${pages}, ${all.length} records so far`);
    }
    await new Promise(r => setTimeout(r, 1100));
  }

  console.log(`[volvo-api] positionsRange: ${all.length} records in ${pages} pages (${startTime} → ${stopTime})`);
  return all;
}

export interface UnifiedVehicleStatus {
  vin: string;
  createdDateTime: string | null;
  gps: {
    latitude: number | null;
    longitude: number | null;
    altitude: number | null;
    heading: number | null;
    speed: number | null;
    positionDateTime: string | null;
  };
  fuelLevel: number | null;
  engineHours: number | null;
  totalDistance: number | null;
  totalFuelUsed: number | null;
  engineSpeed: number | null;
  wheelBasedSpeed: number | null;
  ambientTemperature: number | null;
  driverId: string | null;
  driverWorkingState: string | null;
  catalystFuelLevel: number | null;
  grossWeight: number | null;
}

function buildUnifiedStatus(
  status: RfmsVehicleStatus | undefined,
  position: RfmsVehiclePosition | undefined,
  vin: string
): UnifiedVehicleStatus {
  const snap = status?.SnapshotData;
  const gpsFromStatus = snap?.GNSSPosition;
  const gpsFromPosition = position?.GNSSPosition;
  const gps = gpsFromStatus || gpsFromPosition;

  return {
    vin,
    createdDateTime: status?.CreatedDateTime || position?.CreatedDateTime || null,
    gps: {
      latitude: gps?.Latitude ?? null,
      longitude: gps?.Longitude ?? null,
      altitude: gps?.Altitude ?? null,
      heading: gps?.Heading ?? null,
      speed: gps?.Speed ?? null,
      positionDateTime: gps?.PositionDateTime ?? null,
    },
    fuelLevel: snap?.FuelLevel1 ?? null,
    engineHours: status?.TotalEngineHours ?? null,
    totalDistance: status?.HRTotalVehicleDistance ?? null,
    totalFuelUsed: status?.EngineTotalFuelUsed ?? null,
    engineSpeed: snap?.EngineSpeed ?? null,
    wheelBasedSpeed: snap?.WheelBasedSpeed ?? position?.WheelBasedSpeed ?? null,
    ambientTemperature: snap?.AmbientAirTemperature ?? null,
    driverId: status?.Driver1Id?.OemDriverIdentification?.DriverIdentification ?? null,
    driverWorkingState: snap?.Driver1WorkingState ?? null,
    catalystFuelLevel: snap?.CatalystFuelLevel ?? null,
    grossWeight: status?.GrossCombinationVehicleWeight ?? null,
  };
}

let fleetCache: { data: UnifiedVehicleStatus[]; timestamp: number } | null = null;
const FLEET_CACHE_TTL = 90 * 1000;

export async function getFleetStatus(): Promise<UnifiedVehicleStatus[]> {
  if (fleetCache && Date.now() - fleetCache.timestamp < FLEET_CACHE_TTL) {
    console.log("[volvo-api] Returning cached fleet status");
    return fleetCache.data;
  }

  const [statuses, positions] = await Promise.all([
    getVehicleStatuses(undefined, true),
    getVehiclePositions(undefined, true),
  ]);

  const statusMap = new Map(statuses.map(s => [s.Vin, s]));
  const positionMap = new Map(positions.map(p => [p.VIN, p]));

  const allVins = new Set(Array.from(statusMap.keys()).concat(Array.from(positionMap.keys())));
  const result: UnifiedVehicleStatus[] = [];

  for (const vin of Array.from(allVins)) {
    result.push(buildUnifiedStatus(statusMap.get(vin), positionMap.get(vin), vin));
  }

  fleetCache = { data: result, timestamp: Date.now() };
  console.log(`[volvo-api] Fleet status cached: ${result.length} vehicles`);
  return result;
}

export interface DriverEvaluationCategory {
  score: number;
  grade?: string;
}

export interface DriverEvaluation {
  vin: string;
  driverName?: string;
  period?: { startDate: string; endDate: string };
  overallScore?: number;
  categories?: {
    anticipation?: DriverEvaluationCategory;
    speedAdaption?: DriverEvaluationCategory;
    engineAndMotor?: DriverEvaluationCategory;
    fuelEconomy?: DriverEvaluationCategory;
  };
}

export interface DriverEvaluationsResponse {
  driverEvaluations?: DriverEvaluation[];
}

let driverEvalCache: { data: DriverEvaluation[]; timestamp: number } | null = null;
const DRIVER_EVAL_CACHE_TTL = 10 * 60 * 1000;

export async function getDriverEvaluations(startDate: string): Promise<DriverEvaluation[]> {
  if (driverEvalCache && Date.now() - driverEvalCache.timestamp < DRIVER_EVAL_CACHE_TTL) {
    console.log("[volvo-api] Returning cached driver evaluations");
    return driverEvalCache.data;
  }

  try {
    const data = await rfmsGet<DriverEvaluationsResponse>(
      "/vehicles/driverEvaluation",
      "application/json",
      { startDate }
    );

    const results = data.driverEvaluations || [];
    driverEvalCache = { data: results, timestamp: Date.now() };
    console.log(`[volvo-api] Driver evaluations cached: ${results.length} records`);
    return results;
  } catch (err: any) {
    console.warn(`[volvo-api] Driver evaluation endpoint not available: ${err.message}`);
    return [];
  }
}

export async function getSingleVehicleStatus(vin: string): Promise<UnifiedVehicleStatus> {
  const [statuses, positions] = await Promise.all([
    getVehicleStatuses(vin, true),
    getVehiclePositions(vin, true),
  ]);

  const status = statuses.find(s => s.Vin === vin);
  const position = positions.find(p => p.VIN === vin);

  return buildUnifiedStatus(status, position, vin);
}

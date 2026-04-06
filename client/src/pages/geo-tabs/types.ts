export interface CamionLive {
  camionId: number;
  patente: string;
  modelo: string;
  conductor: string | null;
  lat: number | null;
  lng: number | null;
  velocidad: number;
  rumbo: number;
  timestamp: string | null;
  estado: string;
  ageMinutes: number;
  fuelLevel: number | null;
}

export interface GeoViaje {
  id: number;
  camionId: number;
  patente: string;
  contrato: string;
  origenNombre: string | null;
  destinoNombre: string | null;
  origenTimestamp: string | null;
  destinoTimestamp: string | null;
  kmGps: string | null;
  duracionMinutos: number | null;
  velocidadMaxima: string | null;
  velocidadPromedio: string | null;
  validacionEstado: string;
  validacionDetalle: any;
  cargaKmDeltaPct: string | null;
  cargaLitros: string | null;
  cargaSurtidorEnRuta: boolean | null;
  validadoManualmente: boolean;
  notas: string | null;
}

export interface GeoBase {
  id: number;
  nombre: string;
  lat: string;
  lng: string;
  radioMetros: number;
  contrato: string;
}

export const estadoColors: Record<string, string> = {
  VALIDADO: "#00c97a",
  REVISAR: "#ffcc00",
  ANOMALIA: "#ff2244",
  PENDIENTE: "#3a6080",
};

export const estadoLabels: Record<string, string> = {
  VALIDADO: "VALIDADO",
  REVISAR: "REVISAR",
  ANOMALIA: "ANOMALIA",
  PENDIENTE: "PENDIENTE",
};

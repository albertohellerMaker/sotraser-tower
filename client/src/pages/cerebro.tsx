import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, ChevronDown, ChevronUp, Loader2, Eye, TrendingUp, Brain, CheckCircle, Minimize2, Fuel } from "lucide-react";
import { ContratoPage } from "@/pages/hoy";

function BotonesAlerta({ alerta }: { alerta: any }) {
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  if (enviado) {
    return (
      <div className="font-exo text-[9px] mt-1" style={{ color: "#3a6080" }} data-testid="feedback-confirmado">
        Feedback registrado — sistema recalibrando
      </div>
    );
  }

  const enviar = async (decision: string, nota?: string) => {
    setEnviando(true);
    try {
      const resp = await fetch("/api/feedback/alerta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alertaTipo: alerta.tipo,
          entidadTipo: alerta.entidadTipo || "CAMION",
          entidadId: alerta.patente || alerta.entidadNombre,
          contrato: alerta.contrato,
          decision,
          nota,
          valorDetectado: alerta.valorReciente || alerta.dato,
          umbralUsado: alerta.valorHistorico,
          parametroAfectado: alerta.parametro || "rendimiento_kmL",
        }),
      });
      if (resp.ok) {
        setEnviado(true);
      }
    } catch (e) {
      console.error("[FEEDBACK]", e);
    }
    setEnviando(false);
  };

  return (
    <div className="flex items-center gap-2 mt-2">
      <button
        onClick={() => enviar("CONFIRMADO")}
        disabled={enviando}
        className="font-exo text-[9px] font-bold px-2 py-1 border cursor-pointer transition-all hover:opacity-80"
        style={{ borderColor: "#00ff8830", color: "#00ff88", background: "rgba(0,255,136,0.06)" }}
        data-testid="btn-feedback-confirmar"
      >
        Confirmar
      </button>
      <button
        onClick={() => {
          const nota = window.prompt("Motivo (opcional): trafico, lluvia, sobrecarga, ruta diferente...");
          enviar("FALSA_ALARMA", nota || undefined);
        }}
        disabled={enviando}
        className="font-exo text-[9px] px-2 py-1 border cursor-pointer transition-all hover:opacity-80"
        style={{ borderColor: "#0d2035", color: "#3a6080" }}
        data-testid="btn-feedback-falsa-alarma"
      >
        Falsa alarma
      </button>
    </div>
  );
}

const CONTRATO_COLORS: Record<string, string> = {
  "CENCOSUD": "#00d4ff",
  "ANGLO-COCU": "#00ff88",
  "ANGLO-CAL": "#ffcc00",
  "ANGLO-CARGAS VARIAS": "#ff6b35",
};

const CONTRATO_LABELS: Record<string, string> = {
  "CENCOSUD": "RETAIL",
  "ANGLO-COCU": "MINERIA",
  "ANGLO-CAL": "MINERIA",
  "ANGLO-CARGAS VARIAS": "LOGISTICA",
};

function MiniMapaVivo() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const geocercaLayersRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);

  const { data: camionesLive } = useQuery<any[]>({
    queryKey: ['/api/geo/camiones-live'],
    refetchInterval: 60000,
  });

  const { data: bases } = useQuery<any[]>({
    queryKey: ['/api/geo/bases'],
  });

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const loadLeaflet = async () => {
      const L = (window as any).L;
      if (!L) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);

        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => initMap();
        document.body.appendChild(script);
      } else {
        initMap();
      }
    };

    const initMap = () => {
      const L = (window as any).L;
      if (!L || !mapRef.current) return;

      const map = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
      }).setView([-33.45, -70.65], 6);

      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        { maxZoom: 19 }
      ).addTo(map);

      mapInstance.current = map;
      setMapReady(true);
    };

    loadLeaflet();
  }, []);

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapReady || !mapInstance.current || !camionesLive) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const statusColors: Record<string, string> = {
      EN_MOVIMIENTO: '#00ff88',
      DETENIDO_RECIENTE: '#ffcc00',
      DETENIDO: '#ff2244',
      'SIN_SEÑAL': '#3a6080',
    };

    for (const c of camionesLive) {
      if (!c.lat || !c.lng) continue;
      const color = statusColors[c.estado] || '#3a6080';

      const icon = L.divIcon({
        html: `<div style="
          width:10px;height:10px;
          background:${color};
          border:1px solid #020508;
          border-radius:50%;
          box-shadow:0 0 4px ${color}
        "></div>`,
        className: '',
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      });

      const marker = L.marker([c.lat, c.lng], { icon })
        .addTo(mapInstance.current)
        .bindPopup(`
          <div style="font-family:monospace;font-size:11px;
                      background:#020508;color:#c8e8ff;
                      padding:6px;min-width:140px">
            <b style="color:#00d4ff">${c.patente}</b><br/>
            ${c.conductor || 'Sin conductor'}<br/>
            ${c.velocidad || 0} km/h
          </div>
        `);

      markersRef.current.push(marker);
    }
  }, [camionesLive, mapReady]);

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapReady || !mapInstance.current || !bases || !camionesLive) return;

    geocercaLayersRef.current.forEach(l => l.remove());
    geocercaLayersRef.current = [];

    const tipoColores: Record<string, string> = {
      BASE: '#00d4ff',
      CD: '#00ff88',
      MINA: '#ffcc00',
      ESTACION: '#ff6b35',
      PATIO: '#a0a0ff',
      OTRO: '#3a6080',
    };

    for (const base of bases) {
      const bLat = parseFloat(base.lat);
      const bLng = parseFloat(base.lng);
      const radio = base.radioMetros || 1000;

      const camionesDentro = (camionesLive || []).filter((c: any) => {
        if (!c.lat || !c.lng) return false;
        const R = 6371000;
        const dLat = (c.lat - bLat) * Math.PI / 180;
        const dLng = (c.lng - bLng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(bLat * Math.PI / 180) * Math.cos(c.lat * Math.PI / 180) *
          Math.sin(dLng / 2) ** 2;
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return dist < radio;
      });

      if (camionesDentro.length === 0) continue;

      const color = tipoColores[base.tipo] || '#3a6080';

      const circle = L.circle([bLat, bLng], {
        radius: radio,
        color: color,
        fillColor: color,
        fillOpacity: 0.08,
        weight: 1.5,
        dashArray: '4,4',
      })
        .addTo(mapInstance.current)
        .bindPopup(`
          <div style="font-family:monospace;font-size:11px;
                      background:#020508;color:#c8e8ff;padding:6px">
            <b style="color:${color}">${base.nombre}</b><br/>
            ${base.tipo || ''}<br/>
            ${camionesDentro.length} camion(es) dentro
          </div>
        `);

      const pulse = L.circleMarker([bLat, bLng], {
        radius: 5,
        color: color,
        fillColor: color,
        fillOpacity: 1,
        weight: 0,
      }).addTo(mapInstance.current);

      geocercaLayersRef.current.push(circle, pulse);
    }
  }, [bases, camionesLive, mapReady]);

  const hayDatos = (camionesLive || []).some((c: any) => c.lat && c.lng);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div
        ref={mapRef}
        style={{ width: '100%', height: '100%' }}
        data-testid="mini-mapa-vivo"
      />
      {camionesLive && !hayDatos && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(2,5,8,0.85)', zIndex: 10,
        }}>
          <span className="font-exo text-[11px]" style={{ color: '#3a6080' }}>
            Sin datos GPS en este momento
          </span>
        </div>
      )}
    </div>
  );
}

function WidgetAprendizajeEstaciones() {
  const { data } = useQuery<any>({
    queryKey: ["/api/estaciones/aprendizaje"],
    refetchInterval: 10 * 60 * 1000,
  });

  if (!data?.resumen) return null;
  const r = data.resumen;

  const colorMadurez =
    r.madurez_pct >= 80 ? "#00ff88" :
    r.madurez_pct >= 50 ? "#00d4ff" :
    r.madurez_pct >= 20 ? "#ffcc00" :
    "#3a6080";

  return (
    <div className="border" style={{ borderColor: "#0d2035", background: "#060d14", borderTop: `2px solid ${colorMadurez}` }}
      data-testid="widget-aprendizaje-cerebro">
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: "1px solid #0d2035" }}>
        <div className="flex items-center gap-2">
          <Fuel className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />
          <span className="font-space text-[10px] font-bold tracking-[0.15em]" style={{ color: "#00d4ff" }}>
            APRENDIZAJE - ESTACIONES
          </span>
        </div>
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent("sotraser-navigate", { detail: { tab: "geo", subtab: "estaciones" } }));
          }}
          className="font-exo text-[9px] px-2 py-1 border cursor-pointer transition-all hover:border-[#00d4ff]"
          style={{ borderColor: "#0d2035", color: "#3a6080" }}
          data-testid="btn-ver-detalle-aprendizaje">
          VER DETALLE &rarr;
        </button>
      </div>

      <div className="p-4">
        <div className="font-rajdhani text-[11px] mb-3 leading-relaxed" style={{ color: "#c8e8ff" }}>
          "{r.mensaje}"
        </div>

        <div className="mb-3">
          <div className="flex justify-between mb-1">
            <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Calibracion del sistema</span>
            <span className="font-space text-[9px] font-bold" style={{ color: colorMadurez }}>{r.madurez_pct}%</span>
          </div>
          <div className="h-1" style={{ background: "#0d2035" }}>
            <div className="h-full transition-all" style={{ width: `${r.madurez_pct}%`, background: colorMadurez }} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2" style={{ background: "#0a1520" }}>
            <div className="font-space text-[18px] font-bold" style={{ color: "#00d4ff" }}>{r.total_patrones}</div>
            <div className="font-exo text-[7px] uppercase tracking-wider" style={{ color: "#3a6080" }}>Patrones</div>
          </div>
          <div className="text-center p-2" style={{ background: "#0a1520" }}>
            <div className="font-space text-[18px] font-bold" style={{ color: "#00ff88" }}>{r.camiones_con_patron}</div>
            <div className="font-exo text-[7px] uppercase tracking-wider" style={{ color: "#3a6080" }}>Camiones</div>
          </div>
          <div className="text-center p-2" style={{ background: "#0a1520" }}>
            <div className="font-space text-[18px] font-bold" style={{ color: "#ffcc00" }}>{r.cargas_historicas.toLocaleString("es-CL")}</div>
            <div className="font-exo text-[7px] uppercase tracking-wider" style={{ color: "#3a6080" }}>Cargas</div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>Confianza:</span>
          {[
            { k: "experta", c: "#00ff88", l: "EXP" },
            { k: "alta", c: "#00d4ff", l: "ALTA" },
            { k: "media", c: "#ffcc00", l: "MED" },
            { k: "baja", c: "#3a6080", l: "BAJA" },
          ].map(n => (
            <div key={n.k} className="flex items-center gap-1">
              <span className="font-space text-[10px] font-bold" style={{ color: n.c }}>{r.por_confianza[n.k]}</span>
              <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{n.l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface CerebroProps {
  onVerContrato?: (contrato: string) => void;
  onOpenIA?: () => void;
  onInvestigar?: (patente: string) => void;
  onOpenSplash?: () => void;
  onNavigateFlota?: () => void;
}

export default function Cerebro({ onVerContrato, onOpenIA, onInvestigar, onOpenSplash, onNavigateFlota }: CerebroProps) {
  const [showAlertas, setShowAlertas] = useState(false);
  const [contratoDetalle, setContratoDetalle] = useState<{ nombre: string; color: string } | null>(null);
  const [mapaMinimizado, setMapaMinimizado] = useState(true);

  const { data: estado, isLoading } = useQuery<any>({
    queryKey: ["/api/cerebro/estado-general"],
    refetchInterval: 120000,
  });

  const { data: alertas } = useQuery<any[]>({
    queryKey: ["/api/cerebro/camiones-alerta"],
    refetchInterval: 120000,
  });

  const { data: rendContratos } = useQuery<any[]>({
    queryKey: ["/api/geo/rendimiento-contratos"],
    refetchInterval: 300000,
  });

  const { data: sistemaEstado } = useQuery<any>({
    queryKey: ["/api/sistema/estado"],
    refetchInterval: 300000,
  });

  const { data: resumenIA } = useQuery<any>({
    queryKey: ["/api/sistema/resumen-ia"],
    refetchInterval: 1800000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="cerebro-loading">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#3a6080" }} />
      </div>
    );
  }

  const semaforoConfig: Record<string, { color: string; label: string; glow: boolean }> = {
    NORMAL: { color: "#00ff88", label: "OPERACION NORMAL", glow: false },
    ATENCION: { color: "#ffcc00", label: "ATENCION REQUERIDA", glow: true },
    ALERTA: { color: "#ff2244", label: "ALERTA ACTIVA", glow: true },
  };
  const sem = semaforoConfig[estado?.semaforo as string] || semaforoConfig.NORMAL;

  const sysEst = sistemaEstado || resumenIA?.estado;
  const confColor: Record<string, string> = { BAJA: "#3a6080", MEDIA: "#ffcc00", ALTA: "#00d4ff", EXPERTA: "#00ff88" };
  const bColor = confColor[sysEst?.confianza_global] || "#3a6080";

  return (<>
    <div className="space-y-4" data-testid="cerebro-page">
      <div className="flex items-center h-[80px] px-5" data-testid="semaforo-block"
        style={{
          background: `${sem.color}06`,
          border: `1px solid ${sem.color}25`,
        }}>
        <div className="flex items-center gap-4 flex-1">
          <div className="w-5 h-5 rounded-full" style={{
            background: sem.color,
            boxShadow: `0 0 16px ${sem.color}80`,
            animation: sem.glow ? "blinkFast 0.6s infinite" : undefined,
          }} />
          <span className="font-space text-[14px] font-bold tracking-[0.2em]" style={{ color: sem.color }} data-testid="text-semaforo-label">
            {sem.label}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-space text-[11px]" style={{ color: "#c8e8ff" }}>
            {estado?.camiones_activos || 0} activos
          </span>
          <span className="font-space text-[10px]" style={{ color: "#1a3a55" }}>&middot;</span>
          <span className="font-space text-[11px]" style={{ color: "#c8e8ff" }}>
            {estado?.rendimiento_promedio ? `${estado.rendimiento_promedio} km/L` : "--"}
          </span>
          <span className="font-space text-[10px]" style={{ color: "#1a3a55" }}>&middot;</span>
          <span className="font-space text-[11px]" style={{ color: estado?.alertas_criticas > 0 ? "#ff2244" : "#c8e8ff" }}>
            {estado?.alertas_criticas || 0} alertas criticas
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="contratos-grid">
        {(estado?.por_contrato || []).map((c: any) => {
          const cc = CONTRATO_COLORS[c.contrato] || "#c8e8ff";
          const label = CONTRATO_LABELS[c.contrato] || "";
          const meta = 2.85;
          const rend = c.rendimiento || 0;
          const pctMeta = rend > 0 ? Math.min((rend / meta) * 100, 150) : 0;
          const cumpleMeta = rend >= meta;

          return (
            <div key={c.contrato}
              className="p-4 cursor-pointer transition-all group hover:brightness-110"
              onClick={() => setContratoDetalle({ nombre: c.contrato, color: cc })}
              data-testid={`card-contrato-${c.contrato}`}
              style={{
                background: `${cc}05`,
                border: `1px solid ${cc}30`,
              }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: cc }} />
                  <span className="font-space text-[12px] font-bold tracking-wider" style={{ color: cc }}>{c.contrato}</span>
                </div>
                {label && <span className="font-exo text-[9px] tracking-wider" style={{ color: "#4a7090" }}>{label}</span>}
              </div>

              <div className="mb-3">
                <div className="font-space text-[28px] font-bold leading-none" style={{ color: cc }}>
                  {c.activos} <span className="text-[14px] font-normal" style={{ color: "#4a7090" }}>/ {c.total_camiones}</span>
                </div>
                <div className="font-exo text-[10px] tracking-wider mt-0.5" style={{ color: "#4a7090" }}>camiones activos</div>
              </div>

              <div className="space-y-2 mb-3">
                <div className="flex items-center justify-between">
                  <span className="font-space text-[12px] font-bold" style={{ color: rend > 0 ? "#c8e8ff" : "#3a6080" }}>
                    {rend > 0 ? `${rend} km/L` : "--"}
                  </span>
                </div>
                <div className="w-full h-1.5 overflow-hidden" style={{ background: "#0d2035" }}>
                  <div className="h-full transition-all duration-700" style={{
                    width: `${Math.min(pctMeta, 100)}%`,
                    background: cumpleMeta ? '#00ff88' : '#ff2244',
                    opacity: 0.7,
                  }} />
                </div>
                <div className="font-exo text-[9px]" style={{ color: "#4a7090" }}>meta {meta} {cumpleMeta ? "\u2713" : "\u26A0"}</div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="font-exo text-[10px]" style={{ color: "#4a7090" }}>KM hoy</span>
                  <span className="font-space text-[11px]" style={{ color: "#c8e8ff" }}>{(c.km_hoy || 0).toLocaleString()}</span>
                </div>
                {c.alertas > 0 && (
                  <div className="flex justify-between">
                    <span className="font-exo text-[10px]" style={{ color: "#ff2244" }}>Alertas</span>
                    <span className="font-space text-[11px] font-bold" style={{ color: "#ff2244" }}>{c.alertas}</span>
                  </div>
                )}
              </div>

              <div className="mt-3 pt-2 flex items-center justify-center gap-1" style={{ borderTop: `1px solid ${cc}15` }}>
                <span className="font-exo text-[10px] font-bold tracking-[0.15em] transition-all group-hover:tracking-[0.25em]" style={{ color: cc }}>VER DETALLE</span>
                <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-1" style={{ color: cc }} />
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="border"
        style={{ borderColor: '#0d2035', background: '#020508' }}
        data-testid="hoy-mapa-minivivo"
      >
        <div className="flex items-center justify-between px-4 py-2 border-b"
          style={{ borderColor: '#0d2035' }}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full"
              style={{
                background: '#00ff88',
                animation: 'blink 2s infinite',
                boxShadow: '0 0 6px #00ff88'
              }} />
            <span className="font-space text-[11px] font-bold tracking-[0.15em]"
              style={{ color: '#00d4ff' }}>
              FLOTA EN VIVO
            </span>
            <span className="font-exo text-[10px]"
              style={{ color: '#3a6080' }}>
              {estado?.camiones_activos || 0} activos
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMapaMinimizado(!mapaMinimizado)}
              className="flex items-center gap-1 font-exo text-[10px] font-bold px-2 py-1 border cursor-pointer
                         transition-all hover:border-[#ffcc00] hover:text-[#ffcc00]"
              style={{ borderColor: '#0d2035', color: '#3a6080' }}
              data-testid="btn-minimizar-mapa"
            >
              {mapaMinimizado ? <ChevronDown className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
              {mapaMinimizado ? "EXPANDIR" : "MINIMIZAR"}
            </button>
            <button
              onClick={() => onNavigateFlota?.()}
              className="font-exo text-[10px] font-bold px-3 py-1 border cursor-pointer
                         transition-all hover:border-[#00d4ff] hover:text-[#00d4ff]"
              style={{ borderColor: '#0d2035', color: '#3a6080' }}
              data-testid="btn-ver-mapa-completo"
            >
              VER MAPA COMPLETO &rarr;
            </button>
          </div>
        </div>
        {!mapaMinimizado && (
          <div style={{ height: '280px', position: 'relative' }}>
            <MiniMapaVivo />
          </div>
        )}
      </div>

      <WidgetAprendizajeEstaciones />

      {sysEst && (
        <div className="p-4" style={{ background: '#091018', border: `1px solid ${bColor}30` }} data-testid="widget-sistema-adaptativo">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4" style={{ color: bColor }} />
              <span className="font-exo text-[10px] tracking-[0.15em] font-bold" style={{ color: bColor }}>SISTEMA ADAPTATIVO</span>
            </div>
            <button onClick={() => onOpenSplash?.()} className="font-exo text-[9px] tracking-wider cursor-pointer transition-all hover:opacity-70" style={{ color: "#00d4ff" }} data-testid="btn-ver-detalle-sistema">
              VER DETALLE &rarr;
            </button>
          </div>
          <div className="font-rajdhani text-[12px] mb-3" style={{ color: "#c8e8ff" }}>
            {sysEst.dias_aprendiendo} dia{sysEst.dias_aprendiendo !== 1 ? "s" : ""} &middot; {sysEst.total_viajes_procesados} viajes &middot; CONFIANZA {sysEst.confianza_global}
          </div>
          <div className="relative h-1.5 overflow-hidden mb-1" style={{ background: "#0d2035" }}>
            <div className="absolute inset-y-0 left-0 transition-all duration-700" style={{
              width: `${sysEst.madurez_pct || 0}%`,
              background: `linear-gradient(90deg, ${bColor}, ${bColor}cc)`,
            }} />
          </div>
          <div className="font-space text-[10px] mb-2" style={{ color: bColor }}>{sysEst.madurez_pct || 0}% calibrado</div>
          {resumenIA?.resumen ? (
            <div className="font-rajdhani text-[11px] leading-relaxed" style={{ color: "#4a7090" }} data-testid="text-resumen-sistema">
              {resumenIA.resumen}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="h-3" style={{ background: "#0d2035", width: "85%", animation: "pulse 1.5s infinite" }} />
              <div className="h-3" style={{ background: "#0d2035", width: "70%", animation: "pulse 1.5s infinite" }} />
            </div>
          )}
        </div>
      )}

      {rendContratos && rendContratos.length > 0 && (
        <div className="px-0 py-0" style={{ background: '#091018', border: '1px solid #0d2035' }} data-testid="rendimiento-contratos-block">
          <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid #0d2035" }}>
            <TrendingUp className="w-3.5 h-3.5" style={{ color: "#00d4ff" }} />
            <span className="font-exo text-[10px] font-bold tracking-[0.15em]" style={{ color: "#c8e8ff" }}>
              RENDIMIENTO ECU ESTA SEMANA
            </span>
          </div>
          <div className="px-4 py-4 space-y-3">
            {rendContratos.map((c: any) => {
              const color = CONTRATO_COLORS[c.nombre] || c.color || '#00d4ff';
              const rend = c.rendimiento_promedio || 0;
              const meta = c.meta_kmL || 2.85;
              const maxRend = Math.max(...rendContratos.map((r: any) => r.rendimiento_promedio || 0), 5);
              const pct = Math.min((rend / maxRend) * 100, 100);
              const cumpleMeta = rend >= meta;

              return (
                <div key={c.nombre} className="flex items-center gap-3" data-testid={`rend-bar-${c.nombre}`}>
                  <div className="w-[130px] shrink-0">
                    <div className="font-exo text-[11px] font-bold tracking-wider truncate" style={{ color }}>{c.nombre}</div>
                  </div>
                  <div className="flex-1 h-3 overflow-hidden" style={{ background: '#0a1520' }}>
                    <div className="h-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${cumpleMeta ? '#00ff88' : '#ff2244'}33, ${cumpleMeta ? '#00ff88' : '#ff2244'})` }} />
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="font-space text-[13px] font-bold" style={{ color }}>{rend > 0 ? rend.toFixed(1) : '-'} km/L</span>
                    <span className="font-rajdhani text-[10px]" style={{ color: '#4a7090' }}>meta {meta.toFixed(2)}</span>
                    <span className="font-space text-[11px]" style={{ color: cumpleMeta ? '#00ff88' : '#ffcc00' }}>
                      {cumpleMeta ? '\u2713' : '\u26A0'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div data-testid="alertas-block">
        <button
          onClick={() => setShowAlertas(!showAlertas)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 cursor-pointer transition-all hover:opacity-80"
          style={{
            background: (alertas || []).length > 0 ? 'rgba(255,34,68,0.06)' : '#091018',
            border: `1px solid ${(alertas || []).length > 0 ? 'rgba(255,34,68,0.25)' : '#0d2035'}`,
          }}
          data-testid="btn-toggle-alertas"
        >
          <AlertTriangle className="w-3.5 h-3.5" style={{ color: (alertas || []).length > 0 ? "#ff2244" : "#3a6080" }} />
          <span className="font-exo text-[10px] font-bold tracking-[0.15em]" style={{ color: (alertas || []).length > 0 ? "#ff2244" : "#3a6080" }}>
            {(alertas || []).length > 0 ? `${(alertas || []).length} ALERTAS ACTIVAS` : "SIN ALERTAS"}
          </span>
          <ChevronDown className="w-3.5 h-3.5 transition-transform" style={{ color: "#3a6080", transform: showAlertas ? 'rotate(180deg)' : 'none' }} />
        </button>

        {showAlertas && (
          <div style={{ background: '#091018', border: '1px solid #0d2035', borderTop: 'none', animation: 'slideDown 0.15s ease-out' }}>
            <div className="overflow-y-auto" style={{ maxHeight: 400 }}>
              {(!alertas || alertas.length === 0) ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-5 h-5 mx-auto mb-2" style={{ color: "#00ff88" }} />
                  <div className="font-exo text-[11px]" style={{ color: "#3a6080" }}>Operacion normal</div>
                </div>
              ) : (
                (alertas || []).slice(0, 8).map((a: any, i: number) => {
                  const tipoColors: Record<string, string> = {
                    VELOCIDAD: "#ffcc00", SIN_GPS: "#ff2244", RENDIMIENTO: "#ff6b35",
                  };
                  const tc = tipoColors[a.tipo] || "#ff2244";
                  return (
                    <div key={i} className="px-4 py-3 transition-all hover:bg-[#0a1929]" style={{ borderBottom: "1px solid #0d203530" }}
                      data-testid={`alerta-${i}`}>
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-space text-[12px] font-bold" style={{ color: "#c8e8ff" }}>{a.patente}</span>
                          <span className="font-exo text-[10px]" style={{ color: CONTRATO_COLORS[a.contrato] || "#3a6080" }}>{a.contrato}</span>
                        </div>
                        <button onClick={() => onInvestigar?.(a.patente)}
                          data-testid={`btn-investigar-${i}`}
                          className="flex items-center gap-1 px-2 py-0.5 font-exo text-[9px] font-bold cursor-pointer transition-all hover:bg-[rgba(0,212,255,0.15)]"
                          style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.3)", color: "#00d4ff" }}>
                          <Eye className="w-3 h-3" /> INVESTIGAR
                        </button>
                      </div>
                      <div className="font-exo text-[10px]" style={{ color: "#c8e8ff" }}>{a.descripcion}</div>
                      <div className="font-space text-[10px] mt-0.5" style={{ color: tc }}>{a.dato}</div>
                      <BotonesAlerta alerta={a} />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>

    {contratoDetalle && (
      <ContratoPage nombre={contratoDetalle.nombre} color={contratoDetalle.color} onClose={() => setContratoDetalle(null)} />
    )}
  </>);
}

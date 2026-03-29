import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Brain, Loader2, AlertTriangle, Heart, Zap, Send, FileText, Download, ChevronDown, ChevronUp, RefreshCw, TrendingUp, Truck, Fuel, MapPin } from "lucide-react";

function getRendColor(r: number): string {
  if (r >= 2.85) return "#00ff88";
  if (r >= 2.3) return "#ffcc00";
  return "#ff2244";
}

// ═══════════════════════════════════════════════════
// OPERATIVE BRAIN v3 — Reportero + Agentes
// ═══════════════════════════════════════════════════

export default function OperativeBrain() {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="min-h-screen p-4 space-y-4" style={{ background: "#020508" }}>
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5" style={{ color: "#a855f7" }} />
            <span className="font-space text-[16px] font-bold tracking-wider" style={{ color: "#c8e8ff" }}>OPERATIVE BRAIN</span>
            <span className="font-exo text-[9px] px-2 py-0.5 rounded" style={{ color: "#a855f7", border: "1px solid #a855f740" }}>v3</span>
          </div>
          <div className="font-exo text-[10px] mt-1" style={{ color: "#3a6080" }}>
            Centro de Inteligencia · Sotraser · {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>
      </div>

      {/* ═══ REPORTERO — PROTAGONISTA ═══ */}
      <PanelReportero />

      {/* ═══ AGENTES ═══ */}
      <PanelAgentes />

      {/* ═══ GERENTE OPS ═══ */}
      <PanelGerenteOps />

      {/* ═══ ARQUITECTO ═══ */}
      <PanelArquitecto />

      {/* ═══ AVANZADO (Chat IA + KPIs) — Oculto por defecto ═══ */}
      <button onClick={() => setShowAdvanced(!showAdvanced)} className="w-full py-2 flex items-center justify-center gap-2 cursor-pointer rounded-lg"
        style={{ background: "#060d14", border: "1px solid #0d2035" }}>
        <span className="font-exo text-[9px] tracking-wider" style={{ color: "#3a6080" }}>
          {showAdvanced ? "OCULTAR" : "MOSTRAR"} CHAT IA Y KPIs OPERACIONALES
        </span>
        {showAdvanced ? <ChevronUp className="w-3 h-3" style={{ color: "#3a6080" }} /> : <ChevronDown className="w-3 h-3" style={{ color: "#3a6080" }} />}
      </button>
      {showAdvanced && <PanelAvanzado />}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// REPORTERO — Panel principal con PDF
// ═══════════════════════════════════════════════════
function PanelReportero() {
  const [fecha, setFecha] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [generandoPdf, setGenerandoPdf] = useState(false);

  const { data: reporte, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/agentes/reporte", fecha],
    queryFn: () => fetch(`/api/agentes/reporte?fecha=${fecha}`).then(r => r.json()),
    staleTime: 5 * 60000,
  });

  const generarPDF = useCallback(async () => {
    if (!reporte) return;
    setGenerandoPdf(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const w = doc.internal.pageSize.getWidth();

      // Header
      doc.setFillColor(2, 5, 8);
      doc.rect(0, 0, w, 45, "F");
      doc.setFillColor(168, 85, 247);
      doc.rect(0, 44, w, 1.5, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(200, 232, 255);
      doc.text("SOTRASER TOWER", 15, 18);

      doc.setFontSize(11);
      doc.setTextColor(168, 85, 247);
      doc.text("REPORTE OPERACIONAL", 15, 27);

      doc.setFontSize(10);
      doc.setTextColor(58, 96, 128);
      const fechaDisplay = new Date(fecha + "T12:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      doc.text(fechaDisplay.toUpperCase(), 15, 35);

      doc.setFontSize(8);
      doc.text(`Generado: ${new Date().toLocaleString("es-CL")}`, w - 15, 35, { align: "right" });

      let y = 55;

      // KPIs principales
      const f = reporte.flota || {};
      const kpis = [
        { label: "CAMIONES", value: f.camiones || 0, color: [0, 212, 255] },
        { label: "VIAJES", value: f.viajes || 0, color: [168, 85, 247] },
        { label: "KM TOTAL", value: Math.round(f.km_total || 0).toLocaleString(), color: [0, 255, 136] },
        { label: "KM/L PROM", value: f.rend_promedio || "--", color: f.rend_promedio >= 2.85 ? [0, 255, 136] : f.rend_promedio >= 2.3 ? [255, 204, 0] : [255, 34, 68] },
        { label: "LITROS", value: Math.round(f.litros_total || 0).toLocaleString(), color: [249, 115, 22] },
        { label: "CRITICOS", value: f.viajes_criticos || 0, color: [255, 34, 68] },
      ];

      const kpiW = (w - 30) / 6;
      kpis.forEach((k, i) => {
        const x = 15 + i * kpiW;
        doc.setFillColor(6, 13, 20);
        doc.roundedRect(x, y, kpiW - 3, 22, 2, 2, "F");
        doc.setFillColor(k.color[0], k.color[1], k.color[2]);
        doc.rect(x, y, kpiW - 3, 1.5, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(k.color[0], k.color[1], k.color[2]);
        doc.text(String(k.value), x + (kpiW - 3) / 2, y + 12, { align: "center" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        doc.setTextColor(58, 96, 128);
        doc.text(k.label, x + (kpiW - 3) / 2, y + 18, { align: "center" });
      });
      y += 30;

      // Tabla contratos
      if (reporte.contratos?.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(168, 85, 247);
        doc.text("RENDIMIENTO POR CONTRATO", 15, y);
        y += 3;

        autoTable(doc, {
          startY: y,
          head: [["CONTRATO", "CAMIONES", "VIAJES", "KM", "KM/L", "LITROS"]],
          body: reporte.contratos.map((c: any) => [
            c.contrato || "Sin contrato",
            c.camiones,
            c.viajes,
            Math.round(c.km || 0).toLocaleString(),
            c.rend || "--",
            Math.round(c.litros || 0).toLocaleString(),
          ]),
          theme: "plain",
          styles: { fontSize: 8, textColor: [200, 232, 255], cellPadding: 2, fillColor: [6, 13, 20] },
          headStyles: { fillColor: [13, 32, 53], textColor: [168, 85, 247], fontStyle: "bold", fontSize: 7 },
          alternateRowStyles: { fillColor: [10, 21, 32] },
          margin: { left: 15, right: 15 },
        });
        y = (doc as any).lastAutoTable.finalY + 8;
      }

      // Top/Bottom camiones lado a lado
      if (reporte.top_camiones?.length > 0 || reporte.bottom_camiones?.length > 0) {
        if (y > 230) { doc.addPage(); y = 20; }

        const halfW = (w - 35) / 2;

        // Top
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(0, 255, 136);
        doc.text("TOP 10 — MEJOR RENDIMIENTO", 15, y);

        if (reporte.top_camiones?.length > 0) {
          autoTable(doc, {
            startY: y + 2,
            head: [["PATENTE", "CONTRATO", "KM/L", "KM"]],
            body: reporte.top_camiones.map((c: any) => [c.patente, (c.contrato || "").substring(0, 15), c.rend, Math.round(c.km || 0)]),
            theme: "plain",
            styles: { fontSize: 7, textColor: [200, 232, 255], cellPadding: 1.5, fillColor: [6, 13, 20] },
            headStyles: { fillColor: [13, 32, 53], textColor: [0, 255, 136], fontStyle: "bold", fontSize: 6 },
            alternateRowStyles: { fillColor: [10, 21, 32] },
            margin: { left: 15, right: w - 15 - halfW },
            tableWidth: halfW,
          });
        }

        // Bottom
        doc.setTextColor(255, 34, 68);
        doc.text("REQUIEREN ATENCION", 15 + halfW + 5, y);

        if (reporte.bottom_camiones?.length > 0) {
          autoTable(doc, {
            startY: y + 2,
            head: [["PATENTE", "CONTRATO", "KM/L", "KM"]],
            body: reporte.bottom_camiones.map((c: any) => [c.patente, (c.contrato || "").substring(0, 15), c.rend, Math.round(c.km || 0)]),
            theme: "plain",
            styles: { fontSize: 7, textColor: [200, 232, 255], cellPadding: 1.5, fillColor: [6, 13, 20] },
            headStyles: { fillColor: [13, 32, 53], textColor: [255, 34, 68], fontStyle: "bold", fontSize: 6 },
            alternateRowStyles: { fillColor: [10, 21, 32] },
            margin: { left: 15 + halfW + 5, right: 15 },
            tableWidth: halfW,
          });
        }

        const topEnd = reporte.top_camiones?.length > 0 ? (doc as any).lastAutoTable?.finalY || y + 20 : y + 5;
        y = topEnd + 10;
      }

      // Estado del sistema
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(58, 96, 128);
      doc.text("ESTADO DEL SISTEMA", 15, y);
      y += 5;

      const gps = reporte.gps || {};
      const geo = reporte.geocercas || {};
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(200, 232, 255);
      doc.text(`GPS activos: ${gps.gps_activos || 0} de ${gps.gps_total || 0}`, 15, y);
      doc.text(`Geocercas: ${geo.total || 0} (${geo.nivel_alto || 0} nivel alto)`, 15, y + 5);
      y += 12;

      if (reporte.agentes?.length > 0) {
        doc.setFontSize(7);
        doc.setTextColor(58, 96, 128);
        reporte.agentes.forEach((a: any, i: number) => {
          const col = i < 4 ? 0 : 1;
          const row = i % 4;
          doc.text(`${a.nombre}: ${a.estado} · ${a.ciclos_completados} ciclos`, 15 + col * 90, y + row * 4);
        });
      }

      // Footer
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFillColor(13, 32, 53);
        doc.rect(0, doc.internal.pageSize.getHeight() - 10, w, 10, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(58, 96, 128);
        doc.text("SOTRASER TOWER · Reporte generado automáticamente", 15, doc.internal.pageSize.getHeight() - 4);
        doc.text(`Página ${i} de ${pages}`, w - 15, doc.internal.pageSize.getHeight() - 4, { align: "right" });
      }

      doc.save(`sotraser-reporte-${fecha}.pdf`);
    } catch (e: any) {
      console.error("Error generando PDF:", e);
    } finally {
      setGenerandoPdf(false);
    }
  }, [reporte, fecha]);

  const f = reporte?.flota || {};

  return (
    <div style={{ background: "#060d14", border: "1px solid #a855f730", borderTop: "3px solid #a855f7", borderRadius: 8 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #0d2035" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#a855f715", border: "1px solid #a855f730" }}>
            <FileText className="w-5 h-5" style={{ color: "#a855f7" }} />
          </div>
          <div>
            <div className="font-space text-[13px] font-bold tracking-wider" style={{ color: "#a855f7" }}>AGENTE REPORTERO</div>
            <div className="font-exo text-[9px]" style={{ color: "#3a6080" }}>Reporte operacional con datos verificados ECU</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="font-exo text-[10px] px-3 py-1.5 rounded outline-none cursor-pointer"
            style={{ background: "#0a1520", border: "1px solid #0d2035", color: "#c8e8ff" }} />
          <button onClick={() => refetch()} className="p-2 cursor-pointer rounded" style={{ border: "1px solid #0d2035" }}>
            <RefreshCw className="w-3.5 h-3.5" style={{ color: "#3a6080" }} />
          </button>
          <button onClick={generarPDF} disabled={!reporte || generandoPdf}
            className="flex items-center gap-2 px-5 py-2.5 font-space text-[11px] font-bold tracking-wider cursor-pointer rounded-lg hover:opacity-90 disabled:opacity-30 transition-all"
            style={{ background: "linear-gradient(135deg, #a855f7, #7c3aed)", color: "#fff", boxShadow: "0 4px 15px #a855f730" }}>
            {generandoPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            DESCARGAR PDF
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#a855f7" }} />
        </div>
      ) : reporte ? (
        <>
          {/* KPIs grandes */}
          <div className="grid grid-cols-6 gap-3 p-5" style={{ borderBottom: "1px solid #0d2035" }}>
            {[
              { icon: Truck, l: "CAMIONES", v: f.camiones || 0, c: "#00d4ff" },
              { icon: MapPin, l: "VIAJES", v: f.viajes || 0, c: "#a855f7" },
              { icon: TrendingUp, l: "KM TOTAL", v: Math.round(f.km_total || 0).toLocaleString(), c: "#00ff88" },
              { icon: Fuel, l: "KM/L PROMEDIO", v: f.rend_promedio || "--", c: getRendColor(f.rend_promedio || 0) },
              { icon: Fuel, l: "LITROS", v: Math.round(f.litros_total || 0).toLocaleString(), c: "#f97316" },
              { icon: AlertTriangle, l: "CRITICOS", v: f.viajes_criticos || 0, c: f.viajes_criticos > 0 ? "#ff2244" : "#00ff88" },
            ].map(k => (
              <div key={k.l} className="text-center p-3 rounded-lg" style={{ background: "#0a1520", borderTop: `2px solid ${k.c}` }}>
                <k.icon className="w-4 h-4 mx-auto mb-2" style={{ color: k.c, opacity: 0.6 }} />
                <div className="font-space text-[22px] font-bold leading-none" style={{ color: k.c }}>{k.v}</div>
                <div className="font-exo text-[7px] tracking-[0.12em] uppercase mt-1.5" style={{ color: "#3a6080" }}>{k.l}</div>
              </div>
            ))}
          </div>

          {/* Tabla contratos */}
          {reporte.contratos?.length > 0 && (
            <div className="p-5" style={{ borderBottom: "1px solid #0d2035" }}>
              <div className="font-exo text-[8px] tracking-[0.15em] uppercase mb-3" style={{ color: "#a855f7" }}>RENDIMIENTO POR CONTRATO</div>
              <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #0d2035" }}>
                <table className="w-full">
                  <thead>
                    <tr style={{ background: "#0d2035" }}>
                      {["CONTRATO", "CAM", "VIAJES", "KM", "KM/L", "LITROS"].map(h => (
                        <th key={h} className="font-exo text-[7px] tracking-wider font-bold text-left px-3 py-2" style={{ color: "#a855f7" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.contratos.map((c: any, i: number) => (
                      <tr key={c.contrato} style={{ background: i % 2 === 0 ? "#060d14" : "#0a1520" }}>
                        <td className="font-space text-[10px] font-bold px-3 py-2" style={{ color: "#c8e8ff" }}>{c.contrato || "Sin contrato"}</td>
                        <td className="font-space text-[10px] px-3 py-2" style={{ color: "#c8e8ff" }}>{c.camiones}</td>
                        <td className="font-space text-[10px] px-3 py-2" style={{ color: "#c8e8ff" }}>{c.viajes}</td>
                        <td className="font-space text-[10px] px-3 py-2" style={{ color: "#c8e8ff" }}>{Math.round(c.km || 0).toLocaleString()}</td>
                        <td className="font-space text-[10px] font-bold px-3 py-2" style={{ color: getRendColor(c.rend || 0) }}>{c.rend || "--"}</td>
                        <td className="font-space text-[10px] px-3 py-2" style={{ color: "#c8e8ff" }}>{Math.round(c.litros || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top / Bottom camiones */}
          <div className="grid grid-cols-2 gap-4 p-5">
            {/* Top */}
            <div>
              <div className="font-exo text-[8px] tracking-[0.12em] uppercase mb-2 flex items-center gap-1.5" style={{ color: "#00ff88" }}>
                <TrendingUp className="w-3 h-3" /> TOP 10 RENDIMIENTO
              </div>
              <div className="space-y-1">
                {(reporte.top_camiones || []).map((c: any, i: number) => (
                  <div key={c.patente} className="flex items-center justify-between px-3 py-1.5 rounded" style={{ background: "#0a1520" }}>
                    <div className="flex items-center gap-2">
                      <span className="font-space text-[8px] w-4 text-right" style={{ color: "#3a6080" }}>{i + 1}</span>
                      <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</span>
                      <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{(c.contrato || "").substring(0, 12)}</span>
                    </div>
                    <span className="font-space text-[11px] font-bold" style={{ color: "#00ff88" }}>{c.rend} km/L</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Bottom */}
            <div>
              <div className="font-exo text-[8px] tracking-[0.12em] uppercase mb-2 flex items-center gap-1.5" style={{ color: "#ff2244" }}>
                <AlertTriangle className="w-3 h-3" /> REQUIEREN ATENCION
              </div>
              <div className="space-y-1">
                {(reporte.bottom_camiones || []).map((c: any, i: number) => (
                  <div key={c.patente} className="flex items-center justify-between px-3 py-1.5 rounded" style={{ background: "#0a1520", borderLeft: "2px solid #ff2244" }}>
                    <div className="flex items-center gap-2">
                      <span className="font-space text-[10px] font-bold" style={{ color: "#c8e8ff" }}>{c.patente}</span>
                      <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{(c.contrato || "").substring(0, 12)}</span>
                    </div>
                    <span className="font-space text-[11px] font-bold" style={{ color: "#ff2244" }}>{c.rend} km/L</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-8 font-exo text-[10px]" style={{ color: "#3a6080" }}>Sin datos para esta fecha</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// PANEL AGENTES — Centro de comunicaciones
// ═══════════════════════════════════════════════════
function PanelAgentes() {
  const [filtroAgente, setFiltroAgente] = useState<string | null>(null);
  const [filtroPrioridad, setFiltroPrioridad] = useState<string | null>(null);
  const [verConversacion, setVerConversacion] = useState<string | null>(null);
  const [msgExpandido, setMsgExpandido] = useState<number | null>(null);

  const { data } = useQuery<any>({ queryKey: ["/api/agentes/estado"], queryFn: () => fetch("/api/agentes/estado").then(r => r.json()), refetchInterval: 60000 });

  const queryParams = new URLSearchParams({ limite: "30" });
  if (filtroAgente) queryParams.set("de", filtroAgente);
  if (filtroPrioridad) queryParams.set("prioridad", filtroPrioridad);
  if (!filtroAgente) queryParams.set("para", ""); // all messages
  const { data: msgsData, refetch } = useQuery<any>({
    queryKey: ["/api/agentes/mensajes", filtroAgente, filtroPrioridad],
    queryFn: () => fetch(`/api/agentes/mensajes?${queryParams.toString()}`).then(r => r.json()),
    refetchInterval: 30000
  });

  const { data: convData } = useQuery<any>({
    queryKey: ["/api/agentes/conversacion", verConversacion],
    queryFn: () => fetch(`/api/agentes/conversacion/${verConversacion}/agente-ceo`).then(r => r.json()),
    enabled: !!verConversacion, staleTime: 30000
  });

  const msgs = msgsData?.mensajes || [];
  const stats = msgsData?.stats || {};
  const colorTipo = (t: string) => ({ MONITOR: "#00d4ff", ANALISTA: "#a855f7", PREDICTOR: "#ff6b35", REPORTERO: "#00ff88", GESTOR: "#ffcc00", CEO: "#ff2244", ARQUITECTO: "#34d399", CONTRATO: "#fbbf24" }[t] || "#3a6080");
  const colorAgente = (id: string) => {
    if (id?.includes("monitor")) return "#00d4ff";
    if (id?.includes("analista")) return "#a855f7";
    if (id?.includes("predictor")) return "#ff6b35";
    if (id?.includes("gestor")) return "#ffcc00";
    if (id?.includes("ceo")) return "#ff2244";
    if (id?.includes("gerente")) return "#fbbf24";
    if (id?.includes("admin") || id?.includes("cencosud")) return "#00d4ff";
    if (id?.includes("contrato")) return "#fbbf24";
    if (id?.includes("reportero")) return "#00ff88";
    return "#3a6080";
  };

  return (
    <div style={{ background: "#060d14", border: "1px solid #00d4ff30", borderTop: "2px solid #00d4ff", borderRadius: 8 }}>
      {/* Header con stats */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
        <div className="flex items-center gap-2">
          <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#00d4ff" }}>CENTRO DE COMUNICACIONES</span>
          {stats.no_leidos > 0 && <span className="font-space text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#ff224420", color: "#ff2244" }}>{stats.no_leidos}</span>}
          {stats.criticos > 0 && <span className="font-space text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#ff224420", color: "#ff2244" }}>{stats.criticos} CRIT</span>}
          {stats.altos > 0 && <span className="font-space text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#ffcc0020", color: "#ffcc00" }}>{stats.altos} ALTA</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{stats.total_72h || 0} mensajes 72h</span>
          <button onClick={() => { fetch("/api/agentes/mensajes/leer-todos", { method: "POST" }).then(() => refetch()); }} className="font-exo text-[8px] cursor-pointer px-2 py-1 rounded" style={{ color: "#3a6080", border: "1px solid #0d2035" }}>Leer todos</button>
        </div>
      </div>

      {/* Agentes grid — click para filtrar */}
      <div className="grid grid-cols-11 gap-1 p-2" style={{ borderBottom: "1px solid #0d2035" }}>
        <button onClick={() => { setFiltroAgente(null); setVerConversacion(null); }} className="text-center p-1 cursor-pointer rounded" style={{ background: !filtroAgente ? "#00d4ff10" : "#0a1520", border: !filtroAgente ? "1px solid #00d4ff30" : "1px solid transparent" }}>
          <div className="font-exo text-[6px] uppercase font-bold" style={{ color: !filtroAgente ? "#00d4ff" : "#3a6080" }}>TODOS</div>
        </button>
        {(data?.agentes || []).map((a: any) => {
          const min = a.ultimo_ciclo ? Math.round((Date.now() - new Date(a.ultimo_ciclo).getTime()) / 60000) : null;
          const ok = min !== null && min < 60;
          const selected = filtroAgente === a.id;
          return (
            <button key={a.id} onClick={() => { setFiltroAgente(selected ? null : a.id); setVerConversacion(selected ? null : a.id); }}
              className="text-center p-1 cursor-pointer rounded transition-all" style={{ background: selected ? `${colorTipo(a.tipo)}10` : "#0a1520", borderTop: `2px solid ${ok ? colorTipo(a.tipo) : "#3a6080"}`, border: selected ? `1px solid ${colorTipo(a.tipo)}40` : "1px solid transparent" }}>
              <div className="font-exo text-[6px] uppercase font-bold truncate" style={{ color: ok ? colorTipo(a.tipo) : "#3a6080" }}>{a.nombre?.split(" ").slice(-1)[0]?.substring(0, 8)}</div>
              <div className="font-exo text-[6px]" style={{ color: "#3a6080" }}>{min !== null ? `${min}m` : "-"} · {a.ciclos_completados}</div>
            </button>
          );
        })}
      </div>

      {/* Filtros de prioridad */}
      <div className="flex items-center gap-1 px-3 py-1.5" style={{ borderBottom: "1px solid #0d2035" }}>
        <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>Filtrar:</span>
        {[null, "CRITICA", "ALTA", "NORMAL"].map(p => (
          <button key={p || "ALL"} onClick={() => setFiltroPrioridad(p)} className="font-exo text-[7px] px-2 py-0.5 cursor-pointer rounded"
            style={{ color: filtroPrioridad === p ? (p === "CRITICA" ? "#ff2244" : p === "ALTA" ? "#ffcc00" : "#00d4ff") : "#3a6080",
              background: filtroPrioridad === p ? (p === "CRITICA" ? "#ff224410" : p === "ALTA" ? "#ffcc0010" : "#00d4ff10") : "transparent",
              border: `1px solid ${filtroPrioridad === p ? "#0d2035" : "transparent"}` }}>
            {p || "TODOS"}
          </button>
        ))}
        {filtroAgente && (
          <span className="font-exo text-[7px] ml-2" style={{ color: colorAgente(filtroAgente) }}>
            De: {(data?.agentes || []).find((a: any) => a.id === filtroAgente)?.nombre || filtroAgente}
          </span>
        )}
      </div>

      {/* Conversación si está seleccionado un agente */}
      {verConversacion && convData?.mensajes?.length > 0 && (
        <div className="px-3 py-2" style={{ borderBottom: "1px solid #0d2035", background: "#0a151830" }}>
          <div className="flex items-center justify-between mb-1">
            <span className="font-exo text-[7px] uppercase tracking-wider" style={{ color: colorAgente(verConversacion) }}>
              Conversacion con {(data?.agentes || []).find((a: any) => a.id === verConversacion)?.nombre}
            </span>
            <button onClick={() => setVerConversacion(null)} className="font-exo text-[7px] cursor-pointer" style={{ color: "#3a6080" }}>cerrar</button>
          </div>
          <div className="space-y-1 max-h-[120px] overflow-y-auto">
            {convData.mensajes.slice(0, 8).reverse().map((m: any) => (
              <div key={m.id} className={`flex ${m.de_agente === verConversacion ? "justify-start" : "justify-end"}`}>
                <div className="max-w-[85%] px-2 py-1 rounded" style={{ background: m.de_agente === verConversacion ? "#0a1520" : `${colorAgente(verConversacion)}10`, border: `1px solid ${m.de_agente === verConversacion ? "#0d2035" : colorAgente(verConversacion) + "30"}` }}>
                  <div className="font-exo text-[7px]" style={{ color: m.de_agente === verConversacion ? colorAgente(verConversacion) : "#3a6080" }}>
                    {m.nombre_agente || m.de_agente} · {new Date(m.created_at).toLocaleString("es-CL", { hour: "2-digit", minute: "2-digit", day: "2-digit" })}
                  </div>
                  <div className="font-exo text-[8px] font-bold" style={{ color: "#c8e8ff" }}>{m.titulo}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de mensajes */}
      <div className="overflow-auto" style={{ maxHeight: verConversacion ? 200 : 280 }}>
        {msgs.map((m: any) => (
          <div key={m.id} onClick={() => { fetch(`/api/agentes/mensajes/${m.id}/leer`, { method: "POST" }).then(() => refetch()); setMsgExpandido(msgExpandido === m.id ? null : m.id); }}
            className="px-4 py-2 border-b cursor-pointer transition-all hover:bg-[rgba(255,255,255,0.02)]"
            style={{ borderColor: "#0a1520", borderLeft: `3px solid ${!m.leido ? (m.prioridad === "CRITICA" ? "#ff2244" : m.prioridad === "ALTA" ? "#ffcc00" : "#00d4ff") : "transparent"}` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-exo text-[7px] font-bold px-1.5 py-0.5 rounded" style={{ color: colorAgente(m.de_agente), border: `1px solid ${colorAgente(m.de_agente)}30` }}>{m.nombre_agente || m.de_agente}</span>
                <span className="font-exo text-[6px]" style={{ color: "#3a6080" }}>→ {m.nombre_destino || m.para_agente}</span>
                {m.prioridad === "CRITICA" && <span className="font-exo text-[6px] font-bold px-1 rounded" style={{ color: "#ff2244", background: "#ff224415" }}>CRITICO</span>}
                {m.prioridad === "ALTA" && <span className="font-exo text-[6px] font-bold px-1 rounded" style={{ color: "#ffcc00", background: "#ffcc0015" }}>ALTA</span>}
              </div>
              <span className="font-exo text-[6px]" style={{ color: "#3a6080" }}>{new Date(m.created_at).toLocaleString("es-CL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</span>
            </div>
            <div className="font-exo text-[9px] font-bold mt-1 truncate" style={{ color: "#c8e8ff" }}>{m.titulo}</div>
            {msgExpandido === m.id ? (
              <div className="font-exo text-[8px] mt-1 whitespace-pre-wrap" style={{ color: "#c8e8ff", opacity: 0.8 }}>{m.contenido}</div>
            ) : (
              <div className="font-exo text-[8px] mt-0.5 line-clamp-1" style={{ color: "#3a6080" }}>{m.contenido?.substring(0, 120)}</div>
            )}
          </div>
        ))}
        {msgs.length === 0 && <div className="text-center py-4 font-exo text-[9px]" style={{ color: "#3a6080" }}>Sin mensajes</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// GERENTE OPS v2
// ═══════════════════════════════════════════════════
function PanelGerenteOps() {
  const [vista, setVista] = useState<"kpis" | "memoria" | "decisiones">("kpis");
  const { data: estado } = useQuery<any>({ queryKey: ["/api/gerente/estado"], queryFn: () => fetch("/api/gerente/estado").then(r => r.json()), staleTime: 5 * 60000 });
  const { data: puntos } = useQuery<any>({ queryKey: ["/api/gerente/puntos-resueltos"], queryFn: () => fetch("/api/gerente/puntos-resueltos").then(r => r.json()), staleTime: 10 * 60000 });
  const { data: salud } = useQuery<any>({ queryKey: ["/api/gerente/salud"], queryFn: () => fetch("/api/gerente/salud").then(r => r.json()), refetchInterval: 120000 });
  const { data: memoriaData } = useQuery<any>({ queryKey: ["/api/gerente/memoria"], queryFn: () => fetch("/api/gerente/memoria").then(r => r.json()), staleTime: 5 * 60000, enabled: vista === "memoria" });
  const { data: decisionesData } = useQuery<any>({ queryKey: ["/api/gerente/decisiones"], queryFn: () => fetch("/api/gerente/decisiones").then(r => r.json()), staleTime: 2 * 60000, enabled: vista === "decisiones" });

  const aprendizaje = estado?.aprendizaje || [];
  const parametros = estado?.parametros || [];
  const totalMejorado = aprendizaje.reduce((s: number, a: any) => s + parseInt(a.viajes_mejorados || 0), 0);
  const saludColor = (salud?.salud || 0) >= 80 ? "#00ff88" : (salud?.salud || 0) >= 50 ? "#ffcc00" : "#ff2244";

  return (
    <div style={{ background: "#060d14", border: "1px solid #fbbf2430", borderTop: "2px solid #fbbf24", borderRadius: 8 }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
        <div className="flex items-center gap-2">
          <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#fbbf24" }}>GERENTE DE OPERACIONES v2</span>
          {salud && (
            <span className="font-space text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: `${saludColor}15`, color: saludColor, border: `1px solid ${saludColor}30` }}>
              <Heart className="w-2.5 h-2.5" /> {salud.salud}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {(["kpis", "memoria", "decisiones"] as const).map(v => (
              <button key={v} onClick={() => setVista(v)} className="font-exo text-[7px] uppercase px-2 py-1 cursor-pointer"
                style={{ color: vista === v ? "#fbbf24" : "#3a6080", background: vista === v ? "#fbbf2410" : "transparent", border: `1px solid ${vista === v ? "#fbbf2430" : "#0d2035"}`, borderRadius: 3 }}>
                {v === "kpis" ? "KPIs" : v === "memoria" ? "Memoria" : "Decisiones"}
              </button>
            ))}
          </div>
          <button onClick={() => fetch("/api/gerente/ejecutar", { method: "POST" })} className="font-exo text-[8px] px-3 py-1 cursor-pointer" style={{ color: "#fbbf24", border: "1px solid #fbbf2430", borderRadius: 4 }}>Ejecutar</button>
        </div>
      </div>

      {salud && salud.problemas?.length > 0 && (
        <div className="px-4 py-2" style={{ borderBottom: "1px solid #0d2035", background: `${saludColor}05` }}>
          {salud.problemas.slice(0, 3).map((p: string, i: number) => (
            <div key={i} className="font-exo text-[8px]" style={{ color: "#c8e8ff" }}>• {p}</div>
          ))}
        </div>
      )}

      {vista === "kpis" && (
        <>
          <div className="grid grid-cols-6 gap-2 p-3" style={{ borderBottom: "1px solid #0d2035" }}>
            {[
              { l: "VIAJES MEJORADOS", v: totalMejorado, c: "#00ff88" },
              { l: "RUTAS RESUELTAS", v: puntos?.pct_completamente_resuelto ? `${puntos.pct_completamente_resuelto}%` : "--", c: "#00d4ff" },
              { l: "LUGARES", v: estado?.lugares?.reduce((s: number, l: any) => s + parseInt(l.total), 0) || 0, c: "#fbbf24" },
              { l: "PARAMETROS", v: parametros.length, c: "#a78bfa" },
              { l: "MEMORIA", v: salud?.memoria_total || 0, c: "#34d399" },
              { l: "DECISIONES 24H", v: salud?.decisiones_24h || 0, c: "#f97316" },
            ].map(k => (
              <div key={k.l} className="text-center p-2" style={{ background: "#0a1520", borderRadius: 6 }}>
                <div className="font-space text-[14px] font-bold" style={{ color: k.c }}>{k.v}</div>
                <div className="font-exo text-[6px] uppercase" style={{ color: "#3a6080" }}>{k.l}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 p-3">
            {parametros.slice(0, 6).map((p: any) => (
              <div key={p.clave} className="flex items-center justify-between px-3 py-1.5" style={{ background: "#0a1520", borderRadius: 4, border: p.modificado_por === "GERENTE_BOT" ? "1px solid #fbbf2430" : "1px solid #0d2035" }}>
                <span className="font-exo text-[8px]" style={{ color: "#c8e8ff" }}>{p.descripcion?.substring(0, 28) || p.clave}</span>
                <div className="flex items-center gap-1">
                  <span className="font-space text-[11px] font-bold" style={{ color: "#fbbf24" }}>{p.valor}</span>
                  {p.modificado_por === "GERENTE_BOT" && <span className="font-exo text-[6px]" style={{ color: "#fbbf24" }}>BOT</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {vista === "memoria" && (
        <div className="p-3 space-y-2 max-h-[250px] overflow-y-auto">
          {(memoriaData?.memoria || []).map((m: any) => (
            <div key={m.id} className="px-3 py-2 rounded" style={{ background: "#0a1520", borderLeft: `3px solid ${m.categoria === "CONTEXTO" ? "#00d4ff" : m.categoria === "REGLA" ? "#fbbf24" : m.categoria === "ERROR" ? "#ff2244" : "#00ff88"}` }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-exo text-[7px] px-1.5 py-0.5 rounded" style={{ color: "#fbbf24", border: "1px solid #fbbf2430" }}>{m.categoria}</span>
                  <span className="font-space text-[9px] font-bold" style={{ color: "#c8e8ff" }}>{m.clave}</span>
                </div>
                <span className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{(m.confianza * 100).toFixed(0)}%</span>
              </div>
              <div className="font-exo text-[8px] mt-1" style={{ color: "#3a6080" }}>
                {typeof m.valor === "object" ? (m.valor.desc || JSON.stringify(m.valor).substring(0, 80)) : String(m.valor).substring(0, 80)}
              </div>
            </div>
          ))}
        </div>
      )}

      {vista === "decisiones" && (
        <div className="p-3 space-y-1.5 max-h-[250px] overflow-y-auto">
          {(decisionesData?.decisiones || []).map((d: any) => (
            <div key={d.id} className="flex items-center gap-3 px-3 py-2 rounded" style={{ background: "#0a1520", borderLeft: `3px solid ${d.exito ? "#00ff88" : "#ff2244"}` }}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Zap className="w-3 h-3" style={{ color: "#fbbf24" }} />
                  <span className="font-space text-[9px] font-bold" style={{ color: "#c8e8ff" }}>{d.tipo}</span>
                </div>
                <div className="font-exo text-[8px] mt-0.5" style={{ color: "#3a6080" }}>{d.descripcion}</div>
              </div>
              <div className="font-exo text-[7px]" style={{ color: "#3a6080" }}>{new Date(d.created_at).toLocaleString("es-CL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// ARQUITECTO — Chat
// ═══════════════════════════════════════════════════
function PanelArquitecto() {
  const [msg, setMsg] = useState("");
  const [hist, setHist] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/agentes/arquitecto/historial").then(r => r.json()).then(d => {
      setHist((d.historial || []).map((h: any) => ({ rol: h.rol, texto: h.mensaje })));
    }).catch(() => {});
  }, []);

  const enviar = async () => {
    if (!msg.trim()) return;
    const texto = msg; setMsg(""); setLoading(true);
    setHist(h => [...h, { rol: "CEO", texto }]);
    try {
      const r = await fetch("/api/agentes/arquitecto/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mensaje: texto }) });
      const d = await r.json();
      setHist(h => [...h, { rol: "ARQUITECTO", texto: d.respuesta }]);
    } catch { setHist(h => [...h, { rol: "ARQUITECTO", texto: "Error de conexion" }]); }
    setLoading(false);
  };

  return (
    <div style={{ background: "#060d14", border: "1px solid #34d39930", borderTop: "2px solid #34d399", borderRadius: 8 }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid #0d2035" }}>
        <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#34d399" }}>AGENTE ARQUITECTO</span>
        <span className="font-exo text-[8px]" style={{ color: "#3a6080" }}>· Jefe tecnico · Conoce todo el sistema</span>
      </div>
      <div className="overflow-auto px-4 py-3 space-y-2" style={{ maxHeight: 220 }}>
        {hist.length === 0 && (
          <div className="text-center py-3">
            <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Preguntale sobre el sistema</div>
            <div className="flex gap-2 justify-center mt-2 flex-wrap">
              {["Como esta el sistema?", "Que detectaron los agentes?", "Que mejoras propones?"].map(s => (
                <button key={s} onClick={() => setMsg(s)} className="font-exo text-[8px] px-2 py-1 cursor-pointer" style={{ color: "#3a6080", border: "1px solid #0d2035", borderRadius: 4 }}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {hist.map((h, i) => (
          <div key={i} className={`flex ${h.rol === "CEO" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[80%] px-3 py-2" style={{ background: h.rol === "CEO" ? "rgba(52,211,153,0.1)" : "#0a1520", border: `1px solid ${h.rol === "CEO" ? "#34d39930" : "#0d2035"}`, borderRadius: 8 }}>
              <div className="font-exo text-[7px] uppercase mb-1" style={{ color: h.rol === "CEO" ? "#34d399" : "#3a6080" }}>{h.rol === "CEO" ? "TU" : "ARQUITECTO"}</div>
              <div className="font-exo text-[10px] leading-relaxed whitespace-pre-wrap" style={{ color: "#c8e8ff" }}>{h.texto}</div>
            </div>
          </div>
        ))}
        {loading && <div className="flex justify-start"><div className="px-3 py-2" style={{ background: "#0a1520", borderRadius: 8 }}><Loader2 className="w-4 h-4 animate-spin" style={{ color: "#34d399" }} /></div></div>}
      </div>
      <div className="px-4 pb-3 flex gap-2" style={{ borderTop: "1px solid #0d2035", paddingTop: 12 }}>
        <input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && enviar()} placeholder="Habla con el Arquitecto..."
          className="flex-1 px-3 py-2 font-exo text-[10px] outline-none" style={{ background: "#0a1520", border: "1px solid #34d39930", borderRadius: 6, color: "#c8e8ff" }} />
        <button onClick={enviar} disabled={loading || !msg.trim()} className="px-4 py-2 font-space text-[9px] font-bold cursor-pointer disabled:opacity-30"
          style={{ background: "rgba(52,211,153,0.1)", border: "1px solid #34d39930", color: "#34d399", borderRadius: 6 }}>ENVIAR</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// AVANZADO — Chat IA + KPIs (oculto por defecto)
// ═══════════════════════════════════════════════════
function PanelAvanzado() {
  const [contrato, setContrato] = useState("TODOS");
  const [mensajeChat, setMensajeChat] = useState("");
  const [historialChat, setHistorialChat] = useState<any[]>([]);
  const [cargandoChat, setCargandoChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: contratosData } = useQuery<any>({ queryKey: ["/api/rutas/contratos-disponibles"], queryFn: () => fetch("/api/rutas/contratos-disponibles").then(r => r.json()), staleTime: 600000 });
  const getContColor = (c: string): string => {
    const hash = c?.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) || 0;
    return ["#a855f7", "#06b6d4", "#f97316", "#84cc16", "#ec4899"][hash % 5];
  };
  const color = getContColor(contrato);

  const { data: kpis } = useQuery<any>({ queryKey: ["/api/brain/kpis-administrador", contrato], queryFn: () => fetch(`/api/brain/kpis-administrador/${contrato}`).then(r => r.json()), refetchInterval: 300000 });

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [historialChat]);

  const enviarMensaje = async (texto?: string) => {
    const msg = texto || mensajeChat.trim();
    if (!msg) return;
    const nuevo = [...historialChat, { role: "user", content: msg }];
    setHistorialChat(nuevo);
    setMensajeChat("");
    setCargandoChat(true);
    try {
      const r = await fetch("/api/brain/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mensaje: msg, contrato, historial: historialChat }) });
      const data = await r.json();
      setHistorialChat([...nuevo, { role: "assistant", content: data.respuesta }]);
    } catch { setHistorialChat([...nuevo, { role: "assistant", content: "Error al conectar con la IA." }]); }
    finally { setCargandoChat(false); }
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      {kpis && (
        <div className="rounded-lg p-4" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
          <div className="font-exo text-[8px] tracking-[0.15em] uppercase mb-3" style={{ color: "#3a6080" }}>KPIs OPERACIONALES</div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "VIAJES", value: kpis.viajes, color: "#00d4ff" },
              { label: "KM/L REAL", value: kpis.rend_prom?.toFixed(2) || "--", color: getRendColor(kpis.rend_prom || 0) },
              { label: "CAMIONES", value: kpis.camiones, color: "#c8e8ff" },
              { label: "KM TOTAL", value: (kpis.km_total || 0).toLocaleString(), color: "#c8e8ff" },
            ].map(k => (
              <div key={k.label} className="text-center px-3 py-2 rounded" style={{ background: "#0a1520", borderTop: `2px solid ${k.color}` }}>
                <div className="font-space text-[16px] font-bold" style={{ color: k.color }}>{k.value}</div>
                <div className="font-exo text-[7px] uppercase" style={{ color: "#3a6080" }}>{k.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat */}
      <div className="rounded-lg" style={{ background: "#060d14", border: "1px solid #0d2035" }}>
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid #0d2035" }}>
          <Brain className="w-4 h-4" style={{ color: "#a855f7" }} />
          <span className="font-space text-[11px] font-bold tracking-wider" style={{ color: "#a855f7" }}>CHAT IA</span>
        </div>
        <div className="px-4 py-3 space-y-3 max-h-[250px] overflow-y-auto">
          {historialChat.length === 0 && (
            <div className="text-center py-3">
              <div className="font-exo text-[10px]" style={{ color: "#3a6080" }}>Pregunta sobre la operacion</div>
              <div className="flex gap-2 justify-center mt-2 flex-wrap">
                {["Resumen del dia", "Proyeccion fin de mes", "Hay algo inusual?"].map(s => (
                  <button key={s} onClick={() => enviarMensaje(s)} className="font-exo text-[8px] px-2 py-1 cursor-pointer" style={{ color: "#3a6080", border: "1px solid #0d2035", borderRadius: 4 }}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {historialChat.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[80%] px-3 py-2 rounded-lg" style={{ background: msg.role === "user" ? "#a855f715" : "#0a1520", border: `1px solid ${msg.role === "user" ? "#a855f730" : "#0d2035"}` }}>
                <div className="font-exo text-[10px] leading-relaxed whitespace-pre-wrap" style={{ color: "#c8e8ff" }}>{msg.content}</div>
              </div>
            </div>
          ))}
          {cargandoChat && <div className="flex justify-start"><div className="px-3 py-2 rounded-lg" style={{ background: "#0a1520" }}><Loader2 className="w-4 h-4 animate-spin" style={{ color: "#a855f7" }} /></div></div>}
          <div ref={chatEndRef} />
        </div>
        <div className="px-4 pb-3 flex gap-2">
          <input value={mensajeChat} onChange={e => setMensajeChat(e.target.value)} onKeyDown={e => e.key === "Enter" && enviarMensaje()}
            placeholder="Pregunta sobre la operacion..." className="flex-1 px-3 py-2 font-exo text-[10px] outline-none rounded-md"
            style={{ background: "#0a1520", border: "1px solid #0d2035", color: "#c8e8ff" }} />
          <button onClick={() => enviarMensaje()} disabled={cargandoChat || !mensajeChat.trim()}
            className="px-4 py-2 font-space text-[9px] font-bold cursor-pointer rounded-md disabled:opacity-30"
            style={{ background: "#a855f720", border: "1px solid #a855f740", color: "#a855f7" }}>
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

const DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0a1520" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0a1520" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#3a6080" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#0d2035" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1a3050" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#0d2035" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#1a3a55" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#060d14" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

export function createDarkMap(container: HTMLElement, options?: Partial<google.maps.MapOptions>): google.maps.Map {
  return new google.maps.Map(container, {
    center: { lat: -33.45, lng: -70.65 },
    zoom: 6,
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    styles: DARK_MAP_STYLE,
    backgroundColor: "#0a1520",
    ...options,
  });
}

export function createHtmlMarker(
  map: google.maps.Map,
  position: { lat: number; lng: number },
  html: string,
  size: [number, number] = [28, 28],
): google.maps.marker.AdvancedMarkerElement | google.maps.Marker {
  if (google.maps.marker?.AdvancedMarkerElement) {
    const el = document.createElement("div");
    el.innerHTML = html;
    el.style.width = `${size[0]}px`;
    el.style.height = `${size[1]}px`;
    return new google.maps.marker.AdvancedMarkerElement({ map, position, content: el });
  }
  return new google.maps.Marker({ map, position });
}

export function createDivMarker(
  map: google.maps.Map,
  position: { lat: number; lng: number },
  html: string,
): google.maps.marker.AdvancedMarkerElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  if (google.maps.marker?.AdvancedMarkerElement) {
    return new google.maps.marker.AdvancedMarkerElement({ map, position, content: el });
  }
  const overlay = new google.maps.Marker({ map, position }) as any;
  return overlay;
}

export function addInfoWindow(
  map: google.maps.Map,
  marker: google.maps.Marker | google.maps.marker.AdvancedMarkerElement,
  content: string,
  autoOpen = false,
): google.maps.InfoWindow {
  const infoWindow = new google.maps.InfoWindow({ content });
  const eventTarget = marker instanceof google.maps.Marker ? marker : marker;
  if (marker instanceof google.maps.Marker) {
    marker.addListener("click", () => infoWindow.open({ anchor: marker, map }));
  } else {
    marker.addListener("click", () => infoWindow.open({ anchor: marker, map }));
  }
  if (autoOpen) infoWindow.open({ anchor: marker, map });
  return infoWindow;
}

export function fitBoundsToPoints(
  map: google.maps.Map,
  points: { lat: number; lng: number }[],
  padding = 40,
  maxZoom?: number,
): void {
  if (points.length === 0) return;
  if (points.length === 1) {
    map.setCenter(points[0]);
    map.setZoom(maxZoom || 12);
    return;
  }
  const bounds = new google.maps.LatLngBounds();
  points.forEach(p => bounds.extend(p));
  map.fitBounds(bounds, padding);
  if (maxZoom) {
    const listener = google.maps.event.addListenerOnce(map, "idle", () => {
      const z = map.getZoom();
      if (z && z > maxZoom) map.setZoom(maxZoom);
    });
  }
}

export function clearMarkers(markers: (google.maps.Marker | google.maps.marker.AdvancedMarkerElement | google.maps.Circle | google.maps.Polyline | google.maps.Polygon)[]): void {
  markers.forEach(m => {
    if ("setMap" in m && typeof m.setMap === "function") {
      m.setMap(null);
    } else if ("map" in m) {
      (m as any).map = null;
    }
  });
  markers.length = 0;
}

export function isGoogleMapsReady(): boolean {
  return typeof google !== "undefined" && !!google.maps;
}

export function waitForGoogleMaps(): Promise<void> {
  return new Promise((resolve) => {
    if (isGoogleMapsReady()) { resolve(); return; }
    const check = setInterval(() => {
      if (isGoogleMapsReady()) { clearInterval(check); resolve(); }
    }, 100);
  });
}

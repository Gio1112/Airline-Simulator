"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aircraftTypeById, airportByIata, airports } from "@/game/data";
import { distanceKm, estimateDailyDemand } from "@/game/simulation";
import type { Airline, Route, RouteResult } from "@/game/types";

type LeafletModule = typeof import("leaflet");
type LeafletMap = import("leaflet").Map;
type LeafletLayerGroup = import("leaflet").LayerGroup;
type LeafletMarker = import("leaflet").Marker;

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const pct = (value: number) => `${Math.round(value * 100)}%`;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function unwrapLongitudes(points: [number, number][]) {
  if (points.length < 2) return points;
  const unwrapped: [number, number][] = [points[0]];

  for (let index = 1; index < points.length; index += 1) {
    let [lon, lat] = points[index];
    const previousLon = unwrapped[index - 1][0];
    while (lon - previousLon > 180) lon -= 360;
    while (lon - previousLon < -180) lon += 360;
    unwrapped.push([lon, lat]);
  }

  return unwrapped;
}

function greatCircle(origin: [number, number], destination: [number, number], steps = 64) {
  const [lon1, lat1] = origin.map(toRadians);
  const [lon2, lat2] = destination.map(toRadians);
  const dot = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
  if (angle < 0.000001) return [origin, destination];

  const sinAngle = Math.sin(angle);
  const points: [number, number][] = [];

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const a = Math.sin((1 - t) * angle) / sinAngle;
    const b = Math.sin(t * angle) / sinAngle;
    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    points.push([toDegrees(Math.atan2(y, x)), toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }

  return unwrapLongitudes(points);
}

function pointOnPath(path: [number, number][], progress: number) {
  const clamped = Math.max(0, Math.min(1, progress));
  const position = clamped * (path.length - 1);
  const left = Math.floor(position);
  const right = Math.min(path.length - 1, left + 1);
  const mix = position - left;
  return [
    path[left][0] + (path[right][0] - path[left][0]) * mix,
    path[left][1] + (path[right][1] - path[left][1]) * mix,
  ] as [number, number];
}

function bearingBetween(a: [number, number], b: [number, number]) {
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);
  const dLon = toRadians(b[0] - a[0]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function routePath(route: Route) {
  const origin = airportByIata(route.origin);
  const destination = airportByIata(route.destination);
  if (!origin || !destination) return [];
  return greatCircle([origin.lon, origin.lat], [destination.lon, destination.lat]);
}

function pathToLeaflet(path: [number, number][]) {
  return path.map(([lon, lat]) => [lat, lon] as [number, number]);
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return Math.abs(hash);
}

type FlightMarker = {
  marker: LeafletMarker;
  routeId: string;
  markerIndex: number;
  markerCount: number;
};

type Props = {
  airline: Airline;
  results: RouteResult[];
  onPlanRoute: (iata: string) => void;
};

export function NetworkMap({ airline, results, onPlanRoute }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const worldAirportsLayerRef = useRef<LeafletLayerGroup | null>(null);
  const networkLayerRef = useRef<LeafletLayerGroup | null>(null);
  const routeLayerRef = useRef<LeafletLayerGroup | null>(null);
  const selectedLayerRef = useRef<LeafletLayerGroup | null>(null);
  const planeLayerRef = useRef<LeafletLayerGroup | null>(null);
  const flightMarkersRef = useRef<Map<string, FlightMarker>>(new Map());

  const [mapReady, setMapReady] = useState(false);
  const [showAirports, setShowAirports] = useState(true);
  const [selectedAirportCode, setSelectedAirportCode] = useState<string | null>(airline.hub);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const resultMap = useMemo(() => new Map(results.map((result) => [result.routeId, result])), [results]);
  const paths = useMemo(() => new Map(airline.routes.map((route) => [route.id, routePath(route)])), [airline.routes]);

  const networkCodes = useMemo(() => {
    const codes = new Set<string>([airline.hub]);
    airline.routes.forEach((route) => {
      codes.add(route.origin);
      codes.add(route.destination);
    });
    return codes;
  }, [airline.hub, airline.routes]);

  const fitNetwork = useCallback(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    const points = [...networkCodes].map((code) => airportByIata(code)).filter(Boolean);
    if (points.length <= 1) {
      const hub = airportByIata(airline.hub);
      if (hub) map.flyTo([hub.lat, hub.lon], 4.5, { duration: 0.7 });
      return;
    }

    const bounds = L.latLngBounds(points.map((airport) => [airport!.lat, airport!.lon] as [number, number]));
    map.flyToBounds(bounds, { padding: [70, 70], maxZoom: 6, duration: 0.7 });
  }, [airline.hub, networkCodes]);

  useEffect(() => {
    let disposed = false;
    let createdMap: LeafletMap | null = null;

    void (async () => {
      const imported = await import("leaflet");
      const L = (((imported as unknown as { default?: LeafletModule }).default ?? imported) as LeafletModule);
      if (disposed || !containerRef.current) return;

      leafletRef.current = L;
      const hub = airportByIata(airline.hub);
      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
        preferCanvas: true,
        minZoom: 2,
        maxZoom: 12,
        worldCopyJump: true,
        zoomSnap: 0.25,
      });

      createdMap = map;
      mapRef.current = map;
      map.setView(hub ? [hub.lat, hub.lon] : [39.5, -98.5], hub ? 4.2 : 2.25);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 20,
        detectRetina: true,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }).addTo(map);

      map.whenReady(() => {
        if (disposed) return;
        setMapReady(true);
        requestAnimationFrame(() => map.invalidateSize());
      });
    })();

    return () => {
      disposed = true;
      setMapReady(false);
      flightMarkersRef.current.clear();
      worldAirportsLayerRef.current = null;
      networkLayerRef.current = null;
      routeLayerRef.current = null;
      selectedLayerRef.current = null;
      planeLayerRef.current = null;
      createdMap?.remove();
      if (mapRef.current === createdMap) mapRef.current = null;
      leafletRef.current = null;
    };
  }, [airline.hub]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!mapReady || !map || !L) return;

    worldAirportsLayerRef.current?.remove();
    const group = L.layerGroup();
    const renderer = L.canvas({ padding: 0.5 });

    airports.forEach((airport) => {
      const large = airport.type === "large_airport";
      const marker = L.circleMarker([airport.lat, airport.lon], {
        renderer,
        radius: large ? 3.3 : 2.4,
        weight: large ? 0.9 : 0.6,
        color: "#0b1220",
        fillColor: large ? "#e2e8f0" : "#94a3b8",
        fillOpacity: large ? 0.86 : 0.62,
      });

      marker.bindTooltip(airport.iata, {
        sticky: true,
        direction: "top",
        opacity: 0.96,
        className: "airport-hover-tooltip",
      });

      marker.on("click", () => {
        setSelectedAirportCode(airport.iata);
        setSelectedRouteId(null);
      });

      marker.addTo(group);
    });

    worldAirportsLayerRef.current = group;
    if (showAirports) group.addTo(map);

    return () => {
      group.remove();
      if (worldAirportsLayerRef.current === group) worldAirportsLayerRef.current = null;
    };
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = worldAirportsLayerRef.current;
    if (!mapReady || !map || !layer) return;

    if (showAirports) {
      if (!map.hasLayer(layer)) layer.addTo(map);
    } else if (map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  }, [mapReady, showAirports]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!mapReady || !map || !L) return;

    networkLayerRef.current?.remove();
    const group = L.layerGroup().addTo(map);

    [...networkCodes].forEach((code) => {
      const airport = airportByIata(code);
      if (!airport) return;
      const isHub = code === airline.hub;

      const marker = L.circleMarker([airport.lat, airport.lon], {
        radius: isHub ? 8 : 6,
        weight: 2,
        color: "#ffffff",
        fillColor: isHub ? "#fbbf24" : "#38bdf8",
        fillOpacity: 1,
      });

      marker.bindTooltip(code, {
        permanent: true,
        direction: "bottom",
        offset: [0, 9],
        opacity: 1,
        className: isHub ? "network-airport-label hub-airport-label" : "network-airport-label",
      });

      marker.on("click", () => {
        setSelectedAirportCode(code);
        setSelectedRouteId(null);
      });

      marker.addTo(group);
    });

    networkLayerRef.current = group;
    return () => {
      group.remove();
      if (networkLayerRef.current === group) networkLayerRef.current = null;
    };
  }, [airline.hub, mapReady, networkCodes]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!mapReady || !map || !L) return;

    routeLayerRef.current?.remove();
    const group = L.layerGroup().addTo(map);

    airline.routes.forEach((route) => {
      const path = paths.get(route.id) ?? [];
      if (path.length < 2) return;

      const result = resultMap.get(route.id);
      const selected = route.id === selectedRouteId;
      const color = selected ? "#ffffff" : !result ? "#38bdf8" : result.profit >= 0 ? "#22c55e" : "#fb7185";
      const latLngs = pathToLeaflet(path);

      L.polyline(latLngs, {
        color: "#07111f",
        weight: selected ? 8 : 6,
        opacity: 0.72,
        interactive: false,
        smoothFactor: 1,
      }).addTo(group);

      const line = L.polyline(latLngs, {
        color,
        weight: selected ? 4.5 : 3,
        opacity: 0.96,
        interactive: true,
        smoothFactor: 1,
      });

      line.bindTooltip(`${route.origin} → ${route.destination}`, {
        sticky: true,
        className: "route-hover-tooltip",
      });

      line.on("click", () => {
        setSelectedRouteId(route.id);
        setSelectedAirportCode(null);
      });

      line.addTo(group);
    });

    routeLayerRef.current = group;
    return () => {
      group.remove();
      if (routeLayerRef.current === group) routeLayerRef.current = null;
    };
  }, [airline.routes, mapReady, paths, resultMap, selectedRouteId]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!mapReady || !map || !L) return;

    selectedLayerRef.current?.remove();
    const group = L.layerGroup().addTo(map);
    const airport = selectedAirportCode ? airportByIata(selectedAirportCode) : undefined;

    if (airport) {
      L.circleMarker([airport.lat, airport.lon], {
        radius: 13,
        weight: 2,
        color: "#ffffff",
        fillColor: "#ffffff",
        fillOpacity: 0.05,
        interactive: false,
      }).addTo(group);
    }

    selectedLayerRef.current = group;
    return () => {
      group.remove();
      if (selectedLayerRef.current === group) selectedLayerRef.current = null;
    };
  }, [mapReady, selectedAirportCode]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!mapReady || !map || !L) return;

    planeLayerRef.current?.remove();
    flightMarkersRef.current.clear();
    const group = L.layerGroup().addTo(map);

    airline.routes.forEach((route) => {
      const markerCount = Math.min(3, Math.max(1, Math.ceil(route.weeklyFrequency / 14)));
      const path = paths.get(route.id) ?? [];
      if (path.length < 2) return;

      for (let markerIndex = 0; markerIndex < markerCount; markerIndex += 1) {
        const key = `${route.id}:${markerIndex}`;
        const [lon, lat] = path[0];
        const icon = L.divIcon({
          className: "flight-marker-wrapper",
          html: '<div class="flight-marker"><span class="flight-marker-glyph">✈</span></div>',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });

        const marker = L.marker([lat, lon], {
          icon,
          interactive: false,
          keyboard: false,
          bubblingMouseEvents: false,
        }).addTo(group);

        flightMarkersRef.current.set(key, { marker, routeId: route.id, markerIndex, markerCount });
      }
    });

    planeLayerRef.current = group;
    return () => {
      group.remove();
      flightMarkersRef.current.clear();
      if (planeLayerRef.current === group) planeLayerRef.current = null;
    };
  }, [airline.routes, mapReady, paths]);

  useEffect(() => {
    if (!mapReady) return;
    let frame = 0;
    let lastPaint = 0;

    const animate = (now: number) => {
      if (now - lastPaint >= 33) {
        lastPaint = now;
        flightMarkersRef.current.forEach((item) => {
          const route = airline.routes.find((candidate) => candidate.id === item.routeId);
          const path = paths.get(item.routeId) ?? [];
          if (!route || path.length < 2) return;

          const distance = Math.max(300, distanceKm(route.origin, route.destination));
          const duration = Math.min(180_000, Math.max(55_000, 50_000 + distance * 18));
          const offset = (hashString(item.routeId) % 1000) / 1000 + item.markerIndex / item.markerCount;
          const cycle = ((now / duration) + offset) % 1;
          const outbound = cycle < 0.5;
          const progress = outbound ? cycle * 2 : (1 - cycle) * 2;
          const point = pointOnPath(path, progress);
          const lookAhead = pointOnPath(path, Math.max(0, Math.min(1, progress + (outbound ? 0.015 : -0.015))));

          item.marker.setLatLng([point[1], point[0]]);
          const glyph = item.marker.getElement()?.querySelector<HTMLElement>(".flight-marker-glyph");
          if (glyph) glyph.style.transform = `rotate(${bearingBetween(point, lookAhead) - 45}deg)`;
        });
      }

      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [airline.routes, mapReady, paths]);

  const selectedAirport = selectedAirportCode ? airportByIata(selectedAirportCode) : undefined;
  const selectedRoute = selectedRouteId ? airline.routes.find((route) => route.id === selectedRouteId) : undefined;
  const selectedResult = selectedRoute ? resultMap.get(selectedRoute.id) : undefined;
  const selectedAircraft = selectedRoute ? airline.fleet.find((aircraft) => aircraft.id === selectedRoute.aircraftId) : undefined;
  const selectedType = selectedAircraft ? aircraftTypeById(selectedAircraft.typeId) : undefined;
  const selectedAirportRoute = selectedAirport ? airline.routes.find((route) => route.destination === selectedAirport.iata || route.origin === selectedAirport.iata) : undefined;

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Live network</div>
          <div className="text-xs text-[var(--muted)]">{airports.length.toLocaleString()} mapped airports · CARTO basemap · non-WebGL renderer</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setShowAirports((value) => !value)} className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--muted)] hover:text-white">{showAirports ? "Hide airports" : "Show airports"}</button>
          <button type="button" onClick={fitNetwork} className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--muted)] hover:text-white">Fit network</button>
          <button type="button" onClick={() => mapRef.current?.flyTo([18, 0], 2, { duration: 0.7 })} className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--muted)] hover:text-white">World</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative min-h-[560px] border-b border-[var(--border)] lg:border-b-0 lg:border-r">
          <div ref={containerRef} className="absolute inset-0" aria-label="Interactive airline network map" />
          <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex flex-wrap gap-2 rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-200 backdrop-blur">
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-300" />Hub</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400" />Network</span>
            <span><i className="mr-1 inline-block h-0.5 w-3 bg-green-400 align-middle" />Profit</span>
            <span><i className="mr-1 inline-block h-0.5 w-3 bg-rose-400 align-middle" />Loss</span>
          </div>
        </div>

        <aside className="min-h-[280px] bg-[var(--panel-2)] p-5">
          {selectedRoute ? (
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Route</div>
              <div className="mt-2 font-mono text-2xl">{selectedRoute.origin} → {selectedRoute.destination}</div>
              <div className="mt-1 text-sm text-[var(--muted)]">{selectedAircraft?.registration ?? "Aircraft"} · {selectedType?.model ?? "Unknown type"}</div>
              <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
                <MapStat label="Distance" value={`${distanceKm(selectedRoute.origin, selectedRoute.destination).toLocaleString()} km`} />
                <MapStat label="Frequency" value={`${selectedRoute.weeklyFrequency}× / week`} />
                <MapStat label="Fare" value={money(selectedRoute.economyFare)} />
                <MapStat label="Load factor" value={selectedResult ? pct(selectedResult.loadFactor) : "Not simulated"} />
                <MapStat label="Passengers" value={selectedResult ? selectedResult.passengers.toLocaleString() : "—"} />
                <MapStat label="Last profit" value={selectedResult ? money(selectedResult.profit) : "—"} valueClass={selectedResult ? (selectedResult.profit >= 0 ? "text-green-300" : "text-rose-300") : ""} />
              </div>
            </div>
          ) : selectedAirport ? (
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Airport</div>
              <div className="mt-2 flex items-baseline gap-2"><span className="font-mono text-3xl">{selectedAirport.iata}</span><span className="text-sm text-[var(--muted)]">{selectedAirport.icao ?? ""}</span></div>
              <div className="mt-2 font-medium">{selectedAirport.name}</div>
              <div className="mt-1 text-sm text-[var(--muted)]">{selectedAirport.city} · {selectedAirport.country}</div>
              <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
                <MapStat label="From hub" value={selectedAirport.iata === airline.hub ? "Hub" : `${distanceKm(airline.hub, selectedAirport.iata).toLocaleString()} km`} />
                <MapStat label="Market" value={`${estimateDailyDemand(airline.hub, selectedAirport.iata).toLocaleString()} pax/day`} />
                <MapStat label="Type" value={selectedAirport.type === "large_airport" ? "Large" : "Medium"} />
                <MapStat label="Status" value={selectedAirportRoute ? "Served" : "Unserved"} valueClass={selectedAirportRoute ? "text-green-300" : ""} />
              </div>
              {selectedAirport.iata !== airline.hub && (
                <button type="button" onClick={() => onPlanRoute(selectedAirport.iata)} className="mt-5 w-full rounded-lg bg-sky-300 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-200">Plan {airline.hub} → {selectedAirport.iata}</button>
              )}
            </div>
          ) : (
            <div className="grid min-h-64 place-items-center text-center text-sm text-[var(--muted)]">Click an airport or route on the map.</div>
          )}
        </aside>
      </div>
    </section>
  );
}

function MapStat({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className={`mt-1 font-medium ${valueClass}`}>{value}</div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { aircraftTypeById, airportByIata, airports } from "@/game/data";
import { distanceKm, estimateDailyDemand } from "@/game/simulation";
import type { Airline, Route, RouteResult } from "@/game/types";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const pct = (value: number) => `${Math.round(value * 100)}%`;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
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

  return points;
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

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return Math.abs(hash);
}

type FlightMarker = {
  marker: maplibregl.Marker;
  glyph: HTMLSpanElement;
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
  const mapRef = useRef<maplibregl.Map | null>(null);
  const flightMarkersRef = useRef<Map<string, FlightMarker>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const [showAirports, setShowAirports] = useState(true);
  const [selectedAirportCode, setSelectedAirportCode] = useState<string | null>(airline.hub);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const resultMap = useMemo(() => new Map(results.map((result) => [result.routeId, result])), [results]);
  const paths = useMemo(() => new Map(airline.routes.map((route) => [route.id, routePath(route)])), [airline.routes]);

  const airportGeoJson = useMemo(() => ({
    type: "FeatureCollection",
    features: airports.map((airport) => ({
      type: "Feature",
      properties: {
        iata: airport.iata,
        icao: airport.icao ?? "",
        name: airport.name,
        city: airport.city,
        country: airport.country,
        airportType: airport.type ?? "medium_airport",
      },
      geometry: { type: "Point", coordinates: [airport.lon, airport.lat] },
    })),
  }), []);

  const networkCodes = useMemo(() => {
    const codes = new Set<string>([airline.hub]);
    airline.routes.forEach((route) => {
      codes.add(route.origin);
      codes.add(route.destination);
    });
    return codes;
  }, [airline.hub, airline.routes]);

  const networkAirportGeoJson = useMemo(() => ({
    type: "FeatureCollection",
    features: [...networkCodes].map((code) => airportByIata(code)).filter(Boolean).map((airport) => ({
      type: "Feature",
      properties: {
        iata: airport!.iata,
        name: airport!.name,
        city: airport!.city,
        isHub: airport!.iata === airline.hub ? 1 : 0,
      },
      geometry: { type: "Point", coordinates: [airport!.lon, airport!.lat] },
    })),
  }), [networkCodes, airline.hub]);

  const routeGeoJson = useMemo(() => ({
    type: "FeatureCollection",
    features: airline.routes.map((route) => {
      const result = resultMap.get(route.id);
      return {
        type: "Feature",
        properties: {
          id: route.id,
          origin: route.origin,
          destination: route.destination,
          profit: result?.profit ?? 0,
          hasResult: result ? 1 : 0,
          selected: route.id === selectedRouteId ? 1 : 0,
        },
        geometry: { type: "LineString", coordinates: paths.get(route.id) ?? [] },
      };
    }).filter((feature) => feature.geometry.coordinates.length > 1),
  }), [airline.routes, paths, resultMap, selectedRouteId]);

  const selectedAirportGeoJson = useMemo(() => {
    const airport = selectedAirportCode ? airportByIata(selectedAirportCode) : undefined;
    return {
      type: "FeatureCollection",
      features: airport ? [{ type: "Feature", properties: { iata: airport.iata }, geometry: { type: "Point", coordinates: [airport.lon, airport.lat] } }] : [],
    };
  }, [selectedAirportCode]);

  const fitNetwork = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const points = [...networkCodes].map((code) => airportByIata(code)).filter(Boolean);
    if (points.length <= 1) {
      const hub = airportByIata(airline.hub);
      if (hub) map.flyTo({ center: [hub.lon, hub.lat], zoom: 4.5, duration: 700 });
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    points.forEach((airport) => bounds.extend([airport!.lon, airport!.lat]));
    map.fitBounds(bounds, { padding: 70, maxZoom: 6, duration: 700 });
  }, [airline.hub, networkCodes]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const hub = airportByIata(airline.hub);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: hub ? [hub.lon, hub.lat] : [-98.5, 39.5],
      zoom: hub ? 4.2 : 2.4,
      minZoom: 1.4,
      maxZoom: 11,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource("world-airports", { type: "geojson", data: airportGeoJson as any });
      map.addLayer({
        id: "world-airports",
        type: "circle",
        source: "world-airports",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 1.6, 5, 2.8, 8, 4.5],
          "circle-color": ["match", ["get", "airportType"], "large_airport", "#e2e8f0", "#94a3b8"],
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 2, 0.45, 5, 0.7, 8, 0.9],
          "circle-stroke-color": "#0f172a",
          "circle-stroke-width": 0.7,
        },
      });
      map.addLayer({
        id: "world-airport-labels",
        type: "symbol",
        source: "world-airports",
        minzoom: 5.3,
        layout: {
          "text-field": ["get", "iata"],
          "text-size": 10,
          "text-offset": [0, 1.15],
          "text-anchor": "top",
          "text-allow-overlap": false,
          "text-ignore-placement": false,
        },
        paint: {
          "text-color": "#e2e8f0",
          "text-halo-color": "#0b1220",
          "text-halo-width": 1.4,
        },
      });

      map.addSource("routes", { type: "geojson", data: routeGeoJson as any });
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "routes",
        paint: { "line-color": "#07111f", "line-width": ["case", ["==", ["get", "selected"], 1], 8, 6], "line-opacity": 0.7 },
      });
      map.addLayer({
        id: "route-lines",
        type: "line",
        source: "routes",
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "selected"], 1], "#ffffff",
            ["==", ["get", "hasResult"], 0], "#38bdf8",
            [">=", ["get", "profit"], 0], "#22c55e",
            "#fb7185",
          ],
          "line-width": ["case", ["==", ["get", "selected"], 1], 4.5, 3],
          "line-opacity": 0.95,
        },
      });
      map.addLayer({
        id: "route-hitbox",
        type: "line",
        source: "routes",
        paint: { "line-color": "#ffffff", "line-width": 16, "line-opacity": 0.01 },
      });

      map.addSource("network-airports", { type: "geojson", data: networkAirportGeoJson as any });
      map.addLayer({
        id: "network-airports",
        type: "circle",
        source: "network-airports",
        paint: {
          "circle-radius": ["case", ["==", ["get", "isHub"], 1], 8, 6],
          "circle-color": ["case", ["==", ["get", "isHub"], 1], "#fbbf24", "#38bdf8"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "network-airport-labels",
        type: "symbol",
        source: "network-airports",
        layout: {
          "text-field": ["get", "iata"],
          "text-size": 12,
          "text-offset": [0, 1.25],
          "text-anchor": "top",
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#07111f",
          "text-halo-width": 1.8,
        },
      });

      map.addSource("selected-airport", { type: "geojson", data: selectedAirportGeoJson as any });
      map.addLayer({
        id: "selected-airport-ring",
        type: "circle",
        source: "selected-airport",
        paint: {
          "circle-radius": 13,
          "circle-color": "rgba(255,255,255,0.04)",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });

      const selectAirport = (event: any) => {
        const feature = event.features?.[0];
        const iata = String(feature?.properties?.iata ?? "");
        if (!iata) return;
        setSelectedAirportCode(iata);
        setSelectedRouteId(null);
      };

      map.on("click", "world-airports", selectAirport);
      map.on("click", "network-airports", selectAirport);
      map.on("click", "route-hitbox", (event: any) => {
        const routeId = String(event.features?.[0]?.properties?.id ?? "");
        if (!routeId) return;
        setSelectedRouteId(routeId);
        setSelectedAirportCode(null);
      });

      ["world-airports", "network-airports", "route-hitbox"].forEach((layer) => {
        map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
      });

      setMapReady(true);
      window.setTimeout(() => fitNetwork(), 80);
    });

    mapRef.current = map;
    return () => {
      flightMarkersRef.current.forEach(({ marker }) => marker.remove());
      flightMarkersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    (map.getSource("world-airports") as maplibregl.GeoJSONSource | undefined)?.setData(airportGeoJson as any);
    (map.getSource("network-airports") as maplibregl.GeoJSONSource | undefined)?.setData(networkAirportGeoJson as any);
    (map.getSource("routes") as maplibregl.GeoJSONSource | undefined)?.setData(routeGeoJson as any);
    (map.getSource("selected-airport") as maplibregl.GeoJSONSource | undefined)?.setData(selectedAirportGeoJson as any);
  }, [airportGeoJson, mapReady, networkAirportGeoJson, routeGeoJson, selectedAirportGeoJson]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const visibility = showAirports ? "visible" : "none";
    ["world-airports", "world-airport-labels"].forEach((layer) => {
      if (mapRef.current?.getLayer(layer)) mapRef.current.setLayoutProperty(layer, "visibility", visibility);
    });
  }, [mapReady, showAirports]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const liveKeys = new Set<string>();

    airline.routes.forEach((route) => {
      const markerCount = Math.min(3, Math.max(1, Math.ceil(route.weeklyFrequency / 14)));
      const path = paths.get(route.id) ?? [];
      if (path.length < 2) return;

      for (let markerIndex = 0; markerIndex < markerCount; markerIndex += 1) {
        const key = `${route.id}:${markerIndex}`;
        liveKeys.add(key);
        if (flightMarkersRef.current.has(key)) continue;

        const element = document.createElement("div");
        element.className = "flight-marker";
        element.title = `${airline.code} ${route.origin} → ${route.destination}`;
        const glyph = document.createElement("span");
        glyph.className = "flight-marker-glyph";
        glyph.textContent = "✈";
        element.appendChild(glyph);
        const marker = new maplibregl.Marker({ element, anchor: "center" }).setLngLat(path[0]).addTo(map);
        flightMarkersRef.current.set(key, { marker, glyph, routeId: route.id, markerIndex, markerCount });
      }
    });

    flightMarkersRef.current.forEach(({ marker }, key) => {
      if (!liveKeys.has(key)) {
        marker.remove();
        flightMarkersRef.current.delete(key);
      }
    });
  }, [airline.code, airline.routes, mapReady, paths]);

  useEffect(() => {
    if (!mapReady) return;
    let frame = 0;

    const animate = (now: number) => {
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
        item.marker.setLngLat(point);
        item.glyph.style.transform = `rotate(${bearingBetween(point, lookAhead) - 45}deg)`;
      });
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
          <div className="text-xs text-[var(--muted)]">{airports.length.toLocaleString()} mapped airports · OpenFreeMap basemap · live route visualization</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setShowAirports((value) => !value)} className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--muted)] hover:text-white">{showAirports ? "Hide airports" : "Show airports"}</button>
          <button type="button" onClick={fitNetwork} className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--muted)] hover:text-white">Fit network</button>
          <button type="button" onClick={() => mapRef.current?.flyTo({ center: [0, 18], zoom: 1.6, duration: 700 })} className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--muted)] hover:text-white">World</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative min-h-[560px] border-b border-[var(--border)] lg:border-b-0 lg:border-r">
          <div ref={containerRef} className="absolute inset-0" aria-label="Interactive airline network map" />
          <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-2 rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-200 backdrop-blur">
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

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { airportByIata, airports } from "@/game/data";
import { distanceKm } from "@/game/simulation";
import type { Airline, Route, RouteResult } from "@/game/types";

type LeafletModule = typeof import("leaflet");
type LeafletMap = import("leaflet").Map;
type LeafletLayerGroup = import("leaflet").LayerGroup;
type LeafletMarker = import("leaflet").Marker;

type FlightMarker = {
  marker: LeafletMarker;
  routeId: string;
  markerIndex: number;
  markerCount: number;
};

type Props = {
  airline: Airline;
  results: RouteResult[];
  selectedAirportCode: string | null;
  selectedRouteId: string | null;
  onSelectAirport: (iata: string) => void;
  onSelectRoute: (routeId: string) => void;
  showAirports?: boolean;
};

const PM_TILES_URL = process.env.NEXT_PUBLIC_PM_TILES_URL || "https://data.source.coop/protomaps/openstreetmap/v4.pmtiles";

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

function greatCircle(origin: [number, number], destination: [number, number], steps = 72) {
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

function routePath(route: Route) {
  const origin = airportByIata(route.origin);
  const destination = airportByIata(route.destination);
  if (!origin || !destination) return [];
  return greatCircle([origin.lon, origin.lat], [destination.lon, destination.lat]);
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

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return Math.abs(hash);
}

function pathToLeaflet(path: [number, number][]) {
  return path.map(([lon, lat]) => [lat, lon] as [number, number]);
}

export function NetworkMap({
  airline,
  results,
  selectedAirportCode,
  selectedRouteId,
  onSelectAirport,
  onSelectRoute,
  showAirports = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const worldAirportsLayerRef = useRef<LeafletLayerGroup | null>(null);
  const networkLayerRef = useRef<LeafletLayerGroup | null>(null);
  const routeLayerRef = useRef<LeafletLayerGroup | null>(null);
  const selectedLayerRef = useRef<LeafletLayerGroup | null>(null);
  const planeLayerRef = useRef<LeafletLayerGroup | null>(null);
  const flightMarkersRef = useRef<Map<string, FlightMarker>>(new Map());
  const onSelectAirportRef = useRef(onSelectAirport);
  const onSelectRouteRef = useRef(onSelectRoute);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => { onSelectAirportRef.current = onSelectAirport; }, [onSelectAirport]);
  useEffect(() => { onSelectRouteRef.current = onSelectRoute; }, [onSelectRoute]);

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

  useEffect(() => {
    let disposed = false;
    let createdMap: LeafletMap | null = null;

    void (async () => {
      const leafletImport = await import("leaflet");
      const L = (((leafletImport as unknown as { default?: LeafletModule }).default ?? leafletImport) as LeafletModule);
      const protoImport = await import("protomaps-leaflet");
      const proto = protoImport as unknown as {
        leafletLayer?: (options: Record<string, unknown>) => import("leaflet").Layer;
        default?: { leafletLayer?: (options: Record<string, unknown>) => import("leaflet").Layer };
      };
      const leafletLayer = proto.leafletLayer ?? proto.default?.leafletLayer;
      if (!leafletLayer) throw new Error("Protomaps Leaflet renderer did not load.");
      if (disposed || !containerRef.current) return;

      leafletRef.current = L;
      const hub = airportByIata(airline.hub);
      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
        preferCanvas: true,
        minZoom: 2,
        maxZoom: 13,
        worldCopyJump: true,
        zoomSnap: 0.25,
      });

      createdMap = map;
      mapRef.current = map;
      map.setView(hub ? [hub.lat, hub.lon] : [39.5, -98.5], hub ? 4.25 : 2.25);

      const basemap = leafletLayer({
        url: PM_TILES_URL,
        flavor: "light",
        lang: "en",
        maxDataZoom: 15,
      });
      basemap.addTo(map);
      map.attributionControl.setPrefix(false);
      map.attributionControl.addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Protomaps');
      L.control.zoom({ position: "bottomright" }).addTo(map);

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
        radius: large ? 2.9 : 2.1,
        weight: large ? 0.9 : 0.6,
        color: "#334155",
        fillColor: large ? "#334155" : "#64748b",
        fillOpacity: large ? 0.75 : 0.48,
      });
      marker.bindTooltip(`${airport.iata} · ${airport.city}`, {
        sticky: true,
        direction: "top",
        opacity: 0.98,
        className: "airport-hover-tooltip",
      });
      marker.on("click", () => onSelectAirportRef.current(airport.iata));
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
        radius: isHub ? 7.5 : 5.5,
        weight: 2,
        color: "#ffffff",
        fillColor: isHub ? "#f4c430" : "#0284c7",
        fillOpacity: 1,
      });
      marker.bindTooltip(code, {
        permanent: true,
        direction: "bottom",
        offset: [0, 8],
        opacity: 1,
        className: isHub ? "network-airport-label hub-airport-label" : "network-airport-label",
      });
      marker.on("click", () => onSelectAirportRef.current(code));
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
      const color = selected ? "#f4c430" : !result ? "#0ea5e9" : result.profit >= 0 ? "#16a34a" : "#e11d48";
      const latLngs = pathToLeaflet(path);

      L.polyline(latLngs, {
        color: "#ffffff",
        weight: selected ? 7 : 5,
        opacity: 0.85,
        interactive: false,
        smoothFactor: 1,
      }).addTo(group);

      const line = L.polyline(latLngs, {
        color,
        weight: selected ? 4 : 2.6,
        opacity: 0.95,
        interactive: true,
        smoothFactor: 1,
      });
      line.bindTooltip(`${route.origin} → ${route.destination}`, {
        sticky: true,
        className: "route-hover-tooltip",
      });
      line.on("click", () => onSelectRouteRef.current(route.id));
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
        radius: 12,
        weight: 3,
        color: "#f4c430",
        fillColor: "#f4c430",
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(group);
      const targetZoom = Math.max(6.25, Math.min(8, map.getZoom()));
      map.flyTo([airport.lat, airport.lon], targetZoom, { duration: 0.55 });
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
    if (!mapReady || !map || !L || !selectedRouteId) return;
    const path = paths.get(selectedRouteId) ?? [];
    if (path.length < 2) return;
    const bounds = L.latLngBounds(pathToLeaflet(path));
    map.flyToBounds(bounds, {
      paddingTopLeft: [430, 90],
      paddingBottomRight: [90, 90],
      maxZoom: 7,
      duration: 0.6,
    });
  }, [mapReady, paths, selectedRouteId]);

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
        flightMarkersRef.current.set(`${route.id}:${markerIndex}`, { marker, routeId: route.id, markerIndex, markerCount });
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
      if (now - lastPaint >= 40) {
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

  return <div ref={containerRef} className="absolute inset-0 h-full w-full" aria-label="Interactive airline operations map" />;
}

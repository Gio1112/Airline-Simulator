"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NetworkMap as LeafletNetworkMap } from "@/components/network-map";
import { aircraftTypeById, airportByIata, airports } from "@/game/data";
import { distanceKm, estimateDailyDemand } from "@/game/simulation";
import type { Airline, Route, RouteResult } from "@/game/types";

declare global {
  interface Window {
    mapkit?: any;
    __airlineMapKitReady?: () => void;
  }
}

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const pct = (value: number) => `${Math.round(value * 100)}%`;

type Props = {
  airline: Airline;
  results: RouteResult[];
  onPlanRoute: (iata: string) => void;
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function greatCircle(route: Route, steps = 64) {
  const origin = airportByIata(route.origin);
  const destination = airportByIata(route.destination);
  if (!origin || !destination) return [];

  const lon1 = toRadians(origin.lon);
  const lat1 = toRadians(origin.lat);
  const lon2 = toRadians(destination.lon);
  const lat2 = toRadians(destination.lat);
  const dot = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
  if (angle < 0.000001) return [[origin.lat, origin.lon], [destination.lat, destination.lon]] as [number, number][];

  const sinAngle = Math.sin(angle);
  const points: [number, number][] = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const a = Math.sin((1 - t) * angle) / sinAngle;
    const b = Math.sin(t * angle) / sinAngle;
    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    points.push([toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y))), toDegrees(Math.atan2(y, x))]);
  }
  return points;
}

function ensureMapKit(token: string) {
  if (window.mapkit?.loadedLibraries?.length) return Promise.resolve(window.mapkit);

  return new Promise<any>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-airline-mapkit]");
    window.__airlineMapKitReady = () => {
      if (window.mapkit) resolve(window.mapkit);
      else reject(new Error("Apple MapKit JS loaded without a mapkit namespace."));
    };

    if (existing) return;

    const script = document.createElement("script");
    script.src = "https://cdn.apple-mapkit.com/mk/6/mapkit.core.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.airlineMapkit = "true";
    script.setAttribute("data-callback", "__airlineMapKitReady");
    script.setAttribute("data-libraries", "map,annotations,overlays");
    script.setAttribute("data-token", token);
    script.onerror = () => reject(new Error("Could not load Apple MapKit JS."));
    document.head.appendChild(script);
  });
}

export function AppleNetworkMap(props: Props) {
  const token = process.env.NEXT_PUBLIC_APPLE_MAPS_TOKEN;
  if (!token) return <LeafletNetworkMap {...props} />;
  return <AppleMapInner {...props} token={token} />;
}

function AppleMapInner({ airline, results, onPlanRoute, token }: Props & { token: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAirportCode, setSelectedAirportCode] = useState<string | null>(airline.hub);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const resultMap = useMemo(() => new Map(results.map((result) => [result.routeId, result])), [results]);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const mapkit = await ensureMapKit(token);
        if (cancelled || !containerRef.current) return;

        const hub = airportByIata(airline.hub);
        const map = new mapkit.Map(containerRef.current, {
          center: new mapkit.Coordinate(hub?.lat ?? 39.5, hub?.lon ?? -98.5),
          mapType: mapkit.MapType.MutedStandard,
          colorScheme: mapkit.ColorScheme.Dark,
          showsMapTypeControl: true,
          showsZoomControl: true,
          isRotationEnabled: false,
          tintColor: "#38bdf8",
        });
        mapRef.current = map;

        const served = new Set<string>([airline.hub]);
        airline.routes.forEach((route) => {
          served.add(route.origin);
          served.add(route.destination);
        });

        const airportAnnotations = airports.map((airport) => {
          const isHub = airport.iata === airline.hub;
          const isServed = served.has(airport.iata);
          const annotation = new mapkit.MarkerAnnotation(new mapkit.Coordinate(airport.lat, airport.lon), {
            title: airport.iata,
            subtitle: `${airport.city} · ${airport.name}`,
            color: isHub ? "#fbbf24" : isServed ? "#38bdf8" : airport.type === "large_airport" ? "#64748b" : "#475569",
            glyphText: isHub ? "H" : isServed ? "•" : "",
            clusteringIdentifier: isHub || isServed ? undefined : "airports",
          });
          annotation.addEventListener("select", () => {
            setSelectedAirportCode(airport.iata);
            setSelectedRouteId(null);
          });
          return annotation;
        });
        map.addAnnotations(airportAnnotations);

        const routeOverlays = airline.routes.map((route) => {
          const result = resultMap.get(route.id);
          const style = new mapkit.Style({
            lineWidth: 3,
            strokeColor: !result ? "#38bdf8" : result.profit >= 0 ? "#22c55e" : "#fb7185",
            strokeOpacity: 0.95,
            lineJoin: "round",
          });
          const coordinates = greatCircle(route).map(([lat, lon]) => new mapkit.Coordinate(lat, lon));
          const overlay = new mapkit.PolylineOverlay(coordinates, { style, enabled: true });
          overlay.addEventListener?.("select", () => {
            setSelectedRouteId(route.id);
            setSelectedAirportCode(null);
          });
          return overlay;
        });
        if (routeOverlays.length) map.addOverlays(routeOverlays);

        const networkAnnotations = airportAnnotations.filter((annotation: any) => served.has(annotation.title));
        if (networkAnnotations.length > 1) {
          map.showItems([...networkAnnotations, ...routeOverlays], { animate: false, padding: new mapkit.Padding(50) });
        } else if (hub) {
          map.region = new mapkit.CoordinateRegion(new mapkit.Coordinate(hub.lat, hub.lon), new mapkit.CoordinateSpan(8, 12));
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Apple Maps failed to initialize.");
      }
    };

    void boot();
    return () => {
      cancelled = true;
      if (mapRef.current?.destroy) mapRef.current.destroy();
      mapRef.current = null;
    };
  }, [airline.hub, airline.routes, resultMap, token]);

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-400/20 bg-[var(--panel)] p-6">
        <div className="font-semibold text-rose-300">Apple Maps could not load</div>
        <div className="mt-2 text-sm text-[var(--muted)]">{error}</div>
      </div>
    );
  }

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
          <div className="text-xs text-[var(--muted)]">{airports.length.toLocaleString()} mapped airports · Apple Maps · MapKit JS</div>
        </div>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative min-h-[560px] border-b border-[var(--border)] lg:border-b-0 lg:border-r">
          <div ref={containerRef} className="absolute inset-0" aria-label="Interactive airline network map powered by Apple Maps" />
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-wrap gap-2 rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-200 backdrop-blur">
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

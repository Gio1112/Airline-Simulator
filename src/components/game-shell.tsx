"use client";

import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  MapPin,
  MapPinned,
  Plane,
  Plus,
  Route as RouteIcon,
  Search,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { MediaImage } from "@/components/media-image";
import { NetworkMap } from "@/components/network-map";
import { aircraftTypeById, aircraftTypes, airportByIata, airports } from "@/game/data";
import { distanceKm, estimateDailyDemand, simulateDay } from "@/game/simulation";
import type { Airline, RouteResult } from "@/game/types";

const STARTING_CASH = 25_000_000;
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const pct = (value: number) => `${Math.round(value * 100)}%`;
type AirlineSetter = Dispatch<SetStateAction<Airline | null>>;
type Panel = "fleet" | "routes" | "stats" | "selection" | null;

export function GameShell() {
  const [airline, setAirline] = useState<Airline | null>(null);
  const [results, setResults] = useState<RouteResult[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [routeDraftDestination, setRouteDraftDestination] = useState<string | null>(null);
  const [selectedAirportCode, setSelectedAirportCode] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [showAirports, setShowAirports] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notice, setNotice] = useState("Ready");

  const searchMatches = useMemo(() => airportMatches(searchQuery, 8), [searchQuery]);

  if (!airline) return <Onboarding onCreate={setAirline} />;

  const dayProfit = results.reduce((sum, item) => sum + item.profit, 0);
  const weeklyFlights = airline.routes.reduce((sum, route) => sum + route.weeklyFrequency, 0);
  const selectedAirport = selectedAirportCode ? airportByIata(selectedAirportCode) : undefined;
  const selectedRoute = selectedRouteId ? airline.routes.find((route) => route.id === selectedRouteId) : undefined;

  const advanceDay = () => {
    const outcome = simulateDay(airline);
    setResults(outcome.results);
    setAirline((current) => current ? {
      ...current,
      day: current.day + 1,
      cash: current.cash + outcome.profit,
      lifetimeProfit: current.lifetimeProfit + outcome.profit,
      reputation: Math.min(100, current.reputation + (outcome.results.length ? 0.15 : 0)),
    } : current);
    setNotice(`${outcome.profit >= 0 ? "+" : ""}${money(outcome.profit)} today`);
  };

  const togglePanel = (next: Exclude<Panel, "selection" | null>) => {
    setPanel((current) => current === next ? null : next);
  };

  const selectAirport = (iata: string) => {
    setSelectedAirportCode(iata);
    setSelectedRouteId(null);
    setPanel("selection");
  };

  const selectRoute = (routeId: string) => {
    setSelectedRouteId(routeId);
    setSelectedAirportCode(null);
    setPanel("selection");
  };

  const closePanel = () => {
    setPanel(null);
    setSelectedAirportCode(null);
    setSelectedRouteId(null);
  };

  const planRoute = (iata: string) => {
    if (iata === airline.hub) return;
    setRouteDraftDestination(iata);
    setPanel("routes");
    setNotice(`Planning ${airline.hub}–${iata}`);
  };

  const chooseSearchAirport = (iata: string) => {
    const airport = airportByIata(iata);
    if (!airport) return;
    setSearchQuery(`${airport.iata} · ${airport.city}`);
    setSearchOpen(false);
    selectAirport(iata);
  };

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#dfe8e6]">
      <NetworkMap
        airline={airline}
        results={results}
        selectedAirportCode={selectedAirportCode}
        selectedRouteId={selectedRouteId}
        onSelectAirport={selectAirport}
        onSelectRoute={selectRoute}
        showAirports={showAirports}
      />

      <div className="pointer-events-auto absolute left-3 top-3 z-[1200] flex h-12 items-center gap-3 rounded-xl border border-white/10 bg-[#11161b]/96 px-3 text-white shadow-lg backdrop-blur-md">
        <div className="grid h-8 min-w-8 place-items-center rounded-lg bg-[#f5c842] px-2 font-mono text-xs font-black text-[#11161b]">{airline.code}</div>
        <div className="hidden min-w-0 sm:block">
          <div className="max-w-[160px] truncate text-sm font-semibold">{airline.name}</div>
          <div className="text-[10px] text-slate-500">{airline.hub} · {airline.routes.length} routes</div>
        </div>
      </div>

      <div className="pointer-events-auto absolute left-1/2 top-3 z-[1250] w-[min(520px,calc(100vw-390px))] -translate-x-1/2 max-md:left-[74px] max-md:right-3 max-md:w-auto max-md:translate-x-0">
        <form onSubmit={(event) => { event.preventDefault(); if (searchMatches[0]) chooseSearchAirport(searchMatches[0].iata); }}>
          <div className="flex h-12 items-center rounded-xl border border-black/5 bg-white/96 px-3 text-slate-900 shadow-lg backdrop-blur-md">
            <Search className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.8} />
            <input
              value={searchQuery}
              onFocus={() => setSearchOpen(true)}
              onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(true); }}
              placeholder="Search airport or city"
              className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-slate-400"
            />
            {searchQuery && <button type="button" onClick={() => { setSearchQuery(""); setSearchOpen(false); }} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>}
          </div>
        </form>
        {searchOpen && searchQuery.trim() && (
          <div className="mt-1.5 overflow-hidden rounded-xl border border-black/5 bg-white shadow-xl">
            {searchMatches.length ? searchMatches.map((airport) => (
              <button key={airport.iata} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseSearchAirport(airport.iata)} className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50">
                <span className="w-10 font-mono text-sm font-bold text-slate-900">{airport.iata}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{airport.city}</span><span className="block truncate text-[11px] text-slate-400">{airport.name}</span></span>
                <span className="text-[10px] text-slate-400">{airport.country}</span>
              </button>
            )) : <div className="px-4 py-4 text-center text-sm text-slate-400">No matches</div>}
          </div>
        )}
      </div>

      <div className="pointer-events-auto absolute right-3 top-3 z-[1200] flex h-12 items-center rounded-xl border border-white/10 bg-[#11161b]/96 px-1.5 text-white shadow-lg backdrop-blur-md">
        <MetaItem icon={<WalletCards />} value={money(airline.cash)} className="hidden lg:flex" />
        <MetaItem icon={<CalendarDays />} value={`Day ${airline.day}`} className="hidden sm:flex" />
        <button onClick={advanceDay} className="ml-1 flex h-9 items-center gap-1.5 rounded-lg bg-[#f5c842] px-3 text-xs font-semibold text-[#11161b] hover:bg-[#ffda57]">Advance<ChevronRight className="h-3.5 w-3.5" /></button>
      </div>

      <nav className="pointer-events-auto absolute left-3 top-[72px] z-[1150] flex w-12 flex-col rounded-xl border border-white/10 bg-[#11161b]/96 p-1 shadow-lg backdrop-blur-md">
        <DockButton label="Fleet" active={panel === "fleet"} onClick={() => togglePanel("fleet")}><Plane /></DockButton>
        <DockButton label="Routes" active={panel === "routes"} onClick={() => togglePanel("routes")}><RouteIcon /></DockButton>
        <DockButton label="Performance" active={panel === "stats"} onClick={() => togglePanel("stats")}><BarChart3 /></DockButton>
        <div className="mx-2 my-1 h-px bg-white/10" />
        <DockButton label={showAirports ? "Hide airports" : "Show airports"} active={showAirports} onClick={() => setShowAirports((value) => !value)}><MapPin /></DockButton>
      </nav>

      {panel && (
        <aside className="pointer-events-auto absolute bottom-3 left-3 top-[72px] z-[1100] flex w-[390px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#11161b]/97 text-white shadow-2xl backdrop-blur-lg max-sm:right-3 max-sm:w-auto">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/8 px-4">
            <div className="text-sm font-semibold">{panelTitle(panel, selectedAirport?.iata, selectedRoute ? `${selectedRoute.origin}–${selectedRoute.destination}` : undefined)}</div>
            <button onClick={closePanel} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {panel === "fleet" && <FleetPanel airline={airline} setAirline={setAirline} setNotice={setNotice} />}
            {panel === "routes" && <RoutesPanel airline={airline} setAirline={setAirline} setNotice={setNotice} results={results} requestedDestination={routeDraftDestination} onDestinationConsumed={() => setRouteDraftDestination(null)} onInspectRoute={selectRoute} />}
            {panel === "stats" && <StatsPanel airline={airline} results={results} />}
            {panel === "selection" && <SelectionPanel airline={airline} results={results} airportCode={selectedAirportCode} routeId={selectedRouteId} onPlanRoute={planRoute} />}
          </div>
        </aside>
      )}

      <div className="pointer-events-none absolute bottom-3 left-[72px] z-[900] hidden items-center gap-2 rounded-lg bg-[#11161b]/90 px-3 py-2 text-[10px] text-slate-300 shadow-md backdrop-blur-md sm:flex">
        <span className="font-semibold text-[#f5c842]">{airline.hub}</span><span className="text-slate-600">•</span><span>{weeklyFlights} flights/week</span><span className="text-slate-600">•</span><span className={dayProfit >= 0 ? "text-emerald-400" : "text-rose-400"}>{results.length ? money(dayProfit) : "Not simulated"}</span>
      </div>

      {notice !== "Ready" && <div className="pointer-events-none absolute bottom-3 left-1/2 z-[900] -translate-x-1/2 rounded-lg bg-white/95 px-3 py-2 text-[11px] font-medium text-slate-700 shadow-md">{notice}</div>}
    </main>
  );
}

function SelectionPanel({ airline, results, airportCode, routeId, onPlanRoute }: { airline: Airline; results: RouteResult[]; airportCode: string | null; routeId: string | null; onPlanRoute: (iata: string) => void }) {
  const airport = airportCode ? airportByIata(airportCode) : undefined;
  const route = routeId ? airline.routes.find((item) => item.id === routeId) : undefined;
  const result = route ? results.find((item) => item.routeId === route.id) : undefined;

  if (airport) {
    const served = airline.routes.some((item) => item.destination === airport.iata || item.origin === airport.iata);
    return (
      <section className="overflow-hidden rounded-xl bg-white text-slate-900">
        <div className="relative h-44">
          <MediaImage queries={[airport.name, `${airport.city} airport`]} alt={airport.name} className="h-full" />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 text-white">
            <div><div className="flex items-baseline gap-2"><span className="font-mono text-4xl font-bold">{airport.iata}</span><span className="text-xs text-white/70">{airport.icao ?? ""}</span></div><div className="mt-1 max-w-[270px] text-sm font-medium">{airport.name}</div></div>
            <span className="rounded-md bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-800">{served ? "Served" : "Unserved"}</span>
          </div>
        </div>

        <div className="p-4">
          <div className="text-sm font-semibold">{airport.city}, {airport.country}</div>
          <div className="mt-4 grid grid-cols-2 border-y border-slate-200 text-sm">
            <MetricCell label="From hub" value={airport.iata === airline.hub ? "Hub" : `${distanceKm(airline.hub, airport.iata).toLocaleString()} km`} />
            <MetricCell label="Market" value={`${estimateDailyDemand(airline.hub, airport.iata).toLocaleString()} pax/day`} right />
            <MetricCell label="Class" value={airport.type === "large_airport" ? "Large" : "Medium"} />
            <MetricCell label="Network" value={served ? "Connected" : "Not served"} right />
          </div>
          {airport.iata !== airline.hub && <button onClick={() => onPlanRoute(airport.iata)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-black"><RouteIcon className="h-4 w-4" />Plan {airline.hub}–{airport.iata}</button>}
        </div>
      </section>
    );
  }

  if (route) {
    const aircraft = airline.fleet.find((item) => item.id === route.aircraftId);
    const type = aircraft ? aircraftTypeById(aircraft.typeId) : undefined;
    const index = airline.routes.findIndex((item) => item.id === route.id);
    return (
      <section className="overflow-hidden rounded-xl bg-white text-slate-900">
        <div className="relative h-36">
          <MediaImage queries={type ? [`${type.manufacturer} ${type.model}`, `${type.model} aircraft`] : ["Airliner"]} alt={type ? `${type.manufacturer} ${type.model}` : "Airliner"} className="h-full" />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 text-white">
            <div><div className="font-mono text-xl font-bold text-[#f5c842]">{airline.code}{100 + Math.max(0, index) * 7}</div><div className="text-sm font-medium">{airline.name}</div></div>
            <span className="rounded-md bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-800">{type?.model ?? "Aircraft"}</span>
          </div>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <AirportCode code={route.origin} />
            <Plane className="h-5 w-5 rotate-90 text-slate-400" strokeWidth={1.6} />
            <AirportCode code={route.destination} right />
          </div>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-[#f5c842]" style={{ width: `${result ? Math.max(5, Math.round(result.loadFactor * 100)) : 14}%` }} /></div>
          <div className="mt-2 flex justify-between text-[11px] text-slate-500"><span>{result ? `${result.passengers} passengers` : "Awaiting simulation"}</span><span>{result ? pct(result.loadFactor) : `${route.weeklyFrequency}× weekly`}</span></div>
          <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200 text-sm">
            <DataLine label="Aircraft" value={`${aircraft?.registration ?? "—"} · ${type?.model ?? "—"}`} />
            <DataLine label="Distance" value={`${distanceKm(route.origin, route.destination).toLocaleString()} km`} />
            <DataLine label="Fare" value={money(route.economyFare)} />
            <DataLine label="Result" value={result ? money(result.profit) : "—"} valueClass={result ? (result.profit >= 0 ? "text-emerald-700" : "text-rose-700") : ""} />
          </div>
        </div>
      </section>
    );
  }

  return <EmptyState>Select an airport or route on the map.</EmptyState>;
}

function FleetPanel({ airline, setAirline, setNotice }: { airline: Airline; setAirline: AirlineSetter; setNotice: (notice: string) => void }) {
  const lease = (typeId: string) => {
    const type = aircraftTypeById(typeId);
    if (!type) return;
    const deposit = type.monthlyLease * 2;
    if (airline.cash < deposit) return setNotice("Not enough cash");
    const number = airline.fleet.length + 1;
    const aircraft = { id: crypto.randomUUID(), typeId, registration: `N${300 + number}${airline.code.slice(0, 2)}`, condition: 100 };
    setAirline((current) => current ? { ...current, cash: current.cash - deposit, fleet: [...current.fleet, aircraft] } : current);
    setNotice(`${type.model} leased`);
  };

  return (
    <div>
      <SectionLabel>Aircraft market</SectionLabel>
      <div className="mt-2 overflow-hidden rounded-xl bg-white text-slate-900">
        {aircraftTypes.map((type, index) => (
          <div key={type.id} className={`flex items-center gap-3 px-3 py-3 ${index ? "border-t border-slate-200" : ""}`}>
            <MediaImage queries={[`${type.manufacturer} ${type.model}`, `${type.model} aircraft`]} alt={`${type.manufacturer} ${type.model}`} className="h-14 w-20 shrink-0 rounded-lg" overlay={false} />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{type.manufacturer} {type.model}</div><div className="mt-0.5 text-[11px] text-slate-500">{type.seats} seats · {type.rangeKm.toLocaleString()} km · {money(type.monthlyLease)}/mo</div></div>
            <button onClick={() => lease(type.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-900 text-white hover:bg-black" aria-label={`Lease ${type.model}`}><Plus className="h-4 w-4" /></button>
          </div>
        ))}
      </div>

      <SectionLabel className="mt-5">Your fleet</SectionLabel>
      <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
        {airline.fleet.length === 0 ? <EmptyState>No aircraft yet.</EmptyState> : airline.fleet.map((aircraft, index) => {
          const type = aircraftTypeById(aircraft.typeId);
          const assigned = airline.routes.find((route) => route.aircraftId === aircraft.id);
          return <div key={aircraft.id} className={`flex items-center gap-3 px-3 py-3 ${index ? "border-t border-white/8" : ""}`}><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5 text-slate-300"><Plane className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="font-mono text-sm font-semibold">{aircraft.registration}</div><div className="mt-0.5 truncate text-[11px] text-slate-500">{type?.manufacturer} {type?.model}</div></div><div className="text-right text-[10px] text-slate-500"><div>{assigned ? `${assigned.origin}–${assigned.destination}` : "Available"}</div><div className="mt-0.5">{aircraft.condition}% condition</div></div></div>;
        })}
      </div>
    </div>
  );
}

function RoutesPanel({ airline, setAirline, setNotice, results, requestedDestination, onDestinationConsumed, onInspectRoute }: { airline: Airline; setAirline: AirlineSetter; setNotice: (notice: string) => void; results: RouteResult[]; requestedDestination: string | null; onDestinationConsumed: () => void; onInspectRoute: (routeId: string) => void }) {
  const freeAircraft = useMemo(() => airline.fleet.filter((aircraft) => !airline.routes.some((route) => route.aircraftId === aircraft.id)), [airline.fleet, airline.routes]);
  const initialDestination = airports.find((airport) => airport.iata !== airline.hub)?.iata ?? "LAX";
  const [destination, setDestination] = useState(initialDestination);
  const [destinationQuery, setDestinationQuery] = useState(initialDestination);
  const [aircraftId, setAircraftId] = useState(freeAircraft[0]?.id ?? "");
  const [frequency, setFrequency] = useState(14);
  const [fare, setFare] = useState(149);

  useEffect(() => {
    if (!requestedDestination || requestedDestination === airline.hub) return;
    const airport = airportByIata(requestedDestination);
    if (!airport) return;
    setDestination(airport.iata);
    setDestinationQuery(`${airport.iata} · ${airport.city}`);
    onDestinationConsumed();
  }, [airline.hub, onDestinationConsumed, requestedDestination]);

  useEffect(() => { if (!aircraftId && freeAircraft[0]) setAircraftId(freeAircraft[0].id); }, [aircraftId, freeAircraft]);

  const selectedAircraft = airline.fleet.find((item) => item.id === aircraftId);
  const selectedType = selectedAircraft ? aircraftTypeById(selectedAircraft.typeId) : undefined;
  const distance = distanceKm(airline.hub, destination);
  const demand = estimateDailyDemand(airline.hub, destination);
  const destinationMatches = useMemo(() => airportMatches(destinationQuery, 8).filter((airport) => airport.iata !== airline.hub), [airline.hub, destinationQuery]);

  const createRoute = () => {
    if (!aircraftId) return setNotice("Select an available aircraft");
    if (!selectedType) return setNotice("Aircraft unavailable");
    if (airline.routes.some((route) => route.origin === airline.hub && route.destination === destination)) return setNotice("Route already exists");
    if (distance > selectedType.rangeKm) return setNotice("Aircraft is out of range");
    const route = { id: crypto.randomUUID(), origin: airline.hub, destination, aircraftId, weeklyFrequency: Math.max(1, Math.min(35, frequency)), economyFare: Math.max(39, fare) };
    setAirline((current) => current ? { ...current, routes: [...current.routes, route] } : current);
    setAircraftId("");
    setNotice(`${airline.hub}–${destination} opened`);
  };

  return (
    <div>
      <SectionLabel>New route</SectionLabel>
      <div className="mt-2 rounded-xl bg-white p-4 text-slate-900">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center"><AirportCode code={airline.hub} /><Plane className="h-5 w-5 rotate-90 text-slate-400" /><AirportCode code={destination} right /></div>
        <Field label="Destination"><input value={destinationQuery} onChange={(event) => setDestinationQuery(event.target.value)} className="field-clean" placeholder="Airport or city" /></Field>
        <div className="mt-1 max-h-28 overflow-y-auto border-y border-slate-200">
          {destinationMatches.map((airport) => <button key={airport.iata} type="button" onClick={() => { setDestination(airport.iata); setDestinationQuery(`${airport.iata} · ${airport.city}`); }} className="flex w-full items-center justify-between border-b border-slate-100 px-1 py-2 text-left text-xs last:border-0 hover:bg-slate-50"><span><b className="font-mono">{airport.iata}</b> · {airport.city}</span><span className="text-slate-400">{airport.country}</span></button>)}
        </div>
        <Field label="Aircraft"><select value={aircraftId} onChange={(event) => setAircraftId(event.target.value)} className="field-clean"><option value="">Select aircraft</option>{freeAircraft.map((aircraft) => <option key={aircraft.id} value={aircraft.id}>{aircraft.registration} · {aircraftTypeById(aircraft.typeId)?.model}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Flights / week"><input type="number" min="1" max="35" value={frequency} onChange={(event) => setFrequency(Number(event.target.value))} className="field-clean" /></Field><Field label="Fare"><input type="number" min="39" value={fare} onChange={(event) => setFare(Number(event.target.value))} className="field-clean" /></Field></div>
        <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200 text-sm"><DataLine label="Distance" value={`${distance.toLocaleString()} km`} /><DataLine label="Market" value={`${demand.toLocaleString()} pax/day`} /><DataLine label="Range" value={selectedType ? (distance <= selectedType.rangeKm ? "Available" : "Out of range") : "—"} valueClass={selectedType ? (distance <= selectedType.rangeKm ? "text-emerald-700" : "text-rose-700") : ""} /></div>
        <button onClick={createRoute} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-black"><Plus className="h-4 w-4" />Open route</button>
      </div>

      <SectionLabel className="mt-5">Network</SectionLabel>
      <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
        {airline.routes.length === 0 ? <EmptyState>No routes yet.</EmptyState> : airline.routes.map((route, index) => {
          const aircraft = airline.fleet.find((item) => item.id === route.aircraftId);
          const result = results.find((item) => item.routeId === route.id);
          return <button key={route.id} onClick={() => onInspectRoute(route.id)} className={`flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-white/[0.03] ${index ? "border-t border-white/8" : ""}`}><div className="min-w-0 flex-1"><div className="font-mono text-sm font-semibold">{route.origin}–{route.destination}</div><div className="mt-0.5 text-[11px] text-slate-500">{aircraft?.registration} · {route.weeklyFrequency}× weekly</div></div><div className={`font-mono text-xs ${result ? (result.profit >= 0 ? "text-emerald-400" : "text-rose-400") : "text-slate-500"}`}>{result ? money(result.profit) : "—"}</div><ChevronRight className="h-4 w-4 text-slate-600" /></button>;
        })}
      </div>
    </div>
  );
}

function StatsPanel({ airline, results }: { airline: Airline; results: RouteResult[] }) {
  const profit = results.reduce((sum, result) => sum + result.profit, 0);
  const passengers = results.reduce((sum, result) => sum + result.passengers, 0);
  const flights = results.reduce((sum, result) => sum + result.flights, 0);
  return (
    <div className="overflow-hidden rounded-xl bg-white text-slate-900">
      <StatRow icon={<CircleDollarSign />} label="Operating result" value={results.length ? money(profit) : "—"} valueClass={profit >= 0 ? "text-emerald-700" : "text-rose-700"} />
      <StatRow icon={<Users />} label="Passengers" value={passengers.toLocaleString()} />
      <StatRow icon={<Activity />} label="Flights today" value={flights.toString()} />
      <StatRow icon={<Plane />} label="Fleet" value={airline.fleet.length.toString()} />
      <StatRow icon={<RouteIcon />} label="Routes" value={airline.routes.length.toString()} />
      <StatRow icon={<MapPinned />} label="Hub" value={airline.hub} />
      <StatRow icon={<BarChart3 />} label="Reputation" value={airline.reputation.toFixed(1)} last />
    </div>
  );
}

function Onboarding({ onCreate }: { onCreate: (airline: Airline) => void }) {
  const [name, setName] = useState("Continental");
  const [code, setCode] = useState("CO");
  const [hub, setHub] = useState("PHX");
  const [hubQuery, setHubQuery] = useState("PHX");
  const hubMatches = useMemo(() => airportMatches(hubQuery, 8), [hubQuery]);
  return (
    <main className="grid min-h-screen place-items-center bg-[#11161b] p-4 text-white">
      <div className="w-full max-w-md">
        <div className="mb-7"><div className="text-xs font-semibold text-[#f5c842]">AIRLINE SIMULATOR</div><h1 className="mt-2 text-3xl font-semibold tracking-tight">Start an airline.</h1><p className="mt-2 text-sm text-slate-500">Choose a real hub and build from the map.</p></div>
        <form onSubmit={(event) => { event.preventDefault(); onCreate({ name: name.trim() || "New Airline", code: (code.trim() || "NA").slice(0, 3).toUpperCase(), hub, cash: STARTING_CASH, reputation: 50, day: 1, fleet: [], routes: [], lifetimeProfit: 0 }); }} className="rounded-2xl bg-white p-5 text-slate-900">
          <Field label="Airline name"><input value={name} onChange={(event) => setName(event.target.value)} className="field-clean" /></Field>
          <Field label="Code"><input value={code} onChange={(event) => setCode(event.target.value)} maxLength={3} className="field-clean uppercase" /></Field>
          <Field label="Hub"><input value={hubQuery} onChange={(event) => setHubQuery(event.target.value)} className="field-clean" placeholder="Airport or city" /></Field>
          <div className="mt-1 max-h-36 overflow-y-auto border-y border-slate-200">{hubMatches.map((airport) => <button type="button" key={airport.iata} onClick={() => { setHub(airport.iata); setHubQuery(`${airport.iata} · ${airport.city}`); }} className="flex w-full items-center justify-between border-b border-slate-100 py-2 text-left text-xs last:border-0 hover:bg-slate-50"><span><b className="font-mono">{airport.iata}</b> · {airport.city}</span><span className="text-slate-400">{airport.country}</span></button>)}</div>
          <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white">Launch<ChevronRight className="h-4 w-4" /></button>
        </form>
      </div>
    </main>
  );
}

function MetaItem({ icon, value, className = "" }: { icon: ReactNode; value: string; className?: string }) { return <div className={`items-center gap-2 px-2.5 text-[11px] text-slate-300 ${className}`}>{<span className="[&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-slate-500">{icon}</span>}<span className="font-medium">{value}</span></div>; }
function DockButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: ReactNode }) { return <button type="button" title={label} aria-label={label} onClick={onClick} className={`grid h-10 place-items-center rounded-lg transition [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:stroke-[1.7] ${active ? "bg-[#f5c842] text-[#11161b]" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>{children}</button>; }
function panelTitle(panel: Panel, airport?: string, route?: string) { if (panel === "fleet") return "Fleet"; if (panel === "routes") return "Routes"; if (panel === "stats") return "Performance"; if (route) return route; if (airport) return airport; return "Details"; }
function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) { return <div className={`text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 ${className}`}>{children}</div>; }
function MetricCell({ label, value, right = false }: { label: string; value: string; right?: boolean }) { return <div className={`py-3 ${right ? "border-l border-slate-200 pl-4" : "pr-4"}`}><div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-sm font-semibold">{value}</div></div>; }
function AirportCode({ code, right = false }: { code: string; right?: boolean }) { const airport = airportByIata(code); return <div className={right ? "text-right" : "text-left"}><div className="font-mono text-3xl font-bold tracking-tight">{code}</div><div className="mt-0.5 truncate text-[11px] text-slate-500">{airport?.city ?? code}</div></div>; }
function DataLine({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) { return <div className="flex items-center justify-between gap-4 py-2.5"><span className="text-slate-500">{label}</span><span className={`text-right font-medium ${valueClass}`}>{value}</span></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="mt-3 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}<div className="mt-1.5">{children}</div></label>; }
function EmptyState({ children }: { children: ReactNode }) { return <div className="px-4 py-8 text-center text-sm text-slate-500">{children}</div>; }
function StatRow({ icon, label, value, valueClass = "", last = false }: { icon: ReactNode; label: string; value: string; valueClass?: string; last?: boolean }) { return <div className={`flex items-center gap-3 px-4 py-4 ${last ? "" : "border-b border-slate-200"}`}><span className="text-slate-400 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:stroke-[1.7]">{icon}</span><span className="flex-1 text-sm text-slate-600">{label}</span><span className={`font-mono text-sm font-semibold ${valueClass}`}>{value}</span></div>; }

function airportMatches(query: string, limit: number) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return airports.slice(0, limit);
  return airports.map((airport) => {
    const iata = airport.iata.toLowerCase(); const city = airport.city.toLowerCase(); const name = airport.name.toLowerCase(); const country = airport.country.toLowerCase(); let score = 100;
    if (iata === normalized) score = 0; else if (iata.startsWith(normalized)) score = 1; else if (city === normalized) score = 2; else if (city.startsWith(normalized)) score = 3; else if (name.startsWith(normalized)) score = 4; else if (`${iata} ${city} ${name} ${country}`.includes(normalized)) score = 10;
    return { airport, score };
  }).filter((item) => item.score < 100).sort((a, b) => a.score - b.score || b.airport.demand - a.airport.demand).slice(0, limit).map((item) => item.airport);
}

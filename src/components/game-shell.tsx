"use client";

import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
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
  const [notice, setNotice] = useState("Ready for operations.");

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
    setNotice(`Day ${airline.day} complete · ${outcome.profit >= 0 ? "+" : ""}${money(outcome.profit)}`);
  };

  const openPanel = (next: Exclude<Panel, "selection" | null>) => {
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
    setNotice(`Planning ${airline.hub} → ${iata}`);
  };

  const chooseSearchAirport = (iata: string) => {
    const airport = airportByIata(iata);
    if (!airport) return;
    setSearchQuery(`${airport.iata} · ${airport.city}`);
    setSearchOpen(false);
    selectAirport(iata);
  };

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#dce5e8]">
      <NetworkMap
        airline={airline}
        results={results}
        selectedAirportCode={selectedAirportCode}
        selectedRouteId={selectedRouteId}
        onSelectAirport={selectAirport}
        onSelectRoute={selectRoute}
        showAirports={showAirports}
      />

      <header className="pointer-events-auto absolute left-4 right-4 top-4 z-[1200] flex h-16 items-center gap-3 rounded-[22px] border border-white/10 bg-[#10171d]/94 px-3 text-white shadow-[0_18px_50px_rgba(15,23,42,.26)] backdrop-blur-xl sm:px-4">
        <div className="flex min-w-0 items-center gap-3 sm:w-[245px]">
          <div className="grid h-10 min-w-10 place-items-center rounded-[13px] bg-[#f6c934] px-2.5 font-mono text-sm font-black text-[#151b20] shadow-sm">
            {airline.code}
          </div>
          <div className="hidden min-w-0 sm:block">
            <div className="truncate text-sm font-semibold">{airline.name}</div>
            <div className="mt-0.5 text-[10px] text-slate-400">Hub {airline.hub} · {airline.routes.length} routes</div>
          </div>
        </div>

        <div className="relative mx-auto flex max-w-[620px] flex-1">
          <form className="w-full" onSubmit={(event) => {
            event.preventDefault();
            if (searchMatches[0]) chooseSearchAirport(searchMatches[0].iata);
          }}>
            <div className="flex h-11 items-center rounded-[15px] bg-[#202930] px-3 ring-1 ring-white/8 transition focus-within:bg-[#253039] focus-within:ring-[#f6c934]/60">
              <SearchIcon className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={searchQuery}
                onFocus={() => setSearchOpen(true)}
                onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(true); }}
                placeholder="Search airports, cities, IATA..."
                className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm text-white outline-none placeholder:text-slate-500"
              />
              {searchQuery && (
                <button type="button" onClick={() => { setSearchQuery(""); setSearchOpen(false); }} className="grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-white/8 hover:text-white">
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </form>

          {searchOpen && searchQuery.trim() && (
            <div className="absolute left-0 right-0 top-13 overflow-hidden rounded-[18px] border border-white/10 bg-[#111920]/98 p-1.5 shadow-2xl backdrop-blur-xl">
              {searchMatches.length ? searchMatches.map((airport) => (
                <button
                  type="button"
                  key={airport.iata}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseSearchAirport(airport.iata)}
                  className="flex w-full items-center gap-3 rounded-[13px] px-3 py-2.5 text-left hover:bg-white/6"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[#f6c934] font-mono text-xs font-black text-[#161c21]">{airport.iata}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white">{airport.city}</span>
                    <span className="block truncate text-[11px] text-slate-500">{airport.name}</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-600">{airport.country}</span>
                </button>
              )) : <div className="px-4 py-5 text-center text-sm text-slate-500">No airports found.</div>}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <TopChip icon={<WalletIcon className="h-4 w-4" />} label="Cash" value={money(airline.cash)} className="hidden lg:flex" />
          <TopChip icon={<ClockIcon className="h-4 w-4" />} label="Day" value={airline.day.toString()} className="hidden md:flex" />
          <button onClick={advanceDay} className="flex h-10 items-center gap-2 rounded-[13px] bg-[#f6c934] px-3.5 text-xs font-bold text-[#151b20] shadow-sm transition hover:bg-[#ffd94f] sm:px-4">
            <span>Advance</span><ChevronIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <aside className="pointer-events-auto absolute left-4 top-[96px] z-[1100] flex w-[58px] flex-col gap-1.5 rounded-[22px] border border-white/10 bg-[#10171d]/94 p-1.5 shadow-[0_18px_45px_rgba(15,23,42,.24)] backdrop-blur-xl">
        <RailButton label="Fleet" icon={<PlaneIcon className="h-5 w-5" />} active={panel === "fleet"} onClick={() => openPanel("fleet")} />
        <RailButton label="Routes" icon={<RouteIcon className="h-5 w-5" />} active={panel === "routes"} onClick={() => openPanel("routes")} />
        <RailButton label="Performance" icon={<ChartIcon className="h-5 w-5" />} active={panel === "stats"} onClick={() => openPanel("stats")} />
        <div className="mx-2 my-0.5 h-px bg-white/8" />
        <RailButton label={showAirports ? "Hide airports" : "Show airports"} icon={<PinsIcon className="h-5 w-5" />} active={showAirports} onClick={() => setShowAirports((value) => !value)} />
      </aside>

      {panel && (
        <section className="pointer-events-auto absolute bottom-5 left-3 right-3 top-[96px] z-[1050] flex flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0d141a]/96 text-white shadow-[0_24px_80px_rgba(15,23,42,.34)] backdrop-blur-2xl sm:left-[88px] sm:right-auto sm:w-[440px]">
          <div className="flex h-14 shrink-0 items-center justify-between px-4 pl-5">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.19em] text-slate-500">{panel === "selection" ? "Details" : "Manage"}</div>
              <div className="mt-0.5 text-sm font-semibold">{panelTitle(panel, selectedAirport?.iata, selectedRoute ? `${selectedRoute.origin} → ${selectedRoute.destination}` : undefined)}</div>
            </div>
            <button onClick={closePanel} className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-white">
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {panel === "fleet" && <FleetPanel airline={airline} setAirline={setAirline} setNotice={setNotice} />}
            {panel === "routes" && (
              <RoutesPanel
                airline={airline}
                setAirline={setAirline}
                setNotice={setNotice}
                results={results}
                requestedDestination={routeDraftDestination}
                onDestinationConsumed={() => setRouteDraftDestination(null)}
                onInspectRoute={selectRoute}
              />
            )}
            {panel === "stats" && <StatsPanel airline={airline} results={results} />}
            {panel === "selection" && (
              <SelectionPanel
                airline={airline}
                results={results}
                airportCode={selectedAirportCode}
                routeId={selectedRouteId}
                onPlanRoute={planRoute}
              />
            )}
          </div>
        </section>
      )}

      <div className="pointer-events-none absolute bottom-4 left-1/2 z-[900] max-w-[65vw] -translate-x-1/2 rounded-full border border-white/40 bg-white/88 px-4 py-2 text-center text-[11px] font-semibold text-slate-700 shadow-lg backdrop-blur-xl">
        {notice}
      </div>

      <div className="pointer-events-none absolute bottom-4 right-4 z-[900] hidden items-center gap-2 rounded-full border border-white/60 bg-white/90 px-3.5 py-2 text-[10px] font-medium text-slate-700 shadow-lg backdrop-blur-xl md:flex">
        <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#f6c934]" />{airline.hub}</span>
        <span className="text-slate-300">·</span>
        <span>{weeklyFlights} flights/week</span>
        <span className="text-slate-300">·</span>
        <span className={dayProfit >= 0 ? "text-emerald-700" : "text-rose-700"}>{results.length ? money(dayProfit) : "Not simulated"}</span>
      </div>
    </main>
  );
}

function SelectionPanel({ airline, results, airportCode, routeId, onPlanRoute }: { airline: Airline; results: RouteResult[]; airportCode: string | null; routeId: string | null; onPlanRoute: (iata: string) => void }) {
  const airport = airportCode ? airportByIata(airportCode) : undefined;
  const route = routeId ? airline.routes.find((item) => item.id === routeId) : undefined;
  const result = route ? results.find((item) => item.routeId === route.id) : undefined;

  if (airport) {
    const servedRoute = airline.routes.find((item) => item.destination === airport.iata || item.origin === airport.iata);
    return (
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-[23px]">
          <MediaImage queries={[airport.name, `${airport.city} airport`]} alt={airport.name} className="h-[205px]" />
          <div className="absolute left-4 top-4 rounded-full bg-black/45 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white backdrop-blur-md">Airport</div>
          <div className="absolute bottom-4 left-4 right-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="flex items-baseline gap-2"><span className="font-mono text-4xl font-bold tracking-tight text-white">{airport.iata}</span><span className="text-xs text-white/65">{airport.icao ?? ""}</span></div>
                <div className="mt-1 max-w-[300px] text-sm font-semibold text-white">{airport.name}</div>
              </div>
              <div className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md ${servedRoute ? "bg-emerald-400/90 text-emerald-950" : "bg-white/90 text-slate-800"}`}>{servedRoute ? "Served" : "Unserved"}</div>
            </div>
          </div>
        </div>

        <div className="rounded-[23px] bg-[#f4f6f7] p-4 text-[#15202a] shadow-inner">
          <div className="flex items-start justify-between gap-4">
            <div><div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Location</div><div className="mt-1 text-sm font-semibold">{airport.city} · {airport.country}</div></div>
            <div className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm">{airport.type === "large_airport" ? "Large airport" : "Medium airport"}</div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <LightMetric label="From hub" value={airport.iata === airline.hub ? "Home base" : `${distanceKm(airline.hub, airport.iata).toLocaleString()} km`} />
            <LightMetric label="Market" value={`${estimateDailyDemand(airline.hub, airport.iata).toLocaleString()} pax/day`} />
            <LightMetric label="Network" value={servedRoute ? "Connected" : "Not served"} />
            <LightMetric label="Code" value={`${airport.iata}${airport.icao ? ` / ${airport.icao}` : ""}`} mono />
          </div>
          {airport.iata !== airline.hub && (
            <button onClick={() => onPlanRoute(airport.iata)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-[15px] bg-[#171e24] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[#222c34]">
              <RouteIcon className="h-4 w-4 text-[#f6c934]" />Plan {airline.hub} → {airport.iata}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (route) {
    const aircraft = airline.fleet.find((item) => item.id === route.aircraftId);
    const type = aircraft ? aircraftTypeById(aircraft.typeId) : undefined;
    const destination = airportByIata(route.destination);
    const routeNumber = 100 + Math.max(0, airline.routes.findIndex((item) => item.id === route.id)) * 7;
    return (
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-[23px]">
          <MediaImage
            queries={type ? [`${type.manufacturer} ${type.model}`, `${type.model} aircraft`] : [destination?.name ?? "Airliner"]}
            alt={type ? `${type.manufacturer} ${type.model}` : "Aircraft"}
            className="h-[190px]"
          />
          <div className="absolute left-4 top-4 flex items-center gap-2">
            <span className="rounded-full bg-black/50 px-3 py-1.5 font-mono text-sm font-black text-[#f6c934] backdrop-blur-md">{airline.code}{routeNumber}</span>
            {type && <span className="rounded-full bg-emerald-400/90 px-2.5 py-1.5 text-[10px] font-bold text-emerald-950">{type.model}</span>}
          </div>
          <div className="absolute bottom-4 left-4"><div className="text-sm font-semibold text-white">{airline.name}</div><div className="mt-0.5 text-[11px] text-white/65">{aircraft?.registration ?? "Aircraft"}</div></div>
        </div>

        <div className="rounded-[23px] bg-[#f4f6f7] p-4 text-[#15202a]">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-center">
            <AirportEnd code={route.origin} align="left" />
            <div className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm"><PlaneIcon className="h-5 w-5 rotate-90 text-slate-700" /></div>
            <AirportEnd code={route.destination} align="right" />
          </div>

          <div className="mt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-[#d9dde1]">
              <div className={`h-full rounded-full ${result ? (result.loadFactor >= .8 ? "bg-[#f6c934]" : result.loadFactor >= .6 ? "bg-sky-500" : "bg-rose-500") : "bg-[#f6c934]"}`} style={{ width: `${result ? Math.max(5, Math.round(result.loadFactor * 100)) : 18}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500"><span>{result ? `${result.passengers} passengers` : "Awaiting simulation"}</span><span>{result ? `${pct(result.loadFactor)} load factor` : `${route.weeklyFrequency}× weekly`}</span></div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <LightMetric label="Distance" value={`${distanceKm(route.origin, route.destination).toLocaleString()} km`} />
            <LightMetric label="Frequency" value={`${route.weeklyFrequency} / week`} />
            <LightMetric label="Economy fare" value={money(route.economyFare)} />
            <LightMetric label="Last result" value={result ? money(result.profit) : "—"} valueClass={result ? (result.profit >= 0 ? "text-emerald-700" : "text-rose-700") : ""} />
          </div>
        </div>
      </div>
    );
  }

  return <EmptyState>Select an airport or route on the map.</EmptyState>;
}

function FleetPanel({ airline, setAirline, setNotice }: { airline: Airline; setAirline: AirlineSetter; setNotice: (notice: string) => void }) {
  const lease = (typeId: string) => {
    const type = aircraftTypeById(typeId);
    if (!type) return;
    const deposit = type.monthlyLease * 2;
    if (airline.cash < deposit) return setNotice("Not enough cash for the two-month lease deposit.");
    const number = airline.fleet.length + 1;
    const aircraft = { id: crypto.randomUUID(), typeId, registration: `N${300 + number}${airline.code.slice(0, 2)}`, condition: 100 };
    setAirline((current) => current ? { ...current, cash: current.cash - deposit, fleet: [...current.fleet, aircraft] } : current);
    setNotice(`${type.model} leased · ${money(deposit)} deposit`);
  };

  return (
    <div className="space-y-5 pb-2">
      <div>
        <SectionHeading eyebrow="Aircraft market" title="Add to your fleet" />
        <div className="mt-3 space-y-2.5">
          {aircraftTypes.map((type) => (
            <div key={type.id} className="overflow-hidden rounded-[20px] bg-[#f4f6f7] text-[#15202a]">
              <div className="grid grid-cols-[110px_1fr]">
                <MediaImage queries={[`${type.manufacturer} ${type.model}`, `${type.model} aircraft`]} alt={`${type.manufacturer} ${type.model}`} className="h-full min-h-[104px]" overlay={false} />
                <div className="p-3.5">
                  <div className="flex items-start justify-between gap-2"><div><div className="text-sm font-bold">{type.manufacturer} {type.model}</div><div className="mt-1 text-[11px] text-slate-500">{type.seats} seats · {type.rangeKm.toLocaleString()} km</div></div><button onClick={() => lease(type.id)} className="rounded-full bg-[#171e24] px-3 py-1.5 text-[10px] font-bold text-white hover:bg-[#253039]">Lease</button></div>
                  <div className="mt-4 flex items-center justify-between text-[11px]"><span className="text-slate-500">Monthly</span><span className="font-mono font-bold">{money(type.monthlyLease)}</span></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionHeading eyebrow="Owned" title={`Your fleet · ${airline.fleet.length}`} />
        <div className="mt-3 space-y-2.5">
          {airline.fleet.length === 0 ? <EmptyState>No aircraft yet.</EmptyState> : airline.fleet.map((aircraft) => {
            const type = aircraftTypeById(aircraft.typeId);
            const assigned = airline.routes.find((route) => route.aircraftId === aircraft.id);
            return (
              <div key={aircraft.id} className="rounded-[19px] bg-white/6 p-3.5 ring-1 ring-white/7">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#f6c934] text-[#151b20]"><PlaneIcon className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1"><div className="font-mono text-sm font-bold">{aircraft.registration}</div><div className="mt-0.5 truncate text-xs text-slate-400">{type?.manufacturer} {type?.model}</div></div>
                  <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide ${assigned ? "bg-sky-400/12 text-sky-300" : "bg-white/6 text-slate-500"}`}>{assigned ? `${assigned.origin}–${assigned.destination}` : "Available"}</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500"><span>Condition {aircraft.condition}%</span><span>{type?.seats} seats</span></div>
              </div>
            );
          })}
        </div>
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

  useEffect(() => {
    if (!aircraftId && freeAircraft[0]) setAircraftId(freeAircraft[0].id);
  }, [aircraftId, freeAircraft]);

  const selectedAircraft = airline.fleet.find((item) => item.id === aircraftId);
  const selectedType = selectedAircraft ? aircraftTypeById(selectedAircraft.typeId) : undefined;
  const distance = distanceKm(airline.hub, destination);
  const demand = estimateDailyDemand(airline.hub, destination);
  const destinationAirport = airportByIata(destination);
  const destinationMatches = useMemo(() => airportMatches(destinationQuery, 8).filter((airport) => airport.iata !== airline.hub), [airline.hub, destinationQuery]);

  const createRoute = () => {
    if (!aircraftId) return setNotice("Lease an aircraft first, or choose an available aircraft.");
    if (!selectedType) return setNotice("Aircraft type could not be resolved.");
    if (airline.routes.some((route) => route.origin === airline.hub && route.destination === destination)) return setNotice("You already operate that route.");
    if (distance > selectedType.rangeKm) return setNotice(`${selectedType.model} does not have enough range for this route.`);
    const route = { id: crypto.randomUUID(), origin: airline.hub, destination, aircraftId, weeklyFrequency: Math.max(1, Math.min(35, frequency)), economyFare: Math.max(39, fare) };
    setAirline((current) => current ? { ...current, routes: [...current.routes, route] } : current);
    setAircraftId("");
    setNotice(`${airline.hub} → ${destination} opened · ${route.weeklyFrequency} weekly flights`);
  };

  return (
    <div className="space-y-5 pb-2">
      <div>
        <SectionHeading eyebrow="Route planner" title="Open a new market" />
        <div className="mt-3 rounded-[22px] bg-[#f4f6f7] p-4 text-[#15202a]">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <RouteEndpoint label="Origin" code={airline.hub} city={airportByIata(airline.hub)?.city ?? "Hub"} />
            <div className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm"><PlaneIcon className="h-5 w-5 rotate-90 text-slate-600" /></div>
            <RouteEndpoint label="Destination" code={destination} city={destinationAirport?.city ?? "Select"} align="right" />
          </div>

          <label className="mt-4 block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Destination</label>
          <input value={destinationQuery} onChange={(event) => setDestinationQuery(event.target.value)} placeholder="Search airport" className="mt-1.5 w-full rounded-[14px] border-0 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-[#f6c934]" />
          <div className="mt-1.5 max-h-32 overflow-y-auto rounded-[14px] bg-white p-1 shadow-sm ring-1 ring-slate-200">
            {destinationMatches.map((airport) => (
              <button type="button" key={airport.iata} onClick={() => { setDestination(airport.iata); setDestinationQuery(`${airport.iata} · ${airport.city}`); }} className={`flex w-full items-center justify-between rounded-[10px] px-2.5 py-2 text-left text-xs ${destination === airport.iata ? "bg-[#f6c934]/25 text-slate-900" : "text-slate-600 hover:bg-slate-100"}`}><span><b className="font-mono text-slate-900">{airport.iata}</b> · {airport.city}</span><span className="text-slate-400">{airport.country}</span></button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Field label="Aircraft"><select value={aircraftId} onChange={(event) => setAircraftId(event.target.value)} className="field-light"><option value="">Select</option>{freeAircraft.map((aircraft) => <option key={aircraft.id} value={aircraft.id}>{aircraft.registration} · {aircraftTypeById(aircraft.typeId)?.model}</option>)}</select></Field>
            <Field label="Flights / week"><input type="number" min="1" max="35" value={frequency} onChange={(event) => setFrequency(Number(event.target.value))} className="field-light" /></Field>
            <Field label="Economy fare"><input type="number" min="39" value={fare} onChange={(event) => setFare(Number(event.target.value))} className="field-light" /></Field>
            <LightMetric label="Market" value={`${demand.toLocaleString()} pax/day`} compact />
          </div>

          <div className="mt-3 flex items-center justify-between rounded-[14px] bg-white px-3 py-2.5 text-xs shadow-sm"><span className="text-slate-500">Range</span><span className={`font-bold ${selectedType ? (distance <= selectedType.rangeKm ? "text-emerald-700" : "text-rose-700") : "text-slate-400"}`}>{selectedType ? `${distance.toLocaleString()} / ${selectedType.rangeKm.toLocaleString()} km` : `${distance.toLocaleString()} km`}</span></div>
          <button onClick={createRoute} className="mt-3 flex w-full items-center justify-center gap-2 rounded-[15px] bg-[#171e24] px-4 py-3.5 text-sm font-bold text-white hover:bg-[#222c34]"><RouteIcon className="h-4 w-4 text-[#f6c934]" />Open route</button>
        </div>
      </div>

      <div>
        <SectionHeading eyebrow="Network" title={`Your routes · ${airline.routes.length}`} />
        <div className="mt-3 space-y-2.5">
          {airline.routes.length === 0 ? <EmptyState>No routes yet.</EmptyState> : airline.routes.map((route) => {
            const aircraft = airline.fleet.find((item) => item.id === route.aircraftId);
            const type = aircraft ? aircraftTypeById(aircraft.typeId) : undefined;
            const result = results.find((item) => item.routeId === route.id);
            const destination = airportByIata(route.destination);
            return (
              <button key={route.id} onClick={() => onInspectRoute(route.id)} className="grid w-full grid-cols-[88px_1fr] overflow-hidden rounded-[20px] bg-white text-left text-[#15202a] transition hover:-translate-y-0.5 hover:shadow-lg">
                <MediaImage queries={[destination?.name ?? route.destination, `${destination?.city ?? route.destination} airport`]} alt={destination?.name ?? route.destination} className="h-full min-h-[92px]" overlay={false} />
                <div className="p-3.5">
                  <div className="flex items-start justify-between gap-2"><div><div className="font-mono text-sm font-black">{route.origin} → {route.destination}</div><div className="mt-1 text-[11px] text-slate-500">{type?.model} · {route.weeklyFrequency}× weekly</div></div>{result && <span className={`font-mono text-[11px] font-bold ${result.profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{result.profit >= 0 ? "+" : ""}{money(result.profit)}</span>}</div>
                  <div className="mt-4 flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-400"><span>Fare {money(route.economyFare)}</span><span>{result ? `${pct(result.loadFactor)} LF` : "Not simulated"}</span></div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatsPanel({ airline, results }: { airline: Airline; results: RouteResult[] }) {
  const dayProfit = results.reduce((sum, item) => sum + item.profit, 0);
  const passengers = results.reduce((sum, item) => sum + item.passengers, 0);
  const flights = results.reduce((sum, item) => sum + item.flights, 0);
  const activeAircraft = new Set(airline.routes.map((route) => route.aircraftId)).size;
  return (
    <div className="space-y-3 pb-2">
      <div className="rounded-[23px] bg-[#f6c934] p-5 text-[#151b20]">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-60">Available cash</div>
        <div className="mt-2 font-mono text-3xl font-black tracking-tight">{money(airline.cash)}</div>
        <div className="mt-4 flex items-center justify-between text-xs"><span>Day {airline.day}</span><span className={dayProfit >= 0 ? "font-bold text-emerald-800" : "font-bold text-rose-800"}>{results.length ? `${dayProfit >= 0 ? "+" : ""}${money(dayProfit)} today` : "No simulation yet"}</span></div>
      </div>

      <div className="rounded-[23px] bg-[#f4f6f7] p-4 text-[#15202a]">
        <SectionHeading eyebrow="Operations" title="Current network" dark />
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <LightMetric label="Fleet" value={airline.fleet.length.toString()} helper={`${activeAircraft} assigned`} />
          <LightMetric label="Routes" value={airline.routes.length.toString()} helper={`${airline.routes.reduce((sum, route) => sum + route.weeklyFrequency, 0)} weekly flights`} />
          <LightMetric label="Passengers" value={passengers.toLocaleString()} helper={`${flights} flights last day`} />
          <LightMetric label="Reputation" value={airline.reputation.toFixed(1)} helper="out of 100" />
        </div>
        <div className="mt-3 rounded-[15px] bg-white p-3 shadow-sm"><DataRow light label="Lifetime result" value={money(airline.lifetimeProfit)} valueClass={airline.lifetimeProfit >= 0 ? "text-emerald-700" : "text-rose-700"} /><DataRow light label="Home base" value={airline.hub} /><DataRow light label="Mapped airports" value={airports.length.toLocaleString()} /></div>
      </div>
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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0d141a] p-4 text-white">
      <MediaImage queries={["Airport terminal", "Air transport"]} alt="Airport" className="absolute inset-0 h-full w-full opacity-35" />
      <div className="absolute inset-0 bg-[#091015]/70 backdrop-blur-[2px]" />
      <div className="relative z-10 grid w-full max-w-4xl overflow-hidden rounded-[32px] border border-white/10 bg-[#0d141a]/92 shadow-[0_30px_100px_rgba(0,0,0,.45)] backdrop-blur-2xl md:grid-cols-[1fr_390px]">
        <section className="p-7 sm:p-10">
          <div className="inline-flex rounded-full bg-[#f6c934] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#151b20]">Airline Simulator</div>
          <h1 className="mt-6 max-w-lg text-4xl font-semibold leading-[1.04] tracking-[-0.04em] sm:text-5xl">Build your airline on the map.</h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-slate-400">Choose a real airport, lease aircraft and grow a network you can actually see moving around the world.</p>
          <div className="mt-8 flex gap-2"><PillStat value={airports.length.toLocaleString()} label="airports" /><PillStat value="$25M" label="starting cash" /></div>
        </section>
        <form className="m-3 rounded-[25px] bg-[#f4f6f7] p-5 text-[#15202a] sm:p-6" onSubmit={(event) => {
          event.preventDefault();
          onCreate({ name: name.trim() || "New Airline", code: (code.trim() || "NA").slice(0, 3).toUpperCase(), hub, cash: STARTING_CASH, reputation: 50, day: 1, fleet: [], routes: [], lifetimeProfit: 0 });
        }}>
          <div className="text-lg font-bold">Create airline</div>
          <Field label="Airline name"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} className="field-light" /></Field>
          <Field label="Code"><input value={code} onChange={(event) => setCode(event.target.value)} maxLength={3} className="field-light uppercase" /></Field>
          <Field label="Starting hub"><input value={hubQuery} onChange={(event) => setHubQuery(event.target.value)} placeholder="IATA, city or airport" className="field-light" /></Field>
          <div className="mt-1.5 max-h-40 overflow-y-auto rounded-[14px] bg-white p-1 shadow-sm ring-1 ring-slate-200">
            {hubMatches.map((airport) => <button type="button" key={airport.iata} onClick={() => { setHub(airport.iata); setHubQuery(`${airport.iata} · ${airport.city}`); }} className={`flex w-full items-center justify-between rounded-[10px] px-2.5 py-2 text-left text-xs ${hub === airport.iata ? "bg-[#f6c934]/30 text-slate-900" : "text-slate-600 hover:bg-slate-100"}`}><span><b className="font-mono text-slate-900">{airport.iata}</b> · {airport.city}</span><span className="text-slate-400">{airport.country}</span></button>)}
          </div>
          <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-[15px] bg-[#171e24] px-4 py-3.5 text-sm font-bold text-white hover:bg-[#222c34]">Launch airline<ChevronIcon className="h-4 w-4" /></button>
        </form>
      </div>
    </main>
  );
}

function TopChip({ icon, label, value, className = "" }: { icon: ReactNode; label: string; value: string; className?: string }) {
  return <div className={`items-center gap-2 rounded-[13px] bg-white/5 px-3 py-2 ${className}`}><span className="text-slate-400">{icon}</span><span><span className="block text-[9px] uppercase tracking-wider text-slate-500">{label}</span><span className="block max-w-[130px] truncate font-mono text-[11px] font-bold text-white">{value}</span></span></div>;
}

function RailButton({ label, icon, active, onClick }: { label: string; icon: ReactNode; active: boolean; onClick: () => void }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} className={`grid h-[45px] place-items-center rounded-[15px] transition ${active ? "bg-[#f6c934] text-[#151b20] shadow-sm" : "text-slate-400 hover:bg-white/7 hover:text-white"}`}>{icon}</button>;
}

function panelTitle(panel: Panel, airport?: string, route?: string) {
  if (panel === "fleet") return "Fleet";
  if (panel === "routes") return "Routes";
  if (panel === "stats") return "Performance";
  if (route) return route;
  if (airport) return airport;
  return "Details";
}

function SectionHeading({ eyebrow, title, dark = false }: { eyebrow: string; title: string; dark?: boolean }) {
  return <div><div className={`text-[9px] font-bold uppercase tracking-[0.18em] ${dark ? "text-slate-400" : "text-slate-500"}`}>{eyebrow}</div><div className={`mt-0.5 text-base font-bold ${dark ? "text-slate-900" : "text-white"}`}>{title}</div></div>;
}

function LightMetric({ label, value, helper, mono = false, compact = false, valueClass = "" }: { label: string; value: string; helper?: string; mono?: boolean; compact?: boolean; valueClass?: string }) {
  return <div className={`rounded-[14px] bg-white shadow-sm ${compact ? "p-2.5" : "p-3"}`}><div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</div><div className={`mt-1 text-sm font-bold ${mono ? "font-mono" : ""} ${valueClass}`}>{value}</div>{helper && <div className="mt-0.5 text-[10px] text-slate-400">{helper}</div>}</div>;
}

function AirportEnd({ code, align }: { code: string; align: "left" | "right" }) {
  const airport = airportByIata(code);
  return <div className={align === "right" ? "text-right" : "text-left"}><div className="font-mono text-3xl font-black tracking-tight">{code}</div><div className="mt-0.5 truncate text-[11px] text-slate-500">{airport?.city ?? code}</div></div>;
}

function RouteEndpoint({ label, code, city, align = "left" }: { label: string; code: string; city: string; align?: "left" | "right" }) {
  return <div className={align === "right" ? "text-right" : "text-left"}><div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</div><div className="mt-1 font-mono text-2xl font-black">{code}</div><div className="truncate text-[10px] text-slate-500">{city}</div></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="mt-3 block text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">{label}<div className="mt-1.5">{children}</div></label>;
}

function DataRow({ label, value, valueClass = "", light = false }: { label: string; value: string; valueClass?: string; light?: boolean }) {
  return <div className={`flex items-center justify-between gap-4 border-b py-2 text-xs last:border-0 ${light ? "border-slate-100" : "border-white/6"}`}><span className={light ? "text-slate-400" : "text-slate-500"}>{label}</span><span className={`text-right font-semibold ${valueClass}`}>{value}</span></div>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-[18px] border border-dashed border-white/12 px-4 py-8 text-center text-sm text-slate-500">{children}</div>;
}

function PillStat({ value, label }: { value: string; label: string }) {
  return <div className="rounded-full bg-white/7 px-4 py-2 text-xs"><b className="font-mono text-white">{value}</b><span className="ml-2 text-slate-500">{label}</span></div>;
}

function airportMatches(query: string, limit: number) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return airports.slice(0, limit);
  return airports
    .map((airport) => {
      const iata = airport.iata.toLowerCase();
      const city = airport.city.toLowerCase();
      const name = airport.name.toLowerCase();
      const country = airport.country.toLowerCase();
      let score = 100;
      if (iata === normalized) score = 0;
      else if (iata.startsWith(normalized)) score = 1;
      else if (city === normalized) score = 2;
      else if (city.startsWith(normalized)) score = 3;
      else if (name.startsWith(normalized)) score = 4;
      else if (`${iata} ${city} ${name} ${country}`.includes(normalized)) score = 10;
      return { airport, score };
    })
    .filter((item) => item.score < 100)
    .sort((a, b) => a.score - b.score || b.airport.demand - a.airport.demand)
    .slice(0, limit)
    .map((item) => item.airport);
}

function SearchIcon({ className = "" }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.2 4.2"/></svg>; }
function XIcon({ className = "" }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>; }
function PlaneIcon({ className = "" }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2.5 1.5V22l4-1 4 1v-1.5L13 19v-5.5L21 16Z"/></svg>; }
function RouteIcon({ className = "" }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="17" r="2.5"/><circle cx="19" cy="7" r="2.5"/><path d="M7.5 17h2.3c4.1 0 4.2-10 8-10"/><path d="m15.5 4.5 2.5 2.5-2.5 2.5"/></svg>; }
function ChartIcon({ className = "" }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>; }
function PinsIcon({ className = "" }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></svg>; }
function WalletIcon({ className = "" }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6.5h14a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/><path d="M16 12h4"/></svg>; }
function ClockIcon({ className = "" }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>; }
function ChevronIcon({ className = "" }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6"/></svg>; }

import { generatedAirports } from "./generated-airports";
import type { AircraftType } from "./types";

export const airports = generatedAirports;

export const aircraftTypes: AircraftType[] = [
  { id: "e190", manufacturer: "Embraer", model: "E190", seats: 100, rangeKm: 4537, cruiseKmh: 829, monthlyLease: 185000, fuelCostPerKm: 2.2, maintenancePerFlight: 950 },
  { id: "a320", manufacturer: "Airbus", model: "A320-200", seats: 150, rangeKm: 6100, cruiseKmh: 828, monthlyLease: 265000, fuelCostPerKm: 2.65, maintenancePerFlight: 1250 },
  { id: "a321neo", manufacturer: "Airbus", model: "A321neo", seats: 190, rangeKm: 7400, cruiseKmh: 833, monthlyLease: 405000, fuelCostPerKm: 2.75, maintenancePerFlight: 1450 },
  { id: "b738", manufacturer: "Boeing", model: "737-800", seats: 162, rangeKm: 5765, cruiseKmh: 842, monthlyLease: 285000, fuelCostPerKm: 2.75, maintenancePerFlight: 1320 },
  { id: "b789", manufacturer: "Boeing", model: "787-9", seats: 285, rangeKm: 14010, cruiseKmh: 903, monthlyLease: 895000, fuelCostPerKm: 4.9, maintenancePerFlight: 3800 },
];

const airportIndex = new Map(airports.map((airport) => [airport.iata.toUpperCase(), airport]));
const aircraftTypeIndex = new Map(aircraftTypes.map((type) => [type.id, type]));

export const airportByIata = (iata: string) => airportIndex.get(iata.toUpperCase());
export const aircraftTypeById = (id: string) => aircraftTypeIndex.get(id);

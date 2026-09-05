import type { AircraftType, Airport } from "./types";

export const airports: Airport[] = [
  { iata: "PHX", city: "Phoenix", name: "Phoenix Sky Harbor", country: "USA", lat: 33.4342, lon: -112.0116, demand: 88 },
  { iata: "LAX", city: "Los Angeles", name: "Los Angeles International", country: "USA", lat: 33.9416, lon: -118.4085, demand: 100 },
  { iata: "LAS", city: "Las Vegas", name: "Harry Reid International", country: "USA", lat: 36.084, lon: -115.1537, demand: 82 },
  { iata: "SAN", city: "San Diego", name: "San Diego International", country: "USA", lat: 32.7338, lon: -117.1933, demand: 75 },
  { iata: "SFO", city: "San Francisco", name: "San Francisco International", country: "USA", lat: 37.6213, lon: -122.379, demand: 92 },
  { iata: "SEA", city: "Seattle", name: "Seattle-Tacoma International", country: "USA", lat: 47.4502, lon: -122.3088, demand: 88 },
  { iata: "DEN", city: "Denver", name: "Denver International", country: "USA", lat: 39.8561, lon: -104.6737, demand: 94 },
  { iata: "DFW", city: "Dallas", name: "Dallas Fort Worth International", country: "USA", lat: 32.8998, lon: -97.0403, demand: 98 },
  { iata: "ORD", city: "Chicago", name: "O'Hare International", country: "USA", lat: 41.9742, lon: -87.9073, demand: 100 },
  { iata: "JFK", city: "New York", name: "John F. Kennedy International", country: "USA", lat: 40.6413, lon: -73.7781, demand: 100 },
  { iata: "ATL", city: "Atlanta", name: "Hartsfield-Jackson Atlanta International", country: "USA", lat: 33.6407, lon: -84.4277, demand: 100 },
  { iata: "MIA", city: "Miami", name: "Miami International", country: "USA", lat: 25.7959, lon: -80.287, demand: 92 },
];

export const aircraftTypes: AircraftType[] = [
  { id: "e190", manufacturer: "Embraer", model: "E190", seats: 100, rangeKm: 4537, cruiseKmh: 829, monthlyLease: 185000, fuelCostPerKm: 2.2, maintenancePerFlight: 950 },
  { id: "a320", manufacturer: "Airbus", model: "A320-200", seats: 150, rangeKm: 6100, cruiseKmh: 828, monthlyLease: 265000, fuelCostPerKm: 2.65, maintenancePerFlight: 1250 },
  { id: "a321neo", manufacturer: "Airbus", model: "A321neo", seats: 190, rangeKm: 7400, cruiseKmh: 833, monthlyLease: 405000, fuelCostPerKm: 2.75, maintenancePerFlight: 1450 },
  { id: "b738", manufacturer: "Boeing", model: "737-800", seats: 162, rangeKm: 5765, cruiseKmh: 842, monthlyLease: 285000, fuelCostPerKm: 2.75, maintenancePerFlight: 1320 },
  { id: "b789", manufacturer: "Boeing", model: "787-9", seats: 285, rangeKm: 14010, cruiseKmh: 903, monthlyLease: 895000, fuelCostPerKm: 4.9, maintenancePerFlight: 3800 },
];

export const airportByIata = (iata: string) => airports.find((airport) => airport.iata === iata);
export const aircraftTypeById = (id: string) => aircraftTypes.find((type) => type.id === id);

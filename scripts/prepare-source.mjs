import { readFile, writeFile } from "node:fs/promises";

const NETWORK_MAP = new URL("../src/components/network-map.tsx", import.meta.url);

const source = await readFile(NETWORK_MAP, "utf8");
const oldOption = "attributionControl: true,";
const newOption = "attributionControl: { compact: true },";

if (source.includes(oldOption)) {
  await writeFile(NETWORK_MAP, source.replace(oldOption, newOption), "utf8");
  console.log("[prepare] Updated MapLibre attributionControl option for v5 typings.");
} else if (source.includes(newOption)) {
  console.log("[prepare] MapLibre attributionControl option already compatible.");
} else {
  throw new Error("Could not locate MapLibre attributionControl option in network-map.tsx");
}

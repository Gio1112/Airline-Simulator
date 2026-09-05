import { readFile, writeFile } from "node:fs/promises";

const NETWORK_MAP = new URL("../src/components/network-map.tsx", import.meta.url);

let source = await readFile(NETWORK_MAP, "utf8");
let changed = false;

const replaceOnce = (oldValue, newValue, label) => {
  if (source.includes(oldValue)) {
    source = source.replace(oldValue, newValue);
    changed = true;
    console.log(`[prepare] ${label}`);
    return;
  }
  if (source.includes(newValue)) {
    console.log(`[prepare] ${label} already applied.`);
    return;
  }
  throw new Error(`Could not locate source for: ${label}`);
};

replaceOnce(
  "attributionControl: true,",
  "attributionControl: { compact: true },",
  "Updated MapLibre attributionControl option for v5 typings."
);

const oldStyle = 'const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";';
const newStyle = `const MAP_STYLE: any = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO"
    }
  },
  layers: [
    {
      id: "carto-basemap",
      type: "raster",
      source: "carto",
      minzoom: 0,
      maxzoom: 20
    }
  ]
};`;

replaceOnce(
  oldStyle,
  newStyle,
  "Replaced OpenFreeMap vector style with CARTO raster basemap + MapLibre glyphs."
);

replaceOnce(
  "OpenFreeMap basemap",
  "CARTO basemap",
  "Updated map provider label."
);

if (changed) {
  await writeFile(NETWORK_MAP, source, "utf8");
  console.log("[prepare] Network map source prepared successfully.");
} else {
  console.log("[prepare] Network map source already prepared.");
}

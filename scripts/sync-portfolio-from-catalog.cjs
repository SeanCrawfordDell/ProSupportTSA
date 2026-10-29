#!/usr/bin/env node
"use strict";
// Refreshes the fallback copy in js/portfolio-data.js from the ISG Tools Catalog's tools.json.
//   node scripts/sync-portfolio-from-catalog.cjs path/to/ISGToolsCatalog/src/data/tools.json [today YYYY-MM-DD]
// The Tool Portfolio normally reads the catalog live (../ISGToolsCatalog/tools.json on the same Pages host), so this
// copy is only shown when the live catalog cannot be reached, for example in a local preview.
const fs = require("node:fs"), path = require("node:path");
const fields = ["id", "name", "category", "description", "owner", "status", "progress", "operatingSystem"];
const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

function build(catalog, today) {
  const list = Array.isArray(catalog) ? catalog : catalog?.tools;
  if (!Array.isArray(list)) throw new Error("Not an ISG Tools Catalog file");
  return {
    source: "ISG Tools Catalog",
    sourceUrl: "https://seancrawforddell.github.io/ISGToolsCatalog/",
    liveUrl: "../ISGToolsCatalog/tools.json",
    snapshotDate: today,
    tools: list.map(tool => Object.fromEntries(fields.filter(key => tool[key] !== undefined).map(key => [key, tool[key]])))
  };
}

function render(data) {
  return `"use strict";
// Tool Portfolio settings and fallback copy of the ISG Tools Catalog.
// The page reads liveUrl (the catalog's own tools.json, published next to the catalog site) every time it opens, so
// owners, statuses and tools follow the catalog automatically. The tools below are shown only when that file cannot be
// reached. Refresh them with scripts/sync-portfolio-from-catalog.cjs instead of editing by hand.
const PortfolioData = ${JSON.stringify(data, null, 2)};
if (typeof window !== "undefined") window.PortfolioData = PortfolioData;
if (typeof module !== "undefined") module.exports = PortfolioData;
`;
}

if (require.main === module) {
  const [source, todayArg] = process.argv.slice(2);
  if (!source) { console.error("Usage: node scripts/sync-portfolio-from-catalog.cjs <tools.json> [YYYY-MM-DD]"); process.exit(1); }
  const today = isDate(todayArg) ? todayArg : new Date().toISOString().slice(0, 10);
  const data = build(JSON.parse(fs.readFileSync(source, "utf8")), today);
  fs.writeFileSync(path.join(__dirname, "..", "js", "portfolio-data.js"), render(data));
  console.log(`Wrote ${data.tools.length} tools to js/portfolio-data.js`);
}
module.exports = { build, render };

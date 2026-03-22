// pretty rad generated script to 
// grab all of the key value pairs of scale name : note values
// from some_scales.xlsx spreadsheet and then write them to a .js file to be able to be used right away 
import XLSX from "xlsx";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = join(__dirname, "..");
const inputPath = join(projectRoot, "some_scales.xlsx");
const outputPath = join(projectRoot, "src", "lib", "scales.js");

// Parse "Integer notation" string: "(0,2,4,6,7,9,10)" or "0,2,4,6,7,9,10" etc.
function parseIntegerNotation(str) {
  if (str == null || typeof str !== "string") return null;
  const cleaned = str.replace(/[()]/g, "").trim();
  if (!cleaned) return null;
  const nums = cleaned
    .split(/[,\s]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
  return nums.length > 0 ? nums : null;
}

// Add 48 to each value
function add48(values) {
  return values.map((n) => n + 48);
}

// Find column value - try multiple possible header names
function getColumn(row, names) {
  for (const name of names) {
    if (row[name] != null && row[name] !== "") return row[name];
  }
  return null;
}

const workbook = XLSX.readFile(inputPath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet);

const SCALES = {};
let skipped = 0;

for (const row of rows) {
  const name = getColumn(row, ["Name", "name", "Scale Name", "Scale"]);
  const intNotation = getColumn(row, [
    "Integer notation",
    "Integer Notation",
    "integer notation",
  ]);

  if (!name || !intNotation) {
    skipped++;
    continue;
  }

  const values = parseIntegerNotation(
    typeof intNotation === "number" ? String(intNotation) : intNotation
  );
  if (!values) {
    skipped++;
    continue;
  }

  SCALES[name] = add48(values);
}

const lines = [
  "// Generated from some_scales.xlsx - Integer notation + 48",
  "",
  "export const SCALES = {",
  ...Object.entries(SCALES).map(
    ([name, notes]) =>
      `  ${JSON.stringify(name)}: [${notes.join(", ")}],`
  ),
  "};",
  "",
];

writeFileSync(outputPath, lines.join("\n"), "utf8");

console.log(`Generated ${outputPath} with ${Object.keys(SCALES).length} scales.`);
if (skipped > 0) {
  console.log(`Skipped ${skipped} rows.`);
}

export const SAMPLE_STOCKS = [
  { name: "SAMPLE01", file: "data/sample01.csv" },
  { name: "SAMPLE02", file: "data/sample02.csv" },
  { name: "SAMPLE03", file: "data/sample03.csv" },
  { name: "SAMPLE04", file: "data/sample04.csv" },
  { name: "SAMPLE05", file: "data/sample05.csv" },
];

export function parseCsv(source) {
  return new Promise((resolve, reject) => {
    window.Papa.parse(source, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: reject,
    });
  });
}

export function normalizeCandles(rows) {
  const parsed = rows
    .filter(
      (row) =>
        row.published_date &&
        row.open != null &&
        row.high != null &&
        row.low != null &&
        row.close != null,
    )
    .map((row) => ({
      time: String(row.published_date).trim(),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: row.traded_quantity != null ? Number(row.traded_quantity) : 0,
    }))
    .filter((candle) =>
      [candle.open, candle.high, candle.low, candle.close, candle.volume].every(
        Number.isFinite,
      ),
    )
    .sort((a, b) => a.time.localeCompare(b.time));

  const seen = new Set();
  return parsed.filter((candle) => {
    if (seen.has(candle.time)) return false;
    seen.add(candle.time);
    return true;
  });
}

export async function fetchStock(stock) {
  const response = await fetch(stock.file, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${stock.file}`);
  return parseCsv(await response.text());
}

const LAST_STOCK_KEY = "chartlab.lastStock.v1";
const CUSTOM_INDICATORS_KEY = "chartlab.customIndicators.v1";
const THEME_KEY = "chartlab.theme.v1";

export function getLastStock() {
  return localStorage.getItem(LAST_STOCK_KEY) || "SAMPLE01";
}

export function setLastStock(name) {
  localStorage.setItem(LAST_STOCK_KEY, name);
}

export function getTheme() {
  return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
}

export function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
}

export function loadCustomIndicators() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_INDICATORS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

export function saveCustomIndicators(indicators) {
  localStorage.setItem(CUSTOM_INDICATORS_KEY, JSON.stringify(indicators));
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function readJsonFile(file, maxBytes = 1024 * 1024) {
  if (file.size > maxBytes) throw new Error("File is too large.");
  return JSON.parse(await file.text());
}

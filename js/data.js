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

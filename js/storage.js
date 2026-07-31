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

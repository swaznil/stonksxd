import { ChartController, INDICATOR_PARAMS } from "./chart.js";
import {
  SAMPLE_STOCKS,
  fetchStock,
  normalizeCandles,
  parseCsv,
} from "./data.js";
import { PRESET_INDICATORS, normalizeImportedIndicator } from "./indicators.js";
import {
  downloadJson,
  getLastStock,
  getTheme,
  loadCustomIndicators,
  readJsonFile,
  saveCustomIndicators,
  setLastStock,
  setTheme,
} from "./storage.js";

const elements = {
  chart: document.getElementById("main-chart"),
  drawingToolbar: document.getElementById("drawing-toolbar"),
  indicatorList: document.getElementById("indicator-list"),
  fileInput: document.getElementById("csv-input"),
  fileName: document.getElementById("file-name"),
  stockModal: document.getElementById("stock-modal-backdrop"),
  stockButton: document.getElementById("stock-selector-btn"),
  stockSearch: document.getElementById("stock-search-input"),
  stockList: document.getElementById("stock-list"),
  stockLabel: document.getElementById("stock-current-label"),
  themeToggle: document.getElementById("theme-toggle"),
};

let chartController;
let customIndicators = loadCustomIndicators()
  .map(normalizeImportedIndicator)
  .filter(Boolean);
let customVariables = [];
let currentTheme = getTheme();
let activeModal = null;
let modalStack = [];

function setStatus(message) {
  const status = document.getElementById("status-msg");
  if (status) status.textContent = message;
}

function focusableElements(root) {
  return Array.from(
    root.querySelectorAll(
      "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ),
  ).filter((element) => element.offsetParent !== null);
}

function openModal(modal, preferredFocus) {
  if (!modal) return;
  modalStack = modalStack.filter((entry) => entry.modal !== modal);
  modalStack.push({ modal, returnFocus: document.activeElement });
  activeModal = modal;
  modal.hidden = false;
  (preferredFocus || focusableElements(modal)[0])?.focus();
}

function closeModal(modal) {
  if (!modal) return;
  modal.hidden = true;
  const index = modalStack.findIndex((entry) => entry.modal === modal);
  const entry = index >= 0 ? modalStack.splice(index, 1)[0] : null;
  activeModal = modalStack.at(-1)?.modal || null;
  entry?.returnFocus?.focus?.();
}

function showLoadedData(candles, label) {
  if (!candles.length) {
    setStatus("No valid rows found in file.");
    return false;
  }
  chartController.setData(candles);
  document.getElementById("series-title").textContent = label;
  document.getElementById("stat-rows").textContent = candles.length;
  document.getElementById("stat-start").textContent = candles[0].time;
  document.getElementById("stat-end").textContent = candles.at(-1).time;
  document.getElementById("stat-close").textContent = candles
    .at(-1)
    .close.toFixed(2);
  setStatus(`Loaded ${candles.length} rows.`);
  return true;
}

async function loadStockByName(name) {
  const stock = SAMPLE_STOCKS.find(
    (item) => item.name.toLowerCase() === String(name).toLowerCase(),
  );
  if (!stock) {
    setStatus(`Unknown stock: ${name}`);
    return;
  }
  setStatus(`Loading ${stock.name}...`);
  try {
    const candles = normalizeCandles(await fetchStock(stock));
    if (showLoadedData(candles, stock.name)) {
      setLastStock(stock.name);
      elements.stockLabel.textContent = stock.name;
    }
  } catch (error) {
    setStatus(error.message);
  }
}

function renderStockList() {
  const query = elements.stockSearch.value.trim().toLowerCase();
  const stocks = SAMPLE_STOCKS.filter((stock) =>
    stock.name.toLowerCase().includes(query),
  );
  elements.stockList.replaceChildren();
  if (!stocks.length) {
    const empty = document.createElement("div");
    empty.className = "stock-empty";
    empty.textContent = "No matches.";
    elements.stockList.appendChild(empty);
    return;
  }
  stocks.forEach((stock) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "stock-row";
    const name = document.createElement("span");
    name.textContent = stock.name;
    const file = document.createElement("span");
    file.className = "stock-file";
    file.textContent = stock.file;
    row.append(name, file);
    row.addEventListener("click", async () => {
      await loadStockByName(stock.name);
      closeModal(elements.stockModal);
    });
    elements.stockList.appendChild(row);
  });
}

function renderParamFields() {
  const type = document.getElementById("ind-type").value;
  const container = document.getElementById("param-fields");
  container.replaceChildren();
  INDICATOR_PARAMS[type].forEach((param) => {
    const label = document.createElement("label");
    label.textContent = param.label;
    label.htmlFor = `param-${param.id}`;
    const input = document.createElement("input");
    input.type = "number";
    input.id = `param-${param.id}`;
    input.value = param.default;
    input.step = "any";
    container.append(label, input);
  });
}

function renderVariableInsertOptions() {
  const select = document.getElementById("insert-variable");
  select.replaceChildren(new Option("Choose variable", ""));
  customVariables.forEach((variable) => {
    select.add(new Option(variable.name, variable.name));
  });
}

function editVariable(name) {
  const variable = customVariables.find((item) => item.name === name);
  if (!variable) return;
  document.getElementById("variable-name").value = variable.name;
  const formulaInput = document.getElementById("variable-formula");
  formulaInput.value = variable.formula;
  formulaInput.focus();
}

function removeVariable(name) {
  customVariables = customVariables.filter((item) => item.name !== name);
  renderVariableList();
}

function renderVariableList() {
  const list = document.getElementById("variable-list");
  list.replaceChildren();
  renderVariableInsertOptions();
  if (!customVariables.length) {
    const item = document.createElement("li");
    item.className = "empty-note";
    item.textContent = "No variables added.";
    list.appendChild(item);
    return;
  }
  customVariables.forEach((variable) => {
    const item = document.createElement("li");
    const text = document.createElement("span");
    text.className = "variable-token";
    text.textContent = `${variable.name} = ${variable.formula}`;
    const actions = document.createElement("span");
    actions.className = "variable-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => editVariable(variable.name));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => removeVariable(variable.name));
    actions.append(edit, remove);
    item.append(text, actions);
    list.appendChild(item);
  });
}

function addVariableFromForm() {
  const name = document
    .getElementById("variable-name")
    .value.trim()
    .toUpperCase();
  const formula = document.getElementById("variable-formula").value.trim();
  if (!/^[A-Z]$/.test(name)) {
    setStatus("Variable must be A through Z.");
    return;
  }
  if (!formula) {
    setStatus(`Enter a formula for variable ${name}.`);
    return;
  }
  customVariables = customVariables
    .filter((item) => item.name !== name)
    .concat({ name, formula })
    .sort((a, b) => a.name.localeCompare(b.name));
  document.getElementById("variable-formula").value = "";
  renderVariableList();
}

function insertFormulaSnippet(snippet) {
  if (!snippet) return;
  const input = document.getElementById(
    document.getElementById("insert-target").value,
  );
  if (!input) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + snippet + input.value.slice(end);
  const cursor = snippet === "()" ? start + 1 : start + snippet.length;
  input.focus();
  input.setSelectionRange(cursor, cursor);
}

function renderPresetOptions() {
  const select = document.getElementById("preset-select");
  select.replaceChildren(new Option("Start from scratch...", ""));
  PRESET_INDICATORS.forEach((preset, index) => {
    select.add(new Option(preset.name, String(index)));
  });
}

function applyPreset(index) {
  const preset = PRESET_INDICATORS[index];
  if (!preset) return;
  document.getElementById("custom-name").value = preset.name;
  document.getElementById("custom-formula").value = preset.formula;
  document.getElementById("custom-panel").value = preset.panel;
  document.getElementById("custom-draw").value = preset.draw;
  document.getElementById("custom-color").value = preset.color;
  document.getElementById("custom-width").value = preset.width;
  customVariables = preset.variables.map((variable) => ({ ...variable }));
  renderVariableList();
}

function readCustomForm() {
  return {
    name: document.getElementById("custom-name").value.trim(),
    formula: document.getElementById("custom-formula").value.trim(),
    panel: document.getElementById("custom-panel").value,
    draw: document.getElementById("custom-draw").value,
    color: document.getElementById("custom-color").value,
    width: Number(document.getElementById("custom-width").value) || 2,
    variables: customVariables.map((item) => ({ ...item })),
  };
}

function saveCustomIndicator(definition) {
  const normalized = normalizeImportedIndicator(definition);
  if (!normalized) {
    setStatus(
      "Custom indicator is invalid. Check name, formula, variables, color, and width.",
    );
    return false;
  }
  customIndicators = [
    normalized,
    ...customIndicators.filter(
      (item) =>
        item.name !== normalized.name || item.formula !== normalized.formula,
    ),
  ].slice(0, 20);
  saveCustomIndicators(customIndicators);
  renderCustomOptions();
  return true;
}

function renderCustomOptions() {
  const list = document.getElementById("saved-custom-list");
  list.replaceChildren();
  if (!customIndicators.length) {
    const item = document.createElement("li");
    item.className = "empty-note";
    item.textContent = "No saved indicators.";
    list.appendChild(item);
    return;
  }
  customIndicators.forEach((definition) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = definition.name;
    const actions = document.createElement("div");
    actions.className = "saved-indicator-actions";
    const use = document.createElement("button");
    use.textContent = "Use";
    use.addEventListener("click", () => {
      if (!chartController.hasData()) {
        setStatus("Load a CSV first.");
        return;
      }
      chartController.addIndicator("custom", definition);
    });
    const remove = document.createElement("button");
    remove.textContent = "Delete";
    remove.addEventListener("click", () => {
      customIndicators = customIndicators.filter(
        (item) =>
          item.name !== definition.name || item.formula !== definition.formula,
      );
      saveCustomIndicators(customIndicators);
      renderCustomOptions();
    });
    actions.append(use, remove);
    item.append(name, actions);
    list.appendChild(item);
  });
}

function openCustomModal() {
  customVariables = [];
  renderVariableList();
  renderPresetOptions();
  document.getElementById("preset-select").value = "";
  openModal(
    document.getElementById("custom-modal"),
    document.getElementById("custom-formula"),
  );
}

function closeCustomModal() {
  closeModal(document.getElementById("custom-modal"));
  document.getElementById("ind-type").value = "sma";
  renderParamFields();
}

function applyTheme(theme) {
  currentTheme = theme;
  const light = theme === "light";
  document.documentElement.dataset.theme = theme;
  setTheme(theme);
  elements.themeToggle.textContent = light ? "☾ Dark" : "☀ Light";
  elements.themeToggle.setAttribute(
    "aria-label",
    light ? "Switch to dark theme" : "Switch to light theme",
  );
  chartController?.applyTheme(theme);
}

async function importIndicators(file) {
  try {
    const parsed = await readJsonFile(file);
    const input = Array.isArray(parsed) ? parsed : [parsed];
    const valid = input.map(normalizeImportedIndicator).filter(Boolean);
    if (!valid.length) {
      setStatus("No valid indicators found in that file.");
      return;
    }
    const seen = new Set();
    customIndicators = [...valid, ...customIndicators]
      .filter((definition) => {
        const key = `${definition.name}::${definition.formula}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 50);
    saveCustomIndicators(customIndicators);
    renderCustomOptions();
    setStatus(`Imported ${valid.length} indicator(s).`);
  } catch (error) {
    setStatus(`Import error: ${error.message}`);
  }
}

function setupModalKeyboardNavigation() {
  window.addEventListener("keydown", (event) => {
    if (!activeModal) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (activeModal === elements.stockModal) closeModal(elements.stockModal);
      else if (activeModal.id === "custom-modal") closeCustomModal();
      else closeModal(activeModal);
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusableElements(activeModal);
    if (!items.length) return;
    const [first] = items;
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function setupStockControls() {
  elements.stockButton.addEventListener("click", (event) => {
    event.preventDefault();
    elements.stockSearch.value = "";
    renderStockList();
    openModal(elements.stockModal, elements.stockSearch);
  });
  document
    .getElementById("stock-close-btn")
    .addEventListener("click", () => closeModal(elements.stockModal));
  elements.stockModal.addEventListener("click", (event) => {
    if (event.target === elements.stockModal) closeModal(elements.stockModal);
  });
  elements.stockSearch.addEventListener("input", renderStockList);
}

function setupIndicatorControls() {
  document
    .getElementById("ind-type")
    .addEventListener("change", renderParamFields);
  document
    .getElementById("indicator-form")
    .addEventListener("submit", (event) => {
      event.preventDefault();
      if (!chartController.hasData()) {
        setStatus("Load a CSV before adding indicators.");
        return;
      }
      const type = document.getElementById("ind-type").value;
      const params = Object.fromEntries(
        INDICATOR_PARAMS[type].map((param) => [
          param.id,
          Number(document.getElementById(`param-${param.id}`).value),
        ]),
      );
      chartController.addIndicator(type, params);
    });
  renderParamFields();
}

function setupCustomIndicatorControls() {
  const modal = document.getElementById("custom-modal");
  document
    .getElementById("new-custom-btn")
    .addEventListener("click", openCustomModal);
  document
    .getElementById("custom-close")
    .addEventListener("click", closeCustomModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeCustomModal();
  });
  document
    .getElementById("preset-select")
    .addEventListener("change", (event) => {
      if (event.target.value !== "") applyPreset(Number(event.target.value));
    });
  document
    .getElementById("add-variable-btn")
    .addEventListener("click", addVariableFromForm);
  document
    .getElementById("variable-formula")
    .addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addVariableFromForm();
      }
    });
  document.querySelectorAll("[data-insert-select]").forEach((select) => {
    select.addEventListener("change", () => {
      insertFormulaSnippet(select.value);
      select.value = "";
    });
  });
  document.getElementById("custom-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!chartController.hasData()) {
      setStatus("Load a CSV before adding indicators.");
      return;
    }
    const definition = normalizeImportedIndicator(readCustomForm());
    if (!definition) {
      setStatus(
        "Custom indicator is invalid. Check name, formula, variables, color, and width.",
      );
      return;
    }
    if (
      document.getElementById("custom-save").checked &&
      !saveCustomIndicator(definition)
    ) {
      return;
    }
    if (chartController.addIndicator("custom", definition)) closeCustomModal();
  });
  document.getElementById("export-custom-btn").addEventListener("click", () => {
    if (!customIndicators.length) {
      setStatus("No saved custom indicators to export.");
      return;
    }
    downloadJson("stonksxd-custom-indicators.json", customIndicators);
    setStatus(`Exported ${customIndicators.length} custom indicator(s).`);
  });
  document
    .getElementById("import-custom-input")
    .addEventListener("change", async (event) => {
      const [file] = event.target.files;
      if (file) await importIndicators(file);
      event.target.value = "";
    });
}

function setupFormulaHelp() {
  const modal = document.getElementById("formula-modal");
  document
    .getElementById("formula-help-btn")
    .addEventListener("click", () => openModal(modal));
  document
    .getElementById("formula-close")
    .addEventListener("click", () => closeModal(modal));
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal(modal);
  });
}

function setupFileInput() {
  elements.fileInput.addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    elements.fileName.textContent = file.name;
    try {
      const candles = normalizeCandles(await parseCsv(file));
      showLoadedData(candles, file.name.replace(/\.csv$/i, ""));
    } catch (error) {
      setStatus(`Parse error: ${error.message}`);
    }
  });
}

export function initApp() {
  if (!window.Papa || !window.LightweightCharts) {
    setStatus("Startup error: required chart libraries were not loaded.");
    return;
  }
  chartController = new ChartController({
    mountElement: elements.chart,
    toolbarElement: elements.drawingToolbar,
    indicatorListElement: elements.indicatorList,
    setStatus,
  });
  chartController.initialize();
  setupModalKeyboardNavigation();
  setupStockControls();
  setupIndicatorControls();
  setupCustomIndicatorControls();
  setupFormulaHelp();
  setupFileInput();
  renderCustomOptions();
  elements.themeToggle.addEventListener("click", () =>
    applyTheme(currentTheme === "light" ? "dark" : "light"),
  );
  applyTheme(currentTheme);
  const lastStock = getLastStock();
  elements.stockLabel.textContent = lastStock;
  loadStockByName(lastStock);
}

initApp();

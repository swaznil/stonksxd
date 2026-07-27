const COLORS = [
  "#3179f5",
  "#e0a537",
  "#7e57c2",
  "#42a5f5",
  "#8d6e63",
  "#5c6bc0",
  "#26c6da",
];

const DUMMY_STOCKS = [
  { name: "SAMPLE01", file: "data/sample01.csv" },
  { name: "SAMPLE02", file: "data/sample02.csv" },
  { name: "SAMPLE03", file: "data/sample03.csv" },
  { name: "SAMPLE04", file: "data/sample04.csv" },
  { name: "SAMPLE05", file: "data/sample05.csv" },
];

const LAST_STOCK_KEY = "chartlab.lastStock.v1";
const CUSTOM_KEY = "chartlab.customIndicators.v1";
const DEFAULT_PANE_HEIGHT = 160;

let colorIndex = 0;
function nextColor() {
  const c = COLORS[colorIndex % COLORS.length];
  colorIndex++;
  return c;
}

const {
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  AreaSeries,
  CrosshairMode,
  LineStyle,
} = LightweightCharts;

const CHART_OPTIONS = {
  layout: {
    background: { color: "#131722" },
    textColor: "#d1d4dc",
    fontFamily: "IBM Plex Mono, monospace",
    panes: {
      separatorColor: "#363a4a",
      separatorHoverColor: "rgba(44, 126, 249, 0.15)",
      enableResize: true,
    },
  },
  grid: {
    vertLines: { color: "#1c2030" },
    horzLines: { color: "#1c2030" },
  },
  rightPriceScale: { borderColor: "#363a4a" },
  timeScale: { borderColor: "#363a4a" },
  autoSize: true,
  crosshair: {
    mode: CrosshairMode.Normal,
    vertLine: { color: "#3179f5", labelBackgroundColor: "#3179f5" },
    horzLine: { color: "#3179f5", labelBackgroundColor: "#3179f5" },
  },
};

let candles = [];
let chart = null;
let candleSeries = null;
let indicators = [];
let indicatorSeq = 0;
let customIndicators = loadCustomIndicators();
let customVariables = [];
let drawingManager = null;

const mainChartEl = document.getElementById("main-chart");
const fileInputEl = document.getElementById("csv-input");
const fileNameEl = document.getElementById("file-name");
const stockModal = document.getElementById("stock-modal-backdrop");
const stockBtn = document.getElementById("stock-selector-btn");
const stockSearchInput = document.getElementById("stock-search-input");
const stockListEl = document.getElementById("stock-list");
const stockLabelEl = document.getElementById("stock-current-label");

function setStatus(msg) {
  const el = document.getElementById("status-msg");
  if (el) el.textContent = msg;
}

function updateReadout(param, el, series, isOhlc) {
  if (!el) return;

  if (!param.time || !param.seriesData) {
    el.textContent = "";
    return;
  }

  const data = param.seriesData.get(series);
  if (!data) {
    el.textContent = "";
    return;
  }

  if (isOhlc) {
    el.textContent = `O ${data.open.toFixed(2)}  H ${data.high.toFixed(2)}  L ${data.low.toFixed(2)}  C ${data.close.toFixed(2)}`;
  } else {
    const val = data.value !== undefined ? data.value : data.close;
    el.textContent = Number(val).toFixed(2);
  }
}

function attachPaneLabel(pane, title) {
  const paneEl = pane.getHTMLElement && pane.getHTMLElement();
  if (!paneEl) return null;

  if (getComputedStyle(paneEl).position === "static") {
    paneEl.style.position = "relative";
  }

  const label = document.createElement("div");
  label.className = "pane-overlay-label";

  const titleSpan = document.createElement("span");
  titleSpan.textContent = title;

  const valueSpan = document.createElement("span");
  valueSpan.className = "ohlc-readout";

  label.appendChild(titleSpan);
  label.appendChild(valueSpan);
  paneEl.appendChild(label);

  return { container: label, titleSpan, valueSpan };
}

function parseCsvText(csvText, fileName, label) {
  Papa.parse(csvText, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    complete: (results) => loadData(results.data, fileName, label),
    error: (err) => setStatus("Parse error: " + err.message),
  });
}

function loadStockByName(name) {
  const stock = DUMMY_STOCKS.find(
    (s) => s.name.toLowerCase() === String(name).toLowerCase(),
  );

  if (!stock) {
    setStatus(`Unknown stock: ${name}`);
    return Promise.resolve();
  }

  setStatus(`Loading ${stock.name}...`);

  return fetch(stock.file, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`Could not load ${stock.file}`);
      return response.text();
    })
    .then((csvText) => {
      parseCsvText(csvText, stock.file, stock.name);
      localStorage.setItem(LAST_STOCK_KEY, stock.name);
      if (stockLabelEl) stockLabelEl.textContent = stock.name;
    })
    .catch((err) => {
      setStatus(err.message);
    });
}

function openStockModal() {
  if (!stockModal) return;
  stockModal.hidden = false;
  if (stockSearchInput) {
    stockSearchInput.value = "";
    renderStockList();
    stockSearchInput.focus();
  }
}

function closeStockModal() {
  if (!stockModal) return;
  stockModal.hidden = true;
}

function renderStockList() {
  if (!stockListEl || !stockSearchInput) return;

  const q = stockSearchInput.value.trim().toLowerCase();
  const filtered = DUMMY_STOCKS.filter((s) =>
    s.name.toLowerCase().includes(q),
  );

  stockListEl.innerHTML = "";

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "stock-empty";
    empty.textContent = "No matches.";
    stockListEl.appendChild(empty);
    return;
  }

  filtered.forEach((stock) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "stock-row";
    row.innerHTML = `<span>${stock.name}</span><span class="stock-file">${stock.file}</span>`;
    row.addEventListener("click", async () => {
      await loadStockByName(stock.name);
      closeStockModal();
    });
    stockListEl.appendChild(row);
  });
}

if (stockBtn) {
  stockBtn.addEventListener("click", (e) => {
    e.preventDefault();
    openStockModal();
  });
}

const stockCloseBtn = document.getElementById("stock-close-btn");
if (stockCloseBtn) {
  stockCloseBtn.addEventListener("click", (e) => {
    e.preventDefault();
    closeStockModal();
  });
}

if (stockModal) {
  stockModal.addEventListener("click", (e) => {
    if (e.target === stockModal) closeStockModal();
  });
}

if (stockSearchInput) {
  stockSearchInput.addEventListener("input", renderStockList);
  stockSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeStockModal();
  });
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && stockModal && !stockModal.hidden) {
    closeStockModal();
  }
});

function loadData(rows, fileName, label = fileName) {
  const parsed = rows
    .filter(
      (r) =>
        r.published_date &&
        r.open != null &&
        r.high != null &&
        r.low != null &&
        r.close != null,
    )
    .map((r) => ({
      time: String(r.published_date).trim(),
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      volume: r.traded_quantity != null ? Number(r.traded_quantity) : 0,
    }))
    .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));

  const seen = new Set();
  candles = parsed.filter((c) => {
    if (seen.has(c.time)) return false;
    seen.add(c.time);
    return true;
  });

  if (candles.length === 0) {
    setStatus("No valid rows found in file.");
    return;
  }

  candleSeries.setData(candles);
  chart.timeScale().fitContent();

  indicators.forEach((ind) => {
    ind.series.forEach((s) => chart.removeSeries(s.series));
  });
  indicators = [];
  renderIndicatorList();

  if (drawingManager) drawingManager.clearAll();

  const seriesTitle = document.getElementById("series-title");
  if (seriesTitle) seriesTitle.textContent = label;

  if (stockLabelEl && DUMMY_STOCKS.some((s) => s.name === label)) {
    stockLabelEl.textContent = label;
  }

  document.getElementById("stat-rows").textContent = candles.length;
  document.getElementById("stat-start").textContent = candles[0].time;
  document.getElementById("stat-end").textContent = candles[candles.length - 1].time;
  document.getElementById("stat-close").textContent = candles[candles.length - 1].close.toFixed(2);

  setStatus(`Loaded ${candles.length} rows.`);
}

function createCharts() {
  chart = LightweightCharts.createChart(mainChartEl, CHART_OPTIONS);

  candleSeries = chart.addSeries(CandlestickSeries, {
    upColor: "#26a69a",
    downColor: "#ef5350",
    borderUpColor: "#26a69a",
    borderDownColor: "#ef5350",
    wickUpColor: "#26a69a",
    wickDownColor: "#ef5350",
  });

  chart.subscribeCrosshairMove((param) => {
    updateReadout(
      param,
      document.getElementById("ohlc-readout"),
      candleSeries,
      true,
    );

    indicators.forEach((ind) => {
      if (ind.kind === "pane" && ind.paneLabel) {
        updateReadout(
          param,
          ind.paneLabel.valueSpan,
          ind.series[0].series,
          false,
        );
      }
    });
  });

  drawingManager = new DrawingToolManager(chart, candleSeries, mainChartEl);
  buildDrawingToolbar(document.getElementById("drawing-toolbar"), drawingManager);
}

fileInputEl.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  fileNameEl.textContent = file.name;

  Papa.parse(file, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    complete: (results) =>
      loadData(results.data, file.name, file.name.replace(/\.csv$/i, "")),
    error: (err) => setStatus("Parse error: " + err.message),
  });
});

const PARAM_SETS = {
  sma: [{ id: "period", label: "Period", default: 20 }],
  ema: [{ id: "period", label: "Period", default: 20 }],
  bbands: [
    { id: "period", label: "Period", default: 20 },
    { id: "mult", label: "Std Dev Multiplier", default: 2 },
  ],
  volume: [],
  rsi: [{ id: "period", label: "Period", default: 14 }],
  macd: [
    { id: "fast", label: "Fast Period", default: 12 },
    { id: "slow", label: "Slow Period", default: 26 },
    { id: "signal", label: "Signal Period", default: 9 },
  ],
  atr: [{ id: "period", label: "Period", default: 14 }],
  vwap: [],
  stoch: [{ id: "period", label: "Period", default: 14 }],
  custom: [],
};

function renderParamFields() {
  const type = document.getElementById("ind-type").value;
  const container = document.getElementById("param-fields");
  if (!container) return;

  container.innerHTML = "";
  PARAM_SETS[type].forEach((p) => {
    const label = document.createElement("label");
    label.textContent = p.label;
    label.setAttribute("for", "param-" + p.id);

    const input = document.createElement("input");
    input.type = "number";
    input.id = "param-" + p.id;
    input.value = p.default;
    input.step = "any";

    container.appendChild(label);
    container.appendChild(input);
  });
}

function nextPaneIndex() {
  return chart.panes().length;
}

function finalizePane(record, title) {
  const pane = record.series[0].series.getPane();
  pane.setHeight(DEFAULT_PANE_HEIGHT);
  record.pane = pane;
  record.paneLabel = attachPaneLabel(pane, title);
}

function addIndicator(type, params) {
  const id = "ind-" + indicatorSeq++;
  const record = { id, type, label: "", kind: "overlay", series: [] };

  if (type === "sma") {
    const data = calcSMA(candles, params.period);
    const color = nextColor();
    const s = chart.addSeries(LineSeries, { color, lineWidth: 2 });
    s.setData(data);
    record.series.push({ series: s, color });
    record.label = `SMA(${params.period})`;
  }

  if (type === "ema") {
    const data = calcEMA(candles, params.period);
    const color = nextColor();
    const s = chart.addSeries(LineSeries, { color, lineWidth: 2 });
    s.setData(data);
    record.series.push({ series: s, color });
    record.label = `EMA(${params.period})`;
  }

  if (type === "bbands") {
    const { upper, middle, lower } = calcBollinger(
      candles,
      params.period,
      params.mult,
    );
    const color = nextColor();
    const su = chart.addSeries(LineSeries, { color, lineWidth: 1 });
    const sm = chart.addSeries(LineSeries, {
      color,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
    });
    const sl = chart.addSeries(LineSeries, { color, lineWidth: 1 });
    su.setData(upper);
    sm.setData(middle);
    sl.setData(lower);
    record.series.push(
      { series: su, color },
      { series: sm, color },
      { series: sl, color },
    );
    record.label = `Bollinger(${params.period}, ${params.mult})`;
  }

  if (type === "volume") {
    record.kind = "pane";
    record.label = "Volume";
    const paneIndex = nextPaneIndex();
    const data = candles.map((c) => ({
      time: c.time,
      value: c.volume,
      color:
        c.close >= c.open
          ? "rgba(38,166,154,0.6)"
          : "rgba(239,83,80,0.6)",
    }));
    const s = chart.addSeries(HistogramSeries, { color: "#26a69a" }, paneIndex);
    s.setData(data);
    record.series.push({ series: s, color: "#26a69a" });
    finalizePane(record, record.label);
  }

  if (type === "rsi") {
    record.kind = "pane";
    record.label = `RSI(${params.period})`;
    const paneIndex = nextPaneIndex();
    const data = calcRSI(candles, params.period);
    const color = nextColor();
    const s = chart.addSeries(LineSeries, { color, lineWidth: 2 }, paneIndex);
    s.setData(data);
    record.series.push({ series: s, color });
    finalizePane(record, record.label);
  }

  if (type === "macd") {
    record.kind = "pane";
    record.label = `MACD(${params.fast}, ${params.slow}, ${params.signal})`;
    const paneIndex = nextPaneIndex();
    const { macdLine, signalLine, histogram } = calcMACD(
      candles,
      params.fast,
      params.slow,
      params.signal,
    );
    const color = nextColor();
    const signalColor = nextColor();
    const sMacd = chart.addSeries(LineSeries, { color, lineWidth: 2 }, paneIndex);
    const sSignal = chart.addSeries(LineSeries, { color: signalColor, lineWidth: 1 }, paneIndex);
    const sHist = chart.addSeries(HistogramSeries, { color: "#4a4e5c" }, paneIndex);
    sMacd.setData(macdLine);
    sSignal.setData(signalLine);
    sHist.setData(histogram);
    record.series.push(
      { series: sMacd, color },
      { series: sSignal, color: signalColor },
      { series: sHist, color: "#4a4e5c" },
    );
    finalizePane(record, record.label);
  }

  if (type === "atr") {
    record.kind = "pane";
    record.label = `ATR(${params.period})`;
    const paneIndex = nextPaneIndex();
    const data = calcATR(candles, params.period);
    const color = nextColor();
    const s = chart.addSeries(LineSeries, { color, lineWidth: 2 }, paneIndex);
    s.setData(data);
    record.series.push({ series: s, color });
    finalizePane(record, record.label);
  }

  if (type === "vwap") {
    const data = calcVWAP(candles);
    const color = nextColor();
    const s = chart.addSeries(LineSeries, {
      color,
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
    });
    s.setData(data);
    record.series.push({ series: s, color });
    record.label = "VWAP";
  }

  if (type === "stoch") {
    record.kind = "pane";
    record.label = `Stochastic(${params.period})`;
    const paneIndex = nextPaneIndex();
    const { kLine, dLine } = calcStochastic(candles, params.period);
    const color = nextColor();
    const signalColor = nextColor();
    const sK = chart.addSeries(LineSeries, { color, lineWidth: 2 }, paneIndex);
    const sD = chart.addSeries(LineSeries, { color: signalColor, lineWidth: 1 }, paneIndex);
    sK.setData(kLine);
    sD.setData(dLine);
    record.series.push(
      { series: sK, color },
      { series: sD, color: signalColor },
    );
    finalizePane(record, record.label);
  }

  if (type === "custom") {
    try {
      const data = evaluateFormula(
        params.formula,
        candles,
        params.variables || [],
      );
      if (data.length === 0) throw new Error("Formula produced no plottable values");

      record.kind = params.panel === "pane" ? "pane" : "overlay";
      record.label = params.name || params.formula;

      const color = params.color || nextColor();
      const width = Math.max(1, Math.min(5, Number(params.width) || 2));
      const paneIndex = record.kind === "pane" ? nextPaneIndex() : 0;

      let s;
      if (params.draw === "histogram") {
        s = chart.addSeries(HistogramSeries, { color }, paneIndex);
      } else if (params.draw === "area") {
        s = chart.addSeries(
          AreaSeries,
          {
            lineColor: color,
            topColor: color + "55",
            bottomColor: color + "05",
            lineWidth: width,
          },
          paneIndex,
        );
      } else {
        s = chart.addSeries(LineSeries, { color, lineWidth: width }, paneIndex);
      }

      s.setData(data);
      record.series.push({ series: s, color });

      if (record.kind === "pane") finalizePane(record, record.label);
    } catch (err) {
      setStatus("Custom indicator error: " + err.message);
      return;
    }
  }

  indicators.push(record);
  renderIndicatorList();
}

function removeIndicator(id) {
  const ind = indicators.find((i) => i.id === id);
  if (!ind) return;

  let paneIndex = null;
  if (ind.kind === "pane" && ind.pane) {
    try {
      paneIndex = ind.pane.paneIndex();
    } catch (_err) {
      paneIndex = null;
    }
  }

  ind.series.forEach((s) => chart.removeSeries(s.series));

  if (paneIndex !== null) {
    try {
      chart.removePane(paneIndex);
    } catch (_err) {}
  }

  indicators = indicators.filter((i) => i.id !== id);
  renderIndicatorList();
}

function renderIndicatorList() {
  const list = document.getElementById("indicator-list");
  if (!list) return;

  list.innerHTML = "";

  if (indicators.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-note";
    li.textContent = "None added yet.";
    list.appendChild(li);
    return;
  }

  indicators.forEach((ind) => {
    const li = document.createElement("li");

    const left = document.createElement("span");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = ind.series[0].color;
    left.appendChild(swatch);
    left.appendChild(document.createTextNode(ind.label));

    const btn = document.createElement("button");
    btn.textContent = "Remove";
    btn.addEventListener("click", () => removeIndicator(ind.id));

    li.appendChild(left);
    li.appendChild(btn);
    list.appendChild(li);
  });
}

function addVariableFromForm() {
  const name = document.getElementById("variable-name").value.trim().toUpperCase();
  const formula = document.getElementById("variable-formula").value.trim();

  if (!/^[A-Z]$/.test(name)) {
    setStatus("Variable must be A through Z.");
    return;
  }

  if (!formula) {
    setStatus("Enter a formula for variable " + name + ".");
    return;
  }

  customVariables = customVariables
    .filter((item) => item.name !== name)
    .concat([{ name, formula }])
    .sort((a, b) => a.name.localeCompare(b.name));

  document.getElementById("variable-formula").value = "";
  renderVariableList();
}

function editVariable(name) {
  const item = customVariables.find((variable) => variable.name === name);
  if (!item) return;
  document.getElementById("variable-name").value = item.name;
  document.getElementById("variable-formula").value = item.formula;
  document.getElementById("variable-formula").focus();
}

function removeVariable(name) {
  customVariables = customVariables.filter((variable) => variable.name !== name);
  renderVariableList();
}

function insertFormulaSnippet(snippet) {
  if (!snippet) return;
  const targetId = document.getElementById("insert-target").value;
  const input = document.getElementById(targetId);
  if (!input) return;

  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const insert = snippet === "()" ? "()" : snippet;

  input.value = input.value.slice(0, start) + insert + input.value.slice(end);

  const nextCursor = snippet === "()" ? start + 1 : start + insert.length;
  input.focus();
  input.setSelectionRange(nextCursor, nextCursor);
}

function renderVariableInsertOptions() {
  const select = document.getElementById("insert-variable");
  if (!select) return;

  select.innerHTML = '<option value="">Choose variable</option>';
  customVariables.forEach((variable) => {
    const option = document.createElement("option");
    option.value = variable.name;
    option.textContent = variable.name;
    select.appendChild(option);
  });
}

function renderVariableList() {
  const list = document.getElementById("variable-list");
  if (!list) return;

  list.innerHTML = "";

  if (customVariables.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-note";
    li.textContent = "No variables added.";
    list.appendChild(li);
    return;
  }

  customVariables.forEach((variable) => {
    const li = document.createElement("li");

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

    actions.appendChild(edit);
    actions.appendChild(remove);
    li.appendChild(text);
    li.appendChild(actions);
    list.appendChild(li);
  });

  renderVariableInsertOptions();
}

function readCustomForm() {
  return {
    name: document.getElementById("custom-name").value.trim() || "Custom Indicator",
    formula: document.getElementById("custom-formula").value.trim(),
    panel: document.getElementById("custom-panel").value,
    draw: document.getElementById("custom-draw").value,
    color: document.getElementById("custom-color").value,
    width: Number(document.getElementById("custom-width").value) || 2,
    variables: customVariables.map((item) => ({ ...item })),
  };
}

function openCustomModal() {
  customVariables = [];
  renderVariableList();
  renderVariableInsertOptions();
  renderPresetOptions();
  document.getElementById("preset-select").value = "";
  document.getElementById("custom-modal").hidden = false;
  document.getElementById("custom-formula").focus();
}

function closeCustomModal() {
  document.getElementById("custom-modal").hidden = true;
  document.getElementById("ind-type").value = "sma";
  renderParamFields();
}

function loadCustomIndicators() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

function saveCustomIndicator(def) {
  const normalized = {
    name: def.name,
    formula: def.formula,
    panel: def.panel,
    draw: def.draw,
    color: def.color,
    width: def.width,
    variables: Array.isArray(def.variables) ? def.variables : [],
  };

  const withoutDuplicate = customIndicators.filter(
    (item) => item.name !== normalized.name || item.formula !== normalized.formula,
  );

  customIndicators = [normalized, ...withoutDuplicate].slice(0, 20);
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(customIndicators));
  renderCustomOptions();
}

function renderCustomOptions() {
  const list = document.getElementById("saved-custom-list");
  if (!list) return;

  list.innerHTML = "";

  if (customIndicators.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-note";
    li.textContent = "No saved indicators.";
    list.appendChild(li);
    return;
  }

  customIndicators.forEach((def) => {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = def.name;

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "6px";

    const use = document.createElement("button");
    use.textContent = "Use";
    use.onclick = () => {
      if (!candles.length) {
        setStatus("Load a CSV first.");
        return;
      }
      addIndicator("custom", def);
    };

    const del = document.createElement("button");
    del.textContent = "Delete";
    del.onclick = () => {
      customIndicators = customIndicators.filter(
        (x) => !(x.name === def.name && x.formula === def.formula),
      );
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(customIndicators));
      renderCustomOptions();
    };

    actions.appendChild(use);
    actions.appendChild(del);
    li.appendChild(name);
    li.appendChild(actions);
    list.appendChild(li);
  });
}

function setupCustomModal() {
  const modal = document.getElementById("custom-modal");
  const form = document.getElementById("custom-form");

  document.getElementById("preset-select").addEventListener("change", (e) => {
    if (e.target.value !== "") applyPreset(Number(e.target.value));
  });

  document
    .getElementById("custom-close")
    .addEventListener("click", closeCustomModal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeCustomModal();
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

  document.getElementById("custom-test").addEventListener("click", () => {
    if (candles.length === 0) {
      setStatus("Load a CSV before previewing a custom indicator.");
      return;
    }
    const def = readCustomForm();
    try {
      const data = evaluateFormula(def.formula, candles, def.variables);
      setStatus(`Preview OK: ${data.length} plotted points.`);
    } catch (err) {
      setStatus("Custom indicator error: " + err.message);
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (candles.length === 0) {
      setStatus("Load a CSV before adding indicators.");
      return;
    }

    const def = readCustomForm();
    if (document.getElementById("custom-save").checked) {
      saveCustomIndicator(def);
    }

    addIndicator("custom", def);
    closeCustomModal();
  });
}

document.getElementById("ind-type").addEventListener("change", renderParamFields);
renderParamFields();

document.getElementById("indicator-form").addEventListener("submit", (event) => {
  event.preventDefault();

  if (candles.length === 0) {
    setStatus("Load a CSV before adding indicators.");
    return;
  }

  const type = document.getElementById("ind-type").value;
  const params = {};

  PARAM_SETS[type].forEach((p) => {
    params[p.id] = Number(document.getElementById("param-" + p.id).value);
  });

  addIndicator(type, params);
});

document.getElementById("formula-help-btn").addEventListener("click", () => {
  document.getElementById("formula-modal").hidden = false;
});

document.getElementById("formula-close").addEventListener("click", () => {
  document.getElementById("formula-modal").hidden = true;
});

document.getElementById("formula-modal").addEventListener("click", (e) => {
  if (e.target.id === "formula-modal") {
    document.getElementById("formula-modal").hidden = true;
  }
});

document
  .getElementById("new-custom-btn")
  .addEventListener("click", openCustomModal);

document
  .getElementById("export-custom-btn")
  .addEventListener("click", exportCustomIndicators);

document
  .getElementById("import-custom-input")
  .addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importCustomIndicatorsFromFile(file);
    e.target.value = "";
  });

function init() {
  createCharts();
  renderCustomOptions();
  setupCustomModal();

  const lastStock = localStorage.getItem(LAST_STOCK_KEY) || "SAMPLE";
  if (stockLabelEl) stockLabelEl.textContent = lastStock;

  loadStockByName(lastStock);
}

init();
const COLORS = [
  "#3179f5",
  "#e0a537",
  "#7e57c2",
  "#42a5f5",
  "#8d6e63",
  "#5c6bc0",
  "#26c6da",
];
let colorIndex = 0;
function nextColor() {
  const c = COLORS[colorIndex % COLORS.length];
  colorIndex++;
  return c;
}

const CHART_THEME = {
  layout: {
    background: { color: "#131722" },
    textColor: "#d1d4dc",
    fontFamily: "IBM Plex Mono, monospace",
  },
  grid: {
    vertLines: { color: "#1c2030" },
    horzLines: { color: "#1c2030" },
  },
  rightPriceScale: { borderColor: "#363a4a" },
  timeScale: { borderColor: "#363a4a" },
};

let candles = [];
let mainChart, candleSeries;
let indicators = [];
let indicatorSeq = 0;
let syncing = false;
const CUSTOM_KEY = "chartlab.customIndicators.v1";
let customIndicators = loadCustomIndicators();
let customVariables = [];

const mainChartEl = document.getElementById("main-chart");
const panesContainer = document.getElementById("panes-container");

function allSubCharts() {
  return indicators.filter((i) => i.kind === "pane").map((i) => i.pane.chart);
}

function subscribeSync(chart) {
  chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
    if (syncing || !range) return;
    syncing = true;
    if (chart !== mainChart)
      mainChart.timeScale().setVisibleLogicalRange(range);
    allSubCharts().forEach((c) => {
      if (c !== chart) c.timeScale().setVisibleLogicalRange(range);
    });
    syncing = false;
  });
}

function createCharts() {
  mainChart = LightweightCharts.createChart(
    mainChartEl,
    Object.assign({}, CHART_THEME, {
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: "#3179f5", labelBackgroundColor: "#3179f5" },
        horzLine: { color: "#3179f5", labelBackgroundColor: "#3179f5" },
      },
    }),
  );

  candleSeries = mainChart.addCandlestickSeries({
    upColor: "#26a69a",
    downColor: "#ef5350",
    borderUpColor: "#26a69a",
    borderDownColor: "#ef5350",
    wickUpColor: "#26a69a",
    wickDownColor: "#ef5350",
  });

  subscribeSync(mainChart);
  mainChart.subscribeCrosshairMove((param) =>
    updateReadout(
      param,
      document.getElementById("ohlc-readout"),
      candleSeries,
      true,
    ),
  );

  window.addEventListener("resize", resizeCharts);
  resizeCharts();
}

function resizeCharts() {
  if (mainChart)
    mainChart.resize(mainChartEl.clientWidth, mainChartEl.clientHeight);
  indicators
    .filter((i) => i.kind === "pane")
    .forEach((i) => {
      const el = i.pane.chartEl;
      i.pane.chart.resize(el.clientWidth, el.clientHeight);
    });
}

function updateReadout(param, el, series, isOhlc) {
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
    el.textContent = val.toFixed(2);
  }
}

function createPane(title) {
  const wrapper = document.createElement("div");
  wrapper.className = "pane-wrapper";

  const handle = document.createElement("div");
  handle.className = "pane-resize-handle";

  const label = document.createElement("div");
  label.className = "pane-label";
  const titleEl = document.createElement("span");
  titleEl.textContent = title;
  const readoutEl = document.createElement("span");
  readoutEl.className = "ohlc-readout";
  label.appendChild(titleEl);
  label.appendChild(readoutEl);

  const chartEl = document.createElement("div");
  chartEl.className = "chart-box chart-box-pane";

  wrapper.appendChild(handle);
  wrapper.appendChild(label);
  wrapper.appendChild(chartEl);
  panesContainer.appendChild(wrapper);

  const chart = LightweightCharts.createChart(chartEl, CHART_THEME);
  subscribeSync(chart);

  const mainRange = mainChart.timeScale().getVisibleLogicalRange();
  if (mainRange) chart.timeScale().setVisibleLogicalRange(mainRange);

  makeResizable(handle, chartEl, chart);

  return {
    wrapper,
    chartEl,
    chart,
    titleEl,
    readoutEl,
    mainSeriesForReadout: null,
  };
}

function makeResizable(handle, chartEl, chart) {
  let startY = 0;
  let startHeight = 0;

  function onMove(e) {
    const dy = e.clientY - startY;
    const newHeight = Math.min(500, Math.max(60, startHeight + dy));
    chartEl.style.height = newHeight + "px";
    chart.resize(chartEl.clientWidth, newHeight);
  }

  function onUp() {
    handle.classList.remove("active");
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  }

  handle.addEventListener("mousedown", (e) => {
    startY = e.clientY;
    startHeight = chartEl.clientHeight;
    handle.classList.add("active");
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    e.preventDefault();
  });
}

function removePane(pane) {
  pane.chart.remove();
  pane.wrapper.remove();
}

document.getElementById("csv-input").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  document.getElementById("file-name").textContent = file.name;
  Papa.parse(file, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    complete: (results) => loadData(results.data, file.name),
    error: (err) => setStatus("Parse error: " + err.message),
  });
});

function loadData(rows, fileName) {
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
  mainChart.timeScale().fitContent();

  indicators.forEach((ind) => {
    if (ind.kind === "overlay") {
      ind.series.forEach((s) => mainChart.removeSeries(s.series));
    } else {
      removePane(ind.pane);
    }
  });
  indicators = [];
  renderIndicatorList();

  document.getElementById("series-title").textContent = fileName.replace(/\.csv$/i, "",);
  document.getElementById("stat-rows").textContent = candles.length;
  document.getElementById("stat-start").textContent = candles[0].time;
  document.getElementById("stat-end").textContent =candles[candles.length - 1].time;
  document.getElementById("stat-close").textContent =candles[candles.length - 1].close.toFixed(2);

  setStatus(`Loaded ${candles.length} rows.`);
}

function setStatus(msg) {
  document.getElementById("status-msg").textContent = msg;
}

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

document
  .getElementById("ind-type")
  .addEventListener("change", renderParamFields);
renderParamFields();

document
  .getElementById("indicator-form")
  .addEventListener("submit", (event) => {
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

function addIndicator(type, params) {
  const id = "ind-" + indicatorSeq++;
  let record = { id, type, label: "", kind: "overlay", series: [] };

  if (type === "sma") {
    const data = calcSMA(candles, params.period);
    const color = nextColor();
    const s = mainChart.addLineSeries({ color, lineWidth: 2 });
    s.setData(data);
    record.series.push({ series: s, color });
    record.label = `SMA(${params.period})`;
  }

  if (type === "ema") {
    const data = calcEMA(candles, params.period);
    const color = nextColor();
    const s = mainChart.addLineSeries({ color, lineWidth: 2 });
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
    const su = mainChart.addLineSeries({ color, lineWidth: 1 });
    const sm = mainChart.addLineSeries({
      color,
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
    });
    const sl = mainChart.addLineSeries({ color, lineWidth: 1 });
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
    const pane = createPane(record.label);
    const color = nextColor();
    const data = candles.map((c) => ({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open ? "rgba(38,166,154,0.6)" : "rgba(239,83,80,0.6)",
    }));
    const s = pane.chart.addHistogramSeries({ color: "#26a69a" });
    s.setData(data);
    pane.chart.subscribeCrosshairMove((param) =>
      updateReadout(param, pane.readoutEl, s, false),
    );
    record.series.push({ series: s, color });
    record.pane = pane;
  }

  if (type === "rsi") {
    record.kind = "pane";
    record.label = `RSI(${params.period})`;
    const pane = createPane(record.label);
    const data = calcRSI(candles, params.period);
    const color = nextColor();
    const s = pane.chart.addLineSeries({ color, lineWidth: 2 });
    s.setData(data);
    pane.chart.subscribeCrosshairMove((param) =>
      updateReadout(param, pane.readoutEl, s, false),
    );
    record.series.push({ series: s, color });
    record.pane = pane;
  }

  if (type === "macd") {
    record.kind = "pane";
    record.label = `MACD(${params.fast}, ${params.slow}, ${params.signal})`;
    const pane = createPane(record.label);
    const { macdLine, signalLine, histogram } = calcMACD(
      candles,
      params.fast,
      params.slow,
      params.signal,
    );
    const color = nextColor();
    const signalColor = nextColor();
    const sMacd = pane.chart.addLineSeries({ color, lineWidth: 2 });
    const sSignal = pane.chart.addLineSeries({
      color: signalColor,
      lineWidth: 1,
    });
    const sHist = pane.chart.addHistogramSeries({ color: "#4a4e5c" });
    sMacd.setData(macdLine);
    sSignal.setData(signalLine);
    sHist.setData(histogram);
    pane.chart.subscribeCrosshairMove((param) =>
      updateReadout(param, pane.readoutEl, sMacd, false),
    );
    record.series.push(
      { series: sMacd, color },
      { series: sSignal, color: signalColor },
      { series: sHist, color: "#4a4e5c" },
    );
    record.pane = pane;
  }

  if (type === "atr") {
    record.kind = "pane";
    record.label = `ATR(${params.period})`;
    const pane = createPane(record.label);
    const data = calcATR(candles, params.period);
    const color = nextColor();
    const s = pane.chart.addLineSeries({ color, lineWidth: 2 });
    s.setData(data);
    pane.chart.subscribeCrosshairMove((param) =>
      updateReadout(param, pane.readoutEl, s, false),
    );
    record.series.push({ series: s, color });
    record.pane = pane;
  }

  if (type === "vwap") {
    const data = calcVWAP(candles);
    const color = nextColor();
    const s = mainChart.addLineSeries({
      color,
      lineWidth: 2,
      lineStyle: LightweightCharts.LineStyle.Dashed,
    });
    s.setData(data);
    record.series.push({ series: s, color });
    record.label = "VWAP";
  }

  if (type === "stoch") {
    record.kind = "pane";
    record.label = `Stochastic(${params.period})`;
    const pane = createPane(record.label);
    const { kLine, dLine } = calcStochastic(candles, params.period);
    const color = nextColor();
    const signalColor = nextColor();
    const sK = pane.chart.addLineSeries({ color, lineWidth: 2 });
    const sD = pane.chart.addLineSeries({ color: signalColor, lineWidth: 1 });
    sK.setData(kLine);
    sD.setData(dLine);
    pane.chart.subscribeCrosshairMove((param) =>
      updateReadout(param, pane.readoutEl, sK, false),
    );
    record.series.push(
      { series: sK, color },
      { series: sD, color: signalColor },
    );
    record.pane = pane;
  }

  if (type === "custom") {
    try {
      const data = evaluateFormula(params.formula, candles, params.variables || []);
      if (data.length === 0)
        throw new Error("Formula produced no plottable values");
      record.kind = params.panel === "pane" ? "pane" : "overlay";
      record.label = params.name || params.formula;
      const color = params.color || nextColor();
      const width = Math.max(1, Math.min(5, Number(params.width) || 2));
      const target = record.kind === "pane" ? createPane(record.label) : null;
      const chart = target ? target.chart : mainChart;
      let s;
      if (params.draw === "histogram") {
        s = chart.addHistogramSeries({ color });
      } else if (params.draw === "area") {
        s = chart.addAreaSeries({
          lineColor: color,
          topColor: color + "55",
          bottomColor: color + "05",
          lineWidth: width,
        });
      } else {
        s = chart.addLineSeries({ color, lineWidth: width });
      }
      s.setData(data);
      if (target) {
        target.chart.subscribeCrosshairMove((param) =>
          updateReadout(param, target.readoutEl, s, false),
        );
        record.pane = target;
      }
      record.series.push({ series: s, color });
    } catch (err) {
      setStatus("Custom indicator error: " + err.message);
      return;
    }
  }

  indicators.push(record);
  renderIndicatorList();
  resizeCharts();
}

function removeIndicator(id) {
  const ind = indicators.find((i) => i.id === id);
  if (!ind) return;
  if (ind.kind === "overlay") {
    ind.series.forEach((s) => mainChart.removeSeries(s.series));
  } else {
    removePane(ind.pane);
  }
  indicators = indicators.filter((i) => i.id !== id);
  renderIndicatorList();
  requestAnimationFrame(resizeCharts);
}

function renderIndicatorList() {
  const list = document.getElementById("indicator-list");
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

document.getElementById("formula-help-btn").addEventListener("click", () => {
  document.getElementById("formula-modal").hidden = false;
});

document.getElementById("formula-close").addEventListener("click", () => {
  document.getElementById("formula-modal").hidden = true;
});

document.getElementById("formula-modal").addEventListener("click", (e) => {
  if (e.target.id === "formula-modal")
    document.getElementById("formula-modal").hidden = true;
});

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

function setupCustomModal() {
  const modal = document.getElementById("custom-modal");
  const form = document.getElementById("custom-form");
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

function openCustomModal() {
  customVariables = [];
  renderVariableList();
  renderVariableInsertOptions();
  document.getElementById("custom-modal").hidden = false;
  document.getElementById("custom-formula").focus();
}

function closeCustomModal() {
  document.getElementById("custom-modal").hidden = true;
  document.getElementById("ind-type").value = "sma";
  renderParamFields();
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
    (item) =>
      item.name !== normalized.name || item.formula !== normalized.formula,
  );
  customIndicators = [normalized, ...withoutDuplicate].slice(0, 20);
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(customIndicators));
  renderCustomOptions();
}

function renderCustomOptions() {
  const list = document.getElementById("saved-custom-list");
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

document
  .getElementById("new-custom-btn")
  .addEventListener("click", openCustomModal);

createCharts();
renderCustomOptions();
setupCustomModal();

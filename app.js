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

let candles = [];
let mainChart, oscChart, candleSeries;
let indicators = [];
let indicatorSeq = 0;

const mainChartEl = document.getElementById("main-chart");
const oscChartEl = document.getElementById("osc-chart");

function createCharts() {
  mainChart = LightweightCharts.createChart(mainChartEl, {
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
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: { color: "#3179f5", labelBackgroundColor: "#3179f5" },
      horzLine: { color: "#3179f5", labelBackgroundColor: "#3179f5" },
    },
  });

  candleSeries = mainChart.addCandlestickSeries({
    upColor: "#26a69a",
    downColor: "#ef5350",
    borderUpColor: "#26a69a",
    borderDownColor: "#ef5350",
    wickUpColor: "#26a69a",
    wickDownColor: "#ef5350",
  });

  oscChart = LightweightCharts.createChart(oscChartEl, {
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
  });

  syncTimeScales(mainChart, oscChart);
  syncTimeScales(oscChart, mainChart);

  mainChart.subscribeCrosshairMove((param) =>
    updateReadout(param, "ohlc-readout", true),
  );
  oscChart.subscribeCrosshairMove((param) =>
    updateReadout(param, "osc-readout", false),
  );

  window.addEventListener("resize", resizeCharts);
  resizeCharts();
}

function syncTimeScales(source, target) {
  source.timeScale().subscribeVisibleLogicalRangeChange((range) => {
    if (range) target.timeScale().setVisibleLogicalRange(range);
  });
}

function resizeCharts() {
  if (mainChart)
    mainChart.resize(mainChartEl.clientWidth, mainChartEl.clientHeight);
  if (oscChart)
    oscChart.resize(oscChartEl.clientWidth, oscChartEl.clientHeight);
}

function updateReadout(param, elementId, isMain) {
  const el = document.getElementById(elementId);
  if (!param.time || !param.seriesData || !isMain) {
    if (!isMain) el.textContent = "";
    return;
  }
  const data = param.seriesData.get(candleSeries);
  if (!data) {
    el.textContent = "";
    return;
  }
  el.textContent = `O ${data.open.toFixed(2)}  H ${data.high.toFixed(2)}  L ${data.low.toFixed(2)}  C ${data.close.toFixed(2)}`;
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

  indicators.forEach((ind) =>
    ind.series.forEach((s) => s.chart.removeSeries(s.series)),
  );
  indicators = [];
  renderIndicatorList();

  document.getElementById("series-title").textContent = fileName.replace(
    /\.csv$/i,
    "",
  );
  document.getElementById("stat-rows").textContent = candles.length;
  document.getElementById("stat-start").textContent = candles[0].time;
  document.getElementById("stat-end").textContent =
    candles[candles.length - 1].time;
  document.getElementById("stat-close").textContent =
    candles[candles.length - 1].close.toFixed(2);

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
  rsi: [{ id: "period", label: "Period", default: 14 }],
  macd: [
    { id: "fast", label: "Fast Period", default: 12 },
    { id: "slow", label: "Slow Period", default: 26 },
    { id: "signal", label: "Signal Period", default: 9 },
  ],
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
  const series = [];
  let label = "";

  if (type === "sma") {
    const data = calcSMA(candles, params.period);
    const color = nextColor();
    const s = mainChart.addLineSeries({ color, lineWidth: 2 });
    s.setData(data);
    series.push({ chart: mainChart, series: s, color });
    label = `SMA(${params.period})`;
  }

  if (type === "ema") {
    const data = calcEMA(candles, params.period);
    const color = nextColor();
    const s = mainChart.addLineSeries({ color, lineWidth: 2 });
    s.setData(data);
    series.push({ chart: mainChart, series: s, color });
    label = `EMA(${params.period})`;
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
    series.push({ chart: mainChart, series: su, color });
    series.push({ chart: mainChart, series: sm, color });
    series.push({ chart: mainChart, series: sl, color });
    label = `Bollinger(${params.period}, ${params.mult})`;
  }

  if (type === "rsi") {
    const data = calcRSI(candles, params.period);
    const color = nextColor();
    const s = oscChart.addLineSeries({ color, lineWidth: 2 });
    s.setData(data);
    series.push({ chart: oscChart, series: s, color });
    label = `RSI(${params.period})`;
  }

  if (type === "macd") {
    const { macdLine, signalLine, histogram } = calcMACD(
      candles,
      params.fast,
      params.slow,
      params.signal,
    );
    const color = nextColor();
    const signalColor = nextColor();
    const sMacd = oscChart.addLineSeries({ color, lineWidth: 2 });
    const sSignal = oscChart.addLineSeries({
      color: signalColor,
      lineWidth: 1,
    });
    const sHist = oscChart.addHistogramSeries({ color: "#4a4e5c" });
    sMacd.setData(macdLine);
    sSignal.setData(signalLine);
    sHist.setData(histogram);
    series.push({ chart: oscChart, series: sMacd, color });
    series.push({ chart: oscChart, series: sSignal, color: signalColor });
    series.push({ chart: oscChart, series: sHist, color: "#4a4e5c" });
    label = `MACD(${params.fast}, ${params.slow}, ${params.signal})`;
  }

  indicators.push({ id, type, label, series });
  renderIndicatorList();
}

function removeIndicator(id) {
  const ind = indicators.find((i) => i.id === id);
  if (!ind) return;
  ind.series.forEach((s) => s.chart.removeSeries(s.series));
  indicators = indicators.filter((i) => i.id !== id);
  renderIndicatorList();
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

createCharts();
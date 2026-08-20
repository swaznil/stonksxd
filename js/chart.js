import {
  calcATR,
  calcBollinger,
  calcEMA,
  calcMACD,
  calcRSI,
  calcSMA,
  calcStochastic,
  calcVWAP,
  evaluateFormula,
} from "./indicators.js";
import { DrawingToolManager, buildDrawingToolbar } from "./drawing-tools.js";

const COLORS = [
  "#377bf1",
  "#e0a73f",
  "#815bc3",
  "#41a2f1",
  "#8b6c61",
  "#5a69bd",
  "#2bc5da",
];

const DEFAULT_PANE_HEIGHT = 160;
const DEFAULT_VISIBLE_BARS = 260;

export const INDICATOR_PARAMS = {
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

const {
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  AreaSeries,
  CrosshairMode,
  LineStyle,
} = window.LightweightCharts || {};

const CHART_OPTIONS = {
  layout: {
    background: { color: "#11151e" },
    textColor: "#d1d4dc",
    fontFamily: "IBM Plex Mono, monospace",
    panes: {
      separatorColor: "#363a4a",
      separatorHoverColor: "rgba(44, 126, 249, 0.15)",
      enableResize: true,
    },
  },
  grid: {
    vertLines: { color: "#212734" },
    horzLines: { color: "#212734" },
  },
  rightPriceScale: { borderColor: "#363a4a" },
  timeScale: { borderColor: "#363a4a" },
  autoSize: true,
  crosshair: {
    mode: CrosshairMode?.Normal ?? 0,
    vertLine: { color: "#3179f5", labelBackgroundColor: "#3179f5" },
    horzLine: { color: "#3179f5", labelBackgroundColor: "#3179f5" },
  },
};

function updateReadout(param, element, series, isOhlc) {
  if (!element) return;
  if (!param.time || !param.seriesData) {
    element.textContent = "";
    return;
  }
  const data = param.seriesData.get(series);
  if (!data) {
    element.textContent = "";
    return;
  }
  if (isOhlc) {
    element.textContent = `O ${data.open.toFixed(2)}  H ${data.high.toFixed(2)}  L ${data.low.toFixed(2)}  C ${data.close.toFixed(2)}`;
  } else {
    element.textContent = Number(data.value ?? data.close).toFixed(2);
  }
}

function attachPaneLabel(pane, title) {
  const paneElement = pane.getHTMLElement?.();
  if (!paneElement) return null;
  if (getComputedStyle(paneElement).position === "static") {
    paneElement.style.position = "relative";
  }
  const container = document.createElement("div");
  container.className = "pane-overlay-label";
  const titleSpan = document.createElement("span");
  titleSpan.textContent = title;
  const valueSpan = document.createElement("span");
  valueSpan.className = "ohlc-readout";
  container.append(titleSpan, valueSpan);
  paneElement.appendChild(container);
  return { container, titleSpan, valueSpan };
}

export class ChartController {
  constructor({ mountElement, toolbarElement, indicatorListElement, setStatus }) {
    this.mountElement = mountElement;
    this.toolbarElement = toolbarElement;
    this.indicatorListElement = indicatorListElement;
    this.setStatus = setStatus;
    this.candles = [];
    this.indicators = [];
    this.indicatorSequence = 0;
    this.colorIndex = 0;
    this.chart = null;
    this.candleSeries = null;
    this.drawingManager = null;
  }

  initialize() {
    this.chart = window.LightweightCharts.createChart(
      this.mountElement,
      CHART_OPTIONS,
    );
    this.candleSeries = this.chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderUpColor: "#26a69a",
      borderDownColor: "#ef5350",
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });
    this.chart.subscribeCrosshairMove((param) => {
      updateReadout(
        param,
        document.getElementById("ohlc-readout"),
        this.candleSeries,
        true,
      );
      this.indicators.forEach((indicator) => {
        if (indicator.kind === "pane" && indicator.paneLabel) {
          updateReadout(
            param,
            indicator.paneLabel.valueSpan,
            indicator.series[0].series,
            false,
          );
        }
      });
    });
    this.drawingManager = new DrawingToolManager(
      this.chart,
      this.candleSeries,
      this.mountElement,
    );
    buildDrawingToolbar(this.toolbarElement, this.drawingManager);
    this.renderIndicatorList();
  }

  hasData() {
    return this.candles.length > 0;
  }

  setData(candles) {
    this.candles = candles;
    this.candleSeries.setData(candles);
    this.zoomToDefaultView();
    this.clearIndicators();
    this.drawingManager?.clearAll();
  }

  clearIndicators() {
    this.indicators.forEach((indicator) => {
      indicator.series.forEach(({ series }) => this.chart.removeSeries(series));
    });
    this.indicators = [];
    this.renderIndicatorList();
  }

  zoomToDefaultView() {
    if (!this.chart || !this.hasData()) return;
    if (this.candles.length <= DEFAULT_VISIBLE_BARS) {
      this.chart.timeScale().fitContent();
      return;
    }
    this.chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, this.candles.length - DEFAULT_VISIBLE_BARS),
      to: this.candles.length + 8,
    });
  }

  applyTheme(theme) {
    const light = theme === "light";
    this.chart?.applyOptions({
      layout: {
        background: { color: light ? "#f7f9fc" : "#11151e" },
        textColor: light ? "#202532" : "#d1d4dc",
      },
      grid: {
        vertLines: { color: light ? "#e7ebf2" : "#212734" },
        horzLines: { color: light ? "#e7ebf2" : "#212734" },
      },
      rightPriceScale: { borderColor: light ? "#cbd2df" : "#363a4a" },
      timeScale: { borderColor: light ? "#cbd2df" : "#363a4a" },
    });
  }

  nextColor() {
    const color = COLORS[this.colorIndex % COLORS.length];
    this.colorIndex += 1;
    return color;
  }

  nextPaneIndex() {
    return this.chart.panes().length;
  }

  finalizePane(record) {
    const pane = record.series[0].series.getPane();
    pane.setHeight(DEFAULT_PANE_HEIGHT);
    record.pane = pane;
    record.paneLabel = attachPaneLabel(pane, record.label);
  }

  addIndicator(type, params) {
    const record = {
      id: `ind-${this.indicatorSequence++}`,
      type,
      label: "",
      kind: "overlay",
      series: [],
    };
    const addLine = (data, options = {}, paneIndex = 0) => {
      const color = options.color || this.nextColor();
      const series = this.chart.addSeries(
        LineSeries,
        { color, lineWidth: 2, ...options },
        paneIndex,
      );
      series.setData(data);
      record.series.push({ series, color });
      return series;
    };

    if (type === "sma") {
      addLine(calcSMA(this.candles, params.period));
      record.label = `SMA(${params.period})`;
    } else if (type === "ema") {
      addLine(calcEMA(this.candles, params.period));
      record.label = `EMA(${params.period})`;
    } else if (type === "bbands") {
      const bands = calcBollinger(this.candles, params.period, params.mult);
      const color = this.nextColor();
      addLine(bands.upper, { color, lineWidth: 1 });
      addLine(bands.middle, {
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
      });
      addLine(bands.lower, { color, lineWidth: 1 });
      record.label = `Bollinger(${params.period}, ${params.mult})`;
    } else if (type === "volume") {
      record.kind = "pane";
      record.label = "Volume";
      const data = this.candles.map((candle) => ({
        time: candle.time,
        value: candle.volume,
        color:
          candle.close >= candle.open
            ? "rgba(38,166,154,0.6)"
            : "rgba(239,83,80,0.6)",
      }));
      const color = "#26a69a";
      const series = this.chart.addSeries(
        HistogramSeries,
        { color },
        this.nextPaneIndex(),
      );
      series.setData(data);
      record.series.push({ series, color });
      this.finalizePane(record);
    } else if (type === "rsi" || type === "atr") {
      record.kind = "pane";
      record.label = `${type.toUpperCase()}(${params.period})`;
      const data =
        type === "rsi"
          ? calcRSI(this.candles, params.period)
          : calcATR(this.candles, params.period);
      addLine(data, {}, this.nextPaneIndex());
      this.finalizePane(record);
    } else if (type === "macd") {
      record.kind = "pane";
      record.label = `MACD(${params.fast}, ${params.slow}, ${params.signal})`;
      const paneIndex = this.nextPaneIndex();
      const data = calcMACD(
        this.candles,
        params.fast,
        params.slow,
        params.signal,
      );
      addLine(data.macdLine, {}, paneIndex);
      addLine(data.signalLine, {}, paneIndex);
      const color = "#4a4e5c";
      const histogram = this.chart.addSeries(
        HistogramSeries,
        { color },
        paneIndex,
      );
      histogram.setData(data.histogram);
      record.series.push({ series: histogram, color });
      this.finalizePane(record);
    } else if (type === "vwap") {
      addLine(calcVWAP(this.candles), { lineStyle: LineStyle.Dashed });
      record.label = "VWAP";
    } else if (type === "stoch") {
      record.kind = "pane";
      record.label = `Stochastic(${params.period})`;
      const paneIndex = this.nextPaneIndex();
      const { kLine, dLine } = calcStochastic(this.candles, params.period);
      addLine(kLine, {}, paneIndex);
      addLine(dLine, { lineWidth: 1 }, paneIndex);
      this.finalizePane(record);
    } else if (type === "custom") {
      try {
        const data = evaluateFormula(
          params.formula,
          this.candles,
          params.variables || [],
        );
        if (!data.length) throw new Error("Formula produced no plottable values");
        record.kind = params.panel === "pane" ? "pane" : "overlay";
        record.label = params.name || params.formula;
        const color = params.color || this.nextColor();
        const width = Math.max(1, Math.min(5, Number(params.width) || 2));
        const paneIndex = record.kind === "pane" ? this.nextPaneIndex() : 0;
        let series;
        if (params.draw === "histogram") {
          series = this.chart.addSeries(HistogramSeries, { color }, paneIndex);
        } else if (params.draw === "area") {
          series = this.chart.addSeries(
            AreaSeries,
            {
              lineColor: color,
              topColor: `${color}55`,
              bottomColor: `${color}05`,
              lineWidth: width,
            },
            paneIndex,
          );
        } else {
          series = this.chart.addSeries(
            LineSeries,
            { color, lineWidth: width },
            paneIndex,
          );
        }
        series.setData(data);
        record.series.push({ series, color });
        if (record.kind === "pane") this.finalizePane(record);
      } catch (error) {
        this.setStatus(`Custom indicator error: ${error.message}`);
        return false;
      }
    } else {
      this.setStatus(`Unknown indicator type: ${type}`);
      return false;
    }

    this.indicators.push(record);
    this.renderIndicatorList();
    return true;
  }

  removeIndicator(id) {
    const indicator = this.indicators.find((item) => item.id === id);
    if (!indicator) return;
    let paneIndex = null;
    if (indicator.kind === "pane" && indicator.pane) {
      try {
        paneIndex = indicator.pane.paneIndex();
      } catch (_error) {
        paneIndex = null;
      }
    }
    indicator.series.forEach(({ series }) => this.chart.removeSeries(series));
    if (paneIndex !== null) {
      try {
        this.chart.removePane(paneIndex);
      } catch (_error) {
        // Lightweight Charts may already remove an empty pane.
      }
    }
    this.indicators = this.indicators.filter((item) => item.id !== id);
    this.renderIndicatorList();
  }

  renderIndicatorList() {
    const list = this.indicatorListElement;
    if (!list) return;
    list.replaceChildren();
    if (!this.indicators.length) {
      const item = document.createElement("li");
      item.className = "empty-note";
      item.textContent = "None added yet.";
      list.appendChild(item);
      return;
    }
    this.indicators.forEach((indicator) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = indicator.series[0].color;
      label.append(swatch, document.createTextNode(indicator.label));
      const button = document.createElement("button");
      button.textContent = "Remove";
      button.addEventListener("click", () => this.removeIndicator(indicator.id));
      item.append(label, button);
      list.appendChild(item);
    });
  }
}

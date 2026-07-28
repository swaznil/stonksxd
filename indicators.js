const PRESET_INDICATORS = [
  {
    name: "SMA (20)",
    formula: "SMA(close,20)",
    panel: "overlay",
    draw: "line",
    color: "#3179f5",
    width: 2,
    variables: [],
  },
  {
    name: "EMA (20)",
    formula: "EMA(close,20)",
    panel: "overlay",
    draw: "line",
    color: "#e0a537",
    width: 2,
    variables: [],
  },
  {
    name: "Bollinger Upper (20, 2)",
    formula: "A+2*STDEV(close,20)",
    panel: "overlay",
    draw: "line",
    color: "#7e57c2",
    width: 1,
    variables: [{ name: "A", formula: "SMA(close,20)" }],
  },
  {
    name: "Bollinger Middle (20)",
    formula: "SMA(close,20)",
    panel: "overlay",
    draw: "line",
    color: "#7e57c2",
    width: 1,
    variables: [],
  },
  {
    name: "Bollinger Lower (20, 2)",
    formula: "A-2*STDEV(close,20)",
    panel: "overlay",
    draw: "line",
    color: "#7e57c2",
    width: 1,
    variables: [{ name: "A", formula: "SMA(close,20)" }],
  },

  {
    name: "RSI (14)",
    formula: "RSI(close,14)",
    panel: "pane",
    draw: "line",
    color: "#42a5f5",
    width: 2,
    variables: [],
  },

  {
    name: "MACD Line (12, 26)",
    formula: "A-B",
    panel: "pane",
    draw: "line",
    color: "#3179f5",
    width: 2,
    variables: [
      { name: "A", formula: "EMA(close,12)" },
      { name: "B", formula: "EMA(close,26)" },
    ],
  },
  {
    name: "MACD Signal (9)",
    formula: "EMA(A-B,9)",
    panel: "pane",
    draw: "line",
    color: "#e0a537",
    width: 1,
    variables: [
      { name: "A", formula: "EMA(close,12)" },
      { name: "B", formula: "EMA(close,26)" },
    ],
  },
  {
    name: "MACD Histogram (12, 26, 9)",
    formula: "(A-B)-EMA(A-B,9)",
    panel: "pane",
    draw: "histogram",
    color: "#787b86",
    width: 1,
    variables: [
      { name: "A", formula: "EMA(close,12)" },
      { name: "B", formula: "EMA(close,26)" },
    ],
  },

  {
    name: "ATR (14)",
    formula: "ATR(14)",
    panel: "pane",
    draw: "line",
    color: "#8d6e63",
    width: 2,
    variables: [],
  },
];

function renderPresetOptions() {
  const select = document.getElementById("preset-select");
  if (!select) return;

  select.innerHTML = '<option value="">Start from scratch...</option>';
  PRESET_INDICATORS.forEach((preset, i) => {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = preset.name;
    select.appendChild(option);
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

  customVariables = preset.variables.map((v) => ({ ...v }));
  renderVariableList();
}

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportCustomIndicators() {
  if (customIndicators.length === 0) {
    setStatus("No saved custom indicators to export.");
    return;
  }
  downloadJSON("stonksxd-custom-indicators.json", customIndicators);
  setStatus(`Exported ${customIndicators.length} custom indicator(s).`);
}

function isValidIndicatorDef(def) {
  return (
    def &&
    typeof def.name === "string" &&
    typeof def.formula === "string" &&
    def.name.trim().length > 0 &&
    def.formula.trim().length > 0 &&
    (def.panel === "overlay" || def.panel === "pane") &&
    ["line", "histogram", "area"].includes(def.draw) &&
    /^#[0-9a-f]{6}$/i.test(def.color) &&
    Number.isFinite(Number(def.width)) &&
    Array.isArray(def.variables || [])
  );
}

function validationCandles() {
  if (Array.isArray(candles) && candles.length > 40) return candles;
  return Array.from({ length: 60 }, (_, i) => {
    const close = 100 + Math.sin(i / 4) * 3 + i * 0.1;
    return {
      time: "2000-01-" + String((i % 28) + 1).padStart(2, "0"),
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1000 + i,
    };
  });
}

function normalizeImportedIndicator(def) {
  if (!isValidIndicatorDef(def)) return null;

  const seenVars = new Set();
  const variables = [];
  for (const raw of def.variables || []) {
    if (!raw || typeof raw.formula !== "string") return null;
    const name = String(raw.name || "")
      .trim()
      .toUpperCase();
    const formula = raw.formula.trim();
    if (!/^[A-Z]$/.test(name) || !formula || seenVars.has(name)) return null;
    seenVars.add(name);
    variables.push({ name, formula });
  }

  const normalized = {
    name: def.name.trim(),
    formula: def.formula.trim(),
    panel: def.panel,
    draw: def.draw,
    color: def.color,
    width: Math.max(1, Math.min(5, Math.round(Number(def.width) || 2))),
    variables,
  };

  try {
    evaluateFormula(normalized.formula, validationCandles(), variables);
  } catch (_err) {
    return null;
  }

  return normalized;
}

function importCustomIndicatorsFromFile(file) {
  if (file.size > 1024 * 1024) {
    setStatus("Import error: file is too large.");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const valid = list.map(normalizeImportedIndicator).filter(Boolean);

      if (valid.length === 0) {
        setStatus("No valid indicators found in that file.");
        return;
      }

      const merged = [...valid, ...customIndicators];
      const seen = new Set();
      customIndicators = merged
        .filter((def) => {
          const key = def.name + "::" + def.formula;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 50);

      localStorage.setItem(CUSTOM_KEY, JSON.stringify(customIndicators));
      renderCustomOptions();
      setStatus(`Imported ${valid.length} indicator(s).`);
    } catch (err) {
      setStatus("Import error: " + err.message);
    }
  };
  reader.onerror = () => setStatus("Import error: could not read the file.");
  reader.readAsText(file);
}

function calcSMA(candles, period) {
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) continue;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    out.push({ time: candles[i].time, value: sum / period });
  }

  return out;
}

function calcEMA(candles, period) {
  const out = [];
  const k = 2 / (period + 1);
  let prevEma = null;
  for (let i = 0; i < candles.length; i++) {
    const price = candles[i].close;
    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j <= i; j++) sum += candles[j].close;
      prevEma = sum / period;
      out.push({ time: candles[i].time, value: prevEma });
    } else if (i >= period) {
      prevEma = price * k + prevEma * (1 - k);
      out.push({ time: candles[i].time, value: prevEma });
    }
  }

  return out;
}

function calcBollinger(candles, period, mult) {
  const upper = [];
  const middle = [];
  const lower = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) continue;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    const mean = sum / period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++)
      variance += Math.pow(candles[j].close - mean, 2);
    const sd = Math.sqrt(variance / period);
    middle.push({ time: candles[i].time, value: mean });
    upper.push({ time: candles[i].time, value: mean + mult * sd });
    lower.push({ time: candles[i].time, value: mean - mult * sd });
  }

  return { upper, middle, lower };
}

function calcRSI(candles, period) {
  const out = [];
  if (candles.length <= period) return out;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gainSum += diff;
    else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out.push({
    time: candles[period].time,
    value: rsiFromAverages(avgGain, avgLoss),
  });

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out.push({
      time: candles[i].time,
      value: rsiFromAverages(avgGain, avgLoss),
    });
  }

  return out;
}

function rsiFromAverages(avgGain, avgLoss) {
  if (avgGain === 0 && avgLoss === 0) return 50;
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function emaSeriesFromValues(values, period) {
  const out = [];
  const k = 2 / (period + 1);
  let prevEma = null;
  for (let i = 0; i < values.length; i++) {
    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j <= i; j++) sum += values[j].value;
      prevEma = sum / period;
      out.push({ time: values[i].time, value: prevEma });
    } else if (i >= period) {
      prevEma = values[i].value * k + prevEma * (1 - k);
      out.push({ time: values[i].time, value: prevEma });
    }
  }

  return out;
}

function calcMACD(candles, fastPeriod, slowPeriod, signalPeriod) {
  const closesSeries = candles.map((c) => ({ time: c.time, value: c.close }));
  const fastEma = emaValuesFull(closesSeries, fastPeriod);
  const slowEma = emaValuesFull(closesSeries, slowPeriod);

  const macdLine = [];
  const slowMap = new Map(slowEma.map((p) => [p.time, p.value]));
  for (const p of fastEma) {
    if (slowMap.has(p.time)) {
      macdLine.push({ time: p.time, value: p.value - slowMap.get(p.time) });
    }
  }

  const signalLine = emaSeriesFromValues(macdLine, signalPeriod);
  const signalMap = new Map(signalLine.map((p) => [p.time, p.value]));
  const histogram = [];
  for (const p of macdLine) {
    if (signalMap.has(p.time)) {
      histogram.push({ time: p.time, value: p.value - signalMap.get(p.time) });
    }
  }

  return { macdLine, signalLine, histogram };
}

function emaValuesFull(series, period) {
  const out = [];
  const k = 2 / (period + 1);
  let prevEma = null;
  for (let i = 0; i < series.length; i++) {
    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j <= i; j++) sum += series[j].value;
      prevEma = sum / period;
      out.push({ time: series[i].time, value: prevEma });
    } else if (i >= period) {
      prevEma = series[i].value * k + prevEma * (1 - k);
      out.push({ time: series[i].time, value: prevEma });
    }
  }

  return out;
}

function calcATR(candles, period) {
  const trueRanges = [];
  for (let i = 0; i < candles.length; i++) {
    const prevClose = i > 0 ? candles[i - 1].close : candles[i].close;
    trueRanges.push({
      time: candles[i].time,
      value: Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - prevClose),
        Math.abs(candles[i].low - prevClose),
      ),
    });
  }
  return rmaSeriesFromValues(trueRanges, period);
}

function calcVWAP(candles) {
  const out = [];
  let pvSum = 0;
  let volumeSum = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    pvSum += typical * c.volume;
    volumeSum += c.volume;
    if (volumeSum > 0) out.push({ time: c.time, value: pvSum / volumeSum });
  }
  return out;
}

function calcStochastic(candles, period) {
  const kLine = [];
  for (let i = period - 1; i < candles.length; i++) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      highest = Math.max(highest, candles[j].high);
      lowest = Math.min(lowest, candles[j].low);
    }
    const range = highest - lowest;
    kLine.push({
      time: candles[i].time,
      value: range === 0 ? 50 : ((candles[i].close - lowest) / range) * 100,
    });
  }
  const dLine = emaSeriesFromValues(kLine, 3);
  return { kLine, dLine };
}

function evaluateFormula(formula, candles, variableDefs = []) {
  const tokens = tokenizeFormula(formula);
  let pos = 0;
  const variableMap = buildVariableMap(variableDefs);
  const variableCache = new Map();

  function peek() {
    return tokens[pos];
  }

  function take(type, value) {
    const token = peek();
    if (!token || token.type !== type || (value && token.value !== value)) {
      throw new Error(`Expected ${value || type}`);
    }
    pos++;
    return token;
  }

  function parseExpression() {
    let node = parseTerm();
    while (peek() && (peek().value === "+" || peek().value === "-")) {
      const op = take("op").value;
      node = { type: "binary", op, left: node, right: parseTerm() };
    }
    return node;
  }

  function parseTerm() {
    let node = parseFactor();
    while (peek() && (peek().value === "*" || peek().value === "/")) {
      const op = take("op").value;
      node = { type: "binary", op, left: node, right: parseFactor() };
    }
    return node;
  }

  function parseFactor() {
    const token = peek();
    if (!token) throw new Error("Unexpected end of formula");
    if (token.value === "-") {
      take("op", "-");
      return { type: "unary", op: "-", expr: parseFactor() };
    }
    if (token.type === "number") {
      take("number");
      return { type: "number", value: token.value };
    }
    if (token.type === "ident") {
      const name = take("ident").value;
      if (peek() && peek().value === "(") {
        take("paren", "(");
        const args = [];
        if (!peek() || peek().value !== ")") {
          do {
            args.push(parseExpression());
            if (!peek() || peek().value !== ",") break;
            take("comma", ",");
          } while (true);
        }
        take("paren", ")");
        return { type: "call", name, args };
      }
      return { type: "ident", name };
    }
    if (token.value === "(") {
      take("paren", "(");
      const node = parseExpression();
      take("paren", ")");
      return node;
    }
    throw new Error(`Unexpected token "${token.value}"`);
  }

  const ast = parseExpression();
  if (pos !== tokens.length)
    throw new Error(`Unexpected token "${peek().value}"`);
  const result = evalFormulaNode(ast, candles, variableMap, variableCache, []);
  return seriesToChartData(asSeries(result, candles.length).values, candles);
}

function buildVariableMap(variableDefs) {
  const map = new Map();
  (variableDefs || []).forEach((def) => {
    if (!def || !def.name || !def.formula) return;
    const name = String(def.name).trim().toUpperCase();
    if (/^[A-Z]$/.test(name)) map.set(name, String(def.formula).trim());
  });
  return map;
}

function tokenizeFormula(formula) {
  const tokens = [];
  let i = 0;
  while (i < formula.length) {
    const ch = formula[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      let raw = ch;
      i++;
      while (i < formula.length && /[0-9.]/.test(formula[i]))
        raw += formula[i++];
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Invalid number "${raw}"`);
      tokens.push({ type: "number", value });
    } else if (/[a-z_]/i.test(ch)) {
      let raw = ch;
      i++;
      while (i < formula.length && /[a-z0-9_]/i.test(formula[i]))
        raw += formula[i++];
      tokens.push({ type: "ident", value: raw });
    } else if ("+-*/".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
    } else if ("()".includes(ch)) {
      tokens.push({ type: "paren", value: ch });
      i++;
    } else if (ch === ",") {
      tokens.push({ type: "comma", value: ch });
      i++;
    } else {
      throw new Error(`Invalid character "${ch}"`);
    }
  }
  return tokens;
}

function evalFormulaNode(
  node,
  candles,
  variableMap = new Map(),
  variableCache = new Map(),
  stack = [],
) {
  if (node.type === "number") return { kind: "scalar", value: node.value };
  if (node.type === "ident") {
    const name = node.name.toUpperCase();
    if (variableMap.has(name)) {
      return evalVariable(name, candles, variableMap, variableCache, stack);
    }
    return candleField(node.name, candles);
  }
  if (node.type === "unary")
    return mapSeries(
      evalFormulaNode(node.expr, candles, variableMap, variableCache, stack),
      (v) => -v,
      candles.length,
    );
  if (node.type === "binary") {
    return combineSeries(
      evalFormulaNode(node.left, candles, variableMap, variableCache, stack),
      evalFormulaNode(node.right, candles, variableMap, variableCache, stack),
      node.op,
      candles.length,
    );
  }
  if (node.type === "call") {
    const args = node.args.map((arg) =>
      evalFormulaNode(arg, candles, variableMap, variableCache, stack),
    );
    return callFormulaFunction(node.name, args, candles.length, candles);
  }
  throw new Error("Invalid formula");
}

function evalVariable(name, candles, variableMap, variableCache, stack) {
  if (variableCache.has(name)) return variableCache.get(name);
  if (stack.includes(name)) {
    throw new Error(
      `Variable cycle detected: ${[...stack, name].join(" -> ")}`,
    );
  }
  const formula = variableMap.get(name);
  const result = evalFormulaRaw(formula, candles, variableMap, variableCache, [
    ...stack,
    name,
  ]);
  variableCache.set(name, result);
  return result;
}

function evalFormulaRaw(formula, candles, variableMap, variableCache, stack) {
  const tokens = tokenizeFormula(formula);
  let pos = 0;

  function peek() {
    return tokens[pos];
  }

  function take(type, value) {
    const token = peek();
    if (!token || token.type !== type || (value && token.value !== value)) {
      throw new Error(`Expected ${value || type}`);
    }
    pos++;
    return token;
  }

  function parseExpression() {
    let node = parseTerm();
    while (peek() && (peek().value === "+" || peek().value === "-")) {
      const op = take("op").value;
      node = { type: "binary", op, left: node, right: parseTerm() };
    }
    return node;
  }

  function parseTerm() {
    let node = parseFactor();
    while (peek() && (peek().value === "*" || peek().value === "/")) {
      const op = take("op").value;
      node = { type: "binary", op, left: node, right: parseFactor() };
    }
    return node;
  }

  function parseFactor() {
    const token = peek();
    if (!token) throw new Error("Unexpected end of formula");
    if (token.value === "-") {
      take("op", "-");
      return { type: "unary", op: "-", expr: parseFactor() };
    }
    if (token.type === "number") {
      take("number");
      return { type: "number", value: token.value };
    }
    if (token.type === "ident") {
      const name = take("ident").value;
      if (peek() && peek().value === "(") {
        take("paren", "(");
        const args = [];
        if (!peek() || peek().value !== ")") {
          do {
            args.push(parseExpression());
            if (!peek() || peek().value !== ",") break;
            take("comma", ",");
          } while (true);
        }
        take("paren", ")");
        return { type: "call", name, args };
      }
      return { type: "ident", name };
    }
    if (token.value === "(") {
      take("paren", "(");
      const node = parseExpression();
      take("paren", ")");
      return node;
    }
    throw new Error(`Unexpected token "${token.value}"`);
  }

  const ast = parseExpression();
  if (pos !== tokens.length)
    throw new Error(`Unexpected token "${peek().value}"`);
  return evalFormulaNode(ast, candles, variableMap, variableCache, stack);
}

function candleField(name, candles) {
  const key = name.toLowerCase();
  if (!["open", "high", "low", "close", "volume"].includes(key)) {
    throw new Error(`Unknown field "${name}"`);
  }
  return { kind: "series", values: candles.map((c) => c[key]) };
}

function callFormulaFunction(name, args, length) {
  const fn = name.toUpperCase();
  if (fn === "SMA")
    return rollingAverage(asSeries(args[0], length), asPeriod(args[1]));
  if (fn === "EMA")
    return rollingEma(asSeries(args[0], length), asPeriod(args[1]));
  if (fn === "RSI")
    return rollingRsi(asSeries(args[0], length), asPeriod(args[1]));
  if (fn === "STDEV")
    return rollingStdDev(asSeries(args[0], length), asPeriod(args[1]));
  if (fn === "MAX")
    return rollingExtreme(
      asSeries(args[0], length),
      asPeriod(args[1]),
      Math.max,
    );
  if (fn === "MIN")
    return rollingExtreme(
      asSeries(args[0], length),
      asPeriod(args[1]),
      Math.min,
    );
  if (fn === "ATR") return rollingAtr(candles, asPeriod(args[0]), length);
  if (fn === "ABS") return mapSeries(args[0], Math.abs, length);
  throw new Error(`Unknown function "${name}"`);
}

function asPeriod(arg) {
  if (!arg || arg.kind !== "scalar" || arg.value < 1) {
    throw new Error("Period must be a positive number");
  }
  return Math.round(arg.value);
}

function asSeries(value, length) {
  if (!value) throw new Error("Missing formula argument");
  if (value.kind === "series") return value;
  return { kind: "series", values: Array.from({ length }, () => value.value) };
}

function mapSeries(value, mapper, length) {
  if (value.kind === "scalar")
    return { kind: "scalar", value: mapper(value.value) };
  return {
    kind: "series",
    values: value.values.map((v) => (isValidNumber(v) ? mapper(v) : null)),
  };
}

function combineSeries(left, right, op, length) {
  if (left.kind === "scalar" && right.kind === "scalar") {
    return {
      kind: "scalar",
      value: applyOperator(left.value, right.value, op),
    };
  }
  const l = asSeries(left, length).values;
  const r = asSeries(right, length).values;
  return {
    kind: "series",
    values: l.map((lv, i) =>
      isValidNumber(lv) && isValidNumber(r[i])
        ? applyOperator(lv, r[i], op)
        : null,
    ),
  };
}

function applyOperator(a, b, op) {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  if (op === "/") return b === 0 ? null : a / b;
  return null;
}

function rollingAverage(series, period) {
  const values = Array(series.values.length).fill(null);
  for (let i = period - 1; i < series.values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (isValidNumber(series.values[j])) {
        sum += series.values[j];
        count++;
      }
    }
    if (count === period) values[i] = sum / period;
  }
  return { kind: "series", values };
}

function rollingEma(series, period) {
  const values = Array(series.values.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < series.values.length; i++) {
    const value = series.values[i];
    if (!isValidNumber(value)) continue;
    if (prev == null) {
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - period + 1); j <= i; j++) {
        if (isValidNumber(series.values[j])) {
          sum += series.values[j];
          count++;
        }
      }
      if (count === period) {
        prev = sum / period;
        values[i] = prev;
      }
    } else {
      prev = value * k + prev * (1 - k);
      values[i] = prev;
    }
  }
  return { kind: "series", values };
}

function rollingStdDev(series, period) {
  const values = Array(series.values.length).fill(null);
  for (let i = period - 1; i < series.values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (isValidNumber(series.values[j])) {
        sum += series.values[j];
        count++;
      }
    }
    if (count !== period) continue;
    const mean = sum / period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      variance += Math.pow(series.values[j] - mean, 2);
    }
    values[i] = Math.sqrt(variance / period);
  }
  return { kind: "series", values };
}

function rollingExtreme(series, period, reducer) {
  const values = Array(series.values.length).fill(null);
  for (let i = period - 1; i < series.values.length; i++) {
    let value = reducer === Math.max ? -Infinity : Infinity;
    let count = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (isValidNumber(series.values[j])) {
        value = reducer(value, series.values[j]);
        count++;
      }
    }
    if (count === period) values[i] = value;
  }
  return { kind: "series", values };
}

function rmaSeriesFromValues(series, period) {
  const out = [];
  let prev = null;
  for (let i = 0; i < series.length; i++) {
    const value = series[i].value;
    if (!isValidNumber(value)) continue;
    if (prev == null) {
      if (i < period - 1) continue;
      let sum = 0;
      let count = 0;
      for (let j = i - period + 1; j <= i; j++) {
        if (isValidNumber(series[j].value)) {
          sum += series[j].value;
          count++;
        }
      }
      if (count !== period) continue;
      prev = sum / period;
    } else {
      prev = (prev * (period - 1) + value) / period;
    }
    out.push({ time: series[i].time, value: prev });
  }
  return out;
}

function rollingAtr(candles, period, length) {
  const values = Array(length).fill(null);
  const data = calcATR(candles, period);
  const timeIndex = new Map(candles.map((c, i) => [c.time, i]));
  for (const point of data) {
    const i = timeIndex.get(point.time);
    if (i != null) values[i] = point.value;
  }
  return { kind: "series", values };
}

function rollingRsi(series, period) {
  const values = Array(series.values.length).fill(null);
  let avgGain = null;
  let avgLoss = null;
  let start = 0;
  for (let i = 1; i < series.values.length; i++) {
    if (
      !isValidNumber(series.values[i]) ||
      !isValidNumber(series.values[i - 1])
    ) {
      avgGain = null;
      avgLoss = null;
      start = i;
      continue;
    }
    if (avgGain == null || avgLoss == null) {
      if (i - start < period) continue;
      let gainSum = 0;
      let lossSum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const diff = series.values[j] - series.values[j - 1];
        if (diff >= 0) gainSum += diff;
        else lossSum -= diff;
      }
      avgGain = gainSum / period;
      avgLoss = lossSum / period;
    } else {
      const diff = series.values[i] - series.values[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    }
    values[i] = rsiFromAverages(avgGain, avgLoss);
  }
  return { kind: "series", values };
}

function seriesToChartData(values, candles) {
  return values
    .map((value, i) => ({ time: candles[i].time, value }))
    .filter((p) => isValidNumber(p.value));
}

function isValidNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

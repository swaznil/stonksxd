import { calcEMA, calcMACD, calcRSI, calcSMA } from "./indicators.js";

const RULE_TYPES = [
  ["rsi", "RSI value"],
  ["sma", "Price / SMA cross"],
  ["ema", "Price / EMA cross"],
  ["macd", "MACD / signal cross"],
];

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1)
    throw new Error(`${label} must be a positive whole number.`);
  return number;
}

function alignSeries(candles, points) {
  const valuesByTime = new Map(
    points.map((point) => [point.time, point.value]),
  );
  return candles.map((candle) => valuesByTime.get(candle.time) ?? null);
}

function buildRuleSignal(candles, rule) {
  const closes = candles.map((candle) => candle.close);
  const direction = rule.direction === "below" ? "below" : "above";
  if (rule.type === "rsi") {
    const period = positiveInteger(rule.period, "RSI period");
    const threshold = Number(rule.threshold);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      throw new Error("RSI level must be between 0 and 100.");
    }
    const values = alignSeries(candles, calcRSI(candles, period));
    return values.map(
      (value) =>
        value != null &&
        (direction === "above" ? value > threshold : value < threshold),
    );
  }

  if (rule.type === "sma" || rule.type === "ema") {
    const period = positiveInteger(
      rule.period,
      `${rule.type.toUpperCase()} period`,
    );
    const points =
      rule.type === "sma" ? calcSMA(candles, period) : calcEMA(candles, period);
    const average = alignSeries(candles, points);
    return closes.map((price, i) => {
      if (i === 0 || average[i] == null || average[i - 1] == null) return false;
      return direction === "above"
        ? closes[i - 1] <= average[i - 1] && price > average[i]
        : closes[i - 1] >= average[i - 1] && price < average[i];
    });
  }

  if (rule.type === "macd") {
    const fast = positiveInteger(rule.fast, "MACD fast period");
    const slow = positiveInteger(rule.slow, "MACD slow period");
    const signalPeriod = positiveInteger(rule.signal, "MACD signal period");
    if (slow <= fast)
      throw new Error("MACD slow period must be greater than its fast period.");
    const calculated = calcMACD(candles, fast, slow, signalPeriod);
    const macd = alignSeries(candles, calculated.macdLine);
    const signal = alignSeries(candles, calculated.signalLine);
    return macd.map((value, i) => {
      if (
        i === 0 ||
        value == null ||
        signal[i] == null ||
        macd[i - 1] == null ||
        signal[i - 1] == null
      )
        return false;
      return direction === "above"
        ? macd[i - 1] <= signal[i - 1] && value > signal[i]
        : macd[i - 1] >= signal[i - 1] && value < signal[i];
    });
  }
  throw new Error("Choose a valid rule type.");
}

export function runStrategyBacktest(candles, options = {}) {
  if (!Array.isArray(candles) || candles.length < 2)
    throw new Error("The selected sample has too few rows.");
  const initialCapital = Number(options.initialCapital);
  const positionPercent = Number(options.positionPercent);
  if (!Number.isFinite(initialCapital) || initialCapital <= 0)
    throw new Error("Starting cash must be greater than zero.");
  if (
    !Number.isFinite(positionPercent) ||
    positionPercent <= 0 ||
    positionPercent > 100
  ) {
    throw new Error("Position size must be between 1% and 100%.");
  }
  if (
    !options.startDate ||
    !options.endDate ||
    options.startDate > options.endDate
  ) {
    throw new Error("Choose a valid From and To date range.");
  }
  const closes = candles.map((candle) => Number(candle.close));
  if (closes.some((price) => !Number.isFinite(price) || price <= 0))
    throw new Error("The sample contains invalid close prices.");
  const activeIndices = candles
    .map((candle, i) => ({ candle, i }))
    .filter(
      ({ candle }) =>
        candle.time >= options.startDate && candle.time <= options.endDate,
    )
    .map(({ i }) => i);
  if (!activeIndices.length)
    throw new Error("No price rows fall inside that date range.");

  const buySignal = buildRuleSignal(candles, options.buyRule || {});
  const sellSignal = buildRuleSignal(candles, options.sellRule || {});
  const trades = [];
  let cash = initialCapital;
  let shares = 0;
  let entry = null;
  for (const i of activeIndices) {
    if (!shares && buySignal[i]) {
      const allocation = cash * (positionPercent / 100);
      shares = allocation / closes[i];
      cash -= allocation;
      entry = { time: candles[i].time, price: closes[i] };
    } else if (shares && sellSignal[i]) {
      cash += shares * closes[i];
      trades.push({
        entryTime: entry.time,
        entryPrice: entry.price,
        exitTime: candles[i].time,
        exitPrice: closes[i],
        profit: shares * (closes[i] - entry.price),
      });
      shares = 0;
      entry = null;
    }
  }
  if (shares) {
    const lastIndex = activeIndices.at(-1);
    cash += shares * closes[lastIndex];
    trades.push({
      entryTime: entry.time,
      entryPrice: entry.price,
      exitTime: candles[lastIndex].time,
      exitPrice: closes[lastIndex],
      profit: shares * (closes[lastIndex] - entry.price),
      forcedExit: true,
    });
  }
  const netProfit = cash - initialCapital;
  const wins = trades.filter((trade) => trade.profit > 0).length;
  return {
    initialCapital,
    finalValue: cash,
    netProfit,
    returnPercent: (netProfit / initialCapital) * 100,
    trades,
    wins,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
  };
}

function money(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function renderRuleEditor(container, prefix, defaults) {
  container.innerHTML = `
    <div class="form-row"><label for="${prefix}-type">Indicator</label><select id="${prefix}-type"></select></div>
    <div id="${prefix}-parameters" class="rule-parameters"></div>`;
  const typeSelect = document.getElementById(`${prefix}-type`);
  
  RULE_TYPES.forEach(([value, label]) =>
    typeSelect.add(new Option(label, value)),
  );
  typeSelect.value = defaults.type;

  const renderParameters = () => {
    const target = document.getElementById(`${prefix}-parameters`);
    const type = typeSelect.value;

    if (type === "rsi") {
      target.innerHTML = `
        <div class="form-row">
          <label for="${prefix}-period">Period</label>
          <input id="${prefix}-period" type="number" min="1" step="1" value="14" required>
        </div>
        <div class="form-row">
          <label for="${prefix}-direction">Condition</label>
          <select id="${prefix}-direction">
            <option value="above">is above</option>
            <option value="below">is below</option>
          </select>
        </div>
        <div class="form-row">
          <label for="${prefix}-threshold">RSI Level</label>
          <input id="${prefix}-threshold" type="number" min="0" max="100" step="1" value="${defaults.threshold}" required>
        </div>`;
    } else if (type === "sma" || type === "ema") {
      target.innerHTML = `
        <div class="form-row">
          <label for="${prefix}-period">Period</label>
          <input id="${prefix}-period" type="number" min="1" step="1" value="20" required>
        </div>
        <div class="form-row">
          <label for="${prefix}-direction">Condition</label>
          <select id="${prefix}-direction">
            <option value="above">price crosses above</option>
            <option value="below">price crosses below</option>
          </select>
        </div>`;
    } else {
      target.innerHTML = `
        <div class="form-row">
          <label for="${prefix}-fast">Fast</label>
          <input id="${prefix}-fast" type="number" min="1" step="1" value="12" required>
        </div>
        <div class="form-row">
          <label for="${prefix}-slow">Slow</label>
          <input id="${prefix}-slow" type="number" min="2" step="1" value="26" required>
        </div>
        <div class="form-row">
          <label for="${prefix}-signal">Signal</label>
          <input id="${prefix}-signal" type="number" min="1" step="1" value="9" required>
        </div>
        <div class="form-row">
          <label for="${prefix}-direction">Condition</label>
          <select id="${prefix}-direction">
            <option value="above">crosses above signal</option>
            <option value="below">crosses below signal</option>
          </select>
        </div>`;
    }

    document.getElementById(`${prefix}-direction`).value = defaults.direction;
  };

  typeSelect.addEventListener("change", renderParameters);
  renderParameters();
}

function readRule(prefix) {
  const type = document.getElementById(`${prefix}-type`).value;
  const rule = {
    type, direction: document.getElementById(`${prefix}-direction`).value,
  };
  if (type === "macd") {
    rule.fast = document.getElementById(`${prefix}-fast`).value;
    rule.slow = document.getElementById(`${prefix}-slow`).value;
    rule.signal = document.getElementById(`${prefix}-signal`).value;
  } else {
    rule.period = document.getElementById(`${prefix}-period`).value;
    if (type === "rsi")
      rule.threshold = document.getElementById(`${prefix}-threshold`).value;
  }
  return rule;
}

function renderResults(element, result) {
  element.replaceChildren();
  const metrics = document.createElement("div");
  metrics.className = "backtest-metrics";
  [
    ["Final value", money(result.finalValue)],
    ["Net profit", money(result.netProfit)],
    ["Return", `${result.returnPercent.toFixed(2)}%`],
    ["Trades", String(result.trades.length)],
    ["Win rate", `${result.winRate.toFixed(1)}%`],
  ].forEach(([label, value], index) => {
    const item = document.createElement("div");
    if ((index === 1 || index === 2) && result.netProfit !== 0)
      item.className = result.netProfit > 0 ? "positive" : "negative";
    const name = document.createElement("span");
    name.textContent = label;
    const amount = document.createElement("strong");
    amount.textContent = value;
    item.append(name, amount);
    metrics.appendChild(item);

  });
  element.appendChild(metrics);

  if (!result.trades.length) {
    const note = document.createElement("p");
    note.className = "empty-note backtest-empty";
    note.textContent = "No trades matched both rules in this date range.";
    element.appendChild(note);
  } else {
    const wrapper = document.createElement("div");
    wrapper.className = "backtest-table-wrap";
    const table = document.createElement("table");
    table.className = "backtest-table";
    table.innerHTML =
      "<thead><tr><th>Entry</th><th>Exit</th><th>Buy</th><th>Sell</th><th>P/L</th></tr></thead>";
    const body = document.createElement("tbody");

    result.trades.forEach((trade) => {
      const row = document.createElement("tr");
      [
        trade.entryTime,
        trade.exitTime,
        money(trade.entryPrice),
        money(trade.exitPrice),
        money(trade.profit),
      ].forEach((value, index) => {
        const cell = document.createElement("td");
        cell.textContent = value;

        if (index === 4)
          cell.className = trade.profit >= 0 ? "positive" : "negative";
        row.appendChild(cell);
      });

      body.appendChild(row);
    });

    table.appendChild(body);
    wrapper.appendChild(table);
    element.appendChild(wrapper);
  }

  element.hidden = false;
}

export function setupBacktest({
  getCandles,
  getCurrentSample,
  sampleNames,
  loadSample,
  openModal,
  closeModal,
  setStatus,
}) {

  const modal = document.getElementById("backtest-modal");
  const form = document.getElementById("backtest-form");
  const results = document.getElementById("backtest-results");
  const sampleSelect = document.getElementById("backtest-sample");

  sampleNames.forEach((name) => sampleSelect.add(new Option(name, name)));

  renderRuleEditor(document.getElementById("backtest-buy-rule"), "buy-rule", {
    type: "rsi",
    direction: "below",
    threshold: 30,
  });

  renderRuleEditor(document.getElementById("backtest-sell-rule"), "sell-rule", {
    type: "rsi",
    direction: "above",
    threshold: 70,
  });

  function setDateRange(candles) {
    if (!candles.length) return;
    const start = document.getElementById("backtest-start");
    const end = document.getElementById("backtest-end");
    start.value = start.min = candles[0].time;
    end.value = end.max = candles.at(-1).time;
    start.max = end.max;
    end.min = start.min;
  }

  document.getElementById("backtest-btn").addEventListener("click", () => {
    if (!getCandles().length) {
      setStatus("Load a sample before running a backtest.");
      return;
    }
    sampleSelect.value = getCurrentSample();
    setDateRange(getCandles());
    results.hidden = true;
    openModal(modal, sampleSelect);
  });

  sampleSelect.addEventListener("change", async () => {
    try {
      setDateRange(await loadSample(sampleSelect.value));
    } catch (error) {
      setStatus(`Backtest sample error: ${error.message}`);
    }
  });

  document
    .getElementById("backtest-close")
    .addEventListener("click", () => closeModal(modal));
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal(modal);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      setStatus(`Running backtest on ${sampleSelect.value}...`);
      const result = runStrategyBacktest(await loadSample(sampleSelect.value), {
        startDate: document.getElementById("backtest-start").value,
        endDate: document.getElementById("backtest-end").value,
        buyRule: readRule("buy-rule"),
        sellRule: readRule("sell-rule"),
        initialCapital: document.getElementById("backtest-capital").value,
        positionPercent: document.getElementById("backtest-size").value,
      });
      renderResults(results, result);
      setStatus(
        `Backtest complete: ${result.trades.length} trade(s), ${result.returnPercent.toFixed(2)}% return.`,
      );
    } catch (error) {
      results.hidden = true;
      setStatus(`Backtest error: ${error.message}`);
    }
  });
}

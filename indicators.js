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
  if (avgLoss === 0) return 100;
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
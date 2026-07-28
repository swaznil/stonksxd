# StonksxD

StonksxD is browser-based candlestick chart which loads daily OHLCV CSV data, displays it. You can add technical indicators and even build one yourself.

It is very lightweight: There is no backend, account system, or anything else.

## features

- Load the included sample stocks or import your own CSV file
- Show candlesticks with OHLC and volume data
- Add SMA, EMA, Bollinger Bands, RSI, MACD, ATR, VWAP, and Stochastic indicators
- Create, save, import, and export custom formula indicators
- Add trend lines, rays, horizontal lines, Fibonacci retracements, and other chart annotations

## Getting started

You can try the demo on

```text
stonksxd.vercel.app
```

## CSV format

The loader expects these columns:

```text
published_date,open,high,low,close,traded_quantity
```

`published_date`, `open`, `high`, `low`, and `close` are required. `traded_quantity` is optional and is used for volume.

## Project files

```text
stonksxd
├── README.md
├── app.js
├── custom-indicator.css
├── data
│   ├── sample01.csv
│   ├── sample02.csv
│   ├── sample03.csv
│   ├── sample04.csv
│   └── sample05.csv
├── drawing-tools.js
├── index.html
├── indicators.js
└── style.css
```

- `index.html` contains the page layout and modal markup.
- `style.css` contains the main layout, responsive styles, and themes.
- `custom-indicator.css` contains the indicator-builder modal styles.
- `app.js` connects the chart, CSV loading, indicators, themes, and UI.
- `indicators.js` contains built-in and formula indicator calculations.
- `drawing-tools.js` contains the chart drawing manager and drawing primitives.
- `data/` contains the sample CSV files.

## Tech stack
-  HTML
- CSS
- Javascript 
- Lightweight Charts for rendering
- Papa Parse for CSV parsing
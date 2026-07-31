# stonksxd

StonksxD is a technical analysis platform that allows users to to build, visualize, and backtest custom indicators. It is made with vanilla HTML, CSS and JavaScript. It lets you load OHLCV CSV data, view candlestick charts, add indicators, create custom formula indicators and draw directly on the chart.

StonksxD is both a learning project and a practical useful tool. As makes it easy to prototype and evaluate custom indicators.


## Motivation

I came across a competition about building stock market indicators, the ability to create custom indicators without complex scripts really fascinated me and I wanted to build one platform some myself. So to learn about how it works and to make my own version of it I started stonksxd. I was really lost in the begining not knowing where to start so I used AI agents to build me a workable demo. After understanding the code structure and grasping a mental map, I started adding special features myself.

After custom indicator section was completed and everything worked fine, it felt empty and of no use like just another trading chart wanabe that looks vibecoded. So I started comming up with more ideas, and the most useful idea hit me which was a backtesting engine. The platform I was competing on for custom indicator had no ability to test it so I added that feature on stonksxd which is really useful for me to test my own strategies. Finally for the real data to test these on I got some scraped data of some random companies listed in NEPSE.


## Live Demo

Project can be run by cloning the repository and opening it with a local server, or directly through the link:

stonksxd.vercel.app

---

## Features

- Load candlestick chart from CSV file
- Analyse the chart with built in Indicators
- Create, import, export custom indicators
- Backtest indicator based strategies
- SMA, EMA, Bollinger Bands, RSI, MACD, ATR, VWAP, and Stochastic indicators
- Plot on chart with trend lines, rays, horizontal lines, Fibonacci retracements, and other annotations
- Dark and light theme support

---

## Built In Indicators

- Simple Moving Average (SMA)
- Exponential Moving Average (EMA)
- Bollinger Bands
- Volume
- RSI
- MACD
- ATR
- VWAP
- Stochastic

---

## Drawing Tools

- Trend line
- Ray
- Horizontal line
- Vertical line
- Rectangle
- Fibonacci retracement
- Text labels
- Delete and clear drawing controls

---

## Screenshots

![StonksxD Chart Example](assets/screenshotchart.png)

![StonksxD Custom Indicator Builder](assets/screenshotindicator.png)

---

## CSV Format

The CSV loader expects data in this format:

```text
published_date,open,high,low,close,traded_quantity
```

Required columns:

- `published_date`
- `open`
- `high`
- `low`
- `close`

Optional column:

- `traded_quantity`

`traded_quantity` is used for volume if it is available.

---

## Tech Stack

- HTML
- CSS
- JavaScript
- Lightweight Charts
- Papa Parse

---

## Project Structure

```text
stonksxd
├── README.md
├── assets
│   ├── screenshotchart.png
│   └── screenshotindicator.png
├── css
│   ├── backtest.css
│   ├── base.css
│   ├── components.css
│   └── custom-indicator.css
├── data
│   ├── sample01.csv
│   ├── sample02.csv
│   ├── sample03.csv
│   ├── sample04.csv
│   └── sample05.csv
├── index.html
└── js
    ├── app.js
    ├── backtest.js
    ├── chart.js
    ├── data.js
    ├── drawing-tools.js
    └── indicators.js
```

---

## How It Works

The app loads data from CSV files using Papa Parse. The data is converted into daily candlestick format then rendered on the chart using Lightweight Charts.

Each candle contains open, high, low and close (OHLC) values. Built in indicators are calculated in JavaScript. Some indicators are drawn directly over the price chart, while others are displayed in their own pane. Custom indicators can be build using fields like `open`, `high`, `low`, `close` and `volume`, along with functions like `SMA`, `EMA`, `RSI`, `ATR`, `MAX`, `MIN`, `STDEV` and `ABS`. Drawings are handled separately from the indicators. Small preferences like selected stock, theme and custom indicators are saved in browser LocalStorage.

---

## AI Usage

ChatGPT and Codex were used for debugging code, helping build chart logic and indicator calculations improving code structure.
All project decisions, design choices, implementation and final testing were done by me.

---
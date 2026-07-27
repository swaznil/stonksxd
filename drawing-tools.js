const DRAW_COLOR = "#e0a537";
const ACTIVE_HIT_RADIUS = 8;
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_COLORS = [
  "#787b86",
  "#f0504d",
  "#e0a537",
  "#2c7ef9",
  "#28b3a5",
  "#7e57c2",
  "#787b86",
];

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  const tt = clamp(t, 0, 1);
  const cx = x1 + tt * dx;
  const cy = y1 + tt * dy;
  return Math.hypot(px - cx, py - cy);
}

function pointToInfiniteRayDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);

  const t = ((px - x1) * dx + (py - y1) * dy) / len2;
  if (t < 0) return Math.hypot(px - x1, py - y1);

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function rectContains(px, py, x1, y1, x2, y2) {
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  return px >= left && px <= right && py >= top && py <= bottom;
}

class DrawingPrimitiveBase {
  constructor(chart, series) {
    this._chart = chart;
    this._series = series;
    this._paneViews = [this._makePaneView()];
  }

  updateAllViews() {}

  paneViews() {
    return this._paneViews;
  }

  _makePaneView() {
    const self = this;
    return {
      renderer() {
        return {
          draw(target) {
            target.useBitmapCoordinateSpace((scope) => {
              self._draw(scope);
            });
          },
        };
      },
    };
  }

  _timeToX(time) {
    return this._chart.timeScale().timeToCoordinate(time);
  }

  _priceToY(price) {
    return this._series.priceToCoordinate(price);
  }

  _draw() {}
  hitTest() {
    return null;
  }
  getHandlePoint() {
    return null;
  }
}

class TrendLinePrimitive extends DrawingPrimitiveBase {
  constructor(chart, series, p1, p2, color) {
    super(chart, series);
    this.p1 = p1;
    this.p2 = p2;
    this.color = color || DRAW_COLOR;
  }

  _draw({ context: ctx, horizontalPixelRatio, verticalPixelRatio }) {
    const x1 = this._timeToX(this.p1.time);
    const y1 = this._priceToY(this.p1.price);
    const x2 = this._timeToX(this.p2.time);
    const y2 = this._priceToY(this.p2.price);
    if ([x1, y1, x2, y2].some((v) => v == null)) return;

    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.lineDashOffset = 0;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x1 * horizontalPixelRatio, y1 * verticalPixelRatio);
    ctx.lineTo(x2 * horizontalPixelRatio, y2 * verticalPixelRatio);
    ctx.stroke();
    ctx.restore();
  }

  hitTest(x, y) {
    const x1 = this._timeToX(this.p1.time);
    const y1 = this._priceToY(this.p1.price);
    const x2 = this._timeToX(this.p2.time);
    const y2 = this._priceToY(this.p2.price);
    if ([x1, y1, x2, y2].some((v) => v == null)) return null;
    const d = pointToSegmentDistance(x, y, x1, y1, x2, y2);
    return d <= ACTIVE_HIT_RADIUS ? { distance: d, label: "Trend Line" } : null;
  }

  getHandlePoint() {
    const x1 = this._timeToX(this.p1.time);
    const y1 = this._priceToY(this.p1.price);
    const x2 = this._timeToX(this.p2.time);
    const y2 = this._priceToY(this.p2.price);
    if ([x1, y1, x2, y2].some((v) => v == null)) return null;
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  }
}

class RayPrimitive extends DrawingPrimitiveBase {
  constructor(chart, series, p1, p2, color) {
    super(chart, series);
    this.p1 = p1;
    this.p2 = p2;
    this.color = color || DRAW_COLOR;
  }

  _rayEndPoint() {
    const x1 = this._timeToX(this.p1.time);
    const y1 = this._priceToY(this.p1.price);
    const x2 = this._timeToX(this.p2.time);
    const y2 = this._priceToY(this.p2.price);
    if ([x1, y1, x2, y2].some((v) => v == null)) return null;

    const bounds = this._chart.timeScale().getVisibleLogicalRange?.();
    const width = this._chart.timeScale().width?.() ?? 1000;
    const height =
      this._series.priceToCoordinate(this.p1.price) != null
        ? this._series.priceToCoordinate(this.p1.price) * 2
        : 600;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;

    const candidates = [];
    const W = width;
    const H = height;

    const edges = [
      { x: 0, y: y1 + (0 - x1) * (uy / ux || 0) },
      { x: W, y: y1 + (W - x1) * (uy / ux || 0) },
      { x: x1 + (0 - y1) * (ux / uy || 0), y: 0 },
      { x: x1 + (H - y1) * (ux / uy || 0), y: H },
    ];

    for (const e of edges) {
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
      const t =
        Math.abs(dx) > Math.abs(dy)
          ? dx !== 0
            ? (e.x - x1) / dx
            : -1
          : dy !== 0
            ? (e.y - y1) / dy
            : -1;
      if (t >= 1) candidates.push({ ...e, t });
    }

    let best = candidates[0];
    for (const c of candidates) {
      if (!best || c.t > best.t) best = c;
    }

    if (best) return { x: best.x, y: best.y };

    return {
      x: x2 + ux * 5000,
      y: y2 + uy * 5000,
    };
  }

  _draw({
    context: ctx,
    horizontalPixelRatio,
    verticalPixelRatio,
    bitmapSize,
  }) {
    const x1 = this._timeToX(this.p1.time);
    const y1 = this._priceToY(this.p1.price);
    const x2 = this._timeToX(this.p2.time);
    const y2 = this._priceToY(this.p2.price);
    if ([x1, y1, x2, y2].some((v) => v == null)) return;

    const end = this._rayEndPoint();
    if (!end) return;

    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x1 * horizontalPixelRatio, y1 * verticalPixelRatio);
    ctx.lineTo(end.x * horizontalPixelRatio, end.y * verticalPixelRatio);
    ctx.stroke();
    ctx.restore();
  }

  hitTest(x, y) {
    const x1 = this._timeToX(this.p1.time);
    const y1 = this._priceToY(this.p1.price);
    const x2 = this._timeToX(this.p2.time);
    const y2 = this._priceToY(this.p2.price);
    if ([x1, y1, x2, y2].some((v) => v == null)) return null;
    const d = pointToInfiniteRayDistance(x, y, x1, y1, x2, y2);
    return d <= ACTIVE_HIT_RADIUS ? { distance: d, label: "Ray" } : null;
  }

  getHandlePoint() {
    const x1 = this._timeToX(this.p1.time);
    const y1 = this._priceToY(this.p1.price);
    const x2 = this._timeToX(this.p2.time);
    const y2 = this._priceToY(this.p2.price);
    if ([x1, y1, x2, y2].some((v) => v == null)) return null;
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  }
}

class HorizontalLinePrimitive extends DrawingPrimitiveBase {
  constructor(chart, series, price, color, preview = false) {
    super(chart, series);
    this.price = price;
    this.color = color || DRAW_COLOR;
    this.preview = preview;
  }

  _draw({
    context: ctx,
    bitmapSize,
    horizontalPixelRatio,
    verticalPixelRatio,
  }) {
    const y = this._priceToY(this.price);
    if (y == null) return;
    const width = bitmapSize.width / horizontalPixelRatio;

    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.preview ? 1.75 : 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, y * verticalPixelRatio);
    ctx.lineTo(width * horizontalPixelRatio, y * verticalPixelRatio);
    ctx.stroke();
    ctx.restore();
  }

  hitTest(x, y) {
    const yy = this._priceToY(this.price);
    if (yy == null) return null;
    const d = Math.abs(y - yy);
    return d <= ACTIVE_HIT_RADIUS
      ? { distance: d, label: "Horizontal Line" }
      : null;
  }

  getHandlePoint() {
    const y = this._priceToY(this.price);
    if (y == null) return null;
    const width = this._chart.timeScale().width?.() ?? 1000;
    return { x: width / 2, y };
  }
}

class VerticalLinePrimitive extends DrawingPrimitiveBase {
  constructor(chart, series, time, color, preview = false) {
    super(chart, series);
    this.time = time;
    this.color = color || DRAW_COLOR;
    this.preview = preview;
  }

  _draw({
    context: ctx,
    bitmapSize,
    horizontalPixelRatio,
    verticalPixelRatio,
  }) {
    const x = this._timeToX(this.time);
    if (x == null) return;
    const height = bitmapSize.height / verticalPixelRatio;

    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.preview ? 1.75 : 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x * horizontalPixelRatio, 0);
    ctx.lineTo(x * horizontalPixelRatio, height * verticalPixelRatio);
    ctx.stroke();
    ctx.restore();
  }

  hitTest(x, y) {
    const xx = this._timeToX(this.time);
    if (xx == null) return null;
    const d = Math.abs(x - xx);
    return d <= ACTIVE_HIT_RADIUS
      ? { distance: d, label: "Vertical Line" }
      : null;
  }

  getHandlePoint() {
    const x = this._timeToX(this.time);
    if (x == null) return null;
    const height =
      this._series.priceToCoordinate(this.p1?.price ?? 0) != null
        ? this._series.priceToCoordinate(this.p1?.price ?? 0) * 2
        : 600;
    return { x, y: height / 2 };
  }
}

class FibRetracementPrimitive extends DrawingPrimitiveBase {
  constructor(chart, series, p1, p2) {
    super(chart, series);
    this.p1 = p1;
    this.p2 = p2;
  }

  _draw({ context: ctx, horizontalPixelRatio, verticalPixelRatio }) {
    const x1 = this._timeToX(this.p1.time);
    const x2 = this._timeToX(this.p2.time);
    if (x1 == null || x2 == null) return;

    const xLeft = Math.min(x1, x2);
    const xRight = Math.max(x1, x2);
    const high = Math.max(this.p1.price, this.p2.price);
    const low = Math.min(this.p1.price, this.p2.price);
    const diff = high - low;

    ctx.save();
    ctx.font = "11px IBM Plex Mono, monospace";
    FIB_LEVELS.forEach((level, i) => {
      const price = high - diff * level;
      const y = this._priceToY(price);
      if (y == null) return;

      const color = FIB_COLORS[i % FIB_COLORS.length];
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(xLeft * horizontalPixelRatio, y * verticalPixelRatio);
      ctx.lineTo(xRight * horizontalPixelRatio, y * verticalPixelRatio);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.fillText(
        `${level.toFixed(3)}  ${price.toFixed(2)}`,
        (xLeft + 4) * horizontalPixelRatio,
        (y - 4) * verticalPixelRatio,
      );
    });
    ctx.restore();
  }

  hitTest(x, y) {
    const x1 = this._timeToX(this.p1.time);
    const x2 = this._timeToX(this.p2.time);
    if (x1 == null || x2 == null) return null;
    const xLeft = Math.min(x1, x2);
    const xRight = Math.max(x1, x2);
    const high = Math.max(this.p1.price, this.p2.price);
    const low = Math.min(this.p1.price, this.p2.price);
    const diff = high - low;

    let best = Infinity;
    for (const level of FIB_LEVELS) {
      const price = high - diff * level;
      const yy = this._priceToY(price);
      if (yy == null) continue;
      const d = Math.min(
        Math.abs(y - yy),
        pointToSegmentDistance(x, y, xLeft, yy, xRight, yy),
      );
      best = Math.min(best, d);
    }

    return best <= ACTIVE_HIT_RADIUS
      ? { distance: best, label: "Fib Retracement" }
      : null;
  }

  getHandlePoint() {
    const x1 = this._timeToX(this.p1.time);
    const x2 = this._timeToX(this.p2.time);
    const y1 = this._priceToY(this.p1.price);
    const y2 = this._priceToY(this.p2.price);
    if ([x1, x2, y1, y2].some((v) => v == null)) return null;
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  }
}

class PriceRangePrimitive extends DrawingPrimitiveBase {
  constructor(chart, series, p1, p2) {
    super(chart, series);
    this.p1 = p1;
    this.p2 = p2;
  }

  _draw({ context: ctx, horizontalPixelRatio, verticalPixelRatio }) {
    const x1 = this._timeToX(this.p1.time);
    const x2 = this._timeToX(this.p2.time);
    const y1 = this._priceToY(this.p1.price);
    const y2 = this._priceToY(this.p2.price);
    if ([x1, x2, y1, y2].some((v) => v == null)) return;

    const xLeft = Math.min(x1, x2) * horizontalPixelRatio;
    const xRight = Math.max(x1, x2) * horizontalPixelRatio;
    const yTop = Math.min(y1, y2) * verticalPixelRatio;
    const yBottom = Math.max(y1, y2) * verticalPixelRatio;
    const up = this.p2.price >= this.p1.price;
    const fill = up ? "rgba(38,166,154,0.18)" : "rgba(239,83,80,0.18)";
    const stroke = up ? "#26a69a" : "#ef5350";

    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.25;
    ctx.setLineDash([]);
    ctx.fillRect(xLeft, yTop, xRight - xLeft, yBottom - yTop);
    ctx.strokeRect(xLeft, yTop, xRight - xLeft, yBottom - yTop);

    const delta = this.p2.price - this.p1.price;
    const pct = this.p1.price !== 0 ? (delta / this.p1.price) * 100 : 0;
    const label = `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`;
    ctx.font = "12px IBM Plex Mono, monospace";
    ctx.fillStyle = stroke;
    ctx.fillText(label, xLeft + 6, yTop + 16);
    ctx.restore();
  }

  hitTest(x, y) {
    const x1 = this._timeToX(this.p1.time);
    const x2 = this._timeToX(this.p2.time);
    const y1 = this._priceToY(this.p1.price);
    const y2 = this._priceToY(this.p2.price);
    if ([x1, x2, y1, y2].some((v) => v == null)) return null;
    const inside = rectContains(x, y, x1, y1, x2, y2);
    if (inside) return { distance: 0, label: "Price Range" };
    const d = Math.min(
      pointToSegmentDistance(x, y, x1, y1, x2, y1),
      pointToSegmentDistance(x, y, x2, y1, x2, y2),
      pointToSegmentDistance(x, y, x2, y2, x1, y2),
      pointToSegmentDistance(x, y, x1, y2, x1, y1),
    );
    return d <= ACTIVE_HIT_RADIUS
      ? { distance: d, label: "Price Range" }
      : null;
  }

  getHandlePoint() {
    const x1 = this._timeToX(this.p1.time);
    const x2 = this._timeToX(this.p2.time);
    const y1 = this._priceToY(this.p1.price);
    const y2 = this._priceToY(this.p2.price);
    if ([x1, x2, y1, y2].some((v) => v == null)) return null;
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  }
}

const TOOLS = [
  { id: "cursor", label: "Cursor", points: 0, icon: "cursor" },
  { id: "trendline", label: "Trend Line", points: 2, icon: "trendline" },
  { id: "ray", label: "Ray", points: 2, icon: "ray" },
  { id: "horizontal", label: "Horizontal Line", points: 1, icon: "horizontal" },
  { id: "vertical", label: "Vertical Line", points: 1, icon: "vertical" },
  { id: "fib", label: "Fib Retracement", points: 2, icon: "fib" },
  { id: "pricerange", label: "Price Range", points: 2, icon: "pricerange" },
  { id: "remove", label: "Remove All Drawings", points: 0, icon: "trash" },
];

class DrawingToolManager {
  constructor(chart, series, container) {
    this.chart = chart;
    this.series = series;
    this.container = container;

    this.activeTool = "cursor";
    this.pendingPoints = [];
    this.drawings = [];
    this.preview = null;
    this.hover = null;
    this.hoveredDrawing = null;
    this._seq = 0;

    this._onMove = this._onMove.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onContext = this._onContext.bind(this);
    this._onLeave = this._onLeave.bind(this);

    container.style.position = container.style.position || "relative";

    this.deleteBtn = document.createElement("button");
    this.deleteBtn.type = "button";
    this.deleteBtn.className = "drawing-delete-fab";
    this.deleteBtn.textContent = "✕";
    this.deleteBtn.hidden = true;
    this.deleteBtn.title = "Delete drawing";
    this.deleteBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    this.deleteBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.hoveredDrawing) this.removeDrawing(this.hoveredDrawing.id);
    });
    container.appendChild(this.deleteBtn);

    container.addEventListener("click", (e) => {
      if (e.target.closest(".drawing-delete-fab")) return;
      this._onClick(e);
    });

    container.addEventListener("contextmenu", (e) => {
      if (e.target.closest(".drawing-delete-fab")) return;
      this._onContext(e);
    });
    container.addEventListener("mouseleave", this._onLeave);

    chart.subscribeCrosshairMove(this._onMove);
    window.addEventListener("keydown", this._onKeyDown);
  }

  setTool(tool) {
    if (tool === "remove") {
      this.clearAll();
      this.activeTool = "cursor";
      this._syncCursor();
      return;
    }

    this.activeTool = tool;
    this.pendingPoints = [];
    this._clearPreview();
    this.hoveredDrawing = null;
    this._hideDelete();
    this._syncCursor();
  }

  _syncCursor() {
    if (!this.container) return;
    if (this.activeTool === "cursor") {
      this.container.style.cursor = this.hoveredDrawing ? "pointer" : "default";
    } else {
      this.container.style.cursor = "crosshair";
    }
  }

  clearAll() {
    this._clearPreview();
    this.drawings.forEach((d) => this.series.detachPrimitive(d.primitive));
    this.drawings = [];
    this.pendingPoints = [];
    this.hoveredDrawing = null;
    this._hideDelete();
  }

  removeDrawing(id) {
    const idx = this.drawings.findIndex((d) => d.id === id);
    if (idx === -1) return;
    this.series.detachPrimitive(this.drawings[idx].primitive);
    this.drawings.splice(idx, 1);
    this.hoveredDrawing = null;
    this._hideDelete();
    this._syncCursor();
  }

  _clearPreview() {
    if (this.preview) {
      this.series.detachPrimitive(this.preview);
      this.preview = null;
    }
  }

  _coordToPoint(param) {
    if (!param?.point || param.time == null) return null;
    const price = this.series.coordinateToPrice(param.point.y);
    if (price == null) return null;
    return {
      time: param.time,
      price,
      x: param.point.x,
      y: param.point.y,
    };
  }

  _findHoveredDrawing(param) {
    const pt = this._coordToPoint(param);
    if (!pt) return null;

    let best = null;
    for (const drawing of this.drawings) {
      const hit = drawing.primitive.hitTest?.(pt.x, pt.y);
      if (!hit) continue;
      if (!best || hit.distance < best.hit.distance) {
        best = { drawing, hit };
      }
    }
    return best;
  }

  _showDelete(drawing, param) {
    const anchor = drawing.primitive.getHandlePoint?.();
    const fallback = param?.point;

    const x = (anchor?.x ?? fallback?.x ?? 0) + 14;
    const y = (anchor?.y ?? fallback?.y ?? 0) - 14;

    this.deleteBtn.hidden = false;
    this.deleteBtn.style.left = `${clamp(x, 8, this.container.clientWidth - 28)}px`;
    this.deleteBtn.style.top = `${clamp(y, 8, this.container.clientHeight - 28)}px`;
    this.hoveredDrawing = drawing;
    this._syncCursor();
  }

  _hideDelete() {
    this.deleteBtn.hidden = true;
  }

  _onLeave() {
    this.hover = null;
    if (this.activeTool === "cursor" && !this.hoveredDrawing) {
      this._hideDelete();
      this._syncCursor();
    }
  }

  _onMove(param) {
    this.hover = param;

    if (this.activeTool === "cursor") {
      const hovered = this._findHoveredDrawing(param);
      if (hovered) {
        this._showDelete(hovered.drawing, param);
      } else {
        this.hoveredDrawing = null;
        this._hideDelete();
      }
      this._syncCursor();
    }

    if (this.pendingPoints.length !== 1) return;
    const p = this._coordToPoint(param);
    if (!p) return;

    this._clearPreview();
    const first = this.pendingPoints[0];

    switch (this.activeTool) {
      case "trendline":
        this.preview = new TrendLinePrimitive(
          this.chart,
          this.series,
          first,
          p,
          DRAW_COLOR,
        );
        break;
      case "ray":
        this.preview = new RayPrimitive(
          this.chart,
          this.series,
          first,
          p,
          DRAW_COLOR,
        );
        break;
      case "fib":
        this.preview = new FibRetracementPrimitive(
          this.chart,
          this.series,
          first,
          p,
        );
        break;
      case "pricerange":
        this.preview = new PriceRangePrimitive(
          this.chart,
          this.series,
          first,
          p,
        );
        break;
      case "horizontal":
        this.preview = new HorizontalLinePrimitive(
          this.chart,
          this.series,
          p.price,
          DRAW_COLOR,
          true,
        );
        break;
      case "vertical":
        this.preview = new VerticalLinePrimitive(
          this.chart,
          this.series,
          p.time,
          DRAW_COLOR,
          true,
        );
        break;
    }

    if (this.preview) this.series.attachPrimitive(this.preview);
  }

  _onClick() {
    if (this.activeTool === "cursor") return;

    const point = this._coordToPoint(this.hover);
    if (!point) return;

    if (this.activeTool === "horizontal") {
      this._clearPreview();
      this._commitDrawing("horizontal", [point]);
      this.pendingPoints = [];
      return;
    }

    if (this.activeTool === "vertical") {
      this._clearPreview();
      this._commitDrawing("vertical", [point]);
      this.pendingPoints = [];
      return;
    }

    this.pendingPoints.push(point);
    if (this.pendingPoints.length < 2) return;

    this._clearPreview();
    this._commitDrawing(this.activeTool, [...this.pendingPoints]);
    this.pendingPoints = [];
  }

  _commitDrawing(tool, pts) {
    let primitive = null;

    switch (tool) {
      case "trendline":
        primitive = new TrendLinePrimitive(
          this.chart,
          this.series,
          pts[0],
          pts[1],
          DRAW_COLOR,
        );
        break;
      case "ray":
        primitive = new RayPrimitive(
          this.chart,
          this.series,
          pts[0],
          pts[1],
          DRAW_COLOR,
        );
        break;
      case "horizontal":
        primitive = new HorizontalLinePrimitive(
          this.chart,
          this.series,
          pts[0].price,
          DRAW_COLOR,
          false,
        );
        break;
      case "vertical":
        primitive = new VerticalLinePrimitive(
          this.chart,
          this.series,
          pts[0].time,
          DRAW_COLOR,
          false,
        );
        break;
      case "fib":
        primitive = new FibRetracementPrimitive(
          this.chart,
          this.series,
          pts[0],
          pts[1],
        );
        break;
      case "pricerange":
        primitive = new PriceRangePrimitive(
          this.chart,
          this.series,
          pts[0],
          pts[1],
        );
        break;
      default:
        return;
    }

    this.series.attachPrimitive(primitive);

    this.drawings.push({
      id: this._seq++,
      tool,
      primitive,
    });
  }

  _onContext(e) {
    e.preventDefault();
    this.pendingPoints = [];
    this._clearPreview();
  }

  _onKeyDown(e) {
    if (e.key === "Escape") {
      this.pendingPoints = [];
      this._clearPreview();
      this._hideDelete();
      this.hoveredDrawing = null;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && this.hoveredDrawing) {
      this.removeDrawing(this.hoveredDrawing.id);
    }
  }
}

const TOOL_ICONS = {
  cursor: `<path d="M4 3l7 16 2-6 6-2z" fill="currentColor"/>`,
  trendline: `<circle cx="5" cy="18" r="1.6" fill="currentColor"/><circle cx="19" cy="5" r="1.6" fill="currentColor"/><line x1="5" y1="18" x2="19" y2="5" stroke="currentColor" stroke-width="1.6"/>`,
  ray: `<circle cx="5" cy="18" r="1.6" fill="currentColor"/><line x1="5" y1="18" x2="21" y2="7" stroke="currentColor" stroke-width="1.6"/>`,
  horizontal: `<line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="1.6"/>`,
  vertical: `<line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" stroke-width="1.6"/>`,
  fib: `<line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="1.2"/><line x1="3" y1="11" x2="21" y2="11" stroke="currentColor" stroke-width="1.2"/><line x1="3" y1="16" x2="21" y2="16" stroke="currentColor" stroke-width="1.2"/><line x1="3" y1="21" x2="21" y2="21" stroke="currentColor" stroke-width="1.2"/>`,
  pricerange: `<rect x="4" y="7" width="16" height="10" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
  trash: `<path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
};

function buildDrawingToolbar(mountEl, manager) {
  mountEl.innerHTML = "";
  mountEl.className = "drawing-toolbar";

  TOOLS.forEach((tool) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "draw-tool-btn";
    btn.title = tool.label;
    btn.dataset.tool = tool.id;
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18">${TOOL_ICONS[tool.icon]}</svg>`;

    btn.addEventListener("click", () => {
      manager.setTool(tool.id);
      mountEl.querySelectorAll(".draw-tool-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.tool === tool.id);
      });
    });

    if (tool.id === "cursor") btn.classList.add("active");
    mountEl.appendChild(btn);
  });
}

const DRAW_COLOR = "#4c8dff";
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

function isEditableTarget(target) {
  if (!target) return false;
  const tag = target.tagName ? target.tagName.toLowerCase() : "";
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable ||
    Boolean(target.closest?.("[contenteditable='true']"))
  );
}

function scaleLineWidth(width, horizontalPixelRatio, verticalPixelRatio) {
  return width * Math.max(horizontalPixelRatio, verticalPixelRatio);
}

function setScaledFont(ctx, size, horizontalPixelRatio, verticalPixelRatio) {
  const ratio = Math.max(horizontalPixelRatio, verticalPixelRatio);
  ctx.font = `${size * ratio}px IBM Plex Mono, monospace`;
}

function rectContains(px, py, x1, y1, x2, y2) {
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  return px >= left && px <= right && py >= top && py <= bottom;
}

function colorWithAlpha(color, alpha) {
  const hex = String(color).replace("#", "");
  const normalized =
    hex.length === 3
      ? hex
          .split("")
          .map((part) => part + part)
          .join("")
      : hex;
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return `rgba(76, 141, 255, ${alpha})`;
  }
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

class DrawingPrimitiveBase {
  constructor(chart, series) {
    this._chart = chart;
    this._series = series;
    this._paneViews = [this._makePaneView()];
    this._requestUpdate = null;
  }

  attached({ requestUpdate }) {
    this._requestUpdate = requestUpdate;
  }

  detached() {
    this._requestUpdate = null;
  }

  setColor(color) {
    if (!("color" in this)) return false;
    this.color = color;
    this._requestUpdate?.();
    return true;
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
    ctx.lineWidth = scaleLineWidth(2, horizontalPixelRatio, verticalPixelRatio);
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

class PenPrimitive extends DrawingPrimitiveBase {
  constructor(chart, series, points = [], color) {
    super(chart, series);

    this.points = points;
    this.color = color || DRAW_COLOR;
  }

  addPoint(point) {
    if (!point) return;

    this.points.push(point);
    this._requestUpdate?.();
  }

  _draw({ context: ctx, horizontalPixelRatio, verticalPixelRatio }) {
    if (this.points.length < 2) return;

    ctx.save();

    ctx.strokeStyle = this.color;
    ctx.lineWidth = scaleLineWidth(2, horizontalPixelRatio, verticalPixelRatio);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([]);

    ctx.beginPath();

    let started = false;

    for (const point of this.points) {
      const x = this._timeToX(point.time);
      const y = this._priceToY(point.price);

      if (x == null || y == null) {
        started = false;
        continue;
      }

      const px = x * horizontalPixelRatio;
      const py = y * verticalPixelRatio;

      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }

    ctx.stroke();
    ctx.restore();
  }

  hitTest(x, y) {
    if (this.points.length < 2) return null;

    let closest = Infinity;

    for (let i = 1; i < this.points.length; i++) {
      const p1 = this.points[i - 1];
      const p2 = this.points[i];

      const x1 = this._timeToX(p1.time);
      const y1 = this._priceToY(p1.price);
      const x2 = this._timeToX(p2.time);
      const y2 = this._priceToY(p2.price);

      if ([x1, y1, x2, y2].some((value) => value == null)) {
        continue;
      }

      const distance = pointToSegmentDistance(x, y, x1, y1, x2, y2);

      closest = Math.min(closest, distance);
    }

    return closest <= ACTIVE_HIT_RADIUS
      ? {
          distance: closest,
          label: "Pen",
        }
      : null;
  }

  getHandlePoint() {
    if (!this.points.length) return null;

    const coordinates = [];

    for (const point of this.points) {
      const x = this._timeToX(point.time);
      const y = this._priceToY(point.price);

      if (x != null && y != null) {
        coordinates.push({ x, y });
      }
    }

    if (!coordinates.length) return null;

    const xs = coordinates.map((point) => point.x);
    const ys = coordinates.map((point) => point.y);

    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);

    return {
      x: (left + right) / 2,
      y: (top + bottom) / 2,
    };
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

    const width = this._chart.timeScale().width?.() ?? 1000;
    const height = document.getElementById("main-chart")?.clientHeight ?? 600;

    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return { x: x2, y: y2 };

    const candidates = [];
    const W = width;
    const H = height;

    if (dx !== 0) {
      for (const x of [0, W]) {
        const t = (x - x1) / dx;
        const y = y1 + t * dy;
        if (t >= 1 && y >= 0 && y <= H) candidates.push({ x, y, t });
      }
    }

    if (dy !== 0) {
      for (const y of [0, H]) {
        const t = (y - y1) / dy;
        const x = x1 + t * dx;
        if (t >= 1 && x >= 0 && x <= W) candidates.push({ x, y, t });
      }
    }

    let best = candidates[0];
    for (const c of candidates) {
      if (!best || c.t < best.t) best = c;
    }

    if (best) return { x: best.x, y: best.y };

    return { x: x2, y: y2 };
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
    ctx.lineWidth = scaleLineWidth(2, horizontalPixelRatio, verticalPixelRatio);
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
    ctx.lineWidth = scaleLineWidth(
      this.preview ? 1.75 : 2,
      horizontalPixelRatio,
      verticalPixelRatio,
    );
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
    ctx.lineWidth = scaleLineWidth(
      this.preview ? 1.75 : 2,
      horizontalPixelRatio,
      verticalPixelRatio,
    );
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
    setScaledFont(ctx, 11, horizontalPixelRatio, verticalPixelRatio);
    FIB_LEVELS.forEach((level, i) => {
      const price = high - diff * level;
      const y = this._priceToY(price);
      if (y == null) return;

      const color = FIB_COLORS[i % FIB_COLORS.length];
      ctx.strokeStyle = color;
      ctx.lineWidth = scaleLineWidth(
        1.25,
        horizontalPixelRatio,
        verticalPixelRatio,
      );
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
      const d = pointToSegmentDistance(x, y, xLeft, yy, xRight, yy);
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
    ctx.lineWidth = scaleLineWidth(
      1.25,
      horizontalPixelRatio,
      verticalPixelRatio,
    );
    ctx.setLineDash([]);
    ctx.fillRect(xLeft, yTop, xRight - xLeft, yBottom - yTop);
    ctx.strokeRect(xLeft, yTop, xRight - xLeft, yBottom - yTop);

    const delta = this.p2.price - this.p1.price;
    const pct = this.p1.price !== 0 ? (delta / this.p1.price) * 100 : 0;
    const label = `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`;
    setScaledFont(ctx, 12, horizontalPixelRatio, verticalPixelRatio);
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

class RectanglePrimitive extends DrawingPrimitiveBase {
  constructor(chart, series, p1, p2, color) {
    super(chart, series);
    this.p1 = p1;
    this.p2 = p2;
    this.color = color || DRAW_COLOR;
  }

  _draw({ context: ctx, horizontalPixelRatio, verticalPixelRatio }) {
    const x1 = this._timeToX(this.p1.time);
    const x2 = this._timeToX(this.p2.time);
    const y1 = this._priceToY(this.p1.price);
    const y2 = this._priceToY(this.p2.price);
    if ([x1, x2, y1, y2].some((v) => v == null)) return;

    const left = Math.min(x1, x2) * horizontalPixelRatio;
    const top = Math.min(y1, y2) * verticalPixelRatio;
    const width = Math.abs(x2 - x1) * horizontalPixelRatio;
    const height = Math.abs(y2 - y1) * verticalPixelRatio;

    ctx.save();
    ctx.fillStyle = colorWithAlpha(this.color, 0.14);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = scaleLineWidth(
      1.5,
      horizontalPixelRatio,
      verticalPixelRatio,
    );
    ctx.setLineDash([]);
    ctx.fillRect(left, top, width, height);
    ctx.strokeRect(left, top, width, height);
    ctx.restore();
  }

  hitTest(x, y) {
    const x1 = this._timeToX(this.p1.time);
    const x2 = this._timeToX(this.p2.time);
    const y1 = this._priceToY(this.p1.price);
    const y2 = this._priceToY(this.p2.price);
    if ([x1, x2, y1, y2].some((v) => v == null)) return null;
    if (rectContains(x, y, x1, y1, x2, y2)) {
      return { distance: 0, label: "Rectangle" };
    }
    const d = Math.min(
      pointToSegmentDistance(x, y, x1, y1, x2, y1),
      pointToSegmentDistance(x, y, x2, y1, x2, y2),
      pointToSegmentDistance(x, y, x2, y2, x1, y2),
      pointToSegmentDistance(x, y, x1, y2, x1, y1),
    );
    return d <= ACTIVE_HIT_RADIUS ? { distance: d, label: "Rectangle" } : null;
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
  { id: "pen", label: "pen", points: 1, icon: "pen" },
  { id: "trendline", label: "Trend Line", points: 2, icon: "trendline" },
  { id: "ray", label: "Ray", points: 2, icon: "ray" },
  { id: "horizontal", label: "Horizontal Line", points: 1, icon: "horizontal" },
  { id: "vertical", label: "Vertical Line", points: 1, icon: "vertical" },
  { id: "fib", label: "Fib Retracement", points: 2, icon: "fib" },
  { id: "rectangle", label: "Rectangle Area", points: 2, icon: "rectangle" },
  { id: "pricerange", label: "Price Range", points: 2, icon: "pricerange" },
  { id: "remove", label: "Remove All Drawings", points: 0, icon: "trash" },
];

export class DrawingToolManager {
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
    this.currentColor = DRAW_COLOR;
    this._seq = 0;
    this._deleteHovered = false;

    this._onMove = this._onMove.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onContext = this._onContext.bind(this);
    this._onLeave = this._onLeave.bind(this);

    this._onPenDown = this._onPenDown.bind(this);
    this._onPenMove = this._onPenMove.bind(this);
    this._onPenUp = this._onPenUp.bind(this);

    this.activePen = null;
    this.penPointerId = null;

    container.style.position = container.style.position || "relative";

    this._deleteButton = document.createElement("button");
    this._deleteButton.type = "button";
    this._deleteButton.className = "chart-drawing-delete";
    this._deleteButton.title = "Delete drawing";
    this._deleteButton.setAttribute("aria-label", "Delete drawing");
    this._deleteButton.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12M9 7V5h6v2M8 7l1 12h6l1-12M11 10v6M13 10v6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    this._deleteButton.hidden = true;
    this._deleteButton.addEventListener("pointerenter", () => {
      this._deleteHovered = true;
    });
    this._deleteButton.addEventListener("pointerleave", () => {
      this._deleteHovered = false;
    });
    this._deleteButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    this._deleteButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.hoveredDrawing) this.removeDrawing(this.hoveredDrawing.id);
    });
    container.appendChild(this._deleteButton);

    container.addEventListener("click", this._onClick);
    container.addEventListener("contextmenu", this._onContext);
    container.addEventListener("mouseleave", this._onLeave);

    container.addEventListener("pointerdown", this._onPenDown);
    container.addEventListener("pointermove", this._onPenMove);
    container.addEventListener("pointerup", this._onPenUp);
    container.addEventListener("pointercancel", this._onPenUp);

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

  setColor(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    this.currentColor = color;
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

    if (this.activePen) {
      this.series.detachPrimitive(this.activePen);
      this.activePen = null;
      this.penPointerId = null;
    }

    this.drawings.forEach((d) => this.series.detachPrimitive(d.primitive));

    this.drawings = [];
    this.pendingPoints = [];
    this.hoveredDrawing = null;

    this._hideDelete();
  }

  destroy() {
    this.clearAll();
    this.container.removeEventListener("click", this._onClick);
    this.container.removeEventListener("contextmenu", this._onContext);
    this.container.removeEventListener("mouseleave", this._onLeave);

    this.container.removeEventListener("pointerdown", this._onPenDown);
    this.container.removeEventListener("pointermove", this._onPenMove);
    this.container.removeEventListener("pointerup", this._onPenUp);
    this.container.removeEventListener("pointercancel", this._onPenUp);

    this.chart.unsubscribeCrosshairMove?.(this._onMove);
    window.removeEventListener("keydown", this._onKeyDown);

    this._deleteButton?.remove();
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

  _eventToPoint(event) {
    const rect = this.container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const price = this.series.coordinateToPrice(y);
    const time = this.chart.timeScale().coordinateToTime?.(x);
    if (price == null || time == null) return null;
    return { time, price, x, y };
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
    const sameDrawing =
      this.hoveredDrawing?.id === drawing.id && !this._deleteButton.hidden;
    this.hoveredDrawing = drawing;
    if (!sameDrawing) {
      const point = param?.point || drawing.primitive.getHandlePoint?.();
      if (point) {
        const buttonSize = 30;
        const left = clamp(
          point.x + 12,
          6,
          this.container.clientWidth - buttonSize - 6,
        );
        const top = clamp(
          point.y - buttonSize / 2,
          6,
          this.container.clientHeight - buttonSize - 6,
        );
        this._deleteButton.style.left = `${left}px`;
        this._deleteButton.style.top = `${top}px`;
      }
    }
    this._deleteButton.hidden = false;
    this._syncCursor();
  }

  _hideDelete() {
    if (!this._deleteButton) return;
    this._deleteButton.hidden = true;
    this._deleteHovered = false;
  }

  _onLeave() {
    this.hover = null;
    if (this._deleteHovered) return;
    this.hoveredDrawing = null;
    this._hideDelete();
    this._syncCursor();
  }

  _onPenDown(event) {
    if (this.activeTool !== "pen") return;

    if (event.button !== 0) return;

    const point = this._eventToPoint(event);
    if (!point) return;

    event.preventDefault();

    this.penPointerId = event.pointerId;
    this.container.setPointerCapture?.(event.pointerId);

    this.activePen = new PenPrimitive(
      this.chart,
      this.series,
      [point],
      this.currentColor,
    );

    this.series.attachPrimitive(this.activePen);
  }

  _onPenMove(event) {
    if (this.activeTool !== "pen") return;
    if (!this.activePen) return;
    if (event.pointerId !== this.penPointerId) return;

    const point = this._eventToPoint(event);
    if (!point) return;

    event.preventDefault();

    const points = this.activePen.points;
    const last = points[points.length - 1];

    if (last) {
      const distanceSquared = dist2(last.x, last.y, point.x, point.y);

      if (distanceSquared < 4) return;
    }

    this.activePen.addPoint(point);
  }

  _onPenUp(event) {
    if (!this.activePen) return;
    if (event.pointerId !== this.penPointerId) return;

    event.preventDefault();

    this.container.releasePointerCapture?.(event.pointerId);

    if (this.activePen.points.length >= 2) {
      this.drawings.push({
        id: this._seq++,
        tool: "pen",
        primitive: this.activePen,
      });
    } else {

      this.series.detachPrimitive(this.activePen);
    }

    this.activePen = null;
    this.penPointerId = null;
  }

  _onMove(param) {
    this.hover = param;

    if (this.activeTool === "cursor") {
      const hovered = this._findHoveredDrawing(param);
      if (hovered) {
        this._showDelete(hovered.drawing, param);
      } else if (!this._deleteHovered) {
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
          this.currentColor,
        );
        break;
      case "ray":
        this.preview = new RayPrimitive(
          this.chart,
          this.series,
          first,
          p,
          this.currentColor,
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
      case "rectangle":
        this.preview = new RectanglePrimitive(
          this.chart,
          this.series,
          first,
          p,
          this.currentColor,
        );
        break;
      case "horizontal":
        this.preview = new HorizontalLinePrimitive(
          this.chart,
          this.series,
          p.price,
          this.currentColor,
          true,
        );
        break;
      case "vertical":
        this.preview = new VerticalLinePrimitive(
          this.chart,
          this.series,
          p.time,
          this.currentColor,
          true,
        );
        break;
    }

    if (this.preview) this.series.attachPrimitive(this.preview);
  }

  _onClick(e) {
    if (this.activeTool === "cursor") return;
    if (this.activeTool === "pen") return;

    const point = this._coordToPoint(this.hover) || this._eventToPoint(e);
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
          this.currentColor,
        );
        break;
      case "ray":
        primitive = new RayPrimitive(
          this.chart,
          this.series,
          pts[0],
          pts[1],
          this.currentColor,
        );
        break;
      case "horizontal":
        primitive = new HorizontalLinePrimitive(
          this.chart,
          this.series,
          pts[0].price,
          this.currentColor,
          false,
        );
        break;
      case "vertical":
        primitive = new VerticalLinePrimitive(
          this.chart,
          this.series,
          pts[0].time,
          this.currentColor,
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
      case "rectangle":
        primitive = new RectanglePrimitive(
          this.chart,
          this.series,
          pts[0],
          pts[1],
          this.currentColor,
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
    if (isEditableTarget(e.target)) return;
    if (e.key === "Escape") {
      this.pendingPoints = [];
      this._clearPreview();
      this.hoveredDrawing = null;
      this._hideDelete();
    }
    if ((e.key === "Delete" || e.key === "Backspace") && this.hoveredDrawing) {
      e.preventDefault();
      this.removeDrawing(this.hoveredDrawing.id);
    }
  }
}

const TOOL_ICONS = {
  cursor: `<path d="M4 3l7 16 2-6 6-2z" fill="currentColor"/>`,
  pen: `<path d="M5 18c3-5 5-8 8-11l2-2 4 4-2 2c-3 3-6 5-11 8l-3 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M13 7l4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  trendline: `<circle cx="5" cy="18" r="1.6" fill="currentColor"/><circle cx="19" cy="5" r="1.6" fill="currentColor"/><line x1="5" y1="18" x2="19" y2="5" stroke="currentColor" stroke-width="1.6"/>`,
  ray: `<circle cx="5" cy="18" r="1.6" fill="currentColor"/><line x1="5" y1="18" x2="21" y2="7" stroke="currentColor" stroke-width="1.6"/>`,
  horizontal: `<line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="1.6"/>`,
  vertical: `<line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" stroke-width="1.6"/>`,
  fib: `<line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="1.2"/><line x1="3" y1="11" x2="21" y2="11" stroke="currentColor" stroke-width="1.2"/><line x1="3" y1="16" x2="21" y2="16" stroke="currentColor" stroke-width="1.2"/><line x1="3" y1="21" x2="21" y2="21" stroke="currentColor" stroke-width="1.2"/>`,
  rectangle: `<rect x="4" y="5" width="16" height="14" fill="currentColor" fill-opacity=".2" stroke="currentColor" stroke-width="1.6"/>`,
  pricerange: `<rect x="4" y="7" width="16" height="10" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
  trash: `<path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
};

export function buildDrawingToolbar(mountEl, manager) {
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
        b.classList.toggle("active", b.dataset.tool === manager.activeTool);
      });
    });

    if (tool.id === "cursor") btn.classList.add("active");
    mountEl.appendChild(btn);
  });

  const colorWrap = document.createElement("label");
  colorWrap.className = "draw-color-control";
  colorWrap.title = "Drawing color";
  colorWrap.setAttribute("aria-label", "Drawing color");
  colorWrap.style.setProperty("--drawing-color", manager.currentColor);

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.className = "draw-color-input";
  colorInput.value = manager.currentColor;
  colorInput.setAttribute("aria-label", "Choose drawing color");
  colorInput.addEventListener("input", () => {
    manager.setColor(colorInput.value);
    colorWrap.style.setProperty("--drawing-color", colorInput.value);
  });

  colorWrap.appendChild(colorInput);
  const removeButton = mountEl.querySelector('[data-tool="remove"]');
  mountEl.insertBefore(colorWrap, removeButton);
}

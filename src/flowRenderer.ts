import { PROVINCES, ProvinceShape } from "./geo";

export interface TooltipField { name: string; value: string; }
export interface RouteDatum {
    key: string;          // "IR07>IR04"
    from: string;         // province id
    to: string;
    value: number;
    tooltips: TooltipField[];
}

export interface FlowConfig {
    auto: boolean;
    thresholds: [number, number, number, number];
    colors: [string, string, string, string, string];
    minWidth: number;
    maxWidth: number;
    arcHeight: number;    // 0..1
    maxRoutes: number;
    arrows: boolean;
    animate: boolean;
    glow: boolean;
    baseFill: string;
    border: string;
    depth: number;
    tilt: number;
    perspective: number;
    sideTop: string;
    sideBottom: string;
    shadow: boolean;
    nodes: boolean;
    nodeColor: string;
    showLabels: boolean;
    fontSize: number;
    labelColor: string;
    showLegend: boolean;
    legendTitle: string;
    legendPosition: "right" | "left";
    showHeader: boolean;
    headerText: string;
    headerSize: number;
    headerColor: string;
    persianDigits: boolean;
    callout: boolean;
    measureName: string;
}

export interface FlowCallbacks {
    onSelect(keys: string[], multi: boolean): void;
    onContextMenu(key: string | null, x: number, y: number): void;
    onHover(key: string | null, provinceId: string | null, e: MouseEvent): void; // Power BI tooltip mode
    onHoverEnd(): void;
}

const SVG = "http://www.w3.org/2000/svg";

/* ---------------- geometry (unprojected, computed once) ---------------- */
const BOUNDS = (() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of PROVINCES) for (const poly of p.polys) for (const [x, y] of poly[0]) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { x0, x1, y0, y1 };
})();
function ringArea(r: number[][]): number {
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
    return Math.abs(a / 2);
}
function inside(pt: number[], r: number[][]): boolean {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i], [xj, yj] = r[j];
        if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
}
function edgeDist(pt: number[], r: number[][]): number {
    let m = Infinity;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [ax, ay] = r[j], [bx, by] = r[i];
        const dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, ((pt[0] - ax) * dx + (pt[1] - ay) * dy) / (dx * dx + dy * dy || 1)));
        const ex = ax + t * dx - pt[0], ey = ay + t * dy - pt[1];
        m = Math.min(m, ex * ex + ey * ey);
    }
    return Math.sqrt(m);
}
function labelPoint(r: number[][]): [number, number] {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, cx = 0, cy = 0;
    for (const [x, y] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); cx += x; cy += y; }
    cx /= r.length; cy /= r.length;
    let best: [number, number] = [cx, cy], bestScore = -Infinity;
    const N = 28;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
        const pt = [x0 + (x1 - x0) * i / N, y0 + (y1 - y0) * j / N];
        if (!inside(pt, r)) continue;
        const score = edgeDist(pt, r) - 0.18 * Math.hypot(pt[0] - cx, pt[1] - cy);
        if (score > bestScore) { bestScore = score; best = [pt[0], pt[1]]; }
    }
    return best;
}
function chordWidth(pt: number[], r: number[][]): number {
    const xs: number[] = [];
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i], [xj, yj] = r[j];
        if ((yi > pt[1]) !== (yj > pt[1])) xs.push((xj - xi) * (pt[1] - yi) / (yj - yi) + xi);
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i] <= pt[0] && pt[0] <= xs[i + 1]) return xs[i + 1] - xs[i];
    return 0;
}
interface Prepared { shape: ProvinceShape; labelPt: [number, number]; area: number; chord: number; }
const PREPARED: Prepared[] = PROVINCES.map(shape => {
    let main = shape.polys[0][0], area = 0;
    for (const poly of shape.polys) { const a = ringArea(poly[0]); area += a; if (a > ringArea(main)) main = poly[0]; }
    const labelPt = labelPoint(main);
    return { shape, labelPt, area, chord: chordWidth(labelPt, main) };
});
const BY_ID = new Map(PREPARED.map(p => [p.shape.id, p]));

/* ---------------- small helpers ---------------- */
function hexToRgb(h: string): [number, number, number] {
    let s = (h || "#000").replace("#", "");
    if (s.length === 3) s = s.split("").map(c => c + c).join("");
    const n = parseInt(s.slice(0, 6), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
    const A = hexToRgb(a), B = hexToRgb(b);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",")})`;
}
function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] {
    const e = document.createElementNS(SVG, tag);
    for (const k in attrs) e.setAttribute(k, String(attrs[k]));
    if (parent) parent.appendChild(e);
    return e;
}
function div(cls: string, parent: Element, txt?: string): HTMLDivElement {
    const d = document.createElement("div");
    d.className = cls;
    if (txt !== undefined) d.textContent = txt;
    parent.appendChild(d);
    return d;
}
type Pt = [number, number];
const qPoint = (a: Pt, c: Pt, b: Pt, t: number): Pt =>
    [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];
const qTangent = (a: Pt, c: Pt, b: Pt, t: number): Pt =>
    [2 * (1 - t) * (c[0] - a[0]) + 2 * t * (b[0] - c[0]), 2 * (1 - t) * (c[1] - a[1]) + 2 * t * (b[1] - c[1])];

interface DrawnRoute { r: RouteDatum; a: Pt; b: Pt; c: Pt; bucket: number; width: number; g: SVGGElement; }

export class FlowRenderer {
    private root: HTMLDivElement;
    private svg: SVGSVGElement;
    private header: HTMLDivElement;
    private legend: HTMLDivElement;
    private calloutEl: HTMLDivElement;
    private warnEl: HTMLDivElement;
    private emptyEl: HTMLDivElement;
    private gPin: SVGGElement;

    private cfg: FlowConfig;
    private routes: RouteDatum[] = [];
    private drawn: DrawnRoute[] = [];
    private selected = new Set<string>();
    private breaks: [number, number, number, number] = [0, 0, 0, 0];
    private total = 0;
    private hidden = 0;
    private mapBox = { x: 0, y: 0, w: 0, h: 0 };
    private node = new Map<string, Pt>();
    private nf: Intl.NumberFormat;

    constructor(host: HTMLElement, private cb: FlowCallbacks) {
        this.root = div("ir3d", host);
        this.header = div("ir3d-header", this.root);
        this.svg = el("svg", { class: "ir3d-svg" }, this.root);
        this.legend = div("ir3d-legend", this.root);
        this.calloutEl = div("ir3d-callout", this.root);
        this.warnEl = div("ir3d-warn", this.root);
        this.emptyEl = div("ir3d-empty", this.root);
        this.svg.addEventListener("click", e => {
            const t = e.target as Element;
            if (!t.getAttribute("data-key") && !t.getAttribute("data-id")) this.cb.onSelect([], false);
        });
        this.svg.addEventListener("contextmenu", e => {
            e.preventDefault();
            this.cb.onContextMenu((e.target as Element).getAttribute("data-key"), e.clientX, e.clientY);
        });
    }

    render(width: number, height: number, routes: RouteDatum[], cfg: FlowConfig, selected: Set<string>, unmatched: string[]): void {
        this.cfg = cfg;
        this.selected = selected;
        this.nf = new Intl.NumberFormat(cfg.persianDigits ? "fa-IR" : "en-US", { maximumFractionDigits: 2 });
        const sorted = routes.filter(r => r.value > 0).sort((a, b) => b.value - a.value);
        const limit = cfg.maxRoutes > 0 ? Math.round(cfg.maxRoutes) : sorted.length;
        this.routes = sorted.slice(0, limit).reverse(); // ascending → heavy routes are drawn last (on top)
        this.hidden = sorted.length - this.routes.length;
        this.total = sorted.reduce((s, r) => s + r.value, 0);
        this.breaks = this.computeBreaks();

        this.root.style.width = width + "px";
        this.root.style.height = height + "px";
        const headerSize = Math.min(cfg.headerSize, Math.max(11, width / 20));
        const headerH = cfg.showHeader && height > 160 ? Math.round(headerSize * 1.7) : 0;
        this.header.style.display = headerH ? "block" : "none";
        this.header.style.fontSize = headerSize + "px";
        this.header.style.color = cfg.headerColor;
        this.header.textContent = cfg.headerText;

        const wide = cfg.showLegend && width >= 520;
        const bottom = cfg.showLegend && !wide && height >= 260;
        this.renderLegend(wide ? "side" : bottom ? "bottom" : "none");
        const legendW = wide ? Math.min(220, Math.max(170, width * 0.24)) : 0;
        const legendH = bottom ? this.legend.offsetHeight + 8 : 0;
        if (wide) {
            this.legend.style.width = legendW - 16 + "px";
            this.legend.style.top = Math.max(headerH + 12, (height - this.legend.offsetHeight) / 2) + "px";
        }
        const mx = cfg.legendPosition === "left" ? legendW : 0;
        this.mapBox = { x: mx, y: headerH, w: width - legendW, h: height - headerH - legendH };
        this.svg.setAttribute("width", String(Math.max(0, this.mapBox.w)));
        this.svg.setAttribute("height", String(Math.max(0, this.mapBox.h)));
        this.svg.style.left = this.mapBox.x + "px";
        this.svg.style.top = this.mapBox.y + "px";

        this.draw();

        this.emptyEl.style.display = routes.length ? "none" : "block";
        this.emptyEl.textContent = "فیلدهای «استان مبدأ»، «استان مقصد» و «تعداد پیمایش» را اضافه کنید";
        if (unmatched.length) {
            this.warnEl.style.display = "block";
            this.warnEl.textContent = `⚠ شناسایی نشد: ${unmatched.slice(0, 3).map(n => `«${n}»`).join("، ")}${unmatched.length > 3 ? ` و ${this.nf.format(unmatched.length - 3)} مورد دیگر` : ""}`;
            this.warnEl.title = unmatched.slice(0, 40).join("، ");
        } else this.warnEl.style.display = "none";
        this.calloutEl.style.display = "none";
    }

    /* ---------- classification ---------- */
    private computeBreaks(): [number, number, number, number] {
        if (!this.cfg.auto) return this.cfg.thresholds;
        const v = this.routes.map(r => r.value).sort((a, b) => a - b);
        if (!v.length) return [0, 0, 0, 0];
        const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))];
        // skewed on purpose: only the few busiest routes reach the brightest class
        const b = [q(0.4), q(0.7), q(0.88), q(0.96)].map(x => Math.round(x)) as [number, number, number, number];
        for (let i = 1; i < 4; i++) if (b[i] < b[i - 1]) b[i] = b[i - 1];
        return b;
    }
    private bucket(v: number): number {
        const [t1, t2, t3, t4] = this.breaks;
        return v <= t1 ? 0 : v <= t2 ? 1 : v <= t3 ? 2 : v <= t4 ? 3 : 4;
    }

    /* ---------- projection ---------- */
    private projector() {
        const { depth, tilt, perspective: p } = this.cfg;
        const pad = 14;
        const W = this.mapBox.w - pad * 2, H = this.mapBox.h - pad * 2 - depth - 6;
        const dx = BOUNDS.x1 - BOUNDS.x0, dy = BOUNDS.y1 - BOUNDS.y0;
        const k = Math.max(0.01, Math.min(W / (dx * (1 + p / 2)), H / (dy * tilt)));
        const ox = this.mapBox.w / 2, oy = pad + H / 2 + 2;
        const mx = (BOUNDS.x0 + BOUNDS.x1) / 2, my = (BOUNDS.y0 + BOUNDS.y1) / 2;
        const hh = dy * k * tilt;
        const f = (x: number, y: number): Pt => {
            let px = (x - mx) * k;
            const py = (my - y) * k * tilt;
            px *= 1 + p * (py / hh);
            return [ox + px, oy + py];
        };
        return { f, k };
    }

    private draw(): void {
        const cfg = this.cfg, svg = this.svg;
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        this.drawn = [];
        if (this.mapBox.w < 40 || this.mapBox.h < 40) return;
        const { f: proj, k } = this.projector();

        const paths = new Map<string, string>();
        let all = "";
        for (const pr of PREPARED) {
            let d = "";
            for (const poly of pr.shape.polys) for (const ring of poly)
                d += "M" + ring.map(([x, y]) => { const q = proj(x, y); return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join("L") + "Z";
            paths.set(pr.shape.id, d);
            all += d;
            this.node.set(pr.shape.id, proj(pr.labelPt[0], pr.labelPt[1]));
        }

        /* defs */
        const defs = el("defs", {}, svg);
        const sheen = el("linearGradient", { id: "ir3dSheen", x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
        el("stop", { offset: "0", "stop-color": "#fff", "stop-opacity": 0.14 }, sheen);
        el("stop", { offset: "0.5", "stop-color": "#fff", "stop-opacity": 0 }, sheen);
        el("stop", { offset: "1", "stop-color": "#000", "stop-opacity": 0.15 }, sheen);
        const blur = el("filter", { id: "ir3dBlur", x: "-20%", y: "-20%", width: "140%", height: "140%" }, defs);
        el("feGaussianBlur", { stdDeviation: Math.max(4, cfg.depth * 0.7) }, blur);
        const glow = el("filter", { id: "ir3dGlow", x: "-50%", y: "-50%", width: "200%", height: "200%" }, defs);
        el("feGaussianBlur", { stdDeviation: 3.2 }, glow);

        /* base map: shadow, walls, tops */
        if (cfg.shadow) el("path", { d: all, transform: `translate(${cfg.depth * 0.5},${cfg.depth + 8})`, fill: "#000", "fill-opacity": 0.32, filter: "url(#ir3dBlur)" }, svg);
        const depth = Math.max(0, Math.round(cfg.depth));
        const gWalls = el("g", {}, svg);
        for (let i = depth; i >= 1; i--) {
            const t = depth <= 1 ? 0 : (i - 1) / (depth - 1);
            const c = mix(cfg.sideTop, cfg.sideBottom, Math.pow(t, 0.8));
            el("path", { d: all, transform: `translate(0,${i})`, fill: c, stroke: c, "stroke-width": 1.2, "stroke-linejoin": "round" }, gWalls);
        }
        el("path", { d: all, transform: "translate(0,0.8)", fill: "none", stroke: cfg.sideBottom, "stroke-opacity": 0.55, "stroke-width": 1.4 }, gWalls);

        const gTops = el("g", {}, svg);
        PREPARED.forEach((pr, i) => {
            const id = pr.shape.id;
            const shade = ((i * 37) % 9 - 4) / 100; // tiny per-province variation so borders read on a flat fill
            const fill = shade >= 0 ? mix(cfg.baseFill, "#ffffff", shade) : mix(cfg.baseFill, "#000000", -shade);
            const p = el("path", { d: paths.get(id), fill, stroke: cfg.border, "stroke-width": 0.9, "stroke-linejoin": "round", "data-id": id, class: "ir3d-prov" }, gTops);
            p.addEventListener("mouseenter", e => this.focusProvince(id, e));
            p.addEventListener("mousemove", e => { if (!this.cfg.callout) this.cb.onHover(null, id, e); });
            p.addEventListener("mouseleave", () => this.clearFocus());
            p.addEventListener("click", e => {
                e.stopPropagation();
                const keys = this.drawn.filter(d => d.r.from === id || d.r.to === id).map(d => d.r.key);
                this.cb.onSelect(keys, e.ctrlKey || e.metaKey || e.shiftKey);
            });
        });
        el("path", { d: all, fill: "url(#ir3dSheen)", "pointer-events": "none" }, svg);

        /* labels (under the arcs) */
        const gLabels = el("g", { "pointer-events": "none" }, svg);
        const totalArea = PREPARED.reduce((s, p) => s + p.area, 0);
        const scaleRef = (BOUNDS.x1 - BOUNDS.x0) * k / 900;
        const involved = new Set<string>();
        for (const r of this.routes) { involved.add(r.from); involved.add(r.to); }
        if (cfg.showLabels) for (const pr of PREPARED) {
            const [x, y] = this.node.get(pr.shape.id);
            const rel = Math.sqrt(pr.area / totalArea * 31);
            let fs = cfg.fontSize * Math.max(0.72, Math.min(1.2, rel)) * Math.max(0.78, Math.min(1.5, scaleRef));
            const room = pr.chord * k * 1.3;
            const w = pr.shape.fa.length * 0.42;
            if (room > 0 && w * fs > room) fs = Math.max(fs * 0.8, room / w);
            if (fs < 5.6) continue;
            const dy = cfg.nodes && involved.has(pr.shape.id) ? fs * 1.05 : 0;
            const t = el("text", { x, y: y + dy, "text-anchor": "middle", "dominant-baseline": "central", "font-size": fs.toFixed(1), fill: cfg.labelColor, class: "ir3d-label" }, gLabels);
            t.textContent = pr.shape.fa;
        }

        /* routes */
        const gGround = el("g", { class: "ir3d-ground", "pointer-events": "none" }, svg);
        const gArcs = el("g", { class: "ir3d-arcs", "pointer-events": "none" }, svg);
        const vals = this.routes.map(r => r.value);
        const vmin = Math.min(...vals), vmax = Math.max(...vals);
        const opac = [0.16, 0.28, 0.5, 0.82, 1];
        for (const r of this.routes) {
            const a = this.node.get(r.from), b = this.node.get(r.to);
            if (!a || !b || r.from === r.to) continue;
            const dx = b[0] - a[0], dy = b[1] - a[1], dist = Math.hypot(dx, dy) || 1;
            const n: Pt = [-dy / dist, dx / dist];          // perpendicular: A→B and B→A bend to opposite sides
            const side = dist * 0.14;
            const lift = Math.min(dist * cfg.arcHeight, this.mapBox.h * 0.22) + 4;
            const mid: Pt = [(a[0] + b[0]) / 2 + n[0] * side, (a[1] + b[1]) / 2 + n[1] * side];
            const c: Pt = [mid[0], mid[1] - lift];
            const bucket = this.bucket(r.value);
            const tNorm = vmax > vmin ? (r.value - vmin) / (vmax - vmin) : 1;
            // convex curve: the busiest routes get most of the extra thickness
            const width = cfg.minWidth + (cfg.maxWidth - cfg.minWidth) * Math.pow(tNorm, 0.85) * (0.35 + 0.65 * bucket / 4);
            const color = cfg.colors[bucket];
            const d = `M${a[0].toFixed(1)},${a[1].toFixed(1)}Q${c[0].toFixed(1)},${c[1].toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}`;
            const dg = `M${a[0].toFixed(1)},${a[1].toFixed(1)}Q${mid[0].toFixed(1)},${mid[1].toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}`;

            if (bucket >= 2) el("path", { d: dg, fill: "none", stroke: "#000", "stroke-opacity": 0.1 + 0.2 * opac[bucket], "stroke-width": Math.max(1, width * 0.8), "stroke-linecap": "round", "data-k": r.key }, gGround);
            const g = el("g", { class: `ir3d-route b${bucket}`, "data-k": r.key }, gArcs);
            if (cfg.glow && bucket === 4)
                el("path", { d, fill: "none", stroke: color, "stroke-width": width * 2.4, "stroke-opacity": 0.5, filter: "url(#ir3dGlow)", "stroke-linecap": "round" }, g);
            el("path", { d, fill: "none", stroke: color, "stroke-width": width.toFixed(2), "stroke-opacity": opac[bucket], "stroke-linecap": "round", class: "ir3d-main" }, g);
            if (cfg.animate && bucket === 4) {
                const dash = Math.max(10, width * 3);
                const ap = el("path", { d, fill: "none", stroke: "#fff", "stroke-opacity": 0.75, "stroke-width": Math.max(1, width * 0.4).toFixed(2), "stroke-linecap": "round", "stroke-dasharray": `${(dash * 0.35).toFixed(1)} ${(dash * 0.65 + 6).toFixed(1)}`, class: "ir3d-flow" }, g);
                ap.style.setProperty("--dash", (dash + 6).toFixed(1));
                ap.style.animationDuration = "1s";
            }
            if (cfg.arrows && bucket >= 2) {
                const t = 0.86, p = qPoint(a, c, b, t), tg = qTangent(a, c, b, t);
                const len = Math.hypot(tg[0], tg[1]) || 1, ux = tg[0] / len, uy = tg[1] / len;
                const s = Math.max(4, width * 1.6 + 2.5);
                const tip: Pt = [p[0] + ux * s, p[1] + uy * s];
                const l: Pt = [p[0] - uy * s * 0.6, p[1] + ux * s * 0.6], rr: Pt = [p[0] + uy * s * 0.6, p[1] - ux * s * 0.6];
                el("path", { d: `M${tip[0].toFixed(1)},${tip[1].toFixed(1)}L${l[0].toFixed(1)},${l[1].toFixed(1)}L${rr[0].toFixed(1)},${rr[1].toFixed(1)}Z`, fill: color, "fill-opacity": Math.min(1, opac[bucket] + 0.1), class: "ir3d-arrow" }, g);
            }
            this.drawn.push({ r, a, b, c, bucket, width, g });
        }

        /* nodes */
        if (cfg.nodes) {
            const gNodes = el("g", { "pointer-events": "none" }, svg);
            const vol = new Map<string, number>();
            for (const d of this.drawn) { vol.set(d.r.from, (vol.get(d.r.from) || 0) + d.r.value); vol.set(d.r.to, (vol.get(d.r.to) || 0) + d.r.value); }
            const vm = Math.max(1, ...vol.values());
            for (const [id, v] of vol) {
                const [x, y] = this.node.get(id);
                const rr = 2.2 + 3.8 * Math.sqrt(v / vm);
                el("circle", { cx: x, cy: y + 1.5, r: rr, fill: "#000", "fill-opacity": 0.35 }, gNodes);
                el("circle", { cx: x, cy: y, r: rr, fill: cfg.nodeColor, stroke: cfg.colors[3], "stroke-width": 1.4, "data-node": id }, gNodes);
            }
        }

        /* invisible hit targets, same order as arcs (heavy on top) */
        const gHit = el("g", { class: "ir3d-hit" }, svg);
        for (const dr of this.drawn) {
            const h = el("path", {
                d: `M${dr.a[0]},${dr.a[1]}Q${dr.c[0]},${dr.c[1]} ${dr.b[0]},${dr.b[1]}`, fill: "none", stroke: "transparent",
                "stroke-width": Math.max(10, dr.width + 8), "data-key": dr.r.key, style: "cursor:pointer"
            }, gHit);
            h.addEventListener("mouseenter", e => this.focusRoute(dr, e));
            h.addEventListener("mousemove", e => { if (!this.cfg.callout) this.cb.onHover(dr.r.key, null, e); });
            h.addEventListener("mouseleave", () => this.clearFocus());
            h.addEventListener("click", e => { e.stopPropagation(); this.cb.onSelect([dr.r.key], e.ctrlKey || e.metaKey || e.shiftKey); });
        }
        this.gPin = el("g", { "pointer-events": "none" }, svg);
        this.applyEmphasis(null);
    }

    /* ---------- focus / emphasis ---------- */
    private applyEmphasis(on: Set<string> | null): void {
        const set = on ?? (this.selected.size ? this.selected : null);
        this.svg.classList.toggle("ir3d-dim", !!set);
        for (const d of this.drawn) d.g.classList.toggle("on", !!set && set.has(d.r.key));
        this.svg.querySelectorAll(".ir3d-ground path").forEach(p => {
            (p as SVGElement).style.opacity = set && !set.has(p.getAttribute("data-k")) ? "0.25" : "";
        });
        if (set) { // bring emphasised routes to the front
            const parent = this.drawn[0]?.g.parentNode;
            for (const d of this.drawn) if (set.has(d.r.key)) parent.appendChild(d.g);
        }
    }

    private focusRoute(dr: DrawnRoute, e: MouseEvent): void {
        this.applyEmphasis(new Set([dr.r.key]));
        if (!this.cfg.callout) { this.cb.onHover(dr.r.key, null, e); return; }
        const fromP = BY_ID.get(dr.r.from).shape.fa, toP = BY_ID.get(dr.r.to).shape.fa;
        const rows: TooltipField[] = [
            { name: this.cfg.measureName, value: this.nf.format(dr.r.value) },
            { name: "سهم از کل", value: this.nf.format(Math.round(dr.r.value / (this.total || 1) * 1000) / 10) + "٪" },
            ...dr.r.tooltips,
        ];
        const back = this.drawn.find(d => d.r.from === dr.r.to && d.r.to === dr.r.from);
        if (back) rows.push({ name: "مسیر برگشت", value: this.nf.format(back.r.value) });
        const apex = qPoint(dr.a, dr.c, dr.b, 0.5);
        this.showCallout(`از ${fromP} به ${toP}`, rows, apex);
    }

    private focusProvince(id: string, e: MouseEvent): void {
        const mine = this.drawn.filter(d => d.r.from === id || d.r.to === id);
        this.applyEmphasis(new Set(mine.map(d => d.r.key)));
        if (!this.cfg.callout) { this.cb.onHover(null, id, e); return; }
        const out = mine.filter(d => d.r.from === id).reduce((s, d) => s + d.r.value, 0);
        const inn = mine.filter(d => d.r.to === id).reduce((s, d) => s + d.r.value, 0);
        const rows: TooltipField[] = [
            { name: "خروجی", value: this.nf.format(out) },
            { name: "ورودی", value: this.nf.format(inn) },
            { name: "تعداد مسیر", value: this.nf.format(mine.length) },
        ];
        const top = mine.slice().sort((a, b) => b.r.value - a.r.value)[0];
        if (top) {
            const other = top.r.from === id ? top.r.to : top.r.from;
            rows.push({ name: "پرترددترین", value: `${BY_ID.get(other).shape.fa} (${this.nf.format(top.r.value)})` });
        }
        this.showCallout("استان " + BY_ID.get(id).shape.fa, rows, this.node.get(id));
    }

    private clearFocus(): void {
        this.applyEmphasis(null);
        this.calloutEl.style.display = "none";
        while (this.gPin.firstChild) this.gPin.removeChild(this.gPin.firstChild);
        this.cb.onHoverEnd();
    }

    private showCallout(title: string, rows: TooltipField[], anchor: Pt): void {
        const c = this.calloutEl;
        c.replaceChildren();
        div("ir3d-c-title", c, title);
        for (const r of rows) {
            const row = div("ir3d-c-row", c);
            div("ir3d-c-name", row, r.name + ":");
            div("ir3d-c-val", row, r.value);
        }
        c.style.display = "block";
        const cw = c.offsetWidth, ch = c.offsetHeight, stem = 30;
        const ax = this.mapBox.x + anchor[0], ay = this.mapBox.y + anchor[1];
        let top = ay - stem - ch, below = false;
        if (top < 4) { top = ay + stem; below = true; }
        const left = Math.max(4, Math.min(this.root.clientWidth - cw - 4, ax - cw / 2));
        c.style.left = left + "px";
        c.style.top = top + "px";
        while (this.gPin.firstChild) this.gPin.removeChild(this.gPin.firstChild);
        const endY = (below ? top : top + ch) - this.mapBox.y;
        el("line", { x1: anchor[0], y1: anchor[1], x2: anchor[0], y2: endY, stroke: "#fff", "stroke-width": 3 }, this.gPin);
        el("line", { x1: anchor[0], y1: anchor[1], x2: anchor[0], y2: endY, stroke: "#2b2b2b", "stroke-width": 1.2 }, this.gPin);
        el("circle", { cx: anchor[0], cy: anchor[1], r: 5, fill: "#fff", stroke: "#2b2b2b", "stroke-width": 1.6 }, this.gPin);
    }

    /* ---------- legend ---------- */
    private renderLegend(mode: "side" | "bottom" | "none"): void {
        const L = this.legend;
        L.replaceChildren();
        L.className = `ir3d-legend ir3d-legend-${mode} ir3d-legend-${this.cfg.legendPosition}`;
        if (mode === "none" || !this.routes.length) { L.style.display = "none"; return; }
        L.style.display = "block";
        L.style.width = "";
        L.style.top = "";
        const [t1, t2, t3, t4] = this.breaks;
        const f = (v: number) => this.nf.format(v);
        const int = this.breaks.every(v => Number.isInteger(v));
        const nx = (v: number) => int ? v + 1 : v;
        const range = (lo: number, hi: number) => lo >= hi ? f(hi) : `${f(lo)} – ${f(hi)}`;
        const labels = [`${f(t1)} و کمتر`, range(nx(t1), t2), range(nx(t2), t3), range(nx(t3), t4), `بیشتر از ${f(t4)}`];
        div("ir3d-l-title", L, this.cfg.legendTitle);
        const list = div("ir3d-l-items", L);
        const counts = [0, 0, 0, 0, 0];
        for (const r of this.routes) counts[this.bucket(r.value)]++;
        const { minWidth: w0, maxWidth: w1 } = this.cfg;
        for (let b = 4; b >= 0; b--) {
            if (!counts[b]) continue;
            const it = div("ir3d-l-item", list);
            const sw = el("svg", { width: 34, height: 16, class: "ir3d-l-sw" }, it);
            const w = w0 + (w1 - w0) * Math.pow(b / 4, 0.85) * (0.35 + 0.65 * b / 4);
            const op = [0.35, 0.5, 0.7, 0.9, 1][b];
            if (this.cfg.glow && b === 4) el("line", { x1: 4, y1: 8, x2: 30, y2: 8, stroke: this.cfg.colors[b], "stroke-width": w * 2.2, "stroke-opacity": 0.3, "stroke-linecap": "round" }, sw);
            el("line", { x1: 4, y1: 8, x2: 30, y2: 8, stroke: this.cfg.colors[b], "stroke-width": Math.max(1, w), "stroke-opacity": op, "stroke-linecap": "round" }, sw);
            div("ir3d-l-label", it, labels[b]);
            div("ir3d-l-count", it, f(counts[b]));
        }
        const foot = this.hidden > 0 ? `${f(this.routes.length)} مسیر پرتردد از ${f(this.routes.length + this.hidden)}` : `${f(this.routes.length)} مسیر`;
        div("ir3d-l-foot", L, foot);
    }
}

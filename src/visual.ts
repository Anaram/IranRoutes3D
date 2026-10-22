"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import IVisualEventService = powerbi.extensibility.IVisualEventService;

import { VisualFormattingSettingsModel } from "./settings";
import { FlowRenderer, FlowConfig, RouteDatum } from "./flowRenderer";
import { matchProvince } from "./names";
import { PROVINCES } from "./geo";
import { FONT_CSS } from "./font";

interface Route extends RouteDatum { selectionIds: ISelectionId[]; }

export class Visual implements IVisual {
    private host: IVisualHost;
    private events: IVisualEventService;
    private selectionManager: ISelectionManager;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService = new FormattingSettingsService();
    private renderer: FlowRenderer;
    private routes = new Map<string, Route>();
    private last: { w: number; h: number; routes: Route[]; cfg: FlowConfig; unmatched: string[] } | null = null;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.selectionManager = this.host.createSelectionManager();
        const style = document.createElement("style");
        style.textContent = FONT_CSS;
        options.element.appendChild(style);

        this.renderer = new FlowRenderer(options.element, {
            onSelect: (keys, multi) => this.select(keys, multi),
            onContextMenu: (key, x, y) => {
                const r = key ? this.routes.get(key) : undefined;
                this.selectionManager.showContextMenu(r ? r.selectionIds[0] : {}, { x, y });
            },
            onHover: (key, prov, e) => this.showTooltip(key, prov, e),
            onHoverEnd: () => this.host.tooltipService.hide({ immediately: true, isTouchEvent: false }),
        });
        this.selectionManager.registerOnSelectCallback(() => this.redraw());
    }

    public update(options: VisualUpdateOptions) {
        this.events.renderingStarted(options);
        try {
            const dv = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dv);
            const { routes, unmatched, measureName } = this.parse(dv);
            this.routes = new Map(routes.map(r => [r.key, r]));
            this.last = { w: options.viewport.width, h: options.viewport.height, routes, cfg: this.buildConfig(measureName), unmatched };
            this.redraw();
            this.events.renderingFinished(options);
        } catch (error) {
            this.events.renderingFailed(options, String(error));
        }
    }

    private redraw(): void {
        if (!this.last) return;
        const sel = this.selectionManager.getSelectionIds() as ISelectionId[];
        const selected = new Set<string>();
        if (sel.length) for (const r of this.routes.values()) if (r.selectionIds.some(id => sel.some(s => s.equals(id)))) selected.add(r.key);
        const a = this.last;
        this.renderer.render(a.w, a.h, a.routes, a.cfg, selected, a.unmatched);
    }

    private parse(dv: powerbi.DataView | undefined) {
        const routes: Route[] = [];
        const unmatched = new Set<string>();
        let measureName = "";
        const cats = dv?.categorical?.categories || [];
        const oCol = cats.find(c => c.source.roles && c.source.roles["origin"]);
        const dCol = cats.find(c => c.source.roles && c.source.roles["destination"]);
        if (!oCol || !dCol) return { routes, unmatched: [] as string[], measureName };
        const values = dv.categorical.values || ([] as unknown as powerbi.DataViewValueColumns);
        const measure = values.find(v => v.source.roles && v.source.roles["measure"]);
        const tips = values.filter(v => v.source.roles && v.source.roles["tooltips"]);
        measureName = measure ? measure.source.displayName : "";
        const merged = new Map<string, Route>();
        for (let i = 0; i < oCol.values.length; i++) {
            const o = matchProvince(oCol.values[i]), d = matchProvince(dCol.values[i]);
            if (!o && oCol.values[i] !== null && oCol.values[i] !== "") unmatched.add(String(oCol.values[i]));
            if (!d && dCol.values[i] !== null && dCol.values[i] !== "") unmatched.add(String(dCol.values[i]));
            if (!o || !d || o.id === d.id) continue;
            const v = measure ? Number(measure.values[i]) : 1;
            if (isNaN(v)) continue;
            const key = o.id + ">" + d.id;
            const id = this.host.createSelectionIdBuilder().withCategory(oCol, i).withCategory(dCol, i).createSelectionId();
            const ex = merged.get(key);
            if (ex) { ex.value += v; ex.selectionIds.push(id); continue; } // same pair spelled differently → sum
            merged.set(key, {
                key, from: o.id, to: d.id, value: v,
                tooltips: tips.map(t => ({ name: t.source.displayName, value: this.fmt(t.values[i]) })),
                selectionIds: [id],
            });
        }
        routes.push(...merged.values());
        return { routes, unmatched: [...unmatched], measureName };
    }

    private fmt(v: powerbi.PrimitiveValue): string {
        if (v === null || v === undefined) return "—";
        const persian = this.formattingSettings?.general.persianDigits.value ?? true;
        if (typeof v === "number") return new Intl.NumberFormat(persian ? "fa-IR" : "en-US", { maximumFractionDigits: 2 }).format(v);
        if (v instanceof Date) return v.toLocaleDateString(persian ? "fa-IR" : "en-US");
        return String(v);
    }

    private buildConfig(measureName: string): FlowConfig {
        const s = this.formattingSettings;
        const r = s.routes, b = s.base, l = s.labels, lg = s.legend, h = s.header, g = s.general;
        const clamp = (v: number, a: number, z: number) => Math.max(a, Math.min(z, Number(v) || 0));
        const label = measureName || "تعداد پیمایش";
        const minW = clamp(r.minWidth.value, 0.3, 20), maxW = clamp(r.maxWidth.value, 0.5, 30);
        return {
            auto: (r.mode.value?.value ?? "auto") === "auto",
            thresholds: [r.t1.value, r.t2.value, r.t3.value, r.t4.value].map(Number).sort((x, y) => x - y) as [number, number, number, number],
            colors: [r.c1.value.value, r.c2.value.value, r.c3.value.value, r.c4.value.value, r.c5.value.value],
            minWidth: Math.min(minW, maxW),
            maxWidth: Math.max(minW, maxW),
            arcHeight: clamp(r.arcHeight.value, 0, 80) / 100,
            maxRoutes: clamp(r.maxRoutes.value, 0, 2000),
            arrows: r.arrows.value,
            animate: r.animate.value,
            glow: r.glow.value,
            baseFill: b.fill.value.value,
            border: b.border.value.value,
            depth: clamp(b.depth.value, 0, 60),
            tilt: clamp(b.tilt.value, 30, 100) / 100,
            perspective: clamp(b.perspective.value, 0, 40) / 100,
            sideTop: b.sideTop.value.value,
            sideBottom: b.sideBottom.value.value,
            shadow: b.shadow.value,
            nodes: b.nodes.value,
            nodeColor: b.nodeColor.value.value,
            showLabels: l.show.value,
            fontSize: clamp(l.fontSize.value, 6, 30),
            labelColor: l.color.value.value,
            showLegend: lg.show.value,
            legendTitle: lg.title.value || label,
            legendPosition: (lg.position.value?.value as "right" | "left") || "right",
            showHeader: h.show.value,
            headerText: h.text.value || `مسیرهای بین‌استانی بر اساس ${label}`,
            headerSize: clamp(h.fontSize.value, 10, 48),
            headerColor: h.color.value.value,
            persianDigits: g.persianDigits.value,
            callout: g.callout.value,
            measureName: label,
        };
    }

    private select(keys: string[], multi: boolean): void {
        if (this.host.hostCapabilities && this.host.hostCapabilities.allowInteractions === false) return;
        const ids = keys.flatMap(k => this.routes.get(k)?.selectionIds ?? []);
        if (!ids.length) { this.selectionManager.clear().then(() => this.redraw()); return; }
        this.selectionManager.select(ids, multi).then(() => this.redraw());
    }

    private showTooltip(key: string | null, prov: string | null, e: MouseEvent): void {
        const cfg = this.last?.cfg;
        const fa = (id: string) => PROVINCES.find(p => p.id === id)?.fa ?? id;
        let items: powerbi.extensibility.VisualTooltipDataItem[] = [];
        let identities: ISelectionId[] = [];
        if (key) {
            const r = this.routes.get(key);
            if (!r) return;
            items = [
                { displayName: "مسیر", value: `از ${fa(r.from)} به ${fa(r.to)}` },
                { displayName: cfg?.measureName || "تعداد", value: this.fmt(r.value) },
                ...r.tooltips.map(t => ({ displayName: t.name, value: t.value })),
            ];
            identities = r.selectionIds;
        } else if (prov) {
            const mine = [...this.routes.values()].filter(r => r.from === prov || r.to === prov);
            items = [
                { displayName: "استان", value: fa(prov) },
                { displayName: "خروجی", value: this.fmt(mine.filter(r => r.from === prov).reduce((s, r) => s + r.value, 0)) },
                { displayName: "ورودی", value: this.fmt(mine.filter(r => r.to === prov).reduce((s, r) => s + r.value, 0)) },
            ];
        }
        this.host.tooltipService.show({ coordinates: [e.clientX, e.clientY], dataItems: items, identities, isTouchEvent: false });
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}

"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import Card = formattingSettings.SimpleCard;
import Slice = formattingSettings.Slice;
import Model = formattingSettings.Model;

const color = (name: string, displayName: string, value: string) =>
    new formattingSettings.ColorPicker({ name, displayName, value: { value } });
const num = (name: string, displayName: string, value: number) =>
    new formattingSettings.NumUpDown({ name, displayName, value });
const toggle = (name: string, displayName: string, value: boolean) =>
    new formattingSettings.ToggleSwitch({ name, displayName, value });
const text = (name: string, displayName: string, value: string, placeholder: string) =>
    new formattingSettings.TextInput({ name, displayName, value, placeholder });

class RoutesCard extends Card {
    mode = new formattingSettings.ItemDropdown({
        name: "mode",
        displayName: "روش بازه‌بندی",
        items: [{ value: "auto", displayName: "خودکار (چندک)" }, { value: "manual", displayName: "دستی" }],
        value: { value: "auto", displayName: "خودکار (چندک)" }
    });
    t1 = num("t1", "مرز ۱ (دستی)", 100);
    t2 = num("t2", "مرز ۲ (دستی)", 500);
    t3 = num("t3", "مرز ۳ (دستی)", 2000);
    t4 = num("t4", "مرز ۴ (دستی)", 5000);
    c1 = color("c1", "کم‌ترددترین", "#8A7550");
    c2 = color("c2", "کم‌تردد", "#A88A4A");
    c3 = color("c3", "متوسط", "#D9A93F");
    c4 = color("c4", "پرتردد", "#F4C542");
    c5 = color("c5", "پرترددترین", "#FFE066");
    minWidth = num("minWidth", "کمترین ضخامت (px)", 1);
    maxWidth = num("maxWidth", "بیشترین ضخامت (px)", 8);
    arcHeight = num("arcHeight", "ارتفاع قوس (%)", 22);
    maxRoutes = num("maxRoutes", "حداکثر تعداد مسیر", 200);
    arrows = toggle("arrows", "فلش جهت", true);
    animate = toggle("animate", "حرکت روی مسیرهای پرتردد", true);
    glow = toggle("glow", "درخشش مسیرهای پرتردد", true);
    name = "routes";
    displayName = "مسیرها";
    slices: Slice[] = [this.mode, this.t1, this.t2, this.t3, this.t4, this.c1, this.c2, this.c3, this.c4, this.c5,
        this.minWidth, this.maxWidth, this.arcHeight, this.maxRoutes, this.arrows, this.animate, this.glow];
}

class BaseCard extends Card {
    fill = color("fill", "رنگ استان‌ها", "#3B3B3B");
    border = color("border", "رنگ مرزها", "#6A6250");
    depth = num("depth", "عمق سه‌بعدی (px)", 16);
    tilt = num("tilt", "شیب دید (%)", 80);
    perspective = num("perspective", "پرسپکتیو (%)", 8);
    sideTop = color("sideTop", "رنگ دیواره (بالا)", "#E9B945");
    sideBottom = color("sideBottom", "رنگ دیواره (پایین)", "#5E420C");
    shadow = toggle("shadow", "سایه", true);
    nodes = toggle("nodes", "نقطه مبدأ/مقصد", true);
    nodeColor = color("nodeColor", "رنگ نقطه‌ها", "#FFFFFF");
    name = "base";
    displayName = "نقشه پایه";
    slices: Slice[] = [this.fill, this.border, this.depth, this.tilt, this.perspective, this.sideTop, this.sideBottom, this.shadow, this.nodes, this.nodeColor];
}

class LabelsCard extends Card {
    show = toggle("show", "نمایش نام استان", true);
    fontSize = num("fontSize", "اندازه فونت", 10);
    color = color("color", "رنگ", "#D9D2C0");
    name = "labels";
    displayName = "برچسب‌ها";
    slices: Slice[] = [this.show, this.fontSize, this.color];
}

class LegendCard extends Card {
    show = toggle("show", "نمایش", true);
    title = text("title", "عنوان", "", "خالی = نام فیلد مقدار");
    position = new formattingSettings.ItemDropdown({
        name: "position",
        displayName: "موقعیت",
        items: [{ value: "right", displayName: "راست" }, { value: "left", displayName: "چپ" }],
        value: { value: "right", displayName: "راست" }
    });
    name = "legend";
    displayName = "راهنما (Legend)";
    slices: Slice[] = [this.show, this.title, this.position];
}

class HeaderCard extends Card {
    show = toggle("show", "نمایش", true);
    text = text("text", "متن", "", "خالی = «مسیرهای بین‌استانی بر اساس …»");
    fontSize = num("fontSize", "اندازه فونت", 22);
    color = color("color", "رنگ", "#1E1E1E");
    name = "header";
    displayName = "عنوان نقشه";
    slices: Slice[] = [this.show, this.text, this.fontSize, this.color];
}

class GeneralCard extends Card {
    persianDigits = toggle("persianDigits", "اعداد فارسی", true);
    callout = toggle("callout", "کارت اطلاعات اختصاصی (به‌جای Tooltip)", true);
    name = "general2";
    displayName = "عمومی";
    slices: Slice[] = [this.persianDigits, this.callout];
}

export class VisualFormattingSettingsModel extends Model {
    routes = new RoutesCard();
    base = new BaseCard();
    labels = new LabelsCard();
    legend = new LegendCard();
    header = new HeaderCard();
    general = new GeneralCard();
    cards = [this.routes, this.base, this.labels, this.legend, this.header, this.general];
}

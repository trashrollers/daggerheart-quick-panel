export const MODULE_ID = "daggerheart-quick-panel";
export const TEMPLATE = `modules/${MODULE_ID}/templates/panel.hbs`;
export const ADVERSARY_TEMPLATE = `modules/${MODULE_ID}/templates/adversary-panel.hbs`;
export const GENERIC_TEMPLATE = `modules/${MODULE_ID}/templates/generic-panel.hbs`;
export const ITEM_PARTIAL = `modules/${MODULE_ID}/templates/partials/item-row.hbs`;
export const SUPPORTED_ACTOR_TYPES = ["character", "adversary", "companion", "npc", "environment", "party"];

export const TRAITS = [
  ["agility", "Agility", "fa-solid fa-person-running"],
  ["strength", "Strength", "fa-solid fa-hand-fist"],
  ["finesse", "Finesse", "fa-solid fa-hand-sparkles"],
  ["instinct", "Instinct", "fa-solid fa-eye"],
  ["presence", "Presence", "fa-solid fa-masks-theater"],
  ["knowledge", "Knowledge", "fa-solid fa-book-open"],
];

export const ITEM_TYPE_ORDER = ["weapon", "armor", "consumable", "loot"];

export const HUD_THEMES = [
  ["daggerheart", "DQP.Theme.Daggerheart"],
  ["minimal", "DQP.Theme.Minimal"],
  ["arcane", "DQP.Theme.Arcane"],
  ["sacred", "DQP.Theme.Sacred"],
  ["monochrome", "DQP.Theme.Monochrome"],
];

export const HUD_PLACEMENTS = [
  ["center", "DQP.Placement.Center", "fa-solid fa-arrows-to-circle"],
  ["side", "DQP.Placement.Side", "fa-solid fa-align-left"],
];


export function localize(key, data) {
  return data ? game.i18n.format(key, data) : game.i18n.localize(key);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  if (typeof value.values === "function") return Array.from(value.values());
  if (typeof value[Symbol.iterator] === "function") return Array.from(value);
  return typeof value === "object" ? Object.values(value) : [];
}

// Detect capabilities rather than branching on version numbers. Daggerheart
// exposes collections and action classes differently across its 2.x releases.
export function itemActions(item) {
  const system = item?.system;
  if (!system) return [];
  if (system.actionsList != null) return asArray(system.actionsList).filter(Boolean);
  return [system.attack, ...asArray(system.actions)].filter(Boolean);
}

export function systemActionType(type) {
  const api = game.system.api;
  return api?.data?.actions?.actionsTypes?.[type]
    ?? api?.models?.actions?.actionsTypes?.[type];
}

export function sheetAction(actor, name) {
  const sheet = actor?.sheet;
  if (!sheet) return null;
  for (const actions of [sheet.options?.actions, sheet.constructor?.DEFAULT_OPTIONS?.actions]) {
    const action = actions instanceof Map ? actions.get(name) : actions?.[name];
    const handler = typeof action === "function" ? action : action?.handler;
    if (typeof handler === "function") return { sheet, handler };
  }
  return null;
}

export function actionLabels(attack) {
  try {
    const source = attack?._getLabels;
    const raw = typeof source === "function" ? source.call(attack) : source;
    const labels = raw && typeof raw === "object" && "value" in raw ? [raw] : asArray(raw);
    return labels.map(label => label?.value ?? label)
      .filter(label => typeof label === "string" || typeof label === "number")
      .map(label => localize(String(label))).filter(Boolean);
  } catch (error) {
    // Labels are optional presentation data: a broken system label helper
    // must not prevent the actor, resources and attack button from rendering.
    console.warn(`${MODULE_ID} | Attack labels are unavailable`, error);
    return [];
  }
}

export function escapeHTML(value) {
  const element = document.createElement("span");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

export function changePaths(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return prefix ? [prefix] : [];
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object" && !Array.isArray(child) ? changePaths(child, path) : [path];
  });
}

export function plainText(html, max = 180) {
  const holder = document.createElement("template");
  holder.innerHTML = html || "";
  holder.content.querySelectorAll("script, style").forEach((node) => node.remove());
  holder.content.querySelectorAll("p, div, li, br, h1, h2, h3, h4").forEach((node) => node.append(document.createTextNode("\n")));
  const text = (holder.content.textContent || "").replace(/[\t ]+/g, " ").replace(/\n\s*\n/g, "\n\n").trim();
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}


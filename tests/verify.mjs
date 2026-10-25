import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const json = (relative) => JSON.parse(read(relative));

const manifest = json("module.json");
const en = json("lang/en.json");
const ru = json("lang/ru.json");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function leafKeys(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object" ? leafKeys(child, next) : [next];
  });
}

assert(manifest.id === "daggerheart-quick-panel", "Unexpected module id");
assert(manifest.relationships.systems.some((system) => system.id === "daggerheart"), "Daggerheart relationship is missing");
assert(Number(manifest.compatibility.minimum.split(".")[1]) <= 361, "Foundry 14 build 361 must be allowed by the manifest");
assert(manifest.relationships.systems.find((system) => system.id === "daggerheart").compatibility.minimum === "2.2.6", "Daggerheart 2.2.6 must be allowed by the manifest");

for (const relative of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map((language) => language.path)]) {
  assert(fs.existsSync(path.join(root, relative)), `Missing manifest file: ${relative}`);
}

const enKeys = leafKeys(en).sort();
const ruKeys = leafKeys(ru).sort();
assert(manifest.languages.some((language) => language.lang === "en") && manifest.languages.some((language) => language.lang === "ru"), "English and Russian language packs must both be registered");
assert(JSON.stringify(ruKeys) === JSON.stringify(enKeys), "Russian localization must cover every English HUD key");

for (const key of enKeys) {
  const get = (value) => key.split(".").reduce((current, part) => current?.[part], value);
  const placeholders = (value) => [...String(value).matchAll(/\{\w+\}/g)].map((match) => match[0]).sort().join(",");
  assert(placeholders(get(en)) === placeholders(get(ru)), `Russian placeholders differ for ${key}`);
}

const sources = [
  read("scripts/helpers.js"),
  read("scripts/panel-base.js"),
  read("scripts/main.js"),
  read("templates/panel.hbs"),
  read("templates/adversary-panel.hbs"),
  read("templates/generic-panel.hbs"),
  read("templates/partials/item-row.hbs"),
].join("\n");

const referencedKeys = new Set(Array.from(sources.matchAll(/["'](DQP\.[A-Za-z0-9.]+)["']/g), (match) => match[1]));
for (const key of referencedKeys) assert(enKeys.includes(key), `Missing localization key: ${key}`);

assert(!sources.includes("systems/daggerheart/"), "Runtime code must not patch or import Daggerheart system files");
assert(sources.includes("actor.rollTrait"), "Native trait roll integration is missing");
assert(sources.includes('actionLabels(attack)') && sources.includes('source.call(attack)'), "Safe attack label compatibility is missing");
assert(sources.includes("item.use(event)"), "Native item action integration is missing");
assert(sources.includes('Hooks.on("controlToken"') && sources.includes('actor?.type === "adversary"'), "Automatic GM adversary selection is missing");
assert(sources.includes('game.user?.isGM !== true') && sources.includes('playerHudRecovery'), "Player HUD startup is not isolated from the GM extension");
assert(sources.includes('data-action="use-adversary-attack"') && sources.includes("actor.system.attack.use(event)"), "Native adversary attack integration is missing");
assert(["character", "adversary", "companion", "npc", "environment", "party"].every((type) => sources.includes(`"${type}"`)), "One or more Daggerheart actor types are unsupported");
assert(sources.includes("prepareGenericContext") && sources.includes('class="dqp-adversary-panel dqp-generic-panel '), "Compact HUD for non-character actor types is missing");
assert(sources.includes("updates.addResources?.(costs)") && sources.includes("await updates.updateResources()"), "HUD trait rolls must commit native Hope/Fear resource updates");
assert(sources.includes('sheetAction(actor, "rollAttribute")') && sources.includes('sheetAction(actor, "useDowntime")'), "Native installed-sheet workflows must be preferred");
assert(sources.includes('api?.data?.actions?.actionsTypes') && sources.includes('api?.models?.actions?.actionsTypes'), "Old and new system API namespaces must be supported");
assert(sources.includes("total: -cost.total"), "Daggerheart 2.2.6 trait costs require the native total field");
assert(sources.includes('class="dqp-adversary-panel"') && sources.includes("prepareAdversaryContext"), "Compact adversary HUD is missing");
assert(sources.includes('data-path="{{../path}}"') && sources.includes("selectedAdversaryToken"), "Adversary resource controls or selected-token binding is missing");
assert(sources.includes("applications?.dialogs?.Downtime"), "Native downtime integration is missing");
assert(sources.includes("new CharacterLevelup(actor)"), "Native character advancement integration is missing");
assert(sources.includes('class="dqp-portrait-frame" data-action="open-sheet"'), "Portrait must open the character sheet");
assert(sources.includes('data-action="select-actor"'), "Portrait actor picker is missing");
assert(sources.includes('data-action="toggle-hud"') && sources.includes("chooseActorForHud"), "Persistent HUD toggle or actor prompt is missing");
assert(sources.includes('diceTrayCollapsed') && sources.includes("sidebar.changeTab('chat', 'primary')") && sources.includes('dqp-chat-at-bottom'), "Adaptive native chat controls are missing");
assert(sources.includes("getSceneControlButtons") && sources.includes("dqp-toggle-hud") && sources.includes("game.user.isGM"), "GM HUD fallback control is missing");
assert(sources.includes("group.tools[tool.name]") && sources.includes("Array.isArray(group.tools)"), "Foundry 14 keyed Scene Controls compatibility is missing");
assert(sources.indexOf('Hooks.on("getSceneControlButtons"') < sources.indexOf('Hooks.once("ready"'), "Scene Controls hook must be registered before ready");
assert(sources.includes('data-action="toggle-group"'), "Collapsible item groups are missing");
assert(sources.includes("playGroups"), "Play tab item groups are missing");
assert(!sources.includes('type="search"'), "Gear search must not be present");
assert(read("styles/panel.css").includes("#hotbar"), "The Foundry macro hotbar replacement is missing");
assert(sources.includes('class="dqp-column dqp-column--character '), "Character column is missing");
assert(sources.includes('class="dqp-column dqp-column--traits '), "Traits and rest column is missing");
assert(sources.includes('class="dqp-column dqp-column--workspace '), "Play workspace column is missing");
assert(sources.includes('class="dqp-ribbon-scroll"'), "Inline horizontal ribbon is missing");
assert(sources.includes('data-action="toggle-column"'), "Independent column collapse controls are missing");
assert(sources.includes('data-action="toggle-utilities"') && sources.includes('class="dqp-utility-controls"')
  && sources.includes('utilityDockOpen: this.utilityDockOpen'), "Collapsible HUD utility dock is missing");
assert(sources.includes('data-effect-drop="{{id}}"') && sources.includes('actor.allApplicableEffects({ noTransferArmor: true })')
  && sources.includes('effect.update({ disabled: !active })'), "Experience-tab Active/Inactive effect transfer is missing");
assert(sources.includes('data-preview-effect="{{key}}"') && sources.includes('effect?.description || effect?.parent?.system?.description'), "Effect hover descriptions are missing");
assert(sources.includes('data-group="{{experienceGroup.key}}"') && sources.includes('data-group="{{key}}"'), "Effect and experience group collapse controls are missing");
assert(sources.includes('data-action="share-effect"') && sources.includes('async shareEffect(actor, target)')
  && !sources.includes('DialogV2.confirm'), "Experience and effect clicks must post directly to chat without confirmation");
assert(!sources.includes("Verbs") && !sources.includes("{{verbs}}"), "Trait cards must contain only icon, name, and modifier");
assert(sources.includes('class="dqp-trait-emblem"') && sources.includes('class="dqp-trait-name"') && sources.includes('class="dqp-trait-value"'), "Ornamental trait card composition is missing");
assert(sources.includes("DAGGERHEART.CONFIG.Traits.${key}.name") && sources.includes("isEnglishFallback"), "Trait names must follow the active Daggerheart translation with a HUD-language fallback");
assert(sources.includes('characterOpen') && sources.includes('traitsOpen') && sources.includes('workspaceOpen'), "Independent column state is missing");
assert(!sources.includes('data-action="close-panel"'), "A one-click close-all control must not be present");
assert(sources.includes('{{#each playGroups}}{{> inlineGroup}}'), "Play must preserve Equipment and Loadout groups");
assert(!sources.includes('data-action="edit-experiences"'), "Experiences must list existing entries without an add/edit shortcut");
assert(sources.includes('class="dqp-group-icon"'), "Collapsed category icons are missing");
assert(sources.includes('data-action="adjust-resource"') && read("styles/panel.css").includes('repeat(4,minmax(0,1fr))'), "Four numeric resource controls are missing");
assert(!sources.includes('dqp-armor-slots') && sources.includes('DQP.Resources.ChooseArmorSource'), "Armor must move into the resource row and offer source selection");
assert(sources.includes("actor.system.updateArmorValue") && sources.includes("actor.system.updateArmorEffectValue"), "Armor must use Daggerheart's native aggregate and source updates");
assert(sources.includes('data-action="toggle-vault"') && sources.includes("item.system.toggleVault"), "Native Vault transfer is missing");
assert(sources.includes("actor?.system.sheetLists") && sources.includes("transferDomainCard") && sources.includes("Action.getSourceConfig(item.system)"), "Daggerheart 2.2.6 compatibility paths are missing");
assert(sources.includes("item.system.recallCost") && sources.includes("Boolean(result)"), "Paid cards must auto-vault only after successful use");
assert(!sources.includes("installStressOverflowCostRule") && !sources.includes("CostField.hasCost ="), "HUD must not override Daggerheart Stress cost validation");
assert(sources.includes('if (cost?.enabled === false || cost.itemId) continue;'), "Stress must be validated like other actor resources");
assert(sources.includes("countLabel"), "Loadout current/maximum capacity is missing");
assert(sources.includes('draggable="true"') && sources.includes('data-drop-target="{{dropTarget}}"') && sources.includes("onDrop(event)"), "Loadout/Vault drag-and-drop is missing");
assert(sources.includes("itemCostPreview") && sources.includes('class="dqp-item-cost"') && sources.includes("dqp-hover-cost"), "Action and recall price previews are missing");
assert(sources.includes("patchActorUpdate") && sources.includes("patchItemUpdate"), "Incremental HUD update path is missing");
assert(read("styles/panel.css").includes("dqp-item-used") && read("styles/panel.css").includes("dqp-pip-mark"), "Action feedback animations are missing");
assert(sources.includes("HUD_THEMES") && sources.includes('data-action="set-theme"') && sources.includes("hudTheme"), "Personal HUD theme selector is missing");
assert(sources.includes("HUD_PLACEMENTS") && sources.includes('data-action="set-placement"') && sources.includes("hudPlacement"), "Personal centered/side HUD selector is missing");
assert(sources.includes("applyLanguage") && sources.includes("game.i18n.lang") && !sources.includes("hudLanguage"), "HUD language must follow Foundry's Language Preference without a separate override");
for (const theme of ["minimal", "arcane", "sacred", "monochrome"]) {
  assert(read("styles/panel.css").includes(`data-theme="${theme}"`), `Theme stylesheet is missing: ${theme}`);
}
for (const key of ["MissingItem", "CardInVault", "CardSuppressed", "InsufficientResource", "LoadoutFull", "TransferUnavailable", "ActionFailed"]) {
  assert(en.DQP.Warnings[key], `Clear error message is missing: ${key}`);
}
assert(sources.includes("dqp-players-toggle") && sources.includes("playersCollapsed"), "Collapsible connected-player panel is missing");
assert(read("styles/panel.css").includes("#ui-right #ui-right-column-1") && sources.includes("--dqp-chat-clearance"), "Native quick chat must clear the HUD vertically");
assert(read("styles/panel.css").includes("--dqp-hud-max: 1160px"), "Compact HUD width is missing");
assert(sources.includes('data-column-panel="character"') && sources.includes('data-column-panel="traits"') && sources.includes('data-column-panel="workspace"'), "Fixed independent layer anchors are missing");
assert(!sources.includes("panelStage"), "Sequential stage state must not be used");
assert(read("styles/panel.css").includes(".dqp-portrait-frame img") && read("styles/panel.css").includes("object-fit: contain") && read("styles/panel.css").includes("background: #050506"), "The portrait must preserve the full character artwork on a dark background");
assert(!sources.includes("dqp-detail-panel"), "Detached detail window must not be present");

console.log(`Verified ${manifest.title} ${manifest.version}: ${enKeys.length} English/Russian strings, native Daggerheart actions, no system patching.`);

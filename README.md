# Daggerheart Quick Panel

A Foundry VTT 14 HUD module for Daggerheart 2.2.6+. Version 1.1.0 targets Daggerheart 2.11.2 / Foundry 14.369 and preserves compatibility paths for Daggerheart 2.2.6 / Foundry 14.361 and 2.10.5. Daggerheart 2.2.6 registers five actor types (Character, Adversary, Companion, Environment and Party); newer versions also register NPC. Characters keep the three-band HUD; the other types use compact surfaces. The interface includes English and Russian localization and follows Foundry's Core Language Preference.

Install through **Add-on Modules → Install Module → Manifest URL** using:

```text
https://raw.githubusercontent.com/trashrollers/daggerheart-quick-panel/main/module.json
```

Existing installations using this manifest can update through Foundry's module installer. The release archive contains only the module's runtime files and README.

## Version compatibility

The HUD selects available methods instead of assuming that every system release has the same API. It prefers the installed character sheet's native trait-roll and downtime actions, preserving that version's resource updates and integrations. A missing native action uses the existing actor-roll or Downtime-dialog path. A native action that has already started is never retried automatically, avoiding duplicate rolls or resource spending.

Attack labels accept either an array/getter or a method, including collection results. Missing, malformed or throwing label helpers produce an empty subtitle while keeping the HUD and attack usable. Action lists accept arrays, Collections, Maps, Sets and object records; intentionally empty native action lists remain empty. Both `api.data` and older `api.models` action namespaces are supported. Loadout uses the native availability result and current homebrew limit when present, with the older settings/counting path as a fallback.

Regression tests cover the 2.2.6 and 2.10.5 roll-result formats and the native sheet workflow used in 2.11.2. The 2.2.6 and 2.11.2 published source APIs were inspected. This is not a guarantee for every historical release, third-party replacement sheet, or future breaking change. Foundry 13 / Daggerheart 1.x remain outside the declared support range. No actor migration or system-file patch is required.

- The magnifier beside the portrait opens smaller / reset / larger controls (75–125%, 5% steps). 100% preserves the original layout. This client-local preference is available to players and GMs, persists across reloads and does not change anyone else's HUD. Adjustments do not rerender the HUD or update actor documents.
- The same magnifier menu switches between Centered HUD and Side HUD. Centered is the default; Side anchors the portrait and ribbons to the lower-left safe margin. Placement is client-local, persists across reloads and changes without rebuilding the HUD.
- For a GM, controlling any supported token automatically shows its actor in the HUD. An adversary keeps its dedicated compact combat surface; companions, NPCs, environments and parties use a compact general-purpose surface with their available details, resources and actions. The actor picker also reaches all six types without requiring a token. Native Daggerheart actions and resource updates remain authoritative.
- Trait rolls use the installed sheet's native handler when available. The fallback commits Hope, Fear and other resource changes returned by Daggerheart's roll workflow, matching 2.2.6 (`value` and `total`) and newer (`value`) result formats. Item and attack actions continue to call their native `use` methods.
- The palette beside the portrait switches between Daggerheart, Minimal Duo, Dark Arcane, Sacred Light and Monochrome. Theme choice is client-local, persists across reloads and changes the palette, surfaces, corners and glow without rebuilding the HUD or altering actor data.
- A single gear button at the bottom of the utility stack smoothly expands the actor picker, palette and magnifier upward in the character HUD; the compact adversary HUD groups its palette and magnifier the same way. Their popups close when the gear is collapsed, and the expanded state survives ordinary HUD rerenders.
- The Experiences tab shows compact Active Effects and Inactive Effects first, followed by Experiences. Every group can be collapsed independently. Effect cards can be dragged between the two groups, like Loadout and Vault, or moved with their arrow. Hovering shows the description; clicking an effect or experience immediately sends its card to chat without a confirmation dialog.
- Hovering the third HUD ribbon and turning the mouse wheel scrolls its card list horizontally, including the Abilities tab. Wheel input stays inside the ribbon rather than zooming the canvas.
- The scale controls fade out 1 second after the pointer leaves the magnifier and its popup; returning the pointer cancels the timeout, including during the fade.
- Hit Points, Stress, Hope and Armor again show their names, current/maximum values and clickable segmented bars. Left-clicking a resource icon lowers its displayed value by one; right-clicking raises it. Stress keeps its brain icon. Armor displays remaining slots, and spending a slot when multiple sources are available opens a source chooser for armor, shield or another active armor effect. Hovering Armor shows Minor, Major and Severe damage thresholds (Лёгкий, Ощутимый, Тяжёлый in Russian). Updates use Daggerheart's native armor methods.
- The character ribbon defaults to 88% width and is 54 px tall. Existing clients using the previous 100% width are moved once to 88%; the resize handle still permits individual adjustment. The domain label remains beside the character name. Evasion and Proficiency retain captions below their icon/value pairs.
- Loadout shows current/maximum capacity using Daggerheart's configured world limit plus the character's loadout bonus. Domain cards can move between Loadout and Vault either by dragging the card or using its arrow control. Recalling delegates to Daggerheart's native toggleVault flow, including its configured recall cost and capacity checks. A full Loadout rejects the drop with a specific explanation.
- Action cards show a compact resource-cost badge. The hover description expands it into readable text and clearly marks an unavailable Stress cost when too few Stress slots remain. The HUD blocks that action instead of converting excess Stress into Hit Points. Vault cards show their recall price, including free recalls.
- After a Domain Card action completes successfully, a card with recallCost greater than zero is sent to Vault automatically. Free cards stay in Loadout, cancelled or failed actions do not move, and cards already moved by their own action are not moved twice.
- Successful actions pulse briefly, transferred cards slide into their destination, and only resource segments whose state changed animate. Reduced-motion preferences disable these effects.
- HP, Stress, Hope, Armor, item charges/quantity and Loadout/Vault changes patch their existing DOM nodes. Full HUD renders are reserved for structural changes, reducing visible flashes and stale-card micro-lag.
- Foundry's connected-player panel is positioned above the full HUD height. Its toggle lives inside Foundry's own performance toolbar so it remains clickable, completely hides or restores the panel, and remembers that choice for the current client.
- Foundry's native quick-chat stays above a centered HUD. With a side HUD, it moves to the lower-right whenever it fits beside the HUD; on narrow screens it rises above the HUD to avoid overlap. The original chat input and history remain intact. A compact History button opens Foundry's native chat sidebar; a per-client Dice button collapses or expands the Dice Calculator tray (collapsed by default).
- When Foundry uses Russian, the module loads its complete Russian HUD dictionary automatically. Daggerheart document names and native dialogs continue to use the active Daggerheart localization module.
- Collapsed Equipment, Loadout, Vault, action, feature and gear categories use distinct icon badges with their category name and count below.
- Equipment follows the sheet: unarmed attack when applicable, primary and secondary weapons, then other equipped usable items in native order. Passive armor is not listed as a weapon; armor slots remain in Core and armor remains manageable in Gear.
- Features uses the native sheet's feature-context preparation without opening the sheet: ancestry, community, class/subclass, multiclass, transformations, companion and remaining features retain the native titles, ordering and availability rules.
- Daggerheart 2.2.6 uses its native `sheetLists` categories for Features. Domain Card transfers use the 2.2.6 Effect action for paid recalls and direct native document updates for free moves; Daggerheart 2.9.x continues to use `item.system.toggleVault`.

## Layout

Centered mode places the entire HUD (portrait, controls and three bands) on the physical screen center along its bottom edge with an 18 px margin. Side mode places the same HUD at the lower-left safe margin and lets it expand toward the right. The floating native chat composer stays above the centered HUD or beside a side HUD when there is room, without narrowing the HUD. The expanded right sidebar still limits available width. Sidebar changes and window resizing update the fit without rebuilding the HUD. Descriptions stay inside the corresponding safe area.

At the default 100% scale, the bands measure up to 1240 × 208 px, plus the portrait and controls. The three rows measure 64, 38, and 98 px, separated by 4 px gaps. Bands narrow as space decreases; below 820 px they use compact trait labels with full tooltips. If the selected scale cannot fit, the displayed size temporarily adapts to the available width without changing the player's saved preference. The eye button follows the portrait. All themes and independent layer controls remain available.

- Core: name and domain on one line, class beneath, icon-only evasion and proficiency, then numeric HP/Stress/Hope/Armor controls with damage thresholds in the Armor hover card.
- Traits: six decorated, directly clickable compact buttons in a single row, with secondary rest icons.
- Toolkit: 27 px tabs, quiet group labels above 125 × 48 px item cards, and horizontal scrolling. Card names can wrap to two lines; full names and descriptions remain in hover previews. Play includes Equipment, Loadout and Vault. Loadout has a warm gold backdrop; Vault has a violet backdrop. Both card groups stay visible when empty.
- Portrait: opens the native sheet; the smaller level badge opens native advancement. The actor selector includes every supported actor the user owns (all six types for a GM), including those without tokens.
- Each row's right arrow fully hides that row. Three vertically arranged icon buttons immediately right of the portrait independently restore or hide the rows, even when all rows are hidden. The remaining stack stays bottom-aligned. Reveal animations take 240 ms, reverse smoothly on repeated toggles, and respect reduced-motion preferences. Hidden rows are inert.
- Weapon and armor cards have a shirt icon: gold means equipped; click to equip or unequip. This calls the native character sheet toggleEquipItem action, retaining armor replacement, weapon burden and beastform rules. Item usage stays on the main card; the ellipsis still opens details.
- Existing client-scoped settings under daggerheart-quick-panel preserve the selected actor and the three visibility states.
- Features (formerly Library) contains only character features. Vault remains in Play alongside Loadout.
- Effects and Experiences appear together in the third HUD row. Hover for a description; clicking either card sends it directly to chat. Active and inactive effects can be moved between their groups.
- Hover or focus an item to read its full description in a styled scrollable card. Move into the card to read/scroll it; Escape dismisses it. Descriptions are converted to inert plain text, preserving paragraphs. Tabs, actor switches and rerenders remove stale previews.
- The macro hotbar stays hidden while the HUD is active.
- The GM HUD toggle supports Foundry 14 build 361's keyed Scene Controls and is registered before the controls are prepared, while retaining the earlier array-shaped compatibility path.

## Preserved integrations

The existing delegated click/contextmenu listeners, data-action selectors, ownership filter, resource paths, render scheduling and action locks remain in use. Item hover cards replace the former truncated native item tooltip; other button tooltips remain native.

- The native sheet rollAttribute handler receives the selected trait and original event. If unavailable, Actor#rollTrait and its native resource-update map provide the compatibility path.
- Item#use receives the original event.
- Downtime, CharacterLevelup, and actor/item sheets remain native Daggerheart applications.
- Resource controls retain permission checks and update the existing actor paths; Armor uses the system's source-aware methods.
- updateActor and item lifecycle hooks keep the display synchronized.

Experiences editing uses game.system.api.applications.sheetConfigs.CharacterSettings; no parallel experience storage or custom experience bonus rules are introduced.

## Current limitations

Drag-and-drop is intentionally limited to Domain Cards moving between Loadout and Vault; other inventory organization remains on the native character sheet. Right-click and the ellipsis open that native item sheet. Native action availability and dialogs depend on the installed Daggerheart API. Domain names are derived from existing domain cards, as in previous versions.

## Verification

Run node tests/verify.mjs for manifest, localization and integration checks. Run node tests/layout.mjs for an isolated Chromium test using the actual module templates, controller, Foundry stylesheet and stub actor API. FOUNDRY_APP, PLAYWRIGHT_PATH and CHROME_PATH can override local test dependencies.

Run `node --test tests/compatibility.test.mjs` for collection, label, sheet-action and API-namespace regression checks. The layout suite also checks that malformed unarmed labels leave a usable HUD, native trait automation commits once, native downtime receives the selected rest, and current Loadout settings/overrides are respected. These isolated checks do not replace playtesting in a live world on every system release.

The layout test renders and captures all five themes, then exercises all eight layer-visibility combinations at 1920, 1440 and 1366 px; checks horizontal and vertical overflow; verifies trait clicks, tabs, item/context actions, rests, HP/armor paths, cost previews, resource-only DOM patching, Loadout/Vault drag-and-drop and limits, revoked ownership, actor selection, hover previews, native equip-action handoffs, animation reversals, reduced motion and retained state after rerender. Screenshots are written to tests/output. It does not roll dice or alter actors in a live world.

Layout checks also cover both persistent placement modes and a right-side native quick-chat fixture at 1920, 1366 and 1024 px, each at 75%, 100% and 125%. They verify the wider centered layout, left-side anchoring, vertical chat clearance, typing in chat, retention of the requested scale, and sidebar resizing without a HUD rebuild. Static verification requires exact English/Russian key and placeholder parity.

## Installation

Use the manifest URL above, or extract `daggerheart-quick-panel-1.1.0.zip` into `Data/modules/daggerheart-quick-panel`. Enable Daggerheart Quick Panel in a Daggerheart world and reload the client. No actor data migration is required.

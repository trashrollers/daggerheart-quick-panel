import { DaggerheartQuickPanelBase } from "./panel-base.js";
import { MODULE_ID, TEMPLATE, ITEM_PARTIAL, SUPPORTED_ACTOR_TYPES, TRAITS, ITEM_TYPE_ORDER, HUD_THEMES, HUD_PLACEMENTS, localize, clamp, asArray, escapeHTML, changePaths, plainText } from "./helpers.js";
import { itemActions, sheetAction, systemActionType } from "./helpers.js";

class DaggerheartQuickPanel extends DaggerheartQuickPanelBase {
  applyPlacement() {
    if (!this.root) return;
    const selected = game.settings.get(MODULE_ID, "hudPlacement") === "side" ? "side" : "center";
    this.root.dataset.placement = selected;
    for (const button of this.root.querySelectorAll('[data-action="set-placement"]')) {
      const active = button.dataset.placement === selected;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    this.positionHud();
  }

  async loadLanguage(language) {
    if (this.languageCache.has(language)) return this.languageCache.get(language);
    const response = await fetch(`modules/${MODULE_ID}/lang/${language}.json`);
    if (!response.ok) throw new Error(`Unable to load ${language}.json (${response.status})`);
    const dictionary = (await response.json())?.DQP;
    if (!dictionary) throw new Error(`Language ${language}.json has no DQP namespace`);
    this.languageCache.set(language, dictionary);
    return dictionary;
  }

  async applyLanguage(render = true) {
    const language = String(game.i18n.lang || "").toLowerCase().startsWith("ru") ? "ru" : "en";

    try {
      const dictionary = await this.loadLanguage(language);
      game.i18n.translations ||= {};
      game.i18n.translations.DQP = foundry.utils.deepClone?.(dictionary) ?? structuredClone(dictionary);
      this.activeLanguage = language;
      if (render && this.root) this.scheduleRender(0);
      return true;
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to apply HUD language`, error);
      return false;
    }
  }

  async chooseActorForHud(actors) {
    if (actors.length < 2) return actors[0] || null;
    const selectedId = this.actor?.id;
    const options = actors.map((actor) =>
      `<option value="${escapeHTML(actor.id)}"${actor.id === selectedId ? " selected" : ""}>${escapeHTML(actor.name)}</option>`
    ).join("");
    const actorId = await foundry.applications.api.DialogV2.prompt({
      window: { title: localize("DQP.Hud.ChooseTitle") },
      classes: ["dqp-actor-choice-dialog"],
      position: { width: 360 },
      content: `<div class="dqp-actor-choice"><label for="dqp-hud-actor">${escapeHTML(localize("DQP.Hud.ChooseHint"))}</label><select id="dqp-hud-actor" name="actorId">${options}</select></div>`,
      ok: {
        type: "submit",
        label: localize("DQP.Hud.Enable"),
        icon: "fa-solid fa-eye",
        callback: (_event, button) => button.form.elements.actorId?.value || null,
      },
      rejectClose: false,
    });
    return actors.find((actor) => actor.id === actorId) || null;
  }

  async toggleHud(target) {
    return this.withLock("hud-toggle", target, async () => {
      if (this.open) {
        this.rememberHudEye(target);
        await this.animateHud(false);
        this.utilityDockOpen = false;
        await game.settings.set(MODULE_ID, "hudEnabled", false);
        return this.render();
      }

      return this.enableHud();
    });
  }

  async enableHud() {
    if (this.open) return this.render();
    const actors = this.actors;
    const actor = await this.chooseActorForHud(actors);
    if (actors.length > 1 && !actor) return;
    if (actor) await game.settings.set(MODULE_ID, "selectedActorId", actor.id);
    await game.settings.set(MODULE_ID, "hudEnabled", true);
    await this.render();
    return this.animateHud(true);
  }

  rememberHudEye(target) {
    const eye = target?.closest?.(".dqp-dock-hud-toggle") || this.root?.querySelector(".dqp-dock-hud-toggle");
    const rect = eye?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return;
    this.root.style.setProperty("--dqp-eye-left", `${rect.left}px`);
    this.root.style.setProperty("--dqp-eye-bottom", `${window.innerHeight - rect.bottom}px`);
    this.root.style.setProperty("--dqp-eye-width", `${rect.width}px`);
    this.root.style.setProperty("--dqp-eye-height", `${rect.height}px`);
  }

  async animateHud(show) {
    const shell = this.root?.querySelector(".dqp-shell");
    if (!shell || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const keyframes = show
      ? [{ opacity: 0, translate: "0 10px" }, { opacity: 1, translate: "0 0" }]
      : [{ opacity: 1, translate: "0 0" }, { opacity: 0, translate: "0 10px" }];
    const animation = shell.animate(keyframes, {
      duration: show ? 220 : 180,
      easing: show ? "cubic-bezier(.2,.75,.25,1)" : "ease-in",
      fill: "forwards",
    });
    await animation.finished.catch(() => {});
  }

  cancelScaleHide() {
    window.clearTimeout(this.scaleHideTimer);
    this.scaleHideTimer = null;
    this.root?.querySelector(".dqp-scale-controls")?.classList.remove("is-hiding");
  }

  scheduleScaleHide(delay = 1000) {
    this.cancelScaleHide();
    this.scaleHideTimer = window.setTimeout(() => this.hideScaleControls(true), delay);
  }

  hideScaleControls(animate = false) {
    this.cancelScaleHide();
    const controls = this.root?.querySelector(".dqp-scale-controls");
    this.root?.querySelector('[data-action="toggle-scale"]')?.setAttribute("aria-expanded", "false");
    if (!controls) return;
    if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      controls.hidden = true;
      return;
    }
    controls.classList.add("is-hiding");
    this.scaleHideTimer = window.setTimeout(() => {
      controls.hidden = true;
      controls.classList.remove("is-hiding");
      this.scaleHideTimer = null;
    }, 180);
  }

  cancelThemeHide() {
    window.clearTimeout(this.themeHideTimer);
    this.themeHideTimer = null;
    this.root?.querySelector(".dqp-theme-controls")?.classList.remove("is-hiding");
  }

  scheduleThemeHide(delay = 1000) {
    this.cancelThemeHide();
    this.themeHideTimer = window.setTimeout(() => this.hideThemeControls(true), delay);
  }

  hideThemeControls(animate = false) {
    this.cancelThemeHide();
    const controls = this.root?.querySelector(".dqp-theme-controls");
    this.root?.querySelector('[data-action="toggle-theme"]')?.setAttribute("aria-expanded", "false");
    if (!controls) return;
    if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      controls.hidden = true;
      return;
    }
    controls.classList.add("is-hiding");
    this.themeHideTimer = window.setTimeout(() => {
      controls.hidden = true;
      controls.classList.remove("is-hiding");
      this.themeHideTimer = null;
    }, 180);
  }

  hideActorControls() {
    const controls = this.root?.querySelector(".dqp-actor-switcher-controls");
    this.root?.querySelector('[data-action="toggle-actor-switcher"]')?.setAttribute("aria-expanded", "false");
    if (controls) controls.hidden = true;
  }

  async toggleEquip(actor, target, event) {
    if (!actor.isOwner) return ui.notifications.warn(localize("DQP.Warnings.NoPermission"));
    const item = actor.items.get(target.dataset.itemId);
    if (!item || !["weapon", "armor"].includes(item.type)) return;
    const native = sheetAction(actor, "toggleEquipItem");
    if (!native) return ui.notifications.warn(localize("DQP.Gear.EquipUnavailable"));
    return this.withLock(`equip:${actor.id}`, target, async () => {
      await native.handler.call(native.sheet, event, target);
      this.scheduleRender();
    });
  }

  async onChange(event) {
    if (!event.target.matches('[data-action="select-actor"]')) return;
    const actor = this.actors.find((candidate) => candidate.id === event.target.value);
    if (!actor) return this.render();
    this.hidePreview();
    this.manualActorOverride = true;
    await game.settings.set(MODULE_ID, "selectedActorId", actor.id);
    this.collapsedGroups = new Set();
    return this.render();
  }

  async showExperience(actor, target) {
    if (!actor.isOwner) return ui.notifications.warn(localize("DQP.Warnings.NoPermission"));
    const id = target.dataset.previewExperience;
    const experience = actor.system.experiences?.[id];
    if (!experience) return;
    return this.withLock(`experience-share:${actor.id}:${id}`, target, async () => {
      const name = experience.name || localize("DQP.Experiences.Unnamed");
      const value = Number(experience.value) || 0;
      const card = document.createElement("article");
      card.className = "dqp-experience-detail";
      const heading = document.createElement("h3");
      heading.textContent = `${name} ${value >= 0 ? "+" : ""}${value}`;
      const description = document.createElement("div");
      description.className = "dqp-experience-description";
      description.textContent = plainText(experience.description, Infinity) || localize("DQP.Actions.NoDescription");
      card.append(heading, description);
      if (!this.actors.some((candidate) => candidate.id === actor.id)) return ui.notifications.warn(localize("DQP.Warnings.NoPermission"));
      const Chat = CONFIG.ChatMessage.documentClass;
      await Chat.create({ speaker: Chat.getSpeaker({ actor }), content: card.outerHTML });
    });
  }

  async shareEffect(actor, target) {
    if (!actor.isOwner) return ui.notifications.warn(localize("DQP.Warnings.NoPermission"));
    const key = target.dataset.effectKey;
    const effect = this.effectByKey(actor, key);
    if (!effect) return;
    return this.withLock(`effect-share:${actor.id}:${key}`, target, async () => {
      const active = typeof effect.active === "boolean" ? effect.active : !effect.disabled && !effect.isSuppressed;
      const rawDescription = effect.description || effect.parent?.system?.description || "";
      const localizedDescription = typeof rawDescription === "string" ? localize(rawDescription) : rawDescription;
      const card = document.createElement("article");
      card.className = "dqp-experience-detail dqp-effect-detail";
      const header = document.createElement("header");
      header.className = "dqp-effect-detail-heading";
      const image = document.createElement("img");
      image.src = effect.img || "icons/svg/aura.svg";
      image.alt = "";
      const labels = document.createElement("div");
      const heading = document.createElement("h3");
      heading.textContent = effect.name || localize("DQP.Effects.Unnamed");
      const status = document.createElement("small");
      status.textContent = localize(active ? "DQP.Effects.Active" : "DQP.Effects.Inactive");
      labels.append(heading, status);
      header.append(image, labels);
      const description = document.createElement("div");
      description.className = "dqp-experience-description";
      description.textContent = plainText(localizedDescription, Infinity) || localize("DQP.Actions.NoDescription");
      card.append(header, description);
      if (!this.actors.some((candidate) => candidate.id === actor.id)) return ui.notifications.warn(localize("DQP.Warnings.NoPermission"));
      const Chat = CONFIG.ChatMessage.documentClass;
      await Chat.create({ speaker: Chat.getSpeaker({ actor }), content: card.outerHTML });
    });
  }

  onHover(event) {
    if (event.target.closest?.(".dqp-scale-wrap")) this.cancelScaleHide();
    if (event.target.closest?.(".dqp-theme-wrap")) this.cancelThemeHide();
    if (event.target.closest?.(".dqp-hover-card")) { window.clearTimeout(this.previewTimer); return; }
    const anchor = event.target.closest?.("[data-preview-item], [data-preview-experience], [data-preview-effect], [data-preview-thresholds]");
    if (!anchor || !this.root.contains(anchor)) return;
    window.clearTimeout(this.previewTimer);
    if (this.previewAnchor === anchor) return;
    this.hidePreview();
    this.previewTimer = window.setTimeout(() => this.showPreview(anchor), 220);
  }

  onHoverLeave(event) {
    const scaleWrap = event.target.closest?.(".dqp-scale-wrap");
    if (scaleWrap && !scaleWrap.contains(event.relatedTarget)) this.scheduleScaleHide();
    const themeWrap = event.target.closest?.(".dqp-theme-wrap");
    if (themeWrap && !themeWrap.contains(event.relatedTarget)) this.scheduleThemeHide();
    const anchor = event.target.closest?.("[data-preview-item], [data-preview-experience], [data-preview-effect], [data-preview-thresholds], .dqp-hover-card");
    if (!anchor || anchor.contains(event.relatedTarget)) return;
    if (this.preview?.contains(event.relatedTarget) || this.previewAnchor?.contains(event.relatedTarget)) return;
    window.clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => this.hidePreview(), 150);
  }

  hidePreview() {
    window.clearTimeout(this.previewTimer);
    this.previewAnchor?.removeAttribute("aria-describedby");
    this.preview?.remove();
    this.preview = null;
    this.previewAnchor = null;
  }

  showPreview(anchor) {
    const actor = this.activeActor;
    if (!anchor.isConnected || !actor) return;
    if (anchor.hasAttribute("data-preview-thresholds")) return this.showThresholdPreview(anchor, actor);
    const item = actor.items.get(anchor.dataset.previewItem);
    const experience = actor.system.experiences?.[anchor.dataset.previewExperience];
    const effect = this.effectByKey(actor, anchor.dataset.previewEffect);
    if (!item && !experience && !effect) return;
    this.hidePreview();
    const view = item ? this.itemData(item, actor) : null;
    const card = document.createElement("aside");
    card.id = "dqp-hover-card";
    card.className = "dqp-hover-card";
    card.setAttribute("role", "tooltip");
    card.tabIndex = 0;
    const title = document.createElement("strong");
    title.textContent = item?.name || experience?.name || effect?.name || localize("DQP.Experiences.Unnamed");
    const meta = document.createElement("small");
    const effectActive = typeof effect?.active === "boolean" ? effect.active : !effect?.disabled && !effect?.isSuppressed;
    meta.textContent = view?.meta
      || (experience ? `${localize("DQP.Experiences.Title")} · ${Number(experience.value) >= 0 ? "+" : ""}${experience.value ?? 0}`
        : localize(effectActive ? "DQP.Effects.Active" : "DQP.Effects.Inactive"));
    const description = document.createElement("div");
    const itemDescription = item?.system.description || asArray(item?.system.actionsList).map((action) => action.description).filter(Boolean).join("\n\n");
    const rawEffectDescription = effect?.description || effect?.parent?.system?.description || "";
    const effectDescription = typeof rawEffectDescription === "string" ? localize(rawEffectDescription) : rawEffectDescription;
    description.textContent = plainText(item ? itemDescription : experience ? experience.description : effectDescription, Infinity)
      || localize("DQP.Actions.NoDescription");
    card.append(title, meta);
    if (view?.costPreview) {
      const cost = document.createElement("div");
      cost.className = "dqp-hover-cost";
      cost.textContent = view.costPreview;
      card.append(cost);
    }
    card.append(description);
    this.presentPreview(card, anchor);
  }

  showThresholdPreview(anchor, actor) {
    this.hidePreview();
    const card = document.createElement("aside");
    card.id = "dqp-hover-card";
    card.className = "dqp-hover-card dqp-threshold-preview";
    card.setAttribute("role", "tooltip");
    card.tabIndex = 0;
    const title = document.createElement("strong");
    title.textContent = localize("DQP.Stats.Thresholds");
    const rows = document.createElement("div");
    rows.className = "dqp-threshold-preview-rows";
    for (const threshold of this.thresholdData(actor)) {
      const row = document.createElement("div");
      const label = document.createElement("span");
      const value = document.createElement("strong");
      label.textContent = threshold.label;
      value.textContent = threshold.value;
      row.append(label, value);
      rows.append(row);
    }
    card.append(title, rows);
    this.presentPreview(card, anchor);
  }

  presentPreview(card, anchor) {
    const safeLeft = this.hudBounds?.left ?? 8;
    const safeRight = this.hudBounds?.right ?? window.innerWidth - 8;
    card.style.maxWidth = `${Math.max(1, safeRight - safeLeft)}px`;
    this.root.append(card);
    this.preview = card;
    this.previewAnchor = anchor;
    anchor.setAttribute("aria-describedby", card.id);
    const bounds = anchor.getBoundingClientRect();
    const size = card.getBoundingClientRect();
    card.style.left = `${Math.max(safeLeft, Math.min(bounds.left, safeRight - size.width))}px`;
    const hudTop = this.root.querySelector(".dqp-shell")?.getBoundingClientRect().top ?? bounds.top;
    card.style.top = `${Math.max(8, Math.min(bounds.top, hudTop) - size.height - 8)}px`;
  }

  onContextMenu(event) {
    const resource = event.target.closest('[data-action="adjust-resource"]');
    if (resource && this.root?.contains(resource)) {
      event.preventDefault();
      this.hidePreview();
      if (this.activeActor) void this.adjustResource(this.activeActor, resource, 1);
      return;
    }
    const row = event.target.closest(".dqp-item-row");
    if (!row) return;
    event.preventDefault();
    this.activeActor?.items.get(row.dataset.itemId)?.sheet.render({ force: true });
  }

  loadoutHasRoom(actor, item) {
    if (!item?.system.inVault || item.system.loadoutIgnore) return true;
    const available = actor.system.loadoutSlot?.available;
    if (typeof available === "boolean") return available;
    const used = actor.items.filter((candidate) => candidate.type === "domainCard" && !candidate.system.inVault).length;
    return used < this.loadoutLimit(actor);
  }

  async setEffectActive(actor, key, active, target) {
    if (!actor?.isOwner) return ui.notifications.warn(localize("DQP.Warnings.NoPermission"));
    const effect = this.effectByKey(actor, key);
    if (!effect || effect.type === "beastform") return;
    const wasActive = typeof effect.active === "boolean" ? effect.active : !effect.disabled && !effect.isSuppressed;
    if (wasActive === active) return;
    return this.withLock(`effect:${key}`, target, async () => {
      // Mirror the Daggerheart sheet's toggleEffect document update.
      await effect.update({ disabled: !active });
      const nowActive = typeof effect.active === "boolean" ? effect.active : !effect.disabled && !effect.isSuppressed;
      if (active && !nowActive) ui.notifications.warn(localize("DQP.Effects.StillInactive"));
      if (nowActive === active) this.pendingEffectArrival = key;
      this.scheduleRender(0);
    });
  }

  clearDropHighlights() {
    this.root?.querySelectorAll(".is-drop-target, .is-drop-invalid").forEach((element) =>
      element.classList.remove("is-drop-target", "is-drop-invalid"));
  }

  onDragStart(event) {
    const effectCard = event.target.closest?.(".dqp-effect-card[draggable='true']");
    if (effectCard) {
      const actor = this.activeActor;
      const effect = this.effectByKey(actor, effectCard.dataset.effectKey);
      if (!actor?.isOwner || !effect || effect.type === "beastform") return event.preventDefault();
      this.dragState = {
        kind: "effect", actorId: actor.id, effectKey: effectCard.dataset.effectKey,
        fromActive: effectCard.dataset.effectActive === "true"
      };
      event.dataTransfer?.setData("text/plain", JSON.stringify({ module: MODULE_ID, ...this.dragState }));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      requestAnimationFrame(() => effectCard.classList.add("is-dragging"));
      return;
    }
    const row = event.target.closest?.(".dqp-item-row[draggable='true']");
    const actor = this.activeActor;
    const item = actor?.items.get(row?.dataset.itemId);
    if (!row || !actor?.isOwner || item?.type !== "domainCard") {
      event.preventDefault();
      return;
    }
    this.dragState = { kind: "domain", actorId: actor.id, itemId: item.id, fromVault: Boolean(item.system.inVault) };
    event.dataTransfer?.setData("text/plain", JSON.stringify({ module: MODULE_ID, ...this.dragState }));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    requestAnimationFrame(() => row.classList.add("is-dragging"));
  }

  onDragEnd() {
    this.root?.querySelectorAll(".is-dragging").forEach((row) => row.classList.remove("is-dragging"));
    this.clearDropHighlights();
    this.dragState = null;
  }

  onDragOver(event) {
    const state = this.dragState;
    const group = event.target.closest?.(state?.kind === "effect" ? "[data-effect-drop]" : "[data-drop-target]");
    if (!group || !state || state.actorId !== this.activeActor?.id) return;
    if (state.kind === "effect") {
      const toActive = group.dataset.effectDrop === "active";
      if (toActive === state.fromActive) return;
      event.preventDefault();
      this.clearDropHighlights();
      group.classList.add("is-drop-target");
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      return;
    }
    const toVault = group.dataset.dropTarget === "vault";
    if (toVault === state.fromVault) return;
    event.preventDefault();
    const item = this.activeActor.items.get(state.itemId);
    const valid = toVault || this.loadoutHasRoom(this.activeActor, item);
    this.clearDropHighlights();
    group.classList.add(valid ? "is-drop-target" : "is-drop-invalid");
    if (event.dataTransfer) event.dataTransfer.dropEffect = valid ? "move" : "none";
  }

  onDragLeave(event) {
    const group = event.target.closest?.("[data-drop-target], [data-effect-drop]");
    if (group && !group.contains(event.relatedTarget)) group.classList.remove("is-drop-target", "is-drop-invalid");
  }

  async onDrop(event) {
    const state = this.dragState;
    const group = event.target.closest?.(state?.kind === "effect" ? "[data-effect-drop]" : "[data-drop-target]");
    if (!group || !state || state.actorId !== this.activeActor?.id) return;
    event.preventDefault();
    if (state.kind === "effect") {
      const toActive = group.dataset.effectDrop === "active";
      this.clearDropHighlights();
      if (toActive !== state.fromActive) {
        await this.setEffectActive(this.activeActor, state.effectKey, toActive, group);
      }
      this.dragState = null;
      return;
    }
    const actor = this.activeActor;
    const item = actor.items.get(state.itemId);
    const toVault = group.dataset.dropTarget === "vault";
    this.clearDropHighlights();
    if (!item || toVault === Boolean(item.system.inVault)) return;
    if (!toVault && !this.loadoutHasRoom(actor, item)) {
      return ui.notifications.warn(localize("DQP.Warnings.LoadoutFull", { max: this.loadoutLimit(actor) }));
    }
    await this.toggleVault(actor, item.id, event, group, toVault);
    this.dragState = null;
  }

  animateElement(element, className, duration = 520) {
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    window.setTimeout(() => element.classList.remove(className), duration);
  }

  patchResource(actor, key) {
    const path = key === "armor" ? "system.armorScore.value" : `system.resources.${key}.value`;
    const labelKey = key === "hitPoints" ? "HitPoints" : key[0].toUpperCase() + key.slice(1);
    const icon = { hitPoints: "fa-solid fa-heart-crack", stress: "fa-solid fa-brain", hope: "fa-solid fa-diamond", armor: "fa-solid fa-shield-halved" }[key];
    const override = key === "armor" ? actor.system.armorScore : undefined;
    const view = this.resourceData(actor, key, path, `DQP.Resources.${labelKey}`, icon, override);
    const container = this.root?.querySelector(`.dqp-vitals > .dqp-resource--${key}`);
    if (!container) return false;
    const track = container.querySelector('.dqp-pips');
    if (!track) return false;
    if (track.children.length !== view.pips.length) {
      track.replaceChildren(...view.pips.map((pipView) => {
        const pip = document.createElement('button');
        pip.type = 'button';
        pip.className = 'dqp-pip';
        pip.dataset.action = 'set-resource';
        pip.dataset.path = path;
        pip.dataset.value = String(pipView.value);
        pip.setAttribute('aria-label', pipView.label);
        if (!view.isArmor) pip.dataset.tooltip = pipView.label;
        return pip;
      }));
    }
    const pips = [...track.children];
    const output = container.querySelector(".dqp-resource-value");
    const previous = Number(output?.firstChild?.textContent);
    if (output) output.innerHTML = `${view.value}<span>/${view.max}</span>`;
    for (const [index, pip] of pips.entries()) {
      pip.classList.toggle('is-active', view.pips[index].active);
      pip.setAttribute('aria-pressed', String(view.pips[index].active));
    }
    const hint = localize("DQP.Resources.ClickHint");
    const control = container.querySelector(".dqp-resource-control");
    control?.setAttribute("aria-label", `${view.label}: ${view.value}/${view.max}. ${hint}`);
    if (control && !view.isArmor) control.dataset.tooltip = `${view.label}: ${view.value}/${view.max} · ${hint}`;
    if (Number.isFinite(previous) && previous !== view.value) {
      this.animateElement(container, view.value > previous ? "is-marked" : "is-cleared");
    }
    return true;
  }

  refreshCostPreviews(actor = this.activeActor) {
    if (!actor) return;
    for (const row of this.root?.querySelectorAll(".dqp-item-row") || []) {
      const item = actor.items.get(row.dataset.itemId);
      if (item) this.applyItemView(row, this.itemData(item, actor));
    }
  }

  patchActorUpdate(actor, changes) {
    if (!this.open || actor.id !== this.activeActor?.id) return false;
    const paths = changePaths(changes);
    if (!paths.length) return false;
    const resourcePaths = {
      "system.resources.hitPoints.value": "hitPoints",
      "system.resources.stress.value": "stress",
      "system.resources.hope.value": "hope",
      "system.armorScore.value": "armor",
    };
    if (!paths.every((path) => resourcePaths[path])) return false;
    const keys = [...new Set(paths.map((path) => resourcePaths[path]))];
    const patched = keys.every((key) => this.patchResource(actor, key));
    if (patched) this.refreshCostPreviews(actor);
    return patched;
  }

  applyItemView(row, view) {
    row.dataset.vaultState = view.inVault ? "vault" : "loadout";
    row.classList.toggle("is-equipped", view.equipped);
    const primary = row.querySelector(".dqp-item-use");
    if (primary) {
      primary.dataset.action = view.primaryAction;
      primary.setAttribute("aria-label", view.primaryLabel);
      primary.querySelector(".dqp-item-copy strong").textContent = view.name;
      primary.querySelector(".dqp-item-copy > span").textContent = view.meta;
      const image = primary.querySelector("img");
      if (image) image.src = view.img;
      let resource = primary.querySelector(".dqp-item-resource");
      if (view.resource && !resource) {
        resource = document.createElement("span");
        resource.className = "dqp-item-resource";
        primary.append(resource);
      }
      if (resource) {
        resource.textContent = view.resource;
        resource.hidden = !view.resource;
      }
      let cost = primary.querySelector(".dqp-item-cost");
      if (view.costShort && !cost) {
        cost = document.createElement("span");
        cost.className = "dqp-item-cost";
        primary.append(cost);
      }
      if (cost) {
        cost.textContent = view.costShort;
        cost.dataset.tooltip = view.costPreview;
        cost.hidden = !view.costShort;
      }
      const playIcon = primary.querySelector(".dqp-item-play");
      if (playIcon) playIcon.className = `${view.primaryIcon} dqp-item-play`;
    }
    const vault = row.querySelector(".dqp-item-vault");
    if (vault) {
      vault.setAttribute("aria-label", view.vaultLabel);
      vault.dataset.tooltip = view.vaultTooltip;
      const icon = vault.querySelector("i");
      if (icon) icon.className = view.vaultIcon;
    }
    const equip = row.querySelector(".dqp-item-equip");
    if (equip) {
      equip.classList.toggle("is-active", view.equipped);
      equip.setAttribute("aria-pressed", String(view.equipped));
      equip.setAttribute("aria-label", view.equipLabel);
      equip.dataset.tooltip = view.equipLabel;
    }
  }

  updateLoadoutCounts(actor) {
    const loadout = this.root?.querySelector('[data-group-key="play-loadout"]');
    const vault = this.root?.querySelector('[data-group-key="play-vault"]');
    for (const group of [loadout, vault]) {
      if (!group) continue;
      const items = group.querySelector(".dqp-inline-items");
      const count = items?.querySelectorAll(".dqp-item-row").length || 0;
      let empty = items?.querySelector(".dqp-group-empty");
      if (!count && !empty) {
        empty = document.createElement("span");
        empty.className = "dqp-group-empty";
        empty.textContent = localize("DQP.Cards.Empty");
        items?.append(empty);
      } else if (count) empty?.remove();
      const output = group.querySelector(".dqp-inline-group-heading small");
      if (output) output.textContent = group === loadout ? `${count}/${this.loadoutLimit(actor)}` : String(count);
    }
  }

  patchItemUpdate(item, changes = {}) {
    const actor = this.activeActor;
    if (!this.open || (item.parent && item.parent.id !== actor?.id)) return false;
    const paths = changePaths(changes);
    const vaultChanged = paths.includes("system.inVault");
    if (vaultChanged && this.activeTab === "actions") return false;
    const patchable = ["name", "img", "system.inVault", "system.resource.value", "system.resource.max", "system.quantity"];
    if (paths.length && !paths.every((path) => patchable.includes(path))) return false;
    const rows = [...(this.root?.querySelectorAll(`.dqp-item-row[data-item-id="${CSS.escape(item.id)}"]`) || [])];
    const view = this.itemData(item, actor);
    if (vaultChanged && this.activeTab === "core" && rows.length) {
      const targetKey = view.inVault ? "play-vault" : "play-loadout";
      const destination = this.root.querySelector(`[data-group-key="${targetKey}"] .dqp-inline-items`);
      if (!destination) return false;
      const row = rows[0];
      const moved = row.parentElement !== destination;
      this.applyItemView(row, view);
      destination.querySelector(".dqp-group-empty")?.remove();
      destination.append(row);
      if (moved) this.animateElement(row, "is-arriving", 420);
      this.updateLoadoutCounts(actor);
      const emptyGroup = [...this.root.querySelectorAll('[data-group-key="play-loadout"], [data-group-key="play-vault"]')]
        .some((group) => !group.querySelector(".dqp-item-row"));
      if (emptyGroup) this.scheduleRender(80);
      return true;
    }
    rows.forEach((row) => this.applyItemView(row, view));
    return true;
  }

  async toggleColumn(column) {
    if (!["character", "traits", "workspace"].includes(column)) return;
    const key = `${column}Open`;
    const nextOpen = !game.settings.get(MODULE_ID, key);
    this.hidePreview();
    const panel = this.root?.querySelector(`[data-column-panel="${column}"]`);
    // Sample before cancelling so rapid reversals continue from their current position.
    const previous = panel ? getComputedStyle(panel) : null;
    const start = previous ? { height: previous.height, opacity: previous.opacity, clipPath: previous.clipPath, marginBottom: previous.marginBottom } : null;
    this.columnAnimations.get(column)?.cancel();
    panel?.classList.toggle("is-collapsed", !nextOpen);
    if (panel) panel.inert = !nextOpen;
    if (panel && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const expandedHeight = getComputedStyle(this.root).getPropertyValue({character:"--dqp-core-height", traits:"--dqp-traits-height", workspace:"--dqp-toolkit-height"}[column]).trim();
      const gap = getComputedStyle(this.root).getPropertyValue("--dqp-gap").trim();
      const end = {height: nextOpen ? expandedHeight : "0px", opacity: nextOpen ? "1" : "0", clipPath: nextOpen ? "inset(0 0 0 0)" : "inset(0 100% 0 0)", marginBottom: nextOpen ? "0px" : `-${gap}`, visibility: "visible"};
      const animation = panel.animate([{...start, visibility: "visible"}, end], { duration: 240, easing: "cubic-bezier(.22,.7,.25,1)" });
      this.columnAnimations.set(column, animation);
      animation.finished.then(() => { if (this.columnAnimations.get(column) === animation) this.columnAnimations.delete(column); }).catch(() => {});
    }
    this.root?.querySelectorAll(`[data-action="toggle-column"][data-column="${column}"]`).forEach((control) => {
      control.setAttribute("aria-expanded", String(nextOpen));
      control.classList.toggle("is-active", nextOpen);
    });

    await game.settings.set(MODULE_ID, key, nextOpen);
  }

  armorSources(actor) {
    let effects = [];
    try {
      if (typeof actor.allApplicableEffects === "function") effects = asArray(actor.allApplicableEffects());
    } catch (error) {
      console.warn(`${MODULE_ID} | Armor sources are unavailable`, error);
    }
    effects = effects.filter((effect) => effect.system?.armorData && !effect.disabled && !effect.isSuppressed);
    const sources = [...effects, actor.system.armor].filter(Boolean);
    return sources.map((document) => {
      const data = document.type === "armor" ? document.system?.armor : document.system?.armorData;
      let origin;
      try { origin = document.origin ? foundry.utils.fromUuidSync(document.origin) : null; }
      catch (_error) { origin = null; }
      return {
        document,
        uuid: document.uuid,
        name: origin?.name || (document.parent?.type === "armor" ? document.parent.name : document.name),
        available: Math.max(0, Number(data?.max || 0) - Number(data?.current || 0)),
        max: Number(data?.max || 0),
      };
    }).filter((source) => source.uuid && source.available > 0);
  }

  async chooseArmorSource(sources) {
    const choices = sources.map((source, index) =>
      `<label class="dqp-armor-source-option"><input type="radio" name="armorSource" value="${escapeHTML(source.uuid)}"${index === 0 ? " checked" : ""}><span>${escapeHTML(source.name || localize("DQP.Resources.Armor"))}</span><strong>${source.available}/${source.max}</strong></label>`
    ).join("");
    const uuid = await foundry.applications.api.DialogV2.prompt({
      window: { title: localize("DQP.Resources.ChooseArmorSource") },
      classes: ["dqp-armor-choice-dialog"],
      position: { width: 330 },
      content: `<p>${escapeHTML(localize("DQP.Resources.ChooseArmorHint"))}</p><div class="dqp-armor-source-list">${choices}</div>`,
      ok: {
        type: "submit",
        label: localize("DQP.Resources.SpendArmor"),
        icon: "fa-solid fa-shield-halved",
        callback: (_event, button) => button.form.elements.armorSource?.value || null,
      },
      rejectClose: false,
    });
    return sources.find((source) => source.uuid === uuid) || null;
  }

  async adjustResource(actor, target, direction) {
    if (!actor.isOwner) return ui.notifications.warn(localize("DQP.Warnings.NoPermission"));
    const path = target.dataset.path;
    if (!["system.resources.hitPoints.value", "system.resources.stress.value", "system.resources.hope.value", "system.armorScore.value"].includes(path)) return;
    return this.withLock(`resource:${path}`, target, async () => {
      const marked = Number(foundry.utils.getProperty(actor, path) || 0);
      const maximum = Number(foundry.utils.getProperty(actor, path.replace(/\.value$/, ".max")) || 0);
      const current = path === "system.armorScore.value" ? maximum - marked : marked;
      const next = clamp(current + direction, 0, maximum);
      if (next === current) return;
      if (path === "system.armorScore.value") {
        if (direction < 0 && typeof actor.system.updateArmorEffectValue === "function") {
          const sources = this.armorSources(actor);
          const source = sources.length > 1 ? await this.chooseArmorSource(sources) : sources[0];
          if (sources.length > 1 && !source) return;
          if (source) await actor.system.updateArmorEffectValue({ uuid: source.uuid, value: 1 });
          else await actor.system.updateArmorValue({ value: 1 });
        } else {
          await actor.system.updateArmorValue({ value: -direction });
        }
      } else {
        await actor.update({ [path]: next });
      }
      this.animateElement(target, direction > 0 ? "is-marked" : "is-cleared");
    });
  }

  async setResource(actor, target) {
    if (!actor.isOwner) return ui.notifications.warn(localize("DQP.Warnings.NoPermission"));
    const path = target.dataset.path;
    const clicked = Number(target.dataset.value);
    if (!["system.resources.hitPoints.value", "system.resources.stress.value", "system.resources.hope.value", "system.armorScore.value"].includes(path) || !Number.isFinite(clicked)) return;
    return this.withLock(`resource:${path}`, target, async () => {
      const maximum = Number(foundry.utils.getProperty(actor, path.replace(/\.value$/, ".max")) || 0);
      const marked = Number(foundry.utils.getProperty(actor, path) || 0);
      const current = path === "system.armorScore.value" ? maximum - marked : marked;
      const next = clamp(current === clicked ? clicked - 1 : clicked, 0, maximum);
      if (next === current) return;
      if (path === "system.armorScore.value") {
        if (next < current && typeof actor.system.updateArmorEffectValue === "function") {
          for (let count = current - next; count > 0; count--) {
            const sources = this.armorSources(actor);
            const source = sources.length > 1 ? await this.chooseArmorSource(sources) : sources[0];
            if (sources.length > 1 && !source) return;
            if (source) await actor.system.updateArmorEffectValue({ uuid: source.uuid, value: 1 });
            else await actor.system.updateArmorValue({ value: 1 });
          }
        } else {
          await actor.system.updateArmorValue({ value: current - next });
        }
      } else {
        await actor.update({ [path]: next });
      }
      this.animateElement(target, next > current ? "is-marked" : "is-cleared");
    });
  }

  async openLevelUp(actor, target) {
    if (!actor.isOwner) return ui.notifications.warn(localize("DQP.Warnings.NoPermission"));
    return this.withLock(`level:${actor.id}`, target, async () => {
      const applications = game.system.api?.applications;
      if (actor.system.needsCharacterSetup) {
        const CharacterCreation = applications?.characterCreation?.CharacterCreation;
        return CharacterCreation && new CharacterCreation(actor).render({ force: true });
      }
      if (!actor.system.class?.value || !actor.system.class?.subclass) {
        return ui.notifications.error(localize("DAGGERHEART.UI.Notifications.missingClassOrSubclass"));
      }

      const level = actor.system.levelData?.level;
      const currentLevel = Number(level?.current || 1);
      const pendingLevel = Number(level?.changed || currentLevel);
      if (pendingLevel <= currentLevel) {
        const tiers = Object.values(actor.system.levelupTiers?.tiers || {});
        const maxLevel = tiers.reduce((maximum, tier) => Math.max(maximum, Number(tier.levels?.end || 0)), 0);
        if (maxLevel && currentLevel >= maxLevel) {
          return ui.notifications.info(localize("DQP.Warnings.MaxLevel"));
        }
        await actor.updateLevel(currentLevel + 1);
      }

      const CharacterLevelup = applications?.levelup?.CharacterLevelup;
      return CharacterLevelup && new CharacterLevelup(actor).render({ force: true });
    });
  }

  async useItem(actor, itemId, event, target) {
    const item = actor.items.get(itemId);
    if (!item) return ui.notifications.error(localize("DQP.Warnings.MissingItem"));
    if (!actor.isOwner) return ui.notifications.warn(localize("DQP.Warnings.NoPermission"));
    if (item.type === "domainCard" && item.system.inVault && !item.system.vaultActive) {
      return ui.notifications.warn(localize("DQP.Warnings.CardInVault"));
    }
    if (item.type === "domainCard" && item.system.isDomainTouchedSuppressed) {
      return ui.notifications.warn(localize("DQP.Warnings.CardSuppressed"));
    }
    const actions = itemActions(item);
    if (!actions.length) {
      ui.notifications.info(localize("DQP.Warnings.NoItemAction"));
      return item.sheet.render({ force: true });
    }
    const insufficient = actions.length === 1 ? this.findInsufficientCost(actor, actions[0]) : null;
    if (insufficient) {
      return ui.notifications.warn(localize("DQP.Warnings.InsufficientResource", insufficient));
    }
    return this.withLock(`item:${itemId}`, target, async () => {
      const row = target?.closest(".dqp-item-row");
      row?.classList.add("is-activating");
      try {
        const result = await item.use(event);
        if (result) this.animateElement(row, "is-used", 620);
        const shouldVault = Boolean(result) && item.type === "domainCard" && Number(item.system.recallCost || 0) > 0 && !item.system.inVault;
        if (shouldVault) {
          await this.transferDomainCard(item, event, true, false);
          if (!this.patchItemUpdate(item, { system: { inVault: true } })) this.scheduleRender(0);
        }
        return result;
      } finally {
        row?.classList.remove("is-activating");
      }
    });
  }

  findInsufficientCost(actor, action) {
    for (const cost of asArray(action?.cost)) {
      if (cost?.enabled === false || cost.itemId) continue;
      const amount = this.costAmount(cost);
      const resource = actor.system.resources?.[cost.key];
      if (!amount || !resource) continue;
      const available = resource.isReversed
        ? Math.max(0, Number(resource.max || 0) - Number(resource.value || 0))
        : Math.max(0, Number(resource.value || 0));
      if (amount > available) return {
        resource: this.costResourceLabel(cost.key),
        needed: amount,
        available,
      };
    }
    return null;
  }

  async toggleVault(actor, itemId, event, target, destination = null) {
    if (!actor.isOwner) return ui.notifications.warn(localize("DQP.Warnings.NoPermission"));
    const item = actor.items.get(itemId);
    if (!item) return ui.notifications.error(localize("DQP.Warnings.MissingItem"));
    if (item.type !== "domainCard") {
      return ui.notifications.error(localize("DQP.Warnings.TransferUnavailable"));
    }
    const toVault = destination ?? !item.system.inVault;
    if (!toVault && !this.loadoutHasRoom(actor, item)) {
      return ui.notifications.warn(localize("DQP.Warnings.LoadoutFull", { max: this.loadoutLimit(actor) }));
    }
    const recallCost = Math.max(0, Number(item.system.recallCost || 0));
    if (!toVault && recallCost > 0) {
      const insufficient = this.findInsufficientCost(actor, {
        cost: [{ key: "stress", value: recallCost }],
      });
      if (insufficient) {
        return ui.notifications.warn(localize("DQP.Warnings.InsufficientResource", insufficient));
      }
    }
    const hasNativeTransfer = typeof item.system.toggleVault === "function";
    const LegacyAction = systemActionType("effect");
    if (!hasNativeTransfer && !toVault && Number(item.system.recallCost || 0) > 0 && !LegacyAction) {
      return ui.notifications.error(localize("DQP.Warnings.TransferUnavailable"));
    }
    const before = Boolean(item.system.inVault);
    await this.withLock(`vault:${itemId}`, target, () => this.transferDomainCard(item, event, toVault, !toVault));
    if (Boolean(item.system.inVault) !== before && !this.patchItemUpdate(item, { system: { inVault: item.system.inVault } })) this.scheduleRender(0);
  }

  async transferDomainCard(item, event, toVault, payRecall = true) {
    if (typeof item.system.toggleVault === "function") {
      return item.system.toggleVault(event, toVault, payRecall);
    }

    // Daggerheart 2.2.6 keeps this workflow inside its CharacterSheet. Mirror
    // that native implementation: storing is free, while recalling a paid card
    // uses the system Effect action so all resource dialogs and costs stay native.
    const recallCost = Math.max(0, Number(item.system.recallCost || 0));
    if (toVault || !payRecall || recallCost === 0) {
      return item.update({ "system.inVault": Boolean(toVault) });
    }

    const Action = systemActionType("effect");
    if (!Action) return false;
    const action = new Action({
      ...Action.getSourceConfig(item.system),
      type: "effect",
      chatDisplay: false,
      cost: [{ key: "stress", value: recallCost }],
    }, { parent: item.system });
    const result = await action.use(event);
    if (result) await item.update({ "system.inVault": false });
    return result;
  }

  setupPlayersPanel() {
    const players = document.getElementById("players");
    if (!players) return;
    players.classList.add("dqp-players-managed");
    const collapsed = Boolean(game.settings.get(MODULE_ID, "playersCollapsed"));
    players.classList.toggle("dqp-players-collapsed", collapsed);
    let button = players.querySelector(".dqp-players-toggle");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "dqp-players-toggle";
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await game.settings.set(MODULE_ID, "playersCollapsed", !players.classList.contains("dqp-players-collapsed"));
        this.setupPlayersPanel();
      });
      (players.querySelector("#performance-stats") || players).append(button);
    }
    const activeCount = players.querySelectorAll("#players-active .player").length;
    const icon = document.createElement("i");
    icon.className = collapsed ? "fa-solid fa-users" : "fa-solid fa-chevron-left";
    icon.setAttribute("inert", "");
    const count = document.createElement("span");
    count.textContent = String(activeCount);
    button.replaceChildren(icon, count);
    button.setAttribute("aria-expanded", String(!collapsed));
    button.setAttribute("aria-label", localize(collapsed ? "DQP.Players.Show" : "DQP.Players.Hide"));
    button.dataset.tooltip = localize(collapsed ? "DQP.Players.Show" : "DQP.Players.Hide");
  }

  async openDowntime(actor, rest, target) {
    if (!actor.isOwner) return ui.notifications.warn(localize("DQP.Warnings.NoPermission"));
    const native = sheetAction(actor, "useDowntime");
    const Downtime = game.system.api?.applications?.dialogs?.Downtime;
    if (!native && typeof Downtime !== "function") return actor.sheet?.render({ force: true });
    await this.withLock(`rest:${actor.id}`, target, async () => {
      if (native) {
        const button = document.createElement("button");
        button.dataset.type = rest === "short" ? "shortRest" : "longRest";
        return native.handler.call(native.sheet, null, button);
      }
      new Downtime(actor, rest === "short").render({ force: true });
    });
  }

  async withLock(key, target, operation) {
    if (this.actionLocks.has(key)) return ui.notifications.info(localize("DQP.Warnings.Busy"));
    this.actionLocks.add(key);
    target?.classList.add("is-busy");
    target?.setAttribute("aria-busy", "true");
    try {
      return await operation();
    } catch (error) {
      console.error(`${MODULE_ID} | Action failed`, error);
      ui.notifications.error(localize("DQP.Warnings.ActionFailed", { reason: error?.message || String(error) }));
    } finally {
      this.actionLocks.delete(key);
      target?.classList.remove("is-busy");
      target?.removeAttribute("aria-busy");
    }
  }

}

let quickPanel = null;

function registerHudSceneControl(controls) {
  if (game.system.id !== "daggerheart" || !game.user.isGM) return;

  const groups = Array.isArray(controls) ? controls : Object.values(controls || {});
  const group = groups.find((control) => ["token", "tokens"].includes(control?.name));
  if (!group) return;

  const activate = () => (quickPanel ?? game.modules.get(MODULE_ID)?.api?.panel)?.toggleHud(null);
  const tool = {
    name: "dqp-toggle-hud",
    title: localize("DQP.Hud.GMControl"),
    icon: "fa-solid fa-eye",
    button: true,
    visible: true,
    onChange: activate,
  };

  // Foundry 14 uses a keyed tools record. Retain the array branch for worlds
  // whose UI compatibility layer still exposes the earlier collection shape.
  if (Array.isArray(group.tools)) {
    if (!group.tools.some((candidate) => candidate?.name === tool.name)) group.tools.push(tool);
    return;
  }

  if (!group.tools || typeof group.tools !== "object") group.tools = {};
  if (group.tools[tool.name] || Object.values(group.tools).some((candidate) => candidate?.name === tool.name)) return;
  const orders = Object.values(group.tools).map((candidate) => Number(candidate?.order)).filter(Number.isFinite);
  group.tools[tool.name] = { ...tool, order: (orders.length ? Math.max(...orders) : -1) + 1 };
}

// Register before ready: build 361 can prepare Scene Controls before the HUD
// itself has mounted. The click callback resolves the panel lazily.
Hooks.on("getSceneControlButtons", registerHudSceneControl);

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "hudEnabled", {
    scope: "client", config: false, type: Boolean, default: true,
    onChange: () => game.modules.get(MODULE_ID)?.api?.panel?.scheduleRender(0),
  });
  game.settings.register(MODULE_ID, "diceTrayCollapsed", {
    scope: "client", config: false, type: Boolean, default: true,
    onChange: () => game.modules.get(MODULE_ID)?.api?.panel?.syncChatDock(),
  });
  game.settings.register(MODULE_ID, "playerHudRecovery", {
    scope: "client", config: false, type: String, default: "",
  });
  game.settings.register(MODULE_ID, "hudScale", {
    name: "DQP.Scale.Title", hint: "DQP.Scale.Hint", scope: "client", config: true,
    type: Number, default: 100, range: { min: 75, max: 125, step: 5 },
    onChange: () => game.modules.get(MODULE_ID)?.api?.panel?.applyScale(),
  });
  game.settings.register(MODULE_ID, "hudTheme", {
    name: "DQP.Theme.Title", hint: "DQP.Theme.Hint", scope: "client", config: true,
    type: String, default: "daggerheart",
    choices: Object.fromEntries(HUD_THEMES.map(([id, label]) => [id, localize(label)])),
    onChange: () => game.modules.get(MODULE_ID)?.api?.panel?.applyTheme(),
  });
  game.settings.register(MODULE_ID, "hudPlacement", {
    name: "DQP.Placement.Title", hint: "DQP.Placement.Hint", scope: "client", config: true,
    type: String, default: "center",
    choices: Object.fromEntries(HUD_PLACEMENTS.map(([id, label]) => [id, localize(label)])),
    onChange: () => game.modules.get(MODULE_ID)?.api?.panel?.applyPlacement(),
  });
  game.settings.register(MODULE_ID, "selectedActorId", {
    scope: "client",
    config: false,
    type: String,
    default: "",
  });
  game.settings.register(MODULE_ID, "playersCollapsed", {
    scope: "client", config: false, type: Boolean, default: false,
    onChange: () => game.modules.get(MODULE_ID)?.api?.panel?.setupPlayersPanel(),
  });
  game.settings.register(MODULE_ID, "compactCharacterWidthApplied", {
    scope: "client", config: false, type: Boolean, default: false,
  });
  for (const column of ["character", "traits", "workspace"]) {
    game.settings.register(MODULE_ID, `${column}Open`, {
      scope: "client",
      config: false,
      type: Boolean,
      default: true,
    });
    game.settings.register(MODULE_ID, `${column}Width`, {
      scope: "client",
      config: false,
      type: Number,
      default: column === "character" ? 88 : 100,
      onChange: () => game.modules.get(MODULE_ID)?.api?.panel?.applyColumnWidths(),
    });
  }
});

Hooks.once("ready", async () => {
  if (game.system.id !== "daggerheart") return;
  if (!game.settings.get(MODULE_ID, "compactCharacterWidthApplied")) {
    try {
      if (Number(game.settings.get(MODULE_ID, "characterWidth")) === 100) {
        await game.settings.set(MODULE_ID, "characterWidth", 88);
      }
      await game.settings.set(MODULE_ID, "compactCharacterWidthApplied", true);
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not apply compact character width`, error);
    }
  }
  const panel = new DaggerheartQuickPanel();
  quickPanel = panel;
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = { panel, render: () => panel.render() };

  // A client-local hidden state can survive a module replacement. Re-enable
  // the player HUD once for this repair so every player gets a visible panel
  // (or at least its no-character state) immediately after reloading.
  if (game.user?.isGM !== true && game.settings.get(MODULE_ID, "playerHudRecovery") !== "2") {
    if (!game.settings.get(MODULE_ID, "hudEnabled")) {
      await game.settings.set(MODULE_ID, "hudEnabled", true);
    }
    await game.settings.set(MODULE_ID, "playerHudRecovery", "2");
  }

  await panel.applyLanguage(false);
  await panel.mount();
  panel.setupPlayersPanel();
  const supportedTypes = SUPPORTED_ACTOR_TYPES;
  const relevantActor = (document) => supportedTypes.includes(document?.type)
    || supportedTypes.includes(document?.parent?.type);

  // Player HUD selection is independent from token-control state.
  if (game.user?.isGM === true) {
    Hooks.on("controlToken", (token, controlled) => panel.selectActorToken(token, controlled));
    Hooks.on("updateToken", (token) => {
      if (token.id === panel.selectedActorToken?.document?.id || token.id === panel.selectedActorToken?.id) {
        panel.scheduleRender();
      }
    });
  }
  Hooks.on("updateActor", (actor, changes) => {
    if (supportedTypes.includes(actor.type) && actor.id === panel.activeActor?.id
      && !panel.patchActorUpdate(actor, changes)) panel.scheduleRender();
  });
  Hooks.on("createActor", () => panel.scheduleRender());
  Hooks.on("deleteActor", () => panel.scheduleRender());
  Hooks.on("updateUser", (user) => { if (user.id === game.user.id) panel.scheduleRender(); });
  Hooks.on("renderPlayers", () => window.setTimeout(() => panel.setupPlayersPanel(), 0));
  for (const hook of ['renderSidebar', 'renderChatNotifications', 'renderChatLog', 'collapseSidebar']) {
    Hooks.on(hook, () => panel.observeLayout());
  }
  Hooks.on("createItem", (item) => {
    if (relevantActor(item) && item.parent?.id === panel.activeActor?.id) panel.scheduleRender();
  });
  Hooks.on("updateItem", (item, changes) => {
    if (relevantActor(item) && item.parent?.id === panel.activeActor?.id && !panel.patchItemUpdate(item, changes)) panel.scheduleRender();
  });
  Hooks.on("deleteItem", (item) => {
    if (relevantActor(item) && item.parent?.id === panel.activeActor?.id) panel.scheduleRender();
  });
  for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
    Hooks.on(hook, (effect) => {
      if (effect.parent?.id === panel.activeActor?.id) panel.scheduleRender();
    });
  }
});

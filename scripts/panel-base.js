import { MODULE_ID, TEMPLATE, ADVERSARY_TEMPLATE, GENERIC_TEMPLATE, ITEM_PARTIAL, SUPPORTED_ACTOR_TYPES, TRAITS, ITEM_TYPE_ORDER, HUD_THEMES, HUD_PLACEMENTS, localize, clamp, asArray, escapeHTML, changePaths, plainText } from "./helpers.js";
import { actionLabels, itemActions, sheetAction } from "./helpers.js";

export class DaggerheartQuickPanelBase {
  constructor() {
    this.root = null;
    this.activeTab = "core";
    this.unrollPane = false;
    this.collapsedGroups = new Set();
    this.renderTimer = null;
    this.rendering = false;
    this.renderAgain = false;
    this.actionLocks = new Set();
    this.boundClick = this.onClick.bind(this);
    this.boundWheel = this.onWorkspaceWheel.bind(this);
    this.boundContext = this.onContextMenu.bind(this);
    this.boundChange = this.onChange.bind(this);
    this.boundDragStart = this.onDragStart.bind(this);
    this.boundDragEnd = this.onDragEnd.bind(this);
    this.boundDragOver = this.onDragOver.bind(this);
    this.boundDragLeave = this.onDragLeave.bind(this);
    this.boundDrop = this.onDrop.bind(this);
    this.boundHover = this.onHover.bind(this);
    this.boundLeave = this.onHoverLeave.bind(this);
    this.boundKey = this.onKeyDown.bind(this);
    this.boundResizeStart = this.onResizeStart.bind(this);
    this.boundResizeMove = this.onResizeMove.bind(this);
    this.boundResizeEnd = this.onResizeEnd.bind(this);
    this.previewTimer = null;
    this.previewAnchor = null;
    this.preview = null;
    this.scaleHideTimer = null;
    this.themeHideTimer = null;
    this.utilityDockOpen = false;
    this.utilityAnimation = null;
    this.columnAnimations = new Map();
    this.resizeState = null;
    this.dragState = null;
    this.layoutFrame = null;
    this.languageCache = new Map();
    this.activeLanguage = "en";
    this.controlledActorToken = null;
    this.manualActorOverride = false;
    this.boundLayout = () => this.scheduleLayout();
    this.chatObserver = null;
    this.chatControlsHost = null;
  }

  get open() {
    return Boolean(game.settings.get(MODULE_ID, "hudEnabled"));
  }

  get columnState() {
    return {
      characterOpen: Boolean(game.settings.get(MODULE_ID, "characterOpen")),
      traitsOpen: Boolean(game.settings.get(MODULE_ID, "traitsOpen")),
      workspaceOpen: Boolean(game.settings.get(MODULE_ID, "workspaceOpen")),
    };
  }

  get actors() {
    return game.actors
      .filter((actor) => SUPPORTED_ACTOR_TYPES.includes(actor.type) && (game.user?.isGM === true || actor.isOwner))
      .sort((a, b) => {
        if (a.type === "character" && b.type !== "character") return -1;
        if (a.type !== "character" && b.type === "character") return 1;
        return a.name.localeCompare(b.name, game.i18n.lang);
      });
  }

  get actor() {
    const actors = this.actors;
    if (!actors.length) return null;

    const selectedId = game.settings.get(MODULE_ID, "selectedActorId");
    const selected = actors.find((actor) => actor.id === selectedId);
    if (selected) return selected;

    const assigned = actors.find((actor) => actor.id === game.user.character?.id);
    return assigned || actors.find((candidate) => candidate.type === "character") || actors[0];
  }

  get selectedActorToken() {
    // Token selection is GM-only; the player HUD never depends on canvas state.
    if (game.user?.isGM !== true || this.manualActorOverride) {
      this.controlledActorToken = null;
      return null;
    }
    const controlled = asArray(globalThis.canvas?.tokens?.controlled);
    if (this.controlledActorToken && controlled.includes(this.controlledActorToken)
      && SUPPORTED_ACTOR_TYPES.includes(this.controlledActorToken.actor?.type)) {
      return this.controlledActorToken;
    }
    const selected = [...controlled].reverse().find((token) => SUPPORTED_ACTOR_TYPES.includes(token?.actor?.type)) || null;
    this.controlledActorToken = selected;
    return selected;
  }

  get selectedAdversaryToken() {
    const selected = this.selectedActorToken;
    return selected?.actor?.type === "adversary" ? selected : null;
  }

  get activeActor() {
    if (game.user?.isGM !== true) return this.actor;
    return this.selectedActorToken?.actor || this.actor;
  }

  applicableEffects(actor) {
    if (!actor) return [];
    try {
      // Match the Daggerheart character sheet's Active/Inactive effect lists.
      if (typeof actor.allApplicableEffects === "function") {
        return asArray(actor.allApplicableEffects({ noTransferArmor: true }));
      }
    } catch (error) {
      console.warn(`${MODULE_ID} | Native effect list is unavailable; using embedded effects`, error);
    }
    return asArray(actor.effects);
  }

  effectByKey(actor, key) {
    return this.applicableEffects(actor).find((effect) => (effect.uuid || effect.id) === key) || null;
  }

  selectActorToken(token, controlled) {
    if (game.user?.isGM !== true) return;
    this.manualActorOverride = false;
    if (controlled && SUPPORTED_ACTOR_TYPES.includes(token?.actor?.type)) {
      this.controlledActorToken = token;
    } else if (this.controlledActorToken === token) {
      this.controlledActorToken = [...asArray(globalThis.canvas?.tokens?.controlled)]
        .reverse().find((candidate) => candidate !== token && SUPPORTED_ACTOR_TYPES.includes(candidate?.actor?.type)) || null;
    } else if (!controlled && !this.selectedActorToken) {
      this.controlledActorToken = null;
    }
    this.hidePreview();
    this.scheduleRender(0);
  }

  selectAdversaryToken(token, controlled) {
    this.selectActorToken(token, controlled);
  }

  async mount() {
    if (game.system.id !== "daggerheart") return;
    if (document.getElementById("dqp-root")) return;

    this.root = document.createElement("div");
    this.root.id = "dqp-root";
    this.bindEvents();
    document.body.append(this.root);
    this.setupPlayersPanel();

    await foundry.applications.handlebars.loadTemplates([ITEM_PARTIAL]);

    const selected = this.actor;
    if (selected && !game.settings.get(MODULE_ID, "selectedActorId")) {
      await game.settings.set(MODULE_ID, "selectedActorId", selected.id);
    }
    await this.render();
  }

  scheduleRender(delay = 40) {
    window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => this.render(), delay);
  }

  bindEvents() {
    this.root.addEventListener("click", this.boundClick);
    this.root.addEventListener("wheel", this.boundWheel, { passive: false });
    this.root.addEventListener("contextmenu", this.boundContext);
    this.root.addEventListener("change", this.boundChange);
    this.root.addEventListener("dragstart", this.boundDragStart);
    this.root.addEventListener("dragend", this.boundDragEnd);
    this.root.addEventListener("dragover", this.boundDragOver);
    this.root.addEventListener("dragleave", this.boundDragLeave);
    this.root.addEventListener("drop", this.boundDrop);
    this.root.addEventListener("pointerover", this.boundHover);
    this.root.addEventListener("focusin", this.boundHover);
    this.root.addEventListener("pointerout", this.boundLeave);
    this.root.addEventListener("focusout", this.boundLeave);
    this.root.addEventListener("keydown", this.boundKey);
    this.root.addEventListener("pointerdown", this.boundResizeStart);
    window.addEventListener("pointermove", this.boundResizeMove);
    window.addEventListener("pointerup", this.boundResizeEnd);
    window.addEventListener("pointercancel", this.boundResizeEnd);
    window.addEventListener("resize", this.boundLayout);
    this.layoutObserver ??= new ResizeObserver(this.boundLayout);
    this.chromeObserver ??= new MutationObserver(this.boundLayout);
  }

  onWorkspaceWheel(event) {
    const scroller = event.target.closest?.('.dqp-ribbon-scroll');
    if (!scroller || !this.root.contains(scroller)) return;
    const maximum = scroller.scrollWidth - scroller.clientWidth;
    if (maximum <= 1) return;
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (!delta) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.clientWidth : 1;
    event.preventDefault();
    event.stopPropagation();
    scroller.scrollLeft = clamp(scroller.scrollLeft + delta * unit, 0, maximum);
  }

  scheduleLayout() {
    if (this.layoutFrame != null) return;
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = null;
      this.positionHud();
    });
  }

  observeLayout() {
    this.layoutObserver?.disconnect();
    this.chromeObserver?.disconnect();
    for (const element of document.querySelectorAll('#ui-right, #ui-right-column-1, #sidebar, #sidebar-content, #chat-notifications, #chat-message, #dqp-root .dqp-shell')) {
      this.layoutObserver?.observe(element);
      if (!element.closest('#dqp-root')) this.chromeObserver?.observe(element, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    }
    this.scheduleLayout();
  }

  syncChatDock() {
    const input = document.querySelector('#chat-notifications #chat-message');
    const host = input?.parentElement;
    if (!this.open || !host) {
      document.querySelectorAll('#chat-notifications .dqp-chat-tools').forEach((tools) => tools.remove());
      document.querySelectorAll('#chat-notifications .dqp-chat-dock').forEach((dock) => dock.classList.remove('dqp-chat-dock'));
      document.body.classList.remove('dqp-chat-dice-collapsed');
      this.chatObserver?.disconnect();
      this.chatControlsHost = null;
      return;
    }

    host.classList.add('dqp-chat-dock');

    if (this.chatControlsHost !== host) {
      this.chatObserver?.disconnect();
      this.chatObserver ??= new MutationObserver(this.boundLayout);
      this.chatObserver.observe(host, { childList: true });
      this.chatControlsHost = host;
    }

    let tools = host.querySelector(':scope > .dqp-chat-tools');
    if (!tools) {
      tools = document.createElement('div');
      tools.className = 'dqp-chat-tools';
      tools.innerHTML = '<button type="button" data-dqp-chat-action="history"><i class="fa-solid fa-comments" inert></i><span></span></button>'
        + '<button type="button" data-dqp-chat-action="dice"><i class="fa-solid fa-dice-d20" inert></i><span></span></button>';
      tools.addEventListener('click', (event) => {
        const button = event.target.closest('[data-dqp-chat-action]');
        if (!button) return;
        if (button.dataset.dqpChatAction === 'history') {
          const sidebar = ui.sidebar;
          if (!sidebar) return;
          if (sidebar.expanded && sidebar.tabGroups?.primary === 'chat') sidebar.collapse();
          else {
            sidebar.changeTab('chat', 'primary');
            sidebar.expand();
          }
          this.syncChatDock();
        } else if (button.dataset.dqpChatAction === 'dice') {
          void game.settings.set(MODULE_ID, 'diceTrayCollapsed', !game.settings.get(MODULE_ID, 'diceTrayCollapsed'))
            .then(() => this.syncChatDock());
        }
      });
    }

    const tray = host.querySelector(':scope > .dice-tray');
    if (tray && tools.nextElementSibling !== tray) tray.before(tools);
    else if (tools.parentElement !== host) input.after(tools);
    else if (tools.previousElementSibling !== input) input.after(tools);

    const collapsed = Boolean(game.settings.get(MODULE_ID, 'diceTrayCollapsed'));
    document.body.classList.toggle('dqp-chat-dice-collapsed', collapsed && Boolean(tray));
    const history = tools.querySelector('[data-dqp-chat-action="history"]');
    const dice = tools.querySelector('[data-dqp-chat-action="dice"]');
    const historyOpen = Boolean(ui.sidebar?.expanded && ui.sidebar?.tabGroups?.primary === 'chat');
    history.querySelector('span').textContent = localize('DQP.Chat.History');
    history.setAttribute('aria-label', localize('DQP.Chat.History'));
    history.setAttribute('aria-expanded', String(historyOpen));
    dice.hidden = !tray;
    dice.querySelector('span').textContent = localize(collapsed ? 'DQP.Chat.ShowDice' : 'DQP.Chat.HideDice');
    dice.setAttribute('aria-label', localize(collapsed ? 'DQP.Chat.ShowDice' : 'DQP.Chat.HideDice'));
    dice.setAttribute('aria-expanded', String(!collapsed));
  }

  positionHud() {
    if (!this.root) return;
    const shell = this.root.querySelector('.dqp-shell');
    if (!shell) {
      document.documentElement.style.removeProperty('--dqp-chat-clearance');
      document.body.classList.remove('dqp-chat-at-bottom');
      this.syncChatDock();
      return;
    }
    const margin = 18;
    let right = window.innerWidth - margin;
    // The real sidebar is the horizontal obstacle. The quick-chat column is
    // lifted above the HUD below, so its transparent wrapper must not squeeze
    // the centered ribbon.
    const sidebar = document.querySelector('#sidebar') || document.querySelector('#ui-right');
    for (const element of sidebar ? [sidebar] : []) {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || !rect.width || !rect.height) continue;
      if (rect.left > window.innerWidth * .35 && rect.left < window.innerWidth && rect.bottom > window.innerHeight * .5) {
        right = Math.min(right, rect.left - margin);
      }
    }
    const placement = game.settings.get(MODULE_ID, 'hudPlacement') === 'side' ? 'side' : 'center';
    const center = window.innerWidth / 2;
    const halfAvailable = Math.max(1, Math.min(center - margin, right - center));
    const available = placement === 'side' ? Math.max(1, right - margin) : halfAvailable * 2;
    this.hudBounds = placement === 'side'
      ? { left: margin, right }
      : { left: center - halfAvailable, right: center + halfAvailable };
    const requested = clamp(Number(game.settings.get(MODULE_ID, 'hudScale')) || 100, 75, 125) / 100;
    const rootStyle = getComputedStyle(this.root);
    const maximumColumns = parseFloat(rootStyle.getPropertyValue('--dqp-hud-max')) || 1240;
    // The portrait now lives inside the first two HUD bands. Only the slim
    // layer dock sits outside the measured panel width.
    const chrome = 38;
    const scale = Math.min(requested, available / (720 + chrome));
    const columns = Math.min(maximumColumns, Math.max(720, available / scale - chrome));
    this.root.style.setProperty('--dqp-scale', scale);
    this.root.style.setProperty('--dqp-columns-width', `${columns}px`);
    shell.style.left = `${(placement === 'side' ? margin : center) / scale}px`;
    shell.style.bottom = `${margin / scale}px`;
    const shellRect = shell.getBoundingClientRect();
    const clearance = Math.ceil(window.innerHeight - shellRect.top + 14);
    const chatLeft = document.querySelector('#chat-notifications .chat-input')?.getBoundingClientRect().left;
    const visibleHudRight = Math.max(...Array.from(shell.querySelectorAll('.dqp-column:not(.is-collapsed), .dqp-avatar-anchor, .dqp-layer-dock'))
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getBoundingClientRect().height > 0;
      })
      .map((element) => element.getBoundingClientRect().right), shellRect.left);
    const chatBesideHud = Number.isFinite(chatLeft) && visibleHudRight + 12 <= chatLeft;
    document.documentElement.style.setProperty('--dqp-chat-clearance', `${chatBesideHud ? 14 : clearance}px`);
    document.body.classList.toggle('dqp-chat-at-bottom', chatBesideHud);
    document.body.style.setProperty('--dqp-players-bottom', `${clearance}px`);
    this.syncChatDock();
    const eye = shell.querySelector('.dqp-dock-hud-toggle')?.getBoundingClientRect();
    if (eye?.width && eye?.height) {
      this.root.style.setProperty('--dqp-eye-left', `${eye.left}px`);
      this.root.style.setProperty('--dqp-eye-bottom', `${window.innerHeight - eye.bottom}px`);
      this.root.style.setProperty('--dqp-eye-width', `${eye.width}px`);
      this.root.style.setProperty('--dqp-eye-height', `${eye.height}px`);
    }
  }

  columnWidth(column) {
    return clamp(Number(game.settings.get(MODULE_ID, `${column}Width`)) || 100, 72, 100);
  }

  setColumnWidthStyle(column, percent) {
    const value = clamp(Math.round(Number(percent) || 100), 72, 100);
    this.root?.style.setProperty(`--dqp-${column}-width`, `${value}%`);
    this.root?.querySelector(`[data-resize-column="${column}"]`)?.setAttribute("aria-valuenow", String(value));
    return value;
  }

  applyColumnWidths() {
    for (const column of ["character", "traits", "workspace"]) {
      this.setColumnWidthStyle(column, this.columnWidth(column));
    }
    this.scheduleLayout();
  }

  onResizeStart(event) {
    const handle = event.target.closest?.("[data-resize-column]");
    if (!handle || event.button !== 0) return;
    const column = handle.dataset.resizeColumn;
    if (!["character", "traits", "workspace"].includes(column)) return;
    const columns = this.root?.querySelector(".dqp-columns");
    const rect = columns?.getBoundingClientRect();
    if (!rect?.width) return;
    event.preventDefault();
    this.resizeState = { column, pointerId: event.pointerId, left: rect.left, width: rect.width, handle, percent: this.columnWidth(column) };
    handle.classList.add("is-resizing");
    handle.setPointerCapture?.(event.pointerId);
    document.body.classList.add("dqp-column-resizing");
  }

  onResizeMove(event) {
    const state = this.resizeState;
    if (!state || event.pointerId !== state.pointerId) return;
    state.percent = this.setColumnWidthStyle(state.column, ((event.clientX - state.left) / state.width) * 100);
  }

  async onResizeEnd(event) {
    const state = this.resizeState;
    if (!state || event.pointerId !== state.pointerId) return;
    state.handle.classList.remove("is-resizing");
    state.handle.releasePointerCapture?.(state.pointerId);
    document.body.classList.remove("dqp-column-resizing");
    this.resizeState = null;
    await game.settings.set(MODULE_ID, `${state.column}Width`, state.percent);
    this.positionHud();
  }

  onKeyDown(event) {
    if (event.key === "Escape") this.hidePreview();
    const handle = event.target.closest?.("[data-resize-column]");
    if (!handle || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const column = handle.dataset.resizeColumn;
    const current = this.columnWidth(column);
    const next = event.key === "Home" ? 72 : event.key === "End" ? 100 : current + (event.key === "ArrowRight" ? 4 : -4);
    const value = this.setColumnWidthStyle(column, next);
    void game.settings.set(MODULE_ID, `${column}Width`, value);
  }

  async render() {
    if (!this.root || game.system.id !== "daggerheart") return;
    if (this.rendering) {
      this.renderAgain = true;
      return;
    }

    this.rendering = true;
    this.utilityAnimation?.cancel();
    this.utilityAnimation = null;
    for (const animation of this.columnAnimations.values()) animation.cancel();
    this.columnAnimations.clear();
    this.hidePreview();
    const oldContent = this.root.querySelector(".dqp-ribbon-scroll");
    const scrollLeft = oldContent?.scrollLeft || 0;

    try {
      const context = this.prepareContext();
      // Reuse the sheet's grouping, including multiclass, companion and availability rules.
      const actor = context.hudEnabled && !context.isCompact && this.activeActor?.type === "character" ? this.activeActor : null;
      if (actor?.sheet?._prepareFeaturesContext) {
        try {
          const native = {};
          await actor.sheet._prepareFeaturesContext(native, {});
          const groups = asArray(native.featureGroups).map((group, index) =>
            this.groupData(`features-${group.anchorItem?.id || group.type}-${index}`, group.title,
              asArray(group.values).map(item => this.itemData(item, actor)), true, group.type));
          // The private sheet helper is allowed to change between Daggerheart
          // releases. Keep the groups prepared directly from actor items when
          // a new system build returns no compatible groups.
          if (groups.length) context.abilityGroups = groups;
        } catch (error) {
          console.warn(`${MODULE_ID} | Native feature grouping is unavailable; using actor items`, error);
        }
      } else if (actor?.system.sheetLists) {
        // Daggerheart 2.2.x exposes the sheet's native categories through the
        // actor model instead of CharacterSheet#_prepareFeaturesContext.
        context.abilityGroups = Object.entries(actor.system.sheetLists)
          .filter(([, group]) => group?.type === "feature" || asArray(group?.values).length)
          .map(([key, group], index) => this.groupData(`features-${key}-${index}`, group.title,
            asArray(group.values).map(item => this.itemData(item, actor)), true, group.type || key))
          .filter((group) => group.items.length);
      }
      const template = context.isAdversary ? ADVERSARY_TEMPLATE : context.isGeneric ? GENERIC_TEMPLATE : TEMPLATE;
      const html = await foundry.applications.handlebars.renderTemplate(template, context);
      this.root.innerHTML = html;
      this.applyTheme();
      this.applyColumnWidths();
      this.applyPlacement();
      this.applyScale();
      this.observeLayout();
      this.root.querySelector(".dqp-ribbon-scroll")?.scrollTo({ left: scrollLeft });
      if (this.pendingEffectArrival) {
        const key = this.pendingEffectArrival;
        this.pendingEffectArrival = null;
        const arrived = Array.from(this.root.querySelectorAll(".dqp-effect-card"))
          .find((card) => card.dataset.effectKey === key);
        this.animateElement(arrived, "is-arriving", 430);
      }
      this.root.classList.toggle("dqp-panel-open", context.open);
      this.root.classList.toggle("dqp-hud-disabled", !context.hudEnabled);
      this.root.classList.toggle("dqp-adversary-active", Boolean(context.isCompact));
      document.body.classList.toggle("dqp-bottom-hud-active", context.hudEnabled);
      this.unrollPane = false;
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to render`, error);
      try {
        this.renderFailure(error);
      } catch (fallbackError) {
        console.error(`${MODULE_ID} | Failed to render recovery controls`, fallbackError);
      }
    } finally {
      this.rendering = false;
      if (this.renderAgain) {
        this.renderAgain = false;
        this.scheduleRender(20);
      }
    }
  }

  prepareContext() {
    const hudEnabled = this.open;
    const hudToggle = {
      hudEnabled,
      hudToggleIcon: hudEnabled ? "fa-solid fa-eye-slash" : "fa-solid fa-eye",
      hudToggleLabel: localize(hudEnabled ? "DQP.Hud.Hide" : "DQP.Hud.Show"),
    };
    if (!hudEnabled) return hudToggle;

    const selectedToken = game.user?.isGM === true ? this.selectedActorToken : null;
    const actor = selectedToken?.actor || this.actor;
    const columnState = this.columnState;
    const tabs = [
      ["core", "DQP.Tabs.Core", "fa-solid fa-heart-pulse"],
      ["actions", "DQP.Tabs.Actions", "fa-solid fa-bolt"],
      ["abilities", "DQP.Tabs.Abilities", "fa-solid fa-layer-group"],
      ["experiences", "DQP.Experiences.Title", "fa-solid fa-feather-pointed"],
      ["gear", "DQP.Tabs.Gear", "fa-solid fa-suitcase"],
    ].map(([id, label, icon]) => ({ id, label: localize(label), icon, active: id === this.activeTab }));

    const context = {
      ...hudToggle,
      open: this.open,
      ...columnState,
      unrollPane: this.unrollPane,
      isAdversary: false,
      isGeneric: false,
      isCompact: false,
      actor: null,
      actorChoices: this.actors.map((candidate) => ({ id: candidate.id, name: candidate.name, img: candidate.img, selected: candidate.id === actor?.id })),
      utilityDockOpen: this.utilityDockOpen,
      tabs,
      themes: HUD_THEMES.map(([id, label]) => ({
        id,
        label: localize(label),
        active: id === (game.settings.get(MODULE_ID, "hudTheme") || "daggerheart"),
      })),
      placements: HUD_PLACEMENTS.map(([id, label, icon]) => ({
        id,
        label: localize(label),
        icon,
        active: id === (game.settings.get(MODULE_ID, "hudPlacement") || "center"),
      })),
      activeTab: this.activeTab,
      showCore: this.activeTab === "core",
      showActions: this.activeTab === "actions",
      showAbilities: this.activeTab === "abilities",
      showExperiences: this.activeTab === "experiences",
      showGear: this.activeTab === "gear",
      emptyHint: localize(game.user.isGM ? "DQP.Actor.NoneHintGM" : "DQP.Actor.NoneHintPlayer"),
    };
    if (!actor) return context;
    if (actor.type === "adversary") return this.prepareAdversaryContext(context, actor, selectedToken);
    if (actor.type !== "character") return this.prepareGenericContext(context, actor, selectedToken);

    const className = actor.system.class?.value?.name || actor.items.find((item) => item.type === "class")?.name || "";
    const subclassName = actor.system.class?.subclass?.name || actor.items.find((item) => item.type === "subclass")?.name || "";
    const subtitle = [className, subclassName].filter(Boolean).join(" · ");
    const domainLabel = [...new Set(actor.items
      .filter((item) => item.type === "domainCard")
      .map((item) => item.system.domainLabel)
      .filter(Boolean))].join(" · ") || "—";
    const level = actor.system.levelData?.level?.current ?? actor.system.level ?? 1;
    const effectViews = this.applicableEffects(actor).filter((effect) => effect?.id).map((effect) => {
      const active = typeof effect.active === "boolean" ? effect.active : !effect.disabled && !effect.isSuppressed;
      const rawDescription = effect.description || effect.parent?.system?.description || "";
      const localizedDescription = typeof rawDescription === "string" ? localize(rawDescription) : rawDescription;
      return {
        key: effect.uuid || effect.id,
        name: effect.name || localize("DQP.Effects.Unnamed"),
        img: effect.img || "icons/svg/aura.svg",
        description: plainText(localizedDescription, Infinity),
        active,
        canToggle: Boolean(actor.isOwner && effect.type !== "beastform"),
        nextActive: !active,
        toggleIcon: active ? "fa-solid fa-arrow-right" : "fa-solid fa-arrow-left",
        toggleLabel: localize(active ? "DQP.Effects.Deactivate" : "DQP.Effects.Activate"),
      };
    });

    const resources = [
      this.resourceData(actor, "hitPoints", "system.resources.hitPoints.value", "DQP.Resources.HitPoints", "fa-solid fa-heart-crack"),
      this.resourceData(actor, "stress", "system.resources.stress.value", "DQP.Resources.Stress", "fa-solid fa-brain"),
      this.resourceData(actor, "hope", "system.resources.hope.value", "DQP.Resources.Hope", "fa-solid fa-diamond"),
      this.resourceData(actor, "armor", "system.armorScore.value", "DQP.Resources.Armor", "fa-solid fa-shield-halved", actor.system.armorScore),
    ];

    const traits = TRAITS.map(([key, labelKey, icon]) => {
      const value = Number(actor.system.traits?.[key]?.value || 0);
      const systemLabelKey = `DAGGERHEART.CONFIG.Traits.${key}.name`;
      const systemLabel = localize(systemLabelKey);
      const isEnglishFallback = this.activeLanguage === "ru"
        && systemLabel.toLocaleLowerCase() === labelKey.toLocaleLowerCase();
      const label = systemLabel !== systemLabelKey && !isEnglishFallback
        ? systemLabel
        : localize(`DQP.Traits.${labelKey}`);
      return {
        key,
        icon,
        label,
        shortLabel: label.slice(0, 3).toUpperCase(),
        displayValue: value >= 0 ? `+${value}` : `${value}`,
        rollLabel: localize("DQP.Traits.Roll", { trait: label }),
      };
    });

    const itemViews = actor.items.map((item) => this.itemData(item, actor));
    const actionable = itemViews.filter((item) => item.usable);
    const actionItems = actionable.filter((item) => {
      if (item.type === "weapon") return item.equipped;
      if (item.type === "domainCard") return !item.inVault || item.vaultActive;
      return ["feature", "consumable", "loot"].includes(item.type);
    });

    const domainCards = itemViews.filter((item) => item.type === "domainCard");
    const features = itemViews.filter((item) => item.type === "feature");
    const loadout = domainCards.filter((item) => !item.inVault);
    const equipped = actor.items.filter(item => item.system.equipped && (item.type === "weapon" || item.usable))
      .sort((a, b) => (a.type === "weapon" ? Number(Boolean(a.system.secondary)) : 2) - (b.type === "weapon" ? Number(Boolean(b.system.secondary)) : 2))
      .map(item => this.itemData(item, actor));
    if (actor.system.usesUnarmed && actor.system.attack) {
      const attack = actor.system.attack;
      equipped.unshift({ id: "dqp-unarmed", type: "attack", name: localize(attack.name), img: attack.img,
        meta: actionLabels(attack).join(" · "),
        primaryAction: "use-unarmed", primaryIcon: "fa-solid fa-play", primaryLabel: localize(attack.name),
        detailsLabel: localize("DQP.Actor.OpenSheet") });
    }
    const loadoutGroup = this.groupData("play-loadout", "DQP.Play.Loadout", loadout);
    loadoutGroup.countLabel = `${loadout.length}/${this.loadoutLimit(actor)}`;
    loadoutGroup.dropTarget = "loadout";
    const vaultGroup = this.groupData("play-vault", "DQP.Cards.Vault", domainCards.filter((item) => item.inVault));
    vaultGroup.dropTarget = "vault";
    const playGroups = [
      this.groupData("play-equipment", "DQP.Play.Equipment", equipped, true),
      loadoutGroup,
      vaultGroup,
    ].filter((group) => group.items.length);

    const actionGroups = [
      this.groupData("actions-weapons", "DQP.Actions.Weapons", actionItems.filter((item) => item.type === "weapon")),
      this.groupData("actions-cards", "DQP.Cards.Loadout", actionItems.filter((item) => item.type === "domainCard")),
      this.groupData("actions-features", "DQP.Actions.Features", actionItems.filter((item) => item.type === "feature")),
      this.groupData("actions-consumables", "DQP.Actions.Consumables", actionItems.filter((item) => ["consumable", "loot"].includes(item.type))),
    ].filter((group) => group.items.length);

    const abilityGroups = [
      this.groupData("library-features", "DQP.Cards.Feature", features),
    ].filter((group) => group.items.length);

    const gearGroups = ITEM_TYPE_ORDER.map((type) => this.groupData(`gear-${type}`, {
        weapon: "DQP.Gear.Weapons",
        armor: "DQP.Gear.Armor",
        consumable: "DQP.Gear.Consumables",
        loot: "DQP.Gear.Loot",
      }[type], itemViews.filter((item) => item.type === type))).filter((group) => group.items.length);
    const experiences = Object.entries(actor.system.experiences || {}).map(([id, experience]) => ({
      id, name: experience.name || localize("DQP.Experiences.Unnamed"),
      value: Number(experience.value) >= 0 ? `+${Number(experience.value) || 0}` : String(experience.value),
    }));
    const experienceKey = "experiences-list";
    const experienceLabel = localize("DQP.Experiences.Title");
    const experienceCollapsed = this.collapsedGroups.has(experienceKey);
    const experienceGroup = {
      key: experienceKey,
      label: experienceLabel,
      icon: "fa-solid fa-feather-pointed",
      collapsed: experienceCollapsed,
      toggleLabel: localize(experienceCollapsed ? "DQP.Group.Expand" : "DQP.Group.Collapse", { group: experienceLabel }),
    };
    const effectGroups = [
      ["active", "DQP.Effects.Active", true, "fa-solid fa-sparkles"],
        ["inactive", "DQP.Effects.Inactive", false, "fa-solid fa-circle-pause"],
    ].map(([id, labelKey, active, icon]) => {
      const key = `effects-${id}`;
      const label = localize(labelKey);
      const collapsed = this.collapsedGroups.has(key);
      return {
        id, key, label, icon, collapsed,
        effects: effectViews.filter((effect) => effect.active === active),
        toggleLabel: localize(collapsed ? "DQP.Group.Expand" : "DQP.Group.Collapse", { group: label }),
      };
    });

    return {
      ...context,
      actor: {
        id: actor.id,
        name: actor.name,
        img: actor.img,
        subtitle,
        classLabel: subtitle || "—",
        domainLabel,
        level,
        levelLabel: localize("DAGGERHEART.GENERAL.level"),
      },
      resources,
      traits,
      experiences,
      experienceGroup,
      effectGroups,
      stats: [
        { label: localize("DQP.Stats.Evasion"), value: actor.system.evasion ?? "—", icon: "fa-solid fa-feather-pointed" },
        { label: localize("DQP.Stats.Proficiency"), value: actor.system.proficiency ?? 0, icon: "fa-solid fa-star" },
      ],
      thresholds: this.thresholdData(actor),
      playGroups,
      actionGroups,
      abilityGroups,
      gearGroups,
    };
  }

  renderFailure(error) {
    if (!this.root) return;
    const title = escapeHTML(localize("DQP.Warnings.RenderFailed"));
    const retry = escapeHTML(localize("DQP.Warnings.Retry"));
    const detail = escapeHTML(`${error?.name || "Error"}: ${error?.message || "Unknown render error"}`);
    this.lastRenderError = error;
    this.root.innerHTML = `<section class="dqp-shell has-no-actor dqp-render-failure" aria-live="polite">
      <section class="dqp-no-actor"><strong>${title}</strong>
        <code class="dqp-render-error">${detail}</code>
        <button type="button" class="dqp-retry-render" data-action="retry-render"><i class="fa-solid fa-rotate-right" inert></i><span>${retry}</span></button>
      </section>
    </section>`;
    this.applyTheme();
    this.applyPlacement();
    this.applyScale();
    this.observeLayout();
    document.body.classList.add("dqp-bottom-hud-active");
  }

  prepareGenericContext(context, actor, token) {
    const system = actor.system || {};
    const translatedType = localize(`TYPES.Actor.${actor.type}`);
    const typeLabel = translatedType === `TYPES.Actor.${actor.type}` ? actor.type : translatedType;
    const stats = [];
    if (system.difficulty != null && system.difficulty !== "") {
      stats.push({label: localize("DQP.Adversary.Difficulty"), value: system.difficulty, icon: "fa-solid fa-dice-d20"});
    }
    if (system.evasion != null && system.evasion !== "") {
      stats.push({label: localize("DQP.Stats.Evasion"), value: system.evasion, icon: "fa-solid fa-feather-pointed"});
    }
    if (system.tier != null && system.tier !== "") {
      stats.push({label: localize("DQP.Adversary.Tier", {tier: system.tier}), value: system.tier, icon: "fa-solid fa-star"});
    }
    const level = system.levelData?.level?.changed ?? system.levelData?.level?.current ?? system.level;
    if (level != null && level !== "") {
      stats.push({label: localize("DAGGERHEART.GENERAL.level"), value: level, icon: "fa-solid fa-arrow-up"});
    }
    const resources = [
      ["hitPoints", "system.resources.hitPoints.value", "DQP.Resources.HitPoints", "fa-solid fa-heart-crack", system.resources?.hitPoints],
      ["stress", "system.resources.stress.value", "DQP.Resources.Stress", "fa-solid fa-brain", system.resources?.stress],
      ["hope", "system.resources.hope.value", "DQP.Resources.Hope", "fa-solid fa-diamond", system.resources?.hope],
      ["armor", "system.armorScore.value", "DQP.Resources.Armor", "fa-solid fa-shield-halved", system.armorScore],
    ].filter(([, , , , resource]) => Number(resource?.max) > 0)
      .map(([key, path, label, icon, override]) => this.resourceData(actor, key, path, label, icon, override));
    const detail = actor.type === "environment" ? system.impulses : actor.type === "npc" ? system.motives : "";
    const detailLabel = actor.type === "environment" ? localize("DQP.Generic.Impulses") : localize("DQP.Generic.Motives");
    const partyMembers = actor.type === "party" ? asArray(system.partyMembers).map((member) => ({
      id: member.id,
      uuid: member.uuid,
      name: member.name,
      img: member.img,
    })) : [];
    const effects = this.applicableEffects(actor).filter((effect) => effect?.id && !effect.disabled && !effect.isSuppressed)
      .map((effect) => ({
        key: effect.uuid || effect.id,
        name: effect.name || localize("DQP.Effects.Unnamed"),
        img: effect.img || "icons/svg/aura.svg",
        description: plainText(effect.description || effect.parent?.system?.description, Infinity),
      }));
    const experiences = Object.entries(system.experiences || {}).map(([id, experience]) => ({
      id,
      name: experience.name || localize("DQP.Experiences.Unnamed"),
      value: Number(experience.value) >= 0 ? `+${Number(experience.value) || 0}` : String(experience.value),
      description: plainText(experience.description, Infinity),
    }));
    const items = asArray(actor.items).filter((item) => item?.system)
      .map((item) => this.itemData(item, actor));
    const attack = typeof system.attack?.use === "function" ? this.adversaryAttackData(actor) : null;
    return {
      ...context,
      isGeneric: true,
      isCompact: true,
      actor: null,
      generic: {
        id: actor.id,
        name: actor.name,
        img: token?.document?.texture?.src || token?.texture?.src || actor.img,
        type: typeLabel,
        description: plainText(system.description, Infinity),
        detail: plainText(detail, Infinity),
        detailLabel,
        stats,
        resources,
        hasMechanics: Boolean(stats.length || resources.length),
        attack,
        items,
        experiences,
        effects,
        partyMembers,
      },
    };
  }

  prepareAdversaryContext(context, actor, token) {
    const systemLabel = (key, fallback) => {
      const translated = localize(key);
      return translated && translated !== key ? translated : fallback;
    };
    const type = String(actor.system.type || "adversary");
    const tier = Number(actor.system.tier || 1);
    const size = String(actor.system.size || "");
    const resources = [
      this.resourceData(actor, "hitPoints", "system.resources.hitPoints.value", "DQP.Resources.HitPoints", "fa-solid fa-heart-crack"),
      this.resourceData(actor, "stress", "system.resources.stress.value", "DQP.Resources.Stress", "fa-solid fa-bolt"),
    ].filter((resource) => resource.max > 0);
    const features = actor.items
      .filter((item) => item.type === "feature")
      .map((item) => this.itemData(item, actor));
    const experiences = Object.entries(actor.system.experiences || {}).map(([id, experience]) => ({
      id,
      name: experience.name || localize("DQP.Experiences.Unnamed"),
      value: Number(experience.value) >= 0 ? `+${Number(experience.value) || 0}` : String(experience.value),
      description: plainText(experience.description, Infinity),
    }));
    const effects = asArray(actor.effects)
      .filter((effect) => !effect.disabled && !effect.isSuppressed)
      .map((effect) => ({ id: effect.id, name: effect.name, img: effect.img }));
    const portrait = token?.document?.texture?.src || token?.texture?.src || actor.img;

    return {
      ...context,
      isAdversary: true,
      isCompact: true,
      actor: null,
      adversary: {
        id: actor.id,
        tokenId: token?.id || token?.document?.id || "",
        name: actor.name,
        img: portrait,
        tier: systemLabel(`DAGGERHEART.GENERAL.Tiers.${tier}`, localize("DQP.Adversary.Tier", { tier })),
        type: systemLabel(`DAGGERHEART.CONFIG.AdversaryType.${type}.label`, type),
        size: size ? systemLabel(`DAGGERHEART.CONFIG.TokenSize.${size}`, size) : "",
        description: plainText(actor.system.description, Infinity) || localize("DQP.Actions.NoDescription"),
        motives: plainText(actor.system.motivesAndTactics, Infinity) || "—",
        difficulty: actor.system.difficulty ?? "—",
        attackBonus: Number(actor.system.attack?.roll?.bonus || 0) >= 0
          ? `+${Number(actor.system.attack?.roll?.bonus || 0)}`
          : String(Number(actor.system.attack?.roll?.bonus || 0)),
        hordeHp: type === "horde" ? Number(actor.system.hordeHp || 0) : null,
        resources,
        thresholds: this.thresholdData(actor),
        attack: this.adversaryAttackData(actor),
        features,
        experiences,
        effects,
      },
    };
  }

  adversaryAttackData(actor) {
    const attack = actor.system.attack;
    if (!attack) return null;
    const range = attack.range
      ? (() => {
          const key = `DAGGERHEART.CONFIG.Range.${attack.range}.short`;
          const translated = localize(key);
          return translated !== key ? translated : String(attack.range);
        })()
      : "";
    const bonus = Number(attack.roll?.bonus || 0);
    const damage = this.actionDamageText(attack);
    const sourceName = attack.name || localize("DQP.Adversary.Attack");
    const attackName = localize(sourceName) || sourceName;
    return {
      name: attackName,
      img: attack.img || actor.img,
      meta: [bonus >= 0 ? `+${bonus}` : String(bonus), range, damage].filter(Boolean).join(" · "),
      damage,
      useLabel: localize("DQP.Adversary.UseAttack", { attack: attackName }),
    };
  }

  actionDamageText(action) {
    const value = action?.damage?.parts?.hitPoints?.value || action?.damage?.main?.value;
    if (!value) return "";
    if (value.custom?.enabled && value.custom.formula) return String(value.custom.formula);
    const dice = String(value.dice || "");
    const multiplier = Math.max(0, Number(value.flatMultiplier ?? 1));
    const bonus = Number(value.bonus || 0);
    const diceText = dice ? `${multiplier > 1 ? multiplier : ""}${dice}` : "";
    const bonusText = bonus ? `${diceText && bonus > 0 ? "+" : ""}${bonus}` : "";
    return `${diceText}${bonusText}`;
  }

  groupData(key, labelKey, items, preserveOrder = false, category = "") {
    const label = localize(labelKey);
    const collapsed = this.collapsedGroups.has(key);
    const icon = this.groupIcon(key, category);
    return {
      key,
      label,
      icon,
      countLabel: items.length,
      items: preserveOrder ? [...items] : [...items].sort((a, b) => Number(b.equipped) - Number(a.equipped) || a.name.localeCompare(b.name)),
      collapsed,
      toggleLabel: localize(collapsed ? "DQP.Group.Expand" : "DQP.Group.Collapse", { group: label }),
    };
  }

  groupIcon(key, category = "") {
    const kind = `${key} ${category}`.toLowerCase();
    if (kind.includes("equipment")) return "fa-solid fa-briefcase";
    if (kind.includes("loadout") || kind.includes("cards")) return "fa-solid fa-layer-group";
    if (kind.includes("vault")) return "fa-solid fa-box-archive";
    if (kind.includes("weapon")) return "fa-solid fa-swords";
    if (kind.includes("armor")) return "fa-solid fa-shield-halved";
    if (kind.includes("consumable")) return "fa-solid fa-flask";
    if (kind.includes("loot")) return "fa-solid fa-gem";
    if (kind.includes("ancestry")) return "fa-solid fa-dna";
    if (kind.includes("community")) return "fa-solid fa-people-group";
    if (kind.includes("companion")) return "fa-solid fa-paw";
    if (kind.includes("transformation")) return "fa-solid fa-wand-magic-sparkles";
    if (kind.includes("multiclass")) return "fa-solid fa-diagram-project";
    if (kind.includes("subclass")) return "fa-solid fa-shield-heart";
    if (kind.includes("class")) return "fa-solid fa-shield";
    return "fa-solid fa-sparkles";
  }

  loadoutLimit(actor) {
    let base = 5;
    try {
      const setting = CONFIG.DH?.SETTINGS?.gameSettings?.Homebrew;
      const value = game.system.settings?.homebrew?.maxLoadout
        ?? (setting ? game.settings.get(CONFIG.DH.id, setting)?.maxLoadout : undefined);
      const configured = value == null ? NaN : Number(value);
      if (Number.isFinite(configured)) base = configured;
    } catch (_error) { /* Fall back to the Daggerheart default. */ }
    return Math.max(0, base + Number(actor.system.bonuses?.maxLoadout || 0));
  }

  resourceData(actor, key, path, labelKey, icon, override) {
    const resource = override || foundry.utils.getProperty(actor, path.replace(/\.value$/, "")) || {};
    const max = Math.max(0, Number(resource.max || 0));
    const marked = clamp(resource.value, 0, max);
    const value = key === "armor" ? max - marked : marked;
    const label = localize(labelKey);
    return {
      key,
      isArmor: key === "armor",
      path,
      icon,
      label,
      value,
      max,
      pips: Array.from({ length: max }, (_, index) => {
        const pipValue = index + 1;
        return {
          value: pipValue,
          active: pipValue <= value,
          label: localize("DQP.Resources.Set", { resource: label, value: pipValue }),
        };
      }),
    };
  }

  thresholdData(actor) {
    const major = Number(actor.system.damageThresholds?.major);
    const severe = Number(actor.system.damageThresholds?.severe);
    if (!Number.isFinite(major) || !Number.isFinite(severe)) {
      return [
        { label: localize("DQP.Stats.Minor"), value: "—" },
        { label: localize("DQP.Stats.Major"), value: "—" },
        { label: localize("DQP.Stats.Severe"), value: "—" },
      ];
    }
    const majorRange = severe - major > 1 ? `${major}–${severe - 1}` : `${major}`;
    return [
      { label: localize("DQP.Stats.Minor"), value: `< ${major}` },
      { label: localize("DQP.Stats.Major"), value: majorRange },
      { label: localize("DQP.Stats.Severe"), value: `≥ ${severe}` },
    ];
  }

  costAmount(cost) {
    return Math.max(0, Number(cost?.total ?? (Number(cost?.value || 0) + Number(cost?.scale || 0) * Number(cost?.step || 1))) || 0);
  }

  costResourceLabel(key) {
    const labels = {
      stress: "DQP.Resources.Stress",
      hope: "DQP.Resources.Hope",
      hitPoints: "DQP.Resources.HitPoints",
      armor: "DQP.Resources.Armor",
      quantity: "DQP.Cost.Quantity",
      resource: "DQP.Cost.Charges",
      fear: "DQP.Cost.Fear",
    };
    return localize(labels[key] || key);
  }

  describeCosts(costs, actor) {
    const grouped = new Map();
    for (const cost of asArray(costs)) {
      if (cost?.enabled === false) continue;
      const amount = this.costAmount(cost);
      if (!amount) continue;
      grouped.set(cost.key, (grouped.get(cost.key) || 0) + amount);
    }
    const descriptions = [];
    const short = [];
    const icons = { stress: "⚡", hope: "◆", hitPoints: "♥", armor: "⬟", quantity: "×", resource: "●", fear: "◈" };
    for (const [key, amount] of grouped) {
      const label = this.costResourceLabel(key);
      if (key === "stress") {
        const stress = actor.system.resources?.stress || {};
        const available = Math.max(0, Number(stress.max || 0) - Number(stress.value || 0));
        if (amount > available) {
          descriptions.push(localize("DQP.Cost.Unavailable", {
            cost: `${amount} ${label}`,
            available,
          }));
          short.push(`${icons.stress}${amount}!`);
          continue;
        }
      }
      descriptions.push(`${amount} ${label}`);
      short.push(`${icons[key] || "•"}${amount}`);
    }
    return { description: descriptions.join(" + "), short: short.join(" ") };
  }

  itemCostPreview(item, actor) {
    if (item.type === "domainCard" && item.system.inVault) {
      const recallCost = Math.max(0, Number(item.system.recallCost || 0));
      if (!recallCost) return {
        full: localize("DQP.Cost.Recall", { cost: localize("DQP.Cost.Free") }),
        short: localize("DQP.Cost.FreeShort"),
      };
      const preview = this.describeCosts([{ key: "stress", value: recallCost }], actor);
      return { full: localize("DQP.Cost.Recall", { cost: preview.description }), short: preview.short };
    }

    const previews = itemActions(item)
      .map((action) => this.describeCosts(action.cost, actor))
      .filter((preview) => preview.description);
    const uniqueDescriptions = [...new Set(previews.map((preview) => preview.description))];
    if (!uniqueDescriptions.length) return { full: "", short: "" };
    return {
      full: localize("DQP.Cost.Action", { cost: uniqueDescriptions.join(" / ") }),
      short: previews[0]?.short || "",
    };
  }

  itemData(item, actor) {
    const actions = itemActions(item);
    const resource = item.system.resource;
    const attack = item.system.attack;
    const damage = attack?.damage?.parts?.hitPoints?.value || attack?.damage?.main?.value;
    const damageDice = damage?.custom?.enabled ? damage.custom.formula : damage?.dice;
    const damageBonus = Number(damage?.bonus || 0);
    const trait = attack?.roll?.trait;
    const range = attack?.range;
    const metaParts = [];

    if (trait) metaParts.push(localize(`DAGGERHEART.CONFIG.Traits.${trait}.short`));
    if (range) metaParts.push(localize(`DAGGERHEART.CONFIG.Range.${range}.short`));
    if (damageDice) metaParts.push(`${damageDice}${damageBonus ? ` + ${damageBonus}` : ""}`);
    if (item.type === "domainCard") {
      if (item.system.domainLabel) metaParts.push(item.system.domainLabel);
      if (item.system.level) metaParts.push(`Lv ${item.system.level}`);
    }

    let resourceText = "";
    if (resource) {
      if (resource.type === "die" || resource.dieFaces) resourceText = resource.dieFaces || "";
      else if (resource.max != null) resourceText = `${resource.value ?? 0}/${resource.max}`;
      else if (resource.value != null) resourceText = String(resource.value);
    } else if (item.system.quantity > 1) {
      resourceText = `×${item.system.quantity}`;
    }

    let badge = "";
    if (item.system.equipped) badge = localize("DQP.Gear.Equipped");
    else if (item.type === "domainCard" && item.system.inVault) badge = localize("DQP.Cards.InVault");

    const unavailableInVault = item.type === "domainCard" && item.system.inVault && !item.system.vaultActive;
    const usable = actions.length > 0 && !unavailableInVault && !(item.type === "domainCard" && item.system.isDomainTouchedSuppressed);
    const typeLabel = localize(`TYPES.Item.${item.type}`);
    const meta = metaParts.filter(Boolean).join(" · ") || typeLabel;
    const costPreview = this.itemCostPreview(item, actor);

    return {
      id: item.id,
      uuid: item.uuid,
      type: item.type,
      name: item.name,
      img: item.img,
      meta,
      resource: resourceText,
      badge,
      equipped: Boolean(item.system.equipped),
      equippable: ["weapon", "armor"].includes(item.type),
      equipLabel: localize(item.system.equipped ? "DQP.Gear.Unequip" : "DQP.Gear.Equip"),
      inVault: Boolean(item.system.inVault),
      vaultActive: Boolean(item.system.vaultActive),
      vaultable: item.type === "domainCard",
      vaultLabel: localize(item.system.inVault ? "DQP.Cards.ToLoadout" : "DQP.Cards.ToVault"),
      vaultTooltip: item.type === "domainCard" && item.system.inVault
        ? `${localize("DQP.Cards.ToLoadout")} · ${costPreview.full}`
        : localize("DQP.Cards.ToVault"),
      vaultIcon: item.system.inVault ? "fa-solid fa-arrow-up" : "fa-solid fa-arrow-down",
      costPreview: costPreview.full,
      costShort: costPreview.short,
      usable,
      useLabel: localize("DQP.Actions.Use", { item: item.name }),
      detailsLabel: localize("DQP.Actions.Details", { item: item.name }),
      primaryAction: usable ? "use-item" : "open-item",
      primaryLabel: localize(usable ? "DQP.Actions.Use" : "DQP.Actions.Details", { item: item.name }),
      primaryIcon: usable ? "fa-solid fa-play" : "fa-solid fa-circle-info",
    };
  }

  toggleUtilityDock(target) {
    const controls = this.root?.querySelector(".dqp-utility-controls");
    if (!controls) return;
    const open = !this.utilityDockOpen;
    const wasHidden = controls.hidden;
    const computed = wasHidden ? null : window.getComputedStyle(controls);
    const fromHeight = wasHidden ? 0 : (Number.parseFloat(computed.height) || 0);
    const fromOpacity = wasHidden ? 0 : (Number.parseFloat(computed.opacity) || 0);
    const fromTransform = wasHidden ? "translateY(7px) scale(.97)" : computed.transform;
    this.utilityAnimation?.cancel();
    this.utilityAnimation = null;

    this.utilityDockOpen = open;
    target.setAttribute("aria-expanded", String(open));
    target.classList.toggle("is-active", open);
    if (open) {
      controls.hidden = false;
      controls.inert = false;
      controls.setAttribute("aria-hidden", "false");
    } else {
      this.hideActorControls();
      this.hideThemeControls();
      this.hideScaleControls();
      controls.inert = true;
      controls.setAttribute("aria-hidden", "true");
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      controls.hidden = !open;
      this.scheduleLayout();
      return;
    }
    const toHeight = open ? controls.scrollHeight : 0;
    controls.style.overflow = "hidden";
    controls.style.pointerEvents = "none";
    const animation = controls.animate([
      { height: `${fromHeight}px`, opacity: fromOpacity, transform: fromTransform },
      { height: `${toHeight}px`, opacity: open ? 1 : 0,
        transform: open ? "translateY(0) scale(1)" : "translateY(7px) scale(.97)" }
    ], {
      duration: open ? 280 : 220,
      easing: open ? "cubic-bezier(.18,.85,.25,1)" : "cubic-bezier(.4,0,1,1)",
      fill: "forwards"
    });
    this.utilityAnimation = animation;
    this.scheduleLayout();
    void animation.finished.then(() => {
      if (this.utilityAnimation !== animation) return;
      this.utilityAnimation = null;
      if (!open) controls.hidden = true;
      controls.style.overflow = "";
      controls.style.pointerEvents = "";
      animation.cancel();
      this.scheduleLayout();
    }).catch(() => {});
  }

  async rollTraitFromHud(actor, trait, event) {
    const native = sheetAction(actor, "rollAttribute");
    if (native) {
      const button = document.createElement("button");
      button.dataset.attribute = trait;
      // Let the installed system own its cost, Hope/Fear and critical rules.
      // Never retry after a native handler starts: it may already have rolled.
      return native.handler.call(native.sheet, event, button);
    }
    const result = await actor.rollTrait(trait, {event});
    if (!result) return result;

    // CharacterSheet#rollAttribute commits the native roll's resource updates;
    // Actor#rollTrait by itself only builds the result and chat message.
    const updates = result.resourceUpdates;
    if (typeof updates?.updateResources !== "function") return result;
    const costs = asArray(result.costs).filter((cost) => cost?.enabled)
      .map((cost) => ({
        ...cost,
        value: -cost.value,
        // Daggerheart 2.2.6 also tracks the total cost; 2.10.5 omits it.
        ...(cost.total == null ? {} : {total: -cost.total}),
      }));
    updates.addResources?.(costs);
    await updates.updateResources();
    return result;
  }

  async onClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target || !this.root?.contains(target)) return;
    const action = target.dataset.action;

    this.hidePreview();

    if (action === "retry-render") return this.render();
    if (action === "toggle-hud") return this.toggleHud(target);
    if (action === "toggle-utilities") return this.toggleUtilityDock(target);
    if (action === "toggle-scale") {
      const controls = this.root.querySelector(".dqp-scale-controls");
      if (controls.hidden) {
        this.hideActorControls();
        this.hideThemeControls();
        controls.hidden = false;
        target.setAttribute("aria-expanded", "true");
      } else this.hideScaleControls();
      return;
    }
    if (action === "set-scale") {
      const current = Number(game.settings.get(MODULE_ID, "hudScale")) || 100;
      const next = target.dataset.scale === "reset" ? 100 : clamp(current + Number(target.dataset.scale), 75, 125);
      await game.settings.set(MODULE_ID, "hudScale", next);
      return this.applyScale();
    }
    if (action === "set-placement") {
      if (!HUD_PLACEMENTS.some(([id]) => id === target.dataset.placement)) return;
      await game.settings.set(MODULE_ID, "hudPlacement", target.dataset.placement);
      return this.applyPlacement();
    }
    if (action === "toggle-theme") {
      const controls = this.root.querySelector(".dqp-theme-controls");
      if (controls.hidden) {
        this.hideActorControls();
        this.hideScaleControls();
        controls.hidden = false;
        target.setAttribute("aria-expanded", "true");
      } else this.hideThemeControls();
      return;
    }
    if (action === "set-theme") {
      if (!HUD_THEMES.some(([id]) => id === target.dataset.theme)) return;
      await game.settings.set(MODULE_ID, "hudTheme", target.dataset.theme);
      this.applyTheme();
      return this.hideThemeControls();
    }
    if (action === "toggle-actor-switcher") {
      const controls = this.root.querySelector(".dqp-actor-switcher-controls");
      if (!controls) return;
      if (controls.hidden) {
        this.hideScaleControls();
        this.hideThemeControls();
        controls.hidden = false;
        target.setAttribute("aria-expanded", "true");
      } else this.hideActorControls();
      return;
    }
    if (action === "set-actor") {
      const selected = this.actors.find((candidate) => candidate.id === target.dataset.actorId);
      if (!selected) return this.render();
      this.hideActorControls();
      this.manualActorOverride = true;
      await game.settings.set(MODULE_ID, "selectedActorId", selected.id);
      this.collapsedGroups = new Set();
      return this.render();
    }
    if (action === "toggle-column") return this.toggleColumn(target.dataset.column);
    if (action === "set-tab") {
      const nextTab = target.dataset.tab || "core";
      this.unrollPane = nextTab !== this.activeTab;
      this.activeTab = nextTab;
      if (!game.settings.get(MODULE_ID, "workspaceOpen")) await this.toggleColumn("workspace");
      return this.render();
    }
    if (action === "toggle-group") {
      const key = target.dataset.group;
      if (this.collapsedGroups.has(key)) this.collapsedGroups.delete(key);
      else this.collapsedGroups.add(key);
      return this.render();
    }
    const actor = this.activeActor;
    if (!actor) return;
    if (action === "use-adversary-attack" && actor.type === "adversary" && actor.isOwner
      && typeof actor.system.attack?.use === "function") {
      return this.withLock(`adversary-attack:${actor.uuid || actor.id}`, target, () => actor.system.attack.use(event));
    }
    if (action === "use-generic-attack" && actor.type === "companion" && actor.isOwner
      && typeof actor.system.attack?.use === "function") {
      return this.withLock(`companion-attack:${actor.uuid || actor.id}`, target, () => actor.system.attack.use(event));
    }
    if (action === "open-member" && actor.type === "party") {
      const uuid = target.dataset.uuid;
      const member = asArray(actor.system.partyMembers).find((candidate) => candidate.uuid === uuid);
      if (member) return member.sheet.render({force: true});
    }
    if (action === "use-unarmed" && actor.isOwner && actor.system.usesUnarmed) return this.withLock(`unarmed:${actor.id}`, target, () => actor.system.attack.use(event));
    if (action === "open-sheet") return actor.sheet.render({ force: true });
    if (action === "level-up") return this.openLevelUp(actor, target);
    if (action === "show-experience") return this.showExperience(actor, target);
    if (action === "share-effect") return this.shareEffect(actor, target);
    if (action === "toggle-effect") return this.setEffectActive(actor, target.dataset.effectKey, target.dataset.effectTarget === "active", target);
    if (action === "roll-trait") return this.withLock(`trait:${target.dataset.trait}`, target,
      () => this.rollTraitFromHud(actor, target.dataset.trait, event));
    if (action === "adjust-resource") return this.adjustResource(actor, target, -1);
    if (action === "set-resource") return this.setResource(actor, target);
    if (action === "use-item") return this.useItem(actor, target.dataset.itemId, event, target);
    if (action === "toggle-vault") return this.toggleVault(actor, target.dataset.itemId, event, target);
    if (action === "toggle-equip") return this.toggleEquip(actor, target, event);
    if (action === "open-item") return (target.dataset.itemId === "dqp-unarmed" ? actor : actor.items.get(target.dataset.itemId))?.sheet.render({ force: true });
    if (action === "downtime") return this.openDowntime(actor, target.dataset.rest, target);
  }

  applyScale() {
    const scale = clamp(Number(game.settings.get(MODULE_ID, "hudScale")) || 100, 75, 125);
    this.root.style.setProperty("--dqp-scale", scale / 100);
    document.body.style.setProperty("--dqp-players-bottom", `${Math.round(30 + 208 * scale / 100)}px`);
    const output = this.root.querySelector('[data-scale="reset"]');
    if (output) output.textContent = `${scale}%`;
    for (const button of this.root.querySelectorAll('[data-action="set-scale"]')) {
      button.disabled = (button.dataset.scale === "-5" && scale === 75) || (button.dataset.scale === "5" && scale === 125);
    }
    this.positionHud();
  }

  applyTheme() {
    if (!this.root) return;
    const selected = game.settings.get(MODULE_ID, "hudTheme") || "daggerheart";
    const theme = HUD_THEMES.some(([id]) => id === selected) ? selected : "daggerheart";
    this.root.dataset.theme = theme;
    for (const button of this.root.querySelectorAll('[data-action="set-theme"]')) {
      const active = button.dataset.theme === theme;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }
}

import test from "node:test";
import assert from "node:assert/strict";
import { actionLabels, asArray, itemActions, sheetAction, systemActionType } from "../scripts/helpers.js";

globalThis.game = { system: { api: {} }, i18n: { localize: key => key } };

test("unarmed labels accept arrays, methods with their receiver, sets and typed records", () => {
  const expected = ["Melee", "1d4"];
  assert.deepEqual(actionLabels({ _getLabels: ["Melee", { value: "1d4" }] }), expected);
  assert.deepEqual(actionLabels({ range: "Melee", _getLabels() { return [this.range, { value: "1d4" }]; } }), expected);
  assert.deepEqual(actionLabels({ _getLabels: new Set(expected) }), expected);
  assert.deepEqual(actionLabels({ _getLabels: { range: "Melee", damage: { value: "1d4" } } }), expected);
  assert.deepEqual(actionLabels({ _getLabels: { value: "1d4" } }), ["1d4"]);
});

test("missing or invalid labels remain optional presentation data", () => {
  for (const result of [undefined, null, false, 42, [null, {}, false]]) {
    assert.deepEqual(actionLabels({ _getLabels: () => result }), []);
  }
  assert.deepEqual(actionLabels({}), []);
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    assert.deepEqual(actionLabels({ get _getLabels() { throw new TypeError("Changed getter"); } }), []);
    assert.deepEqual(actionLabels({ _getLabels() { throw new TypeError("Changed damage fields"); } }), []);
    assert.equal(warnings.length, 2);
  } finally { console.warn = original; }
});

test("actions normalize old arrays and new collections without reviving intentionally hidden actions", () => {
  const action = { id: "attack", use() {} };
  for (const actionsList of [[action], new Map([[action.id, action]]), new Set([action]), { attack: action }]) {
    assert.deepEqual(itemActions({ system: { actionsList } }), [action]);
  }
  assert.deepEqual(itemActions({ system: { actionsList: [], attack: action, actions: [action] } }), []);
  assert.deepEqual(itemActions({ system: { attack: action } }), [action]);
  assert.deepEqual(itemActions({}), []);
  assert.deepEqual(asArray("Melee"), ["Melee"]);
});

test("native sheet actions support functions, handler descriptors and default options", async () => {
  async function handler(event, button) { return [this.document.id, event.type, button.dataset.attribute]; }
  for (const actions of [{ rollAttribute: handler }, { rollAttribute: { handler } }, new Map([["rollAttribute", { handler }]])]) {
    const actor = { sheet: { document: { id: "hero" }, options: { actions } } };
    const native = sheetAction(actor, "rollAttribute");
    assert.deepEqual(await native.handler.call(native.sheet, { type: "click" }, { dataset: { attribute: "agility" } }), ["hero", "click", "agility"]);
  }
  const actor = { sheet: { constructor: { DEFAULT_OPTIONS: { actions: { rollAttribute: handler } } } } };
  assert.equal(sheetAction(actor, "rollAttribute").handler, handler);
  assert.equal(sheetAction(actor, "missing"), null);
  assert.equal(sheetAction({ sheet: null }, "rollAttribute"), null);
});

test("Effect action resolves either published API namespace, including partial APIs", () => {
  class OldEffect {}
  class NewEffect {}
  game.system.api = { models: { actions: { actionsTypes: { effect: OldEffect } } } };
  assert.equal(systemActionType("effect"), OldEffect);
  game.system.api.data = { actions: { actionsTypes: {} } };
  assert.equal(systemActionType("effect"), OldEffect);
  game.system.api.data.actions.actionsTypes.effect = NewEffect;
  assert.equal(systemActionType("effect"), NewEffect);
  game.system.api = {};
  assert.equal(systemActionType("effect"), undefined);
});

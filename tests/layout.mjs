import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const foundry = process.env.FOUNDRY_APP || 'C:/Program Files/Foundry Virtual Tabletop/resources/app';
const runtime = process.env.PLAYWRIGHT_PATH || `${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const { chromium } = require(runtime);
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const runtimeSource = [
  read('scripts/helpers.js'),
  read('scripts/panel-base.js'),
  read('scripts/main.js'),
].map(source => source.replace(/^import .*?;\r?\n/gm, '').replace(/^export /gm, '')).join('\n');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const output = process.env.DQP_TEST_OUTPUT || path.join(root, 'tests', 'output');
fs.mkdirSync(output, { recursive: true });
try {
  await page.setContent('<html><head></head><body style="margin:0;background:#34383c"><aside id="players"><ol id="players-inactive"></ol><div id="players-active"><ol class="players-list"><li class="player">GM</li><li class="player">Player</li></ol><div id="performance-stats"><span id="latency">7ms</span><span id="fps">60</span><button id="players-expand"></button></div></div></aside><div id="hotbar">Macros</div><div id="dqp-root"></div></body></html>');
  await page.addStyleTag({path:path.join(foundry,'public/css/foundry2.css')});
  await page.addScriptTag({ path: path.join(foundry, 'node_modules/handlebars/dist/handlebars.js') });
  const fa = fs.readFileSync(path.join(foundry, 'public/fonts/fontawesome/css/all.min.css'), 'utf8');
  const font = fs.readFileSync(path.join(foundry, 'public/fonts/fontawesome/webfonts/fa-solid-900.woff2')).toString('base64');
  await page.addStyleTag({ content: fa + `\n@font-face {font-family:'Font Awesome 7 Pro';font-style:normal;font-weight:900;src:url(data:font/woff2;base64,${font}) format('woff2');}` });
  await page.addStyleTag({ content: read('styles/panel.css') });
  await page.evaluate(({ source, template, adversaryTemplate, genericTemplate, partial, en, ru, portrait }) => {
    const get = (object, key) => key.split('.').reduce((value, part) => value?.[part], object);
    window.languagePacks={en,ru};
    const settings = new Map([...['hudEnabled', 'characterOpen', 'traitsOpen', 'workspaceOpen', 'diceTrayCollapsed'].map(key => [key, true]), ['hudPlacement', 'center'], ['characterWidth', 88]]);
    window.calls = [];
    window.testPortrait = portrait;
    window.canvas = { tokens: { controlled: [] } };
    const item = { id:'a1', name:'Deft Maneuvers', type:'domainCard', img:portrait, system:{ actionsList:[{cost:[{key:'stress',value:2,enabled:true}]}], domainLabel:'Bone', level:1, description:'A ready ability.', async toggleVault(_event,toVault,isRecall){calls.push(`vault:${toVault}:${isRecall}`);this.inVault=toVault;} }, use:async () => calls.push('item'), sheet:{render:() => calls.push('item-sheet')} };
    const items = Array.from({length:6}, (_, index) => ({...item, id:`a${index+1}`, name:index ? `Ability ${index+1}` : item.name, system:{...item.system,inVault:index>=3}}));
    items.push({...item,id:'f1',name:'Battle Ready',type:'feature'});
    items.get = id => items.find(item => item.id === id);
    window.actor = { id:'test', type:'character', name:'Vale', img:portrait, isOwner:true, items, system:{
      class:{value:{name:'Brawler'},subclass:{name:'Martial Artist'}}, level:1,
      resources:{ hitPoints:{value:4,max:6},stress:{value:3,max:6},hope:{value:5,max:6} },
      armorScore:{value:1,max:3},updateArmorValue:async change=>calls.push({armorDelta:change.value}),evasion:11,proficiency:1,damageThresholds:{major:7,severe:14},
      traits:Object.fromEntries(['agility','strength','finesse','instinct','presence','knowledge'].map((key,index) => [key,{value:[1,1,0,2,0,-1][index]}])),
      experiences:{e1:{name:'Streetwise',value:2,description:'You know the hidden paths through the city.'}}
    }, rollTrait:async trait => calls.push(`trait:${trait}`), update:async update => calls.push(update), sheet:{render:() => calls.push('sheet')} };
    actor.effects=[
      {id:'effect-active',uuid:'Actor.test.ActiveEffect.effect-active',type:'base',name:'Focused',description:'Stay calm and focused.',img:portrait,disabled:false,isSuppressed:false,get active(){return !this.disabled&&!this.isSuppressed;},async update(changes){Object.assign(this,changes);calls.push(`effect:${this.id}:${this.disabled}`);},sheet:{render:()=>calls.push('effect-sheet:active')}},
      {id:'effect-inactive',uuid:'Actor.test.ActiveEffect.effect-inactive',type:'base',name:'Hidden',description:'Remain unseen in the shadows.',img:portrait,disabled:true,isSuppressed:false,get active(){return !this.disabled&&!this.isSuppressed;},async update(changes){Object.assign(this,changes);calls.push(`effect:${this.id}:${this.disabled}`);},sheet:{render:()=>calls.push('effect-sheet:inactive')}}
    ];
    actor.allApplicableEffects=()=>actor.effects;
    class Downtime {
      constructor(actor,short) { this.short=short; }
      render() { calls.push(this.short?'short-rest':'long-rest'); }
    }
    class CharacterSettings {
      constructor({document}) { calls.push(`experience-editor:${document.id}`); }
      async render() {}
      changeTab(tab,group) { calls.push(`experience-tab:${group}:${tab}`); }
    }
    const CostField = {
      getRealCosts(costs) { return costs.filter(cost => cost.enabled !== false).map(cost => ({...cost})); },
      hasCost(costs) {
        const resources = actor.system.resources;
        return CostField.getRealCosts(costs).every(cost => {
          const resource = resources[cost.key];
          if (!resource) return true;
          const amount = Number(cost.total ?? cost.value ?? 0);
          return resource.isReversed ? resource.value + amount <= resource.max : resource.value >= amount;
        });
      }
    };
    actor.system.resources.stress.isReversed = true;
    actor.system.resources.hitPoints.isReversed = true;
    window.game = {
      system:{id:'daggerheart',api:{applications:{dialogs:{Downtime},sheetConfigs:{CharacterSettings}},fields:{ActionFields:{CostField}}}},
      user:{isGM:false,character:actor}, actors:[actor], modules:new Map(),
      i18n:{lang:'en',translations:structuredClone(en),localize:key => get(game.i18n.translations,key) || key,format:(key,data) => (get(game.i18n.translations,key)||key).replace(/\{(\w+)\}/g,(_,k)=>data[k])},
      settings:{get:(_,key)=>settings.get(key),set:async (_,key,value)=>settings.set(key,value)}
    };
    window.Hooks={once:()=>{},on:()=>{}};
    window.ui={notifications:{warn:message=>calls.push(`warn:${message}`),error:message=>{throw new Error(message);},info:()=>{}}};
    Handlebars.registerHelper('localize',key=>game.i18n.localize(key));
    Handlebars.registerPartial('modules/daggerheart-quick-panel/templates/partials/item-row.hbs',partial);
    window.chatMessages=[];
    window.confirmAnswer=false;
    window.actorPromptSelection=null;
    window.actorPromptCount=0;
    window.CONFIG={ChatMessage:{documentClass:{getSpeaker:({actor})=>({actor:actor.id,alias:actor.name}),create:async data=>chatMessages.push(data)}}};
    window.foundry={utils:{getProperty:get,deepClone:value=>structuredClone(value)},applications:{api:{DialogV2:{confirm:async options=>{window.lastConfirmation=options;return window.confirmAnswer;},prompt:async options=>{window.lastActorPrompt=options;window.actorPromptCount++;return window.actorPromptSelection;}}},handlebars:{renderTemplate:async(path,context)=>Handlebars.compile(String(path).includes('adversary-panel')?adversaryTemplate:String(path).includes('generic-panel')?genericTemplate:template)(context)}}};
    window.fetch=async url=>({ok:true,status:200,json:async()=>structuredClone(String(url).includes('/ru.json')?ru:en)});
    (0,eval)(source+'\nwindow.TestPanel = DaggerheartQuickPanel;');
    const costContext = {actor};
    actor.system.resources.stress.value = 5;
    if (CostField.hasCost.call(costContext,[{key:'stress',value:2,total:2,enabled:true}])) throw new Error('Native mock must reject 5/6 Stress + 2');
    actor.system.resources.stress.value = 3;
    window.panel = new TestPanel();
    panel.root=document.querySelector('#dqp-root');
    panel.bindEvents();
    document.body.classList.add('dqp-bottom-hud-active');
    panel.setupPlayersPanel();
    window.testSettings=settings;
    return panel.render();
  }, {source:runtimeSource,template:read('templates/panel.hbs'),adversaryTemplate:read('templates/adversary-panel.hbs'),genericTemplate:read('templates/generic-panel.hbs'),partial:read('templates/partials/item-row.hbs'),en:JSON.parse(read('lang/en.json')),ru:JSON.parse(read('lang/ru.json')),portrait:'data:image/svg+xml;base64,'+fs.readFileSync(path.join(foundry,'public/icons/svg/mystery-man.svg')).toString('base64')});

  assert.equal(await page.locator('.dqp-hud-toggle').isVisible(),true);
  assert.equal(await page.locator('.dqp-shell').count(),1);
  assert.equal(await page.locator('.dqp-character-title span').textContent(),'Bone');
  assert.equal(await page.locator('.dqp-thresholds').count(),0);
  assert.deepEqual(await page.locator('.dqp-vitals .dqp-resource-name').allTextContents(),['Hit Points','Stress','Hope','Armor']);
  assert.deepEqual(await page.locator('.dqp-defense-stats span').allTextContents(),['Evasion','Proficiency']);
  assert.equal(await page.locator('.dqp-vitals > .dqp-resource .dqp-pips').count(),4);
  assert.equal(await page.locator('.dqp-resource--armor .dqp-pip').count(),3);
  assert(await page.locator('.dqp-column--character').evaluate(el=>el.getBoundingClientRect().width)
    < await page.locator('.dqp-column--traits').evaluate(el=>el.getBoundingClientRect().width),'Character ribbon must be narrower');
  await page.locator('.dqp-resource--armor').hover();
  await page.waitForSelector('.dqp-threshold-preview');
  const thresholdsText=await page.locator('.dqp-threshold-preview').innerText();
  for(const label of ['Minor','Major','Severe']) assert(thresholdsText.includes(label),`Missing threshold ${label}`);
  await page.screenshot({path:path.join(output,'threshold-hover.png')});
  await page.evaluate(()=>panel.hidePreview());
  // System updates may change the sheet's private grouping helper. The player
  // HUD must keep rendering from actor items instead of disappearing.
  await page.evaluate(async()=>{
    actor.sheet._prepareFeaturesContext=async()=>{throw new Error('Changed Daggerheart sheet API');};
    await panel.render();
  });
  assert.equal(await page.locator('.dqp-shell').count(),1);
  await page.locator('[data-tab="abilities"]').click();
  assert(await page.locator('[data-group-key="library-features"] [data-item-id="f1"]').count()>0,'Feature fallback must survive a changed sheet API');
  const ribbonScroller=page.locator('.dqp-ribbon-scroll');
  await ribbonScroller.evaluate(element=>{element.querySelector('.dqp-ribbon-pane').style.minWidth='2200px';element.scrollLeft=0;});
  const ribbonBounds=await ribbonScroller.boundingBox();
  await page.mouse.move(ribbonBounds.x+Math.min(80,ribbonBounds.width/2),ribbonBounds.y+ribbonBounds.height/2);
  await page.mouse.wheel(0,240);
  await page.waitForFunction(()=>document.querySelector('.dqp-ribbon-scroll').scrollLeft>0);
  assert(await ribbonScroller.evaluate(element=>element.scrollLeft)>0,'Wheel must scroll the third-tab ribbon horizontally');
  await page.mouse.wheel(0,-240);
  await page.waitForFunction(()=>document.querySelector('.dqp-ribbon-scroll').scrollLeft===0);
  await page.evaluate(async()=>{delete actor.sheet._prepareFeaturesContext;panel.activeTab='core';await panel.render();});
  await page.evaluate(async()=>{
    window.originalPrepareContext=panel.prepareContext;
    panel.prepareContext=()=>{throw new TypeError('diagnostic render failure');};
    await panel.render();
  });
  assert((await page.locator('.dqp-render-error').textContent()).includes('TypeError: diagnostic render failure'));
  await page.evaluate(async()=>{panel.prepareContext=originalPrepareContext;await panel.render();});
  assert.equal(await page.locator('#hotbar').evaluate(el=>getComputedStyle(el).display),'none');
  const dockEyePosition=await page.locator('.dqp-hud-toggle').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};});
  await page.locator('.dqp-hud-toggle').click();
  await page.waitForFunction(()=>testSettings.get('hudEnabled')===false && !document.querySelector('.dqp-shell'));
  assert.equal(await page.evaluate(()=>testSettings.get('hudEnabled')),false);
  assert.equal(await page.locator('.dqp-shell').count(),0);
  assert.equal(await page.locator('.dqp-hud-toggle').isVisible(),true);
  const hiddenEyePosition=await page.locator('.dqp-hud-toggle').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};});
  for(const key of ['left','top','width','height']) assert(Math.abs(hiddenEyePosition[key]-dockEyePosition[key])<1,`Hidden HUD eye moved on ${key}`);
  assert.notEqual(await page.locator('#hotbar').evaluate(el=>getComputedStyle(el).display),'none');
  await page.evaluate(() => {
    const second={...actor,id:'test2',name:'Nyx',items:actor.items,system:actor.system,sheet:actor.sheet};
    game.actors.push(second);
    window.actorPromptSelection='test2';
  });
  await page.locator('.dqp-hud-toggle').click();
  await page.waitForFunction(()=>testSettings.get('hudEnabled')===true && document.querySelector('.dqp-shell'));
  assert.equal(await page.evaluate(()=>testSettings.get('hudEnabled')),true);
  assert.equal(await page.evaluate(()=>testSettings.get('selectedActorId')),'test2');
  assert.equal(await page.evaluate(()=>actorPromptCount),1);
  assert.equal(await page.locator('.dqp-shell').count(),1);
  await page.evaluate(async()=>{game.actors.pop();await game.settings.set('','selectedActorId','test');return panel.render();});

  assert.equal(await page.locator('[data-group-key="play-loadout"] .dqp-item-row').count(),3);
  assert.equal(await page.locator('[data-group-key="play-vault"] .dqp-item-row').count(),3);
  assert.equal(await page.locator('[data-group-key="play-loadout"] .dqp-inline-group-heading small').textContent(),'3/5');
  assert((await page.locator('[data-group-key="play-loadout"] [data-item-id="a1"] .dqp-item-cost').textContent()).includes('⚡2'));
  const utilityToggle = page.locator('[data-action="toggle-utilities"]');
  const gearBefore = await utilityToggle.evaluate(el=>el.getBoundingClientRect().bottom);
  assert.equal(await page.locator('.dqp-layer-dock').evaluate(el=>el.lastElementChild?.dataset.action),'toggle-utilities');
  assert.equal(await utilityToggle.getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('.dqp-utility-controls').isVisible(),false);
  await utilityToggle.click();
  assert.equal(await utilityToggle.getAttribute('aria-expanded'),'true');
  await page.waitForFunction(()=>document.querySelector('.dqp-utility-controls')?.getBoundingClientRect().height>75);
  assert.equal(await page.locator('.dqp-utility-controls').isVisible(),true);
  const gearAfter = await utilityToggle.evaluate(el=>el.getBoundingClientRect().bottom);
  assert(Math.abs(gearBefore-gearAfter)<1,'Gear must stay anchored at the bottom while tools expand upward');
  await page.locator('[data-action="toggle-theme"]').click();
  assert.equal(await page.locator('.dqp-theme-controls').isVisible(),true);
  await utilityToggle.click();
  await page.waitForFunction(()=>document.querySelector('.dqp-utility-controls')?.hidden);
  assert.equal(await page.locator('.dqp-utility-controls').isVisible(),false);
  assert.equal(await page.locator('.dqp-theme-controls').evaluate(el=>el.hidden),true);
  await utilityToggle.click();
  // Five client-local themes switch in place and preserve the HUD DOM.
  await page.evaluate(()=>{window.themeHud=document.querySelector('.dqp-columns');});
  const themeSurfaces=[];
  for (const theme of ['daggerheart','minimal','arcane','sacred','monochrome']) {
    if (theme !== 'daggerheart') {
      await page.locator('[data-action="toggle-theme"]').click();
      assert.equal(await page.locator('.dqp-theme-choice').count(),5);
      await page.locator(`.dqp-theme-choice[data-theme="${theme}"]`).click();
      await page.waitForFunction(theme=>document.querySelector('#dqp-root')?.dataset.theme===theme,theme);
    }
    assert.equal(await page.locator('#dqp-root').getAttribute('data-theme'),theme);
    assert(await page.evaluate(()=>themeHud===document.querySelector('.dqp-columns')),'Theme switch must preserve the HUD DOM');
    themeSurfaces.push(await page.locator('#dqp-root').evaluate(el=>getComputedStyle(el).getPropertyValue('--dqp-panel').trim()));
    await page.locator('.dqp-shell').screenshot({path:path.join(output,`theme-${theme}.png`)});
  }
  assert.equal(new Set(themeSurfaces).size,5,'Every theme must expose a distinct panel palette');
  await page.locator('[data-action="toggle-theme"]').click();
  await page.locator('.dqp-theme-choice[data-theme="daggerheart"]').click();
  assert.equal(await page.evaluate(()=>testSettings.get('hudTheme')),'daggerheart');
  // Placement is client-local and switches between screen center and a left-side dock without rebuilding.
  await page.evaluate(()=>{window.placementHud=document.querySelector('.dqp-columns');});
  await page.locator('[data-action="toggle-scale"]').click();
  await page.locator('[data-placement="side"]').click();
  assert.equal(await page.locator('#dqp-root').getAttribute('data-placement'),'side');
  assert(Math.abs(await page.locator('.dqp-shell').evaluate(el=>el.getBoundingClientRect().left)-18)<2,'Side HUD must anchor to the left safe margin');
  assert(await page.evaluate(()=>placementHud===document.querySelector('.dqp-columns')),'Placement switch must preserve the HUD DOM');
  await page.screenshot({path:path.join(output,'placement-side.png')});
  if (!await page.locator('[data-placement="center"]').isVisible()) {
    await page.locator('[data-action="toggle-scale"]').click();
  }
  await page.locator('[data-placement="center"]').click();
  assert.equal(await page.locator('#dqp-root').getAttribute('data-placement'),'center');
  assert(Math.abs(await page.locator('.dqp-shell').evaluate(el=>(el.getBoundingClientRect().left+el.getBoundingClientRect().right)/2)-960)<2,'Centered HUD must return to screen center');
  await page.locator('[data-action="toggle-scale"]').click();
  // Resource-only updates patch the numeric HUD without rebuilding it.
  await page.evaluate(()=>{
    window.originalHud=document.querySelector('.dqp-columns');
    actor.system.resources.stress.value=5;
    if(!panel.patchActorUpdate(actor,{system:{resources:{stress:{value:5}}}})) throw new Error('Stress update was not patched');
  });
  assert.equal(await page.locator('.dqp-resource--stress .dqp-resource-value').textContent(),'5/6');
  assert.equal(await page.locator('.dqp-resource--stress.is-marked').count(),1);
  assert.equal(await page.locator('.dqp-resource--stress .dqp-pip.is-active').count(),5);
  assert.equal(await page.locator('.dqp-vitals > .dqp-resource').count(),4);
  assert.equal(await page.locator('.dqp-resource--armor .dqp-resource-value').textContent(),'2/3');
  assert.equal(await page.locator('.dqp-defense .dqp-armor-slots').count(),0);
  assert((await page.locator('[data-item-id="a1"] .dqp-item-cost').first().textContent()).includes('!'));
  assert((await page.locator('[data-item-id="a1"] .dqp-item-cost').first().getAttribute('data-tooltip')).includes('unavailable'));
  assert(await page.evaluate(()=>originalHud===document.querySelector('.dqp-columns')),'Resource patch must preserve the HUD DOM');
  await page.evaluate(()=>{
    actor.system.resources.stress.value=3;
    panel.patchActorUpdate(actor,{system:{resources:{stress:{value:3}}}});
  });
  // Cards move between Vault and Loadout in place, with capacity feedback instead of a full rerender.
  await page.evaluate(()=>{
    window.draggedCard=document.querySelector('[data-group-key="play-vault"] [data-item-id="a4"]');
    const target=document.querySelector('[data-group-key="play-loadout"]');
    const dataTransfer=new DataTransfer();
    draggedCard.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer}));
    target.dispatchEvent(new DragEvent('dragover',{bubbles:true,dataTransfer}));
    target.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer}));
  });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>calls.at(-1)),'vault:false:true');
  assert.equal(await page.locator('[data-group-key="play-loadout"] .dqp-inline-group-heading small').textContent(),'4/5');
  assert(await page.evaluate(()=>draggedCard===document.querySelector('[data-group-key="play-loadout"] [data-item-id="a4"]')),'Vault move must preserve the card DOM');
  await page.evaluate(()=>{
    const target=document.querySelector('[data-group-key="play-vault"]');
    const dataTransfer=new DataTransfer();
    draggedCard.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer}));
    target.dispatchEvent(new DragEvent('dragover',{bubbles:true,dataTransfer}));
    target.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer}));
  });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>calls.at(-1)),'vault:true:false');
  assert.equal(await page.locator('[data-group-key="play-loadout"] .dqp-inline-group-heading small').textContent(),'3/5');
  await page.evaluate(async()=>{
    actor.items.get('a4').system.inVault=false;
    actor.items.get('a5').system.inVault=false;
    await panel.render();
  });
  await page.evaluate(()=>{
    const card=document.querySelector('[data-group-key="play-vault"] [data-item-id="a6"]');
    const target=document.querySelector('[data-group-key="play-loadout"]');
    const dataTransfer=new DataTransfer();
    card.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer}));
    target.dispatchEvent(new DragEvent('dragover',{bubbles:true,dataTransfer}));
    target.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer}));
  });
  await page.waitForTimeout(50);
  assert((await page.evaluate(()=>calls.at(-1))).includes('Loadout is full (5 cards)'));
  assert.equal(await page.locator('[data-group-key="play-vault"] .dqp-item-row[data-item-id="a6"]').count(),1);
  await page.evaluate(async()=>{
    actor.items.get('a4').system.inVault=true;
    actor.items.get('a5').system.inVault=true;
    calls.length=0;
    await panel.render();
  });
  assert.equal(await page.locator('.dqp-players-toggle span').textContent(),'2');
  assert(await page.locator('#players').evaluate(el=>parseFloat(getComputedStyle(el).bottom))>=238);
  await page.locator('.dqp-players-toggle').click();
  assert.equal(await page.locator('#players').evaluate(el=>el.classList.contains('dqp-players-collapsed')),true);
  assert.equal(await page.locator('#players-active > .players-list').evaluate(el=>getComputedStyle(el).display),'none');
  assert.equal(await page.locator('.dqp-players-toggle').isVisible(),true);
  assert.equal(await page.evaluate(()=>testSettings.get('playersCollapsed')),true);
  await page.locator('.dqp-players-toggle').click();
  assert.equal(await page.locator('#players').evaluate(el=>el.classList.contains('dqp-players-collapsed')),false);
  // Scaling is client-local and does not rebuild the HUD or modify actor data.
  for (const width of [1920, 1366]) {
    await page.setViewportSize({width,height:1080});
    await page.locator('[data-action="toggle-scale"]').click();
    const original = await page.locator('.dqp-column--character').evaluate(el=>el.getBoundingClientRect().height);
    await page.evaluate(()=>{window.originalHud=document.querySelector('.dqp-columns');});
    for (let i=0;i<5;i++) await page.locator('[data-scale="5"]').click();
    assert.equal(await page.locator('.dqp-column--character').evaluate(el=>el.getBoundingClientRect().height),original*1.25);
    assert(await page.locator('.dqp-shell').evaluate(el=>el.getBoundingClientRect().right<innerWidth),`Scaled HUD offscreen at ${width}`);
    assert(await page.evaluate(()=>originalHud===document.querySelector('.dqp-columns')));
    for (let i=0;i<10;i++) await page.locator('[data-scale="-5"]').click();
    assert.equal(await page.locator('.dqp-column--character').evaluate(el=>el.getBoundingClientRect().height),original*.75);
    await page.locator('[data-scale="reset"]').click();
    assert.equal(await page.evaluate(()=>testSettings.get('hudScale')),100);
    await page.locator('[data-action="toggle-scale"]').click();
  }
  for (const width of [1920,1440,1366]) {
    await page.setViewportSize({width,height:1080});
    for (let mask=0;mask<8;mask++) {
      await page.evaluate(async mask => {
        for (const [index,key] of ['character','traits','workspace'].entries()) {
          const open = !(mask & (1<<index));
          if(game.settings.get('',`${key}Open`)!==open) await panel.toggleColumn(key);
        }
      },mask);
      await page.waitForTimeout(280);
      await page.evaluate(()=>Promise.all([...panel.columnAnimations.values()].map(animation=>animation.finished.catch(()=>{}))));
      const result=await page.evaluate(()=>{
        const rect=selector=>document.querySelector(selector).getBoundingClientRect().toJSON();
        const overflow=Array.from(document.querySelectorAll('.dqp-character-body,.dqp-character-identity,.dqp-traits-body,.dqp-trait,.dqp-trait-name,.dqp-defense,.dqp-resource-label')).filter(el=>getComputedStyle(el).visibility!=='hidden' && el.getClientRects().length && (el.scrollWidth>el.clientWidth+1 || el.scrollHeight>el.clientHeight+1)).map(el=>el.className);
        return {stack:rect('.dqp-columns'),traits:Array.from(document.querySelectorAll('.dqp-trait')).map(el=>el.getBoundingClientRect().top),bars:Array.from(document.querySelectorAll('.dqp-column')).map(el=>el.getBoundingClientRect().height),overflow};
      });
      assert.equal(new Set(result.traits).size,1,`Traits wrap at ${width}/${mask}`);
      assert.deepEqual(result.overflow,[],`Content overflow at ${width}/${mask}`);
      assert(result.stack.right<width,`HUD offscreen at ${width}/${mask}`);
      assert.deepEqual(result.bars,[54,38,98].map((h,i)=>mask&(1<<i)?0:h));
      if(!mask) {
        assert.equal(result.stack.height,198);
        if(width===1920) assert(result.stack.width>=1159 && result.stack.width<=1161 && result.stack.width<width*.7);
        await page.locator('.dqp-shell').screenshot({path:path.join(output,`hud-${width}.png`)});
      }
    }
  }
  // Fully hidden layers restore from the portrait dock.
  for(const column of ['character','traits','workspace']) await page.locator(`.dqp-layer-dock [data-column="${column}"]`).click();
  await page.locator('[data-trait="agility"]').click();
  assert.deepEqual(await page.evaluate(()=>calls),['trait:agility']);
  await page.locator('[data-tab="core"]').click();
  await page.waitForTimeout(220);
  assert.equal(await page.evaluate(()=>game.settings.get('','workspaceOpen')),true);
  await page.locator('[data-action="use-item"]').first().click();
  await page.locator('.dqp-item-row').first().click({button:'right'});
  await page.waitForTimeout(220);
  await page.locator('[data-rest="short"]').click();
  await page.locator('[data-rest="long"]').click();
  await page.locator('.dqp-vitals [data-action="adjust-resource"][data-path="system.resources.hitPoints.value"]').click();
  await page.locator('.dqp-vitals [data-action="adjust-resource"][data-path="system.armorScore.value"]').click();
  await page.locator('[data-action="open-sheet"]').click();
  const calls = await page.evaluate(()=>window.calls);
  assert.deepEqual(calls,['trait:agility','item','item-sheet','short-rest','long-rest',{'system.resources.hitPoints.value':3},{armorDelta:1},'sheet']);
  await page.evaluate(()=>{actor.isOwner=false;});
  await page.locator('.dqp-vitals [data-action="adjust-resource"][data-path="system.resources.hitPoints.value"]').click();
  assert.deepEqual(await page.evaluate(()=>window.calls),calls,'Revoked ownership must block resource updates');
  await page.evaluate(()=>{actor.isOwner=true;});
  await page.locator('.dqp-vitals [data-action="adjust-resource"][data-path="system.resources.hope.value"]').click({button:'right'});
  assert.deepEqual(await page.evaluate(()=>calls.at(-1)),{'system.resources.hope.value':6});
  await page.evaluate(()=>{
    actor.system.armorScore={value:0,max:4};
    actor.system.armor={uuid:'Actor.test.Item.armor',type:'armor',name:'Leather Armor',parent:actor,system:{armor:{current:0,max:3}}};
    const shield={uuid:'Actor.test.ActiveEffect.shield',type:'base',name:'Shield',parent:actor,disabled:false,isSuppressed:false,system:{armorData:{current:0,max:1}}};
    actor.effects.push(shield);
    actor.system.updateArmorEffectValue=async change=>{calls.push({armorSource:change});shield.system.armorData.current+=change.value;actor.system.armorScore.value+=change.value;};
    actorPromptSelection='Actor.test.ActiveEffect.shield';
    panel.patchResource(actor,'armor');
  });
  assert.equal(await page.locator('.dqp-resource--armor .dqp-resource-value').textContent(),'4/4');
  await page.locator('.dqp-vitals [data-action="adjust-resource"][data-path="system.armorScore.value"]').click();
  assert.deepEqual(await page.evaluate(()=>calls.at(-1)),{armorSource:{uuid:'Actor.test.ActiveEffect.shield',value:1}});
  assert((await page.evaluate(()=>lastActorPrompt.content)).includes('Leather Armor'));
  assert((await page.evaluate(()=>lastActorPrompt.content)).includes('Shield'));
  const promptCount=await page.evaluate(()=>actorPromptCount);
  await page.locator('.dqp-vitals [data-action="adjust-resource"][data-path="system.armorScore.value"]').click({button:'right'});
  assert.deepEqual(await page.evaluate(()=>calls.at(-1)),{armorDelta:-1});
  assert.equal(await page.evaluate(()=>actorPromptCount),promptCount,'Restoring Armor must not open the source chooser');
  await page.evaluate(()=>{
    actor.system.armorScore.value=0;
    actor.effects.at(-1).system.armorData.current=0;
    panel.patchResource(actor,'armor');
  });
  assert.equal(await page.locator('.dqp-resource--armor .dqp-pip.is-active').count(),4);
  await page.locator('.dqp-resource--armor .dqp-pip[data-value="4"]').click();
  assert.deepEqual(await page.evaluate(()=>calls.at(-1)),{armorSource:{uuid:'Actor.test.ActiveEffect.shield',value:1}});
  assert.equal(await page.evaluate(()=>actorPromptCount),promptCount+1,'Spending an Armor segment must offer the source chooser');
  await page.evaluate(()=>{
    actor.effects.pop();
    delete actor.system.armor;
    delete actor.system.updateArmorEffectValue;
    actor.system.armorScore={value:1,max:3};
    actorPromptSelection=null;
    panel.patchResource(actor,'armor');
  });
  await page.locator('[data-tab="core"]').click();
  await page.evaluate(()=>{
    calls.length=0;
    actor.system.resources.stress.value=5;
    panel.patchActorUpdate(actor,{system:{resources:{stress:{value:5}}}});
  });
  assert((await page.locator('[data-group-key="play-loadout"] [data-item-id="a1"] .dqp-item-cost').textContent()).includes('!'));
  await page.locator('[data-group-key="play-loadout"] [data-item-id="a1"] [data-action="use-item"]').click();
  assert.equal(await page.evaluate(()=>calls.some(call=>call==='item')),false,'An unaffordable Stress move must not run');
  assert((await page.evaluate(()=>calls.at(-1))).startsWith('warn:Not enough Stress'));
  await page.evaluate(()=>{
    actor.system.resources.stress.value=3;
    panel.patchActorUpdate(actor,{system:{resources:{stress:{value:3}}}});
    calls.length=0;
    actor.items.get('a1').system.recallCost=1;
  });
  await page.locator('[data-group-key="play-loadout"] [data-item-id="a1"] [data-action="use-item"]').click();
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(()=>window.calls.slice(-2)),['item','vault:true:false']);
  assert.equal(await page.locator('[data-group-key="play-loadout"] .dqp-inline-group-heading small').textContent(),'2/5');
  await page.evaluate(()=>window.calls.splice(-2));
  await page.evaluate(()=>{
    actor.system.resources.stress.value=6;
    panel.patchActorUpdate(actor,{system:{resources:{stress:{value:6}}}});
  });
  await page.locator('[data-group-key="play-vault"] [data-item-id="a1"] [data-action="toggle-vault"]').click();
  assert.equal(await page.evaluate(()=>calls.some(call=>call==='vault:false:true')),false,'An unaffordable Vault recall must not run');
  assert((await page.evaluate(()=>calls.at(-1))).startsWith('warn:Not enough Stress'));
  await page.evaluate(()=>{
    actor.system.resources.stress.value=3;
    panel.patchActorUpdate(actor,{system:{resources:{stress:{value:3}}}});
    calls.length=0;
  });
  await page.locator('[data-group-key="play-vault"] [data-item-id="a1"] [data-action="toggle-vault"]').click();
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>window.calls.at(-1)),'vault:false:true');
  assert.equal(await page.locator('[data-group-key="play-loadout"] .dqp-inline-group-heading small').textContent(),'3/5');
  await page.evaluate(()=>window.calls.pop());
  for(const tab of ['actions','abilities','experiences','gear','core']) { await page.locator(`[data-tab="${tab}"]`).click(); assert.equal(await page.evaluate(()=>panel.activeTab),tab); }
  await page.locator('[data-tab="core"]').click();
  await page.locator('[data-preview-item]').first().hover();
  await page.waitForSelector('.dqp-hover-card');
  assert((await page.locator('.dqp-hover-card').innerText()).includes('A ready ability.'));
  assert((await page.locator('.dqp-hover-card').innerText()).includes('Cost: 2 Stress'));
  await page.locator('.dqp-hover-card').hover();
  assert(await page.locator('.dqp-hover-card').isVisible());
  await page.locator('.dqp-hover-card').focus();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.dqp-hover-card').count(),0);
  await page.locator('[data-tab="abilities"]').click();
  assert.equal(await page.locator('.dqp-item-row').count(),1);
  assert.equal(await page.locator('.dqp-item-row').getAttribute('data-item-id'),'f1');
  assert.equal(await page.locator('.dqp-experiences').count(),0);
  await page.locator('[data-tab="experiences"]').click();
  await page.locator('[data-preview-experience="e1"]').hover();
  await page.waitForSelector('.dqp-hover-card');
  assert((await page.locator('.dqp-hover-card').innerText()).includes('hidden paths'));
  await page.waitForTimeout(160);
  await page.screenshot({path:path.join(output,'experiences-preview.png')});
  await page.locator('[data-preview-experience="e1"]').click();
  let messages=await page.evaluate(()=>chatMessages);
  assert.equal(messages.length,1);
  assert.equal(messages[0].speaker.actor,'test');
  assert(messages[0].content.includes('Streetwise +2') && messages[0].content.includes('hidden paths'));
  assert.equal(await page.locator('[data-action="edit-experiences"]').count(),0,'Experiences must show existing entries only');
  assert.deepEqual(await page.locator('.dqp-ribbon-pane--experiences > section').evaluateAll(sections=>sections.map(section=>section.classList.contains('dqp-experience-group')?'experiences':section.dataset.effectDrop)),['active','inactive','experiences']);
  assert.equal(await page.locator('[data-effect-drop="active"] .dqp-effect-card').count(),1);
  assert.equal(await page.locator('[data-effect-drop="inactive"] .dqp-effect-card').count(),1);
  assert(await page.locator('.dqp-effect-card').first().evaluate(el=>el.getBoundingClientRect().width<=151),'Effect cards must remain compact');
  assert(await page.locator('.dqp-experience').first().evaluate(el=>el.getBoundingClientRect().width<=167),'Experience cards must remain compact');
  await page.locator('[data-group="effects-active"]').click();
  assert.equal(await page.locator('[data-effect-drop="active"]').evaluate(el=>el.classList.contains('is-collapsed')),true);
  assert.equal(await page.locator('[data-effect-drop="active"] .dqp-effect-list').isVisible(),false);
  await page.locator('[data-group="effects-active"]').click();
  await page.locator('[data-group="experiences-list"]').click();
  assert.equal(await page.locator('.dqp-experience-group').evaluate(el=>el.classList.contains('is-collapsed')),true);
  assert.equal(await page.locator('.dqp-experience-group .dqp-experiences').isVisible(),false);
  await page.locator('[data-group="experiences-list"]').click();
  await page.locator('[data-preview-effect="Actor.test.ActiveEffect.effect-active"]').hover();
  await page.waitForSelector('.dqp-hover-card');
  assert((await page.locator('.dqp-hover-card').innerText()).includes('Stay calm and focused.'));
  await page.locator('[data-effect-drop="active"] [data-action="share-effect"]').click();
  messages=await page.evaluate(()=>chatMessages);
  assert.equal(messages.length,2);
  assert.equal(messages[1].speaker.actor,'test');
  assert(messages[1].content.includes('Focused') && messages[1].content.includes('Stay calm and focused.') && messages[1].content.includes('Active effects'));
  await page.evaluate(()=>{
    const card=document.querySelector('[data-effect-drop="active"] .dqp-effect-card');
    const target=document.querySelector('[data-effect-drop="inactive"]');
    const dataTransfer=new DataTransfer();
    card.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer}));
    target.dispatchEvent(new DragEvent('dragover',{bubbles:true,dataTransfer}));
    target.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer}));
  });
  await page.waitForFunction(()=>document.querySelector('[data-effect-drop="inactive"] [data-effect-key="Actor.test.ActiveEffect.effect-active"]'));
  assert.equal(await page.evaluate(()=>calls.includes('effect:effect-active:true')),true);
  await page.evaluate(()=>{
    const card=document.querySelector('[data-effect-drop="inactive"] [data-effect-key="Actor.test.ActiveEffect.effect-active"]');
    const target=document.querySelector('[data-effect-drop="active"]');
    const dataTransfer=new DataTransfer();
    card.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer}));
    target.dispatchEvent(new DragEvent('dragover',{bubbles:true,dataTransfer}));
    target.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer}));
  });
  await page.waitForFunction(()=>document.querySelector('[data-effect-drop="active"] [data-effect-key="Actor.test.ActiveEffect.effect-active"]'));
  assert.equal(await page.evaluate(()=>calls.includes('effect:effect-active:false')),true);
  await page.evaluate(async()=>{
    actor.items.push({id:'w1',uuid:'Actor.test.Item.w1',name:'A finely crafted two-handed longsword',type:'weapon',img:actor.img,system:{equipped:false,actionsList:[{}],description:'A test weapon.'}});
    actor.sheet.document=actor;
    actor.sheet.options={actions:{toggleEquipItem:async function(event,target){
      if(this.document!==actor) throw new Error('Wrong native sheet context');
      calls.push(`equip:${target.closest('[data-item-uuid]').dataset.itemUuid}`);
      const weapon=actor.items.get('w1');
      weapon.system.equipped=!weapon.system.equipped;
    }}};
    await panel.render();
  });
  await page.locator('[data-tab="gear"]').click();
  await page.locator('[data-action="toggle-equip"]').click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-action="toggle-equip"]').getAttribute('aria-pressed'),'true');
  await page.locator('.dqp-shell').screenshot({path:path.join(output,'gear-equip.png')});
  await page.locator('[data-action="toggle-equip"]').click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-action="toggle-equip"]').getAttribute('aria-pressed'),'false');
  assert.deepEqual(await page.evaluate(()=>window.calls.slice(-2)),['equip:Actor.test.Item.w1','equip:Actor.test.Item.w1']);
  await page.evaluate(async()=>{
    const template=actor.items.get('f1');
    actor.items.push({...template,id:'f2',name:'Ancestry feature'});
    actor.sheet._prepareFeaturesContext=async function(context){
      context.featureGroups=[
        {type:'ancestry',anchorItem:{id:'clank'},title:'Ancestry - Clank',values:[actor.items.get('f2')]},
        {type:'class',title:'Class - Brawler',values:[actor.items.get('f1')]},
        {type:'feature',title:'Features',values:[]},
      ];
    };
    const weapon=actor.items.get('w1');
    weapon.system.equipped=true;
    actor.items.push({...weapon,id:'secondary',name:'A secondary weapon',system:{...weapon.system,secondary:true}});
    actor.items.push({...weapon,id:'armor',type:'armor',usable:false});
    actor.items.push({...weapon,id:'usable',type:'loot',usable:true});
    await panel.render();
  });
  await page.locator('[data-tab="abilities"]').click();
  assert.deepEqual(await page.locator('.dqp-inline-group-heading strong').allTextContents(),['Ancestry - Clank','Class - Brawler','Features']);
  assert.deepEqual(await page.locator('.dqp-item-row').evaluateAll(rows=>rows.map(row=>row.dataset.itemId)),['f2','f1']);
  // Daggerheart 2.2.6 exposes feature categories on actor.system.sheetLists.
  await page.evaluate(async()=>{
    delete actor.sheet._prepareFeaturesContext;
    actor.system.sheetLists={
      ancestryFeatures:{type:'ancestry',title:'Legacy Ancestry - Clank',values:[actor.items.get('f2')]},
      classFeatures:{type:'class',title:'Legacy Class - Brawler',values:[actor.items.get('f1')]},
      features:{type:'feature',title:'Legacy Features',values:[]},
    };
    await panel.render();
  });
  assert.deepEqual(await page.locator('.dqp-inline-group-heading strong').allTextContents(),['Legacy Ancestry - Clank','Legacy Class - Brawler']);
  // Paid Vault recalls in 2.2.6 use its Effect action; free storage is a direct item update.
  await page.evaluate(async()=>{
    const legacy=actor.items.get('a6');
    legacy.system.inVault=true;
    legacy.system.recallCost=2;
    delete legacy.system.toggleVault;
    legacy.update=async changes=>{legacy.system.inVault=changes['system.inVault'];calls.push(`legacy-update:${legacy.system.inVault}`);};
    class LegacyEffectAction {
      static getSourceConfig(){return {};}
      constructor(data){this.data=data;}
      async use(){calls.push(`legacy-recall:${this.data.cost[0].value}`);return true;}
    }
    game.system.api.models={actions:{actionsTypes:{effect:LegacyEffectAction}}};
    calls.length=0;
    await panel.transferDomainCard(legacy,new Event('click'),false,true);
  });
  assert.deepEqual(await page.evaluate(()=>calls),['legacy-recall:2','legacy-update:false']);
  for (const heading of await page.locator('.dqp-inline-group-heading').all()) await heading.click();
  assert.equal(await page.locator('.dqp-inline-group.is-collapsed .dqp-group-icon i').count(),2);
  assert.deepEqual(await page.locator('.dqp-inline-group.is-collapsed > .dqp-inline-group-heading strong').allTextContents(),['Legacy Ancestry - Clank','Legacy Class - Brawler']);
  await page.locator('[data-tab="core"]').click();
  assert.deepEqual(await page.locator('[data-group-key="play-equipment"] .dqp-item-row').evaluateAll(rows=>rows.map(row=>row.dataset.itemId)),['w1','secondary','usable']);
  await page.evaluate(async()=>{
    actor.system.usesUnarmed=true;
    actor.system.attack={name:'Unarmed',img:actor.img,_getLabels(){return ['Melee'];},use:async()=>calls.push('unarmed')};
    await panel.render();
  });
  await page.locator('[data-action="use-unarmed"]').click();
  assert.equal(await page.evaluate(()=>calls.at(-1)),'unarmed');
  await page.evaluate(async()=>{actor.system.attack._getLabels=['Melee'];await panel.render();});
  assert.equal(await page.locator('[data-action="use-unarmed"]').count(),1,'Legacy array labels must remain supported');
  await page.locator('[data-action="toggle-scale"]').click();
  await page.locator('[data-scale="5"]').click();
  await page.locator('.dqp-shell').screenshot({path:path.join(output,'scale-and-equipment.png')});
  await page.locator('.dqp-scale-wrap').dispatchEvent('pointerout',{relatedTarget:null});
  await page.waitForFunction(()=>{const el=document.querySelector('.dqp-scale-controls');return el?.classList.contains('is-hiding')||el?.hidden;},null,{timeout:1500});
  assert.equal(await page.locator('.dqp-scale-controls').evaluate(el=>el.classList.contains('is-hiding')||el.hidden),true,'Scale menu must enter its fade/hide sequence');
  await page.waitForTimeout(220);
  assert.equal(await page.locator('.dqp-scale-controls').evaluate(el=>el.hidden),true,'Scale menu must close after pointer leaves');
  await page.evaluate(()=>panel.render());
  assert.equal(await page.locator('[data-scale="reset"]').textContent(),'105%');
  await page.evaluate(async()=>{await game.settings.set('','hudScale',100);panel.applyScale();});
  await page.evaluate(async()=>{await panel.toggleColumn('traits');await panel.toggleColumn('traits');await Promise.all([...panel.columnAnimations.values()].map(a=>a.finished.catch(()=>{})));});
  assert.equal(await page.locator('.dqp-column--traits').isVisible(),true);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(async()=>{await panel.toggleColumn('traits');await panel.toggleColumn('traits');});
  assert.equal(await page.evaluate(()=>panel.columnAnimations.size),0);
  await page.evaluate(async()=>{
    game.actors.push({...actor,id:'second',name:'Rowan'});
    game.actors.push({...actor,id:'private',name:'Private',isOwner:false});
    await panel.render();
  });
  assert.equal(await page.locator('[data-action="set-actor"]').count(),2);
  await page.locator('[data-action="toggle-actor-switcher"]').click();
  assert.equal(await page.locator('.dqp-actor-switcher-controls').evaluate(el=>el.hidden),false);
  await page.locator('[data-action="set-actor"][data-actor-id="second"]').click();
  assert.equal(await page.evaluate(()=>panel.actor.id),'second');
  await page.evaluate(()=>panel.render());
  assert.equal(await page.locator('[data-action="set-actor"][data-actor-id="second"]').getAttribute('aria-pressed'),'true');
  await page.evaluate(async()=>{await panel.toggleColumn('traits'); await panel.render();});
  assert.equal(await page.locator('.dqp-column--traits').evaluate(el=>el.classList.contains('is-collapsed')),true);
  // Center the entire dock, lift native quick chat above it and only reserve
  // the actual sidebar controls on the right.
  await page.evaluate(async()=>{
    for (const key of ['character','traits','workspace']) await game.settings.set('',`${key}Open`,true);
    await panel.render();
    ui.sidebar={expanded:false,tabGroups:{primary:'actors'},changeTab(tab){this.tabGroups.primary=tab;},expand(){this.expanded=true;},collapse(){this.expanded=false;}};
    const uiRight=document.createElement('aside');
    uiRight.id='ui-right';
    uiRight.style.cssText='position:fixed;inset:0 0 0 auto;width:408px;height:100vh;transform:none;display:block;pointer-events:none;';
    uiRight.innerHTML='<div id="ui-right-column-1" style="position:absolute;inset:0 64px 0 auto;width:328px;height:100vh;padding:16px 0 14px;display:flex;flex-direction:column;pointer-events:none"><div id="chat-notifications" style="flex:1;order:99;display:grid;grid-template-rows:1fr auto"><div class="overflow"></div><div class="chat-input" style="width:328px;pointer-events:auto"><textarea id="chat-message" aria-label="Test native chat" style="width:328px;height:80px;pointer-events:auto"></textarea><section class="dice-tray" style="height:90px;background:#16121e"><button type="button">d20</button></section></div></div></div><nav id="sidebar" style="position:absolute;inset:0 0 0 auto;width:48px;height:100vh;background:#171421;pointer-events:auto"></nav>';
    document.body.append(uiRight);
    panel.observeLayout();
  });
  await page.waitForSelector('.dqp-chat-tools');
  assert.equal(await page.locator('#chat-notifications .dqp-chat-dock').count(),1,'Quick chat should be one cohesive dock');
  assert.equal(await page.locator('.dice-tray').isVisible(),false,'Dice tray should start collapsed');
  await page.locator('[data-dqp-chat-action="dice"]').click();
  assert.equal(await page.locator('.dice-tray').isVisible(),true,'Dice tray should expand on demand');
  const expandedDice=await page.evaluate(()=>({
    tray:document.querySelector('#chat-notifications .dice-tray').getBoundingClientRect().toJSON(),
    hud:document.querySelector('.dqp-shell').getBoundingClientRect().toJSON()
  }));
  assert(expandedDice.tray.bottom<=expandedDice.hud.top-12,'Expanded dice tray must stay clear of a centered HUD');
  await page.locator('[data-dqp-chat-action="dice"]').click();
  assert.equal(await page.locator('.dice-tray').isVisible(),false,'Dice tray should collapse again');
  await page.locator('[data-dqp-chat-action="history"]').click();
  assert.equal(await page.evaluate(()=>ui.sidebar.expanded && ui.sidebar.tabGroups.primary==='chat'),true,'History button should open Foundry chat sidebar');
  await page.locator('[data-dqp-chat-action="history"]').click();
  assert.equal(await page.evaluate(()=>ui.sidebar.expanded),false,'History button should close Foundry chat sidebar');
  for (const width of [1920,1366,1024]) {
    await page.setViewportSize({width,height:900});
    for (const scale of [75,100,125]) {
      await page.evaluate(async scale=>{await game.settings.set('','hudScale',scale);panel.applyScale();},scale);
      const geometry=await page.evaluate(()=>({
        hud:document.querySelector('.dqp-shell').getBoundingClientRect().toJSON(),
        chat:document.querySelector('.dqp-chat-dock').getBoundingClientRect().toJSON(),
        sidebar:document.querySelector('#sidebar').getBoundingClientRect().toJSON(),
        visibleRight:Math.max(...Array.from(document.querySelectorAll('.dqp-column:not(.is-collapsed)'))
          .map(element=>element.getBoundingClientRect().right)),
        atBottom:document.body.classList.contains('dqp-chat-at-bottom'),
      }));
      assert(geometry.hud.left>=17,`Dock left edge outside safe area at ${width}/${scale}`);
      assert(geometry.hud.right<=geometry.sidebar.left-17,`Dock overlaps sidebar at ${width}/${scale}`);
      if (geometry.atBottom) assert(geometry.visibleRight+12<=geometry.chat.left,`Quick chat overlaps the HUD at ${width}/${scale}`);
      else assert(geometry.chat.bottom<=geometry.hud.top-12,`Quick chat is not above the HUD at ${width}/${scale}`);
      assert(Math.abs((geometry.hud.left+geometry.hud.right)/2-width/2)<2,`Dock is not screen-centered at ${width}/${scale}`);
      assert.equal(await page.evaluate(()=>testSettings.get('hudScale')),scale,'Auto-fit must preserve requested scale');
      await page.locator('[aria-label="Test native chat"]').fill(`Chat works at ${width}/${scale}`);
      assert.equal(await page.locator('[aria-label="Test native chat"]').inputValue(),`Chat works at ${width}/${scale}`);
    }
    await page.evaluate(async()=>{await game.settings.set('','hudScale',100);panel.applyScale();});
    if (width===1920) assert(await page.locator('.dqp-columns').evaluate(el=>el.getBoundingClientRect().width)>=1159,'HUD does not use the compact 1160px band width');
    await page.screenshot({path:path.join(output,`centered-chat-${width}.png`)});
  }
  await page.setViewportSize({width:1920,height:900});
  await page.evaluate(async()=>{await game.settings.set('','hudPlacement','side');panel.applyPlacement();});
  const sideChat=await page.evaluate(()=>({
    chat:document.querySelector('.dqp-chat-tools').getBoundingClientRect().toJSON(),
    hud:document.querySelector('.dqp-shell').getBoundingClientRect().toJSON(),
    viewport:innerHeight,
    atBottom:document.body.classList.contains('dqp-chat-at-bottom')
  }));
  assert.equal(sideChat.atBottom,true,'Side HUD should move chat to the lower-right when clear of the panel');
  assert(sideChat.chat.top>sideChat.hud.top,'Side quick chat should sit near the bottom, beside the HUD');
  assert(sideChat.viewport-sideChat.chat.bottom<80,'Side quick chat should stay close to the bottom edge');
  await page.screenshot({path:path.join(output,'side-chat-1920.png')});
  // Shortened bands must not leave an invisible full-width shell blocking the chat.
  await page.evaluate(async()=>{
    await game.settings.set('','hudScale',125);
    for (const column of ['character','traits','workspace']) await game.settings.set('',`${column}Width`,72);
    document.querySelector('#ui-right-column-1').style.right='84px';
    panel.applyColumnWidths();
    panel.applyScale();
    panel.positionHud();
  });
  const narrowedChat=await page.evaluate(()=>({
    shellRight:document.querySelector('.dqp-shell').getBoundingClientRect().right,
    visibleRight:Math.max(...Array.from(document.querySelectorAll('.dqp-column:not(.is-collapsed)'))
      .map(element=>element.getBoundingClientRect().right)),
    chatLeft:document.querySelector('.dqp-chat-dock').getBoundingClientRect().left,
    atBottom:document.body.classList.contains('dqp-chat-at-bottom')
  }));
  assert(narrowedChat.shellRight+12>narrowedChat.chatLeft,`Test must reproduce the invisible shell overlap: ${JSON.stringify(narrowedChat)}`);
  assert(narrowedChat.visibleRight+12<=narrowedChat.chatLeft,'Shortened visible bands should fit beside chat');
  assert.equal(narrowedChat.atBottom,true,'Chat should sit beside narrowed bands');
  await page.screenshot({path:path.join(output,'narrowed-side-chat-1920.png')});
  await page.evaluate(async()=>{
    await game.settings.set('','hudScale',100);
    for (const column of ['character','traits','workspace']) await game.settings.set('',`${column}Width`,100);
    document.querySelector('#ui-right-column-1').style.right='64px';
    panel.applyColumnWidths();
    panel.applyScale();
  });
  await page.setViewportSize({width:1024,height:900});
  await page.evaluate(()=>panel.positionHud());
  assert.equal(await page.evaluate(()=>document.body.classList.contains('dqp-chat-at-bottom')),false,'Narrow side layout must lift chat clear of the HUD');
  await page.evaluate(async()=>{await game.settings.set('','hudPlacement','center');panel.applyPlacement();});
  // Resizing/collapsing the native sidebar changes fit without moving the center or rebuilding the HUD.
  await page.evaluate(()=>{window.centeredHud=document.querySelector('.dqp-columns');document.querySelector('#sidebar').style.width='360px';});
  await page.waitForFunction(()=>Math.abs((document.querySelector('.dqp-shell').getBoundingClientRect().left+document.querySelector('.dqp-shell').getBoundingClientRect().right)/2-innerWidth/2)<2);
  assert(await page.evaluate(()=>centeredHud===document.querySelector('.dqp-columns')));
  await page.evaluate(()=>{document.querySelector('#ui-right').remove();panel.observeLayout();});
  // The HUD follows Foundry's core Language Preference.
  await page.setViewportSize({width:1366,height:900});
  await page.evaluate(async()=>{
    game.i18n.lang='ru';
    game.i18n.translations.DAGGERHEART={CONFIG:{Traits:{
      agility:{name:'Проворность'},strength:{name:'Сила'},finesse:{name:'Искусность'},
      instinct:{name:'Инстинкт'},presence:{name:'Влияние'},knowledge:{name:'Знание'}
    }}};
    await panel.applyLanguage(false);
    await panel.render();
  });
  assert.equal(await page.evaluate(()=>game.i18n.lang),'ru');
  assert.equal(await page.evaluate(()=>panel.activeLanguage),'ru');
  assert.equal((await page.locator('[data-tab="core"]').textContent()).trim(),'Игра');
  assert.equal((await page.locator('[data-tab="experiences"]').textContent()).trim(),'Опыт');
  assert.equal(await page.locator('[data-action="toggle-scale"]').getAttribute('aria-label'),'Масштаб HUD');
  assert.deepEqual(await page.locator('.dqp-trait-name').allTextContents(),['Проворность','Сила','Искусность','Инстинкт','Влияние','Знание']);
  assert.deepEqual(await page.locator('.dqp-vitals .dqp-resource-name').allTextContents(),['Здоровье','Стресс','Надежда','Броня']);
  assert.deepEqual(await page.locator('.dqp-defense-stats span').allTextContents(),['Уклонение','Мастерство']);
  await page.locator('.dqp-resource--armor').hover();
  await page.waitForSelector('.dqp-threshold-preview');
  const russianThresholds=await page.locator('.dqp-threshold-preview').innerText();
  for(const label of ['Лёгкий','Ощутимый','Тяжёлый']) assert(russianThresholds.includes(label),`Missing Russian threshold ${label}`);
  await page.evaluate(()=>panel.hidePreview());
  const russianOverflow=await page.evaluate(()=>Array.from(document.querySelectorAll('.dqp-character-body,.dqp-character-identity,.dqp-traits-body,.dqp-trait,.dqp-trait-name,.dqp-defense,.dqp-resource-label,.dqp-tabs')).filter(el=>getComputedStyle(el).visibility!=='hidden'&&el.getClientRects().length&&(el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1)).map(el=>el.className));
  assert.deepEqual(russianOverflow,[],'Russian HUD labels must fit the tested layout');
  await page.screenshot({path:path.join(output,'localization-ru.png')});
  // Player startup must remain independent from canvas/token APIs. Remote
  // clients can reach ready before a Scene canvas has been initialized.
  await page.evaluate(async()=>{
    game.user.isGM=false;
    delete window.canvas;
    await panel.render();
  });
  assert.equal(await page.locator('.dqp-columns').count(),1,'Player HUD must render without a ready canvas');
  assert.equal(await page.locator('.dqp-adversary-panel').count(),0);
  await page.evaluate(()=>{window.canvas={tokens:{controlled:[]}};});
  // A GM-controlled adversary token automatically replaces the three character
  // ribbons with one compact surface that keeps native attacks and moves usable.
  await page.evaluate(()=>{
    const feature={id:'af1',uuid:'Actor.ogre.Item.af1',name:'Hail of Boulders',type:'feature',img:testPortrait,parent:null,system:{description:'Throw boulders at every target in front of the ogre.',actionsList:[{cost:[{key:'stress',value:1,enabled:true}]}]},use:async()=>{calls.push('adversary-feature');return true;},sheet:{render:()=>calls.push('adversary-feature-sheet')}};
    const items=[feature];items.get=id=>items.find(item=>item.id===id);
    window.adversary={id:'ogre',uuid:'Scene.test.Token.ogre.Actor.ogre',type:'adversary',name:'Cave Ogre',img:testPortrait,isOwner:true,items,effects:[{id:'effect1',name:'Enraged',img:testPortrait,disabled:false,isSuppressed:false}],system:{tier:1,type:'solo',size:'large',difficulty:13,description:'A massive creature who sees heroes as food.',motivesAndTactics:'Stomp, throw enemies, feast',hordeHp:1,damageThresholds:{major:8,severe:15},resources:{hitPoints:{value:1,max:8,isReversed:true},stress:{value:0,max:3,isReversed:true}},experiences:{throw:{name:'Throw',value:2,description:'Hurl something heavy.'}},attack:{name:'Club',img:testPortrait,range:'veryClose',roll:{bonus:1},damage:{parts:{hitPoints:{value:{dice:'d10',flatMultiplier:1,bonus:2}}}},use:async()=>{calls.push('adversary-attack');return true;}}},update:async changes=>calls.push(changes),sheet:{render:()=>calls.push('adversary-sheet')}};
    feature.parent=adversary;
    window.adversaryToken={id:'ogre-token',actor:adversary,document:{id:'ogre-token',texture:{src:testPortrait}}};
    game.user.isGM=true;
    canvas.tokens.controlled=[adversaryToken];
    calls.length=0;
    panel.selectAdversaryToken(adversaryToken,true);
  });
  await page.waitForSelector('.dqp-adversary-panel');
  assert.equal(await page.locator('.dqp-columns').count(),0,'Character ribbons must be replaced while an adversary is selected');
  assert.equal(await page.locator('.dqp-adversary-panel').count(),1);
  assert((await page.locator('.dqp-adversary-panel').innerText()).includes('Cave Ogre'));
  assert((await page.locator('.dqp-adversary-panel').innerText()).includes('13'));
  assert.equal(await page.locator('.dqp-adversary-panel').evaluate(el=>el.getBoundingClientRect().height),126);
  assert.equal(await page.locator('.dqp-adversary-action-scroll .dqp-item-row').count(),1);
  await page.locator('[data-action="use-adversary-attack"]').click();
  await page.locator('[data-item-id="af1"] [data-action="use-item"]').click();
  assert.deepEqual(await page.evaluate(()=>calls.slice(-2)),['adversary-attack','adversary-feature']);
  await page.locator('[data-path="system.resources.hitPoints.value"][data-value="2"]').click();
  assert.deepEqual(await page.evaluate(()=>calls.at(-1)),{'system.resources.hitPoints.value':2});
  await page.locator('[data-preview-item="af1"]').hover();
  await page.waitForSelector('.dqp-hover-card');
  assert((await page.locator('.dqp-hover-card').innerText()).includes('Throw boulders'));
  await page.screenshot({path:path.join(output,'adversary-hud-ru.png')});
  await page.evaluate(()=>{
    canvas.tokens.controlled=[];
    panel.selectAdversaryToken(adversaryToken,false);
  });
  await page.waitForSelector('.dqp-columns');
  assert.equal(await page.locator('.dqp-adversary-panel').count(),0,'Character HUD must return after the adversary is deselected');
  const genericViews = await page.evaluate(async()=>{
    const types=['companion','npc','environment','party'];
    const results=[];
    actor.uuid='Actor.test';
    for(const type of types){
      const feature={id:`${type}-feature`,uuid:`Actor.${type}.Item.feature`,type:'feature',name:`${type} feature`,img:testPortrait,system:{description:'A feature description.',actionsList:[]},sheet:{render:()=>calls.push(`${type}-feature-sheet`)}};
      const items=[feature];items.get=id=>items.find(item=>item.id===id);
      const candidate={id:type,uuid:`Actor.${type}`,type,name:`Test ${type}`,img:testPortrait,isOwner:true,items,effects:[],sheet:{render:()=>calls.push(`${type}-sheet`)},update:async changes=>calls.push(changes),system:{description:`${type} description`,difficulty:type==='npc'||type==='environment'?12:undefined,evasion:type==='companion'?11:undefined,tier:type==='environment'?2:undefined,resources:type==='companion'?{stress:{value:1,max:3}}:{},experiences:type==='companion'?{track:{name:'Tracking',value:2,description:'Find a trail.'}}:{},motives:type==='npc'?'Trade information':undefined,impulses:type==='environment'?'Separate intruders':undefined,partyMembers:type==='party'?[actor]:[],attack:type==='companion'?{name:'Bite',img:testPortrait,roll:{bonus:2},use:async()=>calls.push('companion-attack')}:undefined}};
      game.actors.push(candidate);
      await game.settings.set('daggerheart-quick-panel','selectedActorId',candidate.id);
      panel.manualActorOverride=true;
      await panel.render();
      results.push({type,visible:!!document.querySelector('.dqp-generic-panel'),name:document.querySelector('.dqp-generic-panel')?.textContent.includes(candidate.name),items:document.querySelectorAll('.dqp-generic-panel .dqp-item-row').length,members:document.querySelectorAll('[data-action="open-member"]').length,attack:document.querySelectorAll('[data-action="use-generic-attack"]').length});
    }
    return results;
  });
  assert.deepEqual(genericViews.map(view=>view.type),['companion','npc','environment','party']);
  assert(genericViews.every(view=>view.visible&&view.name&&view.items===1),'Each additional actor type must render its own compact HUD');
  assert.equal(genericViews[0].attack,1,'Companion attack must appear');
  assert.equal(genericViews[3].members,1,'Party members must appear');
  await page.screenshot({path:path.join(output,'generic-party-hud-ru.png')});
  await page.locator('[data-action="open-member"]').click();
  assert.equal(await page.evaluate(()=>calls.at(-1)),'sheet');
  if (await page.locator('#dqp-utility-controls').evaluate(el=>el.hidden)) await page.locator('[data-action="toggle-utilities"]').click();
  await page.locator('[data-action="toggle-actor-switcher"]').click();
  await page.locator('[data-action="set-actor"][data-actor-id="test"]').click();
  await page.waitForSelector('.dqp-columns');
  await page.evaluate(()=>{
    window.rollCommit=[];
    actor.rollTrait=async (trait,{event})=>{
      rollCommit.push(`roll:${trait}:${event.type}`);
      return {costs:[{key:'hope',value:1,total:1,enabled:true}],resourceUpdates:{
        addResources:costs=>rollCommit.push({costs}),
        updateResources:async()=>rollCommit.push('committed')
      }};
    };
  });
  await page.locator('[data-action="roll-trait"][data-trait="agility"]').click();
  assert.deepEqual(await page.evaluate(()=>rollCommit),[
    'roll:agility:click',
    {costs:[{key:'hope',value:-1,total:-1,enabled:true}]},
    'committed'
  ],'Daggerheart 2.2.6 trait rolls must commit both value and total');
  await page.evaluate(()=>{
    rollCommit.length=0;
    actor.rollTrait=async trait=>({costs:[{key:'hope',value:1,enabled:true}],resourceUpdates:{
      addResources:costs=>rollCommit.push({costs}),
      updateResources:async()=>rollCommit.push('committed')
    }});
  });
  await page.locator('[data-action="roll-trait"][data-trait="agility"]').click();
  assert.deepEqual(await page.evaluate(()=>rollCommit),[
    {costs:[{key:'hope',value:-1,enabled:true}]},
    'committed'
  ],'Daggerheart 2.10.5 trait rolls must remain supported without total');

  // The installed sheet owns its workflow. Its resource map must be applied
  // once, with the receiver, original event and native dataset intact.
  await page.evaluate(()=>{
    rollCommit.length=0;
    actor.sheet.document=actor;
    actor.sheet.options.actions.rollAttribute={handler:async function(event,button){
      rollCommit.push(`native:${this.document.id}:${event.type}:${button.dataset.attribute}`);
      const result=await this.document.rollTrait(button.dataset.attribute,{event});
      result.resourceUpdates.addResources(result.costs.filter(cost=>cost.enabled).map(cost=>({...cost,value:-cost.value})));
      await result.resourceUpdates.updateResources();
    }};
  });
  await page.locator('[data-action="roll-trait"][data-trait="agility"]').click();
  assert.deepEqual(await page.evaluate(()=>rollCommit),[
    'native:test:click:agility',
    {costs:[{key:'hope',value:-1,enabled:true}]},
    'committed'
  ],'Native Daggerheart trait automation must run once');
  await page.evaluate(async()=>{
    actor.sheet.options.actions.useDowntime=async function(_event,button){
      calls.push(`native-rest:${this.document.id}:${button.dataset.type}`);
    };
    calls.length=0;
    await panel.openDowntime(actor,'short',null);
    await panel.openDowntime(actor,'long',null);
  });
  assert.deepEqual(await page.evaluate(()=>calls),['native-rest:test:shortRest','native-rest:test:longRest']);

  // A failed optional label helper must leave the full HUD and its native
  // unarmed attack usable, including the case reported after system updates.
  for(const shape of ['array','method','collection','missing','invalid','throws']) {
    await page.evaluate(async shape=>{
      actor.system.usesUnarmed=true;
      const attack={name:'Unarmed',img:actor.img,range:'Melee',use:async()=>calls.push('safe-unarmed')};
      if(shape==='array') attack._getLabels=['Melee',{value:'1d4'}];
      if(shape==='method') attack._getLabels=function(){return [this.range,{value:'1d4'}];};
      if(shape==='collection') attack._getLabels=new Map([['range','Melee'],['damage',{value:'1d4'}]]);
      if(shape==='invalid') attack._getLabels=()=>false;
      if(shape==='throws') attack._getLabels=()=>{throw new TypeError('Changed native label schema');};
      actor.system.attack=attack;
      panel.activeTab='core';
      await panel.render();
    },shape);
    assert.equal(await page.locator('.dqp-render-failure').count(),0,`HUD failed for ${shape} labels`);
    const attackButton=page.locator('[data-action="use-unarmed"]');
    assert.equal(await attackButton.count(),1);
    if(['array','method','collection'].includes(shape)) assert((await attackButton.innerText()).includes('Melee · 1d4'));
    await attackButton.click();
    assert.equal(await page.evaluate(()=>calls.at(-1)),'safe-unarmed');
  }
  await page.evaluate(()=>{
    game.system.settings={homebrew:{maxLoadout:8}};
    actor.system.bonuses={maxLoadout:2};
    if(panel.loadoutLimit(actor)!==10) throw new Error('New homebrew settings were ignored');
    const card=actor.items.find(item=>item.type==='domainCard');
    card.system.inVault=true;
    actor.system.loadoutSlot={available:false};
    if(panel.loadoutHasRoom(actor,card)) throw new Error('Native full Loadout was ignored');
    card.system.loadoutIgnore=true;
    if(!panel.loadoutHasRoom(actor,card)) throw new Error('Ignore Loadout limit was ignored');
    card.system.loadoutIgnore=false;
    actor.system.loadoutSlot.available=true;
    if(!panel.loadoutHasRoom(actor,card)) throw new Error('Native free Loadout slot was ignored');
  });
  assert.deepEqual(errors,[]);
  console.log('PASS: character HUD plus automatic compact GM adversary HUD; smooth bottom-anchored utility gear; Experiences plus draggable Active/Inactive effects; native adversary attacks/features and resources; five themes; centered/side placement; complete Russian render; 24 viewport/hidden-layer combinations; rolls, tabs, rests, permissions, previews, actor selector and persisted layer states.');
} finally { await browser.close(); }

#!/usr/bin/env node
/* Kontrola dat hry Ministrex – spouštěj po každé změně položek, levelů nebo obrázků:
     node tools/check.js
   Chyby (exit 1): chybějící obrázky, neexistující položky v levelech, nepoužité položky,
   špatné prémiové otázky, kroky mše mimo části, neshoda verze s README…
   Varování: nepoužité obrázky. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// ---------- skripty z index.html ----------
const html = read('index.html');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
for (const s of scripts) if (!fs.existsSync(path.join(ROOT, s))) err(`index.html načítá neexistující ${s}`);

// ---------- offline mezipaměť (sw.js) musí obsahovat všechny soubory hry ----------
const swFiles = [...(read('sw.js').match(/const FILES = \[([\s\S]*?)\]/) || [, ''])[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
for (const f of swFiles) if (f !== './' && !fs.existsSync(path.join(ROOT, f))) err(`sw.js ukládá neexistující ${f}`);
const htmlLinks = [...html.matchAll(/<link [^>]*href="([^":]+)"/g)].map((m) => m[1]);
for (const f of [...scripts, ...htmlLinks]) if (!swFiles.includes(f)) err(`sw.js: v FILES chybí ${f} (hra by offline nefungovala)`);
const manifest = JSON.parse(read('manifest.webmanifest'));
for (const ic of manifest.icons) {
  if (!fs.existsSync(path.join(ROOT, ic.src))) err(`manifest: ikona ${ic.src} neexistuje`);
  if (!swFiles.includes(ic.src)) err(`sw.js: v FILES chybí ikona ${ic.src}`);
}

// ---------- načtení dat jako v prohlížeči ----------
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['js/sprite-art.js', 'js/sprites.js', 'js/data/items.js', 'js/data/sections.js']) {
  try { vm.runInContext(read(f), ctx, { filename: f }); } catch (e) { err(`${f}: ${e.message}`); }
}
const ITEMS = ctx.MC_DATA?.items || {};
const SECTIONS = ctx.MC_DATA?.sections || [];
const ART = ctx.MC_SPRITE_ART?.spr || {};
const SPR = ctx.MC_SPRITES?.SPR || {};
const spriteExists = (id) => id in ART || id in SPR;
const usedSprites = new Set();
const useSprite = (id, where) => {
  usedSprites.add(id);
  if (!spriteExists(id)) err(`${where}: obrázek „${id}“ neexistuje`);
};

// ---------- obrázky ----------
for (const [id, rows] of Object.entries(ART)) {
  if (rows.length !== 48 || rows.some((r) => r.length !== 48)) err(`obrázek ${id} nemá rozměr 48×48`);
}

// ---------- položky ----------
for (const [id, it] of Object.entries(ITEMS)) {
  for (const k of ['name', 'desc', 'clue', 'use']) {
    if (typeof it[k] !== 'string' || !it[k].trim()) err(`položka ${id}: chybí ${k}`);
  }
  if ('zdroj' in it && !it.zdroj.trim()) err(`položka ${id}: prázdný zdroj`);
  useSprite(it.sprite || id, `položka ${id}`);
}
const names = {};
for (const [id, it] of Object.entries(ITEMS)) {
  if (names[it.name]) err(`položky ${names[it.name]} a ${id} mají stejný název „${it.name}“`);
  names[it.name] = id;
}

// ---------- sekce a levely ----------
const game = read('js/game.js');
const postures = JSON.parse((game.match(/const POSTURES = (\[[^\]]*\])/) || [, '[]'])[1].replace(/'/g, '"'));
const usedItems = new Set();
const ids = new Set();
const uniqueId = (id, what) => { if (ids.has(id)) err(`duplicitní id ${what} „${id}“`); ids.add(id); };

for (const sec of SECTIONS) {
  const S = `sekce ${sec.id}`;
  uniqueId(sec.id, 'sekce');
  for (const k of ['title', 'icon', 'desc']) if (!sec[k]) err(`${S}: chybí ${k}`);
  if (sec.icon) useSprite(sec.icon, `${S} (ikona)`);
  if (!Array.isArray(sec.levels) || !sec.levels.length) { if (!sec.comingSoon) err(`${S}: nemá levely`); continue; }

  for (const lv of sec.levels) {
    const L = `level ${lv.id}`;
    uniqueId(lv.id, 'levelu');
    for (const k of ['title', 'intro']) if (!lv[k]) err(`${L}: chybí ${k}`);
    if (!(lv.questionCount > 0)) err(`${L}: questionCount musí být kladné číslo`);
    if (!!lv.items === !!lv.steps) err(`${L}: musí mít buď items, nebo steps`);

    if (lv.items) {
      if (lv.items.length < 4) err(`${L}: méně než 4 položky – nebude dost špatných odpovědí`);
      if (new Set(lv.items).size !== lv.items.length) err(`${L}: položka je v items dvakrát`);
      for (const id of lv.items) {
        if (!ITEMS[id]) err(`${L}: položka „${id}“ neexistuje v items.js`);
        else if (!sec.comingSoon) usedItems.add(id);
      }
    }

    if (lv.steps) {
      if (!sec.parts) err(`${S}: level ${lv.id} má steps, ale sekce nemá parts`);
      if (lv.steps.length < 4) err(`${L}: méně než 4 kroky`);
      lv.steps.forEach((st, i) => {
        const T = `${L}, krok ${i + 1} (${st.name})`;
        if (!st.name || !st.desc) err(`${T}: chybí name nebo desc`);
        if (sec.parts && !sec.parts.includes(st.part)) err(`${T}: část „${st.part}“ není v parts sekce`);
        if (st.posture && !postures.includes(st.posture)) err(`${T}: neznámý postoj „${st.posture}“ (povolené: ${postures.join(', ')})`);
        if (st.sprite) useSprite(st.sprite, T);
      });
      const stepNames = lv.steps.map((s) => s.name);
      if (new Set(stepNames).size !== stepNames.length) err(`${L}: dva kroky se stejným názvem`);
    }

    const prem = lv.premium || [];
    if (lv.premiumCount > prem.length) err(`${L}: premiumCount ${lv.premiumCount} > počet prémiových otázek ${prem.length}`);
    prem.forEach((p, i) => {
      const P = `${L}, prémiová otázka ${i + 1}`;
      if (!p.q || !p.explain) err(`${P}: chybí q nebo explain`);
      if (!Array.isArray(p.options) || p.options.length < 2) err(`${P}: potřebuje aspoň 2 odpovědi`);
      else if (new Set(p.options).size !== p.options.length) err(`${P}: opakuje se odpověď`);
      if (p.sprite) useSprite(p.sprite, P);
    });
  }
}

for (const id of Object.keys(ITEMS)) {
  if (!usedItems.has(id)) err(`položka ${id} není v žádném levelu`);
}

// obrázky použité přímo v kódu hry (SP.img('…') / SP.url('…'))
for (const m of game.matchAll(/SP\.(?:img|url)\('([a-z_]+)'/g)) useSprite(m[1], 'game.js');
for (const id of Object.keys(ART)) if (!usedSprites.has(id)) warn(`obrázek ${id} se nikde nepoužívá`);

// ---------- verze ----------
const ver = (game.match(/const VERSION = '([^']+)'/) || [])[1];
if (!ver) err('js/game.js: nenalezeno VERSION');
else if (!read('README.md').includes(ver)) err(`README.md neuvádí verzi ${ver}`);

// ---------- výsledek ----------
const nLevels = SECTIONS.reduce((a, s) => a + (s.levels || []).length, 0);
for (const w of warnings) console.log('varování:', w);
for (const e of errors) console.log('CHYBA:', e);
console.log(`\n${Object.keys(ITEMS).length} položek, ${Object.keys(ART).length} obrázků, ${SECTIONS.length} sekcí, ${nLevels} levelů, verze ${ver}`);
if (errors.length) { console.log(`✗ ${errors.length} chyb`); process.exit(1); }
console.log('✓ v pořádku');

// @ts-check
/* MINISTREX – hlavní logika hry */
(function () {
  'use strict';

  const ITEMS = window.MC_DATA.items;
  const SECTIONS = window.MC_DATA.sections;
  const SP = window.MC_SPRITES;
  const SFX = window.MC_AUDIO;
  const app = document.getElementById('app');

  const VERSION = '0.1.0';

  const CFG = {
    lives: 3,
    time: 20,          // s na běžnou otázku
    premiumTime: 30,   // s na prémiovou otázku
    base: 100,         // body za správnou odpověď
    timeBonus: 50,     // max. bonus za rychlost
    premiumMult: 3,
    fullHealBonus: 100 // bonus za prémiovou otázku při plných životech
  };

  // ---------- uložení postupu ----------
  const SAVE_KEY = 'ministrex.save.v1';
  const OLD_SAVE_KEY = 'minicraft.save.v1'; // převzetí postupu z prvního prototypu
  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || localStorage.getItem(OLD_SAVE_KEY));
      if (s && s.levels) return { collected: {}, ...s };
    } catch (e) { /* bez úložiště */ }
    return { levels: {}, collected: {}, muted: false };
  }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }
  const save = loadSave();
  SFX.muted = !!save.muted;

  // ---------- pomocníci ----------
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v === false || v == null) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) {
      if (c == null || c === false) continue;
      e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return e;
  }
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sample = (a, n) => shuffle(a).slice(0, n);
  const lcFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  // obrázek předmětu – předmět může sdílet obrázek jiného (pole `sprite` v items.js)
  const spr = (id) => (ITEMS[id] && ITEMS[id].sprite) || id;

  // znění otázek – sekce nebo level je může přepsat polem `prompts`
  const DEFAULT_PROMPTS = {
    identify: 'Co je to za předmět?',
    find: 'Najdi: {name}',
    purpose: 'Který předmět to popisuje?',
    use: 'K čemu slouží {name_lc}?',
  };
  function prompt(sec, level, type, it) {
    const t = (level.prompts && level.prompts[type]) || (sec.prompts && sec.prompts[type]) || DEFAULT_PROMPTS[type];
    return t.replace('{name}', it ? it.name : '').replace('{name_lc}', it ? lcFirst(it.name) : '');
  }

  function btn(label, onclick, cls = '') {
    return h('button', { class: 'btn ' + cls, onclick: (e) => { SFX.click(); onclick(e); } }, label);
  }

  function heartsEl(lives, max) {
    const wrap = h('div', { class: 'hearts', 'aria-label': `Životy: ${lives}` });
    for (let i = 0; i < max; i++) wrap.append(SP.img('heart', 30, i < lives ? {} : { map: { R: 'D', w: 'D' } }));
    return wrap;
  }
  function starsEl(n, size = 22) {
    const wrap = h('div', { class: 'stars' });
    for (let i = 0; i < 3; i++) wrap.append(SP.img('star', size, i < n ? {} : { map: { y: 'D', o: 'D' } }));
    return wrap;
  }

  function allLevels() {
    const out = [];
    SECTIONS.forEach((s) => { if (!s.comingSoon) s.levels.forEach((l) => out.push({ section: s, level: l })); });
    return out;
  }
  function isUnlocked(levelId) {
    const all = allLevels();
    const i = all.findIndex((x) => x.level.id === levelId);
    if (i <= 0) return true;
    return (save.levels[all[i - 1].level.id]?.stars || 0) > 0;
  }
  const totalScore = () => Object.values(save.levels).reduce((a, l) => a + (l.best || 0), 0);
  const totalStars = () => Object.values(save.levels).reduce((a, l) => a + (l.stars || 0), 0);

  let keyHandler = null;
  document.addEventListener('keydown', (e) => { if (keyHandler) keyHandler(e); });

  let timerRaf = null;
  function clearTimer() { if (timerRaf) cancelAnimationFrame(timerRaf); timerRaf = null; }

  function screen(cls, ...kids) {
    clearTimer();
    if (quitArmed) { clearTimeout(quitArmed); quitArmed = null; }
    keyHandler = null;
    app.innerHTML = '';
    const s = h('div', { class: 'screen ' + cls }, ...kids);
    app.append(s);
    window.scrollTo(0, 0);
    return s;
  }

  function muteBtn() {
    const b = h('button', { class: 'icon-btn', title: 'Zvuk', onclick: () => {
      SFX.muted = !SFX.muted; save.muted = SFX.muted; persist();
      b.textContent = SFX.muted ? '🔇' : '🔊';
      SFX.click();
    } }, SFX.muted ? '🔇' : '🔊');
    return b;
  }

  // Přepínač časového limitu (bez limitu není bonus za rychlost)
  const timed = () => !save.noTimer;
  function timerToggle() {
    const label = () => '⏱ Časový limit: ' + (timed() ? 'zapnutý' : 'vypnutý');
    const b = h('button', { class: 'btn small toggle' + (timed() ? '' : ' off'), 'aria-pressed': String(timed()), onclick: () => {
      save.noTimer = !save.noTimer; persist(); SFX.click();
      b.textContent = label();
      b.classList.toggle('off', !timed());
      b.setAttribute('aria-pressed', String(timed()));
    } }, label());
    return b;
  }

  // ---------- TITULNÍ OBRAZOVKA ----------
  function showTitle() {
    const floaters = h('div', { class: 'floaters' },
      ['kalich', 'kadidelnice', 'monstrance', 'zvonky', 'svice'].map((id, i) => {
        const im = SP.img(id, 96);
        im.style.animationDelay = (i * 0.35) + 's';
        return im;
      }));
    screen('title',
      h('div', { class: 'title-top' }, muteBtn()),
      h('div', { class: 'logo-wrap' },
        h('div', { class: 'crown' }, SP.img('crown', 88)),
        h('h1', { class: 'logo' }, 'MINISTREX'),
        h('div', { class: 'motto' }, '✦ Sloužit je královské ✦')),
      h('p', { class: 'tagline' }, 'Ministrantská výprava za liturgickými předměty'),
      h('div', { class: 'hero' }, SP.img('ministrant', 128)),
      floaters,
      h('div', { class: 'menu' },
        btn('Hrát', showMap, 'big'),
        btn('Sbírka', showCollection),
        btn('Jak hrát', showHelp),
        timerToggle()),
      h('p', { class: 'footer' }, `verze ${VERSION}`)
    );
    keyHandler = (e) => { if (e.key === 'Enter') showMap(); };
  }

  // ---------- NÁPOVĚDA ----------
  function showHelp() {
    screen('help', h('div', { class: 'panel' },
      h('h2', {}, 'Jak hrát'),
      h('ul', { class: 'help-list' },
        h('li', {}, SP.img('heart', 22), ' Máš 3 životy. Za špatnou odpověď nebo vypršený čas přijdeš o jeden.'),
        h('li', {}, '⏱ Časový limit můžeš na úvodní obrazovce vypnout. Pak máš na odpověď času, kolik chceš, jen nezískáš bonus za rychlost.'),
        h('li', {}, SP.img('star', 22), ` Za správnou odpověď získáš ${CFG.base} bodů + bonus za rychlost. Série 3 správných = ×2, série 5 = ×3.`),
        h('li', {}, SP.img('gem', 22), ' Prémiová otázka: těžší, ale ×3 body, vrátí ti život a za chybu o nic nepřijdeš.'),
        h('li', {}, SP.img('kalich', 48), ' Každý správně poznaný předmět, roucho nebo gesto se ti uloží do sbírky.'),
        h('li', {}, SP.img('misal', 48), ' V sekci Průběh mše skládáš části mše ve správném pořadí a hádáš, jak se při nich stojí, sedí nebo klečí.'),
        h('li', {}, SP.img('lock', 22), ' Dokonči level a odemkne se další. Hvězdy: 3 = bez chyby.'),
        h('li', {}, '⌨️ Odpovídat můžeš i klávesami 1–4, pokračovat Enterem.')),
      h('div', { class: 'row' }, btn('◀ Zpět', showTitle))));
    keyHandler = (e) => { if (e.key === 'Escape' || e.key === 'Enter') showTitle(); };
  }

  // ---------- MAPA ----------
  function showMap() {
    const header = h('div', { class: 'map-header panel' },
      btn('◀ Menu', showTitle, 'small'),
      h('h2', {}, 'Mapa výpravy'),
      h('div', { class: 'map-stats' },
        h('span', {}, SP.img('star', 20), ' ', totalStars()),
        h('span', {}, SP.img('gem', 20), ' ', totalScore())),
      muteBtn());

    const sections = SECTIONS.map((sec) => {
      const head = h('div', { class: 'sec-head' },
        h('div', { class: 'sec-icon' }, SP.img(sec.icon, 48, sec.comingSoon ? { silhouette: true } : {})),
        h('div', {}, h('h3', {}, sec.title), h('p', {}, sec.desc)));
      if (sec.comingSoon) {
        return h('div', { class: 'section panel soon' }, head, h('div', { class: 'soon-tag' }, '⛏ Připravujeme'));
      }
      const levels = sec.levels.map((l, i) => {
        const unlocked = isUnlocked(l.id);
        const st = save.levels[l.id];
        return h('button', {
          class: 'level-block' + (unlocked ? '' : ' locked'),
          disabled: !unlocked,
          onclick: () => { SFX.click(); showStudy(sec, l); },
        },
          h('div', { class: 'block-img', style: `background-image:url(${SP.texture(unlocked ? 'mosaic' : 'brick', 11 + i)})` },
            unlocked ? h('span', { class: 'block-num' }, i + 1) : SP.img('lock', 32)),
          h('div', { class: 'level-name' }, l.title),
          starsEl(st?.stars || 0, 16),
          h('div', { class: 'best' }, st?.best ? `rekord ${st.best}` : ' '));
      });
      return h('div', { class: 'section panel' }, head, h('div', { class: 'levels' }, levels));
    });

    screen('map', header, h('div', { class: 'sections' }, sections));
    keyHandler = (e) => { if (e.key === 'Escape') showTitle(); };
  }

  // ---------- UČEBNA ----------
  function showStudy(sec, level) {
    const cards = level.steps
      ? level.steps.map((st, i) => h('div', { class: 'card step' },
        h('div', { class: 'step-num' }, i + 1),
        h('div', { class: 'card-body' },
          h('h4', {}, st.name),
          h('div', { class: 'chips' },
            h('span', { class: 'chip' }, st.part),
            st.posture ? h('span', { class: 'chip posture' }, st.posture) : null),
          h('p', {}, st.desc))))
      : level.items.map((id) => {
        const it = ITEMS[id];
        return h('div', { class: 'card' },
          h('div', { class: 'card-img' }, SP.img(spr(id), 96)),
          h('div', { class: 'card-body' }, h('h4', {}, it.name), h('p', {}, it.desc)));
      });
    screen('study',
      h('div', { class: 'panel' },
        h('div', { class: 'study-head' },
          h('div', { class: 'eyebrow' }, sec.title),
          h('h2', {}, '📖 Učebna: ' + level.title),
          h('p', {}, level.intro)),
        h('div', { class: 'cards' + (level.steps ? ' steps' : '') }, cards),
        h('div', { class: 'row sticky' },
          btn('◀ Mapa', showMap),
          btn('Spustit test ▶', () => startLevel(sec, level), 'primary'))));
    keyHandler = (e) => { if (e.key === 'Enter') startLevel(sec, level); if (e.key === 'Escape') showMap(); };
  }

  // ---------- GENEROVÁNÍ OTÁZEK ----------
  function distractors(id, levelIds, n = 3) {
    let c = shuffle(levelIds.filter((x) => x !== id));
    if (c.length < n) c = c.concat(shuffle(Object.keys(ITEMS).filter((x) => x !== id && !levelIds.includes(x))));
    return c.slice(0, n);
  }

  function makeQuestion(sec, level, type, id) {
    const levelIds = level.items;
    const it = ITEMS[id];
    const opts = shuffle([id, ...distractors(id, levelIds)]);
    const base = { type, itemId: id, premium: false, fb: { sprite: spr(id), title: it.name, text: it.desc } };
    const P = (t) => prompt(sec, level, t, it);
    switch (type) {
      case 'identify':
        return { ...base, prompt: P('identify'), sprite: spr(id),
          options: opts.map((o) => ({ label: ITEMS[o].name, correct: o === id })) };
      case 'find':
        return { ...base, prompt: P('find'),
          options: opts.map((o) => ({ sprite: spr(o), reveal: ITEMS[o].name, correct: o === id })) };
      case 'purpose':
        return { ...base, prompt: P('purpose'), quote: it.clue,
          options: opts.map((o) => ({ label: ITEMS[o].name, correct: o === id })) };
      case 'use':
      default:
        return { ...base, prompt: P('use'), sprite: spr(id),
          options: opts.map((o) => ({ label: ITEMS[o].use, correct: o === id })) };
    }
  }

  // ---- levely typu „posloupnost“ (průběh mše) ----
  const POSTURES = ['Stojíme', 'Sedíme', 'Klečíme', 'Chodíme'];
  function makeStepQuestion(sec, level, type, i) {
    const steps = level.steps;
    const st = steps[i];
    const others = (exclude) => shuffle(steps.filter((x) => !exclude.includes(x))).slice(0, 3).map((x) => x.name);
    const fb = { sprite: st.sprite, title: st.name, text: `${st.desc} (${st.part}${st.posture ? ', ' + st.posture.toLowerCase() : ''})` };
    const base = { type, premium: false, itemId: null, fb, sprite: st.sprite };
    const mk = (prompt, correct, wrong) => ({ ...base, prompt,
      options: shuffle([{ label: correct, correct: true }, ...wrong.map((w) => ({ label: w, correct: false }))]) });
    switch (type) {
      case 'next': return mk(`Co následuje po: ${st.name}?`, steps[i + 1].name, others([st, steps[i + 1]]));
      case 'prev': return mk(`Co je těsně před: ${st.name}?`, steps[i - 1].name, others([st, steps[i - 1]]));
      case 'part': return mk(`Do které části mše patří: ${st.name}?`, st.part, sec.parts.filter((p) => p !== st.part));
      case 'posture':
      default: return mk(`Jaký postoj máme při: ${st.name}?`, st.posture, POSTURES.filter((p) => p !== st.posture));
    }
  }

  function buildStepQuestions(sec, level) {
    const n = level.questionCount ?? 8;
    const pool = [];
    level.steps.forEach((st, i) => {
      if (i < level.steps.length - 1) pool.push(['next', i]);
      if (i > 0) pool.push(['prev', i]);
      if (sec.parts) pool.push(['part', i]);
      if (st.posture) pool.push(['posture', i]);
    });
    // rovnoměrně typy otázek, náhodně kroky
    const byType = {};
    shuffle(pool).forEach((x) => (byType[x[0]] = byType[x[0]] || []).push(x));
    const picked = [];
    const types = Object.keys(byType);
    for (let k = 0; picked.length < n && k < 100; k++) {
      const list = byType[types[k % types.length]];
      if (list.length) picked.push(list.pop());
    }
    return shuffle(picked).map(([t, i]) => makeStepQuestion(sec, level, t, i));
  }

  function buildQuestions(sec, level) {
    let qs;
    if (level.steps) {
      qs = buildStepQuestions(sec, level);
    } else {
      const ids = level.items;
      const n = level.questionCount ?? 8;
      let order = shuffle(ids);
      while (order.length < n) order = order.concat(shuffle(ids));
      order = order.slice(0, n);
      const types = shuffle(Array.from({ length: n }, (_, i) => ['identify', 'find', 'purpose', 'use'][i % 4]));
      qs = order.map((id, i) => makeQuestion(sec, level, types[i], id));
    }

    const prem = sample(level.premium || [], level.premiumCount ?? 2).map((p) => ({
      type: 'premium', premium: true, prompt: p.q, sprite: p.sprite, itemId: null,
      options: shuffle(p.options.map((t, j) => ({ label: t, correct: j === 0 }))),
      explain: p.explain,
    }));
    prem.forEach((p, k) => {
      const pos = Math.round((k + 1) * (qs.length + 1) / (prem.length + 1));
      qs.splice(pos, 0, p);
    });
    return qs;
  }

  // ---------- KVÍZ ----------
  let G = null;

  function startLevel(sec, level) {
    G = {
      sec, level, qs: buildQuestions(sec, level), idx: 0,
      lives: CFG.lives, score: 0, streak: 0, bestStreak: 0, correct: 0, lost: 0,
      found: new Set(), answered: false,
    };
    SFX.start();
    renderQuestion();
  }

  // Opuštění levelu: první klik/Esc se zeptá, druhý do 3 s potvrdí (bez blokujícího dialogu).
  let quitArmed = null;
  function requestQuit() {
    const b = document.getElementById('quit-btn');
    if (quitArmed) {
      clearTimeout(quitArmed);
      quitArmed = null;
      SFX.click();
      commitFound();
      persist();
      showMap();
      return;
    }
    SFX.click();
    if (b) { b.textContent = 'Opravdu? Klikni znovu'; b.classList.add('armed'); }
    quitArmed = setTimeout(() => {
      quitArmed = null;
      const bb = document.getElementById('quit-btn');
      if (bb) { bb.textContent = '✕ Opustit'; bb.classList.remove('armed'); }
    }, 3000);
  }

  function comboMult(streak) { return streak >= 5 ? 3 : streak >= 3 ? 2 : 1; }

  function hud() {
    return h('div', { class: 'hud panel' },
      h('div', { class: 'hud-left' },
        h('button', { class: 'btn small quit-btn', id: 'quit-btn', title: 'Opustit level (Esc)', onclick: requestQuit }, '✕ Opustit'),
        h('div', { id: 'hud-hearts' }, heartsEl(G.lives, CFG.lives))),
      h('div', { class: 'hud-mid' }, h('div', { class: 'eyebrow' }, G.sec.title), h('div', { class: 'hud-title' }, G.level.title)),
      h('div', { class: 'hud-right' },
        h('div', { class: 'score', id: 'hud-score' }, G.score),
        h('div', { class: 'combo' + (G.streak >= 3 ? ' on' : ''), id: 'hud-combo' }, G.streak >= 3 ? `SÉRIE ${G.streak} · ×${comboMult(G.streak)}` : `série ${G.streak}`)));
  }

  function bottomBar() {
    const total = G.qs.length;
    const pct = Math.round((G.idx / total) * 100);
    const slots = (G.level.items || []).map((id) => h('div', { class: 'slot' + (G.found.has(id) ? ' found' : ''), title: G.found.has(id) ? ITEMS[id].name : '???' },
      SP.img(spr(id), 48, G.found.has(id) ? {} : { silhouette: true })));
    return h('div', { class: 'bottom' },
      h('div', { class: 'xp' },
        h('div', { class: 'xp-label' }, `${Math.min(G.idx + 1, total)} / ${total}`),
        h('div', { class: 'xp-bar' }, h('div', { class: 'xp-fill', style: `width:${pct}%` }))),
      slots.length ? h('div', { class: 'hotbar' }, slots) : null);
  }

  function renderQuestion() {
    const q = G.qs[G.idx];
    G.answered = false;

    const visual = q.sprite && q.type !== 'premium'
      ? h('div', { class: 'q-visual' }, SP.img(q.sprite, 144))
      : q.sprite ? h('div', { class: 'q-visual small' }, SP.img(q.sprite, 96)) : null;

    const optionBtns = q.options.map((o, i) => h('button', {
      class: 'opt' + (o.sprite ? ' opt-sprite' : ''),
      onclick: () => answer(i),
    },
      h('span', { class: 'key' }, i + 1),
      o.sprite ? SP.img(o.sprite, 96) : h('span', { class: 'opt-label' }, o.label),
      o.sprite ? h('span', { class: 'reveal' }, o.reveal) : null));

    const card = h('div', { class: 'qcard panel' + (q.premium ? ' premium' : '') },
      q.premium ? h('div', { class: 'premium-banner' }, SP.img('gem', 22), ' PRÉMIOVÁ OTÁZKA ', SP.img('gem', 22),
        h('div', { class: 'premium-sub' }, '×3 body · +1 život · za chybu nic neztratíš')) : null,
      timed() ? h('div', { class: 'timer' }, h('div', { class: 'timer-fill', id: 'timer-fill' })) : null,
      h('h2', { class: 'prompt' }, q.prompt),
      q.quote ? h('blockquote', { class: 'quote' }, '„' + q.quote + '“') : null,
      visual,
      h('div', { class: 'options' + (q.options[0].sprite ? ' grid-sprites' : '') }, optionBtns),
      h('div', { class: 'feedback', id: 'feedback' }));

    screen('quiz', hud(), card, bottomBar());
    if (q.premium) SFX.premium();

    keyHandler = (e) => {
      if (e.key === 'Escape') { requestQuit(); return; }
      if (!G.answered && e.key >= '1' && e.key <= String(q.options.length)) answer(Number(e.key) - 1);
      else if (G.answered && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); next(); }
    };
    if (timed()) startTimer(q.premium ? CFG.premiumTime : CFG.time);
    else { G.timeLeft = 0; G.timeTotal = 1; }
  }

  function startTimer(total) {
    const fill = document.getElementById('timer-fill');
    const t0 = performance.now();
    let lastSec = total;
    G.timeLeft = total;
    const loop = (now) => {
      const left = Math.max(0, total - (now - t0) / 1000);
      G.timeLeft = left;
      fill.style.width = (left / total * 100) + '%';
      fill.classList.toggle('low', left <= 5);
      const sec = Math.ceil(left);
      if (sec < lastSec && sec <= 5 && sec > 0) SFX.tick();
      lastSec = sec;
      if (left <= 0) { timerRaf = null; answer(-1); return; }
      timerRaf = requestAnimationFrame(loop);
    };
    G.timeTotal = total;
    timerRaf = requestAnimationFrame(loop);
  }

  function popup(text, cls) {
    const p = h('div', { class: 'popup ' + (cls || '') }, text);
    document.querySelector('.qcard')?.append(p);
    setTimeout(() => p.remove(), 1200);
  }

  function answer(i) {
    if (G.answered) return;
    G.answered = true;
    clearTimer();
    const q = G.qs[G.idx];
    const ok = i >= 0 && q.options[i].correct;
    const btns = /** @type {HTMLButtonElement[]} */ ([...document.querySelectorAll('.opt')]);
    btns.forEach((b, j) => {
      b.disabled = true;
      if (q.options[j].correct) b.classList.add('correct');
      else if (j === i) b.classList.add('wrong');
    });
    document.querySelector('.options').classList.add('answered');

    let title, extra = '';
    if (ok) {
      G.streak++;
      G.bestStreak = Math.max(G.bestStreak, G.streak);
      G.correct++;
      const tb = Math.round((G.timeLeft / G.timeTotal) * CFG.timeBonus);
      let pts = (CFG.base + tb) * comboMult(G.streak) * (q.premium ? CFG.premiumMult : 1);
      if (q.premium) {
        if (G.lives < CFG.lives) { G.lives++; extra = ' +1 ❤'; SFX.heal(); }
        else { pts += CFG.fullHealBonus; extra = ` (+${CFG.fullHealBonus} za plné zdraví)`; }
      }
      G.score += pts;
      if (q.itemId) G.found.add(q.itemId);
      title = `Správně! +${pts}${extra}`;
      SFX.correct();
      popup('+' + pts, q.premium ? 'gold' : '');
    } else {
      G.streak = 0;
      if (!q.premium) {
        G.lives--;
        G.lost++;
        app.classList.remove('hurt'); void app.offsetWidth; app.classList.add('hurt');
      }
      title = i < 0 ? 'Čas vypršel!' : 'Špatně!';
      if (q.premium) title += ' (prémiová – život zůstává)';
      SFX.wrong();
    }

    // aktualizace HUD
    document.getElementById('hud-hearts').replaceChildren(heartsEl(G.lives, CFG.lives));
    document.getElementById('hud-score').textContent = G.score;
    const combo = document.getElementById('hud-combo');
    combo.textContent = G.streak >= 3 ? `SÉRIE ${G.streak} · ×${comboMult(G.streak)}` : `série ${G.streak}`;
    combo.classList.toggle('on', G.streak >= 3);
    document.querySelector('.bottom').replaceWith(bottomBar());

    // vysvětlení
    const fb = document.getElementById('feedback');
    let body;
    if (q.premium) {
      body = h('p', {}, q.explain);
    } else {
      body = h('div', { class: 'fb-item' }, q.fb.sprite ? SP.img(q.fb.sprite, 96) : null, h('div', {}, h('strong', {}, q.fb.title), h('p', {}, q.fb.text)));
    }
    const dead = G.lives <= 0;
    const last = G.idx >= G.qs.length - 1;
    fb.append(
      h('div', { class: 'fb-title ' + (ok ? 'ok' : 'bad') }, title),
      body,
      btn(dead ? 'Pokračovat…' : last ? 'Výsledky ▶' : 'Další otázka ▶', next, 'primary'));
    fb.classList.add('show');
    fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function next() {
    if (G.lives <= 0) return showGameOver();
    G.idx++;
    if (G.idx >= G.qs.length) return showResult();
    renderQuestion();
  }

  function commitFound() {
    G.found.forEach((id) => { save.collected[id] = true; });
  }

  function nextLevelOf(levelId) {
    const all = allLevels();
    const i = all.findIndex((x) => x.level.id === levelId);
    return all[i + 1] || null;
  }

  // ---------- VÝSLEDKY ----------
  function showResult() {
    const stars = G.lost === 0 ? 3 : G.lost === 1 ? 2 : 1;
    const prev = save.levels[G.level.id] || {};
    const newBest = G.score > (prev.best || 0);
    save.levels[G.level.id] = { stars: Math.max(prev.stars || 0, stars), best: Math.max(prev.best || 0, G.score) };
    commitFound();
    persist();
    SFX.win();

    const nxt = nextLevelOf(G.level.id);
    const { sec, level } = G;
    screen('result',
      h('div', { class: 'panel result-panel' },
        h('h2', {}, 'Level dokončen!'),
        h('div', { class: 'big-stars' }, starsEl(stars, 56)),
        h('div', { class: 'result-score' }, G.score, newBest ? h('span', { class: 'new-best' }, 'NOVÝ REKORD!') : null),
        h('div', { class: 'result-stats' },
          h('div', {}, 'Správně: ', h('b', {}, `${G.correct} / ${G.qs.length}`)),
          h('div', {}, 'Nejdelší série: ', h('b', {}, G.bestStreak)),
          h('div', {}, 'Ztracené životy: ', h('b', {}, G.lost))),
        h('div', { class: 'row' },
          btn('◀ Mapa', showMap),
          btn('↻ Znovu', () => startLevel(sec, level)),
          nxt ? btn('Další level ▶', () => showStudy(nxt.section, nxt.level), 'primary') : null)));
    keyHandler = (e) => { if (e.key === 'Enter') nxt ? showStudy(nxt.section, nxt.level) : showMap(); };
  }

  function showGameOver() {
    commitFound();
    persist();
    SFX.lose();
    const { sec, level } = G;
    screen('gameover',
      h('div', { class: 'go-wrap' },
        h('h1', { class: 'go-title' }, 'Zhasla ti svíce!'),
        h('div', { class: 'go-candle' }, SP.img('svice', 96, { map: SP.hideMat('flame') })),
        h('p', {}, 'Došly ti životy. Skóre: ', h('b', {}, G.score)),
        h('div', { class: 'menu' },
          btn('↻ Zkusit znovu', () => startLevel(sec, level), 'primary'),
          btn('📖 Zpět do učebny', () => showStudy(sec, level)),
          btn('Mapa', showMap))));
    keyHandler = (e) => { if (e.key === 'Enter') startLevel(sec, level); };
  }

  // ---------- SBÍRKA ----------
  function showCollection() {
    const has = (id) => !!save.collected[id];
    // sekce s předměty (průběh mše se nesbírá), předměty v pořadí levelů, bez duplicit
    const seen = new Set();
    const groups = SECTIONS.filter((sec) => !sec.comingSoon && sec.levels.some((l) => l.items)).map((sec) => {
      const levels = sec.levels.filter((l) => l.items).map((l) => {
        const ids = l.items.filter((id) => !seen.has(id));
        ids.forEach((id) => seen.add(id));
        return { level: l, ids };
      }).filter((g) => g.ids.length);
      const ids = levels.flatMap((g) => g.ids);
      return { sec, levels, ids, got: ids.filter(has).length, open: isUnlocked(sec.levels[0].id) };
    });
    const total = groups.reduce((a, g) => a + g.ids.length, 0);
    const got = groups.reduce((a, g) => a + g.got, 0);

    function openDetail(id) {
      SFX.click();
      const close = () => { overlay.remove(); keyHandler = collKeys; };
      const overlay = h('div', { class: 'modal', onclick: (e) => { if (e.target === overlay) close(); } },
        h('div', { class: 'panel modal-box' },
          has(id)
            ? h('div', { class: 'fb-item' }, SP.img(spr(id), 96), h('div', {}, h('strong', {}, ITEMS[id].name), h('p', {}, ITEMS[id].desc)))
            : h('div', { class: 'fb-item' }, SP.img(spr(id), 96, { silhouette: true }),
              h('div', {}, h('strong', {}, '???'), h('p', {}, 'Tohle jsi ještě neobjevil(a). Správně to poznej v testu a uložíš si to do sbírky!'))),
          h('div', { class: 'row' }, btn('Zavřít', close, 'primary'))));
      document.body.append(overlay);
      keyHandler = (e) => { if (e.key === 'Escape' || e.key === 'Enter') close(); };
    }

    const sections = groups.map((g) => {
      const pct = Math.round((g.got / g.ids.length) * 100);
      const body = h('div', { class: 'coll-body' },
        g.levels.map((lg) => h('div', { class: 'coll-level' },
          h('div', { class: 'eyebrow' }, lg.level.title),
          h('div', { class: 'coll-grid' }, lg.ids.map((id) => h('button', {
            class: 'slot big' + (has(id) ? ' found' : ''), title: has(id) ? ITEMS[id].name : '???',
            onclick: () => openDetail(id),
          }, SP.img(spr(id), 48, has(id) ? {} : { silhouette: true })))))));
      const box = h('div', { class: 'coll-section' + (g.open ? ' open' : '') },
        h('button', { class: 'coll-head', onclick: () => { SFX.click(); box.classList.toggle('open'); } },
          h('span', { class: 'coll-icon' }, SP.img(g.sec.icon, 48, g.got ? {} : { silhouette: true })),
          h('span', { class: 'coll-title' },
            h('span', {}, g.sec.title),
            h('span', { class: 'coll-bar' }, h('span', { class: 'coll-fill', style: `width:${pct}%` }))),
          h('span', { class: 'coll-count' + (g.got === g.ids.length ? ' done' : '') }, `${g.got} / ${g.ids.length}`),
          h('span', { class: 'coll-arrow' }, '▾')),
        body);
      return box;
    });

    const collKeys = (e) => { if (e.key === 'Escape') showTitle(); };
    screen('collection', h('div', { class: 'panel' },
      h('div', { class: 'top-bar' },
        btn('◀ Menu', showTitle, 'small'),
        h('h2', {}, `Sbírka ${got} / ${total}`),
        btn('Mapa ▶', showMap, 'small')),
      h('p', { class: 'coll-hint' }, got ? 'Klepni na sekci pro rozbalení, na obrázek pro detail.' : 'Zatím je prázdná – správně poznávej v testech a sbírka se bude plnit.'),
      h('div', { class: 'coll-sections' }, sections)));
    keyHandler = collKeys;
  }

  // ---------- start ----------
  document.documentElement.style.setProperty('--tex-brick', `url(${SP.texture('brick', 3)})`);
  document.documentElement.style.setProperty('--tex-deep', `url(${SP.texture('deep', 2)})`);
  window.__ministrex = { state: () => G }; // ladění
  showTitle();

  // instalace do mobilu + offline (sw.js); z file:// to prohlížeče nepovolí, hra jede i bez toho
  if (location.protocol.startsWith('http') && 'serviceWorker' in navigator) {
    document.head.append(h('link', { rel: 'manifest', href: 'manifest.webmanifest' }));
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker:', e));
  }
})();

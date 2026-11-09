/* Pixelové sprity – každý řádek je jeden řádek pixelů, každý znak je barva z palety.
   '.' = průhledná. Nový předmět = nový záznam v SPR se stejným klíčem jako v items.js. */
(function () {
  'use strict';

  const PAL = {
    k: '#1e1e1e', // obrys
    y: '#f2c230', Y: '#b07f12', o: '#fff2a8', // zlato
    w: '#f7f7f2', g: '#c9c9c4', G: '#8c8c8c', D: '#3a3a3a', // bílá / šedé
    r: '#7a1020', R: '#d0302a', // víno / červená
    s: '#dfe4ea', S: '#9aa4b0', // stříbro
    l: '#9fd8ff', // voda
    b: '#9a6a3a', B: '#5e3b1c', // dřevo / vlasy
    f: '#ff8a1e', F: '#ffe14d', // plamen
    n: '#f0c08a', // kůže
    e: '#2f8f3a', u: '#2f5fc8', // zelená, modrá
    c: '#7ef0f0', C: '#2bb5c4', q: '#ffffff', // drahokam
  };

  // Malé UI ikony 16×16 (předměty jsou v js/sprite-art.js, generuje tools/draw_sprites.py)
  const SPR = {
    ministrant: [
      '................',
      '.....kkkkkk.....',
      '....kBBBBBBk....',
      '....kBBBBBBk....',
      '....kBnnnnBk....',
      '....knknnknk....',
      '....knnnnnnk....',
      '.....knnnnk.....',
      '......kDDk......',
      '....kkwDDwkk....',
      '...kwwwwwwwwk...',
      '..kwwwwwwwwwwk..',
      '.kwwgwwwwwwgwwk.',
      'kwwwgwwwwwwgwwwk',
      'kwwgkwwwwwwkgwwk',
      'kkkkkwwwwwwkkkkk',
      '....kwwwwwwk....',
      '...kwgwwwwgwk...',
      '..kwwgwwwwgwwk..',
      '..kgwgwgwgwgwk..',
      '...kDDDDDDDDk...',
      '...kDDDDkDDDk...',
      '...kDDDDkDDDk...',
      '...kDDDDkDDDk...',
      '...kDDDDkDDDk...',
      '....kDDkkDDk....',
    ],
    heart: [
      '.kk...kk.',
      'kRRk.kRRk',
      'kRwRkRRRk',
      'kRRRRRRRk',
      '.kRRRRRk.',
      '..kRRRk..',
      '...kRk...',
      '....k....',
    ],
    star: [
      '....k....',
      '...kyk...',
      'kkkyoykkk',
      'kyyyoyyyk',
      '.kyyyyyk.',
      '..kyyyk..',
      '.kyykyyk.',
      '.kyk.kyk.',
      '.kk...kk.',
    ],
    gem: [
      '..kkkkk..',
      '.kqcCcCk.',
      'kqcCcCcCk',
      'kCCCCCCCk',
      '.kCcCcCk.',
      '..kCcCk..',
      '...kCk...',
      '....k....',
    ],
    crown: [
      '.k...k...k.',
      'kyk.kyk.kyk',
      'kyykyyykyyk',
      'kyyyyoyyyyk',
      'kyRyyyyyuyk',
      'kYYYYYYYYYk',
      'kkkkkkkkkkk',
    ],
    lock: [
      '..kkkk..',
      '.kk..kk.',
      '.kk..kk.',
      'kkkkkkkk',
      'kyyyyyYk',
      'kyyBByYk',
      'kyyBByYk',
      'kYYYYYYk',
      'kkkkkkkk',
    ],
  };

  // Ověření rozměrů (pomáhá při kreslení nových spritů)
  for (const [id, rows] of Object.entries(SPR)) {
    const w = rows[0].length;
    rows.forEach((r, i) => { if (r.length !== w) console.warn(`Sprite "${id}" řádek ${i} má délku ${r.length}, čekáno ${w}`); });
  }

  // Jemnější sprity 32×32 z tools/draw_sprites.py mají přednost před 16×16 výše.
  const ART = window.MC_SPRITE_ART || { pal: {}, spr: {}, mats: {} };

  // mapa znaků materiálu na jiný znak (např. zhasnutí plamene)
  function hideMat(mat) {
    const m = {};
    (ART.mats[mat] || []).forEach((c) => { m[c] = '.'; });
    return m;
  }

  const cache = {};

  function render(rows, opts, pal) {
    const h = rows.length, w = Math.max(...rows.map(r => r.length));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        let ch = rows[y][x];
        if (opts.map && opts.map[ch]) ch = opts.map[ch];
        if (ch === '.') continue;
        ctx.fillStyle = opts.silhouette ? 'rgba(20,20,20,0.85)' : (pal[ch] || '#f0f');
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return cv.toDataURL();
  }

  function url(id, opts = {}) {
    const key = id + JSON.stringify(opts);
    if (!cache[key]) {
      const art = ART.spr[id];
      const rows = art || SPR[id];
      if (!rows) { console.warn('Chybí sprite', id); return ''; }
      cache[key] = render(rows, opts, art ? ART.pal : PAL);
    }
    return cache[key];
  }

  function img(id, size = 64, opts = {}) {
    const rows = ART.spr[id] || SPR[id] || ['.'];
    const i = new Image();
    i.src = url(id, opts);
    i.width = size;
    i.height = Math.round(size * rows.length / rows[0].length);
    i.className = 'px';
    i.alt = '';
    i.draggable = false;
    return i;
  }

  // Procedurální textury (hlína, tráva, kámen…)
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const TEX = {
    dirt: ['#79553a', '#8b6142', '#5d4029', '#6b4a31'],
    stone: ['#8a8a8a', '#7b7b7b', '#9a9a9a', '#6e6e6e'],
    grass: ['#5d9b3a', '#6fb043', '#4f8a31', '#7cc04c'],
    plank: ['#a5824e', '#9a7746', '#b38e57', '#8a6a3c'],
    deep: ['#2a2a35', '#30303c', '#25252e', '#363644'],
    brick: ['#2e2a40', '#35304a', '#2a263a', '#3a3552'],
    glass: ['#2f5fc8', '#c83a2a', '#e0b238', '#2f8f3a', '#7b3fa0', '#3fa6c8'],
  };
  function texture(kind, seed = 7) {
    const key = 'tex:' + kind + seed;
    if (cache[key]) return cache[key];
    const cv = document.createElement('canvas');
    cv.width = 16; cv.height = 16;
    const ctx = cv.getContext('2d');
    const r = rng(seed);
    const pick = (pal) => pal[Math.floor(r() * pal.length)];
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        let pal;
        if (kind === 'brick') {
          const row = Math.floor(y / 4);
          if (y % 4 === 3 || (x + (row % 2) * 4) % 8 === 7) { ctx.fillStyle = '#16131f'; ctx.fillRect(x, y, 1, 1); continue; }
          pal = TEX.brick;
        } else if (kind === 'mosaic') {
          const a = x + y, b = x - y + 16;
          if (a % 8 === 0 || b % 8 === 0) { ctx.fillStyle = '#1a1420'; ctx.fillRect(x, y, 1, 1); continue; }
          const cell = Math.floor(a / 8) * 7 + Math.floor(b / 8) * 3;
          const glass = TEX.glass[(cell + seed) % TEX.glass.length];
          ctx.fillStyle = glass;
          ctx.fillRect(x, y, 1, 1);
          if (r() < 0.2) { ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(x, y, 1, 1); }
          if (r() < 0.25) { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x, y, 1, 1); }
          continue;
        } else if (kind === 'grassSide') {
          const edge = 3 + (r() < 0.5 ? 1 : 0) + (x % 3 === 0 ? 1 : 0);
          pal = y < edge ? TEX.grass : TEX.dirt;
        } else if (kind === 'plank') {
          pal = TEX.plank;
          if (y % 4 === 3) { ctx.fillStyle = '#6b5030'; ctx.fillRect(x, y, 1, 1); continue; }
        } else {
          pal = TEX[kind] || TEX.stone;
        }
        ctx.fillStyle = pick(pal);
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return (cache[key] = cv.toDataURL());
  }

  window.MC_SPRITES = { PAL, SPR, ART, url, img, texture, hideMat };
})();

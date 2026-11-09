// @ts-check
/* Jednoduché 8bit zvuky přes WebAudio – žádné soubory. */
(function () {
  'use strict';
  const A = { muted: false, ctx: null };

  function ctx() {
    if (!A.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      A.ctx = new C();
    }
    if (A.ctx.state === 'suspended') A.ctx.resume();
    return A.ctx;
  }

  function tone(f, d, { type = 'square', vol = 0.05, delay = 0, slide = 0 } = {}) {
    if (A.muted) return;
    const c = ctx();
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.linearRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + d + 0.02);
  }

  const seq = (notes, step, opts) => notes.forEach((f, i) => tone(f, opts.d || step * 1.4, { ...opts, delay: i * step }));

  A.click = () => tone(660, 0.05, { vol: 0.03 });
  // „oltářní zvonky“ – správná odpověď
  A.correct = () => seq([1568, 2093, 1760, 2349], 0.05, { type: 'triangle', vol: 0.06, d: 0.25 });
  A.wrong = () => tone(190, 0.3, { type: 'sawtooth', vol: 0.05, slide: -90 });
  A.premium = () => seq([784, 988, 1175, 1568], 0.07, { type: 'square', vol: 0.04 });
  A.heal = () => seq([523, 784, 1047], 0.08, { type: 'triangle', vol: 0.07 });
  A.tick = () => tone(1300, 0.03, { vol: 0.02 });
  A.start = () => seq([392, 523, 659], 0.09, { type: 'square', vol: 0.04 });
  A.win = () => seq([523, 659, 784, 1047, 784, 1047], 0.12, { type: 'triangle', vol: 0.07 });
  A.lose = () => seq([392, 330, 262, 196], 0.2, { type: 'square', vol: 0.04, d: 0.3 });

  window.MC_AUDIO = /** @type {MCAudio} */ (A);
})();

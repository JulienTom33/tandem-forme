// Animations maison des exercices (silhouette vue de profil), dessinées en SVG.
// Moteur v2 : les appuis (pieds, mains, épaules, genoux) sont fixés et les membres sont calculés
// par cinématique inverse à deux segments : plus de pieds qui glissent ni de membres qui traversent le sol.
// Angles : 0 = vers le bas, 90 = vers l'avant (droite), -90 = vers l'arrière, 180 = vers le haut.

const LEN = { torso: 40, neck: 15, ua: 20, fa: 18, th: 25, sh: 25 };
const W = 200, H = 130, GROUND = 118;
const rad = (d) => (d * Math.PI) / 180;
const vec = (p, a, len) => [p[0] + Math.sin(rad(a)) * len, p[1] + Math.cos(rad(a)) * len];
const FWD = [1, 0], BACK = [-1, 0], UP = [0, -1], DOWN = [0, 1], UPBACK = [-0.7, -0.7];

// Deux segments (l1, l2) de root vers target ; prefer = direction souhaitée du coude ou du genou.
function ik(root, target, l1, l2, prefer) {
  let dx = target[0] - root[0], dy = target[1] - root[1];
  let d = Math.hypot(dx, dy) || 0.001;
  const max = l1 + l2 - 0.05, min = Math.abs(l1 - l2) + 0.05;
  const k = d > max ? max / d : d < min ? min / d : 1;
  dx *= k; dy *= k; d *= k;
  const end = [root[0] + dx, root[1] + dy];
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d, uy = dy / d; const px = root[0] + ux * a, py = root[1] + uy * a;
  const c1 = [px - uy * h, py + ux * h], c2 = [px + uy * h, py - ux * h];
  const score = (c) => (c[0] - px) * prefer[0] + (c[1] - py) * prefer[1];
  return { mid: score(c1) >= score(c2) ? c1 : c2, end };
}
const unit = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d]; };

// ---------- Poses ----------
const S = (o) => ({ hip: [100, 68.4], t: 180, f1: [103, GROUND], f2: [97, GROUND], k1: FWD, k2: FWD, ua: 4, fa: 4, ...o });
const BACKLIE = (o) => ({ sh: [58, 112], t: -91, f1: [128, GROUND], f2: [124, GROUND], k1: UP, k2: UP, ua: 92, fa: 92, ...o });
// Corps gainé : une ligne droite depuis un appui (pieds ou genoux), inclinée de phi degrés au-dessus du sol.
const LINE = (from, phi, o = {}) => ({ line: from, ang: 90 + phi, ...o });

export const ANIMS = {
  'Squat au poids du corps': { frames: [S({}), S({ hip: [80, 95], t: 145, ua: 90, fa: 90 })] },
  'Goblet squat kettlebell': { frames: [S({ h1r: [12, 12], e1: DOWN }), S({ hip: [80, 95], t: 152, h1r: [12, 12], e1: DOWN })], prop: 'kb' },
  'Fentes arrière alternées': { frames: [
    S({ hip: [106, 69], f1: [112, GROUND], f2: [102, GROUND] }),
    S({ hip: [98, 80], f1: [112, GROUND], f2: [80, 108], k2: DOWN }),
    S({ hip: [88, 93], f1: [112, GROUND], f2: [54, GROUND], k2: DOWN }),
  ] },
  'Pont fessier': { frames: [BACKLIE({}), BACKLIE({ t: -62 })] },
  'Pont fessier avec mini-band': { frames: [BACKLIE({}), BACKLIE({ t: -62 })], prop: 'miniband' },
  'Soulevé de terre jambes tendues haltères': { frames: [S({ ua: 2, fa: 2 }), S({ hip: [84, 72], t: 100, ua: -18, fa: -18 })], prop: 'db' },
  'Kettlebell swing': { frames: [S({ hip: [84, 74], t: 118, ua: -20, fa: -25 }), S({ ua: 95, fa: 95, t: 182 })], prop: 'kb', dur: 1.5, dwell: 0.02 },
  'Montées sur step': { frames: [
    S({ f1: [102, GROUND], f2: [97, GROUND] }),
    S({ hip: [106, 70], f1: [128, 98], f2: [97, GROUND] }),
    S({ hip: [124, 52], f1: [128, 98], f2: [118, 88] }),
    S({ hip: [125, 49], f1: [128, 98], f2: [122, 98] }),
  ], prop: 'step', dur: 4.4, scale: 0.8 },
  'Chaise contre le mur': { frames: [S({ hip: [76, 93], f1: [101, GROUND], f2: [97, GROUND], k1: UP, k2: UP, ua: 10, fa: 60 })], prop: 'wall', still: true },
  'Rowing TRX': { frames: [LINE([128, GROUND], 65 + 0, { ang: 205, h1a: [186, 6], e1: DOWN }), LINE([128, GROUND], 0, { ang: 195, h1r: [10, 12], e1: BACK })], prop: 'trx', anchor: [186, 6] },
  'Rowing haltère un bras': { frames: [S({ hip: [86, 72], t: 100, f1: [106, GROUND], f2: [84, GROUND], h1r: [2, 37], e1: BACK, ua2: 25, fa2: 25 }), S({ hip: [86, 72], t: 100, f1: [106, GROUND], f2: [84, GROUND], h1r: [-8, 10], e1: UP, ua2: 25, fa2: 25 })], prop: 'db' },
  'Tirage élastique bras tendus': { frames: [S({ t: 172, ua: 140, fa: 140 }), S({ t: 172, ua: 12, fa: 12 })], prop: 'band', anchor: [192, 8], scale: 0.9 },
  'Écartés élastique (face pull)': { frames: [S({ hip: [96, 69], t: 178, h1a: [196, 32], e1: DOWN }), S({ hip: [96, 69], t: 178, h1r: [6, -4], e1: UPBACK })], prop: 'band', anchor: [196, 32] },
  'Pompes inclinées (mains sur table)': { frames: [LINE([92, GROUND], 52, { h1: [160, 82], e1: UPBACK }), LINE([92, GROUND], 40, { h1: [160, 82], e1: UPBACK })], prop: 'table', feet: false },
  'Développé couché haltères au sol': { frames: [BACKLIE({ t: -90, ua: 180, fa: 180 }), BACKLIE({ t: -90, ua: 92, fa: 180 })], prop: 'db' },
  'Curl biceps haltères': { frames: [S({ ua: 6, fa: 6 }), S({ ua: 10, fa: 150 })], prop: 'db' },
  'Rotation externe élastique (épaule)': { frames: [S({ ua: 2, fa: 95 }), S({ ua: 2, fa: 40 })], prop: 'band', anchor: [196, 96] },
  'Gainage sur les avant-bras': { frames: [LINE([50, GROUND], 12.8, { h1: [156, GROUND], e1: DOWN })], still: true, feet: false },
  'Dead bug': { frames: [
    BACKLIE({ t: -90, f1: null, f2: null, ua: 180, fa: 180, ua2: 180, fa2: 180, th1: 180, sh1: 90, th2: 180, sh2: 90 }),
    BACKLIE({ t: -90, f1: null, f2: null, ua: 262, fa: 262, ua2: 180, fa2: 180, th1: 180, sh1: 90, th2: 104, sh2: 98 }),
  ], feet: false },
  'Bird dog (quadrupédie)': { frames: [
    { hip: [80, 93], t: 109, ua: 0, fa: 0, h2: [118, GROUND], e2: BACK, th1: 0, sh1: -90, th2: 0, sh2: -90 },
    { hip: [80, 93], t: 109, ua: 98, fa: 98, h2: [118, GROUND], e2: BACK, th1: -92, sh1: -92, th2: 0, sh2: -90 },
  ], feet: false },
  'Gainage latéral sur les genoux': { frames: [LINE([70, GROUND], 17.9, { seg: 25, sh1: -90, sh2: -90, h1: [150, GROUND], e1: DOWN, h2: [96, 104], e2: UP })], still: true, feet: false },
  'Pallof press élastique': { frames: [S({ h1r: [10, 12], e1: DOWN }), S({ h1r: [36, 8], e1: DOWN })], prop: 'band-side' },
  'Planche bras tendus': { frames: [LINE([50, GROUND], 24, { h1: [131, GROUND], e1: BACK })], still: true, feet: false },
  'Superman allongé sur le ventre': { frames: [
    { hip: [96, 113], t: 90, ua: 90, fa: 90, th1: -90, sh1: -90, th2: -90, sh2: -90 },
    { hip: [96, 113], t: 101, ua: 106, fa: 106, th1: -101, sh1: -101, th2: -99, sh2: -99 },
  ], feet: false },
  'Pompes sur les genoux': { frames: [LINE([70, GROUND], 35.8, { seg: 25, sh1: -125, sh2: -125, h1: [123, GROUND], e1: UPBACK }), LINE([70, GROUND], 16, { seg: 25, sh1: -125, sh2: -125, h1: [123, GROUND], e1: UPBACK })], feet: false },
  'Pompes classiques': { frames: [LINE([40, GROUND], 25, { h1: [121.6, GROUND], e1: UPBACK }), LINE([40, GROUND], 12, { h1: [121.6, GROUND], e1: UPBACK })], feet: false },
  'Squat sauté': { frames: [S({ hip: [80, 95], t: 145, ua: -30, fa: -30 }), S({ hip: [100, 58], f1: [103, 107], f2: [97, 107], ua: 172, fa: 172 })], dur: 1.8, dwell: 0.06, scale: 0.84 },
  'Gainage latéral': { frames: [LINE([45, GROUND], 12.8, { h1: [151, GROUND], e1: DOWN, h2: [96, 100], e2: UP })], still: true, feet: false },
  'Respiration ventrale allongé, jambes fléchies': { frames: [BACKLIE({ h1: [80, 104], e1: UP }), BACKLIE({ h1: [80, 104], e1: UP })], breath: true, dur: 9 },
};

// Squelette d'une pose.
function solve(p) {
  let hip, sh, t = p.t, seg = p.seg || LEN.th + LEN.sh;
  let k1, a1, k2, a2;
  if (p.line) {
    t = p.ang;
    hip = vec(p.line, t, seg); sh = vec(hip, t, LEN.torso);
    if (p.seg) { // appui sur les genoux : cuisses dans l'axe, tibias libres
      k1 = p.line; k2 = [p.line[0] - 3, p.line[1]];
      a1 = vec(k1, p.sh1 ?? -90, LEN.sh); a2 = vec(k2, p.sh2 ?? -90, LEN.sh);
    } else {
      k1 = vec(p.line, t, LEN.sh); a1 = p.line; k2 = [k1[0] - 3, k1[1] + 1]; a2 = [p.line[0] - 3, p.line[1]];
    }
  } else {
    if (p.sh) { sh = p.sh; hip = vec(sh, t + 180, LEN.torso); } else { hip = p.hip; sh = vec(hip, t, LEN.torso); }
    const leg = (f, kp, th, shA) => {
      if (f) { const r = ik(hip, f, LEN.th, LEN.sh, kp); return [r.mid, r.end]; }
      const k = vec(hip, th ?? 0, LEN.th); return [k, vec(k, shA ?? 0, LEN.sh)];
    };
    [k1, a1] = leg(p.f1, p.k1 || FWD, p.th1, p.sh1);
    [k2, a2] = p.f2 || p.th2 != null ? leg(p.f2, p.k2 || FWD, p.th2, p.sh2) : [[k1[0] - 3, k1[1]], [a1[0] - 3, a1[1]]];
  }
  const head = vec(sh, t, LEN.neck);
  const arm = (abs, rel, toward, ep, ua, fa) => {
    let target = abs;
    if (rel) target = [sh[0] + rel[0], sh[1] + rel[1]];
    if (toward) { const u = unit(sh, toward); target = [sh[0] + u[0] * (LEN.ua + LEN.fa - 0.3), sh[1] + u[1] * (LEN.ua + LEN.fa - 0.3)]; }
    if (target) { const r = ik(sh, target, LEN.ua, LEN.fa, ep || DOWN); return [r.mid, r.end]; }
    const e = vec(sh, ua ?? 0, LEN.ua); return [e, vec(e, fa ?? 0, LEN.fa)];
  };
  const [el, wr] = arm(p.h1, p.h1r, p.h1a, p.e1, p.ua, p.fa);
  const has2 = p.h2 || p.h2r || p.ua2 != null;
  const [el2, wr2] = has2 ? arm(p.h2, p.h2r, null, p.e2, p.ua2, p.fa2) : [null, null];
  return { hip, sh, head, el, wr, el2, wr2, k1, a1, k2, a2, t };
}

// Interpolation de deux poses de même forme (nombres et tableaux).
function mix(a, b, e) {
  const o = { ...a };
  for (const k of Object.keys(a)) {
    const x = a[k], y = b[k];
    if (typeof x === 'number' && typeof y === 'number') o[k] = x + (y - x) * e;
    else if (Array.isArray(x) && Array.isArray(y)) o[k] = x.map((v, i) => v + (y[i] - v) * e);
  }
  return o;
}
// Courbe douce (départ et arrivée sans à-coup) avec un léger temps d'arrêt en fin de mouvement.
const ease = (u) => u * u * u * (u * (u * 6 - 15) + 10);
function poseAt(def, t) {
  const F = def.frames;
  if (def.still || F.length === 1) {
    const base = F[0]; const s = Math.sin(t * Math.PI * 2);
    if (base.line) return { ...base, ang: base.ang + 0.25 * s };
    return { ...base, hip: base.hip ? [base.hip[0], base.hip[1] + 0.6 * s] : base.hip };
  }
  // Aller-retour : 0 → n-1 → 0
  const segs = (F.length - 1) * 2; const x = t * segs; const i = Math.min(segs - 1, Math.floor(x)); let u = x - i;
  const dwell = def.dwell ?? 0.12;
  u = u < dwell ? 0 : (u - dwell) / (1 - dwell);
  const e = ease(Math.min(1, Math.max(0, u)));
  const [from, to] = i < F.length - 1 ? [F[i], F[i + 1]] : [F[segs - i], F[segs - i - 1]];
  return mix(from, to, e);
}

function draw(name, t, color) {
  const def = ANIMS[name]; if (!def) return '';
  const p = poseAt(def, t);
  const P = solve(p);
  const f = (n) => n.toFixed(1);
  const line = (a, b, w = 7, c = color, op = 1) => `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" opacity="${op}"/>`;
  const ground = `<line x1="0" y1="${GROUND + 4}" x2="${W}" y2="${GROUND + 4}" stroke="#D6DAE1" stroke-width="2"/>`;
  let s = '';
  if (def.prop === 'wall') s += `<line x1="69" y1="10" x2="69" y2="${GROUND + 4}" stroke="#A9B0BC" stroke-width="4"/>`;
  if (def.prop === 'step') s += `<rect x="110" y="${98 + 3}" width="44" height="${GROUND + 1 - 98}" rx="3" fill="#C5CAD3"/>`;
  if (def.prop === 'table') s += `<rect x="140" y="85" width="58" height="6" rx="2" fill="#A9B0BC"/><line x1="190" y1="91" x2="190" y2="${GROUND + 4}" stroke="#A9B0BC" stroke-width="4"/><line x1="146" y1="91" x2="146" y2="${GROUND + 4}" stroke="#A9B0BC" stroke-width="4"/>`;
  if (def.prop === 'trx') s += `<circle cx="${def.anchor[0]}" cy="${def.anchor[1]}" r="3" fill="#5E6573"/>` + line(def.anchor, P.wr, 2, '#5E6573');
  if (def.prop === 'band') s += `<circle cx="${def.anchor[0]}" cy="${def.anchor[1]}" r="3" fill="#A9B0BC"/>` + line(def.anchor, P.wr, 2.5, '#E5533D');
  if (def.prop === 'band-side') s += line([196, P.wr[1]], P.wr, 2.5, '#E5533D');
  const foot = (a, k) => (def.feet === false ? '' : line(a, [a[0] + 8, Math.min(a[1] + 1, GROUND + 1)], 5, color, k));
  // Membres « du fond » plus clairs
  s += line(P.hip, P.k2, 8, color, 0.45) + line(P.k2, P.a2, 7, color, 0.45) + foot(P.a2, 0.45);
  if (P.el2) s += line(P.sh, P.el2, 6, color, 0.45) + line(P.el2, P.wr2, 5, color, 0.45);
  s += line(P.hip, P.sh, 10) + line(P.hip, P.k1, 8) + line(P.k1, P.a1, 7) + foot(P.a1, 1);
  s += line(P.sh, P.el, 6) + line(P.el, P.wr, 5);
  s += `<circle cx="${f(P.head[0])}" cy="${f(P.head[1])}" r="8" fill="${color}"/>`;
  if (def.breath) {
    const e = (1 - Math.cos(t * Math.PI * 2)) / 2;
    const m = [(P.hip[0] + P.sh[0]) / 2, (P.hip[1] + P.sh[1]) / 2];
    s += `<ellipse cx="${f(m[0])}" cy="${f(m[1] - 5 - 4 * e)}" rx="${f(10 + 2 * e)}" ry="${f(3 + 3 * e)}" fill="${color}" opacity=".5"/>`;
    s += `<text x="${W / 2}" y="16" text-anchor="middle" font-size="12" font-weight="600" fill="#5E6573">${e > 0.5 ? 'Inspire… le ventre se gonfle' : 'Expire… le ventre se creuse'}</text>`;
  }
  if (def.prop === 'kb') s += `<circle cx="${f(P.wr[0])}" cy="${f(P.wr[1] + 6)}" r="7" fill="#16181D"/>`;
  if (def.prop === 'db') s += `<rect x="${f(P.wr[0] - 7)}" y="${f(P.wr[1] - 3)}" width="14" height="6" rx="2" fill="#16181D"/>`;
  if (def.prop === 'miniband') s += `<circle cx="${f(P.k1[0])}" cy="${f(P.k1[1])}" r="6" fill="none" stroke="#E5533D" stroke-width="2.5"/>`;
  // Les exercices qui montent haut (marche, saut, bras en l'air) sont dessinés un peu plus petits pour rester dans le cadre.
  if (def.scale) s = `<g transform="translate(${W / 2} ${GROUND + 4}) scale(${def.scale}) translate(${-W / 2} ${-(GROUND + 4)})">${s}</g>`;
  return ground + s;
}

export const hasAnim = (name) => !!ANIMS[name];
export function animSvg(name) {
  const n = name.replace(/"/g, '&quot;');
  return `<div style="position:relative;max-width:260px;margin:0 auto;width:100%">
    <svg class="ex-anim" data-anim="${n}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Animation de l'exercice ${n}" style="width:100%;display:block;background:#F3F5F8;border-radius:12px;cursor:pointer"></svg>
    <button type="button" class="anim-toggle" aria-label="Mettre l'animation en pause" style="position:absolute;right:8px;top:8px;border:0;border-radius:99px;min-width:36px;min-height:36px;background:rgba(255,255,255,.9);font-size:14px;cursor:pointer">❚❚</button></div>`;
}
let running = false;
// Anime toutes les silhouettes présentes à l'écran ; s'arrête tout seul quand il n'y en a plus.
export function startAnims(color = '#1F6FB2') {
  document.querySelectorAll('.anim-toggle').forEach((b) => {
    if (b.dataset.bound) return; b.dataset.bound = '1';
    const svg = b.previousElementSibling;
    const toggle = () => { const p = svg.dataset.paused === '1'; svg.dataset.paused = p ? '0' : '1'; b.textContent = p ? '❚❚' : '▶'; b.setAttribute('aria-label', p ? 'Mettre l\'animation en pause' : 'Relancer l\'animation'); };
    b.onclick = toggle; svg.onclick = toggle;
  });
  if (running) return; running = true;
  const t0 = performance.now();
  const tick = (now) => {
    const els = document.querySelectorAll('svg.ex-anim');
    if (!els.length) { running = false; return; }
    els.forEach((el) => {
      const def = ANIMS[el.dataset.anim]; if (!def) return;
      if (el.dataset.paused === '1' && el.innerHTML) return;
      const dur = def.dur || (def.still ? 4 : (def.frames.length - 1) * 3.2);
      const t = ((now - t0) / 1000 / dur) % 1;
      el.innerHTML = draw(el.dataset.anim, t, color);
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
export const frame = (name, t, color = '#1F6FB2') => draw(name, t, color);

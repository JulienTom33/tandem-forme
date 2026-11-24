// Petites animations maison des exercices (silhouette vue de profil), façon GIF, dessinées en SVG.
// Une pose = des angles en degrés : 0 = vers le bas, 90 = vers l'avant (droite), -90 = vers l'arrière, 180 = vers le haut.
// t : buste (de la hanche vers l'épaule), ua/fa : bras et avant-bras, th1/sh1 et th2/sh2 : cuisses et tibias.
// anchor : 'feet' (pieds au sol) ou 'low' (le point le plus bas au sol, pour les exercices allongés).

const L = { torso: 40, neck: 13, ua: 20, fa: 18, th: 25, sh: 25 };
const W = 200, H = 130, GROUND = 118;
const rad = (d) => (d * Math.PI) / 180;
const vec = (p, a, len) => [p[0] + Math.sin(rad(a)) * len, p[1] + Math.cos(rad(a)) * len];

const STAND = { t: 180, ua: 0, fa: 0, th1: 0, sh1: 0, th2: 0, sh2: 0, anchor: 'feet' };
const LIE = { anchor: 'low' };

// Pose de départ (a), pose d'arrivée (b), accessoires, mode « statique » (on respire seulement).
export const ANIMS = {
  'Squat au poids du corps': { a: { ...STAND }, b: { ...STAND, t: 145, ua: 90, fa: 90, th1: 85, sh1: -20, th2: 85, sh2: -20 } },
  'Goblet squat kettlebell': { a: { ...STAND, ua: 25, fa: 165 }, b: { ...STAND, t: 155, ua: 40, fa: 175, th1: 85, sh1: -20, th2: 85, sh2: -20 }, prop: 'kb' },
  'Fentes arrière alternées': { a: { ...STAND }, b: { ...STAND, th1: 70, sh1: -5, th2: -25, sh2: -95 } },
  'Pont fessier': { a: { ...LIE, t: -90, ua: 90, fa: 90, th1: 140, sh1: 15, th2: 140, sh2: 15 }, b: { ...LIE, t: -112, ua: 70, fa: 70, th1: 115, sh1: 5, th2: 115, sh2: 5 } },
  'Pont fessier avec mini-band': { a: { ...LIE, t: -90, ua: 90, fa: 90, th1: 140, sh1: 15, th2: 140, sh2: 15 }, b: { ...LIE, t: -112, ua: 70, fa: 70, th1: 115, sh1: 5, th2: 115, sh2: 5 }, prop: 'miniband' },
  'Soulevé de terre jambes tendues haltères': { a: { ...STAND }, b: { ...STAND, t: 100, ua: 0, fa: 0, th1: -12, sh1: 0, th2: -12, sh2: 0 }, prop: 'db' },
  'Kettlebell swing': { a: { ...STAND, t: 115, ua: -15, fa: -20, th1: 25, sh1: -10, th2: 25, sh2: -10 }, b: { ...STAND, t: 182, ua: 95, fa: 95 }, prop: 'kb', speed: 1.6 },
  'Montées sur step': { a: { ...STAND, lift: 0 }, b: { ...STAND, lift: 1 }, prop: 'step' },
  'Chaise contre le mur': { a: { ...STAND, ua: 0, fa: 0, th1: 90, sh1: 0, th2: 90, sh2: 0 }, b: { ...STAND, ua: 0, fa: 0, th1: 90, sh1: 0, th2: 90, sh2: 0 }, prop: 'wall', still: true },
  'Rowing TRX': { a: { ...STAND, t: 205, ua: 135, fa: 135, th1: 25, sh1: 25, th2: 25, sh2: 25 }, b: { ...STAND, t: 195, ua: -40, fa: 140, th1: 18, sh1: 18, th2: 18, sh2: 18 }, prop: 'trx' },
  'Rowing haltère un bras': { a: { ...STAND, t: 98, ua: 0, fa: 0, th1: 10, sh1: 0, th2: 15, sh2: -5 }, b: { ...STAND, t: 98, ua: -140, fa: 0, th1: 10, sh1: 0, th2: 15, sh2: -5 }, prop: 'db' },
  'Tirage élastique bras tendus': { a: { ...STAND, ua: 150, fa: 150 }, b: { ...STAND, ua: 15, fa: 15 }, prop: 'band-high' },
  'Écartés élastique (face pull)': { a: { ...STAND, ua: 95, fa: 95 }, b: { ...STAND, ua: -110, fa: 150 }, prop: 'band-face' },
  'Pompes inclinées (mains sur table)': { a: { ...STAND, anchor: 'feet', t: 125, ua: 20, fa: 20, th1: -55, sh1: -55, th2: -55, sh2: -55, rootBody: true }, b: { ...STAND, anchor: 'feet', t: 118, ua: -45, fa: 40, th1: -62, sh1: -62, th2: -62, sh2: -62, rootBody: true }, prop: 'table' },
  'Développé couché haltères au sol': { a: { ...LIE, t: -90, ua: 180, fa: 180, th1: 150, sh1: 30, th2: 150, sh2: 30 }, b: { ...LIE, t: -90, ua: 2, fa: 178, th1: 150, sh1: 30, th2: 150, sh2: 30 }, prop: 'db' },
  'Curl biceps haltères': { a: { ...STAND }, b: { ...STAND, ua: 5, fa: 160 }, prop: 'db' },
  'Rotation externe élastique (épaule)': { a: { ...STAND, ua: 0, fa: 95 }, b: { ...STAND, ua: 0, fa: 40 }, prop: 'band-side' },
  'Gainage sur les avant-bras': { a: { ...LIE, t: 93, ua: 0, fa: 90, th1: -87, sh1: -87, th2: -87, sh2: -87 }, b: { ...LIE, t: 95, ua: 0, fa: 90, th1: -85, sh1: -85, th2: -85, sh2: -85 }, still: true },
  'Dead bug': { a: { ...LIE, t: -90, ua: 180, fa: 180, th1: 180, sh1: 90, th2: 180, sh2: 90 }, b: { ...LIE, t: -90, ua: -110, fa: -110, th1: 180, sh1: 90, th2: 100, sh2: 100 } },
  'Bird dog (quadrupédie)': { a: { ...LIE, t: 90, ua: 0, fa: 0, th1: 0, sh1: -90, th2: 0, sh2: -90 }, b: { ...LIE, t: 90, ua: 0, fa: 0, th1: 0, sh1: -90, th2: -95, sh2: -95, arm2: 95 } },
  'Gainage latéral sur les genoux': { a: { ...LIE, t: 110, ua: 0, fa: 90, th1: -70, sh1: -90, th2: -70, sh2: -90 }, b: { ...LIE, t: 112, ua: 0, fa: 90, th1: -68, sh1: -90, th2: -68, sh2: -90 }, still: true },
  'Pallof press élastique': { a: { ...STAND, ua: 25, fa: 160, th1: 8, th2: -8 }, b: { ...STAND, ua: 92, fa: 92, th1: 8, th2: -8 }, prop: 'band-side' },
  'Respiration ventrale allongé, jambes fléchies': { a: { ...LIE, t: -90, ua: 90, fa: 90, th1: 140, sh1: 15, th2: 140, sh2: 15, belly: 0 }, b: { ...LIE, t: -90, ua: 90, fa: 90, th1: 140, sh1: 15, th2: 140, sh2: 15, belly: 1 }, speed: 0.45, breath: true },
};

function solve(p) {
  const hip = [100, 60];
  const sh = vec(hip, p.t, L.torso);
  const head = vec(sh, p.t, L.neck);
  const el = vec(sh, p.ua, L.ua); const wr = vec(el, p.fa, L.fa);
  const el2 = p.arm2 != null ? vec(sh, p.arm2, L.ua) : null; const wr2 = el2 ? vec(el2, p.arm2, L.fa) : null;
  const k1 = vec(hip, p.th1, L.th); const a1 = vec(k1, p.sh1, L.sh);
  const k2 = vec(hip, p.th2, L.th); const a2 = vec(k2, p.sh2, L.sh);
  const pts = { hip, sh, head, el, wr, el2, wr2, k1, a1, k2, a2 };
  // Ancrage au sol
  let dx = 0, dy = 0;
  if (p.anchor === 'feet') {
    const lowFoot = Math.max(a1[1], a2[1] + (p.lift ? 0 : 0));
    dy = GROUND - lowFoot; dx = 95 - (p.rootBody ? a2[0] - 40 : a2[0]);
    if (p.rootBody) dx = 45 - a2[0];
  } else {
    const ys = [sh[1], head[1] + 8, el[1], wr[1], k1[1], a1[1], k2[1], a2[1], hip[1]];
    dy = GROUND - Math.max(...ys); dx = 100 - hip[0];
  }
  for (const k of Object.keys(pts)) if (pts[k]) pts[k] = [pts[k][0] + dx, pts[k][1] + dy];
  if (p.lift) { // montée sur la marche : le pied avant se pose dessus et le corps s'élève
    const f = p.lift; const rise = 16 * f;
    for (const k of ['hip', 'sh', 'head', 'el', 'wr']) pts[k] = [pts[k][0] + 10 * f, pts[k][1] - rise];
    pts.a1 = [pts.hip[0] + 14 * f, GROUND - 20 * f];
    pts.k1 = [pts.hip[0] + 16 * f + 2, (pts.hip[1] + pts.a1[1]) / 2 - 2 * f];
    pts.k2 = [(pts.hip[0] + pts.a2[0]) / 2 - 3 * f, (pts.hip[1] + pts.a2[1]) / 2];
  }
  return pts;
}

const lerp = (a, b, t) => a + (b - a) * t;
function mix(a, b, t) {
  const o = { ...a };
  for (const k of Object.keys(b)) if (typeof b[k] === 'number' && typeof a[k] === 'number') o[k] = lerp(a[k], b[k], t);
  return o;
}

function draw(name, t, color) {
  const def = ANIMS[name]; if (!def) return '';
  const e = def.still ? 0.5 + 0.08 * Math.sin(t * Math.PI * 2) : (1 - Math.cos(t * Math.PI * 2)) / 2;
  const p = mix(def.a, def.b, e);
  const P = solve(p);
  const line = (a, b, w = 7, c = color, op = 1) => `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" opacity="${op}"/>`;
  let s = `<line x1="0" y1="${GROUND + 4}" x2="${W}" y2="${GROUND + 4}" stroke="#D6DAE1" stroke-width="2"/>`;
  // Accessoires fixes
  if (def.prop === 'wall') s += `<line x1="${P.sh[0] - 6}" y1="10" x2="${P.sh[0] - 6}" y2="${GROUND + 4}" stroke="#A9B0BC" stroke-width="4"/>`;
  if (def.prop === 'step') s += `<rect x="${P.hip[0] + 8}" y="${GROUND - 20}" width="44" height="24" rx="3" fill="#C5CAD3"/>`;
  if (def.prop === 'table') s += `<rect x="${P.wr[0] - 6}" y="${P.wr[1] + 2}" width="60" height="6" fill="#A9B0BC"/><line x1="${P.wr[0] + 40}" y1="${P.wr[1] + 8}" x2="${P.wr[0] + 40}" y2="${GROUND + 4}" stroke="#A9B0BC" stroke-width="4"/>`;
  if (def.prop === 'trx') s += line([186, 6], P.wr, 2, '#5E6573');
  if (def.prop === 'band-high') s += line([190, 8], P.wr, 2.5, '#E5533D');
  if (def.prop === 'band-face') s += line([196, P.head[1] + 6], P.wr, 2.5, '#E5533D');
  if (def.prop === 'band-side') s += line([196, P.wr[1] + 2], P.wr, 2.5, '#E5533D');
  // Silhouette : jambe et bras « du fond » plus clairs
  s += line(P.hip, P.k2, 8, color, 0.45) + line(P.k2, P.a2, 7, color, 0.45);
  if (P.el2) s += line(P.sh, P.el2, 6, color, 0.45) + line(P.el2, P.wr2, 5, color, 0.45);
  s += line(P.hip, P.sh, 9) + line(P.hip, P.k1, 8) + line(P.k1, P.a1, 7);
  s += line(P.sh, P.el, 6) + line(P.el, P.wr, 5);
  s += `<circle cx="${P.head[0].toFixed(1)}" cy="${P.head[1].toFixed(1)}" r="8" fill="${color}"/>`;
  if (def.breath) {
    const m = [(P.hip[0] + P.sh[0]) / 2, (P.hip[1] + P.sh[1]) / 2];
    s += `<ellipse cx="${m[0].toFixed(1)}" cy="${(m[1] - 5 - 4 * e).toFixed(1)}" rx="${(10 + 2 * e).toFixed(1)}" ry="${(3 + 3 * e).toFixed(1)}" fill="${color}" opacity=".5"/>`;
    s += `<text x="${W / 2}" y="16" text-anchor="middle" font-size="12" font-weight="600" fill="#5E6573">${e > 0.5 ? 'Inspire… le ventre se gonfle' : 'Expire… le ventre se creuse'}</text>`;
  }
  if (def.prop === 'kb') s += `<circle cx="${P.wr[0].toFixed(1)}" cy="${(P.wr[1] + 6).toFixed(1)}" r="7" fill="#16181D"/>`;
  if (def.prop === 'db') s += `<rect x="${(P.wr[0] - 7).toFixed(1)}" y="${(P.wr[1] - 3).toFixed(1)}" width="14" height="6" rx="2" fill="#16181D"/>`;
  if (def.prop === 'miniband') s += `<circle cx="${P.k1[0].toFixed(1)}" cy="${P.k1[1].toFixed(1)}" r="6" fill="none" stroke="#E5533D" stroke-width="2.5"/>`;
  return s;
}

export const hasAnim = (name) => !!ANIMS[name];
export function animSvg(name) {
  const n = name.replace(/"/g, '&quot;');
  return `<div style="position:relative;max-width:320px;margin:0 auto;width:100%">
    <svg class="ex-anim" data-anim="${n}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Animation de l'exercice ${n}" style="width:100%;display:block;background:#F3F5F8;border-radius:12px;cursor:pointer"></svg>
    <button type="button" class="anim-toggle" aria-label="Mettre l'animation en pause" style="position:absolute;right:8px;top:8px;border:0;border-radius:99px;min-width:36px;min-height:36px;background:rgba(255,255,255,.9);font-size:14px;cursor:pointer">❚❚</button></div>`;
}
let running = false;
// Anime toutes les silhouettes présentes à l'écran ; s'arrête tout seul quand il n'y en a plus.
// L'animation tourne toujours (c'est elle qui montre le geste) ; un bouton permet de la mettre en pause.
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
      const t = (((now - t0) / 1000) * 0.5 * (def.speed || 1)) % 1;
      el.innerHTML = draw(el.dataset.anim, t, color);
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
export const frame = (name, t, color = '#1F6FB2') => draw(name, t, color);

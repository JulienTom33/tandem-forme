// Respiration guidée : une bulle suit une vague qui monte à l'inspiration et descend à l'expiration,
// avec un guide sonore doux et des vibrations (Android) à chaque changement.

export const BREATH = [
  { id: 'coherence', name: 'Cohérence cardiaque', emoji: '💙', desc: '5 s pour inspirer, 5 s pour expirer : 6 respirations par minute. Apaise le stress ; jusqu\'à 3 fois par jour, 5 min.', phases: [['in', 5], ['out', 5]], mins: 5 },
  { id: 'relax', name: 'Relaxation', emoji: '🌿', desc: 'Inspire 4 s, expire lentement 6 s. L\'expiration plus longue que l\'inspiration aide à se détendre.', phases: [['in', 4], ['out', 6]], mins: 5 },
  { id: 'carree', name: 'Respiration carrée', emoji: '🟦', desc: 'Inspire 4 s, bloque 4 s, expire 4 s, bloque 4 s. Pour retrouver calme et concentration.', phases: [['in', 4], ['hold', 4], ['out', 4], ['hold', 4]], mins: 3 },
  { id: 'sommeil', name: 'Avant de dormir (4-7-8)', emoji: '🌙', desc: 'Inspire 4 s par le nez, retiens 7 s, expire 8 s par la bouche. À faire au lit, lumière éteinte.', phases: [['in', 4], ['hold', 7], ['out', 8]], mins: 3 },
  { id: 'decouverte', name: 'Découverte', emoji: '✨', desc: 'Un rythme doux de 4 s / 4 s pour débuter.', phases: [['in', 4], ['out', 4]], mins: 3 },
];
export const PHASE_LABEL = { in: 'Inspire', out: 'Expire', hold: 'Bloque' };

// Position de la vague (0 = bas, 1 = haut) à l'instant t (en secondes).
function levelAt(phases, t) {
  const T = phases.reduce((a, p) => a + p[1], 0);
  let u = ((t % T) + T) % T; let lvl = 0;
  for (let i = 0; i < phases.length; i++) {
    const [k, d] = phases[i];
    const e = (1 - Math.cos(Math.PI * Math.min(1, u / d))) / 2;
    if (u < d) return { level: k === 'in' ? lvl + (1 - lvl) * e : k === 'out' ? lvl * (1 - e) : lvl, phase: k, idx: i, dur: d, cycle: Math.floor(t / T), left: Math.ceil(d - u) };
    lvl = k === 'in' ? 1 : k === 'out' ? 0 : lvl; u -= d;
  }
  return { level: lvl, phase: phases[0][0], left: phases[0][1] };
}

// Lance une séance dans un <svg> ; renvoie { pause, resume, stop }. onTick(restant en s), onEnd().
export function runBreath(svg, phases, totalSec, { color = '#1F6FB2', sound = true, vibrate = true, onTick, onEnd } = {}) {
  const W = 320, H = 230, PX = 34, BX = 70; // 34 px par seconde, bulle à 70 px du bord
  let ac = null; let last = null; let elapsed = -3; let paused = false; let raf = 0; let prev = performance.now(); let lock = null;
  if (sound) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; } }
  try { navigator.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {}); } catch { /* rien */ }
  const tone = (from, to, dur) => {
    if (!ac) return;
    const o = ac.createOscillator(); const g = ac.createGain(); const t0 = ac.currentTime;
    o.type = 'sine'; o.frequency.setValueAtTime(from, t0); o.frequency.linearRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.06, t0 + 0.4); g.gain.setValueAtTime(0.06, t0 + Math.max(0.5, dur - 0.6)); g.gain.linearRampToValueAtTime(0, t0 + dur);
    o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  };
  const Y = (lvl) => H - 40 - lvl * (H - 90);
  const frame = (now) => {
    if (!document.contains(svg)) return stop();
    const dt = (now - prev) / 1000; prev = now;
    if (!paused) elapsed += dt;
    if (elapsed >= totalSec) { draw(totalSec); stop(); onEnd?.(); return; }
    draw(elapsed);
    raf = requestAnimationFrame(frame);
  };
  function draw(t) {
    const tt = Math.max(0, t);
    let pts = '';
    for (let x = 0; x <= W; x += 4) { const s = tt + (x - BX) / PX; pts += `${x},${Y(s < 0 ? 0 : levelAt(phases, s).level).toFixed(1)} `; }
    const cur = levelAt(phases, tt);
    const key = `${cur.cycle}-${cur.idx}`;
    if (t >= 0 && !paused && last !== key) {
      if (cur.phase === 'in') tone(196, 294, cur.dur); else if (cur.phase === 'out') tone(294, 196, cur.dur);
      if (vibrate) navigator.vibrate?.(cur.phase === 'hold' ? [20] : [40]);
      last = key;
    }
    const label = t < 0 ? 'Prépare-toi…' : paused ? 'En pause' : PHASE_LABEL[cur.phase];
    const big = t < 0 ? Math.ceil(-t) : cur.left;
    svg.innerHTML = `<defs><linearGradient id="bw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity=".04"/></linearGradient></defs>
      <polygon points="0,${H} ${pts}${W},${H}" fill="url(#bw)"/>
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" opacity=".7"/>
      <line x1="${BX}" y1="40" x2="${BX}" y2="${H - 30}" stroke="${color}" stroke-opacity=".15" stroke-dasharray="3 5"/>
      <circle cx="${BX}" cy="${Y(t < 0 ? 0 : cur.level).toFixed(1)}" r="16" fill="${color}"/><circle cx="${BX}" cy="${Y(t < 0 ? 0 : cur.level).toFixed(1)}" r="24" fill="${color}" opacity=".18"/>
      <text x="${W / 2 + 30}" y="34" text-anchor="middle" font-size="22" font-weight="700" fill="#16181D">${label}</text>
      <text x="${W / 2 + 30}" y="62" text-anchor="middle" font-size="18" fill="#5E6573">${paused ? '' : big}</text>`;
    onTick?.(Math.max(0, Math.ceil(totalSec - Math.max(0, t))));
  }
  function stop() { cancelAnimationFrame(raf); try { ac?.close(); } catch { /* rien */ } try { lock?.release(); } catch { /* rien */ } }
  raf = requestAnimationFrame(frame);
  return { pause: () => { paused = true; try { ac?.suspend(); } catch { /* rien */ } }, resume: () => { paused = false; try { ac?.resume(); } catch { /* rien */ } }, stop };
}

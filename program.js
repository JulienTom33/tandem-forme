// Génération du programme (règles simples, sans IA) et choix des repas.

export const COLORS = [
  { id: 'corail', name: 'Corail', hex: '#E5533D' },
  { id: 'ocean', name: 'Océan', hex: '#1F6FB2' },
  { id: 'sauge', name: 'Sauge', hex: '#3F7D5C' },
  { id: 'prune', name: 'Prune', hex: '#7B3F8C' },
  { id: 'soleil', name: 'Soleil', hex: '#C98A12' },
];
export const colorHex = (id) => (COLORS.find((c) => c.id === id) || COLORS[1]).hex;

export const ALLERGENS = [
  ['gluten', 'Gluten'], ['crustaces', 'Crustacés'], ['oeufs', 'Œufs'], ['poisson', 'Poisson'],
  ['arachide', 'Arachide'], ['soja', 'Soja'], ['lait', 'Lait'], ['fruits_a_coque', 'Fruits à coque'],
  ['celeri', 'Céleri'], ['moutarde', 'Moutarde'], ['sesame', 'Sésame'], ['sulfites', 'Sulfites'],
  ['lupin', 'Lupin'], ['mollusques', 'Mollusques'],
];
export const DIETS = [
  ['vegetarien', 'Végétarien'], ['pescetarien', 'Pescétarien'], ['sans_porc', 'Sans porc'], ['sans_lactose', 'Sans lactose'],
];
export const ZONES = [
  ['nuque', 'Nuque / cervicales'], ['epaule', 'Épaule'], ['coude', 'Coude'], ['poignet', 'Poignet'],
  ['dos', 'Bas du dos'], ['cotes', 'Côtes / intercostaux'], ['hanche', 'Hanche'], ['genou', 'Genou'], ['cheville', 'Cheville'],
];
export const ZONE_TYPES = [['douleur', 'Douleur'], ['tendinite', 'Tendinite'], ['blessure', 'Blessure'], ['operation', 'Opération'], ['autre', 'Autre']];

export const EQUIPMENT = [
  ['Cardio', [['velo', 'Vélo d\'appartement'], ['tapis_course', 'Tapis de course'], ['rameur', 'Rameur'], ['elliptique', 'Elliptique'], ['corde', 'Corde à sauter'], ['marche', 'Marche dehors'], ['course', 'Course dehors']]],
  ['Charges', [['kettlebell', 'Kettlebell'], ['halteres', 'Haltères'], ['barre', 'Barre et disques'], ['medecine_ball', 'Médecine-ball'], ['gilet', 'Gilet lesté']]],
  ['Suspension et élastiques', [['trx', 'TRX / sangles'], ['elastiques', 'Bandes élastiques'], ['mini_bands', 'Mini-bands'], ['barre_traction', 'Barre de traction']]],
  ['Sol et mobilité', [['tapis', 'Tapis de sol'], ['swiss_ball', 'Swiss ball'], ['rouleau', 'Rouleau de massage'], ['step', 'Step'], ['banc', 'Banc']]],
];

// Exercices : matériel requis (null = poids du corps), zones à éviter, groupe.
const EX = [
  { n: 'Squat au poids du corps', eq: null, avoid: ['genou'], g: 'bas' },
  { n: 'Goblet squat kettlebell', eq: 'kettlebell', avoid: ['genou', 'dos'], g: 'bas' },
  { n: 'Fentes arrière alternées', eq: null, avoid: ['genou', 'cheville'], g: 'bas' },
  { n: 'Pont fessier', eq: null, avoid: [], g: 'bas' },
  { n: 'Pont fessier avec mini-band', eq: 'mini_bands', avoid: [], g: 'bas' },
  { n: 'Soulevé de terre jambes tendues haltères', eq: 'halteres', avoid: ['dos'], g: 'bas' },
  { n: 'Kettlebell swing', eq: 'kettlebell', avoid: ['dos', 'epaule', 'nuque'], g: 'bas' },
  { n: 'Montées sur step', eq: 'step', avoid: ['genou', 'cheville'], g: 'bas' },
  { n: 'Chaise contre le mur', eq: null, avoid: ['genou'], g: 'bas' },
  { n: 'Rowing TRX', eq: 'trx', avoid: ['epaule', 'coude'], g: 'haut' },
  { n: 'Rowing haltère un bras', eq: 'halteres', avoid: ['epaule', 'dos'], g: 'haut' },
  { n: 'Tirage élastique bras tendus', eq: 'elastiques', avoid: [], g: 'haut' },
  { n: 'Écartés élastique (face pull)', eq: 'elastiques', avoid: ['nuque'], g: 'haut' },
  { n: 'Pompes inclinées (mains sur table)', eq: null, avoid: ['epaule', 'poignet', 'coude'], g: 'haut' },
  { n: 'Développé couché haltères au sol', eq: 'halteres', avoid: ['epaule', 'coude'], g: 'haut' },
  { n: 'Curl biceps haltères', eq: 'halteres', avoid: ['coude', 'poignet'], g: 'haut' },
  { n: 'Rotation externe élastique (épaule)', eq: 'elastiques', avoid: [], g: 'haut', rehab: 'epaule' },
  { n: 'Gainage sur les avant-bras', eq: null, avoid: ['epaule', 'cotes', 'dos'], g: 'tronc' },
  { n: 'Dead bug', eq: null, avoid: [], g: 'tronc' },
  { n: 'Bird dog (quadrupédie)', eq: null, avoid: ['poignet'], g: 'tronc' },
  { n: 'Gainage latéral sur les genoux', eq: null, avoid: ['epaule', 'cotes'], g: 'tronc' },
  { n: 'Pallof press élastique', eq: 'elastiques', avoid: ['cotes'], g: 'tronc' },
  { n: 'Respiration ventrale allongé, jambes fléchies', eq: null, avoid: [], g: 'tronc' },
  { n: 'Planche bras tendus', eq: null, avoid: ['poignet', 'epaule', 'cotes'], g: 'tronc' },
  { n: 'Superman allongé sur le ventre', eq: null, avoid: ['dos', 'nuque'], g: 'tronc' },
];

const DAY_MS = 86400000;
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => iso(new Date(parseDay(s).getTime() + n * DAY_MS + 3600000));
export const mondayOf = (s) => { const d = parseDay(s); const k = (d.getDay() + 6) % 7; return addDays(s, -k); };

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Un exercice convient-il à cette personne (ses zones fragiles) ?
export function allowedFor(name, member) {
  const e = EX.find((x) => x.n === name); if (!e) return true;
  const zones = ((member?.health && member.health.zones) || []).map((z) => z.zone);
  return !e.avoid.some((z) => zones.includes(z));
}
function zonesOf(member) {
  return ((member.health && member.health.zones) || []).map((z) => z.zone);
}

function pickExercises(member, eqSet, groups, seed, count) {
  const zones = zonesOf(member);
  const ok = EX.filter((e) => (!e.eq || eqSet.has(e.eq)) && !e.avoid.some((z) => zones.includes(z)));
  const out = [];
  for (const g of groups) {
    const pool = ok.filter((e) => e.g === g && !out.includes(e));
    if (!pool.length) continue;
    out.push(pool[hash(seed + g) % pool.length]);
  }
  let i = 0;
  while (out.length < count && i < 40) {
    const pool = ok.filter((e) => !out.includes(e));
    if (!pool.length) break;
    out.push(pool[hash(seed + i) % pool.length]);
    i++;
  }
  const rehab = EX.filter((e) => e.rehab && zones.includes(e.rehab) && (!e.eq || eqSet.has(e.eq)));
  for (const r of rehab) if (!out.includes(r)) out.push(r);
  return out;
}

// settings : { equipment:[], weeks, start_date, run_from_week, days_off:[] }
export const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const DEFAULT_AVAIL = { days: [0, 1, 2, 3, 4, 5], sessions: 4, minutes: 30 };
export function availOf(m) {
  const a = { ...DEFAULT_AVAIL, ...(m.availability || {}) };
  a.days = (a.days && a.days.length ? a.days : DEFAULT_AVAIL.days).map(Number).filter((d) => d >= 0 && d <= 6).sort((x, y) => x - y);
  a.sessions = Math.max(1, Math.min(6, Number(a.sessions) || 4, a.days.length));
  a.minutes = [20, 30, 45, 60].includes(Number(a.minutes)) ? Number(a.minutes) : 30;
  return a;
}
// Répartit n séances sur les jours disponibles, le plus espacées possible.
function spread(days, n) {
  if (n >= days.length) return [...days];
  const out = [];
  for (let i = 0; i < n; i++) out.push(days[Math.round((i * (days.length - 1)) / Math.max(1, n - 1))]);
  return [...new Set(out)];
}
// Ordre des séances selon le nombre par semaine : on alterne renfo et cardio, la sortie longue en fin de semaine.
const ROTATION = {
  1: ['renfo'], 2: ['renfo', 'long'], 3: ['renfo', 'cardio', 'long'], 4: ['renfo', 'cardio', 'renfo', 'long'],
  5: ['renfo', 'cardio', 'renfo', 'cardio', 'long'], 6: ['renfo', 'cardio', 'renfo', 'cardio', 'renfo', 'long'],
};

// settings : { equipment:[], weeks, start_date, run_from_week } ; chaque membre a ses disponibilités (jours, séances par semaine, durée).
export function generatePlan(settings, members) {
  const eq = new Set(settings.equipment || []);
  const weeks = Math.min(12, Math.max(2, Number(settings.weeks) || 6));
  const start = mondayOf(settings.start_date);
  const runFrom = Number(settings.run_from_week || 1);
  const hasBike = eq.has('velo');
  const canRun = eq.has('course');
  const canWalk = eq.has('marche') || !eq.size;
  const days = {};
  for (let w = 1; w <= weeks; w++) {
    const phase = w <= Math.ceil(weeks / 3) ? 0 : w <= Math.ceil((2 * weeks) / 3) ? 1 : 2;
    const reps = ['10 à 12', '12', '12 à 15'][phase];
    const week = Array.from({ length: 7 }, () => []);
    for (const m of members) {
      const av = availOf(m); const M = av.minutes;
      const chosen = spread(av.days, av.sessions);
      const kinds = ROTATION[chosen.length] || ROTATION[4];
      let renfoN = 0;
      chosen.forEach((dIdx, i) => {
        const day = addDays(start, (w - 1) * 7 + dIdx);
        const kind = kinds[i];
        if (kind === 'renfo') {
          const letter = 'ABC'[renfoN++ % 3];
          const rounds = Math.max(2, Math.min(4, Math.round(M / 15) + (phase >= 1 ? 1 : 0) - 1));
          const exercises = pickExercises(m, eq, ['bas', 'haut', 'tronc'], `${day}${letter}${m.id}`, M >= 45 ? 6 : 5).map((e) => e.n);
          week[dIdx].push({ key: 'renfo', title: `Renfo maison ${letter}`, minutes: M, member: m.id, exercises,
            detail: `${hasBike ? `${M >= 45 ? 10 : 5} min de vélo tranquille pour s'échauffer, puis ` : '5 min d\'échauffement articulaire, puis '}${rounds} tours de ${reps} répétitions, 1 min de pause entre les exercices. Environ ${M} min.` });
        } else if (kind === 'cardio') {
          const mins = Math.min(M + phase * 5, M + 15);
          if (canWalk) week[dIdx].push({ key: 'marche', title: 'Marche active', minutes: mins, member: m.id, detail: `${mins} min de marche d'un bon pas.` });
          else if (hasBike) week[dIdx].push({ key: 'velo', title: 'Vélo et gainage', minutes: mins + 10, member: m.id, detail: `${mins} min de vélo à allure facile (tu peux parler), puis 10 min de gainage.` });
          else week[dIdx].push({ key: 'mobilite', title: 'Étirements et mobilité', minutes: 15, member: m.id, detail: '15 min de mobilité douce.' });
        } else {
          if (canRun && w >= runFrom) {
            const n = Math.min(4 + (w - runFrom), 10);
            week[dIdx].push({ key: 'course', title: 'Course douce', minutes: n * 3 + 10, member: m.id, detail: `${n} × (1 min de course + 2 min de marche), à l'allure conversation. Aux sensations : si ça tire, on marche.` });
          } else if (hasBike && !canWalk) {
            week[dIdx].push({ key: 'velo', title: 'Vélo long', minutes: M + 15, member: m.id, detail: `${M + 15} min de vélo très facile.` });
          } else {
            const mins = Math.min(M + 15 + phase * 5, 75);
            week[dIdx].push({ key: 'balade', title: 'Grande balade', minutes: mins, member: m.id, detail: `${mins} min de marche tranquille.` });
          }
        }
      });
      // Un jour disponible restant : étirements doux (facultatifs, non comptés comme séance)
      const free = av.days.filter((d) => !chosen.includes(d));
      if (free.length) week[free[free.length - 1]].push({ key: 'mobilite', title: 'Étirements doux', minutes: 10, member: m.id, optional: true, detail: '10 min de mobilité : cou, épaules, hanches, sans forcer. Facultatif.' });
    }
    // Fusion : même séance le même jour pour les deux = une séance commune
    for (let k = 0; k < 7; k++) {
      const day = addDays(start, (w - 1) * 7 + k);
      const list = [];
      for (const s of week[k]) {
        const twin = list.find((x) => x.key === s.key && x.title === s.title);
        if (twin) { twin.for.push(s.member); if (s.exercises) twin.per[s.member] = s.exercises; if (members.length > 1 && twin.for.length > 1 && !/ensemble/.test(twin.title) && s.key !== 'renfo') twin.title += ' ensemble'; continue; }
        list.push({ key: s.key, title: s.title, detail: s.detail, minutes: s.minutes, optional: s.optional || false, for: [s.member], ...(s.exercises ? { per: { [s.member]: s.exercises } } : {}) });
      }
      list.push({ key: 'respiration', title: 'Respiration du soir', detail: 'Cohérence cardiaque : 5 min, inspirer 5 s, expirer 5 s.', for: members.map((m) => m.id), optional: true });
      days[day] = { week: w, sessions: list };
    }
  }
  return { start_date: start, weeks, days, generated_at: new Date().toISOString(), version: 2 };
}

// ---------- Repas ----------
export function season(dayStr) {
  const m = parseDay(dayStr).getMonth() + 1;
  if (m >= 3 && m <= 5) return 'printemps';
  if (m >= 6 && m <= 8) return 'ete';
  if (m >= 9 && m <= 11) return 'automne';
  return 'hiver';
}

export function eligibleRecipes(recipes, allergenMap, members) {
  const bannedAll = new Set(); const diets = new Set(); const dislikes = [];
  for (const m of members) {
    const n = m.nutrition || {};
    (n.allergens || []).forEach((a) => bannedAll.add(a));
    (n.diets || []).forEach((d) => diets.add(d));
    (n.dislikes || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).forEach((d) => dislikes.push(d));
  }
  return recipes.filter((r) => {
    const a = allergenMap[r.id] || { allergens: [], diets_excluded: [] };
    if ((a.allergens || []).some((x) => bannedAll.has(x))) return false;
    if ((a.diets_excluded || []).some((x) => diets.has(x))) return false;
    const low = r.name.toLowerCase();
    if (dislikes.some((d) => low.includes(d))) return false;
    return true;
  });
}

// Entrées et desserts facultatifs : 3 idées de saison qui tournent chaque jour.
export function courseChoices(pool, dayStr, key) {
  const s = season(dayStr);
  const inSeason = (r) => (r.season || []).includes('toutes') || (r.season || []).includes(s);
  const base = pool.filter(inSeason).length >= 3 ? pool.filter(inSeason) : pool;
  return [...base].sort((a, b) => hash(dayStr + key + a.id) - hash(dayStr + key + b.id)).slice(0, 3);
}

// 3 propositions "similaires" pour un créneau : une principale + 2 de la même famille.
export function mealChoices(pool, dayStr, slot) {
  const s = season(dayStr);
  const friday = parseDay(dayStr).getDay() === 5;
  const inSeason = (r) => (r.season || []).includes('toutes') || (r.season || []).includes(s);
  let base = pool.filter(inSeason);
  if (slot === 'soir' && friday) {
    const treats = base.filter((r) => r.is_treat);
    if (treats.length) base = treats;
  } else {
    base = base.filter((r) => !r.is_treat);
    if (slot === 'midi') { const lb = base.filter((r) => r.lunchbox); if (lb.length >= 3) base = lb; }
  }
  if (!base.length) base = pool;
  if (!base.length) return [];
  const sorted = [...base].sort((a, b) => hash(dayStr + slot + a.id) - hash(dayStr + slot + b.id));
  const main = sorted[0];
  const same = sorted.filter((r) => r !== main && r.protein === main.protein);
  const sameDish = sorted.filter((r) => r !== main && !same.includes(r) && r.dish_type === main.dish_type);
  const rest = sorted.filter((r) => r !== main && !same.includes(r) && !sameDish.includes(r));
  return [main, ...same, ...sameDish, ...rest].slice(0, 3);
}

// ---------- Niveau sportif ----------
export const LEVELS = [
  { n: 1, name: 'Débutant', desc: 'On (re)découvre le sport en douceur.' },
  { n: 2, name: 'Reprise', desc: 'Une base est là, on construit la régularité.' },
  { n: 3, name: 'Intermédiaire', desc: 'À l\'aise sur les bases, on intensifie.' },
  { n: 4, name: 'Confirmé', desc: 'Sportif régulier, on vise la performance.' },
];
// Questionnaire de départ : chaque réponse vaut 0 à 3 points.
export const LEVEL_QUESTIONS = [
  { id: 'freq', q: 'Aujourd\'hui, tu fais du sport…', a: ['Pas du tout', 'De temps en temps', '1 à 2 fois par semaine', '3 fois ou plus par semaine'] },
  { id: 'walk', q: 'Marcher 45 min d\'un bon pas, c\'est…', a: ['Difficile', 'Faisable mais fatigant', 'Facile', 'Très facile, je peux courir'] },
  { id: 'squat', q: 'Combien de squats d\'affilée (s\'asseoir sur une chaise et se relever) ?', a: ['Moins de 10', '10 à 20', '20 à 30', 'Plus de 30'] },
  { id: 'push', q: 'Les pompes, c\'est…', a: ['Impossible, même contre une table', 'Quelques-unes contre une table', '5 à 10 sur les genoux', '10 classiques ou plus'] },
  { id: 'plank', q: 'Gainage sur les avant-bras, tu tiens…', a: ['Moins de 15 s', '15 à 30 s', '30 à 60 s', 'Plus d\'1 min'] },
];
export function levelFromAnswers(ans) {
  const vals = LEVEL_QUESTIONS.map((x) => Number(ans?.[x.id] ?? 0));
  const score = vals.reduce((a, b) => a + b, 0); // 0 à 15
  return score <= 3 ? 1 : score <= 7 ? 2 : score <= 11 ? 3 : 4;
}
export const levelOf = (m) => Math.max(1, Math.min(4, Number(m?.fitness?.level) || 2));

// Intensité d'une séance de renfo selon le niveau et l'avancée dans le programme (phase 0, 1, 2).
export function renfoDose(level, phase = 0) {
  const base = [null, { rounds: 2, reps: '8 à 10', rest: 90 }, { rounds: 2, reps: '10 à 12', rest: 60 }, { rounds: 3, reps: '12 à 15', rest: 45 }, { rounds: 4, reps: '15 à 20', rest: 30 }][level];
  return { ...base, rounds: Math.min(5, base.rounds + (phase >= 1 ? 1 : 0)) };
}
export const holdSeconds = (level) => [0, 20, 30, 45, 60][level];

// Variantes plus difficiles d'un même mouvement, débloquées par le niveau.
const VARIANTS = {
  'Pompes inclinées (mains sur table)': [[3, 'Pompes sur les genoux', ['epaule', 'poignet', 'coude']], [4, 'Pompes classiques', ['epaule', 'poignet', 'coude']]],
  'Squat au poids du corps': [[4, 'Squat sauté', ['genou', 'cheville', 'dos']]],
  'Gainage latéral sur les genoux': [[3, 'Gainage latéral', ['epaule', 'cotes']]],
};
export function variantFor(name, level, member) {
  const zones = ((member?.health && member.health.zones) || []).map((z) => z.zone);
  let out = name;
  for (const [lvl, v, avoid] of VARIANTS[name] || []) if (level >= lvl && !avoid.some((z) => zones.includes(z))) out = v;
  return out;
}

// Texte de la séance pour une personne, recalculé à l'affichage : un changement de niveau s'applique tout de suite.
export function sessionText(s, member, week = 1, weeks = 6, runFrom = 1, hasBike = false) {
  const level = levelOf(member);
  const phase = week <= Math.ceil(weeks / 3) ? 0 : week <= Math.ceil((2 * weeks) / 3) ? 1 : 2;
  const M = s.minutes || 30;
  if (s.key === 'renfo') {
    const d = renfoDose(level, phase);
    return `${hasBike ? '5 à 10 min de vélo tranquille pour s\'échauffer' : '5 min d\'échauffement articulaire'}, puis ${d.rounds} tours de ${d.reps} répétitions (positions tenues : ${holdSeconds(level)} s), ${d.rest} s de pause entre les exercices.`;
  }
  if (s.key === 'marche') return `${M} min de ${['', 'marche d\'un bon pas', 'marche active', 'marche rapide, avec des côtes si possible', 'marche très rapide, ou alterne 5 min de marche et 5 min de footing léger'][level]}.`;
  if (s.key === 'velo') return `${Math.max(15, M - 10)} min de vélo ${['', 'à allure facile (tu peux parler)', 'à allure facile, avec 3 accélérations d\'1 min', 'avec 5 × (2 min soutenues + 2 min faciles)', 'avec 8 × (1 min intense + 1 min facile)'][level]}${/gainage/i.test(s.title) ? ', puis 10 min de gainage' : ''}.`;
  if (s.key === 'course') {
    const k = Math.max(0, week - runFrom);
    if (level <= 1) return `${Math.min(4 + k, 10)} × (1 min de course + 2 min de marche), à l'allure conversation. Si ça tire, on marche.`;
    if (level === 2) return `${Math.min(5 + k, 10)} × (2 min de course + 1 min de marche), à l'allure conversation.`;
    if (level === 3) return `${Math.min(3 + k, 6)} × (5 min de course + 1 min de marche), allure facile.`;
    return `${Math.min(25 + k * 5, 50)} min de course continue en endurance, puis 4 lignes droites de 20 s plus rapides.`;
  }
  if (s.key === 'balade') return `${M + 15} min de marche ${level >= 3 ? 'soutenue, avec du dénivelé si possible' : 'tranquille'}.`;
  return s.detail;
}

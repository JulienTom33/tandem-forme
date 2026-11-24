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
export function generatePlan(settings, members) {
  const eq = new Set(settings.equipment || []);
  const weeks = Math.min(12, Math.max(2, Number(settings.weeks) || 6));
  const start = mondayOf(settings.start_date);
  const runFrom = Number(settings.run_from_week || 1);
  const hasBike = eq.has('velo');
  const canRun = eq.has('course');
  const days = {};
  for (let w = 1; w <= weeks; w++) {
    const rounds = w <= Math.ceil(weeks / 3) ? 2 : w <= Math.ceil((2 * weeks) / 3) ? 3 : 3;
    const reps = w <= Math.ceil(weeks / 3) ? '10 à 12' : '12 à 15';
    const walk = Math.min(30 + (w - 1) * 3, 50);
    for (let k = 0; k < 7; k++) {
      const day = addDays(start, (w - 1) * 7 + k);
      const list = [];
      const strength = (label, seedKey) => {
        const per = {};
        for (const m of members) {
          per[m.id] = pickExercises(m, eq, ['bas', 'haut', 'tronc'], `${day}${seedKey}${m.id}`, 5).map((e) => e.n);
        }
        list.push({
          key: 'renfo', title: label,
          detail: `${hasBike ? '10 min de vélo tranquille pour s\'échauffer, puis ' : '5 min d\'échauffement articulaire, puis '}${rounds} tours de ${reps} répétitions, 1 min de pause entre les exercices.`,
          per,
        });
      };
      if (k === 0) strength('Renfo maison A', 'A');
      if (k === 2) strength('Renfo maison B', 'B');
      if (k === 4) {
        if (hasBike) list.push({ key: 'velo', title: 'Vélo et gainage', detail: `${20 + Math.min(w, 6) * 2} min de vélo à allure facile (tu peux parler), puis 10 min de gainage doux.` });
        else strength('Renfo maison C', 'C');
      }
      if (k === 1 || k === 3) {
        if (eq.has('marche') || !eq.size) list.push({ key: 'marche', title: 'Marche active', detail: `${walk} min de marche d'un bon pas, ensemble si possible.` });
        else if (hasBike) list.push({ key: 'velo', title: 'Vélo facile', detail: `${walk} min de vélo très facile.` });
      }
      if (k === 5) {
        if (canRun && w >= runFrom) {
          const n = Math.min(4 + (w - runFrom) * 1, 10);
          list.push({ key: 'course', title: 'Course douce ensemble', detail: `${n} × (1 min de course + 2 min de marche), à l'allure conversation. Aux sensations : si ça tire, on marche.` });
        } else {
          list.push({ key: 'balade', title: 'Grande balade', detail: `${45 + Math.min(w, 5) * 3} min de marche tranquille.` });
        }
      }
      if (k === 6) list.push({ key: 'mobilite', title: 'Étirements doux', detail: '10 min de mobilité : cou, épaules, hanches, sans forcer.' });
      list.push({ key: 'respiration', title: 'Respiration du soir', detail: 'Cohérence cardiaque : 5 min, inspirer 5 s, expirer 5 s.' });
      days[day] = { week: w, sessions: list };
    }
  }
  return { start_date: start, weeks, days, generated_at: new Date().toISOString() };
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

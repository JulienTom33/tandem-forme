// « Avec ce qu'il y a dans le frigo » : on choisit ses ingrédients, l'appli propose
// les recettes de la base qui collent le mieux, et compose une recette minute.

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe');

// [id, libellé, catégorie, motif de reconnaissance dans les recettes, allergène]
export const FRIDGE = [
  ['oeufs', 'Œufs', 'proteine', /\boeufs?\b/, 'oeufs'],
  ['poulet', 'Poulet', 'proteine', /poulet|volaille/],
  ['dinde', 'Dinde', 'proteine', /dinde/],
  ['steak', 'Viande hachée', 'proteine', /hach|steak/],
  ['jambon', 'Jambon', 'proteine', /jambon|lardons|bacon/],
  ['thon', 'Thon en boîte', 'proteine', /\bthon\b/, 'poisson'],
  ['saumon', 'Saumon', 'proteine', /saumon/, 'poisson'],
  ['poisson', 'Poisson blanc', 'proteine', /cabillaud|colin|lieu|merlu|poisson/, 'poisson'],
  ['crevettes', 'Crevettes', 'proteine', /crevettes/, 'crustaces'],
  ['tofu', 'Tofu', 'proteine', /tofu/, 'soja'],
  ['pois_chiches', 'Pois chiches', 'proteine', /pois chiches/],
  ['lentilles', 'Lentilles', 'proteine', /lentilles/],
  ['courgette', 'Courgette', 'legume', /courgette/],
  ['tomates', 'Tomates', 'legume', /tomate/],
  ['poivron', 'Poivron', 'legume', /poivron/],
  ['carottes', 'Carottes', 'legume', /carotte/],
  ['brocoli', 'Brocoli', 'legume', /brocoli/],
  ['epinards', 'Épinards', 'legume', /epinard/],
  ['champignons', 'Champignons', 'legume', /champignon/],
  ['oignon', 'Oignon', 'legume', /oignon|echalote/],
  ['poireau', 'Poireau', 'legume', /poireau/],
  ['haricots_verts', 'Haricots verts', 'legume', /haricots verts/],
  ['aubergine', 'Aubergine', 'legume', /aubergine/],
  ['chou_fleur', 'Chou-fleur', 'legume', /chou-fleur|chou fleur/],
  ['salade', 'Salade', 'legume', /salade|roquette|mache/],
  ['avocat', 'Avocat', 'legume', /avocat/],
  ['pdt', 'Pommes de terre', 'feculent', /pommes? de terre/],
  ['patate_douce', 'Patate douce', 'feculent', /patates? douces?/],
  ['riz', 'Riz', 'feculent', /\briz\b/],
  ['pates', 'Pâtes', 'feculent', /pates|spaghetti|tagliatelle|penne|coquillettes/, 'gluten'],
  ['semoule', 'Semoule', 'feculent', /semoule|boulgour/, 'gluten'],
  ['quinoa', 'Quinoa', 'feculent', /quinoa/],
  ['pain', 'Pain', 'feculent', /\bpains?\b/, 'gluten'],
  ['wraps', 'Wraps', 'feculent', /wraps?|tortillas?/, 'gluten'],
  ['fromage', 'Fromage râpé', 'frais', /emmental|gruyere|comte|fromage rape|parmesan/, 'lait'],
  ['feta', 'Feta', 'frais', /feta/, 'lait'],
  ['mozzarella', 'Mozzarella', 'frais', /mozzarella/, 'lait'],
  ['chevre', 'Chèvre', 'frais', /chevre/, 'lait'],
  ['creme', 'Crème', 'frais', /creme/, 'lait'],
  ['yaourt', 'Yaourt', 'frais', /yaourt/, 'lait'],
];
export const FRIDGE_CATS = [['proteine', 'Protéines'], ['legume', 'Légumes'], ['feculent', 'Féculents'], ['frais', 'Crèmerie']];
// Le placard : supposé toujours disponible.
const PANTRY = new Set(['huile', 'herbes_epices', 'eau', 'bouillon', 'vinaigre', 'moutarde', 'sucre', 'levure', 'maizena', 'farine', 'miel', 'sauce_soja', 'vinaigrette', 'vin']);

// Texte libre « reste de riz, 2 courgettes » → ids connus + mots en plus.
export function parseFree(text) {
  const ids = []; const extra = [];
  for (const part of text.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean)) {
    const n = norm(part); const hit = FRIDGE.find((f) => f[3].test(n) || norm(f[1]).includes(n) || n.includes(norm(f[1])));
    if (hit) ids.push(hit[0]); else extra.push(part);
  }
  return { ids, extra };
}

// Classe les recettes : part des ingrédients principaux qu'on a déjà.
export function matchRecipes(recipes, ingByRecipe, have, extraWords = []) {
  const pats = FRIDGE.filter((f) => have.includes(f[0])).map((f) => f[3]);
  const words = extraWords.map(norm).filter((w) => w.length > 2);
  const out = [];
  for (const r of recipes) {
    const lines = (ingByRecipe[r.id] || []).filter((l) => !PANTRY.has(l.ingredient_id) && !/\bsel\b|poivre|ail\b/.test(norm(l.label)));
    if (!lines.length) continue;
    const ok = []; const miss = [];
    for (const l of lines) { const n = norm(l.label); (pats.some((p) => p.test(n)) || words.some((w) => n.includes(w)) ? ok : miss).push(l.label); }
    if (!ok.length) continue;
    out.push({ r, ok, miss, score: ok.length / lines.length + ok.length * 0.02 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

// Recette minute composée à partir de ce qu'on a (portions = nombre de personnes).
const PROT = {
  oeufs: { q: (n) => `${n * 2} œufs`, cook: 'oeufs' },
  poulet: { q: (n) => `${n * 125} g de poulet`, cook: 'Coupe le poulet en lanières d\'1 cm et saisis-le 6 à 8 min à feu vif avec un filet d\'huile : plus de rose à l\'intérieur.' },
  dinde: { q: (n) => `${n * 125} g de dinde`, cook: 'Coupe la dinde en lanières et saisis-la 6 min à feu vif avec un filet d\'huile.' },
  steak: { q: (n) => `${n * 100} g de viande hachée`, cook: 'Fais revenir la viande hachée 5 min en l\'émiettant à la spatule, sans matière grasse.' },
  jambon: { q: (n) => `${n * 2} tranches de jambon`, cook: 'Coupe le jambon en lanières : il se réchauffe juste 1 min à la fin.' },
  thon: { q: (n) => `${n * 70} g de thon au naturel`, cook: 'Égoutte le thon et émiette-le : il s\'ajoute à la fin, sans cuisson.' },
  saumon: { q: (n) => `${n} pavé${n > 1 ? 's' : ''} de saumon`, cook: 'Cuis le saumon 4 min côté peau puis 2 min de l\'autre côté, à feu moyen, puis effeuille-le.' },
  poisson: { q: (n) => `${n * 130} g de poisson blanc`, cook: 'Cuis le poisson 3 à 4 min par face à feu moyen avec un filet d\'huile : il doit se détacher en lamelles.' },
  crevettes: { q: (n) => `${n * 100} g de crevettes décortiquées`, cook: 'Saisis les crevettes 2 à 3 min à feu vif : elles deviennent roses et opaques.' },
  tofu: { q: (n) => `${n * 100} g de tofu`, cook: 'Coupe le tofu en dés, sèche-le dans un torchon et fais-le dorer 6 min avec un filet d\'huile.' },
  pois_chiches: { q: (n) => `${n * 120} g de pois chiches cuits`, cook: 'Rince et égoutte les pois chiches, fais-les dorer 3 min à la poêle avec une pincée de cumin.' },
  lentilles: { q: (n) => `${n * 120} g de lentilles cuites`, cook: 'Rince les lentilles cuites, elles se réchauffent 3 min avec les légumes.' },
};
const VEG = {
  courgette: ['1 courgette', 'la courgette en demi-rondelles', 6], tomates: ['2 tomates', 'les tomates en dés', 3], poivron: ['1 poivron', 'le poivron en lanières', 8],
  carottes: ['2 carottes', 'les carottes en fines rondelles', 10], brocoli: ['1/2 brocoli', 'le brocoli en petits bouquets', 8], epinards: ['2 poignées d\'épinards', 'les épinards', 2],
  champignons: ['200 g de champignons', 'les champignons en lamelles', 6], oignon: ['1 oignon', 'l\'oignon émincé', 4], poireau: ['1 poireau', 'le poireau en fines rondelles', 8],
  haricots_verts: ['200 g de haricots verts', 'les haricots verts', 10], aubergine: ['1 aubergine', 'l\'aubergine en dés', 12], chou_fleur: ['1/2 chou-fleur', 'le chou-fleur en petits bouquets', 10],
  salade: ['1 salade', 'la salade', 0], avocat: ['1 avocat', 'l\'avocat en tranches', 0],
};
const STARCH = {
  riz: [(n) => `${n * 60} g de riz`, 'Fais cuire le riz dans 2 fois son volume d\'eau salée, à couvert et à feu doux, 12 min (riz blanc) à 25 min (complet).'],
  pates: [(n) => `${n * 70} g de pâtes`, 'Fais cuire les pâtes dans une grande casserole d\'eau bouillante salée, selon le temps du paquet. Garde une louche d\'eau de cuisson.'],
  semoule: [(n) => `${n * 60} g de semoule`, 'Verse la semoule dans un bol, couvre du même volume d\'eau bouillante salée, couvre 5 min puis égrène à la fourchette.'],
  quinoa: [(n) => `${n * 60} g de quinoa`, 'Rince le quinoa puis cuis-le 12 min dans 2 fois son volume d\'eau salée.'],
  pdt: [(n) => `${n * 200} g de pommes de terre`, 'Coupe les pommes de terre en cubes de 2 cm, mets-les 8 min au micro-ondes avec un fond d\'eau (ou 12 min à l\'eau), puis fais-les dorer à la poêle.'],
  patate_douce: [(n) => `${n * 200} g de patate douce`, 'Épluche la patate douce, coupe-la en cubes de 2 cm et fais-la cuire 15 min à la poêle couverte avec un filet d\'huile, en remuant.'],
  pain: [(n) => `${n * 2} tranches de pain`, 'Fais griller le pain.'],
  wraps: [(n) => `${n} wrap${n > 1 ? 's' : ''}`, 'Réchauffe les wraps 10 s à la poêle sèche.'],
};
const label = (id) => (FRIDGE.find((f) => f[0] === id) || [id, id])[1].toLowerCase().replace(' en boîte', '');
const ART = { oeufs: 'les œufs', poulet: 'le poulet', dinde: 'la dinde', steak: 'la viande hachée', jambon: 'le jambon', thon: 'le thon', saumon: 'le saumon', poisson: 'le poisson', crevettes: 'les crevettes', tofu: 'le tofu', pois_chiches: 'les pois chiches', lentilles: 'les lentilles',
  riz: 'le riz', pates: 'les pâtes', semoule: 'la semoule', quinoa: 'le quinoa', pdt: 'les pommes de terre', patate_douce: 'la patate douce', fromage: 'le fromage râpé', feta: 'la feta', mozzarella: 'la mozzarella', chevre: 'le chèvre', salade: 'la salade', avocat: 'l\'avocat' };
const art = (id) => ART[id] || label(id);
const listFr = (a) => a.length <= 1 ? (a[0] || '') : `${a.slice(0, -1).join(', ')} et ${a[a.length - 1]}`;

export function quickRecipe(have, n = 2, extra = []) {
  const prot = Object.keys(PROT).find((k) => have.includes(k));
  const veg = Object.keys(VEG).filter((k) => have.includes(k) && k !== 'salade' && k !== 'avocat').slice(0, 3).sort((a, b) => VEG[b][2] - VEG[a][2]);
  const raw = ['salade', 'avocat'].filter((k) => have.includes(k));
  const starch = Object.keys(STARCH).find((k) => have.includes(k));
  const cheese = ['fromage', 'feta', 'mozzarella', 'chevre'].find((k) => have.includes(k));
  const creme = have.includes('creme') || have.includes('yaourt');
  if (!prot && !veg.length && !starch) return null;
  const ing = []; const steps = [];
  const vegNames = veg.map((v) => VEG[v][1].replace(/ en .*/, ''));
  let title;
  if (prot === 'oeufs' && !starch) {
    title = veg.length || cheese ? `Omelette ${listFr([...veg, cheese].filter(Boolean).map(label))}` : 'Omelette nature';
    ing.push(PROT.oeufs.q(n));
    veg.forEach((v) => ing.push(VEG[v][0]));
    if (cheese) ing.push(`${n * 20} g de ${label(cheese)}`);
    if (veg.length) steps.push(`Coupe ${listFr(veg.map((v) => VEG[v][1]))}. Fais revenir dans une poêle avec un filet d'huile, ${Math.max(...veg.map((v) => VEG[v][2]))} min à feu moyen, sel et poivre.`);
    steps.push('Bats les œufs en omelette avec sel, poivre et des herbes si tu en as.');
    steps.push(`Verse les œufs dans la poêle${veg.length ? ' sur les légumes' : ''}, laisse prendre 3 à 4 min à feu doux${cheese ? `, ajoute ${art(cheese)} à mi-cuisson` : ''}, puis plie l'omelette.`);
    if (raw.length) steps.push(`Sers avec ${listFr(raw.map((r) => VEG[r][1]))}.`);
  } else if (starch === 'pain' || starch === 'wraps') {
    title = `${starch === 'wraps' ? 'Wraps' : 'Tartines chaudes'} ${listFr([prot, ...veg, cheese, ...raw].filter(Boolean).map(label)) || 'aux légumes'}`;
    ing.push(STARCH[starch][0](n)); if (prot) ing.push(PROT[prot].q(n)); veg.concat(raw).forEach((v) => ing.push(VEG[v][0])); if (cheese) ing.push(`${n * 20} g de ${label(cheese)}`);
    if (prot && prot !== 'oeufs') steps.push(PROT[prot].cook);
    if (prot === 'oeufs') steps.push('Fais des œufs brouillés : bats-les, verse dans une poêle à feu doux et remue sans arrêt 2 à 3 min, retire avant qu\'ils soient secs.');
    if (veg.length) steps.push(`Fais revenir ${listFr(veg.map((v) => VEG[v][1]))} ${Math.max(...veg.map((v) => VEG[v][2]))} min avec un filet d'huile, sel, poivre.`);
    steps.push(STARCH[starch][1]);
    const fill = [prot ? art(prot) : null, veg.length ? 'les légumes' : null, cheese ? art(cheese) : null, ...raw.map(art)].filter(Boolean);
    steps.push(`Garnis ${starch === 'wraps' ? 'chaque wrap' : 'chaque tartine'} avec ${listFr(fill)}${creme ? ', plus une cuillère de crème ou de yaourt citronné en sauce' : ''}${starch === 'wraps' ? ', puis roule-le bien serré' : ''}.`);
  } else if (!starch && raw.includes('salade')) {
    title = `Salade complète ${listFr([prot, ...veg, cheese, ...raw.filter((x) => x !== 'salade')].filter(Boolean).map(label))}`.trim();
    ing.push(VEG.salade[0]); if (prot) ing.push(PROT[prot].q(n)); veg.forEach((v) => ing.push(VEG[v][0])); if (cheese) ing.push(`${n * 25} g de ${label(cheese)}`);
    if (prot === 'oeufs') steps.push('Fais cuire les œufs 9 min dans l\'eau bouillante, refroidis-les sous l\'eau froide et coupe-les en quartiers.');
    else if (prot) steps.push(PROT[prot].cook);
    const cooked = veg.filter((v) => !['tomates', 'poivron', 'champignons', 'carottes'].includes(v));
    if (cooked.length) steps.push(`Fais revenir ${listFr(cooked.map((v) => VEG[v][1]))} ${Math.max(...cooked.map((v) => VEG[v][2]))} min, laisse tiédir.`);
    steps.push('Prépare une vinaigrette : 1 c. à c. de moutarde, 1 c. à s. de vinaigre, 2 c. à s. d\'huile, sel, poivre.');
    steps.push(`Mélange la salade avec tout le reste${cheese ? `, émiette ${art(cheese)} dessus` : ''} et assaisonne au dernier moment.`);
  } else {
    const st = starch || null;
    title = `Poêlée ${listFr([prot, ...veg, st].filter(Boolean).map(label))}`;
    if (st) ing.push(STARCH[st][0](n)); if (prot) ing.push(PROT[prot].q(n)); veg.forEach((v) => ing.push(VEG[v][0])); if (cheese) ing.push(`${n * 20} g de ${label(cheese)}`); if (creme) ing.push(`${n * 2} c. à s. de ${have.includes('creme') ? 'crème légère' : 'yaourt'}`);
    if (st) steps.push(STARCH[st][1] + ' Pendant ce temps, passe à la suite.');
    if (prot === 'oeufs') steps.push('Bats les œufs avec sel et poivre ; ils cuiront à la fin.');
    else if (prot) steps.push(PROT[prot].cook + ' Réserve sur une assiette.');
    if (veg.length) steps.push(`${prot && prot !== 'oeufs' ? 'Dans la même poêle' : 'Dans une poêle'}, fais revenir ${listFr(veg.map((v) => VEG[v][1]))} avec un filet d'huile, environ ${Math.max(...veg.map((v) => VEG[v][2]))} min${veg.length > 1 ? `, en commençant par ${vegNames[0]}, qui cuit le plus longtemps` : ''}. Sale et poivre.`);
    const fin = [];
    if (prot === 'oeufs') fin.push('verse les œufs battus sur les légumes et remue 2 min à feu doux, comme des œufs brouillés');
    else if (prot) fin.push(`remets ${art(prot)} dans la poêle`);
    if (creme) fin.push(`ajoute ${have.includes('creme') ? 'la crème' : 'le yaourt hors du feu (sinon il tranche)'}`);
    if (st) fin.push(`ajoute ${st === 'pates' ? 'les pâtes avec un peu d\'eau de cuisson' : art(st)}`);
    if (fin.length) { const t = fin.join(', puis '); steps.push(`${t.charAt(0).toUpperCase()}${t.slice(1)}. Mélange 1 min et sers.`); }
    if (cheese) steps.push(`Parsème de ${label(cheese)} au moment de servir.`);
    if (raw.length) steps.push(`Sers avec ${listFr(raw.map((r) => VEG[r][1]))}.`);
  }
  ing.push('Huile, sel, poivre (et herbes ou épices si tu en as)');
  if (extra.length) steps.push(`Tu peux aussi ajouter : ${extra.join(', ')}.`);
  return { title: title.charAt(0).toUpperCase() + title.slice(1), ing, steps, minutes: 15 + (starch === 'riz' ? 10 : 0) };
}

export const allergensOf = (have) => [...new Set(FRIDGE.filter((f) => have.includes(f[0]) && f[4]).map((f) => f[4]))];

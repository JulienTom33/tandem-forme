import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import {
  COLORS, colorHex, ALLERGENS, DIETS, ZONES, ZONE_TYPES, EQUIPMENT,
  iso, parseDay, addDays, mondayOf, generatePlan, eligibleRecipes, mealChoices,
} from './program.js';

const SUPABASE_URL = 'https://ktrsvnminsogkbxlxjpb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_KuNRSgfDThA_k2v7eatfUQ_ueIhzOyb';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

const $app = document.getElementById('app');
const $tabs = document.getElementById('tabs');
const $modal = document.getElementById('modal');
const $toast = document.getElementById('toast');

const S = {
  session: null, me: null, partner: null, tandem: null, plan: null,
  recipes: [], allergenMap: {}, view: 'today', day: iso(new Date()), loginEmail: '',
};

// ---------- utilitaires ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => iso(new Date());
const fmtDay = (s, opts = { weekday: 'long', day: 'numeric', month: 'long' }) => parseDay(s).toLocaleDateString('fr-FR', opts);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const isCaptain = () => S.tandem && S.me && S.tandem.captain_member_id === S.me.id;
const meColor = () => colorHex(S.me?.color);
const partnerColor = () => colorHex(S.partner?.color);
const num = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')));
const int = (v) => (v === '' || v == null ? null : Math.round(Number(v)));

function toast(msg) {
  $toast.textContent = msg; $toast.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => $toast.classList.remove('show'), 2600);
}
function fail(err, fallback = 'Une erreur est survenue') {
  console.error(err); toast(err?.message ? `${fallback} : ${err.message}` : fallback);
}
function openModal(html, onMount) {
  $modal.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  $modal.hidden = false;
  $modal.onclick = (e) => { if (e.target === $modal || e.target.closest('[data-close]')) closeModal(); };
  onMount && onMount($modal.querySelector('.sheet'));
}
function closeModal() { $modal.hidden = true; $modal.innerHTML = ''; }
function formData(form) { return Object.fromEntries(new FormData(form).entries()); }
function setTheme() {
  document.documentElement.style.setProperty('--me', meColor());
  document.documentElement.style.setProperty('--partner', partnerColor());
  document.querySelector('meta[name=theme-color]').setAttribute('content', meColor());
}

// ---------- démarrage ----------
async function boot() {
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  sb.auth.onAuthStateChange((_e, session) => {
    const was = !!S.session; S.session = session;
    if (!!session !== was) route();
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  route();
}

async function route() {
  if (!S.session) { $tabs.hidden = true; return location.hash === '#inscription' ? viewRegister() : viewLogin(); }
  try { await loadCore(); } catch (e) { fail(e, 'Chargement impossible'); return; }
  if (!S.me) return viewNoMember();
  setTheme();
  if (!S.me.onboarded_at) { $tabs.hidden = true; return viewOnboarding(); }
  renderTabs(); render();
}

async function loadCore() {
  const uid = S.session.user.id;
  let { data: me } = await sb.from('members').select('*').eq('user_id', uid).maybeSingle();
  if (!me) {
    await sb.rpc('claim_member');
    ({ data: me } = await sb.from('members').select('*').eq('user_id', uid).maybeSingle());
  }
  S.me = me;
  if (!me) return;
  const [{ data: others }, { data: tandem }, { data: plan }] = await Promise.all([
    sb.from('members').select('*').eq('tandem_id', me.tandem_id).neq('id', me.id),
    sb.from('tandems').select('*').eq('id', me.tandem_id).single(),
    sb.from('plans').select('*').eq('tandem_id', me.tandem_id).eq('active', true).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  S.partner = (others || [])[0] || null;
  S.tandem = tandem; S.plan = plan || null;
  if (!S.recipes.length) {
    const [{ data: rec }, { data: al }] = await Promise.all([
      sb.from('recipes').select('id,name,minutes,servings,protein,dish_type,season,is_treat,lunchbox'),
      sb.from('recipe_allergens').select('*'),
    ]);
    S.recipes = rec || [];
    S.allergenMap = Object.fromEntries((al || []).map((a) => [a.recipe_id, a]));
  }
}

// ---------- connexion / inscription ----------
function viewLogin(step = 'email', err = '') {
  $app.innerHTML = `
  <div class="hero"><div class="inner"><h1>Tandem Forme</h1><small>Le sport et les menus, à deux.</small></div></div>
  <div class="wrap">
    ${step === 'email' ? `
    <form id="f" class="card white">
      <h2>Connexion</h2>
      <label>Ton e-mail<input name="email" type="email" autocomplete="email" required value="${esc(S.loginEmail)}"></label>
      <button class="btn block">Recevoir mon code</button>
      <p class="muted small" style="margin:0">Pas de mot de passe : on t'envoie un code à 6 chiffres.</p>
    </form>
    <div class="card"><span class="title">Nouveau tandem ?</span><span class="muted">L'un de vous deux inscrit le couple avec un code d'invitation.</span>
      <a class="btn ghost" href="#inscription">S'inscrire à deux</a></div>` : `
    <form id="f" class="card white">
      <h2>Ton code</h2>
      <p class="muted" style="margin:0">Envoyé à ${esc(S.loginEmail)}. Tu peux aussi toucher le lien dans l'e-mail.</p>
      <input name="token" class="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required>
      <button class="btn block">Valider</button>
      <button type="button" class="link" id="back">Changer d'adresse</button>
    </form>`}
    ${err ? `<p class="err">${esc(err)}</p>` : ''}
  </div>`;
  const f = document.getElementById('f');
  document.getElementById('back')?.addEventListener('click', () => viewLogin('email'));
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button'); btn.disabled = true;
    const v = formData(f);
    if (step === 'email') {
      S.loginEmail = v.email.trim().toLowerCase();
      const { error } = await sb.auth.signInWithOtp({ email: S.loginEmail, options: { shouldCreateUser: false, emailRedirectTo: location.origin } });
      if (error) return viewLogin('email', /signups not allowed|not found|Signups/i.test(error.message) ? 'Adresse inconnue. Inscris-toi d\'abord avec ton code d\'invitation.' : error.message);
      viewLogin('code');
    } else {
      const { error } = await sb.auth.verifyOtp({ email: S.loginEmail, token: v.token.trim(), type: 'email' });
      if (error) return viewLogin('code', 'Code incorrect ou expiré.');
    }
  };
}

function viewRegister(err = '') {
  $app.innerHTML = `
  <div class="hero"><div class="inner"><h1>Inscrire notre tandem</h1><small>Une personne inscrit les deux. Chacun recevra son code par e-mail.</small></div></div>
  <div class="wrap">
    <form id="f" class="card white">
      <label>Code d'invitation<input name="code" required placeholder="TF-XXXX-XXXX" autocapitalize="characters"></label>
      <div class="sep"></div><h3>Toi</h3>
      <div class="grid2"><label>Prénom<input name="me_first" required autocomplete="given-name"></label><label>Nom<input name="me_last" autocomplete="family-name"></label></div>
      <label>E-mail<input name="me_email" type="email" required autocomplete="email"></label>
      <div class="sep"></div><h3>Ton ou ta partenaire</h3>
      <div class="grid2"><label>Prénom<input name="p_first" required></label><label>Nom<input name="p_last"></label></div>
      <label>E-mail<input name="p_email" type="email" required></label>
      <p class="muted small" style="margin:0">L'e-mail sert uniquement à vous connecter, sans mot de passe. Vous pourrez supprimer vos comptes à tout moment.</p>
      <button class="btn block">Créer le tandem</button>
      ${err ? `<p class="err">${esc(err)}</p>` : ''}
    </form>
    <a href="#" class="link" id="toLogin">J'ai déjà un compte</a>
  </div>`;
  document.getElementById('toLogin').onclick = (e) => { e.preventDefault(); location.hash = ''; viewLogin(); };
  const f = document.getElementById('f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const v = formData(f); const btn = f.querySelector('.btn'); btn.disabled = true; btn.textContent = 'Création…';
    const { data, error } = await sb.functions.invoke('register', {
      body: {
        code: v.code, redirect: location.origin,
        me: { first_name: v.me_first, last_name: v.me_last, email: v.me_email },
        partner: { first_name: v.p_first, last_name: v.p_last, email: v.p_email },
      },
    });
    if (error) {
      let msg = 'Inscription impossible';
      try { msg = (await error.context.json()).error || msg; } catch {}
      return viewRegister(msg);
    }
    S.loginEmail = v.me_email.trim().toLowerCase();
    location.hash = '';
    const failed = Object.values(data?.sent || {}).some((s) => s !== 'envoye');
    viewLogin('code', failed ? 'Le tandem est créé, mais un e-mail n\'a pas pu partir. Réessaie la connexion dans un instant.' : '');
  };
}

function viewNoMember() {
  $tabs.hidden = true;
  $app.innerHTML = `<div class="wrap"><h1>Compte introuvable</h1><p class="muted">Cette adresse n'est liée à aucun tandem.</p><button class="btn" id="out">Se déconnecter</button></div>`;
  document.getElementById('out').onclick = () => sb.auth.signOut();
}

// ---------- profil (premier lancement et édition) ----------
function profileForm(m, takenColor) {
  const h = m.health || {}; const n = m.nutrition || {};
  const zones = h.zones || [];
  return `
  <div class="card white"><h3>Ta couleur</h3>
    <div class="swatches">${COLORS.map((c) => `<button type="button" class="swatch" data-color="${c.id}" style="background:${c.hex}" aria-label="${c.name}${c.id === takenColor ? ' (prise)' : ''}" aria-pressed="${m.color === c.id}" ${c.id === takenColor ? 'disabled' : ''}></button>`).join('')}</div>
    <input type="hidden" name="color" value="${esc(m.color || '')}">
  </div>
  <div class="card white"><h3>Toi</h3>
    <div class="grid2"><label>Prénom<input name="first_name" required value="${esc(m.first_name)}"></label><label>Nom<input name="last_name" value="${esc(m.last_name)}"></label></div>
    <div class="grid2"><label>Date de naissance<input name="birth_date" type="date" value="${esc(m.birth_date)}"></label>
    <label>Sexe (facultatif)<select name="sex"><option value="">—</option>${[['femme', 'Femme'], ['homme', 'Homme'], ['autre', 'Autre']].map(([v, l]) => `<option value="${v}" ${m.sex === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="grid2"><label>Taille (cm)<input name="height_cm" inputmode="decimal" value="${esc(m.height_cm)}"></label><label>Poids de départ (kg)<input name="start_weight" inputmode="decimal" value="${esc(m.start_weight)}"></label></div>
    <label>Poids objectif (kg)<input name="goal_weight" inputmode="decimal" value="${esc(m.goal_weight)}"></label>
  </div>
  <div class="card white"><h3>Santé</h3>
    <p class="muted" style="margin:0">Les zones fragiles servent à écarter les exercices à risque de ton programme.</p>
    <div id="zones">${zones.map(zoneRow).join('')}</div>
    <button type="button" class="btn ghost sm" id="addZone">+ Ajouter une zone</button>
    <label>Autre chose à savoir<textarea name="health_note">${esc(h.note)}</textarea></label>
  </div>
  <div class="card white"><h3>Alimentation</h3>
    <span class="muted">Allergies et intolérances</span>
    <div class="chips" data-multi="allergens">${ALLERGENS.map(([v, l]) => `<button type="button" class="chip" data-v="${v}" aria-pressed="${(n.allergens || []).includes(v)}">${l}</button>`).join('')}</div>
    <span class="muted">Régime</span>
    <div class="chips" data-multi="diets">${DIETS.map(([v, l]) => `<button type="button" class="chip" data-v="${v}" aria-pressed="${(n.diets || []).includes(v)}">${l}</button>`).join('')}</div>
    <label>Ce que tu n'aimes pas (séparé par des virgules)<input name="dislikes" value="${esc(n.dislikes)}" placeholder="ex. chou-fleur, lentilles"></label>
  </div>`;
}
function zoneRow(z = {}) {
  return `<div class="card zone" style="margin-bottom:8px">
    <div class="grid2"><label>Zone<select name="z_zone">${ZONES.map(([v, l]) => `<option value="${v}" ${z.zone === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label>Côté<select name="z_side">${[['', '—'], ['gauche', 'Gauche'], ['droit', 'Droit'], ['deux', 'Les deux']].map(([v, l]) => `<option value="${v}" ${z.side === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="grid2"><label>Type<select name="z_type">${ZONE_TYPES.map(([v, l]) => `<option value="${v}" ${z.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label>Intensité<select name="z_int">${[['legere', 'Légère'], ['moderee', 'Modérée'], ['forte', 'Forte']].map(([v, l]) => `<option value="${v}" ${z.intensity === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <label>Mouvements à éviter<input name="z_avoid" value="${esc(z.avoid)}" placeholder="ex. bras au-dessus de la tête"></label>
    <button type="button" class="link" data-rmzone style="color:var(--danger)">Retirer cette zone</button></div>`;
}
function bindProfile(root) {
  root.querySelectorAll('.swatch').forEach((b) => b.onclick = () => {
    root.querySelectorAll('.swatch').forEach((x) => x.setAttribute('aria-pressed', 'false'));
    b.setAttribute('aria-pressed', 'true');
    root.querySelector('[name=color]').value = b.dataset.color;
    document.documentElement.style.setProperty('--me', colorHex(b.dataset.color));
  });
  root.querySelectorAll('[data-multi] .chip').forEach((b) => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
  root.querySelector('#addZone').onclick = () => root.querySelector('#zones').insertAdjacentHTML('beforeend', zoneRow());
  root.addEventListener('click', (e) => { if (e.target.matches('[data-rmzone]')) e.target.closest('.zone').remove(); });
}
function readProfile(root) {
  const v = formData(root);
  const multi = (k) => [...root.querySelectorAll(`[data-multi=${k}] .chip[aria-pressed=true]`)].map((b) => b.dataset.v);
  const zones = [...root.querySelectorAll('.zone')].map((z) => ({
    zone: z.querySelector('[name=z_zone]').value, side: z.querySelector('[name=z_side]').value,
    type: z.querySelector('[name=z_type]').value, intensity: z.querySelector('[name=z_int]').value,
    avoid: z.querySelector('[name=z_avoid]').value.trim(),
  }));
  return {
    color: v.color || null, first_name: v.first_name.trim(), last_name: v.last_name.trim() || null,
    birth_date: v.birth_date || null, sex: v.sex || null,
    height_cm: num(v.height_cm), start_weight: num(v.start_weight), goal_weight: num(v.goal_weight),
    health: { zones, note: v.health_note.trim() },
    nutrition: { allergens: multi('allergens'), diets: multi('diets'), dislikes: v.dislikes.trim() },
  };
}

function viewOnboarding() {
  $app.innerHTML = `
  <div class="hero"><div class="inner"><h1>Bienvenue ${esc(S.me.first_name)}</h1><small>Remplis ton profil sur ton téléphone${S.partner ? `, ${esc(S.partner.first_name)} fera pareil sur le sien` : ''}.</small></div></div>
  <form id="f" class="wrap">${profileForm(S.me, S.partner?.color)}
    <button class="btn block">C'est parti</button></form>`;
  const f = document.getElementById('f'); bindProfile(f);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const p = readProfile(f);
    if (!p.color) return toast('Choisis ta couleur');
    if (S.partner && p.color === S.partner.color) return toast(`Cette couleur est déjà prise par ${S.partner.first_name}`);
    const { error } = await sb.from('members').update({ ...p, onboarded_at: new Date().toISOString() }).eq('id', S.me.id);
    if (error) return fail(error, 'Enregistrement impossible');
    route();
  };
}

// ---------- navigation ----------
const ICONS = {
  today: '<path d="M4 6h16M4 12h16M4 18h10" stroke-width="2" stroke-linecap="round"/>',
  meals: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 2-2 6 0 8v10" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  journal: '<path d="M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6zM9 8h6M9 12h6" stroke-width="2" stroke-linecap="round"/>',
  track: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2" stroke-width="2" stroke-linecap="round"/>',
  more: '<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>',
};
const TABS = [['today', 'Aujourd\'hui'], ['meals', 'Repas'], ['journal', 'Journal'], ['track', 'Suivi'], ['more', 'Plus']];
function renderTabs() {
  $tabs.hidden = false;
  $tabs.innerHTML = TABS.map(([id, l]) => `<button data-tab="${id}" ${S.view === id || (id === 'more' && ['program', 'settings', 'profile', 'account', 'sources'].includes(S.view)) ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" fill="${id === 'more' ? 'currentColor' : 'none'}" stroke="currentColor">${ICONS[id]}</svg>${l}</button>`).join('');
  $tabs.querySelectorAll('button').forEach((b) => b.onclick = () => go(b.dataset.tab));
}
function go(view) { S.view = view; renderTabs(); render(); window.scrollTo(0, 0); }
async function render() {
  const views = { today: viewToday, meals: viewMeals, journal: viewJournal, track: viewTrack, more: viewMore, program: viewProgram, settings: viewSettings, profile: viewProfile, account: viewAccount, sources: viewSources };
  try { await (views[S.view] || viewToday)(); } catch (e) { fail(e, 'Affichage impossible'); }
}
function header(title, sub = '', withDayNav = false) {
  return `<div class="hero"><div class="inner">
    ${withDayNav ? `<div class="daynav"><button data-day="-1" aria-label="Jour précédent">‹</button><div style="text-align:center;flex:1"><small>${esc(cap(fmtDay(S.day)))}${S.day === today() ? ' · aujourd\'hui' : ''}</small></div><button data-day="1" aria-label="Jour suivant">›</button></div>` : ''}
    <h1>${esc(title)}</h1>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
}
function bindDayNav() {
  $app.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => { S.day = addDays(S.day, Number(b.dataset.day)); render(); });
}
const planDay = (d) => S.plan?.data?.days?.[d];
function weekLabel(d) {
  const pd = planDay(d);
  return pd ? `Semaine ${pd.week} sur ${S.plan.data.weeks}` : (S.plan ? 'Hors programme' : 'Pas encore de programme');
}

// ---------- Aujourd'hui ----------
async function viewToday() {
  const d = S.day; const pd = planDay(d);
  const monday = mondayOf(d); const sunday = addDays(monday, 6);
  const [{ data: checks }, { data: meals }] = await Promise.all([
    sb.from('checks').select('*').eq('tandem_id', S.me.tandem_id).gte('day', monday).lte('day', sunday),
    sb.from('meals').select('*').eq('tandem_id', S.me.tandem_id).eq('day', d),
  ]);
  const has = (mid, key, day = d) => (checks || []).some((c) => c.member_id === mid && c.session_key === key && c.day === day);
  const weekTotal = (() => { let n = 0; for (let i = 0; i < 7; i++) n += (planDay(addDays(monday, i))?.sessions || []).filter((s) => s.key !== 'respiration').length; return n; })();
  const doneBy = (mid) => (checks || []).filter((c) => c.member_id === mid && c.session_key !== 'respiration').length;
  const people = [S.me, S.partner].filter(Boolean);
  $app.innerHTML = header(`Bonjour ${S.me.first_name}`, esc(weekLabel(d)), true) + `
  <div class="wrap">
    ${S.partner && !S.partner.user_id ? `<div class="notice row between"><span>${esc(S.partner.first_name)} n'a pas encore rejoint le tandem.</span><button class="btn ghost sm" id="resend">Renvoyer le code</button></div>` : ''}
    ${weekTotal ? `<div class="grid2">${people.map((p) => `<div class="card"><span class="small">${esc(p.first_name)} · ${Math.min(doneBy(p.id), weekTotal)} / ${weekTotal} séances cette semaine</span><div class="bar" style="background:var(--line)"><div style="width:${Math.round(Math.min(1, doneBy(p.id) / weekTotal) * 100)}%;background:${colorHex(p.color)}"></div></div></div>`).join('')}</div>` : ''}
    <h2>Sport du jour</h2>
    ${!S.plan ? `<div class="card"><span class="title">Pas encore de programme</span><span class="muted">${isCaptain() ? 'Règle le matériel et la durée, puis génère le programme.' : `${esc(S.partner?.first_name || 'Le capitaine')} règle le matériel et génère le programme.`}</span>${isCaptain() ? '<button class="btn" data-go="settings">Créer le programme</button>' : ''}</div>` : ''}
    ${(pd?.sessions || []).map((s) => `
      <div class="card">
        <div><span class="title">${esc(s.title)}</span><div class="muted">${esc(s.detail)}</div></div>
        ${s.per ? people.map((p) => s.per[p.id] ? `<div class="small"><b>${esc(p.first_name)} :</b> ${s.per[p.id].map(esc).join(' · ')}</div>` : '').join('') : ''}
        <div class="grid2">${people.map((p) => {
          const on = has(p.id, s.key); const mine = p.id === S.me.id;
          return `<button class="toggle" style="--c:${colorHex(p.color)}" aria-pressed="${on}" ${mine ? `data-check="${s.key}"` : 'disabled'}>${esc(p.first_name)} · ${on ? 'fait ✓' : (mine ? 'à faire' : 'pas encore')}</button>`;
        }).join('')}</div>
      </div>`).join('')}
    ${S.plan && !pd ? '<div class="card"><span class="muted">Aucune séance prévue ce jour-là.</span></div>' : ''}
    <h2>Repas</h2>
    <div class="grid2">${['midi', 'soir'].map((slot) => {
      const m = (meals || []).find((x) => x.slot === slot && (x.member_id === null || x.member_id === S.me.id));
      const r = m?.recipe_id ? S.recipes.find((x) => x.id === m.recipe_id) : null;
      const label = m?.status === 'remplace' ? m.eaten_text : r ? r.name : 'À choisir';
      const st = { fait: '<span class="pill ok">Fait</span>', remplace: '<span class="pill">Autre chose</span>', saute: '<span class="pill">Sauté</span>', choisi: '<span class="pill">Prévu</span>' }[m?.status] || '';
      return `<button class="card" style="border:0;text-align:left;cursor:pointer" data-go="meals"><span class="small muted" style="font-weight:600">${slot === 'midi' ? 'Midi' : 'Soir'}</span><span style="font-weight:600;line-height:1.3">${esc(label)}</span>${st}</button>`;
    }).join('')}</div>
  </div>`;
  bindDayNav();
  $app.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => go(b.dataset.go));
  $app.querySelectorAll('[data-check]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    const key = b.dataset.check; const on = b.getAttribute('aria-pressed') === 'true';
    const res = on
      ? await sb.from('checks').delete().match({ member_id: S.me.id, day: d, session_key: key })
      : await sb.from('checks').upsert({ member_id: S.me.id, tandem_id: S.me.tandem_id, day: d, session_key: key, source: 'manuel', done_at: new Date().toISOString() });
    if (res.error) fail(res.error, 'Enregistrement impossible');
    viewToday();
  });
  document.getElementById('resend')?.addEventListener('click', async () => {
    const { error } = await sb.auth.signInWithOtp({ email: S.partner.email, options: { shouldCreateUser: false, emailRedirectTo: location.origin } });
    toast(error ? 'Envoi impossible, réessaie dans une minute' : `Code renvoyé à ${S.partner.first_name}`);
  });
}

// ---------- Repas ----------
function weekCheats(mealsWeek) {
  return (mealsWeek || []).filter((m) => m.cheat && (m.member_id === null || m.member_id === S.me.id)).length;
}
async function viewMeals() {
  const d = S.day; const monday = mondayOf(d);
  const { data: mealsWeek } = await sb.from('meals').select('*').eq('tandem_id', S.me.tandem_id).gte('day', monday).lte('day', addDays(monday, 6));
  const meals = (mealsWeek || []).filter((m) => m.day === d);
  const pool = eligibleRecipes(S.recipes, S.allergenMap, [S.me, S.partner].filter(Boolean));
  const cheats = weekCheats(mealsWeek);
  const friday = parseDay(d).getDay() === 5;
  $app.innerHTML = header('Repas', `Joker de la semaine : ${cheats ? 'utilisé' : 'disponible'}${friday ? ' · ce soir, plaisir fait maison' : ''}`, true) + `
  <div class="wrap">${['midi', 'soir'].map((slot) => {
    const m = meals.find((x) => x.slot === slot && (x.member_id === null || x.member_id === S.me.id));
    const choices = mealChoices(pool, d, slot);
    if (m?.recipe_id && !choices.some((c) => c.id === m.recipe_id)) { const r = S.recipes.find((x) => x.id === m.recipe_id); if (r) choices.unshift(r); }
    return `<section class="card white" data-slot="${slot}">
      <div class="row between"><h2>${slot === 'midi' ? 'Midi' : 'Soir'}</h2>${m ? `<span class="pill ${m.status === 'fait' ? 'ok' : ''}">${{ choisi: 'Choisi', fait: 'Fait', remplace: 'Autre chose', saute: 'Sauté' }[m.status]}${m.member_id === null ? ' · nous deux' : ' · moi'}</span>` : ''}</div>
      ${m?.status === 'remplace' ? `<div class="card"><span class="small muted">Vous avez mangé</span><span style="font-weight:600">${esc(m.eaten_text)}</span><span class="small muted">${esc({ maison: 'Fait maison', resto: 'Restaurant', pouce: 'Sur le pouce', livre: 'Livré' }[m.kind] || '')}${m.cheat ? ' · joker' : ''}</span></div>` : ''}
      ${choices.map((r) => `<button class="choice" data-pick="${r.id}" aria-pressed="${m?.recipe_id === r.id && m.status !== 'remplace'}">
        <span style="font-weight:600">${esc(r.name)}</span>
        <span class="small muted">${r.minutes ? `${r.minutes} min` : ''}${r.lunchbox ? ' · gamelle' : ''}${r.is_treat ? ' · plaisir' : ''}${(S.allergenMap[r.id]?.allergens || []).length ? ` · ${(S.allergenMap[r.id].allergens).map((a) => (ALLERGENS.find((x) => x[0] === a) || [a, a])[1].toLowerCase()).join(', ')}` : ''}</span>
      </button>`).join('') || '<span class="muted">Aucune recette compatible avec vos allergies et régimes.</span>'}
      <div class="row" style="flex-wrap:wrap">
        ${m?.recipe_id && m.status !== 'remplace' ? `<button class="btn sm" data-done="${m.status === 'fait' ? 0 : 1}">${m.status === 'fait' ? 'Annuler « fait »' : 'C\'est mangé ✓'}</button><button class="btn soft sm" data-recipe="${m.recipe_id}">Voir la recette</button>` : ''}
        <button class="btn ghost sm" data-other>On a mangé autre chose</button>
        ${m ? '<button class="link" data-clear style="margin-left:auto">Effacer</button>' : ''}
      </div>
    </section>`;
  }).join('')}</div>`;
  bindDayNav();
  $app.querySelectorAll('section[data-slot]').forEach((sec) => {
    const slot = sec.dataset.slot;
    const m = meals.find((x) => x.slot === slot && (x.member_id === null || x.member_id === S.me.id));
    sec.querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => saveMeal(m, slot, { recipe_id: b.dataset.pick, status: 'choisi', eaten_text: null, kind: null, cheat: false }, null));
    sec.querySelector('[data-done]')?.addEventListener('click', (e) => saveMeal(m, slot, { status: e.target.dataset.done === '1' ? 'fait' : 'choisi' }, m.member_id));
    sec.querySelector('[data-recipe]')?.addEventListener('click', (e) => showRecipe(e.target.dataset.recipe));
    sec.querySelector('[data-other]').onclick = () => otherMeal(m, slot, cheats);
    sec.querySelector('[data-clear]')?.addEventListener('click', async () => { await sb.from('meals').delete().eq('id', m.id); viewMeals(); });
    sec.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('dblclick', () => showRecipe(b.dataset.pick)));
  });
}
async function saveMeal(existing, slot, patch, memberId) {
  const row = { ...patch, updated_by: S.me.id, updated_at: new Date().toISOString() };
  let res;
  if (existing && (existing.member_id === memberId || memberId === undefined)) {
    res = await sb.from('meals').update(row).eq('id', existing.id);
  } else {
    if (existing) await sb.from('meals').delete().eq('id', existing.id);
    res = await sb.from('meals').insert({ tandem_id: S.me.tandem_id, member_id: memberId, day: S.day, slot, cheat: false, ...row });
  }
  if (res.error) return fail(res.error, 'Enregistrement impossible');
  if (!$modal.hidden) closeModal();
  viewMeals();
}
function otherMeal(m, slot, cheats) {
  const cheatUsed = cheats > 0 && !m?.cheat;
  openModal(`
    <h2>Qu'avez-vous mangé ?</h2>
    <form id="o" style="display:flex;flex-direction:column;gap:12px">
      <label>Le repas<textarea name="text" required placeholder="ex. pizza au resto avec des amis">${esc(m?.status === 'remplace' ? m.eaten_text : '')}</textarea></label>
      <label>C'était<select name="kind">${[['maison', 'Fait maison'], ['resto', 'Restaurant'], ['pouce', 'Sur le pouce'], ['livre', 'Livré']].map(([v, l]) => `<option value="${v}" ${m?.kind === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Pour<select name="scope"><option value="moi">Moi seulement</option><option value="nous" ${m?.member_id === null ? 'selected' : ''}>Nous deux</option></select></label>
      <label class="check"><input type="checkbox" name="cheat" ${m?.cheat ? 'checked' : ''} ${cheatUsed ? 'disabled' : ''}> Utiliser le joker de la semaine${cheatUsed ? ' (déjà utilisé)' : ''}</label>
      <div class="grid2"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn">Enregistrer</button></div>
    </form>`, (root) => {
    root.querySelector('#o').onsubmit = (e) => {
      e.preventDefault();
      const v = formData(e.target);
      if (!v.text.trim()) return toast('Écris ce que vous avez mangé');
      saveMeal(m, slot, { recipe_id: null, status: 'remplace', eaten_text: v.text.trim().slice(0, 300), kind: v.kind, cheat: !!v.cheat }, v.scope === 'nous' ? null : S.me.id);
    };
  });
}
async function showRecipe(id) {
  const r = S.recipes.find((x) => x.id === id);
  const [{ data: full }, { data: ing }] = await Promise.all([
    sb.from('recipes').select('steps').eq('id', id).single(),
    sb.from('recipe_ingredients').select('label,position').eq('recipe_id', id).order('position'),
  ]);
  const al = (S.allergenMap[id]?.allergens || []).map((a) => (ALLERGENS.find((x) => x[0] === a) || [a, a])[1]);
  openModal(`
    <div class="row between"><h2>${esc(r?.name)}</h2><button class="btn ghost sm" data-close>Fermer</button></div>
    <span class="muted">${r?.minutes ? `${r.minutes} min · ` : ''}${r?.servings || 4} portions</span>
    ${al.length ? `<div class="notice">Allergènes : ${esc(al.join(', '))}</div>` : ''}
    <h3>Ingrédients</h3><ul class="plain">${(ing || []).map((i) => `<li>${esc(i.label)}</li>`).join('')}</ul>
    <h3>Étapes</h3><ol class="steps">${(full?.steps || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`);
}

// ---------- Journal ----------
async function viewJournal() {
  const d = S.day;
  const { data: rows } = await sb.from('journal').select('*').eq('day', d);
  const mine = (rows || []).find((r) => r.member_id === S.me.id) || { drinks: 0, water: 0, extras: [], drink_kind: '', note: '' };
  const theirs = S.partner && (rows || []).find((r) => r.member_id === S.partner.id);
  const EXTRAS = ['Grignotage salé', 'Grignotage sucré', 'Dessert', 'Soda', 'Pain en plus', 'Fromage en plus'];
  $app.innerHTML = header('Journal', '', true) + `
  <form id="j" class="wrap">
    <div class="card white">
      <div class="row between"><span class="title">Verres d'alcool</span><div class="row"><button type="button" class="btn soft sm" data-step="drinks:-1">−</button><b id="drinks" style="min-width:24px;text-align:center">${mine.drinks}</b><button type="button" class="btn soft sm" data-step="drinks:1">+</button></div></div>
      <label>Quoi (facultatif)<input name="drink_kind" value="${esc(mine.drink_kind)}" placeholder="ex. vin rouge, bière"></label>
      <div class="row between"><span class="title">Verres d'eau</span><div class="row"><button type="button" class="btn soft sm" data-step="water:-1">−</button><b id="water" style="min-width:24px;text-align:center">${mine.water ?? 0}</b><button type="button" class="btn soft sm" data-step="water:1">+</button></div></div>
      <span class="title">Écarts</span>
      <div class="chips">${EXTRAS.map((x) => `<button type="button" class="chip" data-extra="${esc(x)}" aria-pressed="${(mine.extras || []).includes(x)}">${esc(x)}</button>`).join('')}</div>
      <label>Note<textarea name="note">${esc(mine.note)}</textarea></label>
      <label class="check"><input type="checkbox" name="shared" ${S.me.journal_shared ? 'checked' : ''}> Partager mon journal avec ${esc(S.partner?.first_name || 'mon partenaire')}</label>
      <button class="btn block">Enregistrer</button>
    </div>
    ${S.partner ? `<div class="card"><span class="title">${esc(S.partner.first_name)}</span>${theirs ? `<span>${theirs.drinks} verre(s) d'alcool${theirs.drink_kind ? ` (${esc(theirs.drink_kind)})` : ''} · ${theirs.water ?? 0} verre(s) d'eau</span>${(theirs.extras || []).length ? `<span class="muted">${esc(theirs.extras.join(', '))}</span>` : ''}${theirs.note ? `<span class="muted">${esc(theirs.note)}</span>` : ''}` : `<span class="muted">${S.partner.journal_shared ? 'Rien de noté ce jour-là.' : 'Journal privé.'}</span>`}</div>` : ''}
  </form>`;
  bindDayNav();
  const f = document.getElementById('j');
  f.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => {
    const [k, n] = b.dataset.step.split(':'); const el = document.getElementById(k);
    el.textContent = Math.max(0, Math.min(k === 'drinks' ? 30 : 20, Number(el.textContent) + Number(n)));
  });
  f.querySelectorAll('[data-extra]').forEach((b) => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
  f.onsubmit = async (e) => {
    e.preventDefault();
    const v = formData(f);
    const row = {
      member_id: S.me.id, tandem_id: S.me.tandem_id, day: d,
      drinks: Number(document.getElementById('drinks').textContent), water: Number(document.getElementById('water').textContent),
      drink_kind: v.drink_kind.trim() || null, note: v.note.trim() || null,
      extras: [...f.querySelectorAll('[data-extra][aria-pressed=true]')].map((b) => b.dataset.extra),
    };
    const shared = !!v.shared;
    const [a, b] = await Promise.all([
      sb.from('journal').upsert(row),
      shared !== S.me.journal_shared ? sb.from('members').update({ journal_shared: shared }).eq('id', S.me.id) : Promise.resolve({}),
    ]);
    if (a.error || b.error) return fail(a.error || b.error, 'Enregistrement impossible');
    S.me.journal_shared = shared; toast('Journal enregistré');
  };
}

// ---------- Suivi ----------
async function viewTrack() {
  const d = S.day; const monday = mondayOf(d); const sunday = addDays(monday, 6);
  const people = [S.me, S.partner].filter(Boolean);
  const [{ data: metrics }, { data: weights }, { data: acts }] = await Promise.all([
    sb.from('daily_metrics').select('*').eq('tandem_id', S.me.tandem_id).gte('day', monday).lte('day', sunday),
    sb.from('weights').select('*').eq('tandem_id', S.me.tandem_id).order('day'),
    sb.from('activities').select('*').eq('tandem_id', S.me.tandem_id).gte('start_at', `${monday}T00:00:00`).lte('start_at', `${sunday}T23:59:59`).order('start_at'),
  ]);
  const todayMine = (metrics || []).find((m) => m.member_id === S.me.id && m.day === d) || {};
  const avg = (mid, k) => { const v = (metrics || []).filter((m) => m.member_id === mid && m[k] != null).map((m) => m[k]); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  const hm = (min) => (min == null ? '—' : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`);
  const lastW = (mid) => [...(weights || [])].filter((w) => w.member_id === mid && w.kg != null).pop();
  $app.innerHTML = header('Suivi', `Semaine du ${fmtDay(monday, { day: 'numeric', month: 'long' })}`, true) + `
  <div class="wrap">
    <h2>Ma journée</h2>
    <form id="m" class="card white">
      <div class="grid2">
        <label>Pas<input name="steps" inputmode="numeric" value="${esc(todayMine.steps)}"></label>
        <label>Étages<input name="floors" inputmode="numeric" value="${esc(todayMine.floors)}"></label>
        <label>Sommeil (h)<input name="sleep_h" inputmode="decimal" value="${todayMine.sleep_min != null ? (todayMine.sleep_min / 60).toFixed(1).replace('.', ',') : ''}"></label>
        <label>FC au repos<input name="rhr" inputmode="numeric" value="${esc(todayMine.rhr)}"></label>
        <label>Stress (0–100)<input name="stress" inputmode="numeric" value="${esc(todayMine.stress)}"></label>
        <label>VFC (ms)<input name="hrv" inputmode="numeric" value="${esc(todayMine.hrv)}"></label>
      </div>
      <button class="btn block">Enregistrer à la main</button>
      <span class="muted small">Les montres sont facultatives : tu peux toujours tout saisir ici.</span>
    </form>
    <h2>La semaine</h2>
    <div class="card white"><table class="mini"><tr><th></th>${people.map((p) => `<th style="color:${colorHex(p.color)}">${esc(p.first_name)}</th>`).join('')}</tr>
      <tr><td>Pas / jour</td>${people.map((p) => `<td>${avg(p.id, 'steps')?.toLocaleString('fr-FR') ?? '—'}</td>`).join('')}</tr>
      <tr><td>Sommeil</td>${people.map((p) => `<td>${hm(avg(p.id, 'sleep_min'))}</td>`).join('')}</tr>
      <tr><td>FC repos</td>${people.map((p) => `<td>${avg(p.id, 'rhr') ?? '—'}</td>`).join('')}</tr>
      <tr><td>Stress</td>${people.map((p) => `<td>${avg(p.id, 'stress') ?? '—'}</td>`).join('')}</tr>
      <tr><td>Activités</td>${people.map((p) => `<td>${(acts || []).filter((a) => a.member_id === p.id).length}</td>`).join('')}</tr>
    </table></div>
    <div class="row between"><h2>Activités</h2><button class="btn ghost sm" id="addAct">+ Ajouter</button></div>
    ${(acts || []).map((a) => { const p = people.find((x) => x.id === a.member_id); return `<div class="card"><span class="title">${esc(a.type)}</span><span class="muted">${esc(p?.first_name)} · ${esc(fmtDay(a.start_at.slice(0, 10), { weekday: 'short', day: 'numeric' }))}${a.duration_min ? ` · ${a.duration_min} min` : ''}${a.distance_km ? ` · ${String(a.distance_km).replace('.', ',')} km` : ''}${a.hr_avg ? ` · FC ${a.hr_avg}` : ''}</span></div>`; }).join('') || '<span class="muted">Aucune activité cette semaine.</span>'}
    <div class="row between"><h2>Poids</h2><button class="btn ghost sm" id="addW">+ Pesée</button></div>
    <div class="grid2">${people.map((p) => { const w = lastW(p.id); const diff = w && p.start_weight ? (w.kg - p.start_weight).toFixed(1) : null; return `<div class="card stat"><span class="small" style="color:${colorHex(p.color)};font-weight:600">${esc(p.first_name)}</span><b>${w ? `${String(w.kg).replace('.', ',')} kg` : '—'}</b><span class="muted small">${diff != null ? `${diff > 0 ? '+' : ''}${diff.replace('.', ',')} kg depuis le départ` : ''}${p.goal_weight ? ` · objectif ${String(p.goal_weight).replace('.', ',')}` : ''}</span></div>`; }).join('')}</div>
    <div class="card white">${weightChart(weights || [], people)}</div>
  </div>`;
  bindDayNav();
  document.getElementById('m').onsubmit = async (e) => {
    e.preventDefault(); const v = formData(e.target);
    const sleep = num(v.sleep_h);
    const { error } = await sb.from('daily_metrics').upsert({
      member_id: S.me.id, tandem_id: S.me.tandem_id, day: d, source: 'manuel',
      steps: int(v.steps), floors: int(v.floors), rhr: int(v.rhr), stress: int(v.stress), hrv: int(v.hrv),
      sleep_min: sleep != null ? Math.round(sleep * 60) : null, updated_at: new Date().toISOString(),
    });
    if (error) return fail(error, 'Enregistrement impossible'); toast('Journée enregistrée'); viewTrack();
  };
  document.getElementById('addAct').onclick = () => openModal(`
    <h2>Nouvelle activité</h2>
    <form id="a" style="display:flex;flex-direction:column;gap:12px">
      <label>Type<select name="type">${['Vélo d\'appartement', 'Marche', 'Course', 'Renfo', 'Respiration', 'Étirements', 'Autre'].map((t) => `<option>${t}</option>`).join('')}</select></label>
      <div class="grid2"><label>Date<input name="date" type="date" value="${d}"></label><label>Durée (min)<input name="duration" inputmode="numeric"></label></div>
      <div class="grid2"><label>Distance (km)<input name="distance" inputmode="decimal"></label><label>FC moyenne<input name="hr" inputmode="numeric"></label></div>
      <label>Ressenti<select name="feeling"><option value="">—</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${n} / 5</option>`).join('')}</select></label>
      <div class="grid2"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn">Ajouter</button></div>
    </form>`, (root) => root.querySelector('#a').onsubmit = async (e) => {
    e.preventDefault(); const v = formData(e.target);
    const { error } = await sb.from('activities').insert({
      member_id: S.me.id, tandem_id: S.me.tandem_id, source: 'manuel', start_at: `${v.date}T12:00:00`, type: v.type,
      duration_min: int(v.duration), distance_km: num(v.distance), hr_avg: int(v.hr), feeling: int(v.feeling),
    });
    if (error) return fail(error, 'Ajout impossible'); closeModal(); viewTrack();
  });
  document.getElementById('addW').onclick = () => openModal(`
    <h2>Pesée</h2>
    <form id="w" style="display:flex;flex-direction:column;gap:12px">
      <div class="grid2"><label>Date<input name="date" type="date" value="${today()}"></label><label>Poids (kg)<input name="kg" inputmode="decimal" required></label></div>
      <label>Tour de taille (cm, facultatif)<input name="waist" inputmode="decimal"></label>
      <div class="grid2"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn">Enregistrer</button></div>
    </form>`, (root) => root.querySelector('#w').onsubmit = async (e) => {
    e.preventDefault(); const v = formData(e.target);
    const { error } = await sb.from('weights').upsert({ member_id: S.me.id, tandem_id: S.me.tandem_id, day: v.date, kg: num(v.kg), waist_cm: num(v.waist) });
    if (error) return fail(error, 'Enregistrement impossible'); closeModal(); viewTrack();
  });
}
function weightChart(weights, people) {
  const pts = weights.filter((w) => w.kg != null);
  if (pts.length < 2) return '<span class="muted">La courbe apparaîtra après deux pesées.</span>';
  const xs = pts.map((w) => parseDay(w.day).getTime()); const ys = pts.map((w) => Number(w.kg));
  const x0 = Math.min(...xs), x1 = Math.max(...xs) || x0 + 1, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
  const W = 320, H = 150, P = 28;
  const X = (t) => P + ((t - x0) / Math.max(1, x1 - x0)) * (W - P - 8);
  const Y = (v) => 8 + (1 - (v - y0) / (y1 - y0)) * (H - 30);
  const lines = people.map((p) => {
    const s = pts.filter((w) => w.member_id === p.id);
    if (!s.length) return '';
    const c = colorHex(p.color);
    return `<polyline fill="none" stroke="${c}" stroke-width="2.5" points="${s.map((w) => `${X(parseDay(w.day).getTime()).toFixed(1)},${Y(w.kg).toFixed(1)}`).join(' ')}"/>${s.map((w) => `<circle cx="${X(parseDay(w.day).getTime()).toFixed(1)}" cy="${Y(w.kg).toFixed(1)}" r="3.5" fill="${c}"><title>${esc(p.first_name)} ${w.day} : ${w.kg} kg</title></circle>`).join('')}`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Courbe de poids">
    <text x="2" y="14" font-size="10" fill="#5E6573">${Math.round(y1)}</text><text x="2" y="${H - 22}" font-size="10" fill="#5E6573">${Math.round(y0)}</text>
    <line x1="${P}" x2="${W - 8}" y1="${H - 22}" y2="${H - 22}" stroke="#D6DAE1"/>${lines}
    <text x="${P}" y="${H - 6}" font-size="10" fill="#5E6573">${fmtDay(iso(new Date(x0)), { day: 'numeric', month: 'short' })}</text>
    <text x="${W - 8}" y="${H - 6}" font-size="10" fill="#5E6573" text-anchor="end">${fmtDay(iso(new Date(x1)), { day: 'numeric', month: 'short' })}</text></svg>`;
}

// ---------- Plus ----------
function viewMore() {
  $app.innerHTML = header('Plus') + `<div class="wrap">
    ${[['program', 'Programme', 'Les séances semaine par semaine'], ['settings', 'Matériel et programme', isCaptain() ? 'Réglages du capitaine' : 'Consultation et suggestions'], ['profile', 'Mon profil', 'Couleur, santé, alimentation'], ['sources', 'Montres et sources', 'Garmin, Apple Watch, saisie manuelle'], ['account', 'Mon compte', 'Export, déconnexion, suppression']]
      .map(([v, t, s]) => `<button class="card" style="border:0;text-align:left;cursor:pointer" data-go="${v}"><span class="title">${t}</span><span class="muted">${s}</span></button>`).join('')}
  </div>`;
  $app.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => go(b.dataset.go));
}

function viewProgram() {
  if (!S.plan) { $app.innerHTML = header('Programme') + '<div class="wrap"><span class="muted">Pas encore de programme.</span></div>'; return; }
  const p = S.plan.data; const weeks = [];
  for (let w = 1; w <= p.weeks; w++) weeks.push(Object.entries(p.days).filter(([, v]) => v.week === w));
  const DN = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  $app.innerHTML = header('Programme', `${p.weeks} semaines à partir du ${fmtDay(p.start_date, { day: 'numeric', month: 'long' })}`) + `<div class="wrap">
    ${weeks.map((days, i) => `<details class="card white" ${days.some(([d]) => d === today()) ? 'open' : ''}><summary class="title" style="cursor:pointer">Semaine ${i + 1}</summary>
      <table class="mini">${days.map(([d, v], k) => `<tr><td style="width:44px;font-weight:600">${DN[k]}</td><td>${v.sessions.filter((s) => s.key !== 'respiration').map((s) => esc(s.title)).join(' · ') || 'Repos'}</td></tr>`).join('')}</table></details>`).join('')}
  </div>`;
}

async function viewSettings() {
  const st = S.tandem.settings || {};
  const eq = new Set(st.equipment || []);
  const capt = isCaptain();
  const captainName = capt ? 'toi' : (S.partner?.first_name || 'le capitaine');
  const { data: sugg } = await sb.from('suggestions').select('*').eq('tandem_id', S.me.tandem_id).eq('done', false).order('created_at', { ascending: false });
  $app.innerHTML = header('Matériel et programme', capt ? 'Tu es le capitaine : tes réglages valent pour vous deux.' : `Réglé par ${esc(captainName)}. Tu peux lui faire des suggestions.`) + `
  <form id="s" class="wrap">
    ${EQUIPMENT.map(([g, items]) => `<div class="card white"><h3>${g}</h3><div class="chips">${items.map(([v, l]) => `<button type="button" class="chip" data-eq="${v}" aria-pressed="${eq.has(v)}" ${capt ? '' : 'disabled'}>${l}</button>`).join('')}</div></div>`).join('')}
    <div class="card white"><h3>Programme</h3>
      <span class="muted">Durée</span>
      <div class="chips">${[2, 4, 6, 8, 12].map((w) => `<button type="button" class="chip" data-weeks="${w}" aria-pressed="${(st.weeks || 6) === w}" ${capt ? '' : 'disabled'}>${w} semaines</button>`).join('')}</div>
      <div class="grid2"><label>Début (lundi)<input type="date" name="start" value="${esc(st.start_date || mondayOf(today()))}" ${capt ? '' : 'disabled'}></label>
      <label>Course à partir de la semaine<input name="run_from" inputmode="numeric" value="${esc(st.run_from_week || 1)}" ${capt ? '' : 'disabled'}></label></div>
      ${capt ? `<button class="btn block">${S.plan ? 'Régénérer le programme' : 'Générer le programme'}</button>${S.plan ? '<span class="muted small">Les séances déjà cochées restent enregistrées.</span>' : ''}` : ''}
    </div>
    ${capt ? '' : `<div class="card white"><h3>Une suggestion pour ${esc(captainName)} ?</h3><textarea id="sg" placeholder="ex. on a acheté un step"></textarea><button type="button" class="btn" id="sendSg">Envoyer</button></div>`}
    ${(sugg || []).length ? `<div class="card"><h3>Suggestions</h3>${sugg.map((x) => `<div class="row between"><span>${esc(x.text)}</span>${capt ? `<button type="button" class="btn ghost sm" data-sg="${x.id}">Vu</button>` : ''}</div>`).join('')}</div>` : ''}
  </form>`;
  const f = document.getElementById('s');
  f.querySelectorAll('[data-eq]').forEach((b) => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
  f.querySelectorAll('[data-weeks]').forEach((b) => b.onclick = () => { f.querySelectorAll('[data-weeks]').forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); });
  f.querySelectorAll('[data-sg]').forEach((b) => b.onclick = async () => { await sb.from('suggestions').update({ done: true }).eq('id', b.dataset.sg); viewSettings(); });
  document.getElementById('sendSg')?.addEventListener('click', async () => {
    const text = document.getElementById('sg').value.trim(); if (!text) return;
    const { error } = await sb.from('suggestions').insert({ tandem_id: S.me.tandem_id, from_member: S.me.id, text: text.slice(0, 500) });
    if (error) return fail(error, 'Envoi impossible'); toast('Suggestion envoyée'); viewSettings();
  });
  f.onsubmit = async (e) => {
    e.preventDefault(); if (!capt) return;
    const settings = {
      ...st,
      equipment: [...f.querySelectorAll('[data-eq][aria-pressed=true]')].map((b) => b.dataset.eq),
      weeks: Number(f.querySelector('[data-weeks][aria-pressed=true]')?.dataset.weeks || 6),
      start_date: mondayOf(f.querySelector('[name=start]').value || today()),
      run_from_week: Math.max(1, int(f.querySelector('[name=run_from]').value) || 1),
    };
    const btn = f.querySelector('.btn.block'); btn.disabled = true; btn.textContent = 'Génération…';
    const data = generatePlan(settings, [S.me, S.partner].filter(Boolean));
    const r1 = await sb.from('tandems').update({ settings }).eq('id', S.tandem.id);
    if (r1.error) return fail(r1.error, 'Enregistrement impossible');
    await sb.from('plans').update({ active: false }).eq('tandem_id', S.tandem.id).eq('active', true);
    const r2 = await sb.from('plans').insert({ tandem_id: S.tandem.id, start_date: data.start_date, weeks: data.weeks, data, active: true }).select().single();
    if (r2.error) return fail(r2.error, 'Création du programme impossible');
    S.tandem.settings = settings; S.plan = r2.data; toast('Programme prêt'); go('program');
  };
}

function viewProfile() {
  $app.innerHTML = header('Mon profil') + `<form id="f" class="wrap">${profileForm(S.me, S.partner?.color)}<button class="btn block">Enregistrer</button>
    <span class="muted small">Pour que le programme tienne compte d'un changement de santé, le capitaine doit le régénérer.</span></form>`;
  const f = document.getElementById('f'); bindProfile(f);
  f.onsubmit = async (e) => {
    e.preventDefault(); const p = readProfile(f);
    if (S.partner && p.color === S.partner.color) return toast(`Couleur déjà prise par ${S.partner.first_name}`);
    const { error } = await sb.from('members').update(p).eq('id', S.me.id);
    if (error) return fail(error, 'Enregistrement impossible');
    Object.assign(S.me, p); setTheme(); toast('Profil enregistré');
  };
}

function viewSources() {
  $app.innerHTML = header('Montres et sources', 'Tout est facultatif.') + `<div class="wrap">
    <div class="card"><span class="title">Saisie manuelle</span><span class="muted">Toujours disponible dans l'onglet Suivi : pas, sommeil, fréquence cardiaque, activités, pesées.</span><button class="btn ghost" data-go="track">Aller au suivi</button></div>
    <div class="card"><span class="title">Garmin</span><span class="muted">Connexion automatique en préparation. En attendant, saisis tes chiffres à la main.</span><span class="pill">Bientôt</span></div>
    <div class="card"><span class="title">Apple Watch et Apple Santé</span><span class="muted">Un raccourci iOS enverra chaque soir tes pas, ton sommeil et ta VFC, y compris les séances Decathlon Coach ou Kinomap enregistrées dans Santé.</span><span class="pill">Bientôt</span></div>
  </div>`;
  $app.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => go(b.dataset.go));
}

function viewAccount() {
  $app.innerHTML = header('Mon compte', esc(S.session.user.email)) + `<div class="wrap">
    <div class="card"><span class="title">Exporter mes données</span><span class="muted">Un fichier JSON avec ton profil, ton journal, tes pesées, tes séances et tes données de suivi.</span><button class="btn ghost" id="exp">Télécharger</button></div>
    <div class="card"><span class="title">Se déconnecter</span><button class="btn ghost" id="out">Se déconnecter</button></div>
    <div class="card" style="border:1px solid var(--danger)"><span class="title">Supprimer mon compte</span>
      <span class="muted">Efface définitivement ton profil et toutes tes données. ${S.partner ? `Le compte de ${esc(S.partner.first_name)} reste actif${isCaptain() ? ` et ${esc(S.partner.first_name)} devient capitaine` : ''}.` : 'Le tandem sera supprimé.'}</span>
      <button class="btn danger" id="del">Supprimer mon compte</button></div>
  </div>`;
  document.getElementById('out').onclick = () => sb.auth.signOut();
  document.getElementById('exp').onclick = exportData;
  document.getElementById('del').onclick = deleteAccount;
}
async function exportData() {
  const id = S.me.id; const out = { exporte_le: new Date().toISOString(), profil: S.me };
  for (const t of ['journal', 'weights', 'checks', 'daily_metrics', 'activities']) {
    const { data } = await sb.from(t).select('*').eq('member_id', id); out[t] = data || [];
  }
  const { data: meals } = await sb.from('meals').select('*').eq('tandem_id', S.me.tandem_id).or(`member_id.eq.${id},member_id.is.null`);
  out.meals = meals || [];
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `tandem-forme-${today()}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function deleteAccount() {
  openModal(`<h2>Supprimer mon compte</h2>
    <p class="muted" style="margin:0">Par sécurité, on t'envoie un code à ${esc(S.session.user.email)}. Saisis-le pour confirmer la suppression définitive.</p>
    <button class="btn ghost" id="snd">Envoyer le code</button>
    <form id="d" style="display:flex;flex-direction:column;gap:12px">
      <input name="token" class="otp" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required autocomplete="one-time-code">
      <div class="grid2"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn danger">Supprimer</button></div>
    </form>`, (root) => {
    root.querySelector('#snd').onclick = async (e) => {
      e.target.disabled = true;
      const { error } = await sb.auth.signInWithOtp({ email: S.session.user.email, options: { shouldCreateUser: false } });
      toast(error ? 'Envoi impossible, réessaie dans une minute' : 'Code envoyé'); e.target.disabled = false;
    };
    root.querySelector('#d').onsubmit = async (e) => {
      e.preventDefault();
      const email = S.session.user.email;
      const { error } = await sb.auth.verifyOtp({ email, token: formData(e.target).token.trim(), type: 'email' });
      if (error) return toast('Code incorrect ou expiré');
      const { error: delErr } = await sb.functions.invoke('delete-account', { method: 'POST' });
      if (delErr) { let m = 'Suppression impossible'; try { m = (await delErr.context.json()).error || m; } catch {} return toast(m); }
      closeModal(); await sb.auth.signOut(); toast('Compte supprimé');
    };
  });
}

boot();

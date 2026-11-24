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
  window.addEventListener('hashchange', () => { if (!S.session) route(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  route();
}

async function route() {
  if (!S.session) { $tabs.hidden = true; return location.hash === '#inscription' ? viewRegister() : viewLogin(location.hash.includes('error') ? 'email' : 'password', location.hash.includes('error') ? 'Ce lien a expiré ou a déjà servi. Demande un nouveau lien.' : ''); }
  try { await loadCore(); } catch (e) { fail(e, 'Chargement impossible'); return; }
  if (!S.me) return viewNoMember();
  setTheme();
  const meta = S.session.user.user_metadata || {};
  let resetting = false; try { resetting = sessionStorage.getItem('tf_reset') === '1'; } catch {}
  if (!meta.password_set) return viewSetPassword('create');
  if (resetting || new URLSearchParams(location.search).has('reinit')) return viewSetPassword('reset');
  if (!S.me.onboarded_at) { $tabs.hidden = true; return viewOnboarding(); }
  renderTabs(); render();
  autoSyncGarmin().catch(() => {});
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
// Messages d'erreur Supabase traduits pour l'utilisateur.
function authMessage(error) {
  const code = error?.code || ''; const msg = error?.message || '';
  if (code === 'invalid_credentials' || /Invalid login credentials/i.test(msg)) return 'E-mail ou mot de passe incorrect.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || /rate limit|security purposes/i.test(msg)) return 'Trop de demandes d\'affilée. Patiente une minute puis réessaie.';
  if (code === 'otp_disabled' || code === 'signup_disabled' || code === 'user_not_found' || /Signups not allowed|not found/i.test(msg)) return 'Adresse inconnue. Inscris d\'abord votre tandem.';
  if (code === 'otp_expired' || /expired|invalid/i.test(msg)) return 'Code ou lien incorrect ou expiré. Demande-en un nouveau.';
  if (code === 'weak_password') return 'Mot de passe trop faible : 12 caractères minimum, avec minuscule, majuscule, chiffre et caractère spécial.';
  if (code === 'same_password') return 'Choisis un mot de passe différent de l\'ancien.';
  if (code === 'reauthentication_needed') return 'Pour des raisons de sécurité, reconnecte-toi avec un lien e-mail puis recommence.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Pas de connexion internet.';
  return msg || 'Une erreur est survenue.';
}

// Règles du mot de passe : 12 caractères, minuscule, majuscule, chiffre, caractère spécial.
const PW_RULES = [
  ['len', '12 caractères minimum', (p) => p.length >= 12],
  ['low', 'Une minuscule', (p) => /[a-zà-ÿ]/.test(p)],
  ['up', 'Une majuscule', (p) => /[A-ZÀ-Ý]/.test(p)],
  ['num', 'Un chiffre', (p) => /\d/.test(p)],
  ['spe', 'Un caractère spécial (!?@#…)', (p) => /[^A-Za-z0-9À-ÿ\s]/.test(p)],
];
const pwOk = (p) => PW_RULES.every(([, , t]) => t(p));
function pwField(name, label, autocomplete) {
  return `<label>${label}<span class="row" style="gap:6px"><input name="${name}" type="password" autocomplete="${autocomplete}" required style="flex:1">
    <button type="button" class="btn soft sm" data-eye="${name}" aria-label="Afficher le mot de passe" style="min-height:46px">Voir</button></span></label>`;
}
function bindEyes(root) {
  root.querySelectorAll('[data-eye]').forEach((b) => b.onclick = () => {
    const i = root.querySelector(`[name=${b.dataset.eye}]`); const show = i.type === 'password';
    i.type = show ? 'text' : 'password'; b.textContent = show ? 'Cacher' : 'Voir';
    b.setAttribute('aria-label', show ? 'Cacher le mot de passe' : 'Afficher le mot de passe');
  });
}

function viewLogin(step = 'password', err = '') {
  const otp = step === 'code';
  $app.innerHTML = `
  <div class="hero"><div class="inner"><h1>Tandem Forme</h1><small>Le sport et les menus, à deux.</small></div></div>
  <div class="wrap">
    ${step === 'password' ? `
    <form id="f" class="card white" novalidate>
      <h2>Connexion</h2>
      <label>E-mail<input name="email" type="email" autocomplete="email" required value="${esc(S.loginEmail)}"></label>
      ${pwField('password', 'Mot de passe', 'current-password')}
      <p class="err" id="err" role="alert" style="margin:0">${esc(err)}</p>
      <button class="btn block">Se connecter</button>
      <button type="button" class="link" id="forgot">Mot de passe oublié ? Recevoir un lien de connexion</button>
    </form>
    <div class="card"><span class="title">Nouveau tandem ?</span><span class="muted">L'un de vous deux inscrit le couple : chacun reçoit un lien par e-mail.</span>
      <a class="btn ghost" href="#inscription">S'inscrire à deux</a></div>` : step === 'email' ? `
    <form id="f" class="card white" novalidate>
      <h2>Mot de passe oublié</h2>
      <p class="muted" style="margin:0">On t'envoie un lien de connexion et un code. Une fois connecté, tu choisiras un nouveau mot de passe.</p>
      <label>E-mail<input name="email" type="email" autocomplete="email" required value="${esc(S.loginEmail)}"></label>
      <p class="err" id="err" role="alert" style="margin:0">${esc(err)}</p>
      <button class="btn block">Recevoir le lien</button>
      <button type="button" class="link" id="back">Revenir à la connexion</button>
    </form>` : `
    <form id="f" class="card white" novalidate>
      <h2>Regarde tes e-mails</h2>
      <p class="muted" style="margin:0">Touche le lien envoyé à ${esc(S.loginEmail)}, ou saisis le code reçu ici.</p>
      <input name="token" class="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required aria-label="Code reçu par e-mail">
      <p class="err" id="err" role="alert" style="margin:0">${esc(err)}</p>
      <button class="btn block">Valider</button>
      <button type="button" class="link" id="resend">Renvoyer un e-mail</button>
      <button type="button" class="link" id="back">Revenir à la connexion</button>
    </form>`}
  </div>`;
  const f = document.getElementById('f'); const $err = document.getElementById('err');
  const showErr = (m) => { $err.textContent = m; btn.disabled = false; };
  const btn = f.querySelector('.btn.block');
  bindEyes(f);
  document.getElementById('back')?.addEventListener('click', () => viewLogin('password'));
  document.getElementById('forgot')?.addEventListener('click', () => { S.loginEmail = (f.email.value || '').trim().toLowerCase(); viewLogin('email'); });
  const sendLink = async () => {
    const { error } = await sb.auth.signInWithOtp({ email: S.loginEmail, options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/?reinit=1` } });
    if (error) return authMessage(error);
    try { sessionStorage.setItem('tf_reset', '1'); } catch {}
    return '';
  };
  document.getElementById('resend')?.addEventListener('click', async (e) => {
    e.target.disabled = true; const m = await sendLink(); toast(m || 'E-mail renvoyé'); setTimeout(() => { e.target.disabled = false; }, 60000);
  });
  f.onsubmit = async (e) => {
    e.preventDefault(); $err.textContent = ''; btn.disabled = true;
    const v = formData(f);
    if (step === 'password') {
      S.loginEmail = (v.email || '').trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(S.loginEmail)) return showErr('Saisis une adresse e-mail valide.');
      if (!v.password) return showErr('Saisis ton mot de passe.');
      const { error } = await sb.auth.signInWithPassword({ email: S.loginEmail, password: v.password });
      if (error) return showErr(authMessage(error));
    } else if (step === 'email') {
      S.loginEmail = (v.email || '').trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(S.loginEmail)) return showErr('Saisis une adresse e-mail valide.');
      const m = await sendLink();
      if (m) return showErr(m);
      viewLogin('code');
    } else {
      const token = (v.token || '').replace(/\D/g, '');
      if (token.length < 6 || token.length > 10) return showErr('Saisis le code complet reçu par e-mail.');
      const { error } = await sb.auth.verifyOtp({ email: S.loginEmail, token, type: 'email' });
      if (error) return showErr(authMessage(error));
    }
  };
  void otp;
}

// Création ou changement du mot de passe (après le premier lien, après un oubli, ou depuis le compte).
function viewSetPassword(mode = 'create') {
  $tabs.hidden = true;
  const titles = { create: ['Crée ton mot de passe', 'Il te servira à te reconnecter. Si tu l\'oublies, tu pourras toujours recevoir un lien par e-mail.'], reset: ['Nouveau mot de passe', 'Choisis un nouveau mot de passe pour tes prochaines connexions.'], change: ['Changer mon mot de passe', ''] };
  const [t, sub] = titles[mode];
  $app.innerHTML = `
  <div class="hero"><div class="inner"><h1>${t}</h1>${sub ? `<small>${sub}</small>` : ''}</div></div>
  <form id="f" class="wrap" novalidate>
    <div class="card white">
      <input type="email" name="username" autocomplete="username" value="${esc(S.session?.user?.email)}" hidden>
      ${pwField('pw1', 'Mot de passe', 'new-password')}
      <ul class="plain small" id="rules" style="list-style:none;padding:0">${PW_RULES.map(([k, l]) => `<li data-rule="${k}">○ ${l}</li>`).join('')}</ul>
      ${pwField('pw2', 'Répète le mot de passe', 'new-password')}
      <span class="small" id="match"></span>
      <button class="btn block">Enregistrer le mot de passe</button>
      ${mode !== 'create' ? '<button type="button" class="link" id="skip">Plus tard</button>' : ''}
      <p class="err" id="err" role="alert"></p>
    </div>
  </form>`;
  const f = document.getElementById('f'); bindEyes(f);
  const $err = document.getElementById('err'); const btn = f.querySelector('.btn.block');
  const refresh = () => {
    const p = f.pw1.value; const q = f.pw2.value;
    PW_RULES.forEach(([k, l, test]) => { const li = f.querySelector(`[data-rule=${k}]`); const ok = test(p); li.textContent = `${ok ? '✓' : '○'} ${l}`; li.style.color = ok ? 'var(--ok)' : 'var(--muted)'; });
    const m = document.getElementById('match');
    m.textContent = q ? (p === q ? '✓ Les deux mots de passe sont identiques' : '✗ Les deux mots de passe sont différents') : '';
    m.style.color = p === q ? 'var(--ok)' : 'var(--danger)';
  };
  f.pw1.oninput = refresh; f.pw2.oninput = refresh;
  document.getElementById('skip')?.addEventListener('click', () => { try { sessionStorage.removeItem('tf_reset'); } catch {} history.replaceState(null, '', location.pathname); route(); });
  f.onsubmit = async (e) => {
    e.preventDefault(); $err.textContent = '';
    const p = f.pw1.value; const q = f.pw2.value;
    if (!pwOk(p)) return ($err.textContent = 'Le mot de passe ne respecte pas toutes les règles ci-dessus.');
    if (p !== q) return ($err.textContent = 'Les deux mots de passe ne sont pas identiques.');
    btn.disabled = true; btn.textContent = 'Enregistrement…';
    const { error } = await sb.auth.updateUser({ password: p, data: { password_set: true } });
    if (error) { btn.disabled = false; btn.textContent = 'Enregistrer le mot de passe'; return ($err.textContent = authMessage(error)); }
    try { sessionStorage.removeItem('tf_reset'); } catch {}
    history.replaceState(null, '', location.pathname);
    const { data } = await sb.auth.getSession(); S.session = data.session;
    toast('Mot de passe enregistré');
    if (mode === 'change') { S.view = 'account'; }
    route();
  };
}

function viewRegister(err = '') {
  $app.innerHTML = `
  <div class="hero"><div class="inner"><h1>Inscrire notre tandem</h1><small>Une personne inscrit les deux. Chacun reçoit un lien par e-mail pour créer son mot de passe et remplir son profil.</small></div></div>
  <div class="wrap">
    <form id="f" class="card white" novalidate>
      <h3>Toi</h3>
      <input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px">
      <div class="grid2"><label>Prénom<input name="me_first" required autocomplete="given-name"></label><label>Nom<input name="me_last" autocomplete="family-name"></label></div>
      <label>E-mail<input name="me_email" type="email" required autocomplete="email"></label>
      <div class="sep"></div><h3>Ton ou ta partenaire</h3>
      <div class="grid2"><label>Prénom<input name="p_first" required></label><label>Nom<input name="p_last"></label></div>
      <label>E-mail<input name="p_email" type="email" required></label>
      <p class="muted small" style="margin:0">L'e-mail sert à vous connecter et à récupérer l'accès si vous oubliez votre mot de passe. Vous pourrez supprimer vos comptes à tout moment.</p>
      <p class="err" id="rerr" role="alert" style="margin:0">${esc(err)}</p>
      <button class="btn block">Envoyer les invitations</button>
    </form>
    <a href="#" class="link" id="toLogin">J'ai déjà un compte</a>
  </div>`;
  document.getElementById('toLogin').onclick = (e) => { e.preventDefault(); location.hash = ''; viewLogin(); };
  const f = document.getElementById('f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const v = formData(f); const btn = f.querySelector('.btn.block'); const $e = document.getElementById('rerr');
    const stop = (m) => { $e.textContent = m; btn.disabled = false; btn.textContent = 'Envoyer les invitations'; };
    const em = (x) => /^\S+@\S+\.\S+$/.test((x || '').trim());
    if (!v.me_first.trim() || !v.p_first.trim()) return stop('Indique vos deux prénoms.');
    if (!em(v.me_email) || !em(v.p_email)) return stop('Vérifie les deux adresses e-mail.');
    if (v.me_email.trim().toLowerCase() === v.p_email.trim().toLowerCase()) return stop('Les deux adresses doivent être différentes.');
    $e.textContent = ''; btn.disabled = true; btn.textContent = 'Envoi…';
    const { data, error } = await sb.functions.invoke('register', {
      body: {
        website: v.website, redirect: location.origin,
        me: { first_name: v.me_first, last_name: v.me_last, email: v.me_email },
        partner: { first_name: v.p_first, last_name: v.p_last, email: v.p_email },
      },
    });
    if (error) {
      let msg = 'Inscription impossible';
      try { msg = (await error.context.json()).error || msg; } catch { if (/fetch/i.test(error.message)) msg = 'Pas de connexion internet.'; }
      return stop(msg);
    }
    S.loginEmail = v.me_email.trim().toLowerCase();
    history.replaceState(null, '', location.pathname);
    const failed = Object.values(data?.sent || {}).some((s) => s !== 'envoye');
    viewRegistered(v.p_first, failed);
  };
}

function viewRegistered(partnerFirst, failed) {
  $app.innerHTML = `
  <div class="hero"><div class="inner"><h1>Tandem créé</h1><small>Il ne reste qu'à ouvrir vos e-mails.</small></div></div>
  <div class="wrap">
    <div class="card"><span class="title">1. Ouvre l'e-mail « Ton accès à Tandem Forme »</span><span class="muted">Envoyé à ${esc(S.loginEmail)}. Pense à regarder dans les spams.</span></div>
    <div class="card"><span class="title">2. Touche « Ouvrir l'appli »</span><span class="muted">Tu crées ton mot de passe, puis tu remplis ton profil.</span></div>
    <div class="card"><span class="title">3. ${esc(partnerFirst)} fait pareil sur son téléphone</span><span class="muted">Son e-mail est parti en même temps.</span></div>
    ${failed ? '<div class="notice">Un des e-mails n\'a pas pu partir. Utilisez « Mot de passe oublié » sur l\'écran de connexion pour en recevoir un nouveau.</div>' : ''}
    <button class="btn ghost" id="code">J'ai reçu un code</button>
  </div>`;
  document.getElementById('code').onclick = () => viewLogin('code');
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
    if (m?.recipe_id && !choices.some((c) => c.id === m.recipe_id)) { const r = S.recipes.find((x) => x.id === m.recipe_id); if (r) { choices.unshift(r); choices.length = Math.min(choices.length, 3); } }
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
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(monday, i));
  // Une valeur par personne et par jour : la saisie manuelle prime, sinon la montre.
  const merged = (mid, day) => {
    const rows = (metrics || []).filter((m) => m.member_id === mid && m.day === day)
      .sort((a, b) => (a.source === 'manuel' ? -1 : 0) - (b.source === 'manuel' ? -1 : 0));
    const out = {};
    for (const k of ['steps', 'floors', 'rhr', 'hrv', 'stress', 'sleep_min', 'active_min']) out[k] = rows.map((r) => r[k]).find((v) => v != null) ?? null;
    return out;
  };
  const todayMine = (metrics || []).find((m) => m.member_id === S.me.id && m.day === d && m.source === 'manuel') || merged(S.me.id, d);
  const avg = (mid, k) => { const v = days.map((day) => merged(mid, day)[k]).filter((x) => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  const hm = (min) => (min == null ? '—' : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`);
  const lastW = (mid) => [...(weights || [])].filter((w) => w.member_id === mid && w.kg != null).pop();
  $app.innerHTML = header('Suivi', `Semaine du ${fmtDay(monday, { day: 'numeric', month: 'long' })}`, true) + `
  <div class="wrap">
    <h2>Pas</h2>
    <div class="card white">${barChart(people.map((p) => ({ color: colorHex(p.color), values: days.map((day) => merged(p.id, day).steps) })), days, (v) => (v >= 1000 ? `${(v / 1000).toFixed(1).replace('.', ',')}k` : String(v)), 8000, 'Objectif 8 000')}${legend(people)}</div>
    <h2>Sommeil</h2>
    <div class="card white">${barChart(people.map((p) => ({ color: colorHex(p.color), values: days.map((day) => { const m = merged(p.id, day).sleep_min; return m == null ? null : m / 60; }) })), days, (v) => `${v.toFixed(1).replace('.', ',')} h`, 7, '7 h')}${legend(people)}</div>
    <h2>Fréquence cardiaque au repos</h2>
    <div class="card white">${barChart(people.map((p) => ({ color: colorHex(p.color), values: days.map((day) => merged(p.id, day).rhr) })), days, (v) => String(Math.round(v)))}${legend(people)}</div>
    <details class="card white" ${(metrics || []).some((m) => m.member_id === S.me.id && m.day === d) ? '' : 'open'}><summary class="title" style="cursor:pointer">Saisir ma journée à la main</summary>
    <form id="m" style="display:flex;flex-direction:column;gap:10px;margin-top:10px">
      <div class="grid2">
        <label>Pas<input name="steps" inputmode="numeric" value="${esc(todayMine.steps)}"></label>
        <label>Étages<input name="floors" inputmode="numeric" value="${esc(todayMine.floors)}"></label>
        <label>Sommeil (h)<input name="sleep_h" inputmode="decimal" value="${todayMine.sleep_min != null ? (todayMine.sleep_min / 60).toFixed(1).replace('.', ',') : ''}"></label>
        <label>FC au repos<input name="rhr" inputmode="numeric" value="${esc(todayMine.rhr)}"></label>
        <label>Stress (0–100)<input name="stress" inputmode="numeric" value="${esc(todayMine.stress)}"></label>
        <label>VFC (ms)<input name="hrv" inputmode="numeric" value="${esc(todayMine.hrv)}"></label>
      </div>
      <button class="btn block">Enregistrer à la main</button>
      <span class="muted small">Ce que tu saisis ici remplace les chiffres de la montre pour ce jour-là.</span>
    </form></details>
    <h2>Moyennes de la semaine</h2>
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
    ${people.map((p) => `<div class="card white"><span class="small" style="font-weight:600;color:${colorHex(p.color)}">${esc(p.first_name)}</span>${weightChart((weights || []).filter((w) => w.member_id === p.id), [p])}</div>`).join('')}
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
function legend(people) {
  return `<div class="row small" style="gap:14px">${people.map((p) => `<span class="row" style="gap:6px"><span style="width:12px;height:12px;border-radius:3px;background:${colorHex(p.color)}"></span>${esc(p.first_name)}</span>`).join('')}</div>`;
}
// Barres groupées : une couleur par personne, un groupe par jour de la semaine.
function barChart(series, days, fmt, goal = null, goalLabel = '') {
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  if (!all.length) return '<span class="muted">Pas encore de données cette semaine. Elles arrivent avec la montre ou la saisie à la main.</span>';
  const W = 330, H = 170, top = 18, bottom = 24, left = 4;
  const max = Math.max(...all, goal || 0) * 1.12 || 1;
  const gw = (W - left) / 7; const bw = Math.min(16, (gw - 8) / series.length);
  const Y = (v) => top + (1 - v / max) * (H - top - bottom);
  const DN = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" style="height:180px">`;
  if (goal) out += `<line x1="${left}" x2="${W}" y1="${Y(goal).toFixed(1)}" y2="${Y(goal).toFixed(1)}" stroke="#A9B0BC" stroke-dasharray="4 4"/><text x="${W - 2}" y="${(Y(goal) - 4).toFixed(1)}" font-size="10" fill="#5E6573" text-anchor="end">${esc(goalLabel)}</text>`;
  days.forEach((day, i) => {
    const gx = left + i * gw + (gw - bw * series.length) / 2;
    series.forEach((s, j) => {
      const v = s.values[i]; if (v == null) return;
      const x = gx + j * bw; const y = Y(v);
      out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(H - bottom - y).toFixed(1)}" rx="3" fill="${s.color}"><title>${esc(fmt(v))}</title></rect>`;
    });
    const isToday = day === iso(new Date());
    out += `<text x="${(left + i * gw + gw / 2).toFixed(1)}" y="${H - 6}" font-size="11" text-anchor="middle" fill="${isToday ? '#16181D' : '#5E6573'}" font-weight="${isToday ? 700 : 400}">${DN[i]}</text>`;
  });
  return out + '</svg>';
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

async function garminCall(action, extra = {}) {
  const { data, error } = await sb.functions.invoke('garmin', { body: { action, ...extra } });
  if (error) { try { return { error: (await error.context.json()).error || 'Garmin indisponible' }; } catch { return { error: 'Pas de connexion internet.' }; } }
  return data || {};
}
// Synchro Garmin discrète à l'ouverture, au plus toutes les 3 heures.
async function autoSyncGarmin() {
  const { data } = await sb.from('connections').select('status,last_sync').eq('member_id', S.me.id).eq('provider', 'garmin').maybeSingle();
  if (!data || data.status !== 'actif') return;
  if (data.last_sync && Date.now() - new Date(data.last_sync).getTime() < 3 * 3600 * 1000) return;
  const r = await garminCall('sync');
  if (r.added) toast(`Garmin : ${r.added} nouvelle(s) activité(s)`);
}

async function viewSources(newToken = '') {
  const { data: conns } = await sb.from('connections').select('*').eq('member_id', S.me.id);
  const apple = (conns || []).find((c) => c.provider === 'apple');
  const garmin = (conns || []).find((c) => c.provider === 'garmin');
  const since = (t) => t ? new Date(t).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const url = `${SUPABASE_URL}/functions/v1/ingest`;
  $app.innerHTML = header('Montres et sources', 'Tout est facultatif : la saisie à la main reste toujours possible.') + `<div class="wrap">
    <div class="card white">
      <div class="row between"><span class="title">Apple Watch et Apple Santé</span>${apple ? `<span class="pill ${apple.status === 'actif' ? 'ok' : 'warn'}">${apple.status === 'actif' ? 'Connecté' : 'En attente du 1er envoi'}</span>` : ''}</div>
      <span class="muted">Un raccourci iPhone envoie chaque soir tes pas, étages, fréquence cardiaque au repos, VFC et sommeil. Les séances Decathlon Coach ou Kinomap enregistrées dans Santé sont comptées dans tes données.</span>
      ${apple?.last_sync ? `<span class="small">Dernier envoi : ${esc(since(apple.last_sync))}</span>` : ''}
      ${newToken ? `
        <div class="notice"><b>Ton jeton personnel</b> (il ne sera plus affiché, copie-le maintenant) :
          <div style="font-family:monospace;word-break:break-all;margin:6px 0">${esc(newToken)}</div>
          <button class="btn sm" id="copyTok">Copier le jeton</button></div>
        <details class="card" open><summary class="title" style="cursor:pointer">Créer le raccourci (5 minutes)</summary>
          <ol class="steps small">
            <li>Ouvre l'app <b>Raccourcis</b>, touche <b>+</b>, nomme-le « Tandem Forme ».</li>
            <li>Ajoute <b>Rechercher des échantillons de santé</b> : type <b>Pas</b>, date de début <b>est aujourd'hui</b>. Puis <b>Calculer les statistiques</b> : <b>Somme</b>.</li>
            <li>Même chose pour <b>Étages montés</b> (Somme), <b>Variabilité de la fréquence cardiaque</b> (Moyenne) et <b>Fréquence cardiaque au repos</b> (Moyenne).</li>
            <li>Sommeil (facultatif) : <b>Analyse du sommeil</b> sur les <b>12 dernières heures</b>, valeur <b>n'est pas</b> « Au lit » ni « Éveillé », puis <b>Obtenir les détails</b> : <b>Durée</b>, puis <b>Calculer les statistiques</b> : <b>Somme</b> (en heures).</li>
            <li>Ajoute <b>Obtenir le contenu de l'URL</b> avec l'adresse ci-dessous. Méthode <b>POST</b>. En-tête <b>x-tandem-token</b> = ton jeton. Corps <b>JSON</b> avec les champs : <code>steps</code>, <code>floors</code>, <code>hrv</code>, <code>resting_hr</code>, <code>sleep_hours</code> (chacun = le résultat correspondant).</li>
            <li>Lance le raccourci une fois : l'appli doit afficher « Connecté ».</li>
            <li>Dans l'onglet <b>Automatisation</b> : <b>Heure de la journée</b>, 21:30, tous les jours, <b>Exécuter immédiatement</b>, et choisis « Tandem Forme ».</li>
          </ol>
          <span class="small">Adresse :</span>
          <div style="font-family:monospace;word-break:break-all" class="small">${esc(url)}</div>
          <button class="btn ghost sm" id="copyUrl">Copier l'adresse</button>
        </details>` : `
        <div class="row" style="flex-wrap:wrap">
          <button class="btn ${apple ? 'ghost' : ''}" id="appleTok">${apple ? 'Générer un nouveau jeton' : 'Connecter mon Apple Watch'}</button>
          ${apple ? '<button class="btn ghost" id="appleOff">Déconnecter</button>' : ''}
        </div>`}
    </div>
    <div class="card white">
      <div class="row between"><span class="title">Garmin</span>${garmin ? `<span class="pill ${garmin.status === 'actif' ? 'ok' : 'warn'}">${garmin.status === 'actif' ? 'Connecté' : 'À reconnecter'}</span>` : ''}</div>
      <span class="muted">Tes activités Garmin (course, vélo, renfo, marche…) arrivent toutes seules dans Suivi, à chaque ouverture de l'appli. Pour les pas et le sommeil, passe plutôt par Apple Santé.</span>
      ${garmin?.last_sync ? `<span class="small">Dernière synchro : ${esc(since(garmin.last_sync))}</span>` : ''}
      ${garmin ? `<div class="row" style="flex-wrap:wrap"><button class="btn sm" id="gSync">Synchroniser maintenant</button><button class="btn ghost sm" id="gOff">Déconnecter</button></div>
        ${garmin.status !== 'actif' ? '<span class="small">La clé ne marche plus : déconnecte puis reconnecte avec une nouvelle clé.</span>' : ''}` : `
        <ol class="steps small">
          <li>Sur ordinateur ou téléphone, ouvre <a href="https://connect.garmin.com/app/settings/personalApiToken" target="_blank" rel="noopener">la page « Personal API Key » de Garmin Connect</a> (Réglages, Compte).</li>
          <li><b>Create Key</b>, accepte les conditions, choisis la durée la plus longue, puis <b>Create</b>.</li>
          <li>Copie la clé (elle ne s'affiche qu'une fois) et colle-la ici.</li>
        </ol>
        <form id="gForm" class="row" style="gap:6px" novalidate><input name="key" type="password" autocomplete="off" placeholder="Clé personnelle Garmin" style="flex:1"><button class="btn">Connecter</button></form>
        <p class="err" id="gErr" role="alert" style="margin:0"></p>
        <span class="small muted">Ta clé est chiffrée sur le serveur et ne sert qu'à lire tes propres données. Tu peux la supprimer à tout moment depuis Garmin Connect.</span>`}
    </div>
    <div class="card"><div class="row between"><span class="title">Polar</span><span class="pill">Bientôt</span></div><span class="muted">Connexion automatique via Polar Flow, en cours de préparation.</span></div>
    <div class="card"><span class="title">Saisie manuelle</span><span class="muted">Pas, sommeil, fréquence cardiaque, activités, pesées.</span><button class="btn ghost" data-go="track">Aller au suivi</button></div>
  </div>`;
  $app.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => go(b.dataset.go));
  const copy = async (t, msg) => { try { await navigator.clipboard.writeText(t); toast(msg); } catch { toast('Copie impossible : sélectionne le texte à la main'); } };
  document.getElementById('copyTok')?.addEventListener('click', () => copy(newToken, 'Jeton copié'));
  document.getElementById('copyUrl')?.addEventListener('click', () => copy(url, 'Adresse copiée'));
  document.getElementById('appleTok')?.addEventListener('click', async () => {
    if (apple && !confirm('Le jeton actuel cessera de fonctionner. Il faudra le remplacer dans ton raccourci. Continuer ?')) return;
    const { data, error } = await sb.rpc('create_ingest_token', { p_provider: 'apple' });
    if (error) return fail(error, 'Création du jeton impossible');
    viewSources(data);
  });
  document.getElementById('gForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = e.target.key.value.trim(); const $e = document.getElementById('gErr'); const b = e.target.querySelector('.btn');
    if (!key) return ($e.textContent = 'Colle ta clé Garmin.');
    $e.textContent = ''; b.disabled = true; b.textContent = 'Vérification…';
    const r = await garminCall('connect', { api_key: key });
    b.disabled = false; b.textContent = 'Connecter';
    if (r.error) return ($e.textContent = r.error);
    toast(`Garmin connecté : ${r.added} activité(s) importée(s)`); viewSources();
  });
  document.getElementById('gSync')?.addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = 'Synchro…';
    const r = await garminCall('sync');
    toast(r.error || (r.added ? `${r.added} nouvelle(s) activité(s)` : 'Déjà à jour')); viewSources();
  });
  document.getElementById('gOff')?.addEventListener('click', async () => {
    if (!confirm('Déconnecter Garmin ? Les activités déjà importées sont conservées.')) return;
    const r = await garminCall('disconnect'); toast(r.error || 'Garmin déconnecté'); viewSources();
  });
  document.getElementById('appleOff')?.addEventListener('click', async () => {
    if (!confirm('Déconnecter Apple Santé ? Les données déjà reçues sont conservées.')) return;
    const { error } = await sb.rpc('revoke_ingest_token', { p_provider: 'apple' });
    if (error) return fail(error, 'Déconnexion impossible');
    toast('Apple Santé déconnecté'); viewSources();
  });
}

function viewAccount() {
  $app.innerHTML = header('Mon compte', esc(S.session.user.email)) + `<div class="wrap">
    <div class="card"><span class="title">Exporter mes données</span><span class="muted">Un fichier JSON avec ton profil, ton journal, tes pesées, tes séances et tes données de suivi.</span><button class="btn ghost" id="exp">Télécharger</button></div>
    <div class="card"><span class="title">Mot de passe</span><button class="btn ghost" id="pw">Changer mon mot de passe</button></div>
    <div class="card"><span class="title">Se déconnecter</span><button class="btn ghost" id="out">Se déconnecter</button></div>
    <div class="card" style="border:1px solid var(--danger)"><span class="title">Supprimer mon compte</span>
      <span class="muted">Efface définitivement ton profil et toutes tes données. ${S.partner ? `Le compte de ${esc(S.partner.first_name)} reste actif${isCaptain() ? ` et ${esc(S.partner.first_name)} devient capitaine` : ''}.` : 'Le tandem sera supprimé.'}</span>
      <button class="btn danger" id="del">Supprimer mon compte</button></div>
  </div>`;
  document.getElementById('out').onclick = () => sb.auth.signOut();
  document.getElementById('exp').onclick = exportData;
  document.getElementById('pw').onclick = () => viewSetPassword('change');
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
    <p class="muted" style="margin:0">C'est définitif. Saisis ton mot de passe pour confirmer.</p>
    <form id="d" style="display:flex;flex-direction:column;gap:12px" novalidate>
      ${pwField('password', 'Mot de passe', 'current-password')}
      <p class="err" id="derr" role="alert"></p>
      <div class="grid2"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn danger">Supprimer</button></div>
    </form>`, (root) => {
    bindEyes(root);
    root.querySelector('#d').onsubmit = async (e) => {
      e.preventDefault();
      const $e = root.querySelector('#derr'); const b = root.querySelector('.btn.danger'); $e.textContent = '';
      const password = e.target.password.value;
      if (!password) return ($e.textContent = 'Saisis ton mot de passe.');
      b.disabled = true;
      const { error } = await sb.auth.signInWithPassword({ email: S.session.user.email, password });
      if (error) { b.disabled = false; return ($e.textContent = authMessage(error)); }
      const { error: delErr } = await sb.functions.invoke('delete-account', { method: 'POST' });
      if (delErr) { let m = 'Suppression impossible'; try { m = (await delErr.context.json()).error || m; } catch {} b.disabled = false; return ($e.textContent = m); }
      closeModal(); await sb.auth.signOut(); toast('Compte supprimé');
    };
  });
}

boot();

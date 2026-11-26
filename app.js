import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import {
  COLORS, colorHex, ALLERGENS, DIETS, ZONES, ZONE_TYPES, EQUIPMENT,
  iso, parseDay, addDays, mondayOf, generatePlan, eligibleRecipes, mealChoices, courseChoices,
  WEEKDAYS, availOf, allowedFor, LEVELS, LEVEL_QUESTIONS, levelFromAnswers, levelOf, sessionText, variantFor, holdSeconds, weekLoad, SOURCES,
} from './program.js';
import { EXERCISES, SESSIONS, GAINAGE, videoUrl } from './exercises.js';
import { animSvg, hasAnim, startAnims } from './animations.js';
import { FRIDGE, FRIDGE_CATS, parseFree, matchRecipes, quickRecipe, allergensOf } from './frigo.js';

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
  $modal.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-bar"><span class="grab" aria-hidden="true"></span><button type="button" class="sheet-close" data-close aria-label="Fermer">✕</button></div>${html}</div>`;
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
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.go && S.me?.onboarded_at) go(e.data.go); });
  }
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
  const gq = new URLSearchParams(location.search).get('go');
  if (gq && ['today', 'meals', 'defis', 'track', 'more', 'notifs'].includes(gq)) { history.replaceState(null, '', location.pathname); S.view = gq; }
  const qp = new URLSearchParams(location.search).get('polar');
  if (qp) {
    history.replaceState(null, '', location.pathname); S.view = 'sources';
    setTimeout(() => toast({ ok: 'Polar est connecté, tes données arrivent !', refus: 'Connexion Polar annulée.', consentement: 'Accepte les autorisations dans Polar Flow, puis réessaie.', lien_expire: 'Le lien a expiré, réessaie.' }[qp] || 'Connexion Polar impossible, réessaie.'), 300);
  }
  renderTabs(); await render();
  autoSync().catch(() => {});
  let tourDone = !!meta.tour_done; try { tourDone = tourDone || localStorage.getItem('tf_tour_done') === '1'; } catch {}
  if (S.startTour || !tourDone) { S.startTour = false; setTimeout(() => startTour(0), 400); }
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
      sb.from('recipes').select('id,name,minutes,servings,protein,dish_type,season,is_treat,lunchbox,kcal_portion,course'),
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
    <div class="card"><span class="title">Comment ça marche ?</span>
      <ol class="steps small">
        <li>Tu remplis tes infos et celles de ton ou ta partenaire, puis tu envoies.</li>
        <li>Vous recevez chacun un e-mail avec un lien (pensez aux spams).</li>
        <li>Chacun ouvre son lien sur son téléphone, crée son mot de passe et remplit son profil en 3 minutes : couleur, infos, <b>jours et nombre de séances de sport selon ses disponibilités</b>, santé et alimentation.</li>
      </ol>
      <span class="small">Tu deviens le <b>capitaine</b> : c'est toi qui régleras le matériel et le programme pour vous deux.</span></div>
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
  <div class="card white"><h3>Ton temps pour le sport</h3>
    <span class="muted">Jours où tu peux faire du sport</span>
    <div class="chips" data-multi="days">${WEEKDAYS.map((l, i) => `<button type="button" class="chip" data-v="${i}" aria-pressed="${availOf(m).days.includes(i)}">${l}</button>`).join('')}</div>
    <span class="muted">Nombre de séances par semaine</span>
    <div class="chips" data-single="sessions">${[2, 3, 4, 5, 6].map((n) => `<button type="button" class="chip" data-v="${n}" aria-pressed="${availOf(m).sessions === n}">${n}</button>`).join('')}</div>
    <span class="muted">Durée d'une séance</span>
    <div class="chips" data-single="minutes">${[20, 30, 45, 60].map((n) => `<button type="button" class="chip" data-v="${n}" aria-pressed="${availOf(m).minutes === n}">${n} min</button>`).join('')}</div>
  </div>
  <div class="card white"><h3>Ton niveau sportif</h3>
    <span class="muted small">5 questions rapides, réponds honnêtement : le programme s'adapte à ton niveau.</span>
    ${LEVEL_QUESTIONS.map((x) => `<span class="small" style="font-weight:600">${esc(x.q)}</span><div class="chips" data-single="q_${x.id}">${x.a.map((a, i) => `<button type="button" class="chip" data-v="${i}" aria-pressed="${m.fitness?.answers?.[x.id] === i}">${esc(a)}</button>`).join('')}</div>`).join('')}
    <div class="card" id="lvlBox"><span class="small muted">Ton niveau</span>
      <div class="chips" data-single="level">${LEVELS.map((l) => `<button type="button" class="chip" data-v="${l.n}" aria-pressed="${levelOf(m) === l.n && !!m.fitness?.level}">${l.name}</button>`).join('')}</div>
      <span class="small" id="lvlDesc">${m.fitness?.level ? esc(LEVELS[levelOf(m) - 1].desc) : 'Réponds aux questions : on te propose un niveau, que tu peux ajuster.'}</span></div>
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
  root.querySelectorAll('[data-single] .chip').forEach((b) => b.onclick = () => {
    b.parentElement.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true');
    const group = b.parentElement.dataset.single;
    if (group.startsWith('q_') || group === 'level') {
      const ans = readAnswers(root);
      let lvl = Number(root.querySelector('[data-single=level] .chip[aria-pressed=true]')?.dataset.v || 0);
      if (group.startsWith('q_') && Object.keys(ans).length === LEVEL_QUESTIONS.length) {
        lvl = levelFromAnswers(ans);
        root.querySelectorAll('[data-single=level] .chip').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.v) === lvl)));
      }
      const d = root.querySelector('#lvlDesc'); if (d && lvl) d.textContent = `${LEVELS[lvl - 1].desc}${group === 'level' ? '' : ' (proposé d\'après tes réponses, tu peux l\'ajuster)'}`;
    }
  });
  root.querySelector('#addZone').onclick = () => root.querySelector('#zones').insertAdjacentHTML('beforeend', zoneRow());
  root.addEventListener('click', (e) => { if (e.target.matches('[data-rmzone]')) e.target.closest('.zone').remove(); });
}
function readAnswers(root) {
  const out = {};
  for (const x of LEVEL_QUESTIONS) { const b = root.querySelector(`[data-single=q_${x.id}] .chip[aria-pressed=true]`); if (b) out[x.id] = Number(b.dataset.v); }
  return out;
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
    fitness: (() => {
      const answers = readAnswers(root);
      const lvl = Number(root.querySelector('[data-single=level] .chip[aria-pressed=true]')?.dataset.v || 0) || (Object.keys(answers).length ? levelFromAnswers(answers) : 0);
      const prev = S.me?.fitness || {};
      if (!lvl) return prev;
      const changed = lvl !== prev.level;
      return { ...prev, level: lvl, answers, assessed_at: changed || !prev.assessed_at ? new Date().toISOString() : prev.assessed_at, history: changed ? [...(prev.history || []), { level: lvl, at: new Date().toISOString(), by: 'test' }].slice(-20) : prev.history || [] };
    })(),
    availability: {
      days: multi('days').map(Number),
      sessions: Number(root.querySelector('[data-single=sessions] .chip[aria-pressed=true]')?.dataset.v || 4),
      minutes: Number(root.querySelector('[data-single=minutes] .chip[aria-pressed=true]')?.dataset.v || 30),
    },
  };
}

// Premier lancement : un assistant en étapes, chaque écran explique à quoi servent les infos demandées.
function viewOnboarding(step = 0) {
  const partner = S.partner?.first_name || 'ton ou ta partenaire';
  const captain = isCaptain();
  const cards = profileForm(S.me, S.partner?.color).split(/(?=<div class="card white"><h3>)/).filter((x) => x.trim());
  const STEPS = [
    { title: `Bienvenue ${esc(S.me.first_name)} !`, sub: 'Tandem Forme, c\'est votre coach à deux : sport, repas et suivi, chacun sur son téléphone.', body: `
      <div class="card"><span class="title">Ce que fait l'appli</span>
        <ul class="plain small">
          <li><b>Un programme de sport</b> adapté à votre matériel et à vos petites douleurs, à cocher séance par séance.</li>
          <li><b>Des menus simples et équilibrés</b> : 3 idées par repas, filtrées selon vos allergies.</li>
          <li><b>Un suivi</b> des pas, du sport et du sommeil, avec des courbes.</li>
          <li><b>Des défis à deux</b> pour se motiver : paliers de pas, séries, points et badges.</li>
        </ul></div>
      <div class="card"><span class="title">${captain ? 'Tu es le capitaine du tandem' : `${esc(partner)} est le capitaine du tandem`}</span>
        <span class="small">${captain ? `C'est toi qui règles le matériel et la durée du programme, pour vous deux. ${esc(partner)} pourra te faire des suggestions.` : `C'est ${esc(partner)} qui règle le matériel et la durée du programme. Toi, tu peux lui envoyer des suggestions depuis l'appli.`}</span></div>
      <div class="card"><span class="title">Ça prend 3 minutes</span><span class="small">7 petites étapes. Tout reste modifiable plus tard dans « Mon profil ».</span></div>` },
    { title: 'Ta couleur', sub: 'Elle sert à te reconnaître partout : boutons, graphiques, défis.', body: `${cards[0]}<p class="small muted">La couleur déjà choisie par ${esc(partner)} est grisée.</p>` },
    { title: 'Toi', sub: 'Pour personnaliser tes objectifs et suivre tes progrès.', body: `${cards[1]}
      <div class="card"><span class="small"><b>Pourquoi ces infos ?</b> L'âge et la taille aident à fixer des objectifs réalistes. Le poids de départ sert de point de comparaison dans tes courbes, et l'objectif t'indique le chemin restant. Seul le prénom est obligatoire.</span>
      <span class="small"><b>Qui les voit ?</b> Toi et ${esc(partner)} uniquement.</span></div>` },
    { title: 'Ton temps pour le sport', sub: 'Pour que le programme tienne dans ta semaine.', body: `${cards[2]}
      <div class="card"><span class="small"><b>Comment ça marche ?</b> Coche les jours où tu peux faire du sport, combien de séances tu vises par semaine et combien de temps tu as. Le programme place tes séances sur ces jours en les espaçant, en alternant renfo et cardio, avec la sortie la plus longue en fin de semaine.</span>
      <span class="small"><b>Conseil pour démarrer :</b> 3 séances de 30 min, c'est déjà très bien. Mieux vaut peu et régulier que trop et abandonner.</span>
      <span class="small">Si vous avez des jours en commun avec ${esc(partner)}, vos séances tombent ensemble quand c'est possible. Une respiration de 5 min est proposée chaque soir, en bonus.</span></div>` },
    { title: 'Ton niveau sportif', sub: 'Pour des séances ni trop faciles, ni trop dures.', body: `${cards[3]}
      <div class="card"><span class="small"><b>À quoi ça sert ?</b> Ton niveau règle le nombre de tours, de répétitions, les temps de repos, la durée des positions tenues et l'allure en cardio. Les exercices plus difficiles (pompes classiques, squat sauté…) se débloquent aux niveaux supérieurs.</span>
      <span class="small"><b>Et ensuite ?</b> Après chaque séance, tu dis si c'était trop facile, bien ou trop dur. Si c'est souvent trop facile (ou trop dur), l'appli te propose de changer de niveau. Tu peux aussi refaire ce test dans « Mon profil ».</span></div>` },
    { title: 'Ta santé', sub: 'Pour que le programme évite les mouvements qui te font mal.', body: `${cards[4]}
      <div class="card"><span class="small"><b>Comment ça marche ?</b> Ajoute une zone fragile (épaule, nuque, genou…) : les exercices qui la sollicitent sont retirés de ton programme, et des exercices doux de renforcement peuvent être ajoutés. Exemple : une tendinite à l'épaule retire les pompes et le kettlebell swing.</span>
      <span class="small"><b>Rien à signaler ?</b> Passe simplement à l'étape suivante.</span>
      <span class="small muted">L'appli ne remplace pas un avis médical : en cas de douleur vive, arrête et consulte.</span></div>` },
    { title: 'Ton alimentation', sub: 'Pour que les recettes proposées conviennent à vous deux.', body: `${cards[5]}
      <div class="card"><span class="small"><b>Comment ça marche ?</b> Les allergies et régimes de vous deux sont combinés : une recette n'est proposée que si elle convient à chacun. Les allergènes sont calculés à partir des ingrédients et affichés sur chaque recette.</span>
      <span class="small"><b>Ce que tu n'aimes pas</b> : écris quelques mots séparés par des virgules (ex. « chou-fleur, lentilles »), les recettes qui en contiennent seront écartées.</span></div>` },
    { title: 'C\'est prêt !', sub: 'Voici comment démarrer.', body: `
      <div class="card"><span class="title">1. ${captain ? 'Crée le programme' : `${esc(partner)} crée le programme`}</span><span class="small">${captain ? 'Dans Plus, puis « Matériel et programme » : coche votre matériel, choisis la durée (2 à 12 semaines) et la date de début.' : 'Dès que c\'est fait, tes séances apparaissent dans « Aujourd\'hui ».'}</span></div>
      <div class="card"><span class="title">2. Choisis tes repas</span><span class="small">Onglet Repas : touche une des 3 idées, puis « C'est mangé » après le repas. Si vous avez mangé autre chose, dis-le, sans culpabiliser.</span></div>
      <div class="card"><span class="title">3. Note ta journée</span><span class="small">Onglet Suivi : tes pas et ton sommeil en 30 secondes, et ton sport en plus du programme.</span></div>
      <div class="card"><span class="title">Une visite guidée t'attend</span><span class="small">En 1 minute, on te montre où tout se trouve. Le guide complet est toujours dans Plus, puis « Guide de l'appli ».</span></div>` },
  ];
  const n = STEPS.length;
  $app.innerHTML = `
  <div class="hero"><div class="inner">
    <div class="row between"><small>Étape ${step + 1} sur ${n}</small>${step > 0 && step < n - 1 ? '<button class="link" id="skipStep" style="color:#fff">Passer</button>' : ''}</div>
    <div class="bar"><div style="width:${Math.round(((step + 1) / n) * 100)}%"></div></div>
    <h1>${STEPS[step].title}</h1><small>${STEPS[step].sub}</small></div></div>
  <form id="f" class="wrap" novalidate>
    ${STEPS.map((st, i) => `<div data-step="${i}" ${i === step ? '' : 'hidden'} style="display:flex;flex-direction:column;gap:14px">${st.body}</div>`).join('')}
    <p class="err" id="oerr" role="alert" style="margin:0"></p>
    <div class="grid2">${step > 0 ? '<button type="button" class="btn ghost" id="prev">Retour</button>' : '<span></span>'}<button class="btn" id="next">${step === n - 1 ? 'Commencer' : step === 0 ? 'C\'est parti' : 'Suivant'}</button></div>
  </form>`;
  const f = document.getElementById('f'); bindProfile(f);
  if (S.onbDraft) restoreDraft(f, S.onbDraft);
  const $e = document.getElementById('oerr');
  const goStep = (k) => { S.onbDraft = snapshot(f); viewOnboarding(k); window.scrollTo(0, 0); };
  document.getElementById('prev')?.addEventListener('click', () => goStep(step - 1));
  document.getElementById('skipStep')?.addEventListener('click', () => goStep(step + 1));
  f.onsubmit = async (e) => {
    e.preventDefault(); $e.textContent = '';
    const p = readProfile(f);
    if (step === 1 && !p.color) return ($e.textContent = 'Choisis une couleur pour continuer.');
    if (step === 1 && S.partner && p.color === S.partner.color) return ($e.textContent = `Cette couleur est déjà prise par ${S.partner.first_name}.`);
    if (step === 2) {
      if (!p.first_name) return ($e.textContent = 'Indique ton prénom.');
      const bad = [[p.height_cm, 120, 230, 'Taille (cm)'], [p.start_weight, 30, 300, 'Poids de départ'], [p.goal_weight, 30, 300, 'Poids objectif']].find(([v, lo, hi]) => v != null && (Number.isNaN(v) || v < lo || v > hi));
      if (bad) return ($e.textContent = `${bad[3]} : entre ${bad[1]} et ${bad[2]}.`);
      if (p.birth_date && (p.birth_date > addDays(today(), -365 * 16) || p.birth_date < '1920-01-01')) return ($e.textContent = 'Vérifie ta date de naissance.');
    }
    if (step === 3) {
      if (!p.availability.days.length) return ($e.textContent = 'Coche au moins un jour.');
      if (p.availability.sessions > p.availability.days.length) return ($e.textContent = `Tu as choisi ${p.availability.sessions} séances mais seulement ${p.availability.days.length} jour(s) : ajoute des jours ou réduis le nombre de séances.`);
    }
    if (step === 4 && !p.fitness?.level) return ($e.textContent = 'Réponds aux questions ou choisis ton niveau.');
    if (step < n - 1) return goStep(step + 1);
    const btn = document.getElementById('next'); btn.disabled = true; btn.textContent = 'Enregistrement…';
    const { error } = await sb.from('members').update({ ...p, onboarded_at: new Date().toISOString() }).eq('id', S.me.id);
    if (error) { btn.disabled = false; btn.textContent = 'Commencer'; return ($e.textContent = `Enregistrement impossible : ${error.message}`); }
    S.onbDraft = null; S.startTour = true;
    route();
  };
}
// Garde les réponses quand on navigue entre les étapes de l'assistant.
function snapshot(f) {
  return {
    values: Object.fromEntries([...f.querySelectorAll('input[name],select[name],textarea[name]')].filter((i) => !i.name.startsWith('z_')).map((i) => [i.name, i.value])),
    pressed: [...f.querySelectorAll('[data-multi] .chip[aria-pressed=true], [data-single] .chip[aria-pressed=true]')].map((b) => `${(b.closest('[data-multi]') || b.closest('[data-single]')).dataset.multi || b.closest('[data-single]').dataset.single}:${b.dataset.v}`),
    zones: [...f.querySelectorAll('.zone')].map((z) => ({ zone: z.querySelector('[name=z_zone]').value, side: z.querySelector('[name=z_side]').value, type: z.querySelector('[name=z_type]').value, intensity: z.querySelector('[name=z_int]').value, avoid: z.querySelector('[name=z_avoid]').value })),
  };
}
function restoreDraft(f, d) {
  for (const [k, v] of Object.entries(d.values)) { const el = f.querySelector(`[name="${k}"]`); if (el) el.value = v; }
  f.querySelectorAll('[data-multi] .chip').forEach((b) => b.setAttribute('aria-pressed', d.pressed.includes(`${b.closest('[data-multi]').dataset.multi}:${b.dataset.v}`)));
  f.querySelectorAll('[data-single] .chip').forEach((b) => b.setAttribute('aria-pressed', d.pressed.includes(`${b.closest('[data-single]').dataset.single}:${b.dataset.v}`)));
  f.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', b.dataset.color === d.values.color));
  if (d.values.color) document.documentElement.style.setProperty('--me', colorHex(d.values.color));
  f.querySelector('#zones').innerHTML = d.zones.map(zoneRow).join('');
}

// ---------- visite guidée ----------
const TOUR = [
  { tab: 'today', sel: '[data-tab=today]', title: 'Aujourd\'hui', text: 'Ta page d\'accueil : les séances du jour à cocher, le défi de pas à deux et un aperçu de vos repas. Les flèches en haut changent de jour.' },
  { tab: 'today', sel: '.toggle:not([disabled])', title: 'Coche tes séances', text: 'Touche ton bouton quand la séance est faite. Tu vois aussi où en est ton ou ta partenaire.' },
  { tab: 'meals', sel: '[data-tab=meals]', title: 'Repas', text: '3 idées par repas, adaptées à vos allergies. Touche une recette pour la choisir, « Voir la recette » pour les ingrédients et les étapes, puis « C\'est mangé ».' },
  { tab: 'meals', sel: '[data-other]', title: 'On a mangé autre chose ?', text: 'Aucun souci : dis ce que vous avez mangé. Tu as un joker par semaine pour un repas plaisir.' },
  { tab: 'defis', sel: '[data-tab=defis]', title: 'Défis', text: 'Paliers de pas, marche rapide, séries, points du mois et badges. Le barème complet est en bas de l\'écran.' },
  { tab: 'track', sel: '[data-tab=track]', title: 'Suivi', text: 'Toutes vos données en Jour, Semaine ou Mois : pas, sommeil, poids, fréquence cardiaque… et « Saisir ma journée » pour tout noter à la main.' },
  { tab: 'more', sel: '[data-tab=more]', title: 'Plus', text: 'Journal, programme, réglages du capitaine, notifications, profil, compte, et le guide complet de l\'appli. Tu peux relancer cette visite quand tu veux.' },
];
async function startTour(i = 0) {
  const st = TOUR[i];
  if (!st) return endTour();
  if (S.view !== st.tab) { S.view = st.tab; renderTabs(); await render(); }
  document.querySelectorAll('.tour-hi').forEach((el) => el.classList.remove('tour-hi'));
  document.getElementById('tour')?.remove();
  const target = document.querySelector(st.sel) || document.querySelector(`[data-tab=${st.tab}]`);
  target.classList.add('tour-hi');
  if (target.closest('#tabs')) window.scrollTo(0, 0); else target.scrollIntoView({ block: 'center', behavior: 'instant' });
  const r = target.getBoundingClientRect(); const below = r.top < window.innerHeight / 2;
  const box = document.createElement('div'); box.id = 'tour'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', st.title);
  box.innerHTML = `<div class="tour-card" style="${below ? `top:${Math.min(window.innerHeight - 220, r.bottom + 12)}px` : `bottom:${Math.max(12, window.innerHeight - r.top + 12)}px`}">
    <div class="row between"><span class="small muted">${i + 1} / ${TOUR.length}</span><button class="link" id="tSkip">Passer</button></div>
    <h3>${st.title}</h3><p class="small" style="margin:0">${st.text}</p>
    <div class="row" style="justify-content:flex-end">${i ? '<button class="btn ghost sm" id="tPrev">Retour</button>' : ''}<button class="btn sm" id="tNext">${i === TOUR.length - 1 ? 'Terminer' : 'Suivant'}</button></div></div>`;
  document.body.appendChild(box);
  box.querySelector('#tNext').onclick = () => startTour(i + 1);
  box.querySelector('#tPrev')?.addEventListener('click', () => startTour(i - 1));
  box.querySelector('#tSkip').onclick = endTour;
  box.querySelector('#tNext').focus();
}
function endTour() {
  document.querySelectorAll('.tour-hi').forEach((el) => el.classList.remove('tour-hi'));
  document.getElementById('tour')?.remove();
  try { localStorage.setItem('tf_tour_done', '1'); } catch {}
  sb.auth.updateUser({ data: { tour_done: true } }).catch(() => {});
  go('today');
}

// ---------- guide ----------
function viewGuide() {
  const sec = (t, html, open = false) => `<details class="card white" ${open ? 'open' : ''}><summary class="title" style="cursor:pointer">${t}</summary><div class="small" style="display:flex;flex-direction:column;gap:8px;margin-top:8px">${html}</div></details>`;
  $app.innerHTML = header('Guide de l\'appli', 'Tout ce qu\'il faut savoir, en bref.') + `<div class="wrap">
    <button class="btn" id="replay">Relancer la visite guidée</button>
    ${sec('Premiers pas', `<p>1. L'un de vous inscrit le tandem avec vos deux e-mails. 2. Chacun reçoit un lien, crée son mot de passe et remplit son profil. 3. Le capitaine crée le programme dans Plus, puis « Matériel et programme ». C'est tout !</p><p>Pour installer l'appli : dans Safari ou Chrome, touchez Partager, puis « Sur l'écran d'accueil ».</p>`, true)}
    ${sec('Le capitaine', `<p>C'est la personne qui a inscrit le tandem. Elle coche le matériel disponible à la maison, choisit la durée (2 à 12 semaines), la date de début et la semaine où la course reprend. Le programme vaut pour vous deux, mais les exercices sont adaptés à chacun selon ses zones fragiles.</p><p>L'autre personne voit les réglages et peut envoyer des suggestions.</p>`)}
    ${sec('Le programme', `<p>Lundi, mercredi et vendredi : renfo maison (échauffement au vélo si vous en avez un). Mardi et jeudi : marche active. Samedi : grande balade ou course douce. Dimanche : étirements. Chaque soir : 5 min de respiration.</p><p>Les séances s'allongent doucement au fil des semaines. Cochez-les dans « Aujourd'hui ». Si une séance ne passe pas, ce n'est pas grave : on reprend le lendemain.</p><p><b>Le niveau</b> (Débutant, Reprise, Intermédiaire, Confirmé) est évalué à l'inscription par 5 questions. Il règle les tours, répétitions, repos, temps de gainage et l'allure en cardio, et débloque des variantes plus dures (pompes classiques, squat sauté, gainage latéral). Après chaque séance cochée, dis si c'était trop dur, bien ou trop facile : l'appli te propose de monter ou descendre de niveau, et de refaire le test toutes les 4 semaines (Mon profil).</p>`)}
    ${sec('Les repas', `<p>Pour chaque midi et chaque soir : 3 idées de la même famille (même viande ou poisson, même type de plat). Le midi privilégie les plats qui se transportent en gamelle. Le vendredi soir, un plat plaisir fait maison.</p><p>« C'est mangé » valide le repas. « On a mangé autre chose » demande ce que vous avez mangé (pour vous deux ou pour toi seul). Un joker par semaine et par personne pour un repas plaisir, sans culpabilité.</p><p>Les recettes sont prévues pour 4 portions (2 repas pour vous deux, ou 1 repas et 2 gamelles) ; le sélecteur de portions recalcule les quantités.</p>`)}
    ${sec('Frigo, entrées et desserts', `<p><b>🧊 Avec ce qu'on a dans le frigo</b> (sous chaque repas) : coche tes ingrédients, l'appli te propose les recettes de la base qui collent le mieux (avec ce qu'il manque) et compose une recette minute pas à pas. « On fait ça » l'enregistre pour le repas.</p><p><b>Entrée et dessert</b> : totalement facultatifs, dans « ＋ Entrée et dessert » sous chaque repas. Des idées légères qui changent chaque jour, avec la recette et les calories.</p>`)}
    ${sec('Le journal', `<p>Verres d'alcool, verres d'eau, écarts et une note libre, chaque jour. Il est privé par défaut : coche « Partager » si tu veux que ton ou ta partenaire le voie.</p>`)}
    ${sec('Le suivi', `<p>Onglet Suivi : les <b>pas</b>, le <b>sport</b>, le <b>sommeil</b> et le <b>poids</b>, en Jour, Semaine ou Mois, avec des courbes et la comparaison à la période précédente.</p><p>Chaque jour : « Saisir pas et sommeil » (le nombre de pas est dans l'appli Santé de l'iPhone ou Google Fit / Samsung Health sur Android), « Pesée » pour le poids. Les séances du programme cochées comptent automatiquement en minutes de sport ; « + Activité » sert pour le reste : le sport, la durée, la FC moyenne et ton ressenti de 1 (c'était dur) à 5 (très fort).</p><p>La connexion automatique aux montres (Garmin, Polar, Apple Watch) arrive plus tard.</p>`)}
    ${sec('Le programme évolue avec vous', `<p><b>Le point de la semaine</b> (du vendredi au lundi, sur Aujourd'hui ou dans Programme) : quelques questions sur la difficulté, la forme, la durée, le nombre de séances, la course, les exercices à changer et les douleurs. L'appli propose les changements, tu valides, et tes séances s'adaptent à partir de lundi.</p><p><b>Changer la durée ou le nombre de séances</b> à tout moment : Programme › « Changer durée et nombre de séances ».</p><p><b>Recommencer</b> avec un nouveau programme : Programme › en bas. Le programme est commun, donc ton binôme doit accepter. Les séances faites restent enregistrées.</p><p><b>D'où viennent les séances ?</b> Des recommandations de l'OMS (endurance et renforcement par semaine), du plan Couch to 5K du NHS pour la course, et des repères de l'American College of Sports Medicine pour le renforcement.</p>`)}
    ${sec('Les défis et les points', `<p>Jauge du jour à 4 paliers (2 500, 5 000, 7 500, 10 000 pas), marche rapide de 10 ou 20 min, séries de jours à 7 500 pas, défis à deux (20 000 pas par jour, 120 000 par semaine), points du mois et badges.</p><p>Barème : 1 pt par palier de pas · marche rapide 10 min +1, 20 min +2 · séance du programme +3 · respiration +1 · autre activité +2 (2 max par jour) · repas suivi +1 · journal +1 · journée sans alcool +1 · nuit de 7 h +1 · défi du jour à deux +2.</p>`)}
    ${sec('Les notifications', `<p>Plus › Notifications › « Activer ». Sur iPhone, ajoute d'abord l'appli à l'écran d'accueil et ouvre-la depuis l'icône : c'est obligatoire chez Apple (iOS 16.4 minimum). Safari : Partager en bas › Sur l'écran d'accueil. Chrome : Partager en haut à droite dans la barre d'adresse › Sur l'écran d'accueil. Brave ou autre : Partager › Sur l'écran d'accueil ; si l'option manque, fais-le une fois depuis Safari. Reconnecte-toi une fois dans l'icône. Sur Android, ça marche directement dans Chrome.</p><p>Tu choisis : rappel de séance (à ton heure), séance terminée par ton partenaire, repas à choisir (10 h), défi à deux (20 h), bilan du dimanche (19 h). Un rappel n'est envoyé que s'il sert : pas de rappel séance si elle est déjà faite.</p>`)}
    ${sec('Vos données', `<p>Elles sont hébergées en Europe (Supabase, Francfort) et ne sont visibles que par vous deux. Le journal est privé sauf si vous le partagez. Dans « Mon compte » : export de toutes tes données, changement de mot de passe et suppression définitive du compte.</p>`)}
    ${sec('Questions fréquentes', `<p><b>Je n'ai pas reçu l'e-mail.</b> Regarde dans les spams, puis utilise « Mot de passe oublié » sur l'écran de connexion.</p><p><b>Mon ou ma partenaire ne s'est pas encore connecté.</b> Sur « Aujourd'hui », un bouton permet de renvoyer son lien.</p><p><b>Je n'ai pas de montre.</b> Tout se saisit à la main, les défis marchent aussi.</p><p><b>Une recette ne nous plaît pas.</b> Ajoute l'ingrédient dans « Ce que tu n'aimes pas » (Mon profil).</p>`)}
    <h2>Un retour sur l'appli ?</h2>
    <form id="fb" class="card white" novalidate>
      <span class="small">Vous testez une version bêta : un bug, une idée, quelque chose de pas clair ? Dis-le-nous, ça nous aide énormément.</span>
      <div class="chips">${[['bug', 'Un bug'], ['idee', 'Une idée'], ['autre', 'Autre']].map(([v, l], i) => `<button type="button" class="chip" data-kind="${v}" aria-pressed="${i === 0}">${l}</button>`).join('')}</div>
      <textarea name="text" placeholder="Ce qui s'est passé, sur quel écran…"></textarea>
      <p class="err" id="fberr" role="alert" style="margin:0"></p>
      <button class="btn">Envoyer</button>
    </form>
  </div>`;
  document.getElementById('replay').onclick = () => startTour(0);
  const f = document.getElementById('fb');
  f.querySelectorAll('[data-kind]').forEach((b) => b.onclick = () => { f.querySelectorAll('[data-kind]').forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); });
  f.onsubmit = async (e) => {
    e.preventDefault(); const text = f.text.value.trim(); const $e = document.getElementById('fberr');
    if (!text) return ($e.textContent = 'Écris ton message.');
    const kind = f.querySelector('[data-kind][aria-pressed=true]').dataset.kind;
    const { error } = await sb.from('feedback').insert({ member_id: S.me.id, kind, text: text.slice(0, 2000), screen: navigator.userAgent.slice(0, 200) });
    if (error) return ($e.textContent = `Envoi impossible : ${error.message}`);
    f.text.value = ''; toast('Merci pour ton retour !');
  };
}

// ---------- navigation ----------
const ICONS = {
  today: '<path d="M4 6h16M4 12h16M4 18h10" stroke-width="2" stroke-linecap="round"/>',
  meals: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 2-2 6 0 8v10" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  defis: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  journal: '<path d="M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6zM9 8h6M9 12h6" stroke-width="2" stroke-linecap="round"/>',
  track: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2" stroke-width="2" stroke-linecap="round"/>',
  more: '<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>',
};
const TABS = [['today', 'Aujourd\'hui'], ['meals', 'Repas'], ['defis', 'Défis'], ['track', 'Suivi'], ['more', 'Plus']];
function renderTabs() {
  $tabs.hidden = false;
  $tabs.innerHTML = TABS.map(([id, l]) => `<button data-tab="${id}" ${S.view === id || (id === 'more' && ['program', 'settings', 'profile', 'account', 'sources', 'journal', 'guide', 'notifs'].includes(S.view)) ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" fill="${id === 'more' ? 'currentColor' : 'none'}" stroke="currentColor">${ICONS[id]}</svg>${l}</button>`).join('');
  $tabs.querySelectorAll('button').forEach((b) => b.onclick = () => go(b.dataset.tab));
}
function go(view) { S.view = view; renderTabs(); render(); window.scrollTo(0, 0); }
async function render() {
  const views = { guide: viewGuide, today: viewToday, meals: viewMeals, journal: viewJournal, defis: viewChallenges, track: viewTrack, more: viewMore, program: viewProgram, settings: viewSettings, profile: viewProfile, account: viewAccount, sources: viewSources, notifs: viewNotifs };
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
// À qui s'adresse une séance (les anciens programmes n'ont pas ce champ : pour tout le monde).
const forOf = (s) => s.for || [S.me?.id, S.partner?.id].filter(Boolean);
const countable = (s) => s.key !== 'respiration' && !s.optional;
const planCtx = (d) => ({ week: planDay(d)?.week || 1, weeks: S.plan?.data?.weeks || 6, runFrom: Number(S.tandem?.settings?.run_from_week || 1), bike: (S.tandem?.settings?.equipment || []).includes('velo') });
const textFor = (s, m, d) => { const c = planCtx(d); return sessionText(s, m, c.week, c.weeks, c.runFrom, c.bike); };
function plannedFor(mid, fromDay, n = 7) {
  let t = 0; for (let i = 0; i < n; i++) t += (planDay(addDays(fromDay, i))?.sessions || []).filter((s) => countable(s) && forOf(s).includes(mid)).length;
  return t;
}
function weekLabel(d) {
  const pd = planDay(d);
  return pd ? `Semaine ${pd.week} sur ${S.plan.data.weeks}` : (S.plan ? 'Hors programme' : 'Pas encore de programme');
}

// ---------- Aujourd'hui ----------
// Ressenti après une séance : sert à adapter le niveau au fil des semaines.
function askFeeling(day, key) {
  openModal(`<h2>Bravo ! Comment c'était ?</h2>
    <span class="muted small">Ta réponse aide l'appli à ajuster l'intensité de tes prochaines séances.</span>
    <div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn ghost" data-f="1">😮‍💨 Trop dur</button>
      <button class="btn ghost" data-f="2">👍 C'était bien</button>
      <button class="btn ghost" data-f="3">😎 Trop facile</button>
    </div>
    <button class="link" data-close>Passer</button>`, (root) => {
    root.querySelectorAll('[data-f]').forEach((b) => b.onclick = async () => {
      await sb.from('checks').update({ feeling: Number(b.dataset.f) }).match({ member_id: S.me.id, day, session_key: key });
      closeModal(); toast('Merci, c\'est noté'); viewToday();
    });
  });
}
// Propose de changer de niveau si les dernières séances étaient souvent trop faciles ou trop dures.
async function levelSuggestion() {
  const since = addDays(today(), -14);
  const { data } = await sb.from('checks').select('feeling,day').eq('member_id', S.me.id).gte('day', since).not('feeling', 'is', null);
  const f = data || []; const lvl = levelOf(S.me); const fit = S.me.fitness || {};
  const dismissed = fit.dismissed_at && Date.now() - new Date(fit.dismissed_at).getTime() < 7 * 86400000;
  if (dismissed) return null;
  if (f.length >= 4) {
    const easy = f.filter((x) => x.feeling === 3).length / f.length; const hard = f.filter((x) => x.feeling === 1).length / f.length;
    if (easy >= 0.6 && lvl < 4) return { to: lvl + 1, why: `${Math.round(easy * 100)} % de tes dernières séances étaient trop faciles.` };
    if (hard >= 0.5 && lvl > 1) return { to: lvl - 1, why: `${Math.round(hard * 100)} % de tes dernières séances étaient trop dures.` };
  }
  if (fit.assessed_at && Date.now() - new Date(fit.assessed_at).getTime() > 28 * 86400000) return { retest: true, why: 'Ça fait 4 semaines : refais le test pour voir tes progrès.' };
  return null;
}
// Point hebdo à proposer du vendredi au lundi, s'il n'a pas encore été fait pour la semaine concernée.
async function reviewDue() {
  const wd = (parseDay(today()).getDay() + 6) % 7;
  if (!(wd >= 4 || wd === 0)) return false;
  const week = reviewWeek();
  if (!planDay(week) && !planDay(addDays(week, 6))) return false;
  const { data } = await sb.from('weekly_reviews').select('id').eq('member_id', S.me.id).eq('week_start', week).maybeSingle();
  return !data;
}
async function setLevel(lvl, by) {
  const prev = S.me.fitness || {};
  const fitness = { ...prev, level: lvl, assessed_at: new Date().toISOString(), history: [...(prev.history || []), { level: lvl, at: new Date().toISOString(), by }].slice(-20) };
  const { error } = await sb.from('members').update({ fitness }).eq('id', S.me.id);
  if (error) return fail(error, 'Enregistrement impossible');
  S.me.fitness = fitness;
}

async function viewToday() {
  const d = S.day; const pd = planDay(d);
  const monday = mondayOf(d); const sunday = addDays(monday, 6);
  const [{ data: checks }, { data: meals }, track] = await Promise.all([
    sb.from('checks').select('*').eq('tandem_id', S.me.tandem_id).gte('day', monday).lte('day', sunday),
    sb.from('meals').select('*').eq('tandem_id', S.me.tandem_id).eq('day', d),
    loadTrackData(d, d),
  ]);
  const sugg = S.plan ? await levelSuggestion().catch(() => null) : null;
  const has = (mid, key, day = d) => (checks || []).some((c) => c.member_id === mid && c.session_key === key && c.day === day);
  const weekTotal = Math.max(...[S.me, S.partner].filter(Boolean).map((p) => plannedFor(p.id, monday)), 0);
  const doneBy = (mid) => (checks || []).filter((c) => c.member_id === mid && c.session_key !== 'respiration' && c.session_key !== 'mobilite').length;
  const people = [S.me, S.partner].filter(Boolean);
  const [req, rv] = await Promise.all([pendingRequest().catch(() => null), S.plan ? reviewDue().catch(() => null) : null]);
  $app.innerHTML = header(`Bonjour ${S.me.first_name}`, esc(weekLabel(d)), true) + `
  <div class="wrap">
    ${requestBanner(req)}
    ${rv ? `<div class="card white" style="border:2px solid var(--me)"><span class="title">📝 Le point de la semaine</span><span class="small">1 minute pour dire ce qui va et ce qui ne va pas : le programme s'adapte (niveau, durée, exercices).</span><button class="btn sm" id="doReview">Faire le point</button></div>` : ''}
    ${S.partner && !S.partner.user_id ? `<div class="notice row between"><span>${esc(S.partner.first_name)} n'a pas encore rejoint le tandem.</span><button class="btn ghost sm" id="resend">Renvoyer le code</button></div>` : ''}
    ${weekTotal ? `<div class="grid2">${people.map((p) => { const tot = plannedFor(p.id, monday) || 1; return `<div class="card"><span class="small">${esc(p.first_name)} · ${Math.min(doneBy(p.id), tot)} / ${tot} séances cette semaine</span><div class="bar" style="background:var(--line)"><div style="width:${Math.round(Math.min(1, doneBy(p.id) / tot) * 100)}%;background:${colorHex(p.color)}"></div></div></div>`; }).join('')}</div>` : ''}
    ${sugg ? `<div class="card white" style="border:2px solid var(--me)"><span class="title">${sugg.retest ? 'Refaire le test de niveau ?' : sugg.to > levelOf(S.me) ? `Passer au niveau ${esc(LEVELS[sugg.to - 1].name)} ?` : `Revenir au niveau ${esc(LEVELS[sugg.to - 1].name)} ?`}</span>
      <span class="small">${esc(sugg.why)} ${sugg.retest ? '' : 'Les séances seront ajustées tout de suite (tours, répétitions, repos, exercices).'}</span>
      <div class="row" style="flex-wrap:wrap">${sugg.retest ? '<button class="btn sm" data-go="profile">Refaire le test</button>' : `<button class="btn sm" id="lvlYes">Oui, on ajuste</button>`}<button class="btn ghost sm" id="lvlNo">Plus tard</button></div></div>` : ''}
    ${people.length === 2 ? duoBar(`Défi du jour : ${DAILY_DUO_GOAL.toLocaleString('fr-FR')} pas à deux`, DAILY_DUO_GOAL, people.map((p) => track.merged(p.id, d).steps), people) : ''}
    ${pushInvite() ? `<div class="card white" id="pushInvite"><span class="title">🔔 Active les rappels</span><span class="small">Séance du jour, repas à choisir, défi à deux, bilan du dimanche. Tu choisis lesquels.</span><div class="row"><button class="btn sm" data-go="notifs">Activer</button><button class="btn ghost sm" id="pushLater">Plus tard</button></div></div>` : ''}
    <h2>Sport du jour</h2>
    ${!S.plan ? `<div class="card"><span class="title">Pas encore de programme</span><span class="muted">${isCaptain() ? 'Règle le matériel et la durée, puis génère le programme.' : `${esc(S.partner?.first_name || 'Le capitaine')} règle le matériel et génère le programme.`}</span>${isCaptain() ? '<button class="btn" data-go="settings">Créer le programme</button>' : ''}</div>` : ''}
    ${(pd?.sessions || []).map((s) => { const who = people.filter((p) => forOf(s).includes(p.id)); return `
      <div class="card">
        <div><span class="title">${esc(s.title)}</span>${who.length < people.length ? ` <span class="pill">Pour ${esc(who.map((p) => p.first_name).join(' et '))}</span>` : ''}${s.optional && s.key !== 'respiration' ? ' <span class="pill">Facultatif</span>' : ''}<div class="muted">${esc(textFor(s, who.find((p) => p.id === S.me.id) || who[0] || S.me, d))}</div>${who.length > 1 && levelOf(who[0]) !== levelOf(who[1]) && textFor(s, who[0], d) !== textFor(s, who[1], d) ? `<div class="small muted"><b>${esc(who.find((p) => p.id !== S.me.id)?.first_name || '')} :</b> ${esc(textFor(s, who.find((p) => p.id !== S.me.id) || who[1], d))}</div>` : ''}</div>
        ${s.per ? people.map((p) => s.per[p.id] ? `<div class="small"><b>${esc(p.first_name)} :</b> ${s.per[p.id].map((n0) => { const n = variantFor(n0, levelOf(p), p); return `<button class="link small" data-ex="${esc(n)}" style="font-weight:500">${esc(n)}</button>`; }).join(' · ')}</div>` : '').join('') : ''}
        <button class="btn ghost sm" data-howto="${esc(s.key)}|${esc(s.title)}">Comment faire ?</button>
        <div class="grid2">${who.map((p) => {
          const on = has(p.id, s.key); const mine = p.id === S.me.id;
          return `<button class="toggle" style="--c:${colorHex(p.color)}" aria-pressed="${on}" ${mine ? `data-check="${s.key}"` : 'disabled'}>${esc(p.first_name)} · ${on ? 'fait ✓' : (mine ? 'à faire' : 'pas encore')}</button>`;
        }).join('')}</div>
      </div>`; }).join('')}
    ${S.plan && !pd ? '<div class="card"><span class="muted">Aucune séance prévue ce jour-là.</span></div>' : ''}
    <h2>Repas</h2>
    <div class="grid2">${['midi', 'soir'].map((slot) => {
      const m = (meals || []).find((x) => x.slot === slot && (x.member_id === null || x.member_id === S.me.id));
      const r = m?.recipe_id ? S.recipes.find((x) => x.id === m.recipe_id) : null;
      const label = m?.status === 'remplace' ? m.eaten_text : r ? r.name : 'À choisir';
      const st = { fait: '<span class="pill ok">Fait</span>', remplace: '<span class="pill">Autre chose</span>', saute: '<span class="pill">Sauté</span>', choisi: '<span class="pill">Prévu</span>' }[m?.status] || '';
      return `<button class="card" style="border:0;text-align:left;cursor:pointer" data-go="meals"><span class="small muted" style="font-weight:600">${slot === 'midi' ? 'Midi' : 'Soir'}</span><span style="font-weight:600;line-height:1.3">${esc(label)}</span>${st}</button>`;
    }).join('')}</div>
    <button class="card" style="border:0;text-align:left;cursor:pointer" data-go="journal"><span class="title">Mon journal du jour</span><span class="muted">Alcool, eau, écarts. Privé ou partagé.</span></button>
    <button class="card" style="border:0;text-align:left;cursor:pointer" data-go="defis"><span class="title">Défis et badges</span><span class="muted">Paliers de pas, séries, points du mois.</span></button>
  </div>`;
  bindDayNav();
  bindRequest(req);
  document.getElementById('doReview')?.addEventListener('click', () => reviewModal(reviewWeek()));
  $app.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => go(b.dataset.go));
  document.getElementById('pushLater')?.addEventListener('click', () => { try { localStorage.setItem('tf_push_later', String(Date.now())); } catch {} document.getElementById('pushInvite')?.remove(); });
  $app.querySelectorAll('[data-ex]').forEach((b) => b.onclick = () => showExercise(b.dataset.ex));
  document.getElementById('lvlYes')?.addEventListener('click', async () => { await setLevel(sugg.to, 'ressenti'); toast(`Niveau ${LEVELS[sugg.to - 1].name} : séances ajustées`); viewToday(); });
  document.getElementById('lvlNo')?.addEventListener('click', async () => { const fitness = { ...(S.me.fitness || {}), dismissed_at: new Date().toISOString() }; await sb.from('members').update({ fitness }).eq('id', S.me.id); S.me.fitness = fitness; viewToday(); });
  $app.querySelectorAll('[data-howto]').forEach((b) => b.onclick = () => { const [key, title] = b.dataset.howto.split('|'); showSession((pd?.sessions || []).find((x) => x.key === key && x.title === title), d); });
  $app.querySelectorAll('[data-check]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    const key = b.dataset.check; const on = b.getAttribute('aria-pressed') === 'true';
    const res = on
      ? await sb.from('checks').delete().match({ member_id: S.me.id, day: d, session_key: key })
      : await sb.from('checks').upsert({ member_id: S.me.id, tandem_id: S.me.tandem_id, day: d, session_key: key, source: 'manuel', done_at: new Date().toISOString() });
    if (res.error) fail(res.error, 'Enregistrement impossible');
    await viewToday();
    if (!on && !res.error && !['respiration', 'mobilite'].includes(key)) askFeeling(d, key);
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
  const all = eligibleRecipes(S.recipes, S.allergenMap, [S.me, S.partner].filter(Boolean));
  const pool = all.filter((r) => (r.course || 'plat') === 'plat');
  const pools = { entree: all.filter((r) => r.course === 'entree'), dessert: all.filter((r) => r.course === 'dessert') };
  const cheats = weekCheats(mealsWeek);
  const friday = parseDay(d).getDay() === 5;
  $app.innerHTML = header('Repas', `Joker de la semaine : ${cheats ? 'utilisé' : 'disponible'}${friday ? ' · ce soir, plaisir fait maison' : ''}`, true) + `
  <div class="wrap">${['midi', 'soir'].map((slot) => {
    const m = meals.find((x) => x.slot === slot && (x.member_id === null || x.member_id === S.me.id));
    const choices = mealChoices(pool, d, slot);
    if (m?.recipe_id && !choices.some((c) => c.id === m.recipe_id)) { const r = S.recipes.find((x) => x.id === m.recipe_id); if (r) { choices.unshift(r); choices.length = Math.min(choices.length, 3); } }
    return `<section class="card white" data-slot="${slot}">
      <div class="row between"><h2>${slot === 'midi' ? 'Midi' : 'Soir'}</h2>${m ? `<span class="pill ${m.status === 'fait' ? 'ok' : ''}">${m.kind === 'frigo' ? 'Recette du frigo' : { choisi: 'Choisi', fait: 'Fait', remplace: 'Autre chose', saute: 'Sauté' }[m.status]}${m.member_id === null ? ' · nous deux' : ' · moi'}</span>` : ''}</div>
      ${m?.status === 'remplace' && m.kind === 'frigo' ? `<div class="card"><span class="small muted">🧊 Recette du frigo</span><span style="font-weight:600">${esc(m.eaten_text)}</span>${frigoSaved(m) ? '<button class="link small" data-frigo-see style="text-align:left">Revoir la recette ›</button>' : ''}</div>` : ''}
      ${m?.status === 'remplace' && m.kind !== 'frigo' ? `<div class="card"><span class="small muted">Vous avez mangé</span><span style="font-weight:600">${esc(m.eaten_text)}</span><span class="small muted">${esc({ maison: 'Fait maison', resto: 'Restaurant', pouce: 'Sur le pouce', livre: 'Livré' }[m.kind] || '')}${m.cheat ? ' · joker' : ''}</span></div>` : ''}
      ${choices.map((r) => `<button class="choice" data-pick="${r.id}" aria-pressed="${m?.recipe_id === r.id && m.status !== 'remplace'}">
        <span style="font-weight:600">${esc(r.name)}</span>
        <span class="small muted">${r.minutes ? `${r.minutes} min` : ''}${r.kcal_portion ? ` · ~${r.kcal_portion} kcal` : ''}${r.lunchbox ? ' · gamelle' : ''}${r.is_treat ? ' · plaisir' : ''}${(S.allergenMap[r.id]?.allergens || []).length ? ` · ${(S.allergenMap[r.id].allergens).map((a) => (ALLERGENS.find((x) => x[0] === a) || [a, a])[1].toLowerCase()).join(', ')}` : ''}</span>
      </button>`).join('') || '<span class="muted">Aucune recette compatible avec vos allergies et régimes.</span>'}
      <div class="row" style="flex-wrap:wrap">
        ${m?.recipe_id && m.status !== 'remplace' ? `<button class="btn sm" data-done="${m.status === 'fait' ? 0 : 1}">${m.status === 'fait' ? 'Annuler « fait »' : 'C\'est mangé ✓'}</button><button class="btn soft sm" data-recipe="${m.recipe_id}">Voir la recette</button>` : ''}
        <button class="btn ghost sm" data-frigo>🧊 Avec ce qu'on a dans le frigo</button>
        <button class="btn ghost sm" data-other>On a mangé autre chose</button>
        ${m ? '<button class="link" data-clear style="margin-left:auto">Effacer</button>' : ''}
      </div>
      ${extrasHtml(slot, meals, pools, d)}
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
    sec.querySelector('[data-frigo]').onclick = () => fridgeModal(m, slot, all.filter((r) => (r.course || 'plat') === 'plat'));
    sec.querySelector('[data-frigo-see]')?.addEventListener('click', () => showQuick(frigoSaved(m), null));
    bindExtras(sec, slot, meals);
    sec.querySelector('[data-clear]')?.addEventListener('click', async () => { await sb.from('meals').delete().eq('id', m.id); viewMeals(); });
    sec.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('dblclick', () => showRecipe(b.dataset.pick)));
  });
}
// ---------- Entrée et dessert (facultatifs) ----------
const EXTRA = [['entree', 'Entrée'], ['dessert', 'Dessert']];
function extrasHtml(slot, meals, pools, d) {
  const rows = EXTRA.map(([k, lab]) => {
    const key = `${slot}_${k}`;
    const m = meals.find((x) => x.slot === key);
    const choices = courseChoices(pools[k], d, key);
    if (m?.recipe_id && !choices.some((c) => c.id === m.recipe_id)) { const r = S.recipes.find((x) => x.id === m.recipe_id); if (r) choices.unshift(r); }
    return `<div style="display:flex;flex-direction:column;gap:6px"><span class="small" style="font-weight:600">${lab} <span class="muted" style="font-weight:400">· facultatif</span>${m?.status === 'fait' ? ' <span class="pill ok">Fait</span>' : ''}</span>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${choices.slice(0, 3).map((r) => `<button class="chip chip-long" data-xpick="${key}|${r.id}" aria-pressed="${m?.recipe_id === r.id}">${esc(r.name)}${r.kcal_portion ? ` <span class="muted">~${r.kcal_portion} kcal</span>` : ''}</button>`).join('') || '<span class="small muted">Rien de compatible avec vos allergies.</span>'}</div>
      ${m?.recipe_id ? `<div class="row" style="gap:12px"><button class="link small" data-xsee="${m.recipe_id}">Voir la recette</button><button class="link small" data-xdone="${key}">${m.status === 'fait' ? 'Annuler « fait »' : 'C\'est mangé ✓'}</button><button class="link small" data-xclear="${key}">Retirer</button></div>` : ''}</div>`;
  }).join('');
  const open = meals.some((x) => x.slot === `${slot}_entree` || x.slot === `${slot}_dessert`);
  return `<details ${open ? 'open' : ''} style="margin-top:4px"><summary class="small" style="cursor:pointer;color:var(--me);font-weight:600">＋ Entrée et dessert (facultatif)</summary>
    <div style="display:flex;flex-direction:column;gap:12px;margin-top:10px"><span class="small muted">Pas obligatoire du tout : une entrée de légumes aide à moins manger de plat, et un dessert léger évite le grignotage.</span>${rows}</div></details>`;
}
function bindExtras(sec, slot, meals) {
  const row = (key) => meals.find((x) => x.slot === key);
  const save = async (key, patch) => {
    const m = row(key);
    const res = m ? await sb.from('meals').update({ ...patch, updated_by: S.me.id, updated_at: new Date().toISOString() }).eq('id', m.id)
      : await sb.from('meals').insert({ tandem_id: S.me.tandem_id, member_id: null, day: S.day, slot: key, cheat: false, status: 'choisi', updated_by: S.me.id, ...patch });
    if (res.error) return fail(res.error, 'Enregistrement impossible');
    viewMeals();
  };
  sec.querySelectorAll('[data-xpick]').forEach((b) => b.onclick = () => { const [key, id] = b.dataset.xpick.split('|'); if (row(key)?.recipe_id === id) return showRecipe(id); save(key, { recipe_id: id, status: 'choisi' }); });
  sec.querySelectorAll('[data-xsee]').forEach((b) => b.onclick = () => showRecipe(b.dataset.xsee));
  sec.querySelectorAll('[data-xdone]').forEach((b) => b.onclick = () => { const m = row(b.dataset.xdone); save(b.dataset.xdone, { status: m.status === 'fait' ? 'choisi' : 'fait' }); });
  sec.querySelectorAll('[data-xclear]').forEach((b) => b.onclick = async () => { await sb.from('meals').delete().eq('id', row(b.dataset.xclear).id); viewMeals(); });
}

// ---------- Avec ce qu'il y a dans le frigo ----------
const frigoKey = (m) => `tf_frigo_${m.day}_${m.slot}`;
function frigoSaved(m) { try { return JSON.parse(localStorage.getItem(frigoKey(m)) || 'null'); } catch { return null; } }
let INGS = null;
const QTY_RX = new RegExp("^[0-9.,\\/]+\\s*(kg|g|cl|l|c\\. à s\\.|c\\. à c\\.)?\\s*(de |d'|d’)?", 'i');
const stripQty = (l) => l.replace(QTY_RX, '');
async function allIngredients() {
  if (INGS) return INGS;
  const { data } = await sb.from('recipe_ingredients').select('recipe_id,label,ingredient_id');
  INGS = {}; (data || []).forEach((l) => (INGS[l.recipe_id] ||= []).push(l));
  return INGS;
}
function fridgeModal(m, slot, pool) {
  let have = []; try { have = JSON.parse(sessionStorage.getItem('tf_frigo_have') || '[]'); } catch {}
  openModal(`<h2>🧊 Qu'y a-t-il dans le frigo ?</h2>
    <span class="small muted">Coche ce que tu as (sel, poivre, huile, épices : on suppose que c'est dans le placard). L'appli cherche dans vos recettes et te compose aussi une recette minute.</span>
    ${FRIDGE_CATS.map(([c, lab]) => `<div><b class="small">${lab}</b><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${FRIDGE.filter((f) => f[2] === c).map((f) => `<button type="button" class="chip" data-fi="${f[0]}" aria-pressed="${have.includes(f[0])}">${esc(f[1])}</button>`).join('')}</div></div>`).join('')}
    <label class="small">Autre chose ? (sépare par des virgules)<input id="fFree" placeholder="ex. reste de riz, curry, olives"></label>
    <button class="btn" id="fGo">Trouver une recette</button>
    <div id="fRes" style="display:flex;flex-direction:column;gap:10px"></div>`, (root) => {
    root.querySelectorAll('[data-fi]').forEach((b) => b.onclick = () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); });
    root.querySelector('#fGo').onclick = async () => {
      const picked = [...root.querySelectorAll('[data-fi][aria-pressed=true]')].map((b) => b.dataset.fi);
      const free = parseFree(root.querySelector('#fFree').value);
      const ids = [...new Set([...picked, ...free.ids])];
      if (!ids.length && !free.extra.length) return toast('Coche au moins un ingrédient');
      try { sessionStorage.setItem('tf_frigo_have', JSON.stringify(ids)); } catch {}
      const people = [S.me, S.partner].filter(Boolean);
      const banned = new Set(people.flatMap((p) => p.nutrition?.allergens || []));
      const warn = allergensOf(ids).filter((a) => banned.has(a)).map((a) => (ALLERGENS.find((x) => x[0] === a) || [a, a])[1].toLowerCase());
      const found = matchRecipes(pool, await allIngredients(), ids, free.extra);
      const quick = quickRecipe(ids, people.length, free.extra);
      const res = root.querySelector('#fRes');
      res.innerHTML = `${warn.length ? `<div class="notice small">Attention : tu as coché des ingrédients avec ${esc(warn.join(', '))}, une allergie déclarée dans le tandem.</div>` : ''}
        ${quick ? `<div class="card white" style="border:2px solid var(--me)"><span class="small muted">Recette minute · ~${quick.minutes} min · ${people.length} portion${people.length > 1 ? 's' : ''}</span><span class="title">${esc(quick.title)}</span><div class="row" style="flex-wrap:wrap"><button class="btn sm" id="qSee">Voir la recette</button><button class="btn ghost sm" id="qPick">On fait ça</button></div></div>` : ''}
        <b class="small">Dans vos recettes</b>
        ${found.length ? found.map((x, i) => `<div class="card"><span style="font-weight:600">${esc(x.r.name)}</span><span class="small muted">Tu as ${x.ok.length} ingrédient${x.ok.length > 1 ? 's' : ''} sur ${x.ok.length + x.miss.length}${x.miss.length ? ` · il manque : ${esc(x.miss.slice(0, 4).map((l) => stripQty(l)).join(', '))}${x.miss.length > 4 ? '…' : ''}` : ' · tout y est !'}</span><div class="row" style="flex-wrap:wrap"><button class="btn soft sm" data-fsee="${x.r.id}">Voir</button><button class="btn ghost sm" data-fpick="${x.r.id}">Choisir</button></div></div>`).join('') : '<span class="small muted">Aucune recette de la base ne colle assez. La recette minute est faite pour ça !</span>'}`;
      res.querySelectorAll('[data-fsee]').forEach((b) => b.onclick = () => showRecipe(b.dataset.fsee));
      res.querySelectorAll('[data-fpick]').forEach((b) => b.onclick = () => saveMeal(m, slot, { recipe_id: b.dataset.fpick, status: 'choisi', eaten_text: null, kind: null, cheat: false }, null));
      res.querySelector('#qSee')?.addEventListener('click', () => showQuick(quick, { m, slot }));
      res.querySelector('#qPick')?.addEventListener('click', () => pickQuick(quick, m, slot));
      res.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });
}
function pickQuick(quick, m, slot) {
  try { localStorage.setItem(`tf_frigo_${S.day}_${slot}`, JSON.stringify(quick)); } catch {}
  saveMeal(m, slot, { recipe_id: null, status: 'remplace', eaten_text: quick.title, kind: 'frigo', cheat: false }, null);
}
function showQuick(q, ctx) {
  if (!q) return;
  openModal(`<h2>${esc(q.title)}</h2><div><span class="pill">~${q.minutes} min</span></div>
    <b>Ingrédients</b><ul class="plain small">${q.ing.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <b>Étapes</b><ol class="steps small">${q.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    <span class="small muted">Recette composée automatiquement à partir de ce que tu as : ajuste les quantités à ton appétit. Pense à ajouter des légumes s'il n'y en a pas.</span>
    ${ctx ? '<button class="btn" id="qPick2">On fait ça</button>' : ''}`, (root) => {
    root.querySelector('#qPick2')?.addEventListener('click', () => pickQuick(q, ctx.m, ctx.slot));
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
// Ajuste la quantité en tête de ligne (« 250 g de riz », « 1/2 concombre ») au nombre de portions choisi.
function scaleLabel(label, qty, factor) {
  if (qty == null || factor === 1) return label;
  const v = Number(qty) * factor;
  const fmt = v >= 100 ? String(Math.round(v / 5) * 5) : v >= 10 ? String(Math.round(v)) : (Math.round(v * 4) / 4).toString().replace('.', ',').replace(',25', ' ¼').replace(',5', ' ½').replace(',75', ' ¾').replace(/^0 /, '');
  return label.replace(/^\d+(?:[.,]\d+)?(?:\/\d+)?/, fmt);
}
async function showRecipe(id, portions) {
  const r = S.recipes.find((x) => x.id === id);
  const [{ data: full }, { data: ing }] = await Promise.all([
    sb.from('recipes').select('steps,prep_min,cook_min,tip,variant,storage,nutrition,servings').eq('id', id).single(),
    sb.from('recipe_ingredients').select('label,position,qty').eq('recipe_id', id).order('position'),
  ]);
  const base = full?.servings || 4; const n = portions || base; const factor = n / base;
  const al = (S.allergenMap[id]?.allergens || []).map((a) => (ALLERGENS.find((x) => x[0] === a) || [a, a])[1]);
  const nu = full?.nutrition;
  openModal(`
    <div class="row between" style="align-items:flex-start"><h2>${esc(r?.name)}</h2></div>
    <div class="row" style="flex-wrap:wrap;gap:8px">
      ${full?.prep_min != null ? `<span class="pill">Préparation ${full.prep_min} min</span>` : ''}
      ${full?.cook_min ? `<span class="pill">Cuisson ${full.cook_min >= 60 ? `${Math.floor(full.cook_min / 60)} h ${String(full.cook_min % 60).padStart(2, '0')}` : `${full.cook_min} min`}</span>` : ''}
      ${r?.lunchbox ? '<span class="pill ok">Gamelle</span>' : ''}${r?.is_treat ? '<span class="pill warn">Plaisir</span>' : ''}
    </div>
    ${al.length ? `<div class="notice">Allergènes : ${esc(al.join(', '))}</div>` : '<div class="small muted">Aucun des 14 allergènes majeurs détecté dans les ingrédients.</div>'}
    <div class="row between"><h3>Ingrédients</h3>
      <div class="row" style="gap:6px" aria-label="Nombre de portions"><button class="btn soft sm" data-por="${Math.max(1, n - 1)}" aria-label="Moins de portions">−</button><b>${n} portion${n > 1 ? 's' : ''}</b><button class="btn soft sm" data-por="${Math.min(8, n + 1)}" aria-label="Plus de portions">+</button></div></div>
    <ul class="plain">${(ing || []).map((i) => `<li>${esc(scaleLabel(i.label, i.qty, factor))}</li>`).join('')}</ul>
    ${factor !== 1 ? '<span class="small muted">Quantités recalculées et arrondies. Les ingrédients sans quantité sont à doser selon le goût.</span>' : ''}
    <h3>Étapes</h3><ol class="steps">${(full?.steps || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    ${full?.tip ? `<div class="card"><span class="title">L'astuce</span><span class="small">${esc(full.tip)}</span></div>` : ''}
    ${full?.variant ? `<div class="card"><span class="title">Variante</span><span class="small">${esc(full.variant)}</span></div>` : ''}
    ${full?.storage ? `<div class="card"><span class="title">Conservation</span><span class="small">${esc(full.storage)}</span></div>` : ''}
    ${nu ? `<div class="card white"><span class="title">Par portion (estimation)</span>
      <table class="mini"><tr><td>Énergie</td><td><b>${nu.kcal} kcal</b></td></tr><tr><td>Protéines</td><td>${nu.prot} g</td></tr><tr><td>Glucides</td><td>${nu.gluc} g</td></tr><tr><td>Lipides</td><td>${nu.lip} g</td></tr><tr><td>Fibres</td><td>${nu.fib} g</td></tr></table>
      <span class="small muted">Calculé à partir des ingrédients pour ${base} portions, avec des valeurs moyennes. C'est un ordre de grandeur, pas une mesure exacte.</span></div>` : ''}`, (root) => {
    root.querySelectorAll('[data-por]').forEach((b) => b.onclick = () => showRecipe(id, Number(b.dataset.por)));
  });
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
// Chaque mesure : comment l'afficher, et comment l'agréger sur une semaine ou un mois (moyenne, total ou dernière valeur).
const hmFmt = (h) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const nf = (v, d = 0) => Number(v).toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d });
const METRICS = {
  pas: { label: 'Pas', unit: 'pas par jour', key: 'steps', agg: 'mean', total: true, goal: 8000, goalLabel: '8 000', short: (v) => (v >= 1000 ? `${nf(v / 1000, 1)}k` : nf(v)), fmt: (v) => nf(v) },
  sport: { label: 'Sport', unit: 'minutes de sport', key: 'sport', agg: 'sum', total: false, goal: null, short: (v) => nf(v), fmt: (v) => (v >= 60 ? `${Math.floor(v / 60)} h ${String(Math.round(v % 60)).padStart(2, '0')}` : `${nf(v)} min`) },
  sommeil: { label: 'Sommeil', unit: 'heures par nuit', key: 'sleep', agg: 'mean', goal: 7, goalLabel: '7 h', short: (v) => nf(v, 1), fmt: hmFmt },
  poids: { label: 'Poids', unit: 'kg', key: 'kg', agg: 'last', lowerBetter: true, goal: null, short: (v) => nf(v, 1), fmt: (v) => `${nf(v, 1)} kg` },
};
const FEEL = [[1, '😫', 'C\'était très dur'], [2, '😓', 'Dur'], [3, '🙂', 'Correct'], [4, '😀', 'Bien'], [5, '💪', 'Je me sentais très fort']];
const feelTxt = (n) => { const f = FEEL.find((x) => x[0] === n); return f ? `${f[1]} ${f[2]}` : ''; };
// Connexions montres et Apple Santé : désactivées pour l'instant, saisie à la main uniquement.
const WATCHES_ENABLED = false;
const DAILY_DUO_GOAL = 20000;
const WEEKLY_DUO_GOAL = 120000;
const mean = (arr) => { const v = arr.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const sumOf = (arr) => arr.filter((x) => x != null).reduce((a, b) => a + b, 0);
function aggregate(M, vals) {
  const v = vals.filter((x) => x != null);
  if (!v.length) return null;
  if (M.agg === 'sum') return sumOf(v);
  if (M.agg === 'last') return v[v.length - 1];
  return mean(v);
}

// Données d'une période, fusionnées par personne et par jour (la saisie manuelle prime sur la montre).
async function loadTrackData(from, to) {
  const [{ data: metrics }, { data: acts }, { data: weights }, { data: journal }, { data: checks }] = await Promise.all([
    sb.from('daily_metrics').select('*').eq('tandem_id', S.me.tandem_id).gte('day', from).lte('day', to),
    sb.from('activities').select('*').eq('tandem_id', S.me.tandem_id).gte('start_at', new Date(`${from}T00:00:00`).toISOString()).lte('start_at', new Date(`${to}T23:59:59`).toISOString()).order('start_at'),
    sb.from('weights').select('*').eq('tandem_id', S.me.tandem_id).lte('day', to).order('day'),
    sb.from('journal').select('*').gte('day', from).lte('day', to),
    sb.from('checks').select('member_id,day,session_key').eq('tandem_id', S.me.tandem_id).gte('day', from).lte('day', to),
  ]);
  const cache = new Map();
  const merged = (mid, day) => {
    const ck = `${mid}|${day}`; if (cache.has(ck)) return cache.get(ck);
    const rows = (metrics || []).filter((m) => m.member_id === mid && m.day === day)
      .sort((a, b) => (a.source === 'manuel' ? -1 : 0) - (b.source === 'manuel' ? -1 : 0));
    const o = {};
    for (const k of ['steps', 'floors', 'rhr', 'hr_avg', 'hr_max', 'hrv', 'stress', 'sleep_min', 'active_min']) o[k] = rows.map((r) => r[k]).find((v) => v != null) ?? null;
    o.acts = (acts || []).filter((a) => a.member_id === mid && iso(new Date(a.start_at)) === day);
    const actMin = o.acts.reduce((t, a) => t + (a.duration_min || 0), 0);
    o.act = o.acts.length || o.active_min != null ? Math.max(actMin, o.active_min || 0) : null;
    o.km = o.acts.some((a) => a.distance_km) ? o.acts.reduce((t, a) => t + Number(a.distance_km || 0), 0) : null;
    const ch = (checks || []).filter((c) => c.member_id === mid && c.day === day && c.session_key !== 'respiration').length;
    o.sessions = o.acts.length || ch ? Math.max(o.acts.length, ch) : null;
    o.progMin = (checks || []).filter((c) => c.member_id === mid && c.day === day && c.session_key !== 'respiration')
      .reduce((t, c) => t + (((s) => s?.mins?.[mid] ?? s?.minutes ?? 0)((planDay(day)?.sessions || []).find((x) => x.key === c.session_key))), 0);
    o.sport = o.acts.length || o.progMin ? actMin + o.progMin : null;
    o.sleep = o.sleep_min == null ? null : o.sleep_min / 60;
    const w = (weights || []).find((x) => x.member_id === mid && x.day === day && x.kg != null);
    o.kg = w ? Number(w.kg) : null;
    const j = (journal || []).find((x) => x.member_id === mid && x.day === day);
    o.water = j ? j.water : null; o.drinks = j ? j.drinks : null; o.journal = j || null;
    cache.set(ck, o); return o;
  };
  return { merged, acts: acts || [], weights: weights || [], checks: checks || [] };
}

function trackHeader(title, sub) {
  const mode = S.trackMode || 'semaine';
  return `<div class="hero"><div class="inner">
    <div class="daynav"><button data-shift="-1" aria-label="Période précédente">‹</button><div style="text-align:center;flex:1"><small>${sub}</small></div><button data-shift="1" aria-label="Période suivante">›</button></div>
    <div class="row between"><h1>${title}</h1>
      <div class="row" role="tablist" style="gap:0;background:rgba(255,255,255,.18);border-radius:12px;padding:3px">${[['jour', 'Jour'], ['semaine', 'Semaine'], ['mois', 'Mois']].map(([k, l]) => `<button role="tab" data-mode="${k}" aria-selected="${mode === k}" style="min-height:36px;padding:0 12px;border:0;border-radius:9px;font-weight:600;cursor:pointer;background:${mode === k ? '#fff' : 'transparent'};color:${mode === k ? 'var(--ink)' : '#fff'}">${l}</button>`).join('')}</div>
    </div></div></div>`;
}
function metricTabs() {
  const m = S.trackMetric || 'pas';
  return `<div style="overflow-x:auto;margin:0 -18px;padding:0 18px"><div class="row" role="tablist" style="gap:8px;width:max-content">${Object.entries(METRICS).map(([k, x]) => `<button class="chip" role="tab" data-metric="${k}" aria-pressed="${m === k}">${x.label}</button>`).join('')}</div></div>`;
}
function duoBar(title, goal, vals, people) {
  const total = sumOf(vals);
  return `<div class="card white"><div class="row between"><span class="title">${esc(title)}</span><b>${nf(total)}</b></div>
    <div style="height:12px;border-radius:99px;background:var(--line);overflow:hidden;display:flex">${people.map((p, i) => `<div style="width:${Math.min(100, ((vals[i] || 0) / goal) * 100).toFixed(1)}%;background:${colorHex(p.color)}"></div>`).join('')}</div>
    <span class="small muted">${total >= goal ? 'Défi réussi, bravo à vous deux !' : `Encore ${nf(goal - total)} pas à vous deux.`}${vals.length === 2 && vals.every((v) => v != null) ? ` ${vals[0] === vals[1] ? 'Égalité parfaite.' : `${esc((vals[0] > vals[1] ? people[0] : people[1]).first_name)} mène de ${nf(Math.abs(vals[0] - vals[1]))} pas.`}` : ''}</span></div>`;
}
function deltaText(M, cur, prev, period) {
  if (cur == null || prev == null) return '';
  const d = cur - prev; if (Math.abs(d) < 1e-9) return `= ${period} précédent${period === 'semaine' ? 'e' : ''}`;
  const good = M.lowerBetter ? d < 0 : d > 0;
  let txt;
  if (M.key === 'steps' && prev) txt = `${d > 0 ? '+' : '−'}${Math.abs(Math.round((d / prev) * 100))} %`;
  else if (M.key === 'sleep') txt = `${d > 0 ? '+' : '−'}${Math.round(Math.abs(d) * 60)} min`;
  else txt = `${d > 0 ? '+' : '−'}${M.fmt(Math.abs(d))}`;
  return `<span style="color:${good ? 'var(--ok)' : 'var(--muted)'}">${txt}</span> vs ${period === 'semaine' ? 'semaine précédente' : 'mois précédent'}`;
}
function statCards(M, people, cur, prev, period, extra = () => '') {
  return `<div class="grid2">${people.map((p, i) => {
    const a = aggregate(M, cur[i]); const tot = M.total ? sumOf(cur[i].filter((x) => x != null)) : null;
    const label = M.agg === 'sum' ? 'total' : M.agg === 'last' ? 'dernière valeur' : 'moyenne';
    return `<div class="card stat" style="border-top:3px solid ${colorHex(p.color)}"><span class="small muted">${esc(p.first_name)} · ${label}</span><b>${a == null ? '—' : esc(M.fmt(a))}</b>
      ${tot ? `<span class="small muted">Total : ${esc(M.fmt(tot))}</span>` : ''}
      <span class="small muted">${deltaText(M, a, aggregate(M, prev[i]), period)}</span>${extra(p, i)}</div>`;
  }).join('')}</div>`;
}

async function viewTrack() {
  S.trackMode = S.trackMode || 'semaine'; S.trackMetric = S.trackMetric || 'pas';
  const people = [S.me, S.partner].filter(Boolean);
  if (S.trackMode === 'jour') return viewTrackDay(people);
  if (S.trackMode === 'mois') return viewTrackMonth(people);
  return viewTrackWeek(people);
}
function bindTrackNav(step) {
  $app.querySelector('[data-metric][aria-pressed=true]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  $app.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { S.trackMode = b.dataset.mode; viewTrack(); });
  $app.querySelectorAll('[data-metric]').forEach((b) => b.onclick = () => { S.trackMetric = b.dataset.metric; viewTrack(); });
  $app.querySelectorAll('[data-shift]').forEach((b) => b.onclick = () => { S.day = addDays(S.day, Number(b.dataset.shift) * step); viewTrack(); });
  document.getElementById('manual')?.addEventListener('click', () => manualDayForm(S.day));
  document.getElementById('addAct')?.addEventListener('click', () => activityForm(null, S.day));
  document.getElementById('addW')?.addEventListener('click', () => weightForm());
}

async function viewTrackDay(people) {
  const d = S.day;
  const { merged } = await loadTrackData(d, d);
  const v = people.map((p) => merged(p.id, d));
  const mine = v[0];
  const sportTxt = (x) => (x.sport != null ? METRICS.sport.fmt(x.sport) : '—');
  $app.innerHTML = trackHeader('Suivi', esc(cap(fmtDay(d)))) + `<div class="wrap">
    ${people.length === 2 ? duoBar(`Objectif commun : ${nf(DAILY_DUO_GOAL)} pas`, DAILY_DUO_GOAL, v.map((x) => x.steps), people) : ''}
    <div class="grid2">${people.map((p, i) => `<div class="card stat" style="border-top:3px solid ${colorHex(p.color)};gap:6px"><span class="small" style="font-weight:600;color:${colorHex(p.color)}">${esc(p.first_name)}</span>
      <span class="small muted">👟 Pas</span><b>${v[i].steps != null ? nf(v[i].steps) : '—'}</b>
      <span class="small muted">🏃 Sport</span><b>${sportTxt(v[i])}</b>
      <span class="small muted">😴 Sommeil</span><b>${v[i].sleep != null ? hmFmt(v[i].sleep) : '—'}</b>
      <span class="small muted">⚖️ Poids</span><b>${v[i].kg != null ? `${nf(v[i].kg, 1)} kg` : '—'}</b></div>`).join('')}</div>
    <div class="row" style="flex-wrap:wrap"><button class="btn" id="manual" style="flex:1">${mine.steps != null || mine.sleep != null ? 'Modifier pas et sommeil' : 'Saisir pas et sommeil'}</button><button class="btn ghost" id="addW">⚖️ Pesée</button></div>
    <div class="row between"><h2>Sport du jour</h2><button class="btn ghost sm" id="addAct">+ Activité</button></div>
    ${actList(people, v.flatMap((x) => x.acts))}
    ${v.some((x) => x.progMin) ? `<span class="small muted">Séances du programme cochées : ${people.map((p, i) => `${esc(p.first_name)} ${v[i].progMin} min`).join(' · ')}. Elles comptent automatiquement, n'ajoute que le sport en plus.</span>` : '<span class="small muted">Les séances du programme cochées comptent automatiquement. Ajoute ici le reste : marche, vélo, piscine, foot…</span>'}
  </div>`;
  bindTrackNav(1);
  bindActs(v.flatMap((x) => x.acts));
}
function actList(people, acts) {
  return acts.map((a) => { const p = people.find((x) => x.id === a.member_id); const mine = a.member_id === S.me.id; return `<${mine ? `button data-act="${a.id}" style="border:0;text-align:left;cursor:pointer"` : 'div'} class="card"><span class="title">${esc(a.type)}</span><span class="muted">${esc(p?.first_name)} · ${esc(fmtDay(iso(new Date(a.start_at)), { weekday: 'short', day: 'numeric' }))}${a.duration_min ? ` · ${a.duration_min} min` : ''}${a.distance_km ? ` · ${nf(a.distance_km, 1)} km` : ''}${a.hr_avg ? ` · FC moy. ${a.hr_avg}` : ''}</span>${a.feeling ? `<span class="small">${esc(feelTxt(a.feeling))}</span>` : ''}${a.note ? `<span class="small">${esc(a.note)}</span>` : ''}</${mine ? 'button' : 'div'}>`; }).join('') || '<span class="muted">Aucune activité ajoutée.</span>';
}
function bindActs(acts) {
  $app.querySelectorAll('[data-act]').forEach((el) => el.onclick = () => activityForm(acts.find((x) => x.id === el.dataset.act), S.day));
}

async function viewTrackWeek(people) {
  const monday = mondayOf(S.day); const sunday = addDays(monday, 6); const prevMon = addDays(monday, -7);
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(monday, i));
  const M = METRICS[S.trackMetric];
  const { merged, acts, weights, checks } = await loadTrackData(prevMon, sunday);
  const lastW = (mid) => [...weights].filter((w) => w.member_id === mid && w.kg != null).pop();
  const d60 = Array.from({ length: 56 }, (_, i) => addDays(sunday, i - 55));
  if (M.key === 'kg') people.forEach((p, i) => { cur[i] = d60.slice(28).map((x) => merged(p.id, x).kg); prev[i] = d60.slice(0, 28).map((x) => merged(p.id, x).kg); });
  const cur = people.map((p) => days.map((x) => merged(p.id, x)[M.key]));
  const prev = people.map((p) => days.map((x) => merged(p.id, addDays(x, -7))[M.key]));
  const planned = (mid) => plannedFor(mid, monday);
  const done = (mid) => checks.filter((c) => c.member_id === mid && c.day >= monday && c.session_key !== 'respiration' && c.session_key !== 'mobilite').length;
  const stepsWeek = people.map((p) => sumOf(days.map((x) => merged(p.id, x).steps)));
  const pd = planDay(monday);
  const weekActs = acts.filter((a) => a.start_at >= new Date(`${monday}T00:00:00`).toISOString());
  $app.innerHTML = trackHeader('Suivi', `${pd ? `Semaine ${pd.week} · ` : ''}${fmtDay(monday, { day: 'numeric', month: 'short' })} au ${fmtDay(sunday, { day: 'numeric', month: 'short' })}`) + `<div class="wrap">
    ${metricTabs()}
    <div class="card white">${M.key === 'kg' ? lineChart(people.map((p) => ({ color: colorHex(p.color), values: d60.map((x) => merged(p.id, x).kg) })), d60, M) : barChart(people.map((p, i) => ({ color: colorHex(p.color), values: cur[i] })), days, M.fmt, M.goal, M.goalLabel)}
      <div class="row between">${legend(people)}<span class="small muted">${M.key === 'kg' ? 'kg · 8 dernières semaines' : esc(M.unit)}</span></div></div>
    ${statCards(M, people, cur, prev, 'semaine', (p) => (planned(p.id) ? `<span class="small">Séances du programme : ${Math.min(done(p.id), planned(p.id))} / ${planned(p.id)}</span>` : ''))}
    ${people.length === 2 ? duoBar(`Défi à deux : ${nf(WEEKLY_DUO_GOAL)} pas`, WEEKLY_DUO_GOAL, stepsWeek, people) : ''}
    <div class="row" style="flex-wrap:wrap"><button class="btn sm" id="manual">Saisir pas et sommeil</button><button class="btn ghost sm" id="addAct">+ Activité</button></div>
    <h2>Sport de la semaine</h2>
    ${actList(people, weekActs)}
    <div class="row between"><h2>Poids</h2><div class="row"><button class="btn ghost sm" id="histW">Historique</button><button class="btn ghost sm" id="addW">+ Pesée</button></div></div>
    <div class="grid2">${people.map((p) => { const w = lastW(p.id); const diff = w && p.start_weight ? (w.kg - p.start_weight) : null; return `<div class="card stat"><span class="small" style="color:${colorHex(p.color)};font-weight:600">${esc(p.first_name)}</span><b>${w ? `${nf(w.kg, 1)} kg` : '—'}</b><span class="muted small">${diff != null ? `${diff > 0 ? '+' : ''}${nf(diff, 1)} kg depuis le départ` : ''}${p.goal_weight ? ` · objectif ${nf(p.goal_weight, 1)}` : ''}</span></div>`; }).join('')}</div>
  </div>`;
  bindTrackNav(7);
  bindActs(weekActs);
  document.getElementById('histW').onclick = () => weightHistory(weights);
}

async function viewTrackMonth(people) {
  const end = S.day; const start = addDays(end, -29); const prevStart = addDays(start, -30);
  const days = Array.from({ length: 30 }, (_, i) => addDays(start, i));
  const M = METRICS[S.trackMetric];
  const { merged } = await loadTrackData(prevStart, end);
  const cur = people.map((p) => days.map((x) => merged(p.id, x)[M.key]));
  const prev = people.map((p) => days.map((x) => merged(p.id, addDays(x, -30))[M.key]));
  // Pour les mesures en total (distance, séances, alcool), on trace le cumul par semaine glissante.
  $app.innerHTML = trackHeader('Suivi', `30 jours · ${fmtDay(start, { day: 'numeric', month: 'short' })} au ${fmtDay(end, { day: 'numeric', month: 'short' })}`) + `<div class="wrap">
    ${metricTabs()}
    <div class="card white">${lineChart(people.map((p, i) => ({ color: colorHex(p.color), values: cur[i] })), days, M)}
      <div class="row between">${legend(people)}<span class="small muted">${esc(M.unit)} · trait = ${M.agg === 'sum' ? 'total sur 7 jours' : 'moyenne sur 7 jours'}</span></div></div>
    ${statCards(M, people, cur, prev, 'mois', (p, i) => { const vals = cur[i].filter((x) => x != null); if (!vals.length || M.agg === 'sum') return `<span class="small muted">${vals.length} jour(s) renseigné(s)</span>`; const best = M.lowerBetter ? Math.min(...vals) : Math.max(...vals); return `<span class="small muted">${M.lowerBetter ? 'Plus bas' : 'Record'} : ${esc(M.fmt(best))} · ${vals.length} jour(s)</span>`; })}
  </div>`;
  bindTrackNav(30);
}

function lineChart(series, days, M) {
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  if (!all.length) return '<span class="muted">Pas encore de données sur cette période.</span>';
  const roll = (vals, i) => { const w = vals.slice(Math.max(0, i - 6), i + 1); return M.agg === 'sum' ? (w.some((x) => x != null) ? sumOf(w) : null) : mean(w); };
  const trends = series.map((s) => s.values.map((_, i) => roll(s.values, i)));
  const pts = M.agg === 'sum' ? trends.flat().filter((v) => v != null) : all;
  const W = 330, H = 190, top = 14, bottom = 24, left = 32, right = 6;
  let lo = Math.min(...pts, M.goal ?? Infinity), hi = Math.max(...pts, M.goal ?? -Infinity);
  const relative = ['rhr', 'kg', 'hr_avg', 'hrv'].includes(M.key);
  if (!relative) lo = 0;
  const pad = (hi - lo) * 0.1 || 1; hi += pad; if (relative) lo -= pad;
  const X = (i) => left + (i / (days.length - 1)) * (W - left - right);
  const Y = (v) => top + (1 - (v - lo) / (hi - lo)) * (H - top - bottom);
  let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" style="height:200px">`;
  for (const t of [lo, (lo + hi) / 2, hi]) out += `<line x1="${left}" x2="${W - right}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" stroke="#E3E6EB"/><text x="${left - 4}" y="${(Y(t) + 3).toFixed(1)}" font-size="9" fill="#5E6573" text-anchor="end">${esc(M.short(t))}</text>`;
  if (M.goal != null && M.agg !== 'sum') out += `<line x1="${left}" x2="${W - right}" y1="${Y(M.goal).toFixed(1)}" y2="${Y(M.goal).toFixed(1)}" stroke="#A9B0BC" stroke-dasharray="4 4"/>`;
  series.forEach((s, si) => {
    if (M.agg !== 'sum') out += s.values.map((v, i) => (v == null ? '' : `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="2.3" fill="${s.color}" opacity=".5"/>`)).join('');
    const path = trends[si].map((v, i) => (v == null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`)).filter(Boolean);
    if (path.length > 1) out += `<polyline fill="none" stroke="${s.color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${path.join(' ')}"/>`;
    else if (path.length === 1) { const [x, y] = path[0].split(','); out += `<circle cx="${x}" cy="${y}" r="4" fill="${s.color}"/>`; }
  });
  [0, Math.floor((days.length - 1) / 2), days.length - 1].forEach((i) => { out += `<text x="${X(i).toFixed(1)}" y="${H - 6}" font-size="10" fill="#5E6573" text-anchor="${i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}">${esc(fmtDay(days[i], { day: 'numeric', month: 'short' }))}</text>`; });
  return out + '</svg>';
}

async function manualDayForm(day) {
  const { data } = await sb.from('daily_metrics').select('*').eq('member_id', S.me.id).eq('day', day).eq('source', 'manuel').maybeSingle();
  const m = data || {};
  const sh = m.sleep_min != null ? Math.floor(m.sleep_min / 60) : ''; const sm = m.sleep_min != null ? m.sleep_min % 60 : '';
  openModal(`<h2>Mes pas et mon sommeil</h2>
    <form id="m" style="display:flex;flex-direction:column;gap:12px" novalidate>
      <label>Jour<input name="day" type="date" value="${day}" max="${today()}"></label>
      <label>👟 Pas de la journée<input name="steps" inputmode="numeric" placeholder="ex. 8500" value="${esc(m.steps)}"></label>
      <span class="small muted">Le chiffre est dans l'appli Santé (iPhone) ou Google Fit / Samsung Health (Android), ou sur ta montre.</span>
      <div><span class="small" style="font-weight:600">😴 Sommeil de la nuit précédente</span>
        <div class="grid2" style="margin-top:6px"><label class="small">Heures<input name="sleep_h" inputmode="numeric" placeholder="7" value="${sh}"></label><label class="small">Minutes<input name="sleep_m" inputmode="numeric" placeholder="30" value="${sm}"></label></div></div>
      <p class="err" id="merr" role="alert" style="margin:0"></p>
      <button class="btn block">Enregistrer</button>
      <span class="small muted">Pour le sport, utilise « + Activité ». Les séances du programme cochées comptent toutes seules.</span>
    </form>`, (root) => root.querySelector('#m').onsubmit = async (e) => {
    e.preventDefault(); const v = formData(e.target); const $e = root.querySelector('#merr');
    const steps = int(String(v.steps || '').replace(/\s/g, '')); const h = int(v.sleep_h); const mi = int(v.sleep_m);
    if (steps != null && (Number.isNaN(steps) || steps < 0 || steps > 150000)) return ($e.textContent = 'Pas : un nombre entre 0 et 150 000.');
    if (h != null && (Number.isNaN(h) || h < 0 || h > 16)) return ($e.textContent = 'Sommeil : entre 0 et 16 heures.');
    if (mi != null && (Number.isNaN(mi) || mi < 0 || mi > 59)) return ($e.textContent = 'Minutes : entre 0 et 59.');
    if (steps == null && h == null && mi == null) return ($e.textContent = 'Indique au moins tes pas ou ton sommeil.');
    const sleep = h == null && mi == null ? null : (h || 0) * 60 + (mi || 0);
    const { error } = await sb.from('daily_metrics').upsert({ member_id: S.me.id, tandem_id: S.me.tandem_id, day: v.day || day, source: 'manuel', steps, sleep_min: sleep, updated_at: new Date().toISOString() });
    if (error) return ($e.textContent = `Enregistrement impossible : ${error.message}`);
    closeModal(); toast('Enregistré'); render();
  });
}
function weightForm() {
  openModal(`<h2>Pesée</h2>
    <form id="w" style="display:flex;flex-direction:column;gap:12px" novalidate>
      <div class="grid2"><label>Date<input name="date" type="date" value="${today()}"></label><label>Poids (kg)<input name="kg" inputmode="decimal"></label></div>
      <label>Tour de taille (cm, facultatif)<input name="waist" inputmode="decimal"></label>
      <p class="err" id="werr" role="alert" style="margin:0"></p>
      <div class="grid2"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn">Enregistrer</button></div>
    </form>`, (root) => root.querySelector('#w').onsubmit = async (e) => {
    e.preventDefault(); const v = formData(e.target); const kg = num(v.kg);
    if (kg == null || Number.isNaN(kg) || kg < 30 || kg > 300) return (root.querySelector('#werr').textContent = 'Indique un poids entre 30 et 300 kg.');
    const { error } = await sb.from('weights').upsert({ member_id: S.me.id, tandem_id: S.me.tandem_id, day: v.date || today(), kg, waist_cm: num(v.waist) });
    if (error) return fail(error, 'Enregistrement impossible'); closeModal(); render();
  });
}

// ---------- Défis ----------
// Inspiré des applis de marche (jauge à paliers, séries, badges) : tout est calculé à partir des données existantes.
const STEP_TIERS = [2500, 5000, 7500, 10000];
const STREAK_STEPS = 7500;
function dayPoints(o, ctx) {
  // ctx : { planKeys, checks:Set, meals, journal, duoOk }
  const parts = [];
  const tiers = STEP_TIERS.filter((t) => (o.steps || 0) >= t).length; if (tiers) parts.push(['Paliers de pas', tiers]);
  const brisk = o.acts.filter((a) => /marche|rando/i.test(a.type) && (a.duration_min || 0) >= 10);
  const bmax = Math.max(0, ...brisk.map((a) => a.duration_min || 0));
  if (bmax >= 20) parts.push(['Marche rapide 20 min', 2]); else if (bmax >= 10) parts.push(['Marche rapide 10 min', 1]);
  const sess = ctx.sessions; if (sess) parts.push(['Séances du programme', sess * 3]);
  if (ctx.breath) parts.push(['Respiration', 1]);
  const other = Math.min(2, o.acts.filter((a) => !/marche|rando/i.test(a.type)).length); if (other) parts.push(['Activités', other * 2]);
  if (ctx.mealsDone) parts.push(['Repas suivis', ctx.mealsDone]);
  if (o.journal) { parts.push(['Journal rempli', 1]); if (o.journal.drinks === 0) parts.push(['Journée sans alcool', 1]); }
  if ((o.sleep || 0) >= 7) parts.push(['Nuit de 7 h', 1]);
  if (ctx.duoOk) parts.push(['Défi du jour à deux', 2]);
  return { total: parts.reduce((t, [, n]) => t + n, 0), parts };
}

async function viewChallenges() {
  const people = [S.me, S.partner].filter(Boolean);
  const d = S.day; const end = today() < d ? today() : d;
  const from = addDays(end, -89);
  const monthStart = `${end.slice(0, 8)}01`;
  const [{ merged, checks, weights }, { data: meals }, { data: allActs }] = await Promise.all([
    loadTrackData(from, end),
    sb.from('meals').select('day,member_id,status,slot').eq('tandem_id', S.me.tandem_id).in('slot', ['midi', 'soir']).gte('day', from).lte('day', end),
    sb.from('activities').select('member_id,distance_km').eq('tandem_id', S.me.tandem_id),
  ]);
  const days90 = Array.from({ length: 90 }, (_, i) => addDays(from, i));
  const ctxFor = (p, day) => {
    const ch = checks.filter((c) => c.member_id === p.id && c.day === day);
    const steps = people.map((q) => merged(q.id, day).steps || 0);
    return {
      sessions: ch.filter((c) => c.session_key !== 'respiration').length,
      breath: ch.some((c) => c.session_key === 'respiration'),
      mealsDone: (meals || []).filter((m) => m.day === day && m.status === 'fait' && (m.member_id === null || m.member_id === p.id)).length,
      duoOk: people.length === 2 && steps[0] + steps[1] >= DAILY_DUO_GOAL,
    };
  };
  const pts = (p, day) => dayPoints(merged(p.id, day), ctxFor(p, day));
  const monthDays = days90.filter((x) => x >= monthStart);
  const monthPts = people.map((p) => sumOf(monthDays.map((x) => pts(p, x).total)));
  const streak = (pred) => { let n = 0; for (let i = days90.length - 1; i >= 0; i--) { const ok = pred(days90[i]); if (ok) n++; else if (days90[i] === end) continue; else break; } return n; };
  const stepStreak = people.map((p) => streak((x) => (merged(p.id, x).steps || 0) >= STREAK_STEPS));
  const duoStreak = people.length === 2 ? streak((x) => people.every((p) => (merged(p.id, x).steps || 0) >= STREAK_STEPS)) : 0;
  const best = (pred) => { let b = 0, n = 0; for (const x of days90) { if (pred(x)) { n++; b = Math.max(b, n); } else n = 0; } return b; };
  const me = merged(S.me.id, end); const myPts = pts(S.me, end);
  const totalKm = (mid) => sumOf((allActs || []).filter((a) => a.member_id === mid).map((a) => Number(a.distance_km || 0)));
  const weekTotal = (mid, mon) => sumOf([0, 1, 2, 3, 4, 5, 6].map((i) => merged(mid, addDays(mon, i)).steps));
  const weeksOk = people.length === 2 ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter((k) => { const mon = addDays(mondayOf(end), -7 * k); return mon >= from && weekTotal(people[0].id, mon) + weekTotal(people[1].id, mon) >= WEEKLY_DUO_GOAL; }).length : 0;
  const duoDays = days90.filter((x) => ctxFor(S.me, x).duoOk).length;
  const sessionsDone = (mid) => checks.filter((c) => c.member_id === mid && c.session_key !== 'respiration').length;
  const lostKg = (p) => { const w = weights.filter((x) => x.member_id === p.id && x.kg != null).pop(); return w && p.start_weight ? p.start_weight - w.kg : 0; };
  const badges = [
    ['10 000 pas', 'Une journée à 10 000 pas', days90.some((x) => (merged(S.me.id, x).steps || 0) >= 10000)],
    ['Série de 7', `7 jours d'affilée à ${nf(STREAK_STEPS)} pas`, best((x) => (merged(S.me.id, x).steps || 0) >= STREAK_STEPS) >= 7],
    ['Série de 30', `30 jours d'affilée à ${nf(STREAK_STEPS)} pas`, best((x) => (merged(S.me.id, x).steps || 0) >= STREAK_STEPS) >= 30],
    ['Duo du jour', `Défi des ${nf(DAILY_DUO_GOAL)} pas réussi 5 fois`, duoDays >= 5],
    ['Semaine en or', `${nf(WEEKLY_DUO_GOAL)} pas à deux en une semaine`, weeksOk >= 1],
    ['Régulier', '10 séances du programme cochées', sessionsDone(S.me.id) >= 10],
    ['Assidu', '30 séances du programme cochées', sessionsDone(S.me.id) >= 30],
    ['100 km', '100 km cumulés en activité', totalKm(S.me.id) >= 100],
    ['Bien dormi', '7 nuits de 7 h d\'affilée', best((x) => (merged(S.me.id, x).sleep || 0) >= 7) >= 7],
    ['Zen', '10 séances de respiration', checks.filter((c) => c.member_id === S.me.id && c.session_key === 'respiration').length >= 10],
    ['Premier kilo', '1 kg de moins depuis le départ', lostKg(S.me) >= 1],
    ['Cinq kilos', '5 kg de moins depuis le départ', lostKg(S.me) >= 5],
  ];
  const tierPct = Math.min(1, (me.steps || 0) / STEP_TIERS[STEP_TIERS.length - 1]);
  const R = 70, C = Math.PI * R;
  const gauge = `<svg viewBox="0 0 180 104" style="width:100%;max-width:260px;display:block;margin:0 auto" role="img" aria-label="${nf(me.steps || 0)} pas">
    <path d="M20 94 A70 70 0 0 1 160 94" fill="none" stroke="var(--line)" stroke-width="14" stroke-linecap="round"/>
    <path d="M20 94 A70 70 0 0 1 160 94" fill="none" stroke="var(--me)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${(C * tierPct).toFixed(1)} ${C.toFixed(1)}"/>
    ${STEP_TIERS.map((t) => { const a = Math.PI * (1 - t / STEP_TIERS[STEP_TIERS.length - 1]); const x = 90 + R * Math.cos(a), y = 94 - R * Math.sin(a); const ok = (me.steps || 0) >= t; return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="${ok ? '#fff' : 'var(--line)'}" stroke="${ok ? 'var(--me)' : '#fff'}" stroke-width="3"/>`; }).join('')}
    <text x="90" y="80" text-anchor="middle" font-size="22" font-weight="700" font-family="Barlow Condensed" fill="var(--ink)">${nf(me.steps || 0)}</text>
    <text x="90" y="96" text-anchor="middle" font-size="10" fill="#5E6573">pas · ${STEP_TIERS.filter((t) => (me.steps || 0) >= t).length} palier(s) sur 4</text></svg>`;
  const next = STEP_TIERS.find((t) => (me.steps || 0) < t);
  const brisk = Math.max(0, ...me.acts.filter((a) => /marche|rando/i.test(a.type)).map((a) => a.duration_min || 0));
  $app.innerHTML = header('Défis', 'Paliers de pas, séries, points et badges', true) + `<div class="wrap">
    <div class="card white" style="align-items:center;text-align:center">${gauge}
      <span class="muted">${next ? `Prochain palier : ${nf(next)} pas, encore ${nf(next - (me.steps || 0))}.` : 'Les 4 paliers sont atteints, bravo !'}</span>
      <span class="pill ok">+${myPts.total} point${myPts.total > 1 ? 's' : ''} aujourd'hui</span></div>
    <div class="grid2">
      <div class="card"><span class="title">Marche rapide</span><span class="muted small">10 ou 20 min de marche d'un bon pas.</span><b style="font:700 22px 'Barlow Condensed'">${brisk >= 20 ? '20 min ✓' : brisk >= 10 ? '10 min ✓' : 'À faire'}</b></div>
      <div class="card"><span class="title">Série</span><span class="muted small">Jours d'affilée à ${nf(STREAK_STEPS)} pas.</span><b style="font:700 22px 'Barlow Condensed'">${stepStreak[0]} jour${stepStreak[0] > 1 ? 's' : ''}</b>${people.length === 2 ? `<span class="small">À deux : ${duoStreak} jour${duoStreak > 1 ? 's' : ''}</span>` : ''}</div>
    </div>
    ${people.length === 2 ? duoBar(`Défi du jour : ${nf(DAILY_DUO_GOAL)} pas à deux`, DAILY_DUO_GOAL, people.map((p) => merged(p.id, end).steps), people) : ''}
    ${people.length === 2 ? duoBar(`Défi de la semaine : ${nf(WEEKLY_DUO_GOAL)} pas`, WEEKLY_DUO_GOAL, people.map((p) => weekTotal(p.id, mondayOf(end))), people) : ''}
    <h2>Points du mois</h2>
    <div class="card white">
      ${people.map((p, i) => `<div class="row between"><span class="row" style="gap:8px"><span class="avatar" style="background:${colorHex(p.color)};width:32px;height:32px;font-size:15px">${esc(p.first_name[0])}</span><b>${esc(p.first_name)}</b></span><b style="font:700 24px 'Barlow Condensed'">${nf(monthPts[i])} pts</b></div>`).join('')}
      ${people.length === 2 ? `<span class="small muted">${monthPts[0] === monthPts[1] ? 'Égalité pour l\'instant.' : `${esc((monthPts[0] > monthPts[1] ? people[0] : people[1]).first_name)} mène le duel du mois.`} Ensemble : ${nf(monthPts[0] + monthPts[1])} points.</span>` : ''}
    </div>
    <details class="card"><summary class="title" style="cursor:pointer">Mes points d'aujourd'hui</summary>
      ${myPts.parts.length ? `<table class="mini">${myPts.parts.map(([l, n]) => `<tr><td>${esc(l)}</td><td style="text-align:right">+${n}</td></tr>`).join('')}</table>` : '<span class="muted small">Pas encore de points aujourd\'hui.</span>'}
      <span class="small muted">Barème : 1 point par palier de pas (2 500, 5 000, 7 500, 10 000) · marche rapide 10 min +1, 20 min +2 · séance du programme +3 · respiration +1 · autre activité +2 (2 max) · repas suivi +1 · journal +1 · journée sans alcool +1 · nuit de 7 h +1 · défi du jour à deux +2.</span>
    </details>
    <h2>Badges</h2>
    <div class="grid2">${badges.map(([t, desc, ok]) => `<div class="card" style="${ok ? 'background:var(--okbg)' : 'opacity:.6'}"><span class="title">${ok ? '🏅' : '🔒'} ${esc(t)}</span><span class="small muted">${esc(desc)}</span></div>`).join('')}</div>
  </div>`;
  bindDayNav();
}

const ACT_TYPES = ['Marche', 'Course', 'Vélo d\'appartement', 'Vélo dehors', 'Renfo', 'Natation', 'Yoga', 'Étirements', 'Randonnée', 'Autre'];
function activityForm(a, day) {
  const isNew = !a;
  const start = a ? new Date(a.start_at) : null;
  const date = a ? iso(start) : day;
  const time = a ? `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}` : '18:00';
  const known = !a || ACT_TYPES.includes(a.type);
  const typ = a ? (known ? a.type : 'Autre') : '';
  openModal(`
    <h2>${isNew ? 'Mon activité' : 'Modifier l\'activité'}</h2>
    <form id="a" style="display:flex;flex-direction:column;gap:14px" novalidate>
      <div><span class="small" style="font-weight:600">Quel sport ?</span><div class="chips" style="margin-top:6px">${ACT_TYPES.map((t) => `<button type="button" class="chip" data-type="${esc(t)}" aria-pressed="${typ === t}">${esc(t)}</button>`).join('')}</div></div>
      <label id="lblWrap" ${typ === 'Autre' ? '' : 'hidden'}>Lequel ?<input name="label" value="${esc(known ? '' : a.type)}" placeholder="ex. padel, piscine"></label>
      <div class="grid2"><label>Durée (min)<input name="duration" inputmode="numeric" placeholder="ex. 30" value="${esc(a?.duration_min)}"></label><label>FC moyenne<input name="hr" inputmode="numeric" placeholder="ex. 135" value="${esc(a?.hr_avg)}"></label></div>
      <div><span class="small" style="font-weight:600">Comment je me suis senti ?</span>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:6px">${FEEL.map(([n, e, l]) => `<button type="button" class="chip" data-feel="${n}" aria-pressed="${a?.feeling === n}" style="height:auto;min-height:64px;flex-direction:column;display:flex;align-items:center;justify-content:center;gap:2px;padding:6px 2px;border-radius:12px"><span style="font-size:22px">${e}</span><span style="font-size:10px;line-height:1.15;text-align:center">${l}</span></button>`).join('')}</div>
        <div class="row between small muted" style="margin-top:4px"><span>1 · c'était dur</span><span>5 · très fort</span></div></div>
      <details><summary class="small" style="cursor:pointer;color:var(--me);font-weight:600">Plus de détails (facultatif)</summary>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">
          <div class="grid2"><label>Date<input name="date" type="date" value="${date}"></label><label>Heure<input name="time" type="time" value="${time}"></label></div>
          <div class="grid2"><label>Distance (km)<input name="distance" inputmode="decimal" value="${esc(a?.distance_km)}"></label><label>FC max<input name="hrmax" inputmode="numeric" value="${esc(a?.hr_max)}"></label></div>
          <label>Note<textarea name="note">${esc(a?.note)}</textarea></label></div></details>
      <p class="err" id="aerr" role="alert" style="margin:0"></p>
      <button class="btn">${isNew ? 'Enregistrer' : 'Enregistrer les changements'}</button>
      ${isNew ? '' : '<button type="button" class="btn ghost" id="delAct" style="color:var(--danger)">Supprimer cette activité</button>'}
    </form>`, (root) => {
    let type = typ; let feel = a?.feeling || null;
    root.querySelectorAll('[data-type]').forEach((b) => b.onclick = () => { type = b.dataset.type; root.querySelectorAll('[data-type]').forEach((x) => x.setAttribute('aria-pressed', x === b)); root.querySelector('#lblWrap').hidden = type !== 'Autre'; });
    root.querySelectorAll('[data-feel]').forEach((b) => b.onclick = () => { feel = Number(b.dataset.feel); root.querySelectorAll('[data-feel]').forEach((x) => x.setAttribute('aria-pressed', x === b)); });
    root.querySelector('#a').onsubmit = async (e) => {
      e.preventDefault(); const v = formData(e.target); const $e = root.querySelector('#aerr');
      if (!type) return ($e.textContent = 'Choisis le sport.');
      if (type === 'Autre' && !v.label.trim()) return ($e.textContent = 'Indique le sport.');
      const dur = int(v.duration);
      if (dur == null || Number.isNaN(dur) || dur < 1 || dur > 1440) return ($e.textContent = 'Indique la durée (en minutes).');
      const hr = int(v.hr);
      if (hr != null && (Number.isNaN(hr) || hr < 40 || hr > 230)) return ($e.textContent = 'FC moyenne : entre 40 et 230.');
      const startAt = new Date(`${v.date || day}T${v.time || '12:00'}:00`);
      const row = {
        type: (type === 'Autre' ? v.label.trim() : type).slice(0, 60), start_at: startAt.toISOString(),
        duration_min: dur, distance_km: num(v.distance), hr_avg: hr, hr_max: int(v.hrmax), feeling: feel, note: v.note.trim() || null,
      };
      const { error } = isNew
        ? await sb.from('activities').insert({ ...row, member_id: S.me.id, tandem_id: S.me.tandem_id, source: 'manuel' })
        : await sb.from('activities').update(row).eq('id', a.id);
      if (error) return ($e.textContent = `Enregistrement impossible : ${error.message}`);
      closeModal(); toast('Activité enregistrée'); viewTrack();
    };
    root.querySelector('#delAct')?.addEventListener('click', async () => {
      if (!confirm('Supprimer cette activité ?')) return;
      const { error } = await sb.from('activities').delete().eq('id', a.id);
      if (error) return fail(error, 'Suppression impossible'); closeModal(); viewTrack();
    });
  });
}
function weightHistory(weights) {
  const mine = weights.filter((w) => w.member_id === S.me.id).sort((x, y) => (x.day < y.day ? 1 : -1));
  openModal(`<div class="row between"><h2>Mes pesées</h2></div>
    ${mine.length ? `<table class="mini">${mine.map((w) => `<tr><td>${esc(fmtDay(w.day, { day: 'numeric', month: 'short', year: 'numeric' }))}</td><td>${w.kg != null ? `${String(w.kg).replace('.', ',')} kg` : '—'}</td><td>${w.waist_cm != null ? `${String(w.waist_cm).replace('.', ',')} cm` : ''}</td><td style="text-align:right"><button class="link" data-delw="${w.day}" style="color:var(--danger)">Supprimer</button></td></tr>`).join('')}</table>` : '<span class="muted">Aucune pesée pour l\'instant.</span>'}
    <span class="small muted">Pour corriger une pesée, ajoute-en une nouvelle à la même date : elle remplace l'ancienne.</span>`, (root) => {
    root.querySelectorAll('[data-delw]').forEach((b) => b.onclick = async () => {
      if (!confirm('Supprimer cette pesée ?')) return;
      const { error } = await sb.from('weights').delete().match({ member_id: S.me.id, day: b.dataset.delw });
      if (error) return fail(error, 'Suppression impossible'); closeModal(); viewTrack();
    });
  });
}

function legend(people) {
  return `<div class="row small" style="gap:14px">${people.map((p) => `<span class="row" style="gap:6px"><span style="width:12px;height:12px;border-radius:3px;background:${colorHex(p.color)}"></span>${esc(p.first_name)}</span>`).join('')}</div>`;
}
// Barres groupées : une couleur par personne, un groupe par jour de la semaine.
function barChart(series, days, fmt, goal = null, goalLabel = '') {
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  if (!all.length) return '<span class="muted">Pas encore de données cette semaine. Saisis tes pas et ton sommeil avec le bouton ci-dessous.</span>';
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

// ---------- Notifications ----------
const NOTIF_DEFAULT = { seance: true, seance_hour: 18, repas: true, partenaire: true, duo: true, pesee: true, bilan: true };
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function pushInvite() {
  const iosTab = isIOS() && !isStandalone();
  if (!iosTab && (!pushSupported() || Notification.permission !== 'default')) return false;
  let later = 0; try { later = Number(localStorage.getItem('tf_push_later') || 0); } catch {}
  return Date.now() - later > 7 * 864e5;
}
const b64uToBytes = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
async function pushCall(body) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(`${SUPABASE_URL}/functions/v1/push`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${session?.access_token || SUPABASE_KEY}` }, body: JSON.stringify(body) });
  return r.json();
}
async function currentSub() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready; return reg.pushManager.getSubscription();
}
async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'refus' : 'annule');
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await pushCall({ action: 'vapid' });
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(publicKey) });
  const j = sub.toJSON();
  const { error } = await sb.from('push_subscriptions').upsert({ member_id: S.me.id, tandem_id: S.me.tandem_id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 200) }, { onConflict: 'endpoint' });
  if (error) throw error;
}
// Navigateur utilisé sur iPhone (Chrome, Brave, Edge, Firefox ou Safari).
function iosBrowser() {
  const ua = navigator.userAgent;
  if (/CriOS/.test(ua)) return 'Chrome';
  if (/EdgiOS/.test(ua)) return 'Edge';
  if (/FxiOS/.test(ua)) return 'Firefox';
  if (navigator.brave) return 'Brave';
  return 'Safari';
}
function iosInstallHtml() {
  const b = iosBrowser();
  const steps = {
    Safari: ['Appuie sur <b>Partager</b> (le carré avec une flèche, en bas de l\'écran).', 'Descends et choisis <b>Sur l\'écran d\'accueil</b>, laisse « Ouvrir comme app web » activé, puis <b>Ajouter</b>.'],
    Chrome: ['Appuie sur <b>Partager</b> : l\'icône carré-flèche <b>en haut à droite, dans la barre d\'adresse</b> (fais défiler un peu vers le haut si la barre est réduite).', 'Choisis <b>Sur l\'écran d\'accueil</b>, puis <b>Ajouter</b>.'],
    Edge: ['Appuie sur <b>Partager</b> dans la barre d\'adresse ou le menu ⋯.', 'Choisis <b>Sur l\'écran d\'accueil</b>, puis <b>Ajouter</b>.'],
  }[b] || ['Appuie sur <b>Partager</b> (menu ⋯ puis Partager, ou l\'icône carré-flèche).', 'Cherche <b>Sur l\'écran d\'accueil</b> dans la liste. Si l\'option n\'y est pas, copie le lien ci-dessous et fais-le une fois depuis <b>Safari</b> : ensuite l\'icône marche toute seule, quel que soit ton navigateur habituel.'];
  return `<div class="notice"><b>Sur iPhone, une étape avant (${b}) :</b><ol class="steps small">${steps.map((x) => `<li>${x}</li>`).join('')}<li>Ferme ${b} et ouvre Tandem Forme <b>depuis la nouvelle icône</b>.</li><li>Reconnecte-toi une fois (l'icône a sa propre session), puis reviens ici : Plus › Notifications.</li></ol>
    ${b === 'Safari' ? '<span class="small">Tu es sur Brave ? Menu ⋯ › <b>Partager</b> › <b>Sur l\'écran d\'accueil</b>.</span>' : ''}
    <span class="small muted">Apple n'autorise les notifications que pour les applis posées sur l'écran d'accueil, pas dans un onglet de navigateur. Il faut iOS 16.4 ou plus récent.</span>
    <button class="btn ghost sm" id="copyLink" style="margin-top:8px">Copier le lien de l'appli</button></div>`;
}
async function viewNotifs() {
  const n = { ...NOTIF_DEFAULT, ...(S.me.notif || {}) };
  const sub = await currentSub().catch(() => null);
  const perm = pushSupported() ? Notification.permission : 'unsupported';
  let status;
  if (isIOS() && !isStandalone()) status = iosInstallHtml();
  else if (perm === 'unsupported') status = '<div class="notice">Ce navigateur ne gère pas les notifications. Sur Android, utilise Chrome ; sur iPhone, ajoute l\'appli à l\'écran d\'accueil.</div>';
  else if (perm === 'denied') status = `<div class="notice">Les notifications sont bloquées pour Tandem Forme. ${isIOS() ? 'Va dans Réglages › Notifications › Tandem Forme et autorise-les.' : 'Appuie sur le cadenas à côté de l\'adresse (ou Paramètres du téléphone › Applis › Tandem Forme) et autorise les notifications.'}</div>`;
  else if (sub) status = '<div class="card"><span class="title">✅ Activées sur ce téléphone</span><div class="row" style="flex-wrap:wrap"><button class="btn ghost sm" id="pTest">Envoyer un test</button><button class="btn ghost sm" id="pOff">Désactiver ici</button></div></div>';
  else status = '<div class="card white"><span class="title">Pas encore activées sur ce téléphone</span><span class="small">Ton téléphone va te demander l\'autorisation : réponds « Autoriser ».</span><button class="btn" id="pOn">Activer les notifications</button></div>';
  const ROWS = [['seance', 'Séance du jour', 'Un rappel à l\'heure choisie, seulement s\'il reste une séance à faire.'], ['partenaire', 'Séance de ton partenaire', `Quand ${esc(S.partner?.first_name || 'ton partenaire')} termine sa séance.`], ['repas', 'Repas à choisir', 'À 10 h, si le midi ou le soir n\'est pas encore choisi.'], ['duo', 'Défi à deux', 'À 20 h, si les 20 000 pas à deux ne sont pas encore atteints.'], ['pesee', 'Pesée du lundi', 'Le lundi à 8 h.'], ['bilan', 'Bilan de la semaine', 'Le dimanche à 19 h.']];
  $app.innerHTML = header('Notifications', 'Des rappels utiles, jamais plus de quelques-uns par jour') + `<div class="wrap">
    ${status}
    <h2>Ce que tu reçois</h2>
    <div class="card white" style="gap:12px">${ROWS.map(([k, t, d]) => `<label style="display:flex;flex-direction:row;justify-content:space-between;gap:12px;align-items:center"><span style="display:flex;flex-direction:column"><b>${t}</b><span class="small muted">${d}</span></span><input type="checkbox" data-n="${k}" ${n[k] ? 'checked' : ''} style="width:22px;height:22px;flex:none"></label>${k === 'seance' ? `<label class="small">Heure du rappel séance<select id="nHour">${[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map((h) => `<option value="${h}" ${Number(n.seance_hour) === h ? 'selected' : ''}>${h} h</option>`).join('')}</select></label>` : ''}`).join('')}</div>
    <span class="small muted">Les réglages valent pour tous tes appareils. Les rappels suivent l'heure de Paris.</span>
  </div>`;
  const save = async () => {
    const notif = { ...n }; $app.querySelectorAll('[data-n]').forEach((c) => { notif[c.dataset.n] = c.checked; }); notif.seance_hour = Number(document.getElementById('nHour').value);
    const { error } = await sb.from('members').update({ notif }).eq('id', S.me.id);
    if (error) return fail(error, 'Enregistrement impossible');
    S.me.notif = notif; Object.assign(n, notif); toast('Réglage enregistré');
  };
  $app.querySelectorAll('[data-n]').forEach((c) => c.onchange = save);
  document.getElementById('nHour').onchange = save;
  document.getElementById('copyLink')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.origin); toast('Lien copié'); } catch { toast(location.origin); } });
  document.getElementById('pOn')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { await enablePush(); await pushCall({ action: 'test' }); toast('C\'est activé !'); }
    catch (err) { toast(err.message === 'refus' ? 'Autorisation refusée' : err.message === 'annule' ? 'Autorisation pas donnée' : 'Activation impossible, réessaie'); }
    viewNotifs();
  });
  document.getElementById('pTest')?.addEventListener('click', async () => { const r = await pushCall({ action: 'test' }).catch(() => ({})); toast(r.sent ? 'Test envoyé' : 'Envoi impossible : désactive puis réactive'); });
  document.getElementById('pOff')?.addEventListener('click', async () => {
    const s = await currentSub(); if (s) { await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint); await s.unsubscribe(); }
    toast('Désactivées sur ce téléphone'); viewNotifs();
  });
}

// ---------- Plus ----------
function viewMore() {
  $app.innerHTML = header('Plus') + `<div class="wrap">
    ${[['guide', 'Guide de l\'appli', 'Tuto, visite guidée, FAQ et retours bêta'], ['notifs', 'Notifications', 'Rappels de séance, repas, défi à deux'], ['journal', 'Journal', 'Alcool, eau, écarts du jour'], ['program', 'Programme', 'Les séances semaine par semaine'], ['settings', 'Matériel et programme', isCaptain() ? 'Réglages du capitaine' : 'Consultation et suggestions'], ['profile', 'Mon profil', 'Couleur, santé, alimentation'], ['sources', 'Montres et sources', 'Bientôt disponible'], ['account', 'Mon compte', 'Export, déconnexion, suppression']]
      .map(([v, t, s]) => `<button class="card" style="border:0;text-align:left;cursor:pointer" data-go="${v}"><span class="title">${t}</span><span class="muted">${s}</span></button>`).join('')}
  </div>`;
  $app.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => go(b.dataset.go));
}

async function viewProgram() {
  const req = await pendingRequest();
  if (!S.plan) {
    $app.innerHTML = header('Programme') + `<div class="wrap"><div class="card white"><span class="title">Pas de programme en cours</span><span class="small">Choisissez votre matériel et la durée, puis créez le programme : il s'adapte aux disponibilités et au niveau de chacun.</span><button class="btn" data-go="settings">Créer le programme</button></div>${sourcesHtml()}</div>`;
    $app.querySelector('[data-go]').onclick = () => go('settings'); return;
  }
  const p = S.plan.data; const weeks = [];
  for (let w = 1; w <= p.weeks; w++) weeks.push(Object.entries(p.days).filter(([, v]) => v.week === w));
  const DN = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const people = [S.me, S.partner].filter(Boolean); const ids = people.map((x) => x.id);
  const mon = mondayOf(today());
  const thisWeek = [0, 1, 2, 3, 4, 5, 6].map((i) => planDay(addDays(mon, i))).filter(Boolean);
  const load = weekLoad(thisWeek, S.me.id, ids);
  $app.innerHTML = header('Programme', `${p.weeks} semaines à partir du ${fmtDay(p.start_date, { day: 'numeric', month: 'long' })} · niveau ${esc(LEVELS[levelOf(S.me) - 1].name)}`) + `<div class="wrap">
    ${requestBanner(req)}
    ${thisWeek.length ? `<div class="card white"><span class="title">Ta semaine</span>
      <span class="small">🏃 ${load.aerobic} min d'endurance prévues <span class="muted">(repère OMS : 150 à 300 min par semaine ; tes pas du quotidien complètent)</span></span>
      <span class="small">💪 ${load.renfo} séance${load.renfo > 1 ? 's' : ''} de renforcement <span class="muted">(repère : 2 ou plus)</span></span></div>` : ''}
    <div class="row" style="flex-wrap:wrap;gap:8px">
      <button class="btn sm" id="pReview">📝 Faire le point de la semaine</button>
      <button class="btn ghost sm" id="pAvail">⏱️ Changer durée et nombre de séances</button>
    </div>
    ${weeks.map((days, i) => `<details class="card white" ${days.some(([d]) => d === today()) ? 'open' : ''}><summary class="title" style="cursor:pointer">Semaine ${i + 1}</summary>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">${days.map(([d, v], k) => `<button class="card" data-pday="${d}" style="border:0;text-align:left;cursor:pointer;padding:10px 12px"><span class="small muted">${DN[k]} ${esc(fmtDay(d, { day: 'numeric', month: 'short' }))}</span><span style="font-weight:600">${v.sessions.filter((s) => s.key !== 'respiration').map((s) => `${esc(s.title)}${forOf(s).length < people.length ? ` (${esc(people.filter((x) => forOf(s).includes(x.id)).map((x) => x.first_name).join(', '))})` : ''}`).join(' · ') || 'Repos'}</span><span class="small" style="color:var(--me)">Voir le détail ›</span></button>`).join('')}</div></details>`).join('')}
    ${sourcesHtml()}
    <button class="btn ghost" id="pRestart" style="color:var(--danger)">Recommencer avec un nouveau programme</button>
    <span class="small muted">${people.length > 1 ? `Il faut l'accord de ${esc(S.partner.first_name)} : le programme est commun.` : ''}</span>
  </div>`;
  $app.querySelectorAll('[data-pday]').forEach((b) => b.onclick = () => showDay(b.dataset.pday));
  document.getElementById('pReview').onclick = () => reviewModal(reviewWeek());
  document.getElementById('pAvail').onclick = () => availModal();
  document.getElementById('pRestart').onclick = () => restartModal(req);
  bindRequest(req);
}
function sourcesHtml() {
  return `<details class="card"><summary class="title" style="cursor:pointer">D'où viennent les séances ?</summary>
    <div class="small" style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
      <span>Le programme est construit par l'appli à partir de recommandations reconnues, puis adapté à votre matériel, vos disponibilités, votre niveau et vos zones fragiles :</span>
      ${SOURCES.map(([t, d, u]) => `<span><b>${esc(t)}</b> : ${esc(d)} <a class="link" href="${u}" target="_blank" rel="noopener">Source ›</a></span>`).join('')}
      <span class="muted">Ce n'est pas un avis médical. En cas de problème de santé, de douleur ou de doute, demande l'avis de ton médecin avant de commencer.</span>
    </div></details>`;
}

// ---------- Adapter le programme en cours ----------
async function freshMembers() {
  const { data } = await sb.from('members').select('*').eq('tandem_id', S.me.tandem_id);
  const me = (data || []).find((m) => m.id === S.me.id); const pa = (data || []).find((m) => m.id !== S.me.id);
  if (me) Object.assign(S.me, me); if (pa && S.partner) Object.assign(S.partner, pa);
  return [S.me, S.partner].filter(Boolean);
}
// Recalcule les séances à partir d'un jour donné ; le passé (et les séances cochées) ne bouge pas.
async function regenerateFrom(fromDay) {
  const members = await freshMembers();
  const old = S.plan.data; const st = S.tandem.settings || {};
  const fresh = generatePlan({ ...st, start_date: old.start_date, weeks: old.weeks }, members);
  const days = {};
  for (const [d, v] of Object.entries(old.days)) if (d < fromDay) days[d] = v;
  for (const [d, v] of Object.entries(fresh.days)) if (d >= fromDay) days[d] = v;
  const data = { ...old, days, version: 3, updated_at: new Date().toISOString() };
  const { error } = await sb.rpc('plan_update_data', { p_data: data });
  if (error) { fail(error, 'Mise à jour du programme impossible'); return false; }
  S.plan.data = data; return true;
}
function availModal() {
  const a = availOf(S.me);
  openModal(`<h2>Mes séances</h2>
    <span class="small muted">Le changement s'applique à tes séances à venir ; ${S.partner ? `celles de ${esc(S.partner.first_name)} ne bougent pas, et ` : ''}ce qui est déjà fait reste enregistré.</span>
    <div><b class="small">Durée d'une séance</b><div class="chips" style="margin-top:6px">${[20, 30, 45, 60].map((m) => `<button type="button" class="chip" data-min="${m}" aria-pressed="${a.minutes === m}">${m} min</button>`).join('')}</div></div>
    <div><b class="small">Séances par semaine</b><div class="chips" style="margin-top:6px">${[1, 2, 3, 4, 5, 6].map((n) => `<button type="button" class="chip" data-ses="${n}" aria-pressed="${a.sessions === n}">${n}</button>`).join('')}</div></div>
    <div><b class="small">Jours possibles</b><div class="chips" style="margin-top:6px">${WEEKDAYS.map((d, i) => `<button type="button" class="chip" data-wd="${i}" aria-pressed="${a.days.includes(i)}">${d}</button>`).join('')}</div></div>
    <div><b class="small">À partir de</b><div class="chips" style="margin-top:6px"><button type="button" class="chip" data-from="tomorrow" aria-pressed="true">Demain</button><button type="button" class="chip" data-from="monday" aria-pressed="false">Lundi prochain</button></div></div>
    <p class="err" id="avErr" role="alert" style="margin:0"></p>
    <button class="btn" id="avSave">Mettre à jour mon programme</button>`, (root) => {
    const single = (sel) => root.querySelectorAll(sel).forEach((b) => b.onclick = () => root.querySelectorAll(sel).forEach((x) => x.setAttribute('aria-pressed', x === b)));
    single('[data-min]'); single('[data-ses]'); single('[data-from]');
    root.querySelectorAll('[data-wd]').forEach((b) => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
    root.querySelector('#avSave').onclick = async (e) => {
      const days = [...root.querySelectorAll('[data-wd][aria-pressed=true]')].map((b) => Number(b.dataset.wd));
      const sessions = Number(root.querySelector('[data-ses][aria-pressed=true]').dataset.ses);
      if (!days.length) return (root.querySelector('#avErr').textContent = 'Coche au moins un jour.');
      if (sessions > days.length) return (root.querySelector('#avErr').textContent = `${sessions} séances demandent au moins ${sessions} jours possibles.`);
      e.target.disabled = true;
      const availability = { days, sessions, minutes: Number(root.querySelector('[data-min][aria-pressed=true]').dataset.min) };
      const { error } = await sb.from('members').update({ availability }).eq('id', S.me.id);
      if (error) { e.target.disabled = false; return fail(error, 'Enregistrement impossible'); }
      S.me.availability = availability;
      const from = root.querySelector('[data-from][aria-pressed=true]').dataset.from === 'monday' ? addDays(mondayOf(today()), 7) : addDays(today(), 1);
      if (S.plan && await regenerateFrom(from)) { closeModal(); toast('Programme mis à jour'); render(); }
    };
  });
}

// ---------- Point hebdomadaire ----------
// Le point porte sur la semaine en cours à partir du vendredi, sinon sur la semaine précédente.
function reviewWeek() { const wd = (parseDay(today()).getDay() + 6) % 7; const w = wd >= 4 ? mondayOf(today()) : addDays(mondayOf(today()), -7); return planDay(w) ? w : mondayOf(today()); }
const RQ = [
  ['global', 'Les séances de la semaine étaient…', ['Trop faciles', 'Bien dosées', 'Un peu dures', 'Trop dures']],
  ['forme', 'Ta forme et ta récupération ?', ['En pleine forme', 'Un peu fatigué·e', 'Très fatigué·e, grosses courbatures']],
  ['duree', 'La durée des séances ?', ['Trop courte', 'Parfaite', 'Trop longue']],
  ['nombre', 'Le nombre de séances par semaine ?', ['Pas assez', 'Parfait', 'Trop']],
];
async function reviewModal(week) {
  const end = addDays(week, 6);
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(week, i));
  const [{ data: checks }, { data: prev }] = await Promise.all([
    sb.from('checks').select('day,session_key,feeling').eq('member_id', S.me.id).gte('day', week).lte('day', end),
    sb.from('weekly_reviews').select('*').eq('member_id', S.me.id).eq('week_start', week).maybeSingle(),
  ]);
  const mine = days.flatMap((d) => (planDay(d)?.sessions || []).filter((s) => forOf(s).includes(S.me.id) && s.key !== 'respiration' && !s.optional).map((s) => ({ ...s, day: d })));
  const done = mine.filter((s) => (checks || []).some((c) => c.day === s.day && c.session_key === s.key)).length;
  const exos = [...new Set(mine.flatMap((s) => s.per?.[S.me.id] || []))];
  const hasRun = mine.some((s) => s.key === 'course');
  const ans = { ...(prev?.answers || {}) };
  const a = availOf(S.me); const fit = S.me.fitness || {}; const excluded = new Set(fit.excluded || []);
  openModal(`<h2>Le point de la semaine</h2>
    <span class="small muted">Semaine du ${esc(fmtDay(week, { day: 'numeric', month: 'long' }))} · ${done} séance${done > 1 ? 's' : ''} faite${done > 1 ? 's' : ''} sur ${mine.length}. Réponds en 1 minute : le programme s'adapte à partir de lundi.</span>
    ${RQ.map(([id, q, opts]) => `<div><b class="small">${q}</b><div class="chips" style="margin-top:6px">${opts.map((o, i) => `<button type="button" class="chip" data-q="${id}" data-v="${i}" aria-pressed="${ans[id] === i}">${o}</button>`).join('')}</div>
      ${id === 'duree' ? `<div class="chips" id="dureeNew" style="margin-top:6px" hidden>${[20, 30, 45, 60].map((m) => `<button type="button" class="chip" data-nmin="${m}" aria-pressed="${a.minutes === m}">${m} min</button>`).join('')}</div>` : ''}
      ${id === 'nombre' ? `<div class="chips" id="nombreNew" style="margin-top:6px" hidden>${[1, 2, 3, 4, 5, 6].map((n) => `<button type="button" class="chip" data-nses="${n}" aria-pressed="${a.sessions === n}">${n} par semaine</button>`).join('')}</div>` : ''}</div>`).join('')}
    ${hasRun ? `<div><b class="small">La course (plan Couch to 5K) ?</b><div class="chips" style="margin-top:6px">${['Trop facile', 'Bien', 'Trop dure'].map((o, i) => `<button type="button" class="chip" data-q="course" data-v="${i}" aria-pressed="${ans.course === i}">${o}</button>`).join('')}</div></div>` : ''}
    ${exos.length ? `<div><b class="small">Les exercices de renfo : lesquels changer ?</b><span class="small muted" style="display:block">Touche ceux que tu n'aimes pas ou qui ne te vont pas : ils seront remplacés.</span><div class="chips" style="margin-top:6px">${exos.map((n) => `<button type="button" class="chip" data-ex="${esc(n)}" aria-pressed="${excluded.has(n)}">👎 ${esc(variantFor(n, levelOf(S.me), S.me))}</button>`).join('')}</div></div>` : ''}
    <div><b class="small">Une douleur ou une gêne pendant le sport ?</b><div class="chips" style="margin-top:6px">${ZONES.map(([z, l]) => `<button type="button" class="chip" data-zone="${z}" aria-pressed="false">${l}</button>`).join('')}</div></div>
    <label class="small">Ce qui va, ce qui ne va pas (facultatif)<textarea id="rvNote" placeholder="ex. le mardi c'est compliqué, j'adore le vélo">${esc(ans.note || '')}</textarea></label>
    <button class="btn" id="rvNext">Voir ce qui va changer</button>`, (root) => {
    root.querySelectorAll('[data-q]').forEach((b) => b.onclick = () => {
      ans[b.dataset.q] = Number(b.dataset.v);
      root.querySelectorAll(`[data-q="${b.dataset.q}"]`).forEach((x) => x.setAttribute('aria-pressed', x === b));
      if (b.dataset.q === 'duree') root.querySelector('#dureeNew').hidden = ans.duree === 1;
      if (b.dataset.q === 'nombre') root.querySelector('#nombreNew').hidden = ans.nombre === 1;
    });
    if (ans.duree != null && ans.duree !== 1) root.querySelector('#dureeNew').hidden = false;
    if (ans.nombre != null && ans.nombre !== 1) root.querySelector('#nombreNew').hidden = false;
    const single = (sel) => root.querySelectorAll(sel).forEach((b) => b.onclick = () => root.querySelectorAll(sel).forEach((x) => x.setAttribute('aria-pressed', x === b)));
    single('[data-nmin]'); single('[data-nses]');
    root.querySelectorAll('[data-ex],[data-zone]').forEach((b) => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
    root.querySelector('#rvNext').onclick = () => {
      if (ans.global == null || ans.forme == null) return toast('Réponds au moins aux deux premières questions');
      ans.note = root.querySelector('#rvNote').value.trim().slice(0, 1000);
      ans.excluded = [...root.querySelectorAll('[data-ex][aria-pressed=true]')].map((b) => b.dataset.ex);
      ans.kept = exos.filter((n) => !ans.excluded.includes(n));
      ans.zones = [...root.querySelectorAll('[data-zone][aria-pressed=true]')].map((b) => b.dataset.zone);
      ans.minutes = ans.duree != null && ans.duree !== 1 ? Number(root.querySelector('[data-nmin][aria-pressed=true]')?.dataset.nmin || a.minutes) : a.minutes;
      ans.sessions = ans.nombre != null && ans.nombre !== 1 ? Number(root.querySelector('[data-nses][aria-pressed=true]')?.dataset.nses || a.sessions) : a.sessions;
      reviewSummary(week, ans);
    };
  });
}
// Ce que le point propose de changer ; chaque changement peut être décoché.
function reviewChanges(ans) {
  const lvl = levelOf(S.me); const a = availOf(S.me); const fit = S.me.fitness || {}; const out = [];
  if (ans.global === 0 && ans.forme !== 2 && lvl < 4) out.push({ id: 'level', to: lvl + 1, txt: `Passer au niveau ${LEVELS[lvl].name} : plus de séries, des variantes plus dures.` });
  else if ((ans.global === 3 || ans.forme === 2) && lvl > 1) out.push({ id: 'level', to: lvl - 1, txt: `Revenir au niveau ${LEVELS[lvl - 2].name} : moins de séries, plus de récupération.` });
  if (ans.minutes !== a.minutes) out.push({ id: 'minutes', to: ans.minutes, txt: `Séances de ${ans.minutes} min au lieu de ${a.minutes}.` });
  if (ans.sessions !== a.sessions) out.push({ id: 'sessions', to: Math.min(ans.sessions, a.days.length), txt: `${Math.min(ans.sessions, a.days.length)} séance(s) par semaine au lieu de ${a.sessions}${ans.sessions > a.days.length ? ` (limité à tes ${a.days.length} jours possibles)` : ''}.` });
  if (ans.course === 0) out.push({ id: 'run', to: 3, txt: 'Course : sauter une semaine du plan Couch to 5K.' });
  if (ans.course === 2) out.push({ id: 'run', to: -3, txt: 'Course : refaire la semaine précédente du plan, sans culpabiliser, c\'est prévu.' });
  const newEx = ans.excluded.filter((n) => !(fit.excluded || []).includes(n)); const back = (fit.excluded || []).filter((n) => ans.kept.includes(n));
  if (newEx.length) out.push({ id: 'exclude', txt: `Remplacer : ${newEx.join(', ')}.` });
  if (back.length) out.push({ id: 'include', txt: `Remettre : ${back.join(', ')}.` });
  if (ans.zones.length) out.push({ id: 'zones', txt: `Ménager : ${ans.zones.map((z) => ZONES.find((x) => x[0] === z)[1].toLowerCase()).join(', ')} (exercices à risque retirés). Si la douleur dure, parles-en à un médecin.` });
  if (ans.global === 2 && !out.some((c) => c.id === 'level')) out.push({ id: 'info', txt: 'Un peu dur, c\'est normal en progressant : on garde le niveau.' });
  return out;
}
function reviewSummary(week, ans) {
  const changes = reviewChanges(ans);
  const real = changes.filter((c) => c.id !== 'info');
  openModal(`<h2>Ce qui va changer</h2>
    ${real.length ? `<span class="small muted">Décoche ce que tu ne veux pas. Ça s'applique à tes séances à partir de lundi.</span>` : '<div class="notice">Tout roule : on continue comme ça 👍</div>'}
    ${changes.map((c, i) => c.id === 'info' ? `<span class="small">${esc(c.txt)}</span>` : `<label style="display:flex;flex-direction:row;gap:10px;align-items:flex-start"><input type="checkbox" data-ch="${i}" checked style="width:22px;height:22px;flex:none"><span class="small">${esc(c.txt)}</span></label>`).join('')}
    <button class="btn" id="rvApply">${real.length ? 'Appliquer' : 'Enregistrer le point'}</button>
    <button class="btn ghost" id="rvBack">Revenir aux questions</button>`, (root) => {
    root.querySelector('#rvBack').onclick = () => reviewModal(week);
    root.querySelector('#rvApply').onclick = async (e) => {
      e.target.disabled = true;
      const keep = changes.filter((c, i) => c.id !== 'info' && root.querySelector(`[data-ch="${i}"]`)?.checked);
      const fit = { ...(S.me.fitness || {}) }; const av = { ...availOf(S.me) }; const health = { ...(S.me.health || {}), zones: [...((S.me.health || {}).zones || [])] };
      for (const c of keep) {
        if (c.id === 'level') { fit.level = c.to; fit.history = [...(fit.history || []), { level: c.to, at: new Date().toISOString(), by: 'point hebdo' }].slice(-20); }
        if (c.id === 'minutes') av.minutes = c.to;
        if (c.id === 'sessions') av.sessions = c.to;
        if (c.id === 'run') fit.run_shift = Number(fit.run_shift || 0) + c.to;
        if (c.id === 'exclude') fit.excluded = [...new Set([...(fit.excluded || []), ...ans.excluded])];
        if (c.id === 'include') fit.excluded = (fit.excluded || []).filter((n) => !ans.kept.includes(n));
        if (c.id === 'zones') for (const z of ans.zones) if (!health.zones.some((x) => x.zone === z)) health.zones.push({ zone: z, type: 'douleur', note: 'Signalé au point hebdo' });
      }
      const patch = keep.length ? { fitness: fit, availability: av, health } : {};
      if (keep.length) {
        const { error } = await sb.from('members').update(patch).eq('id', S.me.id);
        if (error) { e.target.disabled = false; return fail(error, 'Enregistrement impossible'); }
        Object.assign(S.me, patch);
      }
      await sb.from('weekly_reviews').upsert({ member_id: S.me.id, tandem_id: S.me.tandem_id, week_start: week, answers: ans, changes: { applied: keep.map((c) => c.txt) } }, { onConflict: 'member_id,week_start' });
      const nextMon = addDays(week, 7);
      if (keep.length && S.plan) await regenerateFrom(nextMon > today() ? nextMon : addDays(today(), 1));
      closeModal(); toast(keep.length ? 'Programme adapté' : 'Point enregistré, merci !'); render();
    };
  });
}

// ---------- Recommencer le programme (accord du binôme) ----------
async function pendingRequest() {
  const { data } = await sb.from('plan_requests').select('*').eq('tandem_id', S.me.tandem_id).eq('status', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data || null;
}
function requestBanner(req) {
  if (!req) return '';
  const mineReq = req.requested_by === S.me.id;
  return `<div class="notice" style="display:flex;flex-direction:column;gap:8px">${mineReq
    ? `<span>Tu as proposé de recommencer le programme. En attente de l'accord de ${esc(S.partner?.first_name || 'ton binôme')}.</span><button class="btn ghost sm" data-req="cancel">Annuler ma demande</button>`
    : `<span><b>${esc(S.partner?.first_name || 'Ton binôme')} propose de recommencer le programme.</b>${req.reason ? ` « ${esc(req.reason)} »` : ''}</span><span class="small">Si tu acceptes, le programme actuel s'arrête (les séances faites restent enregistrées) et vous en créez un nouveau.</span><div class="row"><button class="btn sm" data-req="ok">J'accepte</button><button class="btn ghost sm" data-req="no">Je refuse</button></div>`}</div>`;
}
function bindRequest(req) {
  if (!req) return;
  $app.querySelectorAll('[data-req]').forEach((b) => b.onclick = async () => {
    const ok = b.dataset.req === 'ok';
    const { data, error } = await sb.rpc('plan_decide', { p_id: req.id, p_ok: ok });
    if (error) return fail(error, 'Action impossible');
    if (data === 'deleted') { S.plan = null; toast('Programme arrêté : créez le nouveau'); return go('settings'); }
    toast(data === 'refused' ? 'Demande refusée' : 'Demande annulée'); render();
  });
}
function restartModal(req) {
  if (req) return toast('Une demande est déjà en cours');
  const solo = !S.partner?.user_id;
  openModal(`<h2>Recommencer le programme ?</h2>
    <span class="small">Le programme actuel s'arrête. Les séances déjà faites, le suivi et les défis restent enregistrés. Vous choisirez ensuite le matériel, la durée et la date de départ du nouveau.</span>
    ${solo ? '' : `<div class="notice small">${esc(S.partner.first_name)} doit d'abord accepter : le programme est commun.</div>`}
    <label class="small">Pourquoi ? (facultatif, ${solo ? 'pour toi' : `visible par ${esc(S.partner.first_name)}`})<textarea id="rsWhy" placeholder="ex. on a acheté un vélo, on veut repartir sur 8 semaines"></textarea></label>
    <button class="btn" id="rsGo" style="background:var(--danger)">${solo ? 'Arrêter le programme' : `Demander à ${esc(S.partner.first_name)}`}</button>`, (root) => {
    root.querySelector('#rsGo').onclick = async (e) => {
      e.target.disabled = true;
      const { data, error } = await sb.rpc('plan_request_delete', { p_reason: root.querySelector('#rsWhy').value.trim() || null });
      if (error) { e.target.disabled = false; return fail(error, 'Demande impossible'); }
      closeModal();
      if (data === 'deleted') { S.plan = null; toast('Programme arrêté'); return go('settings'); }
      toast(data === 'pending' ? 'Une demande est déjà en cours' : `Demande envoyée à ${S.partner.first_name}`); render();
    };
  });
}

// Détail d'une journée du programme : chaque séance avec ses exercices.
function showDay(day) {
  const pd = planDay(day); if (!pd) return;
  openModal(`<div class="row between"><h2>${esc(cap(fmtDay(day)))}</h2></div>
    ${pd.sessions.map((s, i) => `<button class="card" data-si="${i}" style="border:0;text-align:left;cursor:pointer"><span class="title">${esc(s.title)}</span><span class="small muted">${esc(s.detail)}</span><span class="small" style="color:var(--me)">Comment faire ›</span></button>`).join('')}`, (root) => {
    root.querySelectorAll('[data-si]').forEach((b) => b.onclick = () => showSession(pd.sessions[Number(b.dataset.si)], day));
  });
}
function exerciseHtml(name, open = false) {
  const e = EXERCISES[name];
  if (!e) return `<div class="card"><span class="title">${esc(name)}</span></div>`;
  return `<details class="card white" ${open ? 'open' : ''}><summary class="title" style="cursor:pointer">${esc(name)}</summary>
    <div class="small" style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
      ${hasAnim(name) ? animSvg(name) : ''}
      <span class="muted">${esc(e.muscles)}</span>
      <b>Comment faire</b><ol class="steps">${e.how.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      <b>Points clés</b><ul class="plain">${e.keys.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <span><b>Plus facile :</b> ${esc(e.easier)}</span>
      <a class="link small" href="${videoUrl(e.video)}" target="_blank" rel="noopener">Voir aussi des vidéos sur YouTube ›</a>
    </div></details>`;
}
// Routine de gainage détaillée, filtrée selon les zones fragiles de la personne connectée.
function gainageHtml() {
  const info = SESSIONS.gainage;
  const list = GAINAGE.filter((g) => allowedFor(g.n, S.me));
  const removed = GAINAGE.length - list.length;
  return `<h3>Le gainage, pas à pas</h3>
    <p class="small" style="margin:0">${esc(info.intro)}</p>
    <ul class="plain small">${info.tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    ${list.map((g, i) => { const h = holdSeconds(levelOf(S.me)); const dose = g.dose.replace(/(\d+) à (\d+) s|(\d+) s/, () => `${h} s`).replace(/× 10\b/, `× ${[0, 8, 10, 12, 15][levelOf(S.me)]}`).replace(/× 15\b/, `× ${[0, 10, 15, 20, 25][levelOf(S.me)]}`); return `<div class="card" style="gap:4px"><span class="small muted">Exercice ${i + 1} · ${esc(dose)} · ${esc(g.rest)}</span></div>${exerciseHtml(variantFor(g.n, levelOf(S.me), S.me), i === 0)}`; }).join('')}
    ${removed ? `<span class="small muted">${removed} exercice(s) retiré(s) pour ménager tes zones fragiles.</span>` : ''}`;
}
function showExercise(name) {
  openModal(`<div class="row between"><h2>Exercice</h2></div>${exerciseHtml(name, true)}`);
  startAnims(meColor());
}
function showSession(s, day = S.day) {
  if (!s) return;
  const info = SESSIONS[s.key] || {};
  const people = [S.me, S.partner].filter(Boolean);
  const mine = (s.per?.[S.me.id] || (S.partner && s.per?.[S.partner.id]) || []).map((n) => variantFor(n, levelOf(S.me), S.me));
  const theirs = S.partner && s.per?.[S.partner.id] ? s.per[S.partner.id].map((n) => variantFor(n, levelOf(S.partner), S.partner)).filter((n) => !mine.includes(n)) : [];
  openModal(`<div class="row between"><h2>${esc(s.title)}</h2></div>
    <div class="card"><span class="title">Au programme · niveau ${esc(LEVELS[levelOf(S.me) - 1].name)}</span><span class="small">${esc(textFor(s, S.me, day))}</span></div>
    ${info.intro ? `<p class="small" style="margin:0">${esc(info.intro)}</p>` : ''}
    ${info.tips ? `<ul class="plain small">${info.tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${info.video ? `<a class="btn ghost sm" href="${videoUrl(info.video)}" target="_blank" rel="noopener">▶ Voir des vidéos</a>` : ''}
    ${mine.length ? `<h3>${people.length > 1 ? 'Tes exercices' : 'Les exercices'}</h3>${mine.map((n, i) => exerciseHtml(n, i === 0)).join('')}` : ''}
    ${theirs.length ? `<h3>Différents pour ${esc(S.partner.first_name)}</h3><span class="small muted">Adaptés à ses zones fragiles.</span>${theirs.map((n) => exerciseHtml(n)).join('')}` : ''}
    ${/gainage/i.test(`${s.title} ${s.detail}`) ? gainageHtml() : ''}`);
  startAnims(meColor());
}

async function viewSettings() {
  const st = S.tandem.settings || {};
  const eq = new Set(st.equipment || []);
  const capt = isCaptain();
  const captainName = capt ? 'toi' : (S.partner?.first_name || 'le capitaine');
  const canPlan = capt || !S.plan;
  const { data: sugg } = await sb.from('suggestions').select('*').eq('tandem_id', S.me.tandem_id).eq('done', false).order('created_at', { ascending: false });
  $app.innerHTML = header('Matériel et programme', capt ? 'Tu es le capitaine : tes réglages valent pour vous deux.' : `Réglé par ${esc(captainName)}. Tu peux lui faire des suggestions.`) + `
  <form id="s" class="wrap">
    <details class="card" ${S.plan ? '' : 'open'}><summary class="title" style="cursor:pointer">Comment ça marche ?</summary>
      <ul class="plain small" style="margin-top:8px">
        <li><b>Matériel</b> : coche tout ce que vous avez à la maison. Le programme ne propose que des exercices faisables avec ce matériel (ou au poids du corps).</li>
        <li><b>Durée</b> : de 2 à 12 semaines. Les séances deviennent un peu plus longues et plus intenses au fil des semaines.</li>
        <li><b>Début</b> : toujours un lundi.</li>
        <li><b>Course</b> : si « Course dehors » est cochée, choisis la semaine où elle reprend. Avant, le samedi reste une grande balade.</li>
        <li><b>Disponibilités</b> : chacun choisit ses jours, son nombre de séances et leur durée dans « Mon profil ». Le programme s'y adapte pour chacun.</li>
        <li><b>Santé</b> : les zones fragiles de chacun (dans « Mon profil ») retirent les exercices à risque, pour lui ou elle seulement.</li>
        <li>Programme en cours : un changement de matériel s'applique <b>à partir de demain</b>, le passé ne bouge pas. Pour changer de durée ou de date de départ, il faut <b>recommencer</b> le programme (dans Programme), avec l'accord de ton binôme.</li>
      </ul></details>
    <div class="card white"><h3>Disponibilités</h3>
      ${[S.me, S.partner].filter(Boolean).map((p) => { const a = availOf(p); return `<span class="small"><b style="color:${colorHex(p.color)}">${esc(p.first_name)}</b> : ${a.sessions} séance(s) de ${a.minutes} min par semaine, le ${a.days.map((d) => WEEKDAYS[d].toLowerCase()).join(', ')}.</span>`; }).join('')}
      <span class="small muted">À modifier par chacun dans Plus, puis « Mon profil ». Régénère ensuite le programme.</span></div>
    ${EQUIPMENT.map(([g, items]) => `<div class="card white"><h3>${g}</h3><div class="chips">${items.map(([v, l]) => `<button type="button" class="chip" data-eq="${v}" aria-pressed="${eq.has(v)}" ${capt ? '' : 'disabled'}>${l}</button>`).join('')}</div></div>`).join('')}
    <div class="card white"><h3>Programme</h3>
      <span class="muted">Durée</span>
      <div class="chips">${[4, 6, 8, 9, 12].map((w) => `<button type="button" class="chip" data-weeks="${w}" aria-pressed="${(st.weeks || 6) === w}" ${canPlan && !S.plan ? '' : 'disabled'}>${w} semaines${w === 9 ? ' (Couch to 5K)' : ''}</button>`).join('')}</div>
      <div class="grid2"><label>Début (lundi)<input type="date" name="start" value="${esc(S.plan ? S.plan.data.start_date : (st.start_date && st.start_date >= mondayOf(today()) ? st.start_date : addDays(mondayOf(today()), 7)))}" ${canPlan && !S.plan ? '' : 'disabled'}></label>
      <label>Course à partir de la semaine<input name="run_from" inputmode="numeric" value="${esc(st.run_from_week || 1)}" ${canPlan && !S.plan ? '' : 'disabled'}></label></div>
      ${!S.plan ? '<button class="btn block">Créer le programme</button>' : capt ? '<button class="btn block">Appliquer le matériel à partir de demain</button><span class="muted small">Le passé et les séances cochées ne bougent pas. Pour changer la durée ou la date, recommence le programme (dans Programme).</span>' : ''}
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
    e.preventDefault(); if (!canPlan) return;
    const settings = !S.plan ? {
      ...st,
      equipment: capt ? [...f.querySelectorAll('[data-eq][aria-pressed=true]')].map((b) => b.dataset.eq) : (st.equipment || []),
      weeks: Number(f.querySelector('[data-weeks][aria-pressed=true]')?.dataset.weeks || 6),
      start_date: mondayOf(f.querySelector('[name=start]').value || today()),
      run_from_week: Math.max(1, int(f.querySelector('[name=run_from]').value) || 1),
    } : { ...st, equipment: [...f.querySelectorAll('[data-eq][aria-pressed=true]')].map((b) => b.dataset.eq) };
    const btn = f.querySelector('.btn.block'); btn.disabled = true; btn.textContent = 'Un instant…';
    if (capt) {
      const r1 = await sb.from('tandems').update({ settings }).eq('id', S.tandem.id);
      if (r1.error) { btn.disabled = false; return fail(r1.error, 'Enregistrement impossible'); }
      S.tandem.settings = settings;
    }
    if (S.plan) { if (await regenerateFrom(addDays(today(), 1))) { toast('Programme mis à jour à partir de demain'); go('program'); } return; }
    const data = generatePlan(settings, await freshMembers());
    const { data: id, error } = await sb.rpc('plan_create', { p_data: data });
    if (error) { btn.disabled = false; return fail(error, 'Création du programme impossible'); }
    S.plan = { id, tandem_id: S.tandem.id, start_date: data.start_date, weeks: data.weeks, data, active: true }; toast('Programme prêt'); go('program');
  };
}

function viewProfile() {
  $app.innerHTML = header('Mon profil') + `<form id="f" class="wrap">${profileForm(S.me, S.partner?.color)}<button class="btn block">Enregistrer</button>
    <span class="muted small">Un changement de disponibilités ou de santé met à jour tes séances à partir de demain.</span></form>`;
  const f = document.getElementById('f'); bindProfile(f);
  f.onsubmit = async (e) => {
    e.preventDefault(); const p = readProfile(f);
    if (S.partner && p.color === S.partner.color) return toast(`Couleur déjà prise par ${S.partner.first_name}`);
    if (!p.availability.days.length) return toast('Coche au moins un jour de sport');
    const changedAvail = JSON.stringify(availOf(S.me)) !== JSON.stringify(availOf(p)) || JSON.stringify(p.health || {}) !== JSON.stringify(S.me.health || {});
    const { error } = await sb.from('members').update(p).eq('id', S.me.id);
    if (error) return fail(error, 'Enregistrement impossible');
    Object.assign(S.me, p); setTheme();
    if (changedAvail && S.plan) { await regenerateFrom(addDays(today(), 1)); toast('Profil enregistré, programme mis à jour à partir de demain'); return; }
    toast('Profil enregistré');
  };
}

// ---------- Montres et sources ----------
async function providerCall(fn, action, extra = {}) {
  const { data, error } = await sb.functions.invoke(fn, { body: { action, ...extra } });
  if (error) { try { return { error: (await error.context.json()).error || 'Service indisponible' }; } catch { return { error: 'Pas de connexion internet.' }; } }
  return data || {};
}
const garminCall = (action, extra) => providerCall('garmin', action, extra);
const polarCall = (action, extra) => providerCall('polar', action, extra);

// Synchronise Garmin et Polar : à l'ouverture de l'appli, au retour dessus, et sur demande.
let syncing = null;
async function syncAll(force = false) {
  if (syncing) return syncing;
  syncing = (async () => {
    const { data } = await sb.from('connections').select('provider,status,last_sync').eq('member_id', S.me.id).in('provider', ['garmin', 'polar']);
    const due = (data || []).filter((c) => c.status === 'actif' && (force || !c.last_sync || Date.now() - new Date(c.last_sync).getTime() > 5 * 60 * 1000));
    if (!due.length) return { changed: false, none: !(data || []).length };
    const res = await Promise.all(due.map((c) => providerCall(c.provider, 'sync')));
    const changed = res.some((r) => (r.added || 0) + (r.days || 0) > 0);
    const errors = res.filter((r) => r.error).map((r) => r.error);
    return { changed, errors, added: res.reduce((t, r) => t + (r.added || 0), 0) };
  })();
  try { return await syncing; } finally { syncing = null; }
}
async function autoSync() {
  if (!WATCHES_ENABLED) return;
  const r = await syncAll(false);
  if (r.changed && $modal.hidden && !document.getElementById('tour')) { if (r.added) toast(`${r.added} nouvelle(s) activité(s) importée(s)`); render(); }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.me?.onboarded_at && S.session) autoSync().catch(() => {}); });

async function viewSources(newToken = '') {
  if (!WATCHES_ENABLED) {
    $app.innerHTML = header('Montres et sources', 'Bientôt disponible') + `<div class="wrap">
      <div class="notice">La connexion automatique aux montres et aux applis santé arrive plus tard. En attendant, tout se saisit à la main dans l'onglet <b>Suivi</b> : 30 secondes par jour.</div>
      ${['Garmin', 'Polar', 'Apple Santé / Apple Watch'].map((n) => `<div class="card" style="opacity:.55"><div class="row between"><span class="title">${n}</span><span class="pill">Bientôt</span></div><button class="btn ghost sm" disabled>Connecter</button></div>`).join('')}
      <button class="btn" data-go="track">Aller au Suivi</button></div>`;
    $app.querySelector('[data-go]').onclick = () => go('track');
    return;
  }
  const { data: conns } = await sb.from('connections').select('*').eq('member_id', S.me.id);
  const by = (p) => (conns || []).find((c) => c.provider === p);
  const apple = by('apple'), garmin = by('garmin'), polar = by('polar');
  const since = (t) => t ? new Date(t).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const pill = (c) => c ? `<span class="pill ${c.status === 'actif' ? 'ok' : 'warn'}">${c.status === 'actif' ? 'Connecté' : c.status === 'en_attente' ? 'En attente du 1er envoi' : 'À reconnecter'}</span>` : '';
  const appleUrl = newToken ? `${SUPABASE_URL}/functions/v1/ingest?token=${newToken}` : '';
  $app.innerHTML = header('Montres et sources', 'Tout est facultatif : la saisie à la main reste toujours possible.') + `<div class="wrap">
    <div class="card white">
      <div class="row between"><span class="title">Garmin</span>${pill(garmin)}</div>
      <span class="muted small">Activités, pas, étages, fréquence cardiaque, stress, sommeil et VFC. Mise à jour automatique à chaque ouverture de l'appli.</span>
      ${garmin?.last_sync ? `<span class="small">Dernière synchro : ${esc(since(garmin.last_sync))}</span>` : ''}
      ${garmin ? `<div class="row" style="flex-wrap:wrap"><button class="btn sm" data-sync="garmin">Synchroniser maintenant</button><button class="btn ghost sm" data-off="garmin">Déconnecter</button></div>
        ${garmin.status !== 'actif' ? '<span class="small">La clé ne marche plus : déconnecte puis reconnecte avec une nouvelle clé.</span>' : ''}` : `
        <ol class="steps small">
          <li>Ouvre <a href="https://connect.garmin.com/app/settings/personalApiToken" target="_blank" rel="noopener">la page « Personal API Key » de Garmin Connect</a>.</li>
          <li><b>Create Key</b>, accepte les conditions, choisis la durée la plus longue, puis <b>Create</b>.</li>
          <li>Copie la clé (elle ne s'affiche qu'une fois) et colle-la ici.</li>
        </ol>
        <form id="gForm" class="row" style="gap:6px" novalidate><input name="key" type="password" autocomplete="off" placeholder="Clé personnelle Garmin" style="flex:1"><button class="btn">Connecter</button></form>
        <p class="err" id="gErr" role="alert" style="margin:0"></p>`}
    </div>
    <div class="card white">
      <div class="row between"><span class="title">Polar</span>${pill(polar)}</div>
      <span class="muted small">Séances, pas, minutes actives, sommeil, fréquence cardiaque et VFC de la nuit (Nightly Recharge). Mise à jour automatique à chaque ouverture.</span>
      ${polar?.last_sync ? `<span class="small">Dernière synchro : ${esc(since(polar.last_sync))}</span>` : ''}
      ${polar ? `<div class="row" style="flex-wrap:wrap"><button class="btn sm" data-sync="polar">Synchroniser maintenant</button><button class="btn ghost sm" data-off="polar">Déconnecter</button></div>
        ${polar.status !== 'actif' ? '<span class="small">Polar a retiré l\'autorisation : déconnecte puis reconnecte.</span>' : ''}` : `
        <span class="small">Un seul bouton : tu te connectes à ton compte Polar Flow, tu autorises Tandem Forme, et tu reviens ici automatiquement.</span>
        <button class="btn" id="pConnect">Connecter mon compte Polar</button><p class="err" id="pErr" role="alert" style="margin:0"></p>`}
    </div>
    <div class="card white">
      <div class="row between"><span class="title">Apple Watch et Apple Santé</span>${pill(apple)}</div>
      <span class="muted small">Apple ne permet pas aux sites web de lire Santé. On passe par l'app <b>Health Auto Export</b>, qui envoie tes données à Tandem Forme avec ta clé personnelle : pas, étages, fréquence cardiaque, VFC, sommeil, minutes d'exercice et séances de l'Apple Watch.</span>
      ${apple?.last_sync ? `<span class="small">Dernier envoi : ${esc(since(apple.last_sync))}</span>` : ''}
      <details class="card" ${apple?.status === 'actif' ? '' : 'open'}><summary class="title" style="cursor:pointer">Ce qu'il faut faire (5 minutes, une seule fois)</summary>
        <ol class="steps small" style="margin-top:8px">
          <li><b>Installe l'app</b> <a href="https://apps.apple.com/app/id1115567069" target="_blank" rel="noopener">Health Auto Export</a> sur ton iPhone, ouvre-la et autorise l'accès à Santé (active tout).</li>
          <li><b>Obtiens ta clé</b> avec le bouton ci-dessous, puis « Copier ma clé ». C'est une adresse personnelle.</li>
          <li>Dans Health Auto Export, onglet <b>Automations</b>, touche <b>+</b> puis <b>REST API</b>.</li>
          <li>Dans <b>URL</b>, colle ta clé. Laisse <b>Export Format</b> sur <b>JSON</b> et choisis la version <b>2</b>.</li>
          <li><b>Data Type</b> : coche <b>Health Metrics</b>, puis sélectionne Step Count, Flights Climbed, Resting Heart Rate, Heart Rate Variability, Heart Rate, Apple Exercise Time et Sleep Analysis. Ajoute aussi <b>Workouts</b> pour tes séances.</li>
          <li><b>Date Range</b> : « Since Last Sync ». <b>Aggregation</b> : <b>Days</b>. Active l'automatisation (interrupteur en haut).</li>
          <li>Touche <b>Manual Export</b> pour un premier envoi : ici, le statut passe à « Connecté ».</li>
        </ol>
        <span class="small muted">L'envoi automatique en arrière-plan fait partie de l'option Premium de Health Auto Export (achat dans l'app, prix affiché dans l'App Store). Sans elle, tu peux lancer l'envoi à la main avec « Manual Export », ou tout saisir dans Suivi.</span>
      </details>
      ${newToken ? `
        <div class="notice"><b>Ta clé Apple Santé</b> (elle ne sera plus affichée, copie-la maintenant) :
          <div style="font-family:monospace;word-break:break-all;margin:6px 0;font-size:12px">${esc(appleUrl)}</div>
          <button class="btn sm" id="copyUrl">Copier ma clé</button></div>` : `
        <div class="row" style="flex-wrap:wrap"><button class="btn ${apple ? 'ghost' : ''}" id="appleTok">${apple ? 'Générer une nouvelle clé' : 'Obtenir ma clé Apple Santé'}</button>
        ${apple ? '<button class="btn ghost" data-off="apple">Déconnecter</button>' : ''}</div>`}
    </div>
    <div class="card"><span class="title">Saisie manuelle</span><span class="muted small">Pas, sommeil, fréquence cardiaque, activités, pesées : tout se saisit dans Suivi.</span><button class="btn ghost" data-go="track">Aller au suivi</button></div>
  </div>`;
  $app.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => go(b.dataset.go));
  document.getElementById('copyUrl')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(appleUrl); toast('Clé copiée'); } catch { toast('Copie impossible : sélectionne la clé à la main'); } });
  document.getElementById('gForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = e.target.key.value.trim(); const $e = document.getElementById('gErr'); const b = e.target.querySelector('.btn');
    if (!key) return ($e.textContent = 'Colle ta clé Garmin.');
    $e.textContent = ''; b.disabled = true; b.textContent = 'Import en cours…';
    const r = await garminCall('connect', { api_key: key });
    b.disabled = false; b.textContent = 'Connecter';
    if (r.error) return ($e.textContent = r.error);
    toast(`Garmin connecté : ${r.added} activité(s) et ${r.days} jour(s) importés`); viewSources();
  });
  document.getElementById('pConnect')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    const r = await polarCall('start');
    if (r.error) { e.target.disabled = false; return (document.getElementById('pErr').textContent = r.error); }
    location.href = r.url;
  });
  $app.querySelectorAll('[data-sync]').forEach((b) => b.onclick = async () => {
    b.disabled = true; b.textContent = 'Synchro…';
    const r = await providerCall(b.dataset.sync, 'sync', { full: true });
    toast(r.error || `${r.added || 0} activité(s) et ${r.days || 0} jour(s) mis à jour`); viewSources();
  });
  $app.querySelectorAll('[data-off]').forEach((b) => b.onclick = async () => {
    const p = b.dataset.off; const name = { garmin: 'Garmin', polar: 'Polar', apple: 'Apple Santé' }[p];
    if (!confirm(`Déconnecter ${name} ? Les données déjà importées sont conservées.`)) return;
    const r = p === 'apple' ? await sb.rpc('revoke_ingest_token', { p_provider: 'apple' }).then(({ error }) => (error ? { error: error.message } : {})) : await providerCall(p, 'disconnect');
    toast(r.error || `${name} déconnecté`); viewSources();
  });
  document.getElementById('appleTok')?.addEventListener('click', async () => {
    if (apple && !confirm('L\'ancienne clé cessera de fonctionner : il faudra coller la nouvelle dans Health Auto Export. Continuer ?')) return;
    const { data, error } = await sb.rpc('create_ingest_token', { p_provider: 'apple' });
    if (error) return fail(error, 'Création de la clé impossible');
    viewSources(data);
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

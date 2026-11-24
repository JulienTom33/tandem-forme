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
      sb.from('recipes').select('id,name,minutes,servings,protein,dish_type,season,is_treat,lunchbox,kcal_portion'),
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
        <li>Chacun ouvre son lien sur son téléphone, crée son mot de passe et remplit son profil en 3 minutes, avec des explications à chaque étape.</li>
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
          <li><b>Un suivi</b> des pas, du sommeil, du poids… à la main ou depuis votre montre.</li>
          <li><b>Des défis à deux</b> pour se motiver : paliers de pas, séries, points et badges.</li>
        </ul></div>
      <div class="card"><span class="title">${captain ? 'Tu es le capitaine du tandem' : `${esc(partner)} est le capitaine du tandem`}</span>
        <span class="small">${captain ? `C'est toi qui règles le matériel et la durée du programme, pour vous deux. ${esc(partner)} pourra te faire des suggestions.` : `C'est ${esc(partner)} qui règle le matériel et la durée du programme. Toi, tu peux lui envoyer des suggestions depuis l'appli.`}</span></div>
      <div class="card"><span class="title">Ça prend 3 minutes</span><span class="small">5 petites étapes. Tout reste modifiable plus tard dans « Mon profil ».</span></div>` },
    { title: 'Ta couleur', sub: 'Elle sert à te reconnaître partout : boutons, graphiques, défis.', body: `${cards[0]}<p class="small muted">La couleur déjà choisie par ${esc(partner)} est grisée.</p>` },
    { title: 'Toi', sub: 'Pour personnaliser tes objectifs et suivre tes progrès.', body: `${cards[1]}
      <div class="card"><span class="small"><b>Pourquoi ces infos ?</b> L'âge et la taille aident à fixer des objectifs réalistes. Le poids de départ sert de point de comparaison dans tes courbes, et l'objectif t'indique le chemin restant. Seul le prénom est obligatoire.</span>
      <span class="small"><b>Qui les voit ?</b> Toi et ${esc(partner)} uniquement.</span></div>` },
    { title: 'Ta santé', sub: 'Pour que le programme évite les mouvements qui te font mal.', body: `${cards[2]}
      <div class="card"><span class="small"><b>Comment ça marche ?</b> Ajoute une zone fragile (épaule, nuque, genou…) : les exercices qui la sollicitent sont retirés de ton programme, et des exercices doux de renforcement peuvent être ajoutés. Exemple : une tendinite à l'épaule retire les pompes et le kettlebell swing.</span>
      <span class="small"><b>Rien à signaler ?</b> Passe simplement à l'étape suivante.</span>
      <span class="small muted">L'appli ne remplace pas un avis médical : en cas de douleur vive, arrête et consulte.</span></div>` },
    { title: 'Ton alimentation', sub: 'Pour que les recettes proposées conviennent à vous deux.', body: `${cards[3]}
      <div class="card"><span class="small"><b>Comment ça marche ?</b> Les allergies et régimes de vous deux sont combinés : une recette n'est proposée que si elle convient à chacun. Les allergènes sont calculés à partir des ingrédients et affichés sur chaque recette.</span>
      <span class="small"><b>Ce que tu n'aimes pas</b> : écris quelques mots séparés par des virgules (ex. « chou-fleur, lentilles »), les recettes qui en contiennent seront écartées.</span></div>` },
    { title: 'C\'est prêt !', sub: 'Voici comment démarrer.', body: `
      <div class="card"><span class="title">1. ${captain ? 'Crée le programme' : `${esc(partner)} crée le programme`}</span><span class="small">${captain ? 'Dans Plus, puis « Matériel et programme » : coche votre matériel, choisis la durée (2 à 12 semaines) et la date de début.' : 'Dès que c\'est fait, tes séances apparaissent dans « Aujourd\'hui ».'}</span></div>
      <div class="card"><span class="title">2. Choisis tes repas</span><span class="small">Onglet Repas : touche une des 3 idées, puis « C'est mangé » après le repas. Si vous avez mangé autre chose, dis-le, sans culpabiliser.</span></div>
      <div class="card"><span class="title">3. Note ta journée</span><span class="small">Onglet Suivi, à la main ou avec ta montre (Plus, puis « Montres et sources »).</span></div>
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
    pressed: [...f.querySelectorAll('[data-multi] .chip[aria-pressed=true]')].map((b) => `${b.closest('[data-multi]').dataset.multi}:${b.dataset.v}`),
    zones: [...f.querySelectorAll('.zone')].map((z) => ({ zone: z.querySelector('[name=z_zone]').value, side: z.querySelector('[name=z_side]').value, type: z.querySelector('[name=z_type]').value, intensity: z.querySelector('[name=z_int]').value, avoid: z.querySelector('[name=z_avoid]').value })),
  };
}
function restoreDraft(f, d) {
  for (const [k, v] of Object.entries(d.values)) { const el = f.querySelector(`[name="${k}"]`); if (el) el.value = v; }
  f.querySelectorAll('[data-multi] .chip').forEach((b) => b.setAttribute('aria-pressed', d.pressed.includes(`${b.closest('[data-multi]').dataset.multi}:${b.dataset.v}`)));
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
  { tab: 'more', sel: '[data-tab=more]', title: 'Plus', text: 'Journal, programme, réglages du capitaine, montres, profil, compte, et le guide complet de l\'appli. Tu peux relancer cette visite quand tu veux.' },
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
    ${sec('Le programme', `<p>Lundi, mercredi et vendredi : renfo maison (échauffement au vélo si vous en avez un). Mardi et jeudi : marche active. Samedi : grande balade ou course douce. Dimanche : étirements. Chaque soir : 5 min de respiration.</p><p>Les séances s'allongent doucement au fil des semaines. Cochez-les dans « Aujourd'hui ». Si une séance ne passe pas, ce n'est pas grave : on reprend le lendemain.</p>`)}
    ${sec('Les repas', `<p>Pour chaque midi et chaque soir : 3 idées de la même famille (même viande ou poisson, même type de plat). Le midi privilégie les plats qui se transportent en gamelle. Le vendredi soir, un plat plaisir fait maison.</p><p>« C'est mangé » valide le repas. « On a mangé autre chose » demande ce que vous avez mangé (pour vous deux ou pour toi seul). Un joker par semaine et par personne pour un repas plaisir, sans culpabilité.</p><p>Les recettes sont prévues pour 4 portions (2 repas pour vous deux, ou 1 repas et 2 gamelles) ; le sélecteur de portions recalcule les quantités.</p>`)}
    ${sec('Le journal', `<p>Verres d'alcool, verres d'eau, écarts et une note libre, chaque jour. Il est privé par défaut : coche « Partager » si tu veux que ton ou ta partenaire le voie.</p>`)}
    ${sec('Le suivi et les montres', `<p>Onglet Suivi : chaque mesure en Jour, Semaine ou Mois, avec comparaison à la période précédente. Tout peut se saisir à la main (« Saisir ma journée », « + Activité », « + Pesée »). Une saisie à la main remplace les chiffres de la montre pour ce jour-là.</p><p>Garmin : collez votre clé personnelle Garmin Connect dans Plus, puis « Montres et sources » : vos activités arrivent toutes seules. Apple Watch : un raccourci iPhone envoie pas, sommeil et fréquence cardiaque chaque soir.</p>`)}
    ${sec('Les défis et les points', `<p>Jauge du jour à 4 paliers (2 500, 5 000, 7 500, 10 000 pas), marche rapide de 10 ou 20 min, séries de jours à 7 500 pas, défis à deux (20 000 pas par jour, 120 000 par semaine), points du mois et badges.</p><p>Barème : 1 pt par palier de pas · marche rapide 10 min +1, 20 min +2 · séance du programme +3 · respiration +1 · autre activité +2 (2 max par jour) · repas suivi +1 · journal +1 · journée sans alcool +1 · nuit de 7 h +1 · défi du jour à deux +2.</p>`)}
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
  $tabs.innerHTML = TABS.map(([id, l]) => `<button data-tab="${id}" ${S.view === id || (id === 'more' && ['program', 'settings', 'profile', 'account', 'sources', 'journal', 'guide'].includes(S.view)) ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" fill="${id === 'more' ? 'currentColor' : 'none'}" stroke="currentColor">${ICONS[id]}</svg>${l}</button>`).join('');
  $tabs.querySelectorAll('button').forEach((b) => b.onclick = () => go(b.dataset.tab));
}
function go(view) { S.view = view; renderTabs(); render(); window.scrollTo(0, 0); }
async function render() {
  const views = { guide: viewGuide, today: viewToday, meals: viewMeals, journal: viewJournal, defis: viewChallenges, track: viewTrack, more: viewMore, program: viewProgram, settings: viewSettings, profile: viewProfile, account: viewAccount, sources: viewSources };
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
  const [{ data: checks }, { data: meals }, track] = await Promise.all([
    sb.from('checks').select('*').eq('tandem_id', S.me.tandem_id).gte('day', monday).lte('day', sunday),
    sb.from('meals').select('*').eq('tandem_id', S.me.tandem_id).eq('day', d),
    loadTrackData(d, d),
  ]);
  const has = (mid, key, day = d) => (checks || []).some((c) => c.member_id === mid && c.session_key === key && c.day === day);
  const weekTotal = (() => { let n = 0; for (let i = 0; i < 7; i++) n += (planDay(addDays(monday, i))?.sessions || []).filter((s) => s.key !== 'respiration').length; return n; })();
  const doneBy = (mid) => (checks || []).filter((c) => c.member_id === mid && c.session_key !== 'respiration').length;
  const people = [S.me, S.partner].filter(Boolean);
  $app.innerHTML = header(`Bonjour ${S.me.first_name}`, esc(weekLabel(d)), true) + `
  <div class="wrap">
    ${S.partner && !S.partner.user_id ? `<div class="notice row between"><span>${esc(S.partner.first_name)} n'a pas encore rejoint le tandem.</span><button class="btn ghost sm" id="resend">Renvoyer le code</button></div>` : ''}
    ${weekTotal ? `<div class="grid2">${people.map((p) => `<div class="card"><span class="small">${esc(p.first_name)} · ${Math.min(doneBy(p.id), weekTotal)} / ${weekTotal} séances cette semaine</span><div class="bar" style="background:var(--line)"><div style="width:${Math.round(Math.min(1, doneBy(p.id) / weekTotal) * 100)}%;background:${colorHex(p.color)}"></div></div></div>`).join('')}</div>` : ''}
    ${people.length === 2 ? duoBar(`Défi du jour : ${DAILY_DUO_GOAL.toLocaleString('fr-FR')} pas à deux`, DAILY_DUO_GOAL, people.map((p) => track.merged(p.id, d).steps), people) : ''}
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
    <button class="card" style="border:0;text-align:left;cursor:pointer" data-go="journal"><span class="title">Mon journal du jour</span><span class="muted">Alcool, eau, écarts. Privé ou partagé.</span></button>
    <button class="card" style="border:0;text-align:left;cursor:pointer" data-go="defis"><span class="title">Défis et badges</span><span class="muted">Paliers de pas, séries, points du mois.</span></button>
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
        <span class="small muted">${r.minutes ? `${r.minutes} min` : ''}${r.kcal_portion ? ` · ~${r.kcal_portion} kcal` : ''}${r.lunchbox ? ' · gamelle' : ''}${r.is_treat ? ' · plaisir' : ''}${(S.allergenMap[r.id]?.allergens || []).length ? ` · ${(S.allergenMap[r.id].allergens).map((a) => (ALLERGENS.find((x) => x[0] === a) || [a, a])[1].toLowerCase()).join(', ')}` : ''}</span>
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
    <div class="row between" style="align-items:flex-start"><h2>${esc(r?.name)}</h2><button class="btn ghost sm" data-close>Fermer</button></div>
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
  pas: { label: 'Pas', unit: 'pas', key: 'steps', agg: 'mean', total: true, goal: 8000, goalLabel: '8 000', short: (v) => (v >= 1000 ? `${nf(v / 1000, 1)}k` : nf(v)), fmt: (v) => nf(v) },
  etages: { label: 'Étages', unit: 'étages', key: 'floors', agg: 'mean', total: true, goal: 10, goalLabel: '10', short: (v) => nf(v), fmt: (v) => nf(v) },
  activite: { label: 'Activité', unit: 'minutes actives', key: 'act', agg: 'mean', total: true, goal: 30, goalLabel: '30 min', short: (v) => nf(v), fmt: (v) => `${nf(v)} min` },
  distance: { label: 'Distance', unit: 'km en activité', key: 'km', agg: 'sum', goal: null, short: (v) => nf(v, 1), fmt: (v) => `${nf(v, 1)} km` },
  seances: { label: 'Séances', unit: 'séances et activités', key: 'sessions', agg: 'sum', goal: null, short: (v) => nf(v), fmt: (v) => nf(v) },
  sommeil: { label: 'Sommeil', unit: 'heures par nuit', key: 'sleep', agg: 'mean', goal: 7, goalLabel: '7 h', short: (v) => nf(v, 1), fmt: hmFmt },
  fc: { label: 'FC repos', unit: 'bpm', key: 'rhr', agg: 'mean', lowerBetter: true, goal: null, short: (v) => nf(v), fmt: (v) => `${nf(v)} bpm` },
  fcmoy: { label: 'FC moyenne', unit: 'bpm', key: 'hr_avg', agg: 'mean', goal: null, short: (v) => nf(v), fmt: (v) => `${nf(v)} bpm` },
  vfc: { label: 'VFC', unit: 'ms', key: 'hrv', agg: 'mean', goal: null, short: (v) => nf(v), fmt: (v) => `${nf(v)} ms` },
  stress: { label: 'Stress', unit: 'sur 100', key: 'stress', agg: 'mean', lowerBetter: true, goal: null, short: (v) => nf(v), fmt: (v) => nf(v) },
  poids: { label: 'Poids', unit: 'kg', key: 'kg', agg: 'last', lowerBetter: true, goal: null, short: (v) => nf(v, 1), fmt: (v) => `${nf(v, 1)} kg` },
  eau: { label: 'Eau', unit: 'verres par jour', key: 'water', agg: 'mean', total: true, goal: 6, goalLabel: '6 verres', short: (v) => nf(v), fmt: (v) => `${nf(v, 1)} verres` },
  alcool: { label: 'Alcool', unit: 'verres', key: 'drinks', agg: 'sum', lowerBetter: true, goal: null, short: (v) => nf(v), fmt: (v) => `${nf(v)} verre${v > 1 ? 's' : ''}` },
};
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
    <div class="row between"><h1>${title} <button id="syncNow" aria-label="Synchroniser les montres" style="border:0;background:rgba(255,255,255,.18);color:#fff;border-radius:10px;min-width:36px;min-height:36px;font-size:18px;cursor:pointer;vertical-align:middle">↻</button></h1>
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
  document.getElementById('syncNow')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true; e.currentTarget.textContent = '…';
    const r = await syncAll(true);
    toast(r.none ? 'Aucune montre connectée (Plus, puis « Montres et sources »)' : r.errors?.length ? r.errors[0] : r.changed ? 'Données à jour' : 'Déjà à jour');
    viewTrack();
  });
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
  const cell = (fn) => v.map((x) => `<td>${fn(x) ?? '—'}</td>`).join('');
  const hm = (min) => (min == null ? null : hmFmt(min / 60));
  $app.innerHTML = trackHeader('Suivi', esc(cap(fmtDay(d)))) + `<div class="wrap">
    ${people.length === 2 ? duoBar(`Objectif commun : ${nf(DAILY_DUO_GOAL)} pas`, DAILY_DUO_GOAL, v.map((x) => x.steps), people) : ''}
    <div class="card white"><table class="mini"><tr><th></th>${people.map((p) => `<th style="color:${colorHex(p.color)}">${esc(p.first_name)}</th>`).join('')}</tr>
      <tr><td>Pas</td>${cell((x) => (x.steps != null ? nf(x.steps) : null))}</tr>
      <tr><td>Étages</td>${cell((x) => x.floors)}</tr>
      <tr><td>Minutes actives</td>${cell((x) => (x.act != null ? `${x.act} min` : null))}</tr>
      <tr><td>Distance</td>${cell((x) => (x.km != null ? `${nf(x.km, 1)} km` : null))}</tr>
      <tr><td>FC au repos</td>${cell((x) => (x.rhr != null ? `${x.rhr} bpm` : null))}</tr>
      <tr><td>FC moy. / max</td>${cell((x) => (x.hr_avg != null || x.hr_max != null ? `${x.hr_avg ?? '—'} / ${x.hr_max ?? '—'}` : null))}</tr>
      <tr><td>Stress</td>${cell((x) => x.stress)}</tr>
      <tr><td>VFC</td>${cell((x) => (x.hrv != null ? `${x.hrv} ms` : null))}</tr>
      <tr><td>Sommeil</td>${cell((x) => hm(x.sleep_min))}</tr>
      <tr><td>Poids</td>${cell((x) => (x.kg != null ? `${nf(x.kg, 1)} kg` : null))}</tr>
      <tr><td>Eau</td>${cell((x) => (x.water != null ? `${x.water} verre(s)` : null))}</tr>
      <tr><td>Alcool</td>${cell((x) => (x.drinks != null ? `${x.drinks} verre(s)` : null))}</tr>
      <tr><td>Activités</td>${cell((x) => (x.acts.length ? x.acts.map((a) => `${esc(a.type)}${a.duration_min ? ` ${a.duration_min} min` : ''}`).join('<br>') : null))}</tr>
    </table></div>
    <div class="row" style="flex-wrap:wrap"><button class="btn" id="manual">Saisir ma journée</button><button class="btn ghost" id="addAct">+ Activité</button><button class="btn ghost" id="addW">+ Pesée</button></div>
    <span class="small muted">Pas de montre ? Tout se saisit à la main. L'eau et l'alcool se notent dans le Journal.</span>
  </div>`;
  bindTrackNav(1);
}

async function viewTrackWeek(people) {
  const monday = mondayOf(S.day); const sunday = addDays(monday, 6); const prevMon = addDays(monday, -7);
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(monday, i));
  const M = METRICS[S.trackMetric];
  const { merged, acts, weights, checks } = await loadTrackData(prevMon, sunday);
  const cur = people.map((p) => days.map((x) => merged(p.id, x)[M.key]));
  const prev = people.map((p) => days.map((x) => merged(p.id, addDays(x, -7))[M.key]));
  const planned = days.reduce((t, x) => t + (planDay(x)?.sessions || []).filter((s) => s.key !== 'respiration').length, 0);
  const done = (mid) => checks.filter((c) => c.member_id === mid && c.day >= monday && c.session_key !== 'respiration').length;
  const stepsWeek = people.map((p) => sumOf(days.map((x) => merged(p.id, x).steps)));
  const pd = planDay(monday);
  const lastW = (mid) => [...weights].filter((w) => w.member_id === mid && w.kg != null).pop();
  const weekActs = acts.filter((a) => a.start_at >= new Date(`${monday}T00:00:00`).toISOString());
  $app.innerHTML = trackHeader('Suivi', `${pd ? `Semaine ${pd.week} · ` : ''}${fmtDay(monday, { day: 'numeric', month: 'short' })} au ${fmtDay(sunday, { day: 'numeric', month: 'short' })}`) + `<div class="wrap">
    ${metricTabs()}
    <div class="card white">${barChart(people.map((p, i) => ({ color: colorHex(p.color), values: cur[i] })), days, M.fmt, M.goal, M.goalLabel)}
      <div class="row between">${legend(people)}<span class="small muted">${esc(M.unit)}</span></div></div>
    ${statCards(M, people, cur, prev, 'semaine', (p) => (planned ? `<span class="small">Séances du programme : ${Math.min(done(p.id), planned)} / ${planned}</span>` : ''))}
    ${people.length === 2 ? duoBar(`Défi à deux : ${nf(WEEKLY_DUO_GOAL)} pas`, WEEKLY_DUO_GOAL, stepsWeek, people) : ''}
    <div class="row between"><h2>Activités</h2><div class="row"><button class="btn ghost sm" id="manual">Saisir un jour</button><button class="btn ghost sm" id="addAct">+ Activité</button></div></div>
    ${weekActs.map((a) => { const p = people.find((x) => x.id === a.member_id); const mine = a.member_id === S.me.id; return `<${mine ? `button data-act="${a.id}" style="border:0;text-align:left;cursor:pointer"` : 'div'} class="card"><span class="title">${esc(a.type)}${a.source !== 'manuel' ? ` <span class="pill">${esc({ garmin: 'Garmin', apple: 'Apple' }[a.source] || a.source)}</span>` : ''}</span><span class="muted">${esc(p?.first_name)} · ${esc(fmtDay(iso(new Date(a.start_at)), { weekday: 'short', day: 'numeric' }))}${a.duration_min ? ` · ${a.duration_min} min` : ''}${a.distance_km ? ` · ${nf(a.distance_km, 1)} km` : ''}${a.hr_avg ? ` · FC ${a.hr_avg}` : ''}${a.kcal ? ` · ${a.kcal} kcal` : ''}</span>${a.note ? `<span class="small">${esc(a.note)}</span>` : ''}</${mine ? 'button' : 'div'}>`; }).join('') || '<span class="muted">Aucune activité cette semaine.</span>'}
    <div class="row between"><h2>Poids</h2><div class="row"><button class="btn ghost sm" id="histW">Historique</button><button class="btn ghost sm" id="addW">+ Pesée</button></div></div>
    <div class="grid2">${people.map((p) => { const w = lastW(p.id); const diff = w && p.start_weight ? (w.kg - p.start_weight) : null; return `<div class="card stat"><span class="small" style="color:${colorHex(p.color)};font-weight:600">${esc(p.first_name)}</span><b>${w ? `${nf(w.kg, 1)} kg` : '—'}</b><span class="muted small">${diff != null ? `${diff > 0 ? '+' : ''}${nf(diff, 1)} kg depuis le départ` : ''}${p.goal_weight ? ` · objectif ${nf(p.goal_weight, 1)}` : ''}</span></div>`; }).join('')}</div>
  </div>`;
  bindTrackNav(7);
  $app.querySelectorAll('[data-act]').forEach((el) => el.onclick = () => activityForm(weekActs.find((x) => x.id === el.dataset.act), S.day));
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
  openModal(`<div class="row between"><h2>Ma journée</h2><button class="btn ghost sm" data-close>Fermer</button></div>
    <span class="muted">Ce que tu saisis ici remplace les chiffres de la montre pour ce jour-là.</span>
    <form id="m" style="display:flex;flex-direction:column;gap:10px" novalidate>
      <label>Jour<input name="day" type="date" value="${day}"></label>
      <div class="grid2">
        <label>Pas<input name="steps" inputmode="numeric" value="${esc(m.steps)}"></label>
        <label>Étages<input name="floors" inputmode="numeric" value="${esc(m.floors)}"></label>
        <label>Sommeil (h)<input name="sleep_h" inputmode="decimal" value="${m.sleep_min != null ? (m.sleep_min / 60).toFixed(1).replace('.', ',') : ''}"></label>
        <label>Minutes actives<input name="active_min" inputmode="numeric" value="${esc(m.active_min)}"></label>
        <label>FC au repos<input name="rhr" inputmode="numeric" value="${esc(m.rhr)}"></label>
        <label>FC moyenne<input name="hr_avg" inputmode="numeric" value="${esc(m.hr_avg)}"></label>
        <label>FC max<input name="hr_max" inputmode="numeric" value="${esc(m.hr_max)}"></label>
        <label>Stress (0–100)<input name="stress" inputmode="numeric" value="${esc(m.stress)}"></label>
        <label>VFC (ms)<input name="hrv" inputmode="numeric" value="${esc(m.hrv)}"></label>
      </div>
      <p class="err" id="merr" role="alert" style="margin:0"></p>
      <button class="btn block">Enregistrer</button>
    </form>`, (root) => root.querySelector('#m').onsubmit = async (e) => {
    e.preventDefault(); const v = formData(e.target); const $e = root.querySelector('#merr');
    const sleep = num(v.sleep_h);
    const rules = [[int(v.steps), 0, 200000, 'Pas'], [int(v.floors), 0, 2000, 'Étages'], [sleep, 0, 24, 'Sommeil'], [int(v.rhr), 25, 200, 'FC au repos'], [int(v.hr_avg), 25, 230, 'FC moyenne'], [int(v.hr_max), 25, 240, 'FC max'], [int(v.stress), 0, 100, 'Stress'], [int(v.hrv), 1, 400, 'VFC'], [int(v.active_min), 0, 1440, 'Minutes actives']];
    for (const [val, lo, hi, l] of rules) if (val != null && (Number.isNaN(val) || val < lo || val > hi)) return ($e.textContent = `${l} : valeur entre ${lo} et ${nf(hi)}.`);
    const { error } = await sb.from('daily_metrics').upsert({
      member_id: S.me.id, tandem_id: S.me.tandem_id, day: v.day || day, source: 'manuel',
      steps: int(v.steps), floors: int(v.floors), rhr: int(v.rhr), hr_avg: int(v.hr_avg), hr_max: int(v.hr_max), stress: int(v.stress), hrv: int(v.hrv), active_min: int(v.active_min),
      sleep_min: sleep != null ? Math.round(sleep * 60) : null, updated_at: new Date().toISOString(),
    });
    if (error) return ($e.textContent = `Enregistrement impossible : ${error.message}`);
    closeModal(); toast('Journée enregistrée'); render();
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
    sb.from('meals').select('day,member_id,status').eq('tandem_id', S.me.tandem_id).gte('day', from).lte('day', end),
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

const ACT_TYPES = ['Vélo d\'appartement', 'Marche', 'Course', 'Renfo', 'Kettlebell', 'TRX', 'Respiration', 'Étirements', 'Yoga', 'Natation', 'Vélo dehors', 'Randonnée', 'Autre'];
function activityForm(a, day) {
  const isNew = !a;
  const start = a ? new Date(a.start_at) : null;
  const date = a ? iso(start) : day;
  const time = a ? `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}` : '18:00';
  const known = !a || ACT_TYPES.includes(a.type);
  openModal(`
    <div class="row between"><h2>${isNew ? 'Nouvelle activité' : 'Modifier l\'activité'}</h2><button class="btn ghost sm" data-close>Fermer</button></div>
    <form id="a" style="display:flex;flex-direction:column;gap:12px" novalidate>
      <label>Type<select name="type">${ACT_TYPES.map((t) => `<option ${(a?.type === t || (!known && t === 'Autre')) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <label>Précision (facultatif)<input name="label" value="${esc(known ? '' : a.type)}" placeholder="ex. sortie longue, circuit jambes"></label>
      <div class="grid2"><label>Date<input name="date" type="date" value="${date}"></label><label>Heure<input name="time" type="time" value="${time}"></label></div>
      <div class="grid2"><label>Durée (min)<input name="duration" inputmode="numeric" value="${esc(a?.duration_min)}"></label><label>Distance (km)<input name="distance" inputmode="decimal" value="${esc(a?.distance_km)}"></label></div>
      <div class="grid2"><label>FC moyenne<input name="hr" inputmode="numeric" value="${esc(a?.hr_avg)}"></label><label>FC max<input name="hrmax" inputmode="numeric" value="${esc(a?.hr_max)}"></label></div>
      <div class="grid2"><label>Calories<input name="kcal" inputmode="numeric" value="${esc(a?.kcal)}"></label>
      <label>Ressenti<select name="feeling"><option value="">—</option>${[[1, '1 · très dur'], [2, '2 · dur'], [3, '3 · correct'], [4, '4 · bien'], [5, '5 · super']].map(([n, l]) => `<option value="${n}" ${a?.feeling === n ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <label>Note<textarea name="note">${esc(a?.note)}</textarea></label>
      <p class="err" id="aerr" role="alert" style="margin:0"></p>
      <button class="btn">${isNew ? 'Ajouter' : 'Enregistrer'}</button>
      ${isNew ? '' : '<button type="button" class="btn ghost" id="delAct" style="color:var(--danger)">Supprimer cette activité</button>'}
    </form>`, (root) => {
    root.querySelector('#a').onsubmit = async (e) => {
      e.preventDefault(); const v = formData(e.target); const $e = root.querySelector('#aerr');
      if (!v.date) return ($e.textContent = 'Indique la date.');
      const dur = int(v.duration);
      if (dur != null && (dur < 0 || dur > 1440)) return ($e.textContent = 'Durée entre 0 et 1440 minutes.');
      const startAt = new Date(`${v.date}T${v.time || '12:00'}:00`);
      const row = {
        type: (v.label.trim() || v.type).slice(0, 60), start_at: startAt.toISOString(),
        duration_min: dur, distance_km: num(v.distance), hr_avg: int(v.hr), hr_max: int(v.hrmax), kcal: int(v.kcal),
        feeling: int(v.feeling), note: v.note.trim() || null,
      };
      const { error } = isNew
        ? await sb.from('activities').insert({ ...row, member_id: S.me.id, tandem_id: S.me.tandem_id, source: 'manuel' })
        : await sb.from('activities').update(row).eq('id', a.id);
      if (error) return ($e.textContent = `Enregistrement impossible : ${error.message}`);
      closeModal(); viewTrack();
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
  openModal(`<div class="row between"><h2>Mes pesées</h2><button class="btn ghost sm" data-close>Fermer</button></div>
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
    ${[['guide', 'Guide de l\'appli', 'Tuto, visite guidée, FAQ et retours bêta'], ['journal', 'Journal', 'Alcool, eau, écarts du jour'], ['program', 'Programme', 'Les séances semaine par semaine'], ['settings', 'Matériel et programme', isCaptain() ? 'Réglages du capitaine' : 'Consultation et suggestions'], ['profile', 'Mon profil', 'Couleur, santé, alimentation'], ['sources', 'Montres et sources', 'Garmin, Apple Watch, saisie manuelle'], ['account', 'Mon compte', 'Export, déconnexion, suppression']]
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
    <details class="card" ${S.plan ? '' : 'open'}><summary class="title" style="cursor:pointer">Comment ça marche ?</summary>
      <ul class="plain small" style="margin-top:8px">
        <li><b>Matériel</b> : coche tout ce que vous avez à la maison. Le programme ne propose que des exercices faisables avec ce matériel (ou au poids du corps).</li>
        <li><b>Durée</b> : de 2 à 12 semaines. Les séances deviennent un peu plus longues et plus intenses au fil des semaines.</li>
        <li><b>Début</b> : toujours un lundi.</li>
        <li><b>Course</b> : si « Course dehors » est cochée, choisis la semaine où elle reprend. Avant, le samedi reste une grande balade.</li>
        <li><b>Santé</b> : les zones fragiles de chacun (dans « Mon profil ») retirent les exercices à risque, pour lui ou elle seulement.</li>
        <li>Tu peux <b>régénérer</b> le programme à tout moment : les séances déjà cochées restent enregistrées.</li>
      </ul></details>
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
  const r = await syncAll(false);
  if (r.changed && $modal.hidden && !document.getElementById('tour')) { if (r.added) toast(`${r.added} nouvelle(s) activité(s) importée(s)`); render(); }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.me?.onboarded_at && S.session) autoSync().catch(() => {}); });

async function viewSources(newToken = '') {
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
      <span class="muted small">Apple ne permet pas aux sites web de lire Santé. On passe par l'app gratuite à télécharger <b>Health Auto Export</b> : elle envoie tes données à Tandem Forme en arrière-plan, avec ta clé personnelle.</span>
      ${apple?.last_sync ? `<span class="small">Dernier envoi : ${esc(since(apple.last_sync))}</span>` : ''}
      ${newToken ? `
        <div class="notice"><b>Ta clé Apple Santé</b> : c'est une adresse à coller dans Health Auto Export. Copie-la maintenant, elle ne sera plus affichée.
          <div style="font-family:monospace;word-break:break-all;margin:6px 0;font-size:12px">${esc(appleUrl)}</div>
          <button class="btn sm" id="copyUrl">Copier ma clé</button></div>
        <ol class="steps small">
          <li>Installe <a href="https://apps.apple.com/app/id1115567069" target="_blank" rel="noopener">Health Auto Export</a> et autorise l'accès à Santé.</li>
          <li>Onglet <b>Automations</b>, <b>+</b>, type <b>REST API</b>.</li>
          <li><b>URL</b> : colle ta clé. Format <b>JSON</b>, version <b>2</b>.</li>
          <li><b>Data Type</b> : Health Metrics et Workouts. Métriques : Step Count, Flights Climbed, Resting Heart Rate, Heart Rate Variability, Heart Rate, Apple Exercise Time, Sleep Analysis.</li>
          <li><b>Période</b> : « Since last sync », <b>Aggregation</b> : Days. Active l'automatisation.</li>
          <li>Touche <b>Manual Export</b> une fois : l'appli doit afficher « Connecté ».</li>
        </ol>
        <span class="small muted">L'envoi automatique en arrière-plan demande l'option Premium de Health Auto Export (achat dans l'app). Sans elle, tu peux faire l'envoi à la main depuis l'app, ou tout saisir dans Suivi.</span>` : `
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

// Notifications Tandem Forme : rappels programmés (horloge toutes les heures),
// alerte « séance terminée » au partenaire, et notification de test.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { newVapid, sendPush } from './webpush.ts';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const DUO_GOAL = 20000;
const DEFAULT = { seance: true, seance_hour: 18, repas: true, partenaire: true, duo: true, pesee: true, bilan: true };
const nf = (n: number) => Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ');

// Heure de Paris
function paris(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, wd: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) };
}
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

let VAPID: any = null;
async function vapid() {
  if (VAPID) return VAPID;
  let { data } = await sb.rpc('app_secret_get', { k: 'vapid' });
  if (!data) ({ data } = await sb.rpc('app_secret_init', { k: 'vapid', v: JSON.stringify(await newVapid()) }));
  VAPID = JSON.parse(data); return VAPID;
}

// Envoie à tous les appareils d'un membre. Avec kind/ref, une seule fois par membre.
async function notify(memberId: string, msg: { title: string; body: string; url?: string; tag?: string }, kind?: string, ref?: string) {
  if (kind) {
    const { error } = await sb.from('notif_log').insert({ member_id: memberId, kind, ref });
    if (error) return 0; // déjà envoyé
  }
  const { data: subs } = await sb.from('push_subscriptions').select('*').eq('member_id', memberId);
  let ok = 0;
  for (const s of subs || []) {
    try {
      const st = await sendPush(s, { url: '/', ...msg }, await vapid());
      if (st === 404 || st === 410) await sb.from('push_subscriptions').delete().eq('id', s.id);
      else if (st < 300) { ok++; await sb.from('push_subscriptions').update({ last_ok_at: new Date().toISOString() }).eq('id', s.id); }
      else console.log('push refusé', st, new URL(s.endpoint).host);
    } catch (e) { console.log('push erreur', String(e)); }
  }
  return ok;
}

const forOf = (s: any, all: string[]) => s.for || all;
const countable = (s: any) => s.key !== 'respiration' && !s.optional;

async function tick() {
  const now = paris();
  const { data: subs } = await sb.from('push_subscriptions').select('member_id');
  const ids = [...new Set((subs || []).map((s) => s.member_id))];
  if (!ids.length) return { sent: 0 };
  const { data: mine } = await sb.from('members').select('id,tandem_id,first_name,notif').in('id', ids);
  const tids = [...new Set((mine || []).map((m) => m.tandem_id))];
  const monday = addDays(now.day, -now.wd);
  const [{ data: all }, { data: plans }, { data: checks }, { data: meals }, { data: metrics }, { data: weights }] = await Promise.all([
    sb.from('members').select('id,tandem_id,first_name').in('tandem_id', tids),
    sb.from('plans').select('tandem_id,data,created_at').in('tandem_id', tids).eq('active', true).order('created_at', { ascending: false }),
    sb.from('checks').select('member_id,day,session_key').in('tandem_id', tids).gte('day', monday),
    sb.from('meals').select('tandem_id,member_id,slot').in('tandem_id', tids).eq('day', now.day),
    sb.from('daily_metrics').select('member_id,day,source,steps').in('tandem_id', tids).gte('day', monday),
    sb.from('weights').select('member_id').in('tandem_id', tids).eq('day', now.day),
  ]);
  const planOf = (t: string) => (plans || []).find((p) => p.tandem_id === t)?.data;
  const steps = (mid: string, day: string) => {
    const rows = (metrics || []).filter((r) => r.member_id === mid && r.day === day && r.steps != null);
    const man = rows.find((r) => r.source === 'manuel'); return man ? man.steps : Math.max(0, ...rows.map((r) => r.steps));
  };
  const done = (mid: string, day: string, key: string) => (checks || []).some((c) => c.member_id === mid && c.day === day && c.session_key === key);
  let sent = 0;
  for (const m of mine || []) {
    const p = { ...DEFAULT, ...(m.notif || {}) };
    const team = (all || []).filter((x) => x.tandem_id === m.tandem_id);
    const ids2 = team.map((x) => x.id);
    const partner = team.find((x) => x.id !== m.id);
    const plan = planOf(m.tandem_id);
    // Séance du jour
    if (p.seance && now.hour === Number(p.seance_hour)) {
      const todo = (plan?.days?.[now.day]?.sessions || []).filter((s: any) => countable(s) && forOf(s, ids2).includes(m.id) && !done(m.id, now.day, s.key));
      if (todo.length) sent += await notify(m.id, { title: 'C\'est l\'heure de bouger 💪', body: `Au programme : ${todo.map((s: any) => `${s.title}${s.minutes ? ` (${s.minutes} min)` : ''}`).join(', ')}. On y va ?`, tag: 'seance' }, 'seance', now.day);
    }
    // Repas
    if (p.repas && now.hour === 10) {
      const has = (slot: string) => (meals || []).some((x) => x.tandem_id === m.tandem_id && x.slot === slot && (x.member_id === null || x.member_id === m.id));
      const miss = ['midi', 'soir'].filter((s) => !has(s));
      if (miss.length) sent += await notify(m.id, { title: 'On mange quoi aujourd\'hui ? 🥗', body: miss.length === 2 ? 'Le midi et le soir ne sont pas encore choisis. Une idée en un clic dans Repas.' : `Le repas du ${miss[0]} n'est pas encore choisi.`, url: '/?go=meals', tag: 'repas' }, 'repas', now.day);
    }
    // Défi duo des pas
    if (p.duo && partner && now.hour === 20) {
      const a = steps(m.id, now.day); const b = steps(partner.id, now.day); const tot = a + b;
      if (tot > 0 && tot < DUO_GOAL) sent += await notify(m.id, { title: 'Défi du jour à deux 👟', body: `Vous êtes à ${nf(tot)} pas (toi ${nf(a)}, ${partner.first_name} ${nf(b)}). Encore ${nf(DUO_GOAL - tot)} : une petite marche ensemble ?`, url: '/?go=defis', tag: 'duo' }, 'duo', now.day);
    }
    // Pesée du lundi
    if (p.pesee && now.wd === 0 && now.hour === 8 && !(weights || []).some((w) => w.member_id === m.id))
      sent += await notify(m.id, { title: 'Jour de pesée ⚖️', body: 'Le matin à jeun, après être passé aux toilettes : c\'est la mesure la plus fiable. À noter dans Suivi.', url: '/?go=track', tag: 'pesee' }, 'pesee', now.day);
    // Bilan du dimanche
    if (p.bilan && now.wd === 6 && now.hour === 19) {
      const line = (x: any) => {
        let planned = 0, ok = 0;
        for (let i = 0; i < 7; i++) { const d = addDays(monday, i); for (const s of plan?.days?.[d]?.sessions || []) if (countable(s) && forOf(s, ids2).includes(x.id)) { planned++; if (done(x.id, d, s.key)) ok++; } }
        return { ok, planned, steps: [0, 1, 2, 3, 4, 5, 6].reduce((t, i) => t + steps(x.id, addDays(monday, i)), 0) };
      };
      const me = line(m); const pa = partner ? line(partner) : null;
      const body = `Séances : toi ${me.ok}/${me.planned}${pa ? `, ${partner!.first_name} ${pa.ok}/${pa.planned}` : ''}. Pas : ${nf(me.steps + (pa?.steps || 0))}${pa ? ' à deux' : ''}. ${me.ok >= me.planned && me.planned ? 'Semaine parfaite, bravo !' : 'Nouvelle semaine demain, on repart !'}`;
      sent += await notify(m.id, { title: 'Le bilan de la semaine 📊', body, url: '/?go=track', tag: 'bilan' }, 'bilan', now.day);
    }
  }
  return { sent, hour: now.hour };
}

// Une séance vient d'être cochée : on prévient le partenaire.
async function sessionDone(memberId: string, day: string, key: string) {
  const now = paris();
  if (day !== now.day || key === 'respiration') return { sent: 0 };
  const { data: m } = await sb.from('members').select('id,tandem_id,first_name').eq('id', memberId).maybeSingle();
  if (!m) return { sent: 0 };
  const { data: team } = await sb.from('members').select('id,first_name,notif').eq('tandem_id', m.tandem_id);
  const { data: plan } = await sb.from('plans').select('data').eq('tandem_id', m.tandem_id).eq('active', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const sessions = plan?.data?.days?.[day]?.sessions || [];
  const s = sessions.find((x: any) => x.key === key);
  let sent = 0;
  for (const p of (team || []).filter((x) => x.id !== m.id)) {
    if (!({ ...DEFAULT, ...(p.notif || {}) }).partenaire) continue;
    const { data: mineDone } = await sb.from('checks').select('session_key').eq('member_id', p.id).eq('day', day);
    const left = sessions.filter((x: any) => countable(x) && (x.for || [p.id]).includes(p.id) && !(mineDone || []).some((c) => c.session_key === x.key));
    sent += await notify(p.id, { title: `${m.first_name} a terminé sa séance 🎉`, body: `${s?.title || 'Séance'} : c'est fait !${left.length ? ` À ton tour : ${left[0].title}.` : ' Pense à l\'encourager.'}`, tag: `done-${m.id}` }, 'partenaire', `${day}:${key}:${m.id}`);
  }
  return { sent };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let body: any = {}; try { body = await req.json(); } catch { /* vide */ }
  const action = body.action;
  try {
    if (action === 'vapid') return json({ publicKey: (await vapid()).publicKey });
    if (action === 'tick' || action === 'done') {
      const { data: secret } = await sb.rpc('app_secret_get', { k: 'cron' });
      if (!secret || req.headers.get('x-cron') !== secret) return json({ error: 'interdit' }, 403);
      return json(action === 'tick' ? await tick() : await sessionDone(body.member_id, body.day, body.session_key));
    }
    if (action === 'test') {
      const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      const { data: u } = await sb.auth.getUser(token);
      if (!u?.user) return json({ error: 'non connecté' }, 401);
      const { data: m } = await sb.from('members').select('id,first_name').eq('user_id', u.user.id).maybeSingle();
      if (!m) return json({ error: 'membre inconnu' }, 404);
      const n = await notify(m.id, { title: 'Notifications activées ✅', body: `Parfait ${m.first_name}, tu recevras tes rappels ici.`, tag: 'test' });
      return json({ sent: n });
    }
    return json({ error: 'action inconnue' }, 400);
  } catch (e) {
    console.log('erreur', String(e)); return json({ error: 'erreur serveur' }, 500);
  }
});

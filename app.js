// Nepali Passport Help Desk — customer chat + agent inbox.
// Runs in DEMO MODE until firebase-config.js is filled in (see SETUP.md).
import { firebaseConfig } from './firebase-config.js';
import { FAQ, CONTACTS } from './data.js';

const FIREBASE_VERSION = '13.2.0';
const TEAM = 'Help desk team';
const JOINED = 'टिमका सदस्य जोडिनुभयो / A help desk team member has joined your chat';

/* ---------------- small helpers ---------------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const time = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const clean = o => JSON.parse(JSON.stringify(o)); // Firestore rejects undefined values
const newCase = () => { const d = new Date(); return 'NP-' + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(); };

function inl(s) {
  return esc(s)
    .replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener">${/script\.google\.com/.test(u) ? '✅ Payment status list ↗' : u.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>`)
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+\w/g, m => `<span class="nw">${m}</span>`)
    .replace(/\+\d[\d ()\-]{7,}\d/g, m => `<span class="tel">${m}</span>`);
}
// Turns plain answer text into tidy HTML: "• item" lists, "Heading:" lines, ⚠️ notes, links.
function fmt(t) {
  const L = String(t ?? '').split('\n'); let o = '', ul = false, first = true;
  const close = () => { if (ul) { o += '</ul>'; ul = false } };
  for (const raw of L) {
    const l = raw.trim();
    if (!l) { close(); continue }
    if (/^[•\-*]\s*/.test(l)) {
      if (!ul) { o += '<ul>'; ul = true }
      const body = l.replace(/^[•\-*]\s*/, ''); const [a, b] = body.split(' — ');
      o += b !== undefined ? `<li class="kv"><span>${inl(a)}</span><span>${inl(b)}</span></li>` : `<li>${inl(body)}</li>`;
      first = false; continue;
    }
    close();
    if (/^⚠️/.test(l)) o += `<div class="warn">${inl(l)}</div>`;
    else if (/:$/.test(l) && l.length < 60) o += `<div class="h">${inl(l.slice(0, -1))}</div>`;
    else if (first && L.length > 3 && l.length < 60 && !/[।.?!]$/.test(l)) o += `<div class="ttl">${inl(l)}</div>`;
    else o += `<p>${inl(l)}</p>`;
    first = false;
  }
  close(); return o;
}

/* ---------------- keyword matcher ---------------- */
const STOP = new Set(('a an the is are am was i you we they my your our me us to of for in on at do does did can could would will how what when where which who why it its this that be with and or please hi hello hey there any have has get want need know tell about namaste dhanyabad thanks thank ' +
  'ma mero hamro ho cha xa chha ke ko ka ki le lai ra pani garna garne huncha hunchha sir dai didi ' +
  'म मेरो हाम्रो हो छ छन् के को का की मा ले लाई र पनि गर्न गर्ने हुन्छ हुन्छन् हजुर नमस्ते धन्यवाद दाइ दिदी').split(' '));
// Words that appear in almost every question; they never decide the answer on their own.
const GENERIC = new Set('passport passports rahadani rahadhani राहदानी nepal nepali नेपाल नेपाली poland पोल्याण्ड'.split(' '));
const stem = w => /^[a-z]+$/.test(w) && w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w;
const words = t => [...new Set(String(t).toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w && !STOP.has(w)).map(stem))];

function answerFor(text) {
  const t = text.trim().toLowerCase();
  const Q = words(text);
  const GREET = /^(hi+|hii+|hello+|helo+|hlo+|hey+|heya|hy|hyy|namaste|namaskar|नमस्ते|नमस्कार|good|morning|evening|afternoon|dai|didi|bhai|sir|madam|ji|there|all|everyone|ko|cha|xa|k)$/;
  const tokens = t.replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (tokens.length && tokens.length <= 5 && tokens.every(w => GREET.test(w)))
    return 'नमस्ते! आज राहदानी नवीकरण सम्बन्धी के मद्दत गरौँ?\n\nHello! How can we help you regarding passport renewal today?';
  if (!Q.length) {
    if (/(thank|dhanyabad|धन्यवाद)/.test(t)) return 'धन्यवाद! अरू केही सोध्नु छ? / You are welcome! Anything else?';
    if (/(hi|hello|hey|namaste|नमस्ते|good (morning|evening|afternoon))/.test(t)) return 'नमस्ते! आज राहदानी नवीकरण सम्बन्धी के मद्दत गरौँ?\n\nHello! How can we help you regarding passport renewal today?';
    return null;
  }
  let best = null, score = 0, bh = 0;
  const QQ = Q.filter(w => !GENERIC.has(w));
  if (!QQ.length) return 'राहदानीको कुन विषयमा जान्न चाहनुहुन्छ? / What would you like to know about the passport?\n• शिविर कहिले / Camp date\n• दस्तुर / Fees\n• कागजात / Documents\n• अनलाइन फाराम / How to apply online\n• पैसा पुग्यो कि पुगेन / Payment check\n• सम्पर्क नम्बर / Contact numbers\nतपाईंको प्रश्न लेख्नुहोस्। / Type your question.';
  for (const f of faqs) {
    const F = new Set(words(f.q + ' ' + (f.k || '')));
    const hit = QQ.filter(w => F.has(w)).length;
    const s = hit + hit / QQ.length;
    if (hit && s > score) { score = s; best = f; bh = hit }
  }
  return best && (bh >= 2 || bh / QQ.length >= 0.5) ? best.a : null;
}

/* ---------------- backends: Firebase (live) or in-memory (demo) ---------------- */
async function firebaseBackend(cfg) {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
  const [{ initializeApp }, A, F] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
  const app = initializeApp(cfg), auth = A.getAuth(app), db = F.getFirestore(app);
  const chatRef = id => F.doc(db, 'chats', id);
  return {
    live: true,
    onAuth: cb => A.onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, anon: u.isAnonymous } : null)),
    signInCustomer: () => A.signInAnonymously(auth),
    login: (e, p) => A.signInWithEmailAndPassword(auth, e, p),
    logout: () => A.signOut(auth),
    getAgent: async uid => { const d = await F.getDoc(F.doc(db, 'agents', uid)); return d.exists() ? d.data() : null },
    watchAgents: (cb, err) => F.onSnapshot(F.collection(db, 'agents'), s => { const o = {}; s.forEach(d => o[d.id] = d.data()); cb(o) }, err),
    watchMyChat: (uid, cb, err) => F.onSnapshot(chatRef(uid), d => cb(d.exists() ? { ...d.data(), id: d.id } : null), err),
    watchChats: (cb, err) => F.onSnapshot(F.collection(db, 'chats'), s => { const o = {}; s.forEach(d => o[d.id] = { ...d.data(), id: d.id }); cb(o) }, err),
    saveChat: c => { const { id, ...rest } = c; return F.setDoc(chatRef(id), clean(rest)) },
    // Atomic: only one agent can take a case, even if two click at the same moment.
    assign: (id, to, force, sysText) => F.runTransaction(db, async t => {
      const r = chatRef(id), d = await t.get(r); if (!d.exists()) return { ok: false };
      const c = d.data();
      if (to && c.assignee && c.assignee !== to && !force) return { ok: false, by: c.assignee };
      const now = Date.now();
      t.update(r, { assignee: to, status: c.status === 'closed' ? 'closed' : (to ? 'human' : 'waiting'), updated: now, msgs: [...(c.msgs || []), { from: 'sys', text: sysText, t: now }] });
      return { ok: true };
    }),
    watchFaq: (cb, err) => F.onSnapshot(F.collection(db, 'faq'), s => { const a = []; s.forEach(d => a.push({ ...d.data(), id: d.id })); cb(a) }, err),
    saveFaq: f => { const { id, ...r } = f; return F.setDoc(F.doc(db, 'faq', id), clean(r)) },
  };
}

function demoBackend() {
  const chats = {}, faqDocs = [], subs = { chats: new Set(), my: new Map(), faq: new Set(), auth: new Set() };
  let user = null;
  const emit = () => { const all = structuredClone(chats); subs.chats.forEach(cb => cb(all)); subs.my.forEach((cb, uid) => cb(chats[uid] ? structuredClone(chats[uid]) : null)); };
  const setUser = u => { user = u; subs.auth.forEach(cb => cb(u)); };
  return {
    live: false,
    onAuth: cb => { subs.auth.add(cb); setTimeout(() => cb(user), 0) },
    signInCustomer: async () => setUser({ uid: 'demo-customer', anon: true }),
    login: async () => setUser({ uid: 'demo-agent', anon: false }),
    logout: async () => setUser(null),
    getAgent: async uid => uid === 'demo-agent' ? { name: 'Demo agent' } : null,
    watchAgents: cb => cb({ 'demo-agent': { name: 'Demo agent' } }),
    watchMyChat: (uid, cb) => { subs.my.set(uid, cb); cb(chats[uid] ? structuredClone(chats[uid]) : null); return () => subs.my.delete(uid) },
    watchChats: cb => { subs.chats.add(cb); cb(structuredClone(chats)); return () => subs.chats.delete(cb) },
    saveChat: async c => { chats[c.id] = clean(c); emit() },
    assign: async (id, to, force, sysText) => {
      const c = chats[id]; if (!c) return { ok: false };
      if (to && c.assignee && c.assignee !== to && !force) return { ok: false, by: c.assignee };
      const now = Date.now(); c.assignee = to; if (c.status !== 'closed') c.status = to ? 'human' : 'waiting'; c.updated = now; c.msgs.push({ from: 'sys', text: sysText, t: now }); emit(); return { ok: true };
    },
    watchFaq: cb => { subs.faq.add(cb); cb(faqDocs.slice()) },
    saveFaq: async f => { const i = faqDocs.findIndex(x => x.id === f.id); if (i >= 0) faqDocs[i] = f; else faqDocs.push(f); subs.faq.forEach(cb => cb(faqDocs.slice())) },
  };
}

/* ---------------- state ---------------- */
let be, me = null, agent = null, agents = {};
let faqDocs = [], faqs = FAQ.slice();
let myChat = null, chats = {}, arch = {}, sel = null, filter = 'basket', editing = null, takeoverArm = null;
let unsubMy = null, unsubChats = null, unsubAgents = null;

function mergeFaq() {
  const over = Object.fromEntries(faqDocs.map(d => [d.id, d]));
  faqs = FAQ.filter(f => !over[f.id]).concat(faqDocs.filter(d => !d.deleted && d.q && d.a));
  renderFaq(); renderChips();
}
function flash(t) { const m = $('#mode'); m.textContent = t; m.classList.remove('quiet'); clearTimeout(flash.t); flash.t = setTimeout(() => m.classList.add('quiet'), 5000) }
function showErr(e) { console.error(e); flash('Could not save. Check your connection and try again.' + (e && e.code ? ' (' + e.code + ')' : '')) }

/* ---------------- customer chat ---------------- */
function getMyChat() {
  if (!myChat) myChat = { id: me.uid, case: newCase(), name: '', status: 'bot', assignee: null, updated: Date.now(), msgs: [] };
  if (!myChat.case) myChat.case = newCase();
  return myChat;
}
async function saveMy(c) { myChat = c; renderCust(); try { await be.saveChat(c) } catch (e) { showErr(e) } }

function renderChips() {
  const ms = myChat ? myChat.msgs : [];
  $('#chips').hidden = !!ms.length;
  $('#chips').innerHTML = ['a1-camp', 'a3-fees', 'a4-documents', 'b1-apply', 'c1-paycheck', 'b8-contact'].map(id => faqs.find(f => f.id === id)).filter(Boolean)
    .map(f => `<button type="button" class="chip">${esc(f.q)}</button>`).join('');
}
function formCard(c) {
  const it = c.intake || {};
  return `<form class="formcard" id="intakeForm">
    <b>टिमलाई पठाउनुहोस् / Send your case to our team</b>
    <p>केस ${esc(c.case)} · Please fill this in. A team member will reply here in this chat.</p>
    <div class="row2"><label>पूरा नाम / Full name<input name="name" required maxlength="120" value="${esc(it.name || '')}"></label>
    <label>शहर / City in Poland<input name="city" required maxlength="80" value="${esc(it.city || '')}"></label></div>
    <label>फोन वा इमेल / Phone or email<input name="contact" required maxlength="120" value="${esc(it.contact || '')}"></label>
    <label>समस्या / Your problem<textarea name="issue" required maxlength="1000">${esc(it.issue || c.lastQ || '')}</textarea></label>
    <p>⚠️ राहदानी नम्बर, बैंक विवरण वा पासवर्ड नलेख्नुहोस्। / Don't write passport numbers, bank details or passwords.</p>
    <div class="acts"><button type="button" class="ghost" id="intakeCancel">Cancel</button><button class="go">पठाउनुहोस् / Send to team</button></div>
  </form>`;
}
function renderCust() {
  const c = myChat, ms = c ? c.msgs : [];
  const greet = `<div class="m bot fmt"><small>Help desk</small><p>नमस्ते! पोल्याण्डमा नेपाली राहदानी नवीकरण सम्बन्धी प्रश्न सोध्नुहोस् — नेपाली वा English मा।</p><p>Hi! Ask anything about Nepali passport renewal in Poland. If I can't answer, a team member will help you right here.</p></div>`;
  let h = greet + ms.map(m => m.from === 'sys' ? `<div class="m sys">${esc(m.text)}</div>` :
    `<div class="m ${m.from === 'customer' ? 'me' : m.from + ' fmt'}"><small>${m.from === 'customer' ? 'You' : m.from === 'bot' ? 'Help desk' : TEAM} · ${time(m.t)}</small>${m.from === 'customer' ? esc(m.text) : fmt(m.text)}</div>`).join('');
  if (c && c.showForm && c.status === 'bot') h += formCard(c);
  $('#cmsgs').innerHTML = h;
  $('#cmsgs').scrollTop = 1e9;
  const closed = !!(c && c.status === 'closed');
  $('#cstatus').textContent = (c && ms.length ? 'Case ' + c.case + ' · ' : '') + (!c || c.status === 'bot' ? 'Instant answers · a team member steps in if needed' :
    c.status === 'waiting' ? 'Sent to the team · they will reply here' : c.status === 'human' ? 'A team member is handling your case' : 'Case closed · start a new case for a new question');
  $('#fb').hidden = !(closed && c.resolvedAt && !c.feedback);
  $('#cform').hidden = closed; $('#newc').hidden = !closed;
  $('#talk').hidden = !(!c || c.status === 'bot') || !!(c && c.showForm);
  renderChips();
}
function openForm() { const c = structuredClone(getMyChat()); c.showForm = true; myChat = c; renderCust(); const f = $('#intakeForm input'); if (f) f.focus() }

$('#cmsgs').addEventListener('submit', async e => {
  if (e.target.id !== 'intakeForm') return;
  e.preventDefault();
  const fd = new FormData(e.target), c = structuredClone(getMyChat()), now = Date.now();
  c.intake = Object.fromEntries(['name', 'city', 'contact', 'issue'].map(k => [k, String(fd.get(k) || '').trim()]));
  c.name = c.intake.name; c.showForm = false; c.status = 'waiting'; c.updated = now;
  c.msgs.push({ from: 'sys', text: '📨 केस ' + c.case + ' टिमलाई पठाइयो / Case ' + c.case + ' sent to the team', t: now });
  c.msgs.push({ from: 'bot', text: 'धन्यवाद! हाम्रो टिमका सदस्यले यहीँ जवाफ दिनुहुनेछ। यो पेज फेरि खोल्दा पनि तपाईंको च्याट यहीँ हुनेछ।\nThank you! A team member will reply here. If you come back later on this phone or computer, your chat will still be here.', t: now + 1 });
  await saveMy(c);
});
$('#cmsgs').addEventListener('click', e => { if (e.target.id === 'intakeCancel') { const c = structuredClone(myChat); c.showForm = false; myChat = c; renderCust() } });
$('#talkbtn').addEventListener('click', openForm);

$('#cform').addEventListener('submit', async e => {
  e.preventDefault();
  if (!me) return;
  const text = $('#cin').value.trim(); if (!text) return;
  $('#cin').value = '';
  const c = structuredClone(getMyChat()), now = Date.now();
  c.msgs.push({ from: 'customer', text, t: now }); c.updated = now;
  if (!c.assignee && c.status !== 'closed') {
    const a = answerFor(text);
    if (a) c.msgs.push({ from: 'bot', text: a, t: now + 1 });
    else if (c.status === 'bot') {
      c.lastQ = text; c.showForm = true;
      c.msgs.push({ from: 'bot', text: 'माफ गर्नुहोला, यसको जवाफ मसँग छैन। तलको छोटो फाराम भर्नुहोस् — हाम्रो टिमले यहीँ जवाफ दिनेछ।\nSorry, I don\'t have an answer for that. Please fill in the short form below and our team will reply here.', t: now + 1 });
    } else c.msgs.push({ from: 'bot', text: 'तपाईंको केस टिमसँग छ — उहाँहरूले यहीँ जवाफ दिनुहुनेछ। / Your case is with our team; they will reply here.', t: now + 1 });
  }
  await saveMy(c);
});
$('#chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { $('#cin').value = b.textContent; $('#cform').requestSubmit() } });
$('#fb').addEventListener('click', async e => {
  const v = e.target.closest('[data-fb]'); if (!v || !myChat) return;
  const c = structuredClone(myChat), now = Date.now(); c.updated = now;
  if (v.dataset.fb === 'yes') { c.feedback = 'yes'; c.msgs.push({ from: 'sys', text: 'Customer confirmed: solved ✓ / धन्यवाद!', t: now }) }
  else { c.feedback = null; c.resolvedAt = null; c.status = c.assignee ? 'human' : 'waiting'; c.msgs.push({ from: 'sys', text: 'Customer says not solved — case reopened / केस फेरि खोलियो', t: now }) }
  await saveMy(c);
});
$('#newcase').addEventListener('click', async () => {
  if (!myChat) return;
  const o = myChat, now = Date.now();
  const past = (o.past || []).concat({ case: o.case, name: o.name || '', intake: o.intake || null, status: 'closed', assignee: o.assignee || null, resolvedAt: o.resolvedAt || o.updated, resolvedBy: o.resolvedBy || null, feedback: o.feedback || null, updated: o.resolvedAt || o.updated, msgs: o.msgs }).slice(-10);
  await saveMy({ id: o.id, case: newCase(), name: o.name || '', intake: o.intake ? { name: o.intake.name, city: o.intake.city, contact: o.intake.contact } : null, status: 'bot', assignee: null, updated: now, msgs: [], past });
  $('#cin').focus();
});

/* ---------------- agent inbox ---------------- */
const label = { bot: 'Auto answering', waiting: 'Waiting', human: 'In progress', closed: 'Resolved' };
const myId = () => me && me.uid;
const nameOf = id => id === myId() ? 'You' : ((agents[id] && agents[id].name) || 'Another agent');
const caseOf = id => chats[id] || arch[id];
const unassigned = c => !c.assignee && !c.archived && (c.status === 'waiting' || c.status === 'human');

function renderAgent() {
  if (!agent) return;
  arch = {};
  for (const d of Object.values(chats)) for (const p of (d.past || [])) { const k = d.id + '~' + p.case; arch[k] = { ...p, id: k, archived: true } }
  const all = Object.values(chats).filter(c => (c.msgs && c.msgs.length) || c.status !== 'bot').concat(Object.values(arch)).sort((a, b) => b.updated - a.updated);
  const w = all.filter(unassigned).length;
  $('#wcount').hidden = !w; $('#wcount').textContent = w;
  document.title = (w ? '(' + w + ') ' : '') + 'Agent inbox · Nepali Passport Help Desk';
  const today = new Date().toDateString();
  $('#stats').innerHTML = `<div class="sw"><b>${w}</b><span>Waiting</span></div><div class="sp"><b>${all.filter(c => c.status === 'human' && !c.archived).length}</b><span>In progress</span></div><div class="sr"><b>${all.filter(c => c.status === 'closed' && new Date(c.resolvedAt || c.updated).toDateString() === today).length}</b><span>Resolved today</span></div>`;
  const q = ($('#search').value || '').trim().toLowerCase();
  const touched = c => c.assignee === myId() || (c.msgs || []).some(m => m.by === myId());
  let shown = all.filter(c => q ? ((c.case || '') + ' ' + (c.name || '') + ' ' + (c.msgs || []).map(m => m.text).join(' ')).toLowerCase().includes(q) :
    filter === 'basket' ? c.status !== 'closed' : filter === 'mine' ? (c.assignee === myId() && c.status !== 'closed') : filter === 'closed' ? c.status === 'closed' : touched(c));
  if (filter === 'basket' && !q) shown.sort((a, b) => unassigned(b) - unassigned(a) || b.updated - a.updated);
  if (filter === 'recent' && !q) shown = shown.slice(0, 30);
  $('#rows').innerHTML = shown.length ? shown.map(c => {
    const last = (c.msgs || [])[(c.msgs || []).length - 1];
    const st = c.status === 'closed' && c.feedback === 'yes' ? 'Resolved ✓' : (unassigned(c) ? 'Waiting' : label[c.status]);
    return `<button class="row" data-id="${esc(c.id)}" aria-current="${c.id === sel}"><b><span>${esc(c.name || 'Customer')} <span class="case">${esc(c.case || '')}</span></span><span class="st ${unassigned(c) ? 'waiting' : c.status}${c.feedback === 'yes' ? ' ok' : ''}">${st}</span></b><span class="who ${c.assignee === myId() ? 'me' : ''}">${c.assignee ? 'Handled by ' + esc(nameOf(c.assignee)) : 'Unassigned'}</span><p>${esc(last ? last.text : '')}</p></button>`;
  }).join('') : `<div class="empty">${q ? 'No case matches.' : filter === 'basket' ? 'No open cases. Automatic answers are handling everything.' : filter === 'mine' ? 'You have no open cases. Take one from the Workbasket.' : filter === 'closed' ? 'No resolved cases yet.' : 'No recent work yet.'}</div>`;

  const c = caseOf(sel), mine = c && c.assignee === myId();
  $('#ain').disabled = $('#asend').disabled = !c || c.archived || (!!c.assignee && !mine);
  $('#close').disabled = !c || c.archived || c.status === 'closed' || (!!c.assignee && !mine);
  const cl = $('#claim');
  if (!c) { cl.hidden = true; $('#intake').hidden = true; $('#amsgs').innerHTML = ''; $('#aname').textContent = 'Pick a case'; return }
  cl.hidden = false;
  cl.innerHTML = c.status === 'closed' ? `<span>✅ Resolved${c.resolvedBy ? ' by <b>' + esc(nameOf(c.resolvedBy)) + '</b>' : ''}${c.resolvedAt ? ' · ' + new Date(c.resolvedAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''} · ${c.feedback === 'yes' ? '<b style="color:#1f8a4c">Customer confirmed solved</b>' : 'Waiting for customer to confirm'}</span>`
    : !c.assignee ? `<span>Nobody is handling this case yet.</span><button class="go" id="take" type="button">Take this case</button>`
    : mine ? `<span><b>You</b> are handling this case.</span><button class="ghost" id="release" type="button">Release case</button>`
    : `<span>Handled by <b>${esc(nameOf(c.assignee))}</b>. Only they can reply.</span><button class="ghost" id="takeover" type="button">${takeoverArm === c.id ? 'Click again to take over' : 'Take over'}</button>`;
  const it = c.intake || {}, has = ['name', 'city', 'contact', 'issue'].some(k => it[k]);
  $('#intake').hidden = !has;
  $('#intake').innerHTML = has ? `<div><span>Name</span>${esc(it.name || '—')}</div><div><span>City</span>${esc(it.city || '—')}</div><div><span>Phone / email</span>${esc(it.contact || '—')}</div><div class="wide"><span>Problem</span>${esc(it.issue || '—')}</div>` : '';
  $('#aname').textContent = (c.name || 'Customer') + ' · ' + (c.case || '');
  $('#ameta').textContent = (unassigned(c) ? 'Waiting' : label[c.status]) + ' · last message ' + time(c.updated);
  $('#amsgs').innerHTML = (c.msgs || []).map(m => m.from === 'sys' ? `<div class="m sys">${esc(m.text)}</div>` :
    `<div class="m ${m.from === 'agent' ? 'me' : m.from === 'customer' ? 'agent' : 'bot fmt'}"><small>${m.from === 'customer' ? 'Customer' : m.from === 'bot' ? 'Automatic answer' : esc(nameOf(m.by || ''))} · ${time(m.t)}</small>${m.from === 'bot' ? fmt(m.text) : esc(m.text)}</div>`).join('');
  $('#amsgs').scrollTop = 1e9;
}
async function assign(id, to, force) {
  try {
    const r = await be.assign(id, to, force, to ? JOINED : 'Case returned to the queue');
    if (!r.ok && r.by) flash('Already taken by ' + nameOf(r.by) + '.');
    return r.ok;
  } catch (e) { showErr(e); return false }
}
$('#claim').addEventListener('click', async e => {
  const id = sel; if (!id) return;
  if (e.target.id === 'take') { e.target.disabled = true; if (await assign(id, myId())) flash('Case ' + (chats[id].case || '') + ' is now yours.') }
  if (e.target.id === 'release') await assign(id, null, true);
  if (e.target.id === 'takeover') { if (takeoverArm !== id) { takeoverArm = id; renderAgent(); return } takeoverArm = null; await assign(id, myId(), true) }
});
$('#rows').addEventListener('click', e => { const r = e.target.closest('.row'); if (r) { sel = r.dataset.id; takeoverArm = null; renderAgent() } });
$('#filters').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; filter = b.dataset.f; $('#search').value = ''; for (const x of $('#filters').querySelectorAll('button')) x.setAttribute('aria-pressed', x === b); renderAgent() });
$('#search').addEventListener('input', renderAgent);
function lastQuestion(c) { for (let i = c.msgs.length - 1; i >= 0; i--) if (c.msgs[i].from === 'customer') return c.msgs[i].text; return '' }
$('#aform').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('#ain').value.trim(); if (!text || !chats[sel]) return;
  if (!chats[sel].assignee && !(await assign(sel, myId()))) return;
  const c0 = chats[sel];
  if (c0.assignee && c0.assignee !== myId()) { flash('This case belongs to another agent.'); return }
  const c = structuredClone(c0), now = Date.now();
  c.assignee = myId(); c.msgs.push({ from: 'agent', by: myId(), text, t: now }); c.status = 'human'; c.updated = now;
  if ($('#teach').checked) { const q = lastQuestion(c0); if (q) await saveFaqDoc({ id: 'f' + now, q, k: '', a: text }) }
  $('#ain').value = ''; $('#teach').checked = false;
  try { await be.saveChat(c) } catch (er) { showErr(er) }
});
$('#close').addEventListener('click', async () => {
  const c0 = chats[sel]; if (!c0) return;
  const c = structuredClone(c0); c.status = 'closed'; c.updated = Date.now(); c.resolvedAt = c.updated; c.resolvedBy = myId(); c.feedback = null;
  c.msgs.push({ from: 'sys', text: '✅ Case ' + (c.case || '') + ' marked resolved / केस समाधान भएको छ', t: c.updated });
  try { await be.saveChat(c) } catch (e) { showErr(e) }
});

/* ---------------- automatic answers manager ---------------- */
async function saveFaqDoc(f) { try { await be.saveFaq(f) } catch (e) { showErr(e) } }
function renderFaq() {
  if (!agent) return;
  $('#flist').innerHTML = faqs.slice().sort((a, b) => a.q.localeCompare(b.q)).map(f => `<div class="fitem"><details><summary>${esc(f.q)}</summary><div class="fmt">${fmt(f.a)}</div></details><div class="acts"><button class="ghost" data-ed="${esc(f.id)}">Edit</button><button class="ghost" data-del="${esc(f.id)}">Delete</button></div></div>`).join('') || '<div class="empty">No automatic answers.</div>';
}
$('#flist').addEventListener('click', e => {
  const ed = e.target.dataset.ed, del = e.target.dataset.del;
  if (del) { if (e.target.dataset.arm) saveFaqDoc({ id: del, deleted: true }); else { e.target.dataset.arm = 1; e.target.textContent = 'Click again to delete' } }
  if (ed) { const f = faqs.find(x => x.id === ed); editing = ed; $('#fq').value = f.q; $('#fk').value = f.k || ''; $('#fa').value = f.a; $('#fhead').textContent = 'Edit answer'; $('#fcancel').hidden = false; $('#fq').focus() }
});
function resetForm() { editing = null; $('#fform').reset(); $('#fhead').textContent = 'Add a question and answer'; $('#fcancel').hidden = true }
$('#fcancel').addEventListener('click', resetForm);
$('#fform').addEventListener('submit', async e => {
  e.preventDefault();
  const f = { id: editing || 'f' + Date.now(), q: $('#fq').value.trim(), k: $('#fk').value.trim(), a: $('#fa').value.trim() };
  if (!f.q || !f.a) return;
  await saveFaqDoc(f); resetForm(); flash('Saved.');
});

/* ---------------- login ---------------- */
$('#login').addEventListener('submit', async e => {
  e.preventDefault(); $('#lerr').hidden = true; $('#lbtn').disabled = true;
  try { await be.login($('#lemail').value.trim(), $('#lpass').value) }
  catch (er) { $('#lerr').textContent = 'Wrong email or password.'; $('#lerr').hidden = false }
  $('#lbtn').disabled = false; $('#lpass').value = '';
});
$('#logout').addEventListener('click', async () => { await be.logout(); location.hash = '#home' });

/* ---------------- home page contacts + navigation ---------------- */
$('#cities').innerHTML = Object.entries(CONTACTS).map(([city, ps]) => `<div class="city"><h4>${esc(city)} <span>${ps.length}</span></h4><ul>${ps.map(([n, t]) => `<li><span>${esc(n)}</span><b>${esc(t)}</b></li>`).join('')}</ul></div>`).join('');
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); document.getElementById(g.dataset.go).scrollIntoView({ behavior: 'smooth' }) }
  const c = e.target.closest('[data-copy]'); if (c) navigator.clipboard.writeText(c.dataset.copy).then(() => { c.textContent = 'Copied ✓' }, () => { c.textContent = 'Select & copy' });
});
function route() {
  const h = location.hash;
  const v = h === '#agent' ? 'agent' : h === '#customer' ? 'cust' : 'home';
  $('#vHome').hidden = v !== 'home'; $('#vCust').hidden = v !== 'cust'; $('#vAgent').hidden = v !== 'agent';
  $('#tHome').setAttribute('aria-current', v === 'home' ? 'page' : 'false');
  $('#tCust').setAttribute('aria-current', v === 'cust' ? 'page' : 'false');
  $('#tAgent').setAttribute('aria-current', v === 'agent' ? 'page' : 'false');
  document.body.classList.toggle('customer', !agent);
  $('#login').hidden = !!agent; $('#inbox').hidden = !agent;
  if (v === 'cust') setTimeout(() => { $('#cmsgs').scrollTop = 1e9; }, 0);
  scrollTo(0, 0);
}
addEventListener('hashchange', route);

/* ---------------- start ---------------- */
(async () => {
  try { be = firebaseConfig ? await firebaseBackend(firebaseConfig) : demoBackend() }
  catch (e) { console.error(e); be = demoBackend() }
  $('#demo').hidden = be.live; $('#ldemo').hidden = be.live;
  route(); renderCust();
  be.watchFaq(d => { faqDocs = d; mergeFaq() }, () => { });
  be.onAuth(async u => {
    me = u;
    if (unsubMy) { unsubMy(); unsubMy = null } if (unsubChats) { unsubChats(); unsubChats = null } if (unsubAgents) { unsubAgents(); unsubAgents = null }
    agent = null; chats = {}; myChat = null;
    if (!u) { if (!be.live) { route(); renderCust(); } await be.signInCustomer().catch(showErr); return }
    if (!u.anon) {
      agent = await be.getAgent(u.uid).catch(() => null);
      if (!agent) { await be.logout(); $('#lerr').textContent = 'This account is not a help desk agent. Ask the admin to add you.'; $('#lerr').hidden = false; return }
      $('#meName').textContent = agent.name || 'Agent';
      unsubAgents = be.watchAgents(a => { agents = a; renderAgent() }, showErr);
      unsubChats = be.watchChats(all => { chats = all; renderAgent() }, showErr);
      if (!location.hash || location.hash === '#home') location.hash = '#agent';
    }
    unsubMy = be.watchMyChat(u.uid, c => { if (c) myChat = c; renderCust() }, showErr);
    route(); renderCust(); renderFaq();
  });
})();

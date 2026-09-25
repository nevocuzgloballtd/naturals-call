import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const normalize = (n) => String(n || '').replace(/[^\d*+#]/g, '');
const formatDuration = (s) => !s ? '—' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  document.body.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;background:#0b0f14;color:#fff;font-family:Inter,system-ui;padding:24px"><div style="max-width:560px;background:#121821;border:1px solid #253041;border-radius:18px;padding:28px"><h1 style="margin-top:0">CallFlow needs Supabase environment variables</h1><p>Set <b>VITE_SUPABASE_URL</b> and <b>VITE_SUPABASE_ANON_KEY</b> in Vercel, then redeploy.</p><p>Use the Supabase Project URL and the publishable/anon key. Never put the service_role key in frontend environment variables.</p></div></div>`;
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
let session = null;
let user = null;
let saved = [];
let history = [];
let transactions = [];
let profile = null;
let settings = { workspace: 'CallFlow', country: '+234', confirmClear: true, notifications: true };

function toast(msg, type = '') {
  const root = $('#toast-root');
  if (!root) return;
  const e = document.createElement('div');
  e.className = `toast ${type}`;
  e.textContent = msg;
  root.append(e);
  setTimeout(() => e.remove(), 2500);
}

function showAuth() {
  let el = $('#auth-gate');
  if (!el) {
    el = document.createElement('div');
    el.id = 'auth-gate';
    el.innerHTML = `
      <div class="auth-card">
        <div class="brand"><div class="brand-mark">C</div><div><strong>CallFlow</strong><span>Calling workspace</span></div></div>
        <div class="auth-copy"><p class="eyebrow">SECURE WORKSPACE</p><h1 id="auth-title">Sign in to CallFlow</h1><p id="auth-subtitle">Use your account to access saved numbers, history and billing.</p></div>
        <form id="auth-form">
          <label>Email<input id="auth-email" type="email" autocomplete="email" required placeholder="you@example.com"></label>
          <label>Password<input id="auth-password" type="password" autocomplete="current-password" required minlength="6" placeholder="At least 6 characters"></label>
          <button class="primary" id="auth-submit" type="submit">Sign in</button>
        </form>
        <div class="auth-foot"><span id="auth-switch-copy">New to CallFlow?</span><button class="text-btn" id="auth-switch" type="button">Create account</button></div>
        <div id="auth-message" class="auth-message"></div>
      </div>`;
    document.body.append(el);
    let signup = false;
    $('#auth-switch').onclick = () => {
      signup = !signup;
      $('#auth-title').textContent = signup ? 'Create your CallFlow account' : 'Sign in to CallFlow';
      $('#auth-subtitle').textContent = signup ? 'Your saved numbers and call history are tied to your Supabase account.' : 'Use your account to access saved numbers, history and billing.';
      $('#auth-submit').textContent = signup ? 'Create account' : 'Sign in';
      $('#auth-switch-copy').textContent = signup ? 'Already have an account?' : 'New to CallFlow?';
      $('#auth-switch').textContent = signup ? 'Sign in' : 'Create account';
      $('#auth-message').textContent = '';
    };
    $('#auth-form').onsubmit = async (e) => {
      e.preventDefault();
      const email = $('#auth-email').value.trim();
      const password = $('#auth-password').value;
      const btn = $('#auth-submit');
      btn.disabled = true;
      btn.textContent = signup ? 'Creating…' : 'Signing in…';
      $('#auth-message').textContent = '';
      try {
        if (signup) {
          const { data, error } = await supabase.auth.signUp({ email, password });
          if (error) throw error;
          if (!data.session) {
            $('#auth-message').textContent = 'Account created. Check your email to confirm the account, then sign in.';
          } else {
            toast('Account created', 'success');
          }
        } else {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
        }
      } catch (err) {
        $('#auth-message').textContent = err.message || 'Authentication failed.';
      } finally {
        btn.disabled = false;
        btn.textContent = signup ? 'Create account' : 'Sign in';
      }
    };
  }
  el.classList.add('open');
}
function hideAuth() { $('#auth-gate')?.classList.remove('open'); }

function navigate(view) {
  $$('.view').forEach(v => v.classList.remove('active'));
  $(`#view-${view}`)?.classList.add('active');
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  const labels = {home:'Home',dialer:'Dialer',saved:'Saved Numbers',history:'Call History',billing:'Billing',settings:'Settings'};
  $('#page-title').textContent = labels[view] || 'CallFlow';
  $('#sidebar').classList.remove('open');
  renderAll();
  scrollTo(0, 0);
}

$$('[data-view]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.view)));
$('#mobile-menu').onclick = () => $('#sidebar').classList.toggle('open');

async function loadProfile() {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  profile = data;
  settings.workspace = data?.workspace_name || 'CallFlow';
  settings.country = data?.default_country_code || '+234';
  updateProfileUI();
}

function updateProfileUI() {
  const name = profile?.full_name || 'Workspace';
  $('#profile-name').textContent = name;
  $('#profile-email').textContent = user?.email || 'Signed in';
  $('#profile-avatar').textContent = (name[0] || 'U').toUpperCase();
  $('.provider-card small').textContent = 'Not connected';
}

async function loadSaved() {
  const { data, error } = await supabase.from('saved_numbers').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  saved = data || [];
}

async function loadHistory() {
  const { data, error } = await supabase.from('calls').select('*').order('started_at', { ascending: false }).limit(200);
  if (error) throw error;
  history = data || [];
}

async function loadTransactions() {
  const { data, error } = await supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  transactions = data || [];
}

async function loadAppData() {
  if (!user) return;
  try {
    await Promise.all([loadProfile(), loadSaved(), loadHistory(), loadTransactions()]);
    renderAll();
  } catch (err) {
    console.error(err);
    toast(err.message || 'Could not load workspace data', 'warn');
  }
}

function updateStats() {
  const today = new Date();
  const y = today.getFullYear(), m = today.getMonth(), d = today.getDate();
  const todayCalls = history.filter(x => { const t = new Date(x.started_at || x.created_at); return t.getFullYear() === y && t.getMonth() === m && t.getDate() === d; });
  const completed = history.filter(x => x.status === 'completed');
  const seconds = completed.reduce((a, x) => a + Number(x.duration_seconds || 0), 0);
  $('#stat-calls').textContent = todayCalls.length;
  $('#stat-minutes').textContent = Math.round(seconds / 60) + 'm';
  $('#stat-saved').textContent = saved.length;
  $('#history-total').textContent = history.length;
  $('#history-completed').textContent = completed.length;
  $('#history-minutes').textContent = Math.round(seconds / 60) + 'm';
}

function renderSaved() {
  const q = ($('#saved-search')?.value || '').toLowerCase();
  const arr = saved.filter(x => (`${x.name} ${x.phone_number} ${x.note || ''}`).toLowerCase().includes(q));
  $('#saved-list').innerHTML = arr.length ? arr.map(x => `
    <div class="saved-item"><div class="mini-avatar">${esc((x.name || '?').slice(0,1).toUpperCase())}</div>
      <div class="item-main"><strong>${esc(x.name)}</strong><span>${esc(x.phone_number)}</span>${x.note ? `<span>${esc(x.note)}</span>` : ''}</div>
      <div class="item-actions"><button data-call="${esc(x.phone_number)}">☎</button><button data-edit="${x.id}">Edit</button><button data-delete="${x.id}">Delete</button></div>
    </div>`).join('') : `<div class="panel empty" style="grid-column:1/-1"><div class="empty-icon">☆</div><h3>${q ? 'No matches' : 'No saved numbers'}</h3><p>${q ? 'Try another search.' : 'Add your first number to make repeat calls faster.'}</p></div>`;
}

function renderHistory() {
  $('#history-list').innerHTML = history.length ? history.map(x => `
    <div class="history-row"><span><strong>${esc(x.contact_name || 'Unknown')}</strong><br><small>${esc(x.phone_number)}</small></span><span>${esc(x.direction || 'outbound')}</span><span>${new Date(x.started_at || x.created_at).toLocaleString()}</span><span>${formatDuration(x.duration_seconds || 0)}</span><button data-redial="${esc(x.phone_number)}">☎</button></div>`).join('') : `<div class="empty"><div class="empty-icon">◷</div><h3>No calls yet</h3><p>Your call history will appear here.</p></div>`;
}

function renderRecents() {
  const box = $('#dialer-recents');
  const arr = history.slice(0, 5);
  box.innerHTML = arr.length ? arr.map(x => `<div class="compact-item"><div class="mini-avatar">${esc((x.contact_name || x.phone_number || '?').slice(0,1).toUpperCase())}</div><div class="item-main"><strong>${esc(x.contact_name || 'Unknown')}</strong><span>${esc(x.phone_number)}</span></div><button class="round-call" data-redial="${esc(x.phone_number)}">☎</button></div>`).join('') : `<div class="empty"><div class="empty-icon">◷</div><h3>No recent calls</h3><p>Your call history will appear here.</p></div>`;
}

function renderTransactions() {
  const box = $('#transaction-list');
  if (!transactions.length) {
    box.innerHTML = `<div class="empty"><div class="empty-icon">◉</div><h3>No transactions yet</h3><p>Real provider billing will appear here after billing is connected.</p></div>`;
    return;
  }
  box.innerHTML = transactions.map(x => `<div class="history-row"><span><strong>${esc(x.transaction_type)}</strong><br><small>${esc(x.description || x.provider || '')}</small></span><span>${esc(x.currency || 'USD')}</span><span>${new Date(x.created_at).toLocaleString()}</span><span>${Number(x.amount || 0).toFixed(2)}</span><span></span></div>`).join('');
}

function loadSettings() {
  if (!$('#workspace-name')) return;
  $('#workspace-name').value = settings.workspace;
  $('#default-country').value = settings.country;
  $('#confirm-clear').checked = settings.confirmClear;
  $('#call-notifications').checked = settings.notifications;
}

function renderAll() { renderSaved(); renderHistory(); renderRecents(); renderTransactions(); updateStats(); loadSettings(); }

function openModal(html) { $('#modal-content').innerHTML = html; $('#modal-backdrop').classList.add('open'); }
function closeModal() { $('#modal-backdrop').classList.remove('open'); }
$('#modal-close').onclick = closeModal;
$('#modal-backdrop').onclick = e => { if (e.target.id === 'modal-backdrop') closeModal(); };

async function addNumber(existing = null) {
  openModal(`<h2>${existing ? 'Edit saved number' : 'Save number'}</h2><p>Keep the number available for one-tap calling.</p><div class="form-row"><label>Name</label><input id="m-name" value="${esc(existing?.name || '')}"></div><div class="form-row"><label>Phone number</label><input id="m-number" inputmode="tel" value="${esc(existing?.phone_number || $('#number-input').value)}"></div><div class="form-row"><label>Note (optional)</label><textarea id="m-note" rows="3">${esc(existing?.note || '')}</textarea></div><div class="form-actions"><button class="secondary" id="m-cancel">Cancel</button><button class="primary" id="m-save">${existing ? 'Save changes' : 'Save number'}</button></div>`);
  $('#m-cancel').onclick = closeModal;
  $('#m-save').onclick = async () => {
    const name = $('#m-name').value.trim(), phone_number = normalize($('#m-number').value.trim()), note = $('#m-note').value.trim();
    if (!name || !phone_number) return toast('Name and phone number are required', 'warn');
    try {
      if (existing) {
        const { error } = await supabase.from('saved_numbers').update({ name, phone_number, note }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('saved_numbers').insert({ user_id: user.id, name, phone_number, note });
        if (error) throw error;
      }
      await loadSaved(); closeModal(); renderAll(); toast(existing ? 'Number updated' : 'Number saved', 'success');
    } catch (err) { toast(err.message || 'Could not save number', 'warn'); }
  };
}

$('#add-number-btn').onclick = () => addNumber();
$('#save-from-dialer').onclick = () => { if (!normalize($('#number-input').value)) return toast('Enter a number first', 'warn'); addNumber(); };
$('#saved-search').oninput = renderSaved;
$('#clear-number').onclick = () => { $('#number-input').value = ''; };
$('#backspace').onclick = () => { $('#number-input').value = $('#number-input').value.slice(0, -1); };
$$('.dial-keypad button').forEach(b => b.onclick = () => { $('#number-input').value += b.dataset.key; $('#number-input').focus(); });
document.addEventListener('keydown', e => {
  if (document.querySelector('.modal-backdrop.open') || document.querySelector('#auth-gate.open')) return;
  if (/^[0-9*#]$/.test(e.key)) { $('#number-input').value += e.key; return; }
  if (e.key === 'Backspace') $('#number-input').value = $('#number-input').value.slice(0, -1);
  if (e.key === 'Escape') $('#number-input').value = '';
});

async function startDemoCall(number) {
  number = normalize(number);
  if (!number) return toast('Enter a number first', 'warn');
  let callId = null;
  const started = new Date();
  openModal(`<div style="text-align:center;padding:12px"><div class="phone-orb" style="margin:0 auto 18px;width:72px;height:72px;font-size:28px">☎</div><h2>Calling ${esc(number)}</h2><p>This records the call in Supabase now. The real provider will replace this demo call in the next backend step.</p><div class="form-actions" style="justify-content:center"><button class="secondary" id="end-demo">End call</button></div></div>`);
  try {
    const { data, error } = await supabase.from('calls').insert({ user_id: user.id, phone_number: number, direction: 'outbound', status: 'initiated', started_at: started.toISOString() }).select('id').single();
    if (error) throw error;
    callId = data.id;
  } catch (err) {
    closeModal(); return toast(err.message || 'Could not create call record', 'warn');
  }
  const timer = setInterval(() => {}, 1000);
  $('#end-demo').onclick = async () => {
    clearInterval(timer);
    const ended = new Date();
    const duration_seconds = Math.max(0, Math.floor((ended - started) / 1000));
    try {
      const { error } = await supabase.from('calls').update({ status: 'completed', ended_at: ended.toISOString(), duration_seconds }).eq('id', callId);
      if (error) throw error;
      closeModal(); await loadHistory(); renderAll(); toast('Call logged in Supabase', 'success');
    } catch (err) { toast(err.message || 'Could not finish call record', 'warn'); }
  };
}
$('#call-btn').onclick = () => startDemoCall($('#number-input').value);

document.addEventListener('click', async e => {
  let b = e.target.closest('[data-redial]');
  if (b) { $('#number-input').value = b.dataset.redial; navigate('dialer'); return; }
  b = e.target.closest('[data-call]');
  if (b) { startDemoCall(b.dataset.call); return; }
  b = e.target.closest('[data-edit]');
  if (b) { const x = saved.find(a => a.id === b.dataset.edit); if (x) addNumber(x); return; }
  b = e.target.closest('[data-delete]');
  if (b) {
    if (!confirm('Delete this saved number?')) return;
    try { const { error } = await supabase.from('saved_numbers').delete().eq('id', b.dataset.delete); if (error) throw error; await loadSaved(); renderAll(); toast('Number deleted'); }
    catch (err) { toast(err.message || 'Could not delete number', 'warn'); }
  }
});

$('#clear-history').onclick = async () => {
  if (!history.length) return;
  if (!confirm('Delete all call history?')) return;
  try {
    const { error } = await supabase.from('calls').delete().eq('user_id', user.id);
    if (error) throw error;
    await loadHistory(); renderAll(); toast('History cleared');
  } catch (err) { toast(err.message || 'Could not clear history', 'warn'); }
};
$('#connect-provider').onclick = () => toast('Provider connection will be added through Supabase Edge Functions');
$('#api-info').onclick = () => toast('CRM will call our API; the API will call the provider');
$('#save-settings').onclick = async () => {
  settings.workspace = $('#workspace-name').value.trim() || 'CallFlow';
  settings.country = $('#default-country').value.trim() || '+234';
  settings.confirmClear = $('#confirm-clear').checked;
  settings.notifications = $('#call-notifications').checked;
  try {
    const { error } = await supabase.from('profiles').update({ workspace_name: settings.workspace, default_country_code: settings.country }).eq('id', user.id);
    if (error) throw error;
    await loadProfile();
    toast('Settings saved', 'success');
  } catch (err) { toast(err.message || 'Could not save settings', 'warn'); }
};
$('#reset-data').onclick = async () => {
  if (!confirm('Delete all saved numbers and call history for this account?')) return;
  try {
    const a = await supabase.from('saved_numbers').delete().eq('user_id', user.id);
    if (a.error) throw a.error;
    const b = await supabase.from('calls').delete().eq('user_id', user.id);
    if (b.error) throw b.error;
    await Promise.all([loadSaved(), loadHistory()]); renderAll(); toast('Account data cleared');
  } catch (err) { toast(err.message || 'Could not clear data', 'warn'); }
};
$('#global-search').onclick = () => navigate('saved');
$('#help-btn').onclick = () => toast('CallFlow is connected to Supabase. Provider calling is the next backend layer.');
$('#profile-btn').onclick = async () => { if (confirm(`Sign out ${user?.email || 'of CallFlow'}?`)) await supabase.auth.signOut(); };

async function boot() {
  const { data } = await supabase.auth.getSession();
  session = data.session;
  user = session?.user || null;
  if (!user) { showAuth(); return; }
  hideAuth();
  await loadAppData();
}

supabase.auth.onAuthStateChange((_event, newSession) => {
  session = newSession;
  user = newSession?.user || null;
  if (user) { hideAuth(); setTimeout(loadAppData, 0); }
  else { showAuth(); }
});

boot();

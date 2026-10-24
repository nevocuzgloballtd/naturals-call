export function initSms(ctx) {

  const {
    supabase,
    getUser,
    getSaved,
    $,
    esc,
    toast,
    openModal,
    closeModal,
    toE164
  } = ctx;

  let messages = [];
  let activeNumber = null;
  let channel = null;
  let sending = false;


  async function errorText(error) {
    try {
      const body = await error.context.json();
      return body?.error || error.message;
    } catch {
      return error.message;
    }
  }

  function nameFor(number) {
    const match = (getSaved() || []).find(
      x => toE164(x.phone_number) === number
    );
    return match?.name || number;
  }

  function timeLabel(value) {
    return new Date(value).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function statusLabel(m) {
    if (m.direction !== 'outbound') return '';
    if (m.status === 'delivered') return ' · Delivered';
    if (m.status === 'sent') return ' · Sent';
    if (m.status === 'failed') {
      return ' · Failed' + (m.error_message ? ` (${m.error_message})` : '');
    }
    return ' · Sending…';
  }

  function threads() {

    const map = new Map();

    for (const m of messages) {

      let t = map.get(m.contact_number);

      if (!t) {
        t = { number: m.contact_number, last: m, unread: 0 };
        map.set(m.contact_number, t);
      }

      t.last = m;

      if (m.direction === 'inbound' && !m.read_at) {
        t.unread++;
      }
    }

    return [...map.values()].sort(
      (a, b) => new Date(b.last.created_at) - new Date(a.last.created_at)
    );
  }


  /* ---------------- data ---------------- */

  async function load() {

    if (!getUser()) return;

    const { data, error } =
      await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1000);

    if (error) {
      console.warn('Could not load messages:', error.message);
      return;
    }

    messages = data || [];
  }

  async function markRead(number) {

    const unread = messages.filter(
      m =>
        m.contact_number === number &&
        m.direction === 'inbound' &&
        !m.read_at
    );

    if (!unread.length) return;

    const now = new Date().toISOString();

    unread.forEach(m => { m.read_at = now; });

    renderBadge();

    await supabase
      .from('messages')
      .update({ read_at: now })
      .eq('contact_number', number)
      .eq('direction', 'inbound')
      .is('read_at', null);
  }

  async function send(to, text) {

    if (sending) return false;

    sending = true;

    try {

      const { data, error } =
        await supabase.functions.invoke('send-sms', { body: { to, text } });

      if (error) throw new Error(await errorText(error));

      if (!data?.success) {
        throw new Error(data?.error || 'Could not send message');
      }

      await load();

      activeNumber = to;
      render();

      return true;

    } catch (err) {

      toast(err.message || 'Could not send message', 'warn');

      await load();
      render();

      return false;

    } finally {
      sending = false;
    }
  }


  /* ---------------- rendering ---------------- */

  function renderBadge() {

    const badge = $('#sms-badge');
    if (!badge) return;

    const n = messages.filter(
      m => m.direction === 'inbound' && !m.read_at
    ).length;

    badge.hidden = n === 0;
    badge.textContent = n > 99 ? '99+' : String(n);
  }

  function renderThreads() {

    const box = $('#sms-threads');
    if (!box) return;

    const list = threads();

    if (!list.length) {
      box.innerHTML = `
        <div class="empty">
          <div class="empty-icon">✉</div>
          <h3>No messages yet</h3>
          <p>Start a conversation with the New message button.</p>
        </div>
      `;
      return;
    }

    box.innerHTML = list.map(t => `

      <button
        type="button"
        class="sms-thread ${t.number === activeNumber ? 'active' : ''}"
        data-thread="${esc(t.number)}"
      >

        <div class="mini-avatar">
          ${esc(nameFor(t.number).replace('+', '').slice(0, 1).toUpperCase())}
        </div>

        <div class="meta">
          <strong>${esc(nameFor(t.number))}</strong>
          <small>
            ${t.last.direction === 'outbound' ? 'You: ' : ''}${esc(t.last.body)}
          </small>
        </div>

        ${t.unread ? `<em class="sms-unread">${t.unread}</em>` : ''}

      </button>

    `).join('');
  }

  function renderConversation() {

    const title = $('#sms-convo-title');
    const box = $('#sms-messages');
    const form = $('#sms-form');

    if (!title || !box || !form) return;

    if (!activeNumber) {
      title.textContent = 'Select a conversation';
      box.innerHTML = '<p class="sms-hint">Pick a conversation or start a new message.</p>';
      form.hidden = true;
      return;
    }

    title.textContent =
      nameFor(activeNumber) === activeNumber
        ? activeNumber
        : `${nameFor(activeNumber)} · ${activeNumber}`;

    form.hidden = false;

    const thread = messages.filter(m => m.contact_number === activeNumber);

    box.innerHTML = thread.map(m => `

      <div class="sms-bubble ${m.direction === 'outbound' ? 'out' : 'in'}">
        ${esc(m.body)}
        <small>${esc(timeLabel(m.created_at))}${esc(statusLabel(m))}</small>
      </div>

    `).join('');

    box.scrollTop = box.scrollHeight;
  }

  function render() {
    renderBadge();
    renderThreads();
    renderConversation();
  }


  /* ---------------- actions ---------------- */

  async function openThread(number) {
    activeNumber = number;
    await markRead(number);
    render();
    $('#sms-input')?.focus();
  }

  function openNew(prefill = '') {

    openModal(`

      <h2>New message</h2>
      <p>Send a text from your Telnyx number.</p>

      <div class="form-row">
        <label>Phone number</label>
        <input id="sms-new-number" inputmode="tel" value="${esc(prefill)}">
      </div>

      <div class="form-row">
        <label>Message</label>
        <textarea id="sms-new-text" rows="4" maxlength="1600"></textarea>
      </div>

      <div class="form-actions">
        <button class="secondary" id="sms-new-cancel">Cancel</button>
        <button class="primary" id="sms-new-send">Send</button>
      </div>

    `);

    $('#sms-new-cancel').onclick = closeModal;

    $('#sms-new-send').onclick = async () => {

      const number = toE164($('#sms-new-number').value);
      const text = $('#sms-new-text').value.trim();

      if (!number) {
        return toast('Enter a valid phone number (with country code)', 'warn');
      }

      if (!text) {
        return toast('Type a message first', 'warn');
      }

      const btn = $('#sms-new-send');
      btn.disabled = true;

      const ok = await send(number, text);

      if (ok) {
        closeModal();
      } else {
        btn.disabled = false;
      }
    };
  }


  /* ---------------- live updates ---------------- */

  function subscribe() {

    const user = getUser();

    if (channel || !user) return;

    let t = null;

    channel = supabase
      .channel('messages-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `user_id=eq.${user.id}`
        },
        () => {

          clearTimeout(t);

          t = setTimeout(async () => {

            const before = new Set(messages.map(m => m.id));

            await load();

            const viewing =
              $('#view-messages')?.classList.contains('active');

            const fresh = messages.filter(
              m => !before.has(m.id) && m.direction === 'inbound'
            );

            for (const m of fresh) {

              if (viewing && m.contact_number === activeNumber) {
                await markRead(activeNumber);
              } else {
                toast(`New message from ${nameFor(m.contact_number)}`);
              }
            }

            render();

          }, 250);
        }
      )
      .subscribe();
  }

  function teardown() {

    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }

    messages = [];
    activeNumber = null;

    render();
  }


  /* ---------------- one-time event wiring ---------------- */

  $('#sms-new-btn')?.addEventListener('click', () => openNew());

  $('#sms-threads')?.addEventListener('click', e => {
    const b = e.target.closest('[data-thread]');
    if (b) openThread(b.dataset.thread);
  });

  const form = $('#sms-form');
  const input = $('#sms-input');

  if (form && input) {

    form.addEventListener('submit', async e => {

      e.preventDefault();

      const text = input.value.trim();

      if (!text || !activeNumber) return;

      const btn = form.querySelector('button');

      btn.disabled = true;

      const ok = await send(activeNumber, text);

      btn.disabled = false;

      if (ok) input.value = '';

      input.focus();
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
  }

  return { load, render, subscribe, teardown };
}

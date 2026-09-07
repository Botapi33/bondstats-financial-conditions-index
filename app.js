(() => {
  const DATA_URL = './data/financial-conditions-index.json';
  let data = null;
  let chartRange = 756;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  function fmtDelta(v) {
    if (v == null || !Number.isFinite(Number(v))) return '—';
    const n = Number(v);
    return `${n > 0 ? '+' : ''}${n.toFixed(1)}`;
  }

  function reportHeight() {
    if (window.parent === window) return;
    const height = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
    window.parent.postMessage({ type:'bondstats-fci-height', height }, '*');
  }

  function renderHeader() {
    const live = data?.index?.score != null;
    $('score').textContent = live ? Number(data.index.score).toFixed(1) : '—';
    $('regime').textContent = data?.index?.regime || 'Awaiting live calculation';
    $('change1w').textContent = fmtDelta(data?.index?.change1w);
    $('change1m').textContent = fmtDelta(data?.index?.change1m);
    $('momentum').textContent = data?.index?.momentum || '—';
    $('mainDriver').textContent = data?.index?.mainDriver || '—';
    $('asOf').textContent = data?.asOfDate || '—';

    $('freshness').textContent = data?.generatedAt
      ? `${data.status || 'live'} · ${new Date(data.generatedAt).toLocaleString('en-GB')}`
      : 'awaiting first GitHub Action run';

    const score = live ? Math.max(0, Math.min(100, Number(data.index.score))) : 50;
    $('pointer').style.left = `${score}%`;
    $('pointerValue').textContent = live ? score.toFixed(1) : '—';
  }

  function renderLedger() {
    const components = data?.components || [];
    if (!components.length) {
      $('ledger').innerHTML = '<div class="empty">Run the GitHub Action once to calculate the live index.</div>';
      return;
    }

    $('ledger').innerHTML = components.map(c => {
      const contribution = Number(c.contribution || 0);
      const pct = Math.min(48, Math.abs(contribution) / 0.6 * 48);
      const state = c.pressure || 'neutral';
      const style = state === 'tightening'
        ? `width:${pct}%;`
        : state === 'easing'
          ? `width:${pct}%;`
          : 'width:0%;';
      const dotLeft = Math.max(2, Math.min(98, 50 + contribution / 0.6 * 48));

      return `<div class="ledger-row" title="${esc(c.description || '')}">
        <div class="factor-name">${esc(c.label)}</div>
        <div class="factor-weight">${Math.round(Number(c.weight || 0) * 100)}% weight</div>
        <div class="bar">
          <div class="bar-fill ${esc(state)}" style="${style}"></div>
          <span class="bar-dot" style="left:${dotLeft}%"></span>
        </div>
        <div class="factor-raw">${c.rawValue == null ? '—' : esc(c.rawValue)} ${esc(c.unit || '')}</div>
        <div class="factor-state ${esc(state)}">${esc(state)}</div>
      </div>`;
    }).join('');
  }

  function renderSources() {
    const sources = data?.sourceHealth || [];
    if (!sources.length) {
      $('sourceHealth').textContent = 'Awaiting first refresh.';
      return;
    }
    $('sourceHealth').innerHTML = sources.map(s =>
      `<span class="source ${esc(s.status)}"><i></i>${esc(s.id)} · ${esc(s.status)}</span>`
    ).join('');
  }

  function drawHistory() {
    const canvas = $('historyChart');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(340 * dpr));
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = 340;
    ctx.clearRect(0,0,width,height);

    let h = (data?.history || []).slice(-chartRange);
    if (h.length < 2) {
      ctx.fillStyle = '#788178';
      ctx.font = '12px system-ui';
      ctx.fillText('History will appear after the first live calculation.', 0, 30);
      return;
    }

    // reference bands
    const y = score => height - (score / 100) * height;
    ctx.lineWidth = 1;
    [25,42,50,58,75].forEach(level => {
      ctx.beginPath();
      ctx.strokeStyle = level === 50 ? '#4b554d' : '#272e29';
      ctx.moveTo(0,y(level));
      ctx.lineTo(width,y(level));
      ctx.stroke();
    });

    // line
    ctx.beginPath();
    h.forEach((p,i) => {
      const x = (i / (h.length - 1)) * width;
      const yy = y(Number(p.score));
      if (i === 0) ctx.moveTo(x,yy); else ctx.lineTo(x,yy);
    });
    ctx.strokeStyle = '#d9d5ca';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // subtle current marker
    const last = h[h.length - 1];
    const lx = width - 1;
    const ly = y(Number(last.score));
    ctx.beginPath();
    ctx.arc(lx - 4, ly, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#65d99a';
    ctx.fill();
  }

  async function load() {
    try {
      const res = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache:'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      renderHeader();
      renderLedger();
      renderSources();
      drawHistory();
      requestAnimationFrame(reportHeight);
    } catch (error) {
      $('freshness').textContent = 'data unavailable';
      console.error(error);
    }
  }

  document.querySelectorAll('[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      chartRange = Number(btn.dataset.range);
      drawHistory();
      requestAnimationFrame(reportHeight);
    });
  });

  window.addEventListener('resize', () => {
    drawHistory();
    reportHeight();
  });
  window.addEventListener('load', reportHeight);
  if ('ResizeObserver' in window) new ResizeObserver(reportHeight).observe(document.documentElement);

  load();
  setInterval(load, 15 * 60 * 1000);
})();

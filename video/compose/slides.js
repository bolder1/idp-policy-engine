/* -----------------------------------------------------------------------------
   The slides — every scene that is not the product itself.

   Each entry is { build(el, params, edl), update(el, t, dur, params) }. `build`
   writes the markup once; entrances are CSS keyframe animations with delays,
   which the compositor steps. Anything that has to follow a path, count, flip or
   stay in sync with something else is computed in `update` from `t`, the
   slide's own clock in seconds — so it lands on the same frame every render.

   The drawings are the product's own ideas, drawn as skeletons: a sign-in
   falling down a chain of rules, a rule as Who · If · Then, a grade that flips,
   a field of situations. Same vocabulary as the console, same colours.
   -------------------------------------------------------------------------- */
;(() => {
  const { clamp, lerp, easeInOut, easeOut, easeOutBack } = window.COMPOSE
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1)

  const I = {
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    split: '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/><path d="m15 9 6-6"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    finger: '<path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    userCheck: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>',
    key: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5"/>',
    alert: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
    store: '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/>',
    move: '<path d="M12 2v20"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path d="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/>',
    checks: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    filePlus: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M12 18v-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    maximize: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/>',
    minus: '<path d="M5 12h14"/>',
  }
  const icon = (name, size = 24, sw = 2, cls = '') =>
    `<svg class="ic ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${I[name]}</svg>`
  const CURSOR =
    '<svg viewBox="0 0 32 32" width="40" height="40"><path d="M7 3.5 L7 25.5 L12.4 20.6 L16 28.6 L20.1 26.8 L16.6 19 L23.8 18.6 Z" fill="#ffffff" stroke="#15191e" stroke-width="1.7" stroke-linejoin="round"/></svg>'
  const D = (s) => `style="--d:${s}s"`
  const q = (el, s) => el.querySelector(s)
  const qa = (el, s) => [...el.querySelectorAll(s)]
  const LOGO = '/app/xecurify-logo.png'
  const mark = (edl, id, name, size = 30) => {
    const f = edl.logos && edl.logos[id]
    return f
      ? `<img src="/app/logos/${f}" alt="" style="width:${size}px;height:${size}px;border-radius:8px;object-fit:contain">`
      : `<span class="mono" style="width:${size}px;height:${size}px;border-radius:8px;display:grid;place-items:center;background:#eef1f4;font:600 15px var(--font)">${name[0]}</span>`
  }

  function text({ kicker, title, sub }, t0 = 0.25) {
    const words = title.split(' ')
    return `<div class="s-text">
      ${kicker ? `<div class="s-kicker a a-left" ${D(t0)}><i></i>${kicker}</div>` : ''}
      <h1 class="s-title">${words.map((w, i) => `<span class="s-w a a-rise" ${D(t0 + 0.12 + i * 0.07)}>${w}</span>`).join(' ')}</h1>
      ${sub ? `<p class="s-sub a a-rise" ${D(t0 + 0.4 + words.length * 0.07)}>${sub}</p>` : ''}
    </div>`
  }

  /* A cursor following timed keys: [{t, x, y, click}] in the art's own pixels. */
  function drive(cur, rip, t, keys) {
    if (!cur) return
    if (t < keys[0].t) {
      cur.style.opacity = '0'
      if (rip) rip.style.opacity = '0'
      return
    }
    let x = keys[0].x
    let y = keys[0].y
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i]
      const b = keys[i + 1]
      if (t >= b.t) {
        x = b.x
        y = b.y
      } else if (t >= a.t) {
        const p = easeInOut(seg(t, a.t + (a.hold ?? 0), b.t))
        x = lerp(a.x, b.x, p)
        y = lerp(a.y, b.y, p)
        break
      }
    }
    let press = 1
    let rp = -1
    for (const k of keys) {
      if (!k.click) continue
      const dt = t - k.t
      if (dt >= 0 && dt < 0.2) press = 0.84
      if (dt >= 0 && dt < 0.65) rp = dt / 0.65
    }
    const last = keys[keys.length - 1]
    const out = last.out ? 1 - seg(t, last.t, last.t + 0.4) : 1
    cur.style.opacity = String(seg(t, keys[0].t, keys[0].t + 0.3) * out)
    cur.style.transform = `translate(${x - 7}px, ${y - 3.5}px) scale(${press})`
    if (rip) {
      rip.style.opacity = rp >= 0 ? String((1 - rp) * 0.95) : '0'
      rip.style.transform = `translate(${x}px, ${y}px) scale(${0.15 + 0.95 * easeOut(Math.max(rp, 0))})`
    }
  }

  /* --- the chain: a sign-in falling through ordered rules ------------------------ */
  const TONE = {
    allow: { ring: '#128f43', glow: 'rgba(18,143,67,0.18)' },
    mfa: { ring: '#b07a00', glow: 'rgba(176,122,0,0.2)' },
    deny: { ring: '#d01243', glow: 'rgba(208,18,67,0.18)' },
  }
  function chainHTML(edl, { app, appName, rules, def = 'Allow' }) {
    const card = (r, i) => `
      <div class="mc" data-i="${i}">
        <div class="mc__head"><span class="mc__idx">${i + 1}</span><span class="mc__name">${r.name}</span><span class="chip is-${r.tone}">${r.chip}</span></div>
        <div class="mc__ring"></div>
      </div>
      <div class="chip vpill" data-v="${i}" style="position:absolute;left:0;top:0;opacity:0"></div>`
    return `<div class="chain">
      <div class="chain__spine"></div>
      <div class="chain__start a a-pop" ${D(0.35)}>${mark(edl, app, appName)} A sign-in arrives at <b>${appName}</b></div>
      ${rules.map(card).join('')}
      <div class="mc mc--default" data-i="d">
        <div class="mc__head"><span class="mc__idx">${icon('lock', 18)}</span><span class="mc__name">Nothing else matched</span><span class="chip is-allow">${def}</span></div>
        <div class="mc__ring"></div>
      </div>
      <div class="chip vpill" data-v="d" style="position:absolute;left:0;top:0;opacity:0"></div>
      <div class="chain__token"></div>
    </div>`
  }

  /* Lays the chain out for time t.
     `runs` are rehearsals: [{at, hit, order}] — `order` is the rule indices top
     to bottom for that run, `hit` the index that decides (or 'd'). `swaps` move
     cards between slots: [{at, dur, order}]. */
  function layoutChain(root, t, { rules, runs = [], orderAt = () => ({ order: rules.map((_, i) => i) }), appear = 0.5, width = 520, pitch = 118 }) {
    const chain = q(root, '.chain')
    const cards = qa(chain, '.mc:not(.mc--default)')
    const def = q(chain, '.mc--default')
    const token = q(chain, '.chain__token')
    const startY = 100
    const cx = width / 2
    const { order, from, p } = orderAt(t)
    // slot positions, eased between the previous order and this one
    cards.forEach((el, i) => {
      const slotNow = order.indexOf(i)
      const slotWas = from ? from.indexOf(i) : slotNow
      const s = lerp(slotWas, slotNow, easeInOut(p ?? 1))
      const y = startY + s * pitch
      const k = easeOutBack(seg(t, appear + i * 0.14, appear + i * 0.14 + 0.55))
      el.style.width = `${width}px`
      el.style.transform = `translateY(${y + (1 - k) * 26}px) scale(${0.94 + 0.06 * clamp(k, 0, 1)})`
      el.style.opacity = String(clamp(k * 1.4, 0, 1))
      el.dataset.y = String(y)
      q(el, '.mc__idx').textContent = String(slotNow + 1)
      el.style.zIndex = String(from && slotWas !== slotNow && (p ?? 1) < 1 ? 5 : 2)
    })
    const defY = startY + cards.length * pitch
    const kd = easeOutBack(seg(t, appear + cards.length * 0.14, appear + cards.length * 0.14 + 0.55))
    def.style.width = `${width}px`
    def.style.transform = `translateY(${defY + (1 - kd) * 26}px)`
    def.style.opacity = String(clamp(kd * 1.4, 0, 1))
    const spine = q(chain, '.chain__spine')
    spine.style.left = `${cx}px`
    spine.style.top = '56px'
    spine.style.height = `${defY - 20}px`
    spine.style.opacity = String(seg(t, appear, appear + 0.8))
    q(chain, '.chain__start').style.left = `${cx}px`

    // rehearsals
    let run = null
    for (const r of runs) if (t >= r.at) run = r
    const reset = run && run.until !== undefined && t > run.until ? seg(t, run.until, run.until + 0.35) : 0
    const rings = qa(chain, '.mc__ring')
    rings.forEach((r) => {
      r.style.borderColor = 'transparent'
      r.style.boxShadow = 'none'
    })
    qa(chain, '.vpill').forEach((v) => (v.style.opacity = '0'))
    ;[...cards, def].forEach((el) => (el.style.filter = 'none'))
    if (!run) {
      token.style.opacity = '0'
      return
    }
    const ord = run.order ?? order
    const stops = ord.map((i) => Number(cards[i].dataset.y) + 42)
    const hitSlot = run.hit === 'd' ? ord.length : ord.indexOf(run.hit)
    const hop = 0.42
    const t0 = run.at
    // token position
    let ty = 28
    let tx = cx
    let lastStop = 28
    for (let s = 0; s <= hitSlot; s++) {
      const y = s < ord.length ? stops[s] : defY + 42
      const a = t0 + 0.2 + s * hop
      if (t >= a) {
        const pp = easeInOut(seg(t, a, a + hop * 0.85))
        ty = lerp(lastStop, y, pp)
      }
      lastStop = y
    }
    const landAt = t0 + 0.2 + hitSlot * hop + hop * 0.85
    const land = easeOutBack(seg(t, landAt, landAt + 0.35))
    tx = lerp(cx, 40, land)
    token.style.opacity = String(seg(t, t0, t0 + 0.15) * (1 - reset))
    token.style.transform = `translate(${tx}px, ${ty}px) scale(${1 + 0.25 * Math.sin(Math.PI * seg(t, landAt, landAt + 0.35))})`
    // verdicts
    for (let s = 0; s <= Math.min(hitSlot, ord.length); s++) {
      const at = t0 + 0.2 + s * hop + hop * 0.6
      if (t < at) continue
      const k = easeOut(seg(t, at, at + 0.25)) * (1 - reset)
      const isHit = s === hitSlot
      const el = s < ord.length ? cards[ord[s]] : def
      const key = s < ord.length ? String(ord[s]) : 'd'
      const pill = q(chain, `.vpill[data-v="${key}"]`)
      const y = s < ord.length ? Number(el.dataset.y) : defY
      pill.textContent = isHit ? 'Matched' : 'Did not match'
      pill.className = `chip vpill ${isHit ? 'is-' + (s < ord.length ? rules[ord[s]].tone : 'allow') : 'is-grey'}`
      pill.style.transform = `translate(${width + 18 + (1 - k) * -12}px, ${y + 24}px)`
      pill.style.opacity = String(k)
      if (isHit) {
        const tone = TONE[s < ord.length ? rules[ord[s]].tone : 'allow']
        const ring = q(el, '.mc__ring')
        ring.style.borderColor = tone.ring
        ring.style.boxShadow = `0 0 0 ${8 * k}px ${tone.glow}`
      }
    }
    // everything below the decider dims
    const dimAt = landAt
    const kd2 = seg(t, dimAt, dimAt + 0.3) * (1 - reset)
    for (let s = hitSlot + 1; s <= ord.length; s++) {
      const el = s < ord.length ? cards[ord[s]] : def
      el.style.opacity = String(lerp(1, 0.4, kd2))
      el.style.filter = `grayscale(${kd2})`
    }
  }

  /* ============================================================================
     SLIDES
     ============================================================================ */
  const SLIDES = {}

  /* 1 · Title ------------------------------------------------------------------- */
  const TITLE_RULES = [
    { name: 'Block anonymised sources', tone: 'deny', chip: 'Deny' },
    { name: 'Finance — off-network', tone: 'mfa', chip: 'Second factor' },
    { name: 'Trusted office device', tone: 'allow', chip: 'Allow' },
  ]
  SLIDES.title = {
    build(el, p, edl) {
      el.innerHTML = `
        <div class="s-text">
          <img class="t-logo a a-rise" ${D(0.2)} src="${LOGO}" alt="">
          <h1 class="s-title" style="margin-top:44px">${['Policy', 'Engine'].map((w, i) => `<span class="s-w a a-rise" ${D(0.45 + i * 0.12)}>${w}</span>`).join(' ')}</h1>
          <p class="s-sub a a-rise" ${D(0.95)}>The flow builder, end to end — from a blank policy to a published one.</p>
          <div class="t-pills">
            <span class="pill a a-pop" ${D(1.5)}>${icon('users', 22)} Who</span>
            <span class="pill a a-pop" ${D(1.65)}>${icon('split', 22)} If</span>
            <span class="pill a a-pop" ${D(1.8)}>${icon('arrow', 22)} Then</span>
          </div>
        </div>
        <div class="s-art a a-right" ${D(0.3)}>
          <div class="a-float" style="position:absolute;inset:0"><div class="s-panel"></div>
            ${chainHTML(edl, { app: 'workday', appName: 'Workday', rules: TITLE_RULES })}
            <div class="ripple"></div><div class="cursor">${CURSOR}</div>
          </div>
        </div>`
      q(el, '.chain').style.left = '70px'
    },
    update(el, t) {
      layoutChain(el, t, {
        rules: TITLE_RULES,
        appear: 0.8,
        runs: [{ at: 2.6, hit: 1 }],
      })
      drive(q(el, '.cursor'), q(el, '.ripple'), t, [
        { t: 4.6, x: 760, y: 860 },
        { t: 5.5, x: 520, y: 330, click: true },
        { t: 6.8, x: 520, y: 330 },
      ])
    },
  }

  /* 2 · Every sign-in gets a decision ------------------------------------------- */
  const PEOPLE = [
    { n: 'Priya', m: 'Workday · Office', o: 0 },
    { n: 'Devon', m: 'Jira · Tor', o: 2 },
    { n: 'Mehak', m: 'Salesforce · New device', o: 1 },
    { n: 'Arun', m: 'GitHub · Office', o: 0 },
    { n: 'Nadia', m: 'Box · Off-network', o: 1 },
    { n: 'Sam', m: 'Workday · Proxy', o: 2 },
    { n: 'Lena', m: 'Slack · Managed', o: 0 },
    { n: 'Omar', m: 'Zoom · High risk', o: 1 },
    { n: 'Kiran', m: 'M365 · Office', o: 0 },
    { n: 'Rohan', m: 'Workday · Tor', o: 2 },
    { n: 'Anita', m: 'Salesforce · Off-network', o: 1 },
    { n: 'Thomas', m: 'Jira · Office', o: 0 },
  ]
  const BINS = [
    { label: 'Allow', cls: 'is-allow', y: 170 },
    { label: 'Second factor', cls: 'is-mfa', y: 386 },
    { label: 'Deny', cls: 'is-deny', y: 602 },
  ]
  SLIDES.decide = {
    build(el) {
      el.innerHTML = `
        ${text({ kicker: 'The question every sign-in asks', title: 'Every sign-in gets a decision.', sub: 'Let them in, ask for a second factor, or refuse — decided by the policy on the application being opened.' })}
        <div class="s-art a a-right" ${D(0.3)}>
          <div class="s-panel"></div>
          <svg class="dz-lane" width="820" height="900">
            ${[250, 445, 640].map((y, i) => `<path class="a a-draw" style="--len:520;--d:${0.6 + i * 0.1}s" d="M20,${y} C170,${y} 250,445 400,445"/>`).join('')}
            ${BINS.map((b, i) => `<path class="a a-draw" style="--len:320;--d:${0.9 + i * 0.1}s" d="M440,445 C520,445 520,${b.y + 59} 600,${b.y + 59}"/>`).join('')}
          </svg>
          <div class="dz-gate a a-pop" ${D(0.7)}><div class="dz-gate__pulse"></div>${icon('shield', 74, 1.7)}<div class="dz-gate__label">The policy</div></div>
          ${BINS.map((b, i) => `<div class="dz-bin chip ${b.cls} a a-pop" style="top:${b.y}px;--d:${1 + i * 0.12}s;border-radius:22px"><b data-bin="${i}">0</b><span>${b.label}</span></div>`).join('')}
          ${PEOPLE.map((p, i) => `<div class="dz-token" data-p="${i}"><span class="avatar">${p.n[0]}</span><span>${p.n}<br><small>${p.m}</small></span></div>`).join('')}
        </div>`
    },
    update(el, t) {
      const gate = { x: 415, y: 445 }
      const counts = [0, 0, 0]
      let pulse = 0
      PEOPLE.forEach((p, i) => {
        const tok = q(el, `.dz-token[data-p="${i}"]`)
        const t0 = 0.9 + i * 0.56
        const laneY = [250, 445, 640][i % 3]
        const a = seg(t, t0, t0 + 1.15)
        const b = seg(t, t0 + 1.15, t0 + 1.3)
        const c = seg(t, t0 + 1.32, t0 + 2.0)
        const bin = BINS[p.o]
        let x
        let y
        let s = 1
        let o = 1
        // out of the gate a sign-in is just a face: a label would smear across the bins
        tok.classList.toggle('is-dot', c > 0)
        if (t < t0) o = 0
        else if (c <= 0) {
          const e = easeInOut(a)
          x = lerp(14, gate.x - 250, e)
          y = lerp(laneY, gate.y, e) - 24
          s = 1 - 0.35 * b
          o = 1 - b
          if (b > 0) pulse = Math.max(pulse, 1 - b)
        } else {
          const e = easeInOut(c)
          x = lerp(gate.x + 70, 548, e)
          y = lerp(gate.y, bin.y + 59, e) - 19
          s = 1
          o = e < 0.8 ? 1 : 1 - (e - 0.8) / 0.2
        }
        if (t >= t0 + 2.0) {
          o = 0
          counts[p.o]++
        }
        tok.style.opacity = String(clamp(o, 0, 1) * seg(t, t0, t0 + 0.2))
        if (x !== undefined) tok.style.transform = `translate(${x}px, ${y}px) scale(${s})`
      })
      qa(el, '[data-bin]').forEach((b, i) => (b.textContent = String(counts[i])))
      const g = q(el, '.dz-gate__pulse')
      g.style.transform = `scale(${1 + 0.18 * (1 - pulse)})`
      g.style.opacity = String(pulse * 0.9)
    },
  }

  /* 3 · Top to bottom, first match wins — and order is the policy ------------------ */
  const ORDER_RULES = [
    { name: 'Trusted office device', tone: 'allow', chip: 'Allow' },
    { name: 'Finance — off-network', tone: 'mfa', chip: 'Second factor' },
    { name: 'Block anonymised sources', tone: 'deny', chip: 'Deny' },
  ]
  SLIDES.order = {
    build(el, p, edl) {
      el.innerHTML = `
        ${text({ kicker: 'How a policy reads', title: 'Top to bottom. First match wins.', sub: 'A policy is an ordered list of rules. The first rule that matches decides the sign-in — so the order is the policy.' })}
        <div class="s-art a a-right" ${D(0.3)}>
          <div class="s-panel"></div>
          ${chainHTML(edl, { app: 'salesforce', appName: 'Salesforce', rules: ORDER_RULES })}
          <div class="ripple"></div><div class="cursor">${CURSOR}</div>
          <div class="pill a a-pop" style="position:absolute;left:70px;top:720px;--d:6.4s">${icon('move', 22)} Drag a rule to change what the policy does</div>
        </div>`
      q(el, '.chain').style.left = '70px'
    },
    update(el, t) {
      const first = [0, 1, 2]
      const second = [2, 0, 1]
      layoutChain(el, t, {
        rules: ORDER_RULES,
        appear: 0.7,
        orderAt: (tt) => {
          const p = seg(tt, 6.0, 6.8)
          return tt < 6.0 ? { order: first } : { order: second, from: first, p }
        },
        runs: [
          { at: 2.1, hit: 2, order: first, until: 5.3 },
          { at: 7.3, hit: 2, order: second },
        ],
      })
      // the drag: grab rule 3 by its handle and carry it to the top
      drive(q(el, '.cursor'), q(el, '.ripple'), t, [
        { t: 5.1, x: 760, y: 820 },
        { t: 5.8, x: 120, y: 516, click: true },
        { t: 6.0, x: 120, y: 516 },
        { t: 6.8, x: 120, y: 280 },
        { t: 7.2, x: 180, y: 300, out: true },
      ])
      // carry the grabbed card with the cursor
      const grabbed = qa(el, '.mc')[2]
      const lift = Math.sin(Math.PI * seg(t, 5.95, 6.85))
      grabbed.style.boxShadow = lift > 0 ? `0 ${18 * lift}px ${40 * lift}px rgba(22,32,44,${0.25 * lift})` : ''
    },
  }

  /* 4 · Anatomy of a rule ----------------------------------------------------------- */
  SLIDES.anatomy = {
    build(el) {
      el.innerHTML = `
        ${text({ kicker: 'Anatomy of a rule', title: 'Every rule answers three questions.', sub: 'Who it is about. When it applies. What happens then.' })}
        <div class="s-art a a-right" ${D(0.3)}>
          <div class="s-panel"></div>
          <div class="tile a a-rise" style="left:50px;top:44px;width:720px;height:176px;padding:28px 32px;--d:0.7s">
            <div class="tile__label">${icon('users', 26)} Who</div>
            <div style="display:flex;align-items:center;gap:0;margin-top:22px">
              <span class="avatar a a-pop" style="--d:1.1s">F</span>
              <span class="avatar a a-pop" style="--d:1.25s;margin-left:-14px">E</span>
              <span class="avatar a a-pop" style="--d:1.4s;margin-left:-14px">P</span>
              <span class="a a-fade" style="--d:1.65s;margin-left:22px;font:500 24px/1.2 var(--font);color:var(--ink-2)">Finance, Executives and Priya Sharma</span>
            </div>
          </div>
          <div class="tile a a-rise" style="left:50px;top:246px;width:720px;height:300px;padding:28px 32px;--d:2.0s">
            <div class="tile__label">${icon('split', 26)} If</div>
            <div class="cond a a-widen" style="margin-top:22px;--d:2.5s"><span class="cond__ic is-net">${icon('globe', 20)}</span><span class="cond__attr">Network zone</span><span class="cond__op">not in zone</span><span class="cond__val">Office Network</span></div>
            <span class="join a a-pop" style="--d:3.2s">AND</span>
            <div class="cond a a-widen" style="--d:3.45s"><span class="cond__ic is-dev">${icon('finger', 20)}</span><span class="cond__attr">Device profile</span><span class="cond__op">does not match</span><span class="cond__val">Corporate managed</span></div>
          </div>
          <div class="tile a a-rise" style="left:50px;top:572px;width:720px;height:286px;padding:28px 32px;--d:4.2s">
            <div class="tile__label">${icon('arrow', 26)} Then</div>
            <div class="decide" style="margin-top:22px">
              <div class="a a-rise dc" style="--d:4.5s">${icon('userCheck', 26, 2, 'is-allow-ic')}Allow</div>
              <div class="a a-rise dc dc--mfa" style="--d:4.62s">${icon('key', 26, 2, 'is-mfa-ic')}Require a second factor</div>
              <div class="a a-rise dc" style="--d:4.74s">${icon('alert', 26, 2, 'is-deny-ic')}Deny</div>
            </div>
            <div class="journey" style="margin-top:22px">
              <span class="step jy" data-j="0">Password</span><span class="arrow jy" data-j="1">→</span>
              <span class="step jy" data-j="2">miniOrange Push</span><span class="arrow jy" data-j="3">→</span>
              <span class="step jy is-allow" data-j="4" style="border-color:var(--pos-bd)">Signed in</span>
            </div>
          </div>
          <div class="ripple"></div><div class="cursor">${CURSOR}</div>
        </div>`
    },
    update(el, t) {
      const mfa = q(el, '.dc--mfa')
      const k = easeOut(seg(t, 6.05, 6.3))
      mfa.style.background = k > 0 ? `rgba(253,246,224,${k})` : ''
      mfa.style.borderColor = k > 0 ? '#b07a00' : ''
      mfa.style.boxShadow = k > 0 ? `inset 0 0 0 ${1.5 * k}px #b07a00` : ''
      qa(el, '.jy').forEach((j) => {
        const i = Number(j.dataset.j)
        const kk = easeOutBack(seg(t, 6.5 + i * 0.16, 6.5 + i * 0.16 + 0.4))
        j.style.opacity = String(clamp(kk, 0, 1))
        j.style.transform = `translateY(${(1 - clamp(kk, 0, 1)) * 12}px) scale(${0.9 + 0.1 * kk})`
      })
      drive(q(el, '.cursor'), q(el, '.ripple'), t, [
        { t: 5.1, x: 780, y: 880 },
        { t: 5.95, x: 400, y: 700, click: true },
        { t: 7.6, x: 430, y: 760, out: true },
      ])
    },
  }

  /* 5 · Know before you publish ------------------------------------------------------ */
  SLIDES.confidence = {
    build(el) {
      const dots = []
      for (let r = 0; r < 10; r++) for (let c = 0; c < 36; c++) dots.push(`<i data-r="${r}" data-c="${c}"></i>`)
      el.innerHTML = `
        ${text({ kicker: 'Before it goes live', title: 'Rehearse it. Attack it. See what changes.', sub: 'Every draft is tested against real sign-in situations before anyone is affected.' })}
        <div class="s-art a a-right" ${D(0.3)}>
          <div class="s-panel"></div>
          <div class="tile a a-pop cf-a" style="left:40px;top:40px;width:360px;height:400px;padding:26px;--d:0.8s">
            <div class="tile__label" style="font-size:24px">${icon('activity', 24)} Try a sign-in</div>
            ${[0, 1, 2].map((i) => `<div class="cf-bar" data-b="${i}" style="position:absolute;left:40px;top:${118 + i * 88}px;width:280px;height:56px;border-radius:14px;border:1px solid var(--line-2);background:#fff;display:flex;align-items:center;gap:12px;padding:0 14px"><span class="mc__idx" style="width:30px;height:30px;font-size:15px">${i + 1}</span><span style="height:10px;width:${[120, 150, 100][i]}px;border-radius:5px;background:#e4e8ec"></span><span class="chip ${['is-allow', 'is-mfa', 'is-deny'][i]}" style="margin-left:auto;padding:5px 10px;font-size:14px">${['Allow', 'MFA', 'Deny'][i]}</span></div>`).join('')}
            <div class="chain__token cf-tok" style="left:0;top:0;opacity:1"></div>
          </div>
          <div class="tile a a-pop" style="left:420px;top:40px;width:360px;height:400px;padding:26px;--d:1.0s">
            <div class="tile__label" style="font-size:24px">${icon('checks', 24)} Break-in test</div>
            <div style="position:absolute;left:26px;top:96px;width:132px;height:132px;perspective:600px">
              <div class="grade is-f cf-gf" style="position:absolute;inset:0">F</div>
              <div class="grade is-a cf-ga" style="position:absolute;inset:0">A</div>
            </div>
            <div style="position:absolute;left:178px;top:104px;right:22px;font:600 24px/1.2 var(--font)" class="cf-head">3 got through</div>
            <div style="position:absolute;left:178px;top:170px;right:22px;font:400 19px/1.3 var(--font);color:var(--ink-3)">13 attempts · 7 hostile</div>
            <div style="position:absolute;left:26px;right:26px;top:262px;display:flex;flex-wrap:wrap;gap:8px">
              <span class="chip is-allow cf-held" style="font-size:16px">8 held</span>
              <span class="chip is-deny cf-thru" style="font-size:16px">3 got through</span>
              <span class="chip is-grey" style="font-size:16px">0 locked out</span>
            </div>
          </div>
          <div class="tile a a-pop" style="left:40px;top:466px;width:740px;height:392px;padding:26px 30px;--d:1.2s">
            <div class="tile__label" style="font-size:24px">${icon('activity', 24)} What changes</div>
            <div style="position:absolute;left:30px;top:80px;font:700 46px/1 var(--font);letter-spacing:-.03em"><span class="cf-n">0</span> <span style="font:500 22px var(--font);color:var(--ink-3)">of 1,440 situations change</span></div>
            <div class="dotfield cf-field" style="position:absolute;left:30px;top:150px;grid-template-columns:repeat(36,14px)">${dots.join('')}</div>
          </div>
        </div>`
    },
    update(el, t) {
      // try a sign-in: a loop that lands on rule 2
      const loop = ((t - 1.6) % 2.6 + 2.6) % 2.6
      const tok = q(el, '.cf-tok')
      const alive = t > 1.6
      const y = loop < 0.9 ? lerp(92, 205, easeInOut(loop / 0.9)) : 205
      const x = loop < 0.9 ? 180 : lerp(180, 66, easeOutBack(seg(loop, 0.9, 1.25)))
      tok.style.opacity = alive ? String(1 - seg(loop, 2.2, 2.5)) : '0'
      tok.style.transform = `translate(${x}px, ${y}px)`
      qa(el, '.cf-bar').forEach((b, i) => {
        const hit = i === 1 && loop > 1.0 && loop < 2.3 && alive
        const dim = i === 2 && loop > 1.0 && loop < 2.3 && alive
        b.style.boxShadow = hit ? '0 0 0 6px rgba(176,122,0,0.2)' : 'none'
        b.style.borderColor = hit ? '#b07a00' : ''
        b.style.opacity = dim ? '0.4' : '1'
      })
      // break-in: the grade flips once
      const f = easeInOut(seg(t, 4.0, 4.7))
      const angle = 180 * f
      q(el, '.cf-gf').style.transform = `rotateX(${angle}deg)`
      q(el, '.cf-ga').style.transform = `rotateX(${angle - 180}deg)`
      const fixed = t > 4.35
      q(el, '.cf-head').textContent = fixed ? 'Nothing got through' : '3 got through'
      q(el, '.cf-held').textContent = fixed ? '11 held' : '8 held'
      q(el, '.cf-thru').textContent = fixed ? '0 got through' : '3 got through'
      q(el, '.cf-thru').className = `chip ${fixed ? 'is-grey' : 'is-deny'} cf-thru`
      // what changes: a wave of stricter situations
      const w = seg(t, 5.2, 7.0)
      q(el, '.cf-n').textContent = String(Math.round(576 * easeOut(w))).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      qa(el, '.cf-field i').forEach((d) => {
        const r = Number(d.dataset.r)
        const c = Number(d.dataset.c)
        const base = (r * 7 + c * 13) % 11 === 0 ? 'deny' : (r * 5 + c * 3) % 5 === 0 ? 'mfa' : 'allow'
        const inBand = r >= 6 && c % 3 !== 1
        const flip = inBand && w * 40 > c + r * 0.5
        const tone = flip ? 'deny' : base
        d.style.background = tone === 'deny' ? '#d01243' : tone === 'mfa' ? '#e0a526' : '#34b36b'
        d.style.opacity = flip ? '1' : '0.78'
        d.style.boxShadow = flip ? '0 0 0 2px #fff, 0 0 0 3.5px #212529' : 'none'
      })
    },
  }

  /* 6 · The tour --------------------------------------------------------------------- */
  const AGENDA = [
    ['Create a policy', 'Name it, choose its applications', 'filePlus'],
    ['Start from a template', 'Browse the gallery — or begin blank', 'store'],
    ['Build a rule', 'Who · If · Then', 'split'],
    ['Tour the canvas', 'Pan, zoom, reorder, undo, shortcuts', 'move'],
    ['Test it', 'Try a sign-in · Break-in test · What changes', 'checks'],
    ['Review & publish', 'Read it back, then ship it', 'rocket'],
  ]
  SLIDES.agenda = {
    build(el) {
      el.innerHTML = `
        ${text({ kicker: 'In this video', title: 'From blank to published.', sub: 'Six stops, in the order you would take them.' })}
        <div class="s-art a a-right" ${D(0.3)}>
          <div class="s-panel"></div>
          <div class="ag-line"></div>
          <div class="ag-list">
            ${AGENDA.map(([t, s, ic], i) => `
              <div class="ag-row a a-left" style="--d:${0.8 + i * 0.28}s">
                <span class="ag-n">${String(i + 1).padStart(2, '0')}</span>
                <div><div class="ag-t">${t}</div><div class="ag-s">${s}</div></div>
                <span class="ag-ic">${icon(ic, 28)}</span>
              </div>`).join('')}
          </div>
        </div>`
    },
    update(el, t) {
      q(el, '.ag-line').style.transform = `scaleY(${easeInOut(seg(t, 0.9, 2.6))})`
    },
  }

  /* --- chapter cards ------------------------------------------------------------------ */
  const ART = {}

  ART.create = {
    html: (edl) => `
      <div class="tile" style="left:40px;top:40px;width:660px;height:520px;padding:0;overflow:hidden">
        <div style="height:78px;display:flex;align-items:center;justify-content:space-between;padding:0 30px;border-bottom:1px solid var(--line);font:700 28px var(--font)">Name your policy <span style="color:var(--ink-3)">${icon('x', 24)}</span></div>
        <div style="padding:26px 30px">
          <div style="font:600 16px var(--font);color:var(--ink-3);letter-spacing:.06em">POLICY NAME</div>
          <div style="margin-top:12px;height:60px;border-radius:12px;border:1px solid var(--line-2);background:var(--sunken);display:flex;align-items:center;padding:0 18px;font:500 24px var(--font)"><span class="cr-type"></span><span class="cr-caret" style="width:2px;height:28px;background:var(--ink);margin-left:2px"></span></div>
          <div style="margin-top:26px;font:600 16px var(--font);color:var(--ink-3);letter-spacing:.06em">APPLICATIONS</div>
          <div style="margin-top:12px;min-height:60px;border-radius:12px;border:1px solid var(--line-2);background:var(--sunken);display:flex;align-items:center;gap:10px;padding:0 12px">
            ${[['workday', 'Workday', 1.9], ['salesforce', 'Salesforce', 2.15], ['m365', 'Microsoft 365', 2.4]].map(([id, n, d]) => `<span class="pill a a-pop" style="--d:${d}s;padding:7px 12px 7px 8px;font-size:18px;box-shadow:none">${mark(edl, id, n, 24)} ${n}</span>`).join('')}
          </div>
        </div>
        <div style="position:absolute;left:0;right:0;bottom:0;height:88px;border-top:1px solid var(--line);display:flex;align-items:center;justify-content:flex-end;gap:22px;padding:0 30px">
          <span style="font:500 21px var(--font);color:var(--ink-2)">Cancel</span>
          <span class="cr-btn" style="padding:14px 22px;border-radius:12px;background:var(--brand);color:#fff;font:600 21px var(--font)">Create policy</span>
        </div>
      </div>
      <div class="pill cr-toast" style="position:absolute;left:150px;top:600px;background:#15191e;color:#fff;border:none">${icon('check', 22)} Finance apps — secure sign-in created</div>
      <div class="ripple"></div><div class="cursor">${CURSOR}</div>`,
    update(el, t) {
      const s = 'Finance apps — secure sign-in'
      const n = Math.floor(clamp((t - 0.7) * 22, 0, s.length))
      q(el, '.cr-type').textContent = s.slice(0, n)
      q(el, '.cr-caret').style.opacity = n < s.length ? '1' : Math.floor(t * 2.2) % 2 ? '1' : '0'
      const press = t > 3.05 && t < 3.25
      q(el, '.cr-btn').style.transform = press ? 'scale(0.95)' : ''
      const k = easeOutBack(seg(t, 3.35, 3.75))
      const toast = q(el, '.cr-toast')
      toast.style.opacity = String(clamp(k, 0, 1))
      toast.style.transform = `translateY(${(1 - clamp(k, 0, 1)) * 18}px)`
      drive(q(el, '.cursor'), q(el, '.ripple'), t, [
        { t: 2.2, x: 720, y: 640 },
        { t: 3.05, x: 600, y: 520, click: true },
        { t: 4.2, x: 640, y: 600, out: true },
      ])
    },
  }

  ART.templates = {
    html: () => {
      const tones = [
        ['deny', 'mfa', 'allow'],
        ['mfa', 'allow'],
        ['deny', 'deny', 'mfa'],
        ['allow', 'mfa'],
        ['deny', 'allow', 'mfa'],
        ['mfa', 'deny'],
      ]
      const names = ['Zero-Trust baseline', 'Adaptive device trust', 'Block compromised', 'Require MFA', 'Managed devices', 'New country']
      return `${tones
        .map(
          (tt, i) => `
        <div class="tile tp-card" data-c="${i}" style="left:${40 + (i % 3) * 232}px;top:${60 + Math.floor(i / 3) * 280}px;width:214px;height:258px;padding:0;overflow:hidden">
          <div style="height:150px;background:var(--sunken);background-image:radial-gradient(circle at 1px 1px, rgba(33,37,41,.1) 1.2px, transparent 1.6px);background-size:16px 16px;padding:18px 16px;display:flex;flex-direction:column;gap:8px">
            ${tt.map((tone, k) => `<div style="display:flex;align-items:center;gap:8px;height:30px;padding:0 8px;border-radius:8px;background:#fff;border:1px solid var(--line)"><span style="font:600 12px var(--mono);color:var(--ink-3)">${k + 1}</span><span style="flex:1;height:6px;border-radius:3px;background:#e4e8ec"></span><span class="chip is-${tone}" style="padding:3px 7px;font-size:11px">${{ allow: 'Allow', mfa: 'MFA', deny: 'Deny' }[tone]}</span></div>`).join('')}
          </div>
          <div style="padding:14px 16px;font:600 18px/1.2 var(--font)">${names[i]}</div>
          <div class="tp-use" style="position:absolute;right:14px;bottom:14px;padding:7px 14px;border-radius:9px;border:1px solid var(--line-2);font:600 15px var(--font)">Use</div>
        </div>`,
        )
        .join('')}<div class="ripple"></div><div class="cursor">${CURSOR}</div>`
    },
    update(el, t) {
      qa(el, '.tp-card').forEach((c, i) => {
        const k = easeOutBack(seg(t, 0.5 + i * 0.1, 0.5 + i * 0.1 + 0.5))
        const lifted = i === 1 ? easeOut(seg(t, 1.9, 2.3)) : 0
        c.style.opacity = String(clamp(k, 0, 1))
        c.style.transform = `translateY(${(1 - clamp(k, 0, 1)) * 30 - lifted * 12}px) scale(${1 + lifted * 0.03})`
        c.style.boxShadow = lifted ? `0 ${24 * lifted}px ${50 * lifted}px rgba(22,32,44,${0.22 * lifted})` : ''
        c.style.zIndex = i === 1 ? '3' : '1'
      })
      const use = qa(el, '.tp-use')[1]
      const on = t > 2.75
      use.style.background = on ? '#4a5560' : ''
      use.style.color = on ? '#fff' : ''
      use.style.borderColor = on ? '#4a5560' : ''
      drive(q(el, '.cursor'), q(el, '.ripple'), t, [
        { t: 1.6, x: 700, y: 620 },
        { t: 2.7, x: 492, y: 300, click: true },
        { t: 3.8, x: 520, y: 340, out: true },
      ])
    },
  }

  ART.rule = {
    html: () => `
      <div style="position:absolute;left:40px;top:40px;display:flex;align-items:center;gap:14px">
        ${['Who', 'If', 'Then'].map((s, i) => `${i ? '<span class="rl-link" data-l="' + i + '" style="width:70px;height:3px;border-radius:2px;background:var(--line-2)"></span>' : ''}<span class="pill rl-step" data-s="${i}">${icon(['users', 'split', 'arrow'][i], 22)} ${s}</span>`).join('')}
      </div>
      <div class="tile" style="left:40px;top:150px;width:660px;height:430px;padding:30px">
        <div style="display:flex;align-items:center;gap:14px;font:700 28px var(--font)"><span class="mc__idx">1</span>Finance — off-network <span class="chip is-mfa" style="margin-left:auto">Second factor</span></div>
        <div class="rl-row" data-r="0" style="margin-top:28px;display:flex;align-items:center;gap:0">
          <span style="width:64px;font:600 18px var(--font);color:var(--ink-3)">who</span>
          <span class="avatar" style="width:44px;height:44px;font-size:18px">F</span><span class="avatar" style="width:44px;height:44px;font-size:18px;margin-left:-10px">E</span><span class="avatar" style="width:44px;height:44px;font-size:18px;margin-left:-10px">P</span>
        </div>
        <div class="rl-row" data-r="1" style="margin-top:22px;display:flex;align-items:center;gap:10px">
          <span style="width:54px;font:600 18px var(--font);color:var(--ink-3)">if</span>
          <span class="cond" style="height:46px;font-size:17px"><span class="cond__attr">Network zone</span><span class="cond__op" style="font-size:15px">not in zone</span><span class="cond__val">Office Network</span></span>
        </div>
        <div class="rl-row" data-r="2" style="margin-top:22px;display:flex;align-items:center;gap:10px">
          <span style="width:54px;font:600 18px var(--font);color:var(--ink-3)">then</span>
          <span class="journey" style="font-size:17px"><span class="step">Password</span><span class="arrow">→</span><span class="step">miniOrange Push</span><span class="arrow">→</span><span class="step">Signed in</span></span>
        </div>
      </div>`,
    update(el, t) {
      qa(el, '.rl-step').forEach((s, i) => {
        const k = seg(t, 0.8 + i * 0.8, 1.1 + i * 0.8)
        s.style.background = k > 0.5 ? '#212529' : '#fff'
        s.style.color = k > 0.5 ? '#fff' : ''
        s.style.transform = `scale(${1 + 0.08 * Math.sin(Math.PI * k)})`
      })
      qa(el, '.rl-link').forEach((l) => {
        const i = Number(l.dataset.l)
        l.style.background = t > 0.6 + i * 0.8 ? '#212529' : ''
      })
      qa(el, '.rl-row').forEach((r, i) => {
        const k = easeOut(seg(t, 0.9 + i * 0.8, 1.4 + i * 0.8))
        r.style.opacity = String(k)
        r.style.transform = `translateX(${(1 - k) * -24}px)`
      })
    },
  }

  ART.canvas = {
    html: (edl) => `
      <div class="tile" style="left:40px;top:40px;width:660px;height:540px;padding:0;overflow:hidden;background:#f8f9fa;background-image:radial-gradient(circle at 1px 1px, rgba(33,37,41,.12) 1.2px, transparent 1.6px);background-size:22px 22px">
        <div class="cv-world" style="position:absolute;left:0;top:0;width:660px;height:540px;transform-origin:330px 270px">
          ${chainHTML(edl, { app: 'workday', appName: 'Workday', rules: TITLE_RULES })}
        </div>
        <div class="pill" style="position:absolute;left:50%;bottom:22px;transform:translateX(-50%);gap:18px;padding:10px 18px">${icon('minus', 20)}<span class="cv-z" style="font:600 18px var(--mono);min-width:56px;text-align:center">100%</span>${icon('plus', 20)}<span style="width:1px;height:22px;background:var(--line-2)"></span>${icon('maximize', 20)}</div>
      </div>
      <div class="ripple"></div><div class="cursor">${CURSOR}</div>`,
    after(el) {
      const c = q(el, '.chain')
      c.style.left = '70px'
      c.style.top = '40px'
      c.style.transform = 'scale(0.78)'
      c.style.transformOrigin = '0 0'
    },
    update(el, t) {
      layoutChain(el, t, { rules: TITLE_RULES, appear: 0.3, runs: [] })
      const pan = easeInOut(seg(t, 1.0, 2.0))
      const zoom = easeInOut(seg(t, 2.4, 3.2))
      const fit = easeInOut(seg(t, 3.6, 4.2))
      const dx = lerp(0, 60, pan) * (1 - fit)
      const dy = lerp(0, -40, pan) * (1 - fit)
      const z = lerp(1, 1.35, zoom * (1 - fit))
      q(el, '.cv-world').style.transform = `translate(${dx}px, ${dy}px) scale(${z})`
      q(el, '.cv-z').textContent = `${Math.round(z * 100)}%`
      drive(q(el, '.cursor'), q(el, '.ripple'), t, [
        { t: 0.6, x: 520, y: 460 },
        { t: 1.0, x: 520, y: 460, click: true },
        { t: 2.0, x: 580, y: 420 },
        { t: 3.5, x: 455, y: 556 },
        { t: 3.65, x: 455, y: 556, click: true },
        { t: 4.6, x: 480, y: 600, out: true },
      ])
      q(el, '.cursor').style.filter = t > 1.0 && t < 2.0 ? 'drop-shadow(0 8px 10px rgba(0,0,0,.35))' : ''
    },
  }

  ART.test = {
    html: (edl) => `
      <div class="tile" style="left:40px;top:40px;width:660px;height:560px;padding:0;overflow:hidden">
        <div class="ts-chain" style="position:absolute;left:0;top:0;transform:scale(0.85);transform-origin:0 0">${chainHTML(edl, { app: 'jira', appName: 'Jira', rules: TITLE_RULES })}</div>
        <div style="position:absolute;right:30px;bottom:30px;width:132px;height:132px;perspective:600px">
          <div class="grade is-f ts-gf" style="position:absolute;inset:0">D</div>
          <div class="grade is-a ts-ga" style="position:absolute;inset:0">A</div>
        </div>
      </div>`,
    after(el) {
      q(el, '.chain').style.left = '40px'
      q(el, '.chain').style.top = '20px'
    },
    update(el, t) {
      layoutChain(el, t, { rules: TITLE_RULES, appear: 0.3, runs: [{ at: 1.0, hit: 0 }] })
      const f = easeInOut(seg(t, 2.8, 3.4))
      q(el, '.ts-gf').style.transform = `rotateX(${180 * f}deg)`
      q(el, '.ts-ga').style.transform = `rotateX(${180 * f - 180}deg)`
    },
  }

  ART.publish = {
    html: () => `
      <div class="tile" style="left:40px;top:40px;width:660px;height:520px;padding:0;overflow:hidden">
        <div style="height:78px;display:flex;align-items:center;gap:14px;padding:0 30px;border-bottom:1px solid var(--line);font:700 28px var(--font)">Review your policy <span class="chip is-grey pb-status" style="margin-left:auto">Draft</span></div>
        ${[
          ['Block anonymised sources', 'deny', 'Deny', 'in zone Anonymizers', 'Access is blocked.'],
          ['Finance — off-network', 'mfa', 'MFA', 'not in zone Office Network', 'Second factor, then signed in.'],
        ]
          .map(
            ([n, tone, c, iff, then], i) => `
          <div class="a a-rise" style="--d:${0.6 + i * 0.25}s;margin:20px 30px 0;padding:18px 20px;border-radius:14px;border:1px solid var(--line);background:var(--sunken)">
            <div style="display:flex;align-items:center;gap:12px;font:600 21px var(--font)"><span class="mc__idx" style="width:32px;height:32px;font-size:15px">${i + 1}</span>${n}<span class="chip is-${tone}" style="margin-left:auto;font-size:15px">${c}</span></div>
            <div style="margin-top:12px;font:500 17px/1.5 var(--mono);color:var(--ink-2)"><b style="color:var(--ink)">IF:</b> ${iff}<br><b style="color:var(--ink)">THEN:</b> → ${then}</div>
          </div>`,
          )
          .join('')}
        <div style="position:absolute;left:0;right:0;bottom:0;height:88px;border-top:1px solid var(--line);display:flex;align-items:center;justify-content:flex-end;gap:22px;padding:0 30px">
          <span style="font:500 21px var(--font);color:var(--ink-2)">Cancel</span>
          <span class="pb-btn" style="padding:14px 22px;border-radius:12px;background:var(--brand);color:#fff;font:600 21px var(--font)">Confirm &amp; Save</span>
        </div>
      </div>
      <div class="pill pb-toast" style="position:absolute;left:70px;top:600px;background:#15191e;color:#fff;border:none">${icon('check', 22)} Published — switched off until you turn it on</div>
      <div class="ripple"></div><div class="cursor">${CURSOR}</div>`,
    update(el, t) {
      q(el, '.pb-btn').style.transform = t > 2.4 && t < 2.6 ? 'scale(0.95)' : ''
      const on = t > 2.65
      const st = q(el, '.pb-status')
      st.textContent = on ? 'Inactive' : 'Draft'
      st.className = `chip ${on ? 'is-info' : 'is-grey'} pb-status`
      const k = easeOutBack(seg(t, 2.8, 3.2))
      const toast = q(el, '.pb-toast')
      toast.style.opacity = String(clamp(k, 0, 1))
      toast.style.transform = `translateY(${(1 - clamp(k, 0, 1)) * 18}px)`
      drive(q(el, '.cursor'), q(el, '.ripple'), t, [
        { t: 1.6, x: 720, y: 660 },
        { t: 2.4, x: 580, y: 520, click: true },
        { t: 3.6, x: 620, y: 600, out: true },
      ])
    },
  }

  SLIDES.chapter = {
    build(el, p, edl) {
      const art = ART[p.art]
      el.innerHTML = `
        <div class="s-text">
          <div class="ch-n a a-rise" ${D(0.35)}>${p.n}</div>
          <div class="s-kicker a a-left" ${D(0.5)}><i></i>${p.kicker ?? 'Chapter ' + Number(p.n)}</div>
          <h1 class="s-title">${p.title.split(' ').map((w, i) => `<span class="s-w a a-rise" ${D(0.62 + i * 0.08)}>${w}</span>`).join(' ')}</h1>
          <p class="s-sub a a-rise" ${D(0.95)}>${p.sub}</p>
        </div>
        <div class="ch-art a a-right" ${D(0.45)}>${art ? art.html(edl) : ''}</div>`
      art?.after?.(el)
    },
    update(el, t, dur, p) {
      ART[p.art]?.update(el, t)
    },
  }

  SLIDES.step = {
    build(el, p) {
      const ic = { Who: 'users', If: 'split', Then: 'arrow' }[p.title] ?? 'split'
      el.innerHTML = `
        <div class="st-card">
          <div class="st-top"><span class="st-k">Build a rule · Step ${p.n} of ${p.total ?? 3}</span>
            <span class="st-dots">${Array.from({ length: p.total ?? 3 }, (_, i) => `<span class="${i + 1 === p.n ? 'is-on' : i + 1 < p.n ? 'is-done' : ''}"></span>`).join('')}</span></div>
          <div class="st-t"><span class="st-ic a a-pop" ${D(0.25)}>${icon(ic, 56, 2)}</span><span class="a a-rise" ${D(0.32)}>${p.title}</span></div>
          <div class="st-s a a-rise" ${D(0.45)}>${p.sub}</div>
        </div>`
    },
  }

  SLIDES.outro = {
    build(el) {
      const chips = [
        ['filePlus', 'Create'],
        ['store', 'Templates'],
        ['split', 'Who · If · Then'],
        ['move', 'Canvas'],
        ['checks', 'Test'],
        ['rocket', 'Publish'],
      ]
      el.innerHTML = `
        <div class="ou-wrap">
          <img class="t-logo a a-pop" ${D(0.3)} src="${LOGO}" alt="">
          <h1 class="ou-title">${['Write', 'it.', 'Test', 'it.', 'Publish', 'it.'].map((w, i) => `<span class="s-w a a-rise" style="display:inline-block;--d:${0.6 + i * 0.1}s">${w}</span>`).join(' ')}</h1>
          <div class="ou-sub a a-rise" ${D(1.4)}>Xecurify Policy Engine — the flow builder</div>
          <div class="ou-chips">${chips.map(([ic, l], i) => `<span class="a a-pop" style="--d:${1.8 + i * 0.12}s"><span class="pill a-float" style="--d:${-i * 0.7}s">${icon(ic, 22)} ${l}</span></span>`).join('')}</div>
        </div>`
    },
  }

  window.SLIDES = SLIDES
})()

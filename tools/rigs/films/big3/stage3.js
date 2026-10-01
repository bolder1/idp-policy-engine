/* The stage's page code: scenes, shots, steps, the console camera. Loaded
   as a plain script, so no template-literal escaping to fight. */
(() => {
  const $ = (s, r = document) => r.querySelector(s)
  const $$ = (s, r = document) => [...r.querySelectorAll(s)]
  const W = window.__WIN
  const T = (ms) => ms * (window.__slow || 1)

  /* ---------- icons (24 grid, stroked) ---------- */
  const P = {
    pin: '<path d="M12 21s-7-6.2-7-11.2A7 7 0 0 1 19 9.8C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.6"/>',
    laptop: '<rect x="4" y="5" width="16" height="11" rx="1.6"/><path d="M2 19.5h20"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.1-4 4-6 7.5-6s6.4 2 7.5 6"/>',
    shield: '<path d="M12 3l7.5 3v5.5c0 4.8-3.2 8-7.5 9.8-4.3-1.8-7.5-5-7.5-9.8V6z"/><path d="M8.6 12.2l2.4 2.4 4.6-4.8"/>',
    print: '<path d="M12 11v3.5c0 2.5-.6 4.4-1.8 6"/><path d="M8.5 20c1-1.6 1.5-3.4 1.5-5.5V11a2 2 0 0 1 4 0v2"/><path d="M6.2 17.5c.5-1.2.8-2.4.8-3.8V11a5 5 0 0 1 10 0v2.5"/><path d="M17 17c.3-1 .5-2 .5-3"/><path d="M4.5 13.5V11a7.5 7.5 0 0 1 12.8-5.3"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    win: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
    office: '<rect x="5" y="3" width="10" height="18" rx="1.2"/><path d="M15 9h4v12h-4M8 7h1.5M11 7h1.5M8 11h1.5M11 11h1.5M8 15h1.5M11 15h1.5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.2"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/>',
    chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2.5v3M15 2.5v3M9 18.5v3M15 18.5v3M2.5 9h3M2.5 15h3M18.5 9h3M18.5 15h3"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/>',
    disk: '<ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6"/><path d="M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8"/>',
    cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 12h8M8 15h5"/>',
    mark: '<path d="M4 12a8 8 0 1 0 16 0" /><path d="M12 4v8l5 3"/>',
  }
  const ic = (n, cls = '') => '<span class="ic ' + cls + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + P[n] + '</svg></span>'
  const tick = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  let wi = 0
  const words = (s, cls = '') => s.split(' ').map((w) => '<span class="w ' + cls + '" style="--i:' + (wi++) + '">' + w + '</span>').join(' ')
  const kt = (cls, top, size, lines) => { wi = 0; return '<div class="kt ' + cls + '" style="top:' + top + 'px;font-size:' + size + 'px">' + lines.map(([t, c]) => words(t, c)).join('<br>') + '</div>' }
  const tagline = (n, t) => '<div class="tagline"><b>' + n + '</b><i></i>' + t + '</div>'

  /* ---------- scenes ---------- */
  const SC = {
    intro() {
      const rows = [
        ['priya@acme.com', 'Pune, IN', 'Company laptop', '09:12'],
        ['priya@acme.com', 'Lagos, NG', 'Unknown Android phone', '03:12'],
        ['rahul@acme.com', 'Café wifi', 'Personal phone', '10:40'],
        ['anita@acme.com', 'Pune, IN', 'Windows 10, no screen lock', '11:05'],
        ['vikram@acme.com', 'Unknown IP', 'Rooted phone', '01:47'],
        ['rahul@acme.com', 'Airport wifi', 'Shared laptop', '18:22'],
        ['priya@acme.com', 'Pune, IN', 'Company laptop', '19:30'],
      ]
      const log = '<div class="logwrap"><div class="ui log"><div class="lh"><span>User</span><span>Location</span><span>Device</span><span>Time</span><span>Result</span></div>' +
        rows.map((r, i) => '<div class="lr rise" style="transition-delay:' + (i * 90) + 'ms"><span class="who">' + r[0] + '</span><span>' + r[1] + '</span><span>' + r[2] + '</span><span class="t">' + r[3] + '</span>' +
          '<span class="res"><span class="pill p-ok pop" style="transition-delay:' + (500 + i * 150) + 'ms">' + ic('check') + 'Allowed</span></span></div>').join('') + '</div></div>'
      const dots = Array.from({ length: 11 }, (_, i) => '<i class="dot" style="--i:' + i + '"></i>').join('')
      return '<div class="sc sc-intro">' +
        '<div class="shot" data-k="a"><div class="cam">' + kt('ka', 400, 104, [['For years, a sign-in asked'], ['one question.', 'o']]) + '</div></div>' +
        '<div class="shot" data-k="b"><div class="cam"><div class="fit" style="--fit:1.3"><div class="ui signin"><div class="brandrow"><i></i>Acme</div><h2>Sign in</h2>' +
          '<p class="fl">Email</p><div class="fd">priya@acme.com</div><p class="fl">Password</p><div class="fd focus">' + dots + '<span class="caret"></span></div>' +
          '<div class="sbtn"><span class="t1">Sign in</span><span class="t2">' + ic('check') + 'Signed in</span></div></div></div></div></div>' +
        '<div class="shot" data-k="c"><div class="cam"><div class="fit" style="--fit:1.08">' + log + '</div></div></div>' +
        '<div class="shot" data-k="d"><div class="cam">' + kt('kd1', 360, 96, [['A password knows who typed it.']]) + kt('kd2', 500, 96, [['Not where. Not on what.', 'o']]) + '</div></div>' +
        '<div class="shot" data-k="e"><div class="cam"><div class="three">' +
          '<div class="glass rim q" style="--i:0">' + ic('pin') + 'Where</div><div class="link" style="--i:0"></div>' +
          '<div class="glass rim q" style="--i:1">' + ic('laptop') + 'Device</div><div class="link" style="--i:1"></div>' +
          '<div class="glass rim q" style="--i:2">' + ic('user') + 'Who</div></div></div></div>' +
        '<div class="shot" data-k="f"><div class="flute"><div class="fb1"></div><div class="fb2"></div><div class="ribs"></div><div class="shade"></div></div><div class="cam">' +
          '<div class="lockup"><div class="glass rim mk">' + ic('shield') + '</div><span class="w nm" style="--i:0">Xecurify</span><span class="w pe" style="--i:1">Policy engine</span></div>' +
          '<div class="lockup-sub">Every sign-in, decided by your rules.</div></div></div>' +
        '</div>'
    },

    zone() {
      const ping = (cls, x, y, ip, label = true) => '<div class="ping ' + cls + '" style="left:' + (x - 9) + 'px;top:' + (y - 9) + 'px"><span class="pd"></span><span class="chip">' +
        (label ? '<span class="l">Sign-in</span>' : '') + '<span class="mono">' + ip + '</span><span class="res i pill p-ok">' + ic('check') + 'Inside</span><span class="res x pill p-mut">Outside</span></span></div>'
      const rule = (n, name, pill, pc, op) => '<div class="ui rcard" style="position:relative"><div class="rh"><span class="n">' + n + '</span>' + name + '<span class="pill ' + pc + '">' + pill + '</span></div>' +
        '<div class="cond"><span class="kw">IF</span><span class="fld">Network zone</span><span>' + op + '</span><span class="slot"><span class="fill">' + ic('pin') + 'Pune office</span></span></div></div>'
      return '<div class="sc sc-zone">' + tagline('01', 'Zones') +
        '<div class="shot" data-k="a"><div class="cam">' +
          '<div class="map"><canvas class="cbase"></canvas><canvas class="cst"></canvas><canvas class="cct"></canvas></div><canvas class="cfine"></canvas>' +
          '<div class="hero"><h1 class="rise">Zones</h1><p class="rise">A named place.</p></div>' +
          ping('a1', 1089, 351, '198.51.100.7') + ping('a2', 965, 646, '49.207.212.18') + ping('a3', 1101, 835, '203.0.113.42') +
          '<svg class="ringsvg" viewBox="0 0 1920 1080"><circle class="rg" cx="1100" cy="560" r="230"/><line class="rad" x1="1100" y1="560" x2="1330" y2="560"/>' +
            '<circle class="pc" cx="1100" cy="560" r="8"/></svg><div class="mlab" style="left:1100px;top:516px">Pune</div><div class="mlab" style="left:1222px;top:528px;font-size:20px">25 km</div>' +
          '<div class="office rise"><div class="glass rim ob">' + ic('office') + '</div><div class="ol">Office network<span>203.0.113.0/24</span></div></div>' +
          ping('c1', 1150, 650, '49.207.212.18', false) + ping('c2', 1512, 452, '203.0.113.42', false) + ping('c3', 1480, 820, '198.51.100.7', false) +
          '<div class="ui zcard"><div class="uh"><span class="ib">' + ic('pin') + '</span><div>New zone<span class="sub">Locations and networks</span></div></div>' +
            '<div class="sect">Locations</div>' +
            '<div class="ur r1"><span class="k">Country</span><span class="v">India</span></div>' +
            '<div class="ur r2"><span class="k">State</span><span class="v">Maharashtra</span></div>' +
            '<div class="ur r3"><span class="k">City</span><span class="v">Pune</span><span class="pill p-o">within 25 km</span></div>' +
            '<div class="sect">IP networks</div>' +
            '<div class="ur r4"><span class="k">Range</span><span class="v mono">203.0.113.0/24</span></div></div>' +
        '</div></div>' +
        '<div class="shot" data-k="b"><div class="cam">' +
          '<div class="glass rim named rise"><span class="cap2">The zone</span>' + ic('pin') + 'Pune office</div>' +
          '<svg class="wires" viewBox="0 0 1920 1080"><path class="w1" d="M560 520 C 720 520, 700 298, 860 298"/><path class="w2" d="M560 520 C 720 520, 700 510, 860 510"/><path class="w3" d="M560 520 C 720 520, 700 722, 860 722"/></svg>' +
          '<div class="rules">' + rule(1, 'Office laptop in Pune', 'Allow', 'p-ok', 'is in') + rule(2, 'Anywhere else', 'Second factor', 'p-warn', 'is not in') + rule(3, 'Payroll, on site only', 'Deny', 'p-bad', 'is not in') + '</div>' +
        '</div></div>' +
        '</div>'
    },

    device() {
      const chk = (i, icn, nm, vv, extra = '') => '<div class="chk c' + i + ' ' + extra + '"><span class="ci">' + ic(icn) + '</span><span class="nm">' + nm + '</span>' + (i === 1 ? '<span class="flab">FLOOR</span>' : '') + '<span class="vv">' + vv + '</span><span class="bx">' + tick + '</span></div>'
      const dev = (i, nm, sub, pill, pc) => '<div class="dev v' + i + '"><span class="di">' + ic('laptop') + '</span><span class="dn">' + nm + '<span>' + sub + '</span></span><span class="pill ' + pc + '">' + pill + '</span></div>'
      const sig = (i, icn, t) => '<div class="sig"><span class="ck" style="--i:' + i + '"><svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>' + ic(icn) + t + '</div>'
      return '<div class="sc sc-device">' + tagline('02', 'Device profiles') +
        '<div class="shot" data-k="a"><div class="cam"><div class="fit" style="--fit:1.12"><div class="kinds">' +
          '<div class="ui kind" style="position:relative;--i:0"><div class="bigic" style="background:#e7f7ee;color:#16a34a">' + ic('shield') + '</div><h3>Device health</h3><p>A checklist the machine must pass on every sign-in.</p></div>' +
          '<div class="ui kind" style="position:relative;--i:1"><div class="bigic" style="background:#eaf2ff;color:#2166d9">' + ic('print') + '</div><h3>Trusted device</h3><p>A machine the console has seen before.</p></div>' +
        '</div></div></div></div>' +
        '<div class="shot" data-k="b"><div class="cam"><div class="fit" style="--fit:1.12">' +
          '<div class="ui hcard"><div class="uh"><span class="ib" style="background:#e7f7ee;color:#16a34a">' + ic('shield') + '</span><div>Office laptops<span class="sub">Device health</span></div></div>' +
            chk(1, 'win', 'Windows', 'Windows 11 or newer') + chk(2, 'lock', 'Screen lock', 'Required') + chk(3, 'shield', 'Device integrity', 'Intact') + '</div>' +
          '<div class="devs">' + dev(1, 'Windows 11, 24H2', 'Newer than the floor', 'Passes', 'p-ok') + dev(2, 'Windows 11', 'On the floor', 'Passes', 'p-ok') + dev(3, 'Windows 10', 'Below the floor', 'Stops here', 'p-bad') + '</div>' +
        '</div></div></div>' +
        '<div class="shot" data-k="c"><div class="cam"><div class="fit" style="--fit:1.1">' +
          '<div class="ui incoming"><div class="uh"><span class="ib" style="background:#eaf2ff;color:#2166d9">' + ic('laptop') + '</span><div>Sign-in from a laptop<span class="sub">priya@acme.com · just now</span></div></div>' +
            '<div class="sigs">' + sig(0, 'chip', 'Hardware ID') + sig(1, 'key', 'TPM key') + sig(2, 'disk', 'Disk serial') + sig(3, 'cpu', 'OS build') + '</div></div>' +
          '<svg class="hitwire" viewBox="0 0 1920 1080"><path d="M782 540 C 840 540, 850 529, 902 529"/></svg>' +
          '<div class="ui reg"><div class="uh"><span class="ib" style="background:#eaf2ff;color:#2166d9">' + ic('print') + '</span><div>Known devices<span class="sub">Trusted device · Known laptops</span></div></div>' +
            '<div class="rh2"><span>Device</span><span>First seen</span><span>Signals</span></div>' +
            '<div class="rr r1"><span class="dn2">PRIYA-LT-0142</span><span class="fs">12 Mar</span><span>4 of 4</span><span class="same pill p-ok pop">' + ic('check') + 'Same machine</span></div>' +
            '<div class="rr"><span class="dn2">RAHUL-LT-0087</span><span class="fs">3 Apr</span><span>4 of 4</span><span></span></div>' +
            '<div class="rr"><span class="dn2">ANITA-MB-0033</span><span class="fs">19 May</span><span>4 of 4</span><span></span></div></div>' +
        '</div></div></div>' +
        '<div class="shot" data-k="d"><div class="cam">' + kt('k1', 300, 72, [['Your rule hears one word.', 'm']]) + kt('k2', 440, 170, [['Match.', 'g']]) + kt('k3', 640, 110, [['Or no match.', 'm']]) + '</div></div>' +
        '</div>'
    },

    outcome() {
      return '<div class="sc sc-outcome">' + tagline('03', 'Outcomes') +
        '<div class="shot" data-k="a"><div class="cam"><div class="fit" style="--fit:1.08"><div class="outs">' +
          '<div class="ui oc c1" style="position:relative"><span class="olab p-ok">' + ic('check') + 'Allow</span><div class="scr"><div class="appbar"><i></i>GitHub</div>' +
            '<div class="welcome"><h4>Welcome back, Priya</h4><p>Signed in with a password</p></div><div class="sk" style="width:70%"></div><div class="sk" style="width:52%"></div><div class="sk" style="width:62%"></div>' +
            '<div class="bigok"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div></div></div>' +
          '<div class="ui oc c2" style="position:relative"><span class="olab p-warn">' + ic('phone') + 'Allow, after a second factor</span><div class="scr">' +
            '<div class="phone"><div class="ps"><div class="nt"><b>Acme sign-in</b>Your code for GitHub<div class="code">482 913</div></div><div class="btns"><span class="d">Deny</span><span class="a">Approve</span></div></div></div>' +
            '<div class="methods"><span class="pill p-o">Any enabled method</span><span class="pill p-mut">Authenticator</span><span class="pill p-mut">SMS</span></div></div></div>' +
          '<div class="ui oc c3" style="position:relative"><span class="olab p-bad">' + ic('x') + 'Deny</span><div class="scr"><div class="denied"><h4>Sign in to GitHub</h4>' +
            '<div class="alert">' + ic('alert') + '<span class="typed"></span></div><div class="fdd"></div><div class="bdd"></div></div></div></div>' + '</div>' +
        '</div></div></div>' +
        '</div>'
    },

    order() {
      const row = (id, n, name, sm, pill, pc) => '<div class="rr2 ' + id + '" data-id="' + id + '"><span class="n">' + n + '</span><span>' + name + '<span class="sm">' + sm + '</span></span>' +
        '<span class="tag2 x">NO MATCH</span><span class="tag2 y">' + (id === 'rd' ? 'LANDS HERE' : 'MATCH') + '</span><span class="pill ' + pc + '">' + pill + '</span></div>'
      return '<div class="sc sc-order">' + tagline('04', 'Order') +
        '<div class="shot" data-k="a"><div class="cam">' +
          '<div class="oline"></div>' +
          '<div class="board">' +
            row('r1', 1, 'Rooted or jailbroken', 'Device profile · Rooted', 'Deny', 'p-bad') +
            row('r2', 2, 'Office laptop in Pune', 'Office laptops · Pune office', 'Allow', 'p-ok') +
            row('r3', 3, 'Everyone else', 'No conditions', 'Second factor', 'p-warn') +
            '<div class="rr2 rd def" data-id="rd"><span class="n">' + ic('lock') + '</span><span>Nothing else matched<span class="sm">The default · always last</span></span><span class="lockt">' + ic('lock') + 'Can’t be deleted</span>' +
              '<span class="tag2 y">LANDS HERE</span><span class="pill p-bad">Deny</span></div>' +
          '</div>' +
          '<div class="glass rim tok t1"><span class="tu">' + ic('user') + 'priya</span><span class="d">Pune office · Office laptop</span></div>' +
          '<div class="glass tok t2"><span class="tu">' + ic('user') + 'contractor</span><span class="d">Berlin · unknown laptop</span></div>' +
          '<div class="res2"><span class="s2">The answer</span><span class="rt"></span></div>' +
        '</div></div>' +
        '</div>'
    },

    close() {
      const rows = [
        ['priya@acme.com', 'Pune office', 'Office laptop', '09:12', '<span class="pill p-ok">' + ic('check') + 'Allow</span>'],
        ['priya@acme.com', 'Hotel wifi', 'Office laptop', '21:40', '<span class="pill p-warn">' + ic('phone') + 'Allow, after a second factor</span>'],
        ['unknown', 'Unknown IP', 'Rooted phone', '03:12', '<span class="pill p-bad">' + ic('x') + 'Deny</span>'],
      ]
      const log = '<div class="logwrap" style="top:250px"><div class="ui log log2"><div class="lh"><span>User</span><span>Location</span><span>Device</span><span>Time</span><span>Result</span></div>' +
        rows.map((r, i) => '<div class="lr rise" style="height:96px;font-size:23px;transition-delay:' + (i * 120) + 'ms"><span class="who">' + r[0] + '</span><span>' + r[1] + '</span><span>' + r[2] + '</span><span class="t">' + r[3] + '</span>' +
          '<span class="res ans"><span class="pop a' + (i + 1) + '">' + r[4] + '</span></span></div>').join('') + '</div></div>'
      return '<div class="sc sc-close">' +
        '<div class="shot" data-k="a"><div class="cam"><div class="fit" style="--fit:1.1">' + log + '</div></div></div>' +
        '<div class="shot" data-k="b"><div class="flute"><div class="fb1"></div><div class="fb2"></div><div class="ribs"></div><div class="shade"></div></div><div class="cam">' +
          '<div class="lockup"><div class="glass rim mk">' + ic('shield') + '</div><span class="w nm" style="--i:0">Xecurify</span><span class="w pe" style="--i:1">Policy engine</span></div>' +
          '<div class="lockup-sub">Every sign-in, decided by your rules.</div></div></div>' +
        '</div>'
    },
  }

  /* ---------- the dot-matrix map (zone scene) ---------- */
  /* India, from real longitude/latitude points (coarse, but a true outline),
     projected equirectangular with the cosine of 22°N. Only ever drawn as dots. */
  const GEO_IN = [[77.0,35.5],[78.2,35.3],[79.5,34.2],[78.8,32.6],[79.0,31.1],[80.2,30.2],[81.1,30.0],[82.5,27.5],[84.0,27.4],[85.8,26.6],[88.0,26.4],[88.2,27.2],[88.8,27.4],
    [89.8,26.7],[92.0,26.9],[92.1,27.8],[94.0,29.0],[96.0,29.4],[97.4,28.2],[96.2,27.2],[95.2,26.5],[94.6,25.0],[94.1,23.5],[93.3,22.0],[92.6,22.8],[92.2,24.2],[91.4,24.1],
    [91.9,25.2],[90.0,25.2],[89.8,25.9],[88.2,26.2],[88.4,24.3],[88.9,22.8],[89.0,21.7],[87.5,21.5],[86.8,20.4],[85.2,19.5],[84.2,18.3],[82.3,16.6],[81.2,15.8],[80.2,15.2],
    [80.3,13.4],[79.8,11.8],[79.8,10.3],[78.9,9.3],[77.5,8.1],[76.5,8.9],[75.8,11.3],[74.8,12.9],[74.1,14.8],[73.4,16.5],[72.9,18.9],[72.7,20.6],[72.6,21.5],[72.3,22.3],
    [71.0,20.8],[70.0,21.0],[69.0,22.3],[68.4,23.5],[70.0,24.2],[71.0,24.5],[70.1,25.4],[69.5,26.5],[70.5,27.8],[72.0,28.8],[73.5,29.9],[74.5,31.0],[74.6,32.5],[74.0,33.0],
    [73.8,34.5],[74.2,35.0],[75.5,36.0]]
  const GEO_MH = [[72.6,20.1],[73.4,21.1],[74.2,21.7],[76.0,21.4],[78.5,21.6],[80.3,21.6],[80.9,20.5],[80.3,19.4],[79.2,18.9],[78.0,18.2],[77.4,17.0],[76.4,15.9],[74.3,15.7],[73.5,15.8],[73.2,17.5],[72.8,19.0]]
  const K = 31, CX = 0.927
  const prj = ([lon, lat]) => [1250 + (lon - 82.8) * CX * K, 540 - (lat - 22.5) * K]
  const pathOf = (pts) => { const p = new Path2D(); pts.map(prj).forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); return p }
  const PUNE = prj([73.86, 18.52])
  const Z = { state: { s: 1.7, at: prj([76.7, 19.0]), to: [1180, 560] }, city: { s: 3, at: PUNE, to: [1100, 560] } }
  const camOf = (z) => ({ s: z.s, tx: z.to[0] - z.at[0] * z.s, ty: z.to[1] - z.at[1] * z.s })
  const CAMS = { none: 'translate(0px,0px) scale(1)' }
  for (const k of ['state', 'city']) { const c = camOf(Z[k]); CAMS[k] = 'translate(' + c.tx + 'px,' + c.ty + 'px) scale(' + c.s + ')' }
  const BOX = { x: 800, y: 60, w: 900, h: 960 }, RES = 2.5
  const RING = 230
  function drawMap(root) {
    const IN = pathOf(GEO_IN), MH = pathOf(GEO_MH)
    const probe = document.createElement('canvas').getContext('2d')
    const cs = $$('.map canvas', root)
    const ctxs = cs.map((c) => {
      c.width = BOX.w * RES; c.height = BOX.h * RES
      c.style.left = BOX.x + 'px'; c.style.top = BOX.y + 'px'; c.style.width = BOX.w + 'px'; c.style.height = BOX.h + 'px'
      const g = c.getContext('2d'); g.scale(RES, RES); g.translate(-BOX.x, -BOX.y); return g
    })
    const rc = RING / Z.city.s
    const d = (g, x, y, r, col) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = col; g.fill() }
    for (let y = BOX.y; y < BOX.y + BOX.h; y += 11) {
      for (let x = BOX.x; x < BOX.x + BOX.w; x += 11) {
        if (!probe.isPointInPath(IN, x, y)) continue
        d(ctxs[0], x, y, 2.3, 'rgba(255,128,88,.62)')
        if (probe.isPointInPath(MH, x, y)) d(ctxs[1], x, y, 2.5, 'rgba(255,150,110,.95)')
        if (Math.hypot(x - PUNE[0], y - PUNE[1]) <= rc) { ctxs[2].shadowColor = 'rgba(255,150,110,.9)'; ctxs[2].shadowBlur = 6; d(ctxs[2], x, y, 2.7, '#ffc2a8') }
      }
    }
    /* the city, redrawn at its own scale: a zoomed coarse grid turns into
       marbles, so the close view gets a fine grid of its own */
    const cc = camOf(Z.city)
    const f = $('.cfine', root); f.width = 1920 * 2; f.height = 1080 * 2
    const h = f.getContext('2d'); h.scale(2, 2)
    for (let y = 6; y < 1080; y += 13) {
      for (let x = 6; x < 1920; x += 13) {
        const ux = (x - cc.tx) / cc.s, uy = (y - cc.ty) / cc.s
        if (!probe.isPointInPath(IN, ux, uy)) continue
        h.shadowBlur = 0
        if (Math.hypot(x - Z.city.to[0], y - Z.city.to[1]) <= RING) { h.shadowColor = 'rgba(255,150,110,.9)'; h.shadowBlur = 8; d(h, x, y, 3.2, '#ffc2a8') }
        else d(h, x, y, 2.4, probe.isPointInPath(MH, ux, uy) ? 'rgba(255,138,96,.62)' : 'rgba(255,128,88,.34)')
      }
    }
  }
  window.__prj = prj

  /* ---------- the order scene's rows ---------- */
  const ORD = { order: ['r1', 'r2', 'r3'], top: 150, gap: 150, def: 480 }
  const rowY = (id) => ORD.top + (id === 'rd' ? ORD.def : ORD.order.indexOf(id) * ORD.gap)
  function layoutRows() {
    $$('.rr2').forEach((r) => { const id = r.dataset.id; if (id !== 'rd' && !ORD.order.includes(id)) return; r.style.top = (rowY(id) - ORD.top) + 'px' })
    ORD.order.forEach((id, i) => { const n = $('.rr2.' + id + ' .n'); if (n) n.textContent = i + 1 })
  }

  let typeTimer = null
  const st = {
    lit(on) { document.body.classList.toggle('lit', !!on) },
    tone(t) { document.body.classList.remove('warm', 'cool'); if (t) document.body.classList.add(t) },
    hold(state) { const h = $('#hold'); h.classList.toggle('off', state === 'off') },
    url(p) { $('#url').innerHTML = '&#128274; <b>login.xecurify.com</b>' + p },
    cap(text) {
      const e = $('#cap'); if (!text) { e.classList.remove('on'); return }
      e.style.width = ''; e.textContent = text
      /* a wrapped line leaves the box at max-width; shrink it to the widest line */
      const r = document.createRange(); r.selectNodeContents(e)
      const lines = [...r.getClientRects()]
      if (lines.length > 1) e.style.width = Math.ceil(Math.max(...lines.map((x) => x.width)) + 50) + 'px'
      e.classList.add('on')
    },
    /* the console camera: centre a box (screen coordinates, as Playwright
       measures them, current transform included) at scale s, and never let
       the window's edge into the frame. */
    cam: { s: 1, tx: 0, ty: 0 },
    camTo(box, s, fx = 960, fy = 540) {
      const w = $('#win'), c0 = st.cam
      if (!box || s === 1) st.cam = { s: 1, tx: 0, ty: 0 }
      else {
        const ux = (box.x + box.width / 2 - W.x - c0.tx) / c0.s, uy = (box.y + box.height / 2 - W.y - c0.ty) / c0.s
        let tx = fx - W.x - ux * s, ty = fy - W.y - uy * s
        tx = Math.min(-W.x, Math.max(1920 - W.x - W.w * s, tx)); ty = Math.min(-W.y, Math.max(1080 - W.y - W.h * s, ty))
        st.cam = { s, tx, ty }
      }
      w.style.transform = st.cam.s === 1 ? '' : 'translate(' + st.cam.tx + 'px,' + st.cam.ty + 'px) scale(' + st.cam.s + ')'
    },
    scene(name) {
      const e = $('#scene')
      if (typeTimer) { clearInterval(typeTimer); typeTimer = null }
      if (!name) { e.classList.remove('on'); setTimeout(() => { if (!e.classList.contains('on')) e.innerHTML = '' }, T(700)); return }
      e.innerHTML = SC[name]()
      if (name === 'zone') drawMap(e)
      if (name === 'order') { ORD.order = ['r1', 'r2', 'r3']; layoutRows() }
      void e.offsetWidth; e.classList.add('on')
    },
    shot(k) {
      $$('#scene .shot.on').forEach((s) => { s.classList.remove('on'); s.classList.add('gone'); setTimeout(() => s.classList.remove('gone'), T(900)) })
      const n = $('#scene .shot[data-k="' + k + '"]'); if (n) { n.classList.remove('gone'); void n.offsetWidth; n.classList.add('on') }
    },
    step(name, on) { const r = $('#scene .sc'); if (r) r.classList.toggle('s-' + name, on !== false) },
    sc(sel, cls, on) { $$('#scene ' + sel).forEach((el) => el.classList.toggle(cls, on !== false)) },
    mapcam(k) { const m = $('#scene .map'); if (m) m.style.transform = CAMS[k] },
    wireflow() {
      ;[1, 2, 3].forEach((i) => {
        setTimeout(() => $('#scene .wires .w' + i)?.classList.add('on'), T((i - 1) * 260))
        setTimeout(() => $$('#scene .slot .fill')[i - 1]?.classList.add('on'), T((i - 1) * 260 + 700))
      })
    },
    typeInto(sel, text, ms = 38) {
      const e = $('#scene ' + sel); if (!e) return; let i = 0; e.textContent = ''
      if (typeTimer) clearInterval(typeTimer)
      typeTimer = setInterval(() => { e.textContent = text.slice(0, ++i); if (i >= text.length) { clearInterval(typeTimer); typeTimer = null } }, T(ms))
    },
    /* a sign-in token runs down the board; the first match stops it */
    run(tok, steps, answer, cls) {
      const t = $('#scene .tok.' + tok), res = $('#scene .res2'), rt = $('#scene .res2 .rt'); if (!t || !res) return
      $$('#scene .rr2').forEach((r) => r.classList.remove('no', 'hit', 'skip'))
      res.classList.remove('on')
      t.style.top = (ORD.top - 110) + 'px'; t.classList.add('on')
      let at = 350
      steps.forEach((s, i) => {
        setTimeout(() => { if (t.isConnected) t.style.top = (rowY(s.id) + 58 - 44) + 'px' }, T(at)); at += 480
        setTimeout(() => {
          const row = $('#scene .rr2.' + s.id); if (!row || !res) return; row.classList.add(s.hit ? 'hit' : 'no')
          if (s.hit) {
            $$('#scene .rr2').forEach((r) => { if (r.dataset.id !== 'rd' && !ORD.order.includes(r.dataset.id)) return; if (rowY(r.dataset.id) > rowY(s.id)) r.classList.add('skip') })
            rt.textContent = answer; rt.style.color = cls; res.style.top = (rowY(s.id) + 58 - 52) + 'px'; res.classList.add('on')
          }
        }, T(at)); at += 340
      })
    },
    clearRun() { $$('#scene .rr2').forEach((r) => r.classList.remove('no', 'hit', 'skip')); $('#scene .res2')?.classList.remove('on'); $$('#scene .tok').forEach((t) => t.classList.remove('on')) },
    swap(a, b) { const o = ORD.order, i = o.indexOf(a), j = o.indexOf(b); [o[i], o[j]] = [o[j], o[i]]; layoutRows() },
    del(id) { const r = $('#scene .rr2.' + id); if (!r) return; r.classList.add('del'); setTimeout(() => { r.classList.add('gone'); ORD.order = ORD.order.filter((x) => x !== id); layoutRows() }, T(500)) },
  }
  window.__st = st

  /* slow motion for the stage (this document only — never the console iframe) */
  window.__slow = 1
  const pace = () => { const r = 1 / window.__slow; for (const a of document.getAnimations()) if (a.playbackRate !== r) a.playbackRate = r }
  window.__setSlow = (k) => { window.__slow = k; pace() }
  for (const ev of ['transitionrun', 'transitionstart', 'animationstart']) document.addEventListener(ev, pace, true)

  /* film grain, drawn once */
  const g = document.createElement('canvas'); g.width = g.height = 256
  const gx = g.getContext('2d'), im = gx.createImageData(256, 256)
  for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255 }
  gx.putImageData(im, 0, 0); $('#grain').style.backgroundImage = 'url(' + g.toDataURL() + ')'
})()

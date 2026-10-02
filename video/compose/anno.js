/* The card scene's truth panel: how the rule reads once a group is inside it.
   Data-driven — `truthHtml(rule)` takes the four phrases of a rule and prints
   the expression, the sub-line and the four-row table; this film's rule
   (Finance — off the office network) is the default. The engine positions it,
   fades it and lights its rows (drawAnno, by `data-row`); this only says what
   it says. */
;(() => {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1)
  const DEFAULT_RULE = {
    who: 'Finance, Executives or Priya Sharma',
    cond: 'not on Office Network',
    groupA: 'unmanaged device',
    groupB: 'Anonymizer network',
  }
  const chip = (t) => `<span class="ov-truth__chip">${esc(t)}</span>`
  const kw = (t, cls) => `<span class="ov-truth__kw ${cls}">${t}</span>`
  const cell = (v) => `<td class="${v === 'yes' ? 'is-yes' : 'is-no'}">${v}</td>`
  const row = (n, a, b, result) => `<tr data-row="${n}">${cell(a)}${cell(b)}<td class="${result ? 'is-true' : 'is-false'}">${result ? 'true' : 'false'}</td></tr>`
  const truthHtml = (rule = DEFAULT_RULE) => `
    <div class="ov-truth__title">How the rule reads</div>
    <div class="ov-truth__expr">
      ${chip(rule.who)} ${kw('AND', 'is-and')} ${chip(rule.cond)} ${kw('AND', 'is-and')}
      <span class="ov-truth__group"><span class="ov-truth__paren">(</span>${chip(rule.groupA)} ${kw('OR', 'is-or')} ${chip(rule.groupB)}<span class="ov-truth__paren">)</span></span>
    </div>
    <div class="ov-truth__sub">Outside the group, every check must hold. Inside it, one is enough.</div>
    <table class="ov-truth__table">
      <thead><tr><th>${esc(cap(rule.groupA))}</th><th>${esc(cap(rule.groupB))}</th><th>The group</th></tr></thead>
      <tbody>
        ${row(1, 'yes', 'no', true)}
        ${row(2, 'no', 'yes', true)}
        ${row(3, 'yes', 'yes', true)}
        ${row(4, 'no', 'no', false)}
      </tbody>
    </table>`
  window.ANNO = { truthHtml, DEFAULT_RULE }
})()

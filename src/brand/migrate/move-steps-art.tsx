import './move-steps-art.css'

/* -----------------------------------------------------------------------------
   The four pictures on Move policies (owner, 6 Nov 2026: "add SVGs here for better
   understanding"). Plain and generic: grey cards, one blue for what is new, one green
   for active. No product names, no numbers.
   -------------------------------------------------------------------------- */

/** 1: an old policy's checks come out as two reusable parts. */
export function ArtParts() {
  return (
    <svg className="bma" viewBox="0 0 240 150" aria-hidden>
      <rect x="10" y="22" width="92" height="106" rx="10" className="bma__old" />
      <rect x="22" y="36" width="44" height="6" rx="3" className="bma__bar" />
      <rect x="22" y="56" width="68" height="16" rx="5" className="bma__chip" />
      <rect x="22" y="80" width="68" height="16" rx="5" className="bma__chip" />
      <rect x="22" y="104" width="50" height="6" rx="3" className="bma__bar is-soft" />
      <path d="M96 64 C 120 64, 120 44, 140 44" className="bma__wire" />
      <path d="M96 88 C 120 88, 120 108, 140 108" className="bma__wire" />
      <rect x="140" y="22" width="90" height="44" rx="10" className="bma__new" />
      <circle cx="160" cy="44" r="9" className="bma__icobg" />
      <path d="M160 38 a4.5 4.5 0 0 1 4.5 4.5 c0 3.4 -4.5 7.5 -4.5 7.5 s-4.5 -4.1 -4.5 -7.5 a4.5 4.5 0 0 1 4.5 -4.5 z" className="bma__ico" />
      <rect x="176" y="38" width="42" height="5" rx="2.5" className="bma__bar is-blue" />
      <rect x="176" y="48" width="28" height="4" rx="2" className="bma__bar is-soft" />
      <rect x="140" y="86" width="90" height="44" rx="10" className="bma__new" />
      <circle cx="160" cy="108" r="9" className="bma__icobg" />
      <rect x="154.5" y="103" width="11" height="8" rx="1.5" className="bma__ico" />
      <path d="M157 114 h6" className="bma__ico" />
      <rect x="176" y="102" width="42" height="5" rx="2.5" className="bma__bar is-blue" />
      <rect x="176" y="112" width="28" height="4" rx="2" className="bma__bar is-soft" />
    </svg>
  )
}

/** 2: a rule card, who / if / then. */
export function ArtRule() {
  const row = (y: number, k: string, w: number, tone = '') => (
    <g>
      <text x="34" y={y + 4} className="bma__k">{k}</text>
      <rect x="70" y={y - 6} width={w} height="14" rx="5" className={`bma__chip${tone}`} />
    </g>
  )
  return (
    <svg className="bma" viewBox="0 0 240 150" aria-hidden>
      <rect x="24" y="14" width="192" height="122" rx="12" className="bma__new" />
      <rect x="34" y="26" width="54" height="7" rx="3.5" className="bma__bar is-blue" />
      <path d="M24 44 H216" className="bma__line" />
      {row(62, 'who', 70)}
      {row(88, 'if', 110, ' is-blue')}
      {row(114, 'then', 92, ' is-green')}
    </svg>
  )
}

/** 3: one policy, wired to three applications. */
export function ArtPolicy() {
  return (
    <svg className="bma" viewBox="0 0 240 150" aria-hidden>
      {[40, 120, 200].map((x) => (
        <g key={x}>
          <path d={`M${x} 40 V58 H120 V70`} className="bma__wire" />
          <rect x={x - 18} y="8" width="36" height="32" rx="9" className="bma__app" />
          <rect x={x - 8} y="19" width="16" height="10" rx="3" className="bma__bar" />
        </g>
      ))}
      <rect x="52" y="70" width="136" height="70" rx="12" className="bma__new" />
      <path d="M120 80 l9 3.5 v7 c0 6 -4 9.5 -9 11.5 c-5 -2 -9 -5.5 -9 -11.5 v-7 z" className="bma__ico" />
      <rect x="70" y="112" width="100" height="6" rx="3" className="bma__bar is-blue" />
      <rect x="84" y="124" width="72" height="5" rx="2.5" className="bma__bar is-soft" />
    </svg>
  )
}

/** 4: a checklist, then the switch to active. */
export function ArtActive() {
  const item = (y: number) => (
    <g>
      <circle cx="46" cy={y} r="7" className="bma__tick" />
      <path d={`M42.5 ${y} l2.5 2.5 l4.5 -5`} className="bma__tickmark" />
      <rect x="60" y={y - 3} width="70" height="6" rx="3" className="bma__bar" />
    </g>
  )
  return (
    <svg className="bma" viewBox="0 0 240 150" aria-hidden>
      <rect x="24" y="14" width="124" height="122" rx="12" className="bma__new is-plain" />
      {item(40)}
      {item(70)}
      {item(100)}
      <path d="M148 75 H168" className="bma__wire" />
      <rect x="168" y="56" width="58" height="38" rx="19" className="bma__switch" />
      <circle cx="207" cy="75" r="13" className="bma__knob" />
    </svg>
  )
}

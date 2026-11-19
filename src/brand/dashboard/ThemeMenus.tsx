import { useMemo, useRef, useState } from 'react'
import { Check, LayoutDashboard, Palette } from 'lucide-react'
import { Button } from '../kit'
import { AnchoredPopover } from '../screens/testing/AnchoredPopover'
import type { WidgetId } from './catalog'
import { arrange, toSpecs, type ArrangeMode, type Row } from './layout'
import { MiniRows } from './mini'
import { BRAND_SWATCHES, THEMES, THEME_IDS, type ThemeId } from './themes'

/* -----------------------------------------------------------------------------
   The Customize bar's two choices that change the whole dashboard at once,
   and the colour choice on a single widget.

   · Theme: how the widgets are coloured (themes.ts). Each choice is drawn in
     its own colours, so the list is its own preview; the dashboard recolours
     behind the panel as you choose. Brand and Brand accent use the tenant's
     brand colour, picked under them.
   · Arrange: the widgets laid out again by a rule. Each rule is drawn as the
     layout it would make of this dashboard's own widgets.
   · A widget's colour: the dashboard's theme, or one of its own.
   -------------------------------------------------------------------------- */

/** A theme drawn small, in its own colours: a wave over bars. */
export function ThemeSwatch({ theme }: { theme?: ThemeId }) {
  return (
    <span className="bdash-swatch" data-dash-theme={theme} aria-hidden>
      <svg viewBox="0 0 56 32" preserveAspectRatio="none">
        <rect className="is-b1" x="4" y="18" width="6" height="12" rx="1.5" />
        <rect className="is-b2" x="13" y="12" width="6" height="18" rx="1.5" />
        <rect className="is-b3" x="22" y="21" width="6" height="9" rx="1.5" />
        <rect className="is-b4" x="31" y="15" width="6" height="15" rx="1.5" />
        <path className="is-wave" d="M2 22C9 22 11 8 19 8s9 11 16 10 9-12 19-12" />
      </svg>
    </span>
  )
}

export function ThemePicker({ value, brand, onTheme, onBrand }: { value: ThemeId; brand: string; onTheme: (t: ThemeId) => void; onBrand: (c: string) => void }) {
  const anchor = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const custom = /^#[0-9a-f]{6}$/i.test(brand)
  return (
    <span ref={anchor} className="bdash-anchor">
      <Button variant="neutral" icon={Palette} expanded={open} onClick={() => setOpen((v) => !v)}>
        Theme
      </Button>
      <AnchoredPopover anchor={anchor} open={open} onClose={() => setOpen(false)} label="Theme" width={340}>
        <div className="bdash-pop bdash-vars" data-chrome style={{ ['--dash-brand' as string]: brand }}>
          <div className="bdash-pick-list" role="radiogroup" aria-label="Theme">
            {THEME_IDS.map((id) => (
              <button key={id} type="button" role="radio" aria-checked={value === id} className={`bdash-option${value === id ? ' is-on' : ''}`} onClick={() => onTheme(id)}>
                <ThemeSwatch theme={id} />
                <span className="bdash-option__text">
                  <b>{THEMES[id].name}</b>
                  <span>{THEMES[id].line}</span>
                </span>
                {value === id && <Check size={16} strokeWidth={2.4} aria-hidden className="bdash-option__tick" />}
              </button>
            ))}
          </div>
          {(value === 'brand' || value === 'accent') && (
            <div className="bdash-brandpick">
              <span className="bdash-pop__label">Brand colour</span>
              <div className="bdash-brandpick__dots" role="radiogroup" aria-label="Brand colour">
                {BRAND_SWATCHES.map((s) => (
                  <button key={s.label} type="button" role="radio" aria-checked={brand === s.value} aria-label={s.label} title={s.label} className={`bdash-dot${brand === s.value ? ' is-on' : ''}`} style={{ background: s.value }} onClick={() => onBrand(s.value)} />
                ))}
                <label className={`bdash-dot is-custom${custom ? ' is-on' : ''}`} title="Your own colour" style={custom ? { background: brand } : undefined}>
                  <input type="color" aria-label="Your own brand colour" value={custom ? brand : '#3f5f8f'} onChange={(e) => onBrand(e.target.value)} />
                </label>
              </div>
            </div>
          )}
        </div>
      </AnchoredPopover>
    </span>
  )
}

/** A widget's own colour: the dashboard's theme (drawn in it), or any theme. */
export function ColourList({ value, boardTheme, onPick }: { value: ThemeId | null; boardTheme: ThemeId; onPick: (t: ThemeId | null) => void }) {
  const options: { id: ThemeId | null; name: string; swatch: ThemeId }[] = [{ id: null, name: 'Dashboard theme', swatch: boardTheme }, ...THEME_IDS.map((id) => ({ id, name: THEMES[id].name, swatch: id }))]
  return (
    <div className="bdash-pop is-compact" role="radiogroup" aria-label="Colour">
      {options.map((o) => (
        <button key={o.id ?? 'board'} type="button" role="radio" aria-checked={value === o.id} className={`bdash-option is-small${value === o.id ? ' is-on' : ''}`} onClick={() => onPick(o.id)}>
          <ThemeSwatch theme={o.swatch} />
          <span className="bdash-option__text">
            <b>{o.name}</b>
            {o.id === null && <span>{THEMES[boardTheme].name}</span>}
          </span>
          {value === o.id && <Check size={16} strokeWidth={2.4} aria-hidden className="bdash-option__tick" />}
        </button>
      ))}
    </div>
  )
}

const MODES: { id: ArrangeMode; name: string; line: string }[] = [
  { id: 'tidy', name: 'Tidy up', line: 'Same order, balanced rows' },
  { id: 'type', name: 'By type', line: 'Numbers, then charts, lists and tables' },
  { id: 'need', name: 'By need', line: 'Posture, sign-ins, policies, people, admin' },
]

export function ArrangeMenu({ rows, pinned, onArrange }: { rows: Row[]; pinned?: WidgetId; onArrange: (mode: ArrangeMode) => void }) {
  const anchor = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  /* Each rule drawn as what it would make of these widgets. */
  const previews = useMemo(() => (open ? MODES.map((m) => toSpecs(arrange(rows, m.id, pinned))) : []), [open, rows, pinned])
  return (
    <span ref={anchor} className="bdash-anchor">
      <Button variant="neutral" icon={LayoutDashboard} expanded={open} onClick={() => setOpen((v) => !v)} disabled={rows.length === 0}>
        Arrange
      </Button>
      <AnchoredPopover anchor={anchor} open={open} onClose={() => setOpen(false)} label="Arrange" width={360}>
        <div className="bdash-pop" data-chrome>
          <div className="bdash-pick-list">
            {MODES.map((m, i) => (
              <button
                key={m.id}
                type="button"
                className="bdash-option is-arrange"
                onClick={() => {
                  onArrange(m.id)
                  setOpen(false)
                }}
              >
                <span className="bdash-option__pic">{previews[i] && <MiniRows rows={previews[i]} scale={0.045} max={96} />}</span>
                <span className="bdash-option__text">
                  <b>{m.name}</b>
                  <span>{m.line}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </AnchoredPopover>
    </span>
  )
}

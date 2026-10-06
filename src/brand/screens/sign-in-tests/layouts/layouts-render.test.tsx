import type { ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { showcaseTenant } from '../../../fixtures'
import { BrandProvider } from '../../../store'
import { columnView, runColumns, type ColumnSpec } from '../../board/try-sign-in'
import { envOf } from '../../tenant-resolver'
import { rowsRead } from '../../testing/rows-read'
import { screensOf } from '../../testing/screens-of'
import { TestingSessionProvider } from '../../testing/session'
import { factsOf, formOf, originPatch, type SignInForm } from '../../testing/sign-in-form'
import { engineRun } from '../engine-run'
import { RUN_LAYOUTS } from '../run-layout'
import { emptyDraft, forRun, withDefaults } from '../sign-in-card'
import ChatLayout from './ChatLayout'
import DeckLayout from './DeckLayout'
import DepthLayout from './DepthLayout'
import GatesLayout from './GatesLayout'
import JarvisLayout from './JarvisLayout'
import Jarvis2Layout from './Jarvis2Layout'
import ClassicV2Layout from './ClassicV2Layout'
import LineLayout from './LineLayout'
import MarbleLayout from './MarbleLayout'
import TreeLayout from './TreeLayout'
import PulseLayout from './PulseLayout'
import FocusLayout from './FocusLayout'
import Focus2Layout from './Focus2Layout'
import BriefLayout from './BriefLayout'
import CircuitLayout from './CircuitLayout'
import StreamLayout from './StreamLayout'
import BentoLayout from './BentoLayout'
import DirectionsLayout from './DirectionsLayout'
import ExplainerLayout from './ExplainerLayout'
import PassLayout from './PassLayout'
import MissionLayout from './MissionLayout'
import SynapseLayout from './SynapseLayout'
import type { RunLayoutProps } from './types'

/* -----------------------------------------------------------------------------
   Every layout on the Canvas switch (run-layout.ts) draws ANY run the plan can
   describe without throwing, and always says the answer: rendered over the
   showcase tenant's own sign-ins — every saved one, every application with
   several people, from the office, from home and from a Tor exit, the device
   not stated — at the first step, mid-run and settled. Static markup only (no
   effects run): it proves the drawing never breaks, not how it moves; the
   motion is checked in the browser.
   -------------------------------------------------------------------------- */

const LAYOUTS: Record<Exclude<(typeof RUN_LAYOUTS)[number]['value'], 'column'>, ComponentType<RunLayoutProps>> = {
  classic2: ClassicV2Layout,
  line: LineLayout,
  tree: TreeLayout,
  gates: GatesLayout,
  marble: MarbleLayout,
  chat: ChatLayout,
  deck: DeckLayout,
  depth: DepthLayout,
  jarvis: JarvisLayout,
  jarvis2: Jarvis2Layout,
  mission: MissionLayout,
  synapse: SynapseLayout,
  pulse: PulseLayout,
  focus: FocusLayout,
  focus2: Focus2Layout,
  brief: BriefLayout,
  circuit: CircuitLayout,
  stream: StreamLayout,
  bento: BentoLayout,
  directions: DirectionsLayout,
  explainer: ExplainerLayout,
  pass: PassLayout,
}

const TODAY = '2026-10-02'
const t = showcaseTenant()
const env = envOf(t)
const lib = { zones: t.zones, fingerprints: t.fingerprints }
const AS_IT_STANDS: ColumnSpec = { id: 'live', label: 'As the tenant stands', tip: 'Every policy as saved' }
const noop = () => {}

/* The sign-in as the panel would send it: the application's facts filled with the defaults, then trimmed to what its rules read. */
function asRun(f: SignInForm): SignInForm {
  const rows = rowsRead(t.policies, null, f.appId, lib)
  return forRun(withDefaults(f, rows, [], TODAY, '09:30'), rows)
}

function propsFor(form: SignInForm, at: 'first' | 'mid' | 'settled'): RunLayoutProps {
  const rows = rowsRead(t.policies, null, form.appId, lib)
  const { facts } = factsOf(form, t.zones)
  const cols = runColumns([AS_IT_STANDS], t.policies, facts, env)
  const res = cols[0].resolution
  const ctx = { people: t.directory.people, apps: t.apps, zones: t.zones, rows }
  const plan = engineRun({ res, policies: t.policies, form, facts, env, ctx, intro: 'none' })
  const last = plan.steps.length - 1
  const s = at === 'first' ? 0 : at === 'mid' ? Math.floor(last / 2) : last
  const running = at !== 'settled'
  return {
    plan,
    s,
    running,
    animate: false,
    reduced: true,
    jumped: at === 'settled',
    runKey: 2,
    form,
    rows,
    asGroup: null,
    start: <div className="test-start" />,
    answer: <div className="test-answer" />,
    screens: screensOf(res, { policies: t.policies, methods: t.methods, defaultMethodId: undefined, person: t.directory.people.find((p) => p.id === form.personId) ?? null }),
    columns: cols.map((c) => columnView(c, '', t.policies, (id) => t.apps.find((a) => a.id === id)?.name ?? id)),
    changed: null,
    expected: null,
    weaker: null,
    onPressPerson: noop,
    onAdd: noop,
    onOpenPolicy: noop,
    onOpenRule: noop,
    onAsGroup: noop,
  }
}

/* The sign-ins: every saved one, then every application with several people from the office, a few from home and from Tor, and with the device not stated. */
const people = t.directory.people.slice(0, 6).map((p) => p.id)
const forms: { name: string; form: SignInForm }[] = [
  ...t.savedSignIns.map((sv) => ({ name: `saved ${sv.name}`, form: formOf(sv.facts, t.zones) })),
  ...t.apps.flatMap((a) => people.map((pid) => ({ name: `${pid} on ${a.name}`, form: asRun({ ...emptyDraft(TODAY, '09:30'), personId: pid, appId: a.id }) }))),
  ...t.apps.slice(0, 6).flatMap((a) =>
    (['home', 'tor'] as const).map((o) => ({ name: `${people[1]} on ${a.name} from ${o}`, form: asRun({ ...emptyDraft(TODAY, '09:30'), ...originPatch(o), personId: people[1], appId: a.id }) })),
  ),
  ...t.apps.slice(0, 6).map((a) => ({ name: `${people[2]} on ${a.name}, device not stated`, form: { ...asRun({ ...emptyDraft(TODAY, '09:30'), personId: people[2], appId: a.id }), device: { kind: 'none' } } as SignInForm })),
]

const render = (Layout: ComponentType<RunLayoutProps>, p: RunLayoutProps) =>
  renderToStaticMarkup(
    <BrandProvider>
      <TestingSessionProvider>
        <Layout {...p} />
      </TestingSessionProvider>
    </BrandProvider>,
  )

describe('every run layout draws every showcase sign-in', () => {
  it('has one module for each choice on the switch', () => {
    /* Classic is the host's own column (EngineJourney), not a layout module. */
    expect(Object.keys(LAYOUTS).sort()).toEqual(RUN_LAYOUTS.map((l) => l.value).filter((v) => v !== 'column').sort())
    expect(forms.length).toBeGreaterThan(80)
  })

  for (const [id, Layout] of Object.entries(LAYOUTS)) {
    it(`${id}: never throws — at the first step, mid-run and settled — and names the application once settled`, () => {
      for (const { name, form } of forms) {
        for (const at of ['first', 'mid', 'settled'] as const) {
          const p = propsFor(form, at)
          let out = ''
          expect(() => {
            out = render(Layout, p)
          }, `${id} · ${name} · ${at}`).not.toThrow()
          if (at === 'settled' && !p.plan.empty) expect(out.length, `${id} · ${name}`).toBeGreaterThan(200)
        }
      }
    }, 120_000)
  }
})

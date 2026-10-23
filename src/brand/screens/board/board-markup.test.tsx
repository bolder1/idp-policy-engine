import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { fallbackRule } from '../../data'
import { DecisionBadge } from '../../decision-badge'
import { showcaseTenant } from '../../fixtures'
import { BrandProvider, useNameLookup } from '../../store'
import { ReadOnlyCanvas } from '../sign-in-tests/InspectPanel'
import { Board } from './Board'
import { IfBlock } from './IfBlock'
import { RuleCard, TerminalCard } from './RuleCard'

/* -----------------------------------------------------------------------------
   THE BUILDER, BYTE FOR BYTE (Check access v3, 20 Oct 2026). v3 draws a run on
   the builder's own canvas through opt-in props on Board, RuleCard,
   TerminalCard and IfBlock (`run`, `idPrefix`, the terminal's `mark`). With
   them absent, the builder must render exactly as it did before they were
   added: this markup was recorded from the tree BEFORE the opt-ins were written
   (the files under `__markup__/`), and every later render without them is
   compared with it, character for character.

   Re-record only for a deliberate change to the builder's own canvas (delete
   the file and run the suite once), never to make a v3 change pass.
   -------------------------------------------------------------------------- */

const t = showcaseTenant()
const gw = t.policies.find((p) => p.name === 'Access the app through corporate devices only')!
const aws = t.policies.find((p) => p.id === 'sc-aws-engineering')!
const noop = () => {}
const render = (node: ReactNode) => renderToStaticMarkup(<BrandProvider>{node}</BrandProvider>)

/* The builder's own Board, as BoardBuilder hands it a saved policy: one card open, nothing selected. */
function Builder({ policy }: { policy: typeof gw }) {
  const resolve = useNameLookup()
  return (
    <div className="bb">
      <Board
        policy={policy}
        destination="Google Workspace"
        destinationAppId={policy.appIds[0] ?? null}
        destinationMore={0}
        audienceNames={['Sales', 'Finance', 'Engineering']}
        selection={{ kind: 'none' }}
        diagnostics={[]}
        shadowed={[]}
        fitKey="edit"
        resolve={resolve}
        onSelect={noop}
        onInsert={noop}
        onMove={noop}
        onToggle={noop}
        onDuplicate={noop}
        onDelete={noop}
        onHover={noop}
        expandedOf={(id) => id === policy.rules[0]?.id || id === 'fallback'}
        onToggleExpand={noop}
        tools={<span className="test-tools" />}
        aside={<span className="test-aside" />}
      />
    </div>
  )
}

/* One card of each kind, and the block, drawn alone. */
function Cards({ policy }: { policy: typeof gw }) {
  const resolve = useNameLookup()
  const r = policy.rules[0]
  return (
    <>
      <RuleCard
        rule={r}
        index={0}
        openPart={null}
        state="ready"
        shadowed={false}
        dragging={false}
        expanded
        resolve={resolve}
        canUp={false}
        canDown
        onOpen={noop}
        onToggleExpand={noop}
        onToggle={noop}
        onMove={noop}
        onDuplicate={noop}
        onDelete={noop}
        onGrip={noop}
        onHover={noop}
        cardRef={noop}
      />
      <TerminalCard rule={policy.fallback ?? fallbackRule()} resolve={resolve} selected={false} expanded onSelect={noop} onToggleExpand={noop} cardRef={noop} />
      <IfBlock rule={r} resolve={resolve} />
      <IfBlock terminal rule={policy.fallback ?? fallbackRule()} resolve={resolve} />
    </>
  )
}

/* `fallbackRule()` mints a fresh id per call: the terminal's id is never in the markup, but its keys are stable here. */
const stable = (html: string) => html

describe('the builder without the run opt-ins, as recorded before they were written', () => {
  it('Board: Google Workspace and AWS, as the builder draws them', async () => {
    await expect(stable(render(<Builder policy={gw} />))).toMatchFileSnapshot('./__markup__/board-gw.html')
    await expect(stable(render(<Builder policy={aws} />))).toMatchFileSnapshot('./__markup__/board-aws.html')
  })

  it('Board read only: the details slider and the app tab framed', async () => {
    await expect(render(<ReadOnlyCanvas policy={aws} traced={[]} />)).toMatchFileSnapshot('./__markup__/read-only-aws.html')
    const head = (id: string) => (id === 'fallback' ? <DecisionBadge decision="deny" /> : <DecisionBadge decision={aws.rules.find((r) => r.id === id)!.decision} />)
    await expect(render(<ReadOnlyCanvas policy={aws} traced={[aws.rules[1].id]} framed open={aws.rules[1].id} onOpen={noop} cardHead={head} />)).toMatchFileSnapshot('./__markup__/read-only-aws-framed.html')
  })

  it('RuleCard, TerminalCard and IfBlock alone', async () => {
    await expect(render(<Cards policy={gw} />)).toMatchFileSnapshot('./__markup__/cards-gw.html')
    await expect(render(<Cards policy={aws} />)).toMatchFileSnapshot('./__markup__/cards-aws.html')
  })
})

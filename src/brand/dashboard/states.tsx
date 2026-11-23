import { RotateCw, TriangleAlert } from 'lucide-react'
import { Button } from '../kit'
import type { Kind } from './model'
import type { WidgetState } from './widget-state'
import { Empty, Head, Mark } from './widget-kit'

/* A widget's faces besides ready: the skeleton, empty and couldn't load. When each shows is widget-state.ts. */

/* ---- the faces ------------------------------------------------------------------------------------------------- */

type Shape = 'stat' | 'chart' | 'ring' | 'table' | 'rows'

const SHAPE: Record<Kind, Shape> = {
  stat: 'stat',
  area: 'chart',
  bars: 'chart',
  heat: 'chart',
  funnel: 'chart',
  tracker: 'chart',
  strip: 'chart',
  catbar: 'chart',
  donut: 'ring',
  gauge: 'ring',
  table: 'table',
  barlist: 'rows',
  list: 'rows',
  feed: 'rows',
  checklist: 'rows',
  meters: 'rows',
  grid: 'rows',
  actions: 'rows',
  form: 'rows',
  note: 'rows',
}

/** Bar heights for a chart's skeleton, as shares of its height: a gentle wave, not data. */
const WAVE = [42, 58, 50, 72, 64, 86, 70, 56, 62, 78, 66, 52]

function Skeleton({ kind }: { kind: Kind }) {
  const shape = SHAPE[kind]
  return (
    <div className={`bdw-skel is-${shape}`} aria-hidden>
      {shape === 'stat' && (
        <>
          <span className="bdw-skel__bar is-num" />
          <span className="bdw-skel__bar is-line" />
          <span className="bdw-skel__bar is-line is-short" />
        </>
      )}
      {shape === 'chart' && (
        <span className="bdw-skel__plot">
          {WAVE.map((h, i) => (
            <span key={i} className="bdw-skel__col" style={{ height: `${h}%` }} />
          ))}
        </span>
      )}
      {shape === 'ring' && (
        <>
          <span className="bdw-skel__ring" />
          <span className="bdw-skel__rows">
            {[0, 1, 2].map((i) => (
              <span key={i} className="bdw-skel__bar is-line" />
            ))}
          </span>
        </>
      )}
      {(shape === 'rows' || shape === 'table') && (
        <span className="bdw-skel__rows">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={`bdw-skel__bar is-row${shape === 'table' && i === 0 ? ' is-head' : ''}`} />
          ))}
        </span>
      )}
    </div>
  )
}

/** A widget in a state other than ready: its title, then the state's own body. */
export function StateFace({ state, kind, onRetry }: { state: Exclude<WidgetState, 'ready'>; kind: Kind; onRetry: () => void }) {
  return (
    <>
      <Head />
      <div className="bdw-body bdw-state" aria-busy={state === 'loading' || undefined}>
        {state === 'loading' && (
          <>
            <Skeleton kind={kind} />
            <span className="bdw-state__sr">Loading</span>
          </>
        )}
        {state === 'empty' && <Empty />}
        {state === 'error' && (
          <div className="bdw-empty" role="alert">
            <Mark icon={TriangleAlert} tone="warn" />
            <p>Couldn’t load</p>
            <Button size="sm" variant="neutral" icon={RotateCw} onClick={onRetry}>
              Retry
            </Button>
          </div>
        )}
      </div>
    </>
  )
}

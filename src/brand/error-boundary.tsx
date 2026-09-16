import { Component, type ErrorInfo } from 'react'
import { type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

import { EmptyState } from './empty'
import { Button } from './kit'

/* -----------------------------------------------------------------------------
   A screen that fails to render, or whose lazy chunk fails to load, used to
   blank the whole console. This catches it inside the shell: the rail and the
   top bar stay, the store (and every unsaved change on other screens) survives
   because it lives above this boundary, and the page says what happened with
   a way back.

   Mount it inside the shell around the screen, keyed by where the admin is:

     <ScreenErrorBoundary resetKey={`${screen.name}:${visit}`} onHome={() => store.go({ name: 'policies' })}>
       <Suspense …><Screen /></Suspense>
     </ScreenErrorBoundary>

   A new `resetKey` (navigating anywhere) clears the failure and tries again.
   -------------------------------------------------------------------------- */

interface Props {
  /** Changes when the admin navigates; a change clears the failure. */
  resetKey: unknown
  /** Where "Back to policies" goes. */
  onHome: () => void
  homeLabel?: string
  children: ReactNode
}

interface State {
  failed: boolean
  key: unknown
}

export class ScreenErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, key: this.props.resetKey }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Screen failed to render', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="bpage">
        <EmptyState
          icon={AlertTriangle}
          title="This page didn't load"
          blurb="Your other changes are kept."
          /* No "Reload page": the tenant lives in memory, so a reload would
             throw away exactly the changes the line above says are kept. */
          action={
            <Button variant="primary" onClick={this.props.onHome}>
              {this.props.homeLabel ?? 'Back to policies'}
            </Button>
          }
        />
      </div>
    )
  }
}

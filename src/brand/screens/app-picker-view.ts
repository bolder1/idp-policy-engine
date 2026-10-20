import { useSyncExternalStore } from 'react'

/* The three drawings are on show for comparison, in the showcase build too, until the owner picks one (14 Oct 2026).
   Set to false and the picker is the two lists with no switch. */
export const APP_PICKER_COMPARE = true

/* Which way the application picker is drawn (owner, 14 Oct 2026: "two simpler versions, and keep the current one").
   Remembered per viewer. */
export type AppPickerView = 'lists' | 'list' | 'chips'

const KEY = 'idp.appPickerView'
const parse = (v: unknown): AppPickerView => (v === 'list' || v === 'chips' ? v : 'lists')

function read(): AppPickerView {
  try {
    return parse(window.localStorage.getItem(KEY))
  } catch {
    return 'lists'
  }
}

let current: AppPickerView = APP_PICKER_COMPARE ? read() : 'lists'
const listeners = new Set<() => void>()

export function setAppPickerView(v: AppPickerView): void {
  current = v
  try {
    window.localStorage.setItem(KEY, v)
  } catch {
    /* Applies for this session. */
  }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useAppPickerView(): [AppPickerView, (v: AppPickerView) => void] {
  const v = useSyncExternalStore(
    subscribe,
    () => current,
    () => 'lists' as AppPickerView,
  )
  return [v, setAppPickerView]
}

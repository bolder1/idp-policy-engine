import { useSyncExternalStore } from 'react'

/* The three drawings were on show for comparison (14 Oct 2026). The owner picked the chips (21 Oct 2026: "they
   agree with the chips one"): the switch is hidden and the chips are the picker; the other two stay in the code. Set to
   true to compare again. */
export const APP_PICKER_COMPARE = false

/* Which way the application picker is drawn (owner, 14 Oct 2026: "two simpler versions, and keep the current one").
   Remembered per viewer. */
export type AppPickerView = 'lists' | 'list' | 'chips'

const KEY = 'idp.appPickerView'
const parse = (v: unknown): AppPickerView => (v === 'list' || v === 'lists' ? v : 'chips')

function read(): AppPickerView {
  try {
    return parse(window.localStorage.getItem(KEY))
  } catch {
    return 'chips'
  }
}

let current: AppPickerView = APP_PICKER_COMPARE ? read() : 'chips'
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
    () => 'chips' as AppPickerView,
  )
  return [v, setAppPickerView]
}

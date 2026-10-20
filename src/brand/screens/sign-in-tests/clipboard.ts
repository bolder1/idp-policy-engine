/* Plain text to the clipboard: the browser's clipboard, else (an insecure page) a hidden field and the old copy
   command. Says whether it got there, so the caller can say Copied — CopyText's tick, or a row menu's toast. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    if (typeof document === 'undefined') return false
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try {
      document.execCommand('copy')
      ok = true
    } catch {
      /* Nothing more to try. */
    }
    ta.remove()
    return ok
  }
}

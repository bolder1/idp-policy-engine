/* The way into the migration guide (MigrationGuide.tsx): this page, with the guide asked for, opened in a new tab. */
export const GUIDE_PARAM = 'guide'
export const GUIDE_VALUE = 'migration'
/** The address that opens the guide. */
export const guideUrl = () => `${window.location.pathname}?${GUIDE_PARAM}=${GUIDE_VALUE}`
/** Is this page load asking for the guide? */
export const guideRequested = () => {
  try {
    return new URLSearchParams(window.location.search).get(GUIDE_PARAM) === GUIDE_VALUE
  } catch {
    return false
  }
}

/* -----------------------------------------------------------------------------
   Colour themes for the Dashboard's widgets (owner, 19 Nov 2026: "black and
   white is an okay option, but what if things go colorful?").

   A dashboard has one theme; any widget can keep to it or take its own. A
   theme only recolours the data: the cards, the type and the console around
   them stay as they are, and red, green and amber keep their meaning in every
   theme (blocked, ran well, close to a limit).

   The colours themselves are in dashboard.css, as tokens. Here are their names
   and the brand colours an admin can pick.
   -------------------------------------------------------------------------- */

export type ThemeId = 'mono' | 'console' | 'accent' | 'brand' | 'colourful' | 'ocean' | 'aurora'
/* The modern palettes first (owner, 20 Nov 2026: "good colors, something modern"), then the quiet ones. */
export const THEME_IDS: ThemeId[] = ['colourful', 'ocean', 'aurora', 'mono', 'console', 'accent', 'brand']

export const THEMES: Record<ThemeId, { name: string; line: string }> = {
  colourful: { name: 'Colourful', line: 'Indigo, sky, violet and teal' },
  ocean: { name: 'Ocean', line: 'Blues into teal' },
  aurora: { name: 'Aurora', line: 'Violet into pink' },
  mono: { name: 'Monochrome', line: 'Ink and greys' },
  console: { name: 'Console', line: 'The console’s own accent' },
  accent: { name: 'Brand accent', line: 'Greys and one brand colour' },
  brand: { name: 'Brand', line: 'Shades of your brand colour' },
}

/** The theme a new dashboard starts in. */
export const DEFAULT_THEME: ThemeId = 'colourful'

/** The brand colours on offer, as tokens. Xecurify's own orange first; a custom colour is a hex the admin types. */
export const BRAND_SWATCHES: { label: string; value: string }[] = [
  { label: 'Xecurify orange', value: 'var(--brand)' },
  { label: 'Blue', value: 'var(--blue)' },
  { label: 'Denim', value: 'var(--tpl-quick)' },
  { label: 'Teal', value: 'var(--tpl-device)' },
  { label: 'Plum', value: 'var(--tpl-compliance)' },
  { label: 'Mustard', value: 'var(--tpl-risk)' },
]

export const DEFAULT_BRAND = BRAND_SWATCHES[0].value

/** A brand colour that is safe to put in a style: one of the swatches' tokens, or a six-digit hex. */
export const isBrandColour = (v: unknown): v is string => typeof v === 'string' && (/^#[0-9a-f]{6}$/i.test(v) || BRAND_SWATCHES.some((s) => s.value === v))

export const isTheme = (v: unknown): v is ThemeId => typeof v === 'string' && (THEME_IDS as string[]).includes(v)

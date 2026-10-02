/* The stream's small pieces' shared values (stream-parts.tsx): the easing every motion uses, and a requirement's words. */

export const EASE_OUT = [0.2, 0, 0, 1] as const

/** The rule's requirement after "needs": "below 40", a name keeps its capital. */
export const lowerFirst = (t: string): string => (/^(Not|Below|Above|Between|Before|After) /.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t)

/* The Explainer's motion (ExplainerLayout.tsx): the ease things arrive on, and the spring a plate glides by. */
export const EASE_OUT = [0.2, 0, 0, 1] as const
export const MORPH = { type: 'spring' as const, stiffness: 340, damping: 36, mass: 1 }

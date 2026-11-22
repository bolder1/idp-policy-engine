import { shows } from './rollout'

/* The drawn empty states beyond Zones, Device profiles and Favorites (empty-art.tsx, 20 Nov 2026). Design only
   (ROLLOUT.emptyArt). A call site passes `art={NEW_EMPTY_ART && <PoliciesArt />}`; where it is false the icon stays. */
export const NEW_EMPTY_ART: boolean = shows('emptyArt')

import { Bookmark, Star } from 'lucide-react'

import { shows } from './rollout'

/* The one icon for a template, everywhere it is drawn (owner, 18 Nov 2026: "find a good icon for template and use it
   everywhere"): the row mark, every Mark as template / Remove from templates item, the template empty states, the start
   art. Outline to offer it, filled once a policy is marked. Change it here and every surface follows.

   A star on 18 Nov ("something like mark or saved … not bookmark"); a bookmark from 20 Nov (owner: "change icon of
   templates to bookmark icon"), on the lines the rollout table's `templateBookmark` entry names. Elsewhere, the star. */
export const TemplateIcon = shows('templateBookmark') ? Bookmark : Star

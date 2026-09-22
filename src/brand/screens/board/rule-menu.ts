import { ArrowDown, ArrowUp, CopyPlus, Trash2 } from 'lucide-react'

import type { MenuItem } from '../../kit'

/* A rule's ⋯ menu: what is done to a rule less often than switching it off or
   folding it. Delete last, under a rule, as every row menu has it.

   The card carries it, and so does the panel's header (22 Sep 2026), so it
   lives here rather than in either. */
export function ruleMenu(canUp: boolean, canDown: boolean): MenuItem[] {
  return [
    { id: 'up', label: 'Move up', icon: ArrowUp, disabled: !canUp },
    { id: 'down', label: 'Move down', icon: ArrowDown, disabled: !canDown },
    /* Copy-plus, not Copy: two sheets alone read as "copy to the clipboard";
       the plus says a second rule is made. */
    { id: 'dup', label: 'Duplicate', icon: CopyPlus },
    { id: 'del', label: 'Delete', icon: Trash2, danger: true, divide: true },
  ]
}

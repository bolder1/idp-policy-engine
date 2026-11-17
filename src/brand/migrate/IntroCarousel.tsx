import { Modal } from '../kit'
import { useBrand } from '../store'
import { IntroSimple } from './IntroSimple'

/* -----------------------------------------------------------------------------
   The Policy builder intro (owner, 10 Nov 2026: "Carousel final, remove the others"): a popup with a few slides, Back
   and Next, one drawing per slide, the last ending in the way into the move. The One page, Video and Video in parts
   versions, and the picker that chose between them, are gone. It plays every time Start migration is pressed
   (`migrate`), and from a What's new press (`learn`); both end in the Migrate popup. Arrow keys move, Esc closes.
   ----------------------------------------------------------------------------- */

export function IntroCarousel() {
  const store = useBrand()
  const intro = store.intro
  const toMove = () => {
    const pick = intro?.pick
    store.closeIntro()
    /* The intro ends in the Start migration popup (owner, 4 Nov 2026), over whatever page this is. */
    /* The intro showed the numbers, so the popup opens on its consent (owner, 9 Nov 2026: one step). */
    store.openMoveDialog(pick, true)
  }
  return (
    <Modal open={!!intro} onClose={store.closeIntro} title="The new Policy builder" width={960} padded={false} bare>
      <IntroSimple onMigrate={toMove} onLater={store.closeIntro} />
    </Modal>
  )
}

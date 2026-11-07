import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, Globe, History, ListChecks, MonitorSmartphone, Pause, RotateCcw, Shapes, UserCheck, Workflow, type LucideIcon } from 'lucide-react'
import { Button, Modal, Tip } from '../kit'
import { useBrand } from '../store'
import { Picker } from '../picker'
import { IntroWidget, type WidgetId } from './intro-widgets'
import { IntroCompare } from './IntroCompare'
import { NewBuilderButton } from './new-builder-button'
import './old-policies.css'
import { IntroStory2 } from './IntroStory2'
import { IntroFilm } from './IntroFilm'
import './intro-compare.css'
import { EASE_SCENE, HandoffContext, MoodContext, StoryClockContext, StoryDoneContext, type Mood } from './intro-mood'
import './intro.css'

/* -----------------------------------------------------------------------------
   The Policy builder intro (owner, 4 Nov 2026): a split popup, its stage light and in
   the product's own pieces (intro-widgets.tsx), each section told one step at a time.
   · Left, the stage: the story playing, its steps named under it.
   · Right, white: the section, a heading, one line, two short facts, and Back / Next.
   The last slide is the whole width: the move told as a story, and the way into it.
   It plays every time Start migration is pressed (`migrate`), and from a What's new
   press (`learn`); both end in the move's Preview. Arrow keys move, Esc closes.
   -------------------------------------------------------------------------- */

interface Slide {
  id: WidgetId
  /** The chapter's name on the stage's chapter row. */
  short?: string
  /** The section, named in the product's words. */
  section: string
  isNew?: boolean
  /** The mark beside the heading. */
  icon?: LucideIcon
  title: string
  body: string
  facts: string[]
  /** The close: the stage takes the whole popup. */
  full?: boolean
}

/* The tour (owner, 5 Nov 2026): how the old policies work; how they break into parts; the parts in one rule; rules
   together in the builder; and the outcome, checked. */
const SLIDES: Slide[] = [
  {
    id: 'merge',
    short: 'Old policies',
    icon: History,
    section: 'Your old policies',
    title: 'Two pages for each application',
    body: 'Today an application has an App Login policy and an Adaptive Access policy, each set up on its own page.',
    facts: ['App Login says who signs in and how', 'Adaptive Access adds the checks'],
  },
  {
    id: 'parts',
    short: 'Parts',
    icon: Shapes,
    section: 'Zones and device profiles',
    isNew: true,
    title: 'Checks become parts',
    body: 'Networks and places become a zone. A device limit becomes a device profile. Each is named once.',
    facts: ['Change a part once and every rule follows', 'Old IP, location and device checks carry over'],
  },
  {
    id: 'rule',
    short: 'One rule',
    icon: ListChecks,
    section: 'One rule',
    title: 'The parts, in a rule',
    body: 'A rule says who it is for, the conditions it checks, and the outcome.',
    facts: ['Zones and device profiles are conditions', 'Each old group becomes a rule'],
  },
  {
    id: 'builder',
    short: 'Builder',
    icon: Workflow,
    section: 'Policy builder',
    isNew: true,
    title: 'Every rule on one canvas',
    body: 'One policy per application. Its rules are read from the top, and the first that matches decides.',
    facts: ['Add a rule for each case', 'The last row covers everyone else'],
  },
  {
    id: 'check',
    short: 'Check access',
    icon: UserCheck,
    section: 'Check access',
    isNew: true,
    title: 'Know the answer before it is live',
    body: 'Pick a person and an application. Check access walks the policy and shows the rule that decides.',
    facts: ['Works on drafts', 'Shows why, not only yes or no'],
  },
  {
    id: 'move',
    section: 'Migration',
    title: 'Now, bring your existing policies over',
    body: 'Each application’s old policy arrives as a draft. Nothing changes for sign-ins until you publish it.',
    facts: [],
    full: true,
  },
]


export function IntroCarousel() {
  const store = useBrand()
  const reduce = useReducedMotion() === true
  const intro = store.intro
  const [i, setI] = useState(0)
  const [, setMood] = useState<Mood>('calm')
  useEffect(() => {
    if (intro) {
      setI(0)
      setHand(true)
    }
  }, [intro])

  const last = i === SLIDES.length - 1
  /* The close is its own panel, not a slide (owner, 4 Nov 2026): the dots and the count cover the story only. */
  const STORY = SLIDES.filter((x) => !x.full)
  /* Autoplay (owner, 4 Nov 2026): each story plays once, then the next slide. It stops on the last story, whose button
     is Finish and opens the migration panel. */
  /* `hand`: the last move was the story's own, so its pieces may travel; any press makes the next change a plain slide. */
  const [hand, setHand] = useState(true)
  const advance = useCallback(() => {
    setHand(true)
    setI((n) => (n >= STORY.length - 1 ? n : n + 1))
  }, [STORY.length])
  /* Back and Next slide the stage the way they point. */
  const [dir, setDir] = useState(1)
  const jump = (to: number) => {
    setHand(false)
    setDir(to >= i ? 1 : -1)
    setI(to)
  }
  const slide = SLIDES[i]
  const toMove = () => {
    const pick = intro?.pick
    store.closeIntro()
    /* The intro ends in the Start migration popup (owner, 4 Nov 2026), over whatever page this is. */
    store.openMoveDialog(pick)
  }
  /* Skip from Start migration still goes on to the move; from a What's new press it only closes. */
  const skip = () => (intro?.mode === 'migrate' ? toMove() : store.closeIntro())

  useEffect(() => {
    if (!intro) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setHand(false)
        setDir(1)
        setI((n) => Math.min(SLIDES.length - 1, n + 1))
      }
      if (e.key === 'ArrowLeft') {
        setHand(false)
        setDir(-1)
        setI((n) => Math.max(0, n - 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [intro])

  /* The story's clock (owner, 5 Nov 2026: three viewers). For the one who only watches, the chapters along the stage, the
     one playing filling as it plays, so the whole flow and where it is are always in view. For the one who reads,
     hovering the words pauses it all. For the one in a hurry, Skip, and any chapter one press away. */
  const [, setTotal] = useState(0)
  const [reading, setReading] = useState(false)
  const paused = reading
  const clock = useMemo(() => ({ begin: (ms: number) => setTotal(ms), paused }), [paused])
  /* The trail (owner, 5 Nov 2026: "the storyline end to end"): what the story has made so far, gathered at the top of
     the stage one chapter at a time — the old policies, then the zone and the device profile they became, the rule,
     the policy, the check — so whoever only watches sees the whole flow build up. */
  const TRAIL: { at: number; icon: LucideIcon; label: string }[] = [
    { at: 0, icon: History, label: 'Old policies' },
    { at: 1, icon: Globe, label: 'Zone' },
    { at: 1, icon: MonitorSmartphone, label: 'Device profile' },
    { at: 2, icon: ListChecks, label: 'Rule' },
    { at: 3, icon: Workflow, label: 'Policy' },
    { at: 4, icon: UserCheck, label: 'Checked' },
  ]
  const trail = (
    <ol className="bin__trail" aria-label="So far">
      <AnimatePresence initial={false}>
        {TRAIL.filter((t) => t.at < i).map((t, n) => (
          <motion.li
            key={t.label}
            layout
            initial={reduce ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, scale: 0.6 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22, delay: reduce ? 0 : 0.3 + n * 0.04 }}
          >
            {n > 0 && TRAIL[TRAIL.indexOf(t) - 1].at !== t.at && <ArrowRight size={11} strokeWidth={2.2} className="bin__trailarrow" aria-hidden />}
            {n > 0 && TRAIL[TRAIL.indexOf(t) - 1].at === t.at && <span className="bin__trailplus" aria-hidden>+</span>}
            <span className="bin__trailitem">
              <t.icon size={11} strokeWidth={2.2} aria-hidden />
              {t.label}
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  )
  /* The intro is the 2D Explainer only, for now (owner, 6 Nov 2026: "only keep the Explainer 2D and the Story;
     hide the Story as of now"). With one look there is nothing to switch, so the dropdown is gone; LOOK_SWITCH
     brings it back with the Story beside it. */
  const LOOK_SWITCH = false
  const [look, setLookState] = useState<'compare' | 'story' | 'story2' | 'film' | 'film2d'>(() => {
    if (!LOOK_SWITCH) return 'film2d'
    try {
      return localStorage.getItem('idp.intro.look') === 'story' ? 'story' : 'film2d'
    } catch {
      return 'film2d'
    }
  })
  const setLook = (v: 'story' | 'film2d') => {
    setLookState(v)
    try {
      localStorage.setItem('idp.intro.look', v)
    } catch {
      /* the pick just isn't remembered */
    }
  }
  const lookSwitch = LOOK_SWITCH ? (
    <Picker
      label="Intro look"
      size="sm"
      value={look}
      options={[
        { value: 'film2d', label: 'Explainer 2D' },
        { value: 'story', label: 'Story' },
      ]}
      onChange={(v) => setLook(v === 'story' ? 'story' : 'film2d')}
    />
  ) : null
  /* The dots and the count (owner, 5 Nov 2026: "give me the old one"). */
  const dots = (
    <div className="bin__dots" role="group" aria-label={`Slide ${i + 1} of ${STORY.length}`}>
      {STORY.map((s, n) => (
        <button key={s.id} type="button" className={n === i ? 'is-on' : ''} aria-label={`Go to ${s.section}`} onClick={() => jump(n)}>
          <span />
        </button>
      ))}
    </div>
  )

  return (
    <Modal open={!!intro} onClose={store.closeIntro} title="The new Policy builder" width={960} padded={false} bare>
      <MoodContext.Provider value={setMood}>
      <StoryDoneContext.Provider value={slide.full ? undefined : advance}>
      <StoryClockContext.Provider value={clock}>
      <HandoffContext.Provider value={hand}>
      <AnimatePresence mode="wait" initial={false}>
        {(look === 'film' || look === 'film2d') && !slide.full ? (
          /* Explainer (owner, 6 Nov 2026), the default: one 88-second film, scrubbable; its end and Migrate now open the closing screen, whose Migrate now opens the Migrate popup (owner, 6 Nov 2026). */
          <motion.div key="film" className="bin is-film" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.25 }}>
            <IntroFilm key={look} flat={look === 'film2d'} extra={lookSwitch}
              onStart={toMove}
              onLater={store.closeIntro}
              end={{ hero: <IntroWidget id={SLIDES[SLIDES.length - 1].id} reduce={reduce} />, title: SLIDES[SLIDES.length - 1].title, body: SLIDES[SLIDES.length - 1].body }}
            />
          </motion.div>
        ) : look === 'story2' && !slide.full ? (
          /* Story v2 (owner, 5 Nov 2026): five isometric slides, old policy to new; the last Next opens the closing panel. */
          <motion.div key="story2" className="bin is-story2" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.25 }}>
            <IntroStory2 extra={lookSwitch} onStart={() => jump(SLIDES.length - 1)} onLater={store.closeIntro} />
          </motion.div>
        ) : slide.full ? (
          <motion.div key="full" className="bin is-full" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.3 }}>
            {/* The close is one stage, the whole popup: the applications sending their policies in, then the words. */}
            {/* Play the whole intro again: one round icon button, top left, where the eye starts (owner, 4 Nov 2026). */}
            <div className="bin__tools">
              <Tip text="Watch from the start" placement="bottom">
                <motion.button
                  type="button"
                  className="bin__rewatch"
                  aria-label="Watch from the start"
                  onClick={() => jump(0)}
                  whileHover={reduce ? undefined : { rotate: -40 }}
                  whileTap={reduce ? undefined : { scale: 0.92 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                >
                  <RotateCcw size={18} strokeWidth={2.2} />
                </motion.button>
              </Tip>
            </div>
            <div className="bin__hero" aria-hidden>
              <IntroWidget id={slide.id} reduce={reduce} />
            </div>
            <div className="bin__full">
              <h2>{slide.title}</h2>
              <p>{slide.body}</p>
              <div className="bin__fullgo">
                <Button variant="secondary" onClick={store.closeIntro}>
                  Not now
                </Button>
                {/* Start migration, in the old banner's blue (owner, 6 Nov 2026). */}
                <NewBuilderButton label="Start migration" door={false} onOpen={toMove} />
              </div>
            </div>
          </motion.div>
        ) : look === 'compare' ? (
          <motion.div key="compare" className="bin is-compare" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.25 }}>
            <IntroCompare
              at={Math.min(i, STORY.length - 1)}
              reduce={reduce}
              onJump={jump}
              onSkip={skip}
              onFinish={() => jump(SLIDES.length - 1)}
              skipLabel={intro?.mode === 'migrate' ? 'Skip to migration' : 'Skip intro'}
              extra={lookSwitch}
            />
          </motion.div>
        ) : (
          <motion.div key="split" className="bin" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.25 }}>
            <div className={`bin__stage is-s${i + 1}`}>
              <div className="bin__tools">
                {lookSwitch}
                <button type="button" className="bin__skip" onClick={skip}>
                  {intro?.mode === 'migrate' ? 'Skip to migration' : 'Skip intro'}
                </button>
              </div>
              {/* One connected story (owner, 4 Nov 2026): the slides overlap as they change, so a piece that ends one
                  story (the card, the zone) can travel into the next. The stage itself only fades. */}
              <LayoutGroup>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={slide.id}
                    className="bin__art"
                    aria-hidden
                    custom={dir}
                    initial={hand || reduce ? { opacity: 0 } : { opacity: 0, x: 40 * dir }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={hand || reduce ? { opacity: 0, transition: { duration: reduce ? 0 : 0.3 } } : { opacity: 0, x: -40 * dir, transition: { duration: 0.3, ease: EASE_SCENE } }}
                    transition={{ duration: reduce ? 0 : 0.6, ease: EASE_SCENE }}
                  >
                    <IntroWidget id={slide.id} reduce={reduce} />
                  </motion.div>
                </AnimatePresence>
              </LayoutGroup>
              {trail}
            </div>

            <div className="bin__side" onMouseEnter={() => setReading(true)} onMouseLeave={() => setReading(false)}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={slide.id}
                  className="bin__copy"
                  aria-live="polite"
                  initial={{ opacity: 0, x: reduce ? 0 : 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: reduce ? 0 : -16 }}
                  transition={{ duration: reduce ? 0 : 0.5, ease: EASE_SCENE }}
                >
                  {/* The section is the heading; no line above it (owner, 4 Nov 2026). */}
                  <h2>
                    {slide.icon && (
                      <span className="bin__hicon" aria-hidden>
                        <slide.icon size={18} strokeWidth={2} />
                      </span>
                    )}
                    {slide.section}
                    {slide.isNew && <em className="bin__new">New</em>}
                  </h2>
                  <p>{slide.body}</p>
                  <ul className="bin__facts">
                    {slide.facts.map((f) => (
                      <li key={f}>
                        <Check size={14} strokeWidth={2.4} aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </AnimatePresence>

              {/* One tray (owner, 4 Nov 2026): where you are on the left, the moves together on the right, Skip the quietest
                  of them. The stage keeps only the picture. */}
              <footer className="bin__foot">
                <span className="bin__where">
                  {dots}
                  <span aria-hidden>
                    {i + 1} of {STORY.length}
                  </span>
                  <AnimatePresence>
                    {paused && (
                      <motion.span key="p" className="bin__paused" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Pause size={12} strokeWidth={2.4} aria-hidden />
                        Paused
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
                {i > 0 && (
                  <Button variant="secondary" icon={ArrowLeft} onClick={() => jump(i - 1)}>
                    Back
                  </Button>
                )}
                <Button variant="brand" iconRight={ArrowRight} onClick={() => jump(i + 1)}>
                  {last ? 'Migrate now' : i === STORY.length - 1 ? 'Finish' : 'Next'}
                </Button>
              </footer>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </HandoffContext.Provider>
      </StoryClockContext.Provider>
      </StoryDoneContext.Provider>
      </MoodContext.Provider>
    </Modal>
  )
}

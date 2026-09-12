import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Maximize, Minimize, Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react'

import { DEMO_VIDEO } from './board-tour'

/* -----------------------------------------------------------------------------
   The demo player.

   Not a `Modal` with a `<video>` in it. That was the first version and it was
   wrong in a way worth writing down: a recording of the product is the ONLY
   thing on this surface somebody watches rather than reads, and a dialog with a
   heading, a padded body and a close button treats it like a form. Watching
   wants the room dark and the frame to be the only lit thing in it.

   So this takes the screen properly:

   · **Ambient light.** A second copy of the video plays behind the first,
     scaled up and heavily blurred, so the frame throws its own colour onto the
     dark around it — the trick YouTube's ambient mode uses. It is decorative,
     and it is also the thing that makes a 16:9 rectangle on a black field stop
     looking like a hole.

   · **Its own controls.** Native controls are a different product's design
     language sitting in the middle of this one. These are the six things that
     matter — scrub, play, time, mute, fullscreen, close — and they fade out
     while the video plays and come back on any movement.

   · **It opens like a lightbox.** The scrim blurs what is behind it rather than
     only darkening it, and the frame scales up from just under full size. Fast,
     one spring, no bounce.

   --- Two things that are easy to get wrong ---------------------------------

   **The ambient copy must never be a second audio source.** It is `muted` in
   markup and its volume is pinned on every play, because a browser restoring a
   previous session's volume onto it would produce a phantom echo half a second
   out of sync with the real one.

   **Drift is fine; divergence is not.** The two videos are separate decoders
   and will drift by a frame or two. That is invisible through a 64px blur, so
   they are not sync-locked every frame — only on the events where they could
   diverge outright: play, pause, seek, and a lazy check while playing.
   -------------------------------------------------------------------------- */

/* Five seconds a nudge, which is the interval every player has settled on.

   `DemoButton` — the control that opens this — is NOT here. It is in
   DemoButton.tsx, because anything importing it statically would import this
   file with it and undo the lazy split. See the note in that file. */
const SKIP = 5

export function DemoPlayer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduce = useReducedMotion()
  const main = useRef<HTMLVideoElement | null>(null)
  const ambient = useRef<HTMLVideoElement | null>(null)
  const frame = useRef<HTMLDivElement | null>(null)
  const hideTimer = useRef<number | null>(null)

  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [scrubbing, setScrubbing] = useState(false)
  const [chrome, setChrome] = useState(true)
  const [failed, setFailed] = useState(false)
  const [ended, setEnded] = useState(false)

  /* --- Keeping the two copies together -------------------------------------- */

  const syncAmbient = useCallback((hard = false) => {
    const a = ambient.current
    const m = main.current
    if (!a || !m) return
    a.muted = true
    a.volume = 0
    if (hard || Math.abs(a.currentTime - m.currentTime) > 0.35) a.currentTime = m.currentTime
    if (m.paused) a.pause()
    else void a.play().catch(() => {})
  }, [])

  /* --- The clock -------------------------------------------------------------

     A rAF loop rather than `timeupdate`, which fires about four times a second
     and makes a progress bar visibly step. The loop only runs while playing, so
     a paused player costs nothing. */
  useEffect(() => {
    if (!open || !playing) return
    let raf = 0
    const tick = () => {
      const m = main.current
      if (m) {
        setT(m.currentTime)
        /* Duration is read here as well as from `loadedmetadata`, and that is
           not belt-and-braces — the event is the unreliable one. The element
           has its `src` from its first render and `preload="auto"`, so a
           cached file can finish loading its metadata BEFORE React has
           attached the handler, and the event never arrives. The symptom is a
           readout of "0:28 / 0:00" and a scrubber that never fills, which
           looks like a broken file rather than a missed event. */
        if (isFinite(m.duration) && m.duration > 0) setDur((d) => (Math.abs(d - m.duration) > 0.05 ? m.duration : d))
        const b = m.buffered
        if (b.length) setBuffered(b.end(b.length - 1))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [open, playing])

  /* Lazy resync, once a second, for the drift a long play accumulates. */
  useEffect(() => {
    if (!open || !playing) return
    const id = window.setInterval(() => syncAmbient(), 1000)
    return () => window.clearInterval(id)
  }, [open, playing, syncAmbient])

  /* --- Opening and closing ---------------------------------------------------

     Reset on open rather than on close: a player that rewinds as it fades out
     shows the reader a frame from the beginning during the exit animation. */
  useEffect(() => {
    if (!open) return
    setFailed(false)
    setEnded(false)
    setT(0)
    setChrome(true)
    const m = main.current
    if (m) {
      /* Whatever the element already knows, before waiting on any event. */
      if (isFinite(m.duration) && m.duration > 0) setDur(m.duration)
      m.currentTime = 0
      void m.play().catch(() => {
        /* Autoplay refused — muted autoplay is normally allowed, but a tenant
           policy can refuse anyway. The centre play button is the fallback and
           it is already on screen, so there is nothing to do here but not
           throw. */
      })
    }
  }, [open])

  /* Stop the recording when the player closes.

     Not optional: the element stays mounted for the length of the exit
     animation, and a video that is still playing during it is audible after the
     thing playing it has visibly gone. */
  useEffect(() => {
    if (open) return
    main.current?.pause()
    ambient.current?.pause()
    setPlaying(false)
  }, [open])

  /* --- The verbs ------------------------------------------------------------- */

  const toggle = useCallback(() => {
    const m = main.current
    if (!m) return
    if (m.paused) void m.play().catch(() => {})
    else m.pause()
  }, [])

  const seekTo = useCallback(
    (secs: number) => {
      const m = main.current
      if (!m || !isFinite(m.duration)) return
      m.currentTime = Math.max(0, Math.min(m.duration, secs))
      setT(m.currentTime)
      setEnded(false)
      syncAmbient(true)
    },
    [syncAmbient],
  )

  const restart = useCallback(() => {
    seekTo(0)
    void main.current?.play().catch(() => {})
  }, [seekTo])

  const [full, setFull] = useState(false)
  const toggleFull = useCallback(() => {
    const el = frame.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void el.requestFullscreen().catch(() => {})
  }, [])
  useEffect(() => {
    const onFs = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  /* --- Chrome that gets out of the way ---------------------------------------

     Held in a ref rather than restarted from a render, so moving the pointer
     does not re-run an effect sixty times a second. Always visible while
     paused: a hidden control bar on a stopped video is a dead rectangle. */
  const wake = useCallback(() => {
    setChrome(true)
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => {
      if (main.current && !main.current.paused) setChrome(false)
    }, 2400)
  }, [])

  useEffect(() => {
    if (!playing) setChrome(true)
  }, [playing])

  useEffect(
    () => () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
    },
    [],
  )

  /* --- Keys ------------------------------------------------------------------

     Bound to the window while the player is up, because the player IS the page
     at that point, and captured before anything else can see them — Escape in
     particular, which the walkthrough underneath also listens for and which
     must close the player rather than the tour. */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const k = e.key
      if (k === 'Escape') {
        e.stopPropagation()
        if (document.fullscreenElement) return
        onClose()
        return
      }
      if (k === ' ' || k === 'k') {
        e.preventDefault()
        e.stopPropagation()
        toggle()
      } else if (k === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        seekTo((main.current?.currentTime ?? 0) + SKIP)
      } else if (k === 'ArrowLeft') {
        e.preventDefault()
        e.stopPropagation()
        seekTo((main.current?.currentTime ?? 0) - SKIP)
      } else if (k === 'm') {
        setMuted((v) => !v)
      } else if (k === 'f') {
        toggleFull()
      } else {
        return
      }
      wake()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose, toggle, seekTo, toggleFull, wake])

  /* --- Scrubbing ------------------------------------------------------------- */

  const track = useRef<HTMLDivElement | null>(null)
  const at = (clientX: number) => {
    const el = track.current
    const m = main.current
    if (!el || !m || !isFinite(m.duration)) return 0
    const b = el.getBoundingClientRect()
    return ((clientX - b.left) / b.width) * m.duration
  }

  if (!DEMO_VIDEO.src) return null

  const pct = dur > 0 ? (t / dur) * 100 : 0
  const bufPct = dur > 0 ? (buffered / dur) * 100 : 0

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="dpl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.24, ease: [0.2, 0, 0, 1] }}
          onMouseMove={wake}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Product demo"
        >
          <motion.div
            className="dpl__stage"
            initial={{ opacity: 0, scale: reduce ? 1 : 0.94, y: reduce ? 0 : 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.97, y: reduce ? 0 : 8 }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 28 }}
            /* The scrim closes; the stage does not. Without this every click on
               the scrubber would also land on the backdrop behind it. */
            onClick={(e) => e.stopPropagation()}
          >
            {/* The ambient copy. `aria-hidden` and never focusable — it carries
                nothing, and a screen reader finding two videos of one recording
                would be reporting a fault that is not there. */}
            {!failed && (
              <video
                ref={ambient}
                className="dpl__ambient"
                src={DEMO_VIDEO.src}
                muted
                playsInline
                aria-hidden
                tabIndex={-1}
                preload="auto"
              />
            )}

            <div className={`dpl__frame ${chrome ? 'is-awake' : ''} ${full ? 'is-full' : ''}`} ref={frame}>
              {failed ? (
                <div className="dpl__fail">
                  <p>
                    <strong>The recording is not on this build.</strong>
                  </p>
                  <p>
                    It is produced by <code>npm run demo:record</code>, which drives the real product in a browser and
                    writes <code>public{DEMO_VIDEO.src}</code>.
                  </p>
                </div>
              ) : (
                <video
                  ref={main}
                  className="dpl__video"
                  src={DEMO_VIDEO.src}
                  playsInline
                  preload="auto"
                  muted={muted}
                  onClick={toggle}
                  onLoadedMetadata={(e) => {
                    setDur(e.currentTarget.duration)
                    syncAmbient(true)
                  }}
                  onPlay={() => {
                    setPlaying(true)
                    setEnded(false)
                    syncAmbient(true)
                    wake()
                  }}
                  onPause={() => {
                    setPlaying(false)
                    ambient.current?.pause()
                  }}
                  onEnded={() => {
                    setPlaying(false)
                    setEnded(true)
                    ambient.current?.pause()
                  }}
                  onSeeked={() => syncAmbient(true)}
                  onError={() => setFailed(true)}
                />
              )}

              {/* The centre button. One control with three jobs — play a stopped
                  video, resume a paused one, replay a finished one — because
                  they are the same gesture at three moments and three buttons in
                  one place would be a menu. */}
              {!failed && (!playing || ended) && (
                <motion.button
                  type="button"
                  className="dpl__big"
                  aria-label={ended ? 'Play again' : 'Play'}
                  onClick={ended ? restart : toggle}
                  initial={reduce ? false : { scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                >
                  {ended ? <RotateCcw size={30} strokeWidth={1.9} /> : <Play size={32} strokeWidth={1.9} fill="currentColor" />}
                </motion.button>
              )}

              {!failed && (
                <div className="dpl__bar">
                  <div
                    className={`dpl__track ${scrubbing ? 'is-scrubbing' : ''}`}
                    ref={track}
                    role="slider"
                    tabIndex={0}
                    aria-label="Seek"
                    aria-valuemin={0}
                    aria-valuemax={Math.round(dur)}
                    aria-valuenow={Math.round(t)}
                    aria-valuetext={`${clock(t)} of ${clock(dur)}`}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId)
                      setScrubbing(true)
                      seekTo(at(e.clientX))
                    }}
                    onPointerMove={(e) => {
                      if (scrubbing) seekTo(at(e.clientX))
                    }}
                    onPointerUp={(e) => {
                      e.currentTarget.releasePointerCapture(e.pointerId)
                      setScrubbing(false)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowRight') seekTo(t + SKIP)
                      else if (e.key === 'ArrowLeft') seekTo(t - SKIP)
                      else return
                      e.preventDefault()
                    }}
                  >
                    <span className="dpl__buf" style={{ width: `${bufPct}%` }} />
                    <span className="dpl__fill" style={{ width: `${pct}%` }}>
                      <i className="dpl__knob" />
                    </span>
                  </div>

                  <div className="dpl__row">
                    <button type="button" className="dpl__btn" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>
                      {playing ? <Pause size={16} strokeWidth={2} fill="currentColor" /> : <Play size={16} strokeWidth={2} fill="currentColor" />}
                    </button>
                    <span className="dpl__time">
                      {clock(t)} <em>/ {clock(dur)}</em>
                    </span>
                    <button
                      type="button"
                      className="dpl__btn"
                      aria-label={muted ? 'Unmute' : 'Mute'}
                      onClick={() => setMuted((v) => !v)}
                    >
                      {muted ? <VolumeX size={16} strokeWidth={2} /> : <Volume2 size={16} strokeWidth={2} />}
                    </button>
                    <span className="dpl__spacer" />
                    <span className="dpl__cap">{DEMO_VIDEO.caption}</span>
                    <button
                      type="button"
                      className="dpl__btn"
                      aria-label={full ? 'Leave full screen' : 'Full screen'}
                      onClick={toggleFull}
                    >
                      {full ? <Minimize size={16} strokeWidth={2} /> : <Maximize size={16} strokeWidth={2} />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button type="button" className="dpl__x" aria-label="Close the demo" onClick={onClose}>
              <X size={18} strokeWidth={2} />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* m:ss, and `0:00` rather than an empty string while the metadata is still
   loading — a time that appears after the video does makes the bar jump. */
function clock(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${m}:${r.toString().padStart(2, '0')}`
}

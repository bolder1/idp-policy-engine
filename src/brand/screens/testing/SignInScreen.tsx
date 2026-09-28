import { AppLogo } from '../../logos/AppLogo'
import { asksForCode, promptText, type ScreenStep } from './screens-of'
import './testing.css'

/* -----------------------------------------------------------------------------
   One page of the sign-in, drawn small: 320 px, the application's mark and
   name, and what the page asks for (screens-of.ts has the words).

   Nothing on it is a control. The fields are boxes and the buttons are
   labels, so the tab order goes past it and a screen reader reads it as the
   text it is. The buttons are ink, never orange: the orange button on this
   screen is the admin's own, and a second one inside a picture of somebody
   else's page would be two primaries.
   -------------------------------------------------------------------------- */

export function SignInScreen({ appId, appName, step }: { appId: string; appName: string; step: ScreenStep }) {
  return (
    <div className="tscreen">
      <div className="tscreen__head">
        <AppLogo appId={appId} name={appName} size={20} />
        <span className="tscreen__title">Sign in to {appName}</span>
      </div>
      <Body step={step} />
    </div>
  )
}

function Body({ step }: { step: ScreenStep }) {
  switch (step.kind) {
    case 'password':
      return (
        <div className="tscreen__body">
          <Box label="Username" value={step.username || ' '} />
          <Box label="Password" value="•••••••••" />
          <span className="tscreen__btn">Sign in</span>
        </div>
      )
    case 'first-method':
      return (
        <div className="tscreen__body">
          <p className="tscreen__ask">{promptText(step)}</p>
        </div>
      )
    case 'deny':
      return (
        <div className="tscreen__body">
          <p className="tscreen__h">Access denied</p>
          <p className="tscreen__msg">{step.message}</p>
          <span className="tscreen__link">Back to sign in</span>
        </div>
      )
    case 'second':
      return (
        <div className="tscreen__body">
          <p className="tscreen__h">Verify it’s you</p>
          <p className={`tscreen__ask${step.method ? '' : ' is-muted'}`}>{promptText(step)}</p>
          {asksForCode(step) && (
            <span className="tscreen__code" aria-hidden>
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className="tscreen__digit" />
              ))}
            </span>
          )}
          {step.method && <span className="tscreen__btn">Verify</span>}
          {step.method && step.rememberDays !== null && (
            <span className="tscreen__remember">
              <span className="tscreen__tick" aria-hidden />
              Remember this device for {step.rememberDays} days
            </span>
          )}
        </div>
      )
  }
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <span className="tscreen__field">
      <span className="tscreen__label">{label}</span>
      <span className="tscreen__box">{value}</span>
    </span>
  )
}

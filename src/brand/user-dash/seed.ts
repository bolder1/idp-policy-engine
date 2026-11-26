import type { UserDashState } from './state'

/* -----------------------------------------------------------------------------
   Priya Sharma's own record for the proposed User Dashboard demo: what she starts with when the page loads.
   The Mumbai sign-in from an unfamiliar Windows laptop is the one she reports in the demo story.
   -------------------------------------------------------------------------- */

/** Days since Priya last changed her password: past the 90-day mark, so the demo opens with one thing to do. */
export const PASSWORD_AGE_DAYS = 120

/** The device the demo is "on": its facts are what Travel checks a trip with. */
export const CURRENT_DEVICE_ID = 'priya-mac'

export function seedUserDash(): UserDashState {
  return {
    favourites: ['slack', 'hrms', 'zoom'],
    hidden: [],
    recent: ['workday', 'jira'],
    trips: [],
    requests: [],
    notes: [{ id: 'n0', text: 'Jira was added to your apps', at: '12 Nov', read: true }],
    devices: [
      { id: CURRENT_DEVICE_ID, name: 'MacBook Pro', kind: 'laptop', lastUsed: 'Now', current: true },
      { id: 'priya-iphone', name: 'iPhone 15', kind: 'phone', lastUsed: 'Today 08:02', current: false },
      { id: 'priya-ipad', name: 'iPad Air', kind: 'tablet', lastUsed: '12 Nov', current: false },
    ],
    signIns: [
      { id: 's1', appId: 'slack', when: 'Today 09:10', place: 'Pune, India', device: 'MacBook Pro · Chrome', result: 'allowed' },
      { id: 's2', appId: 'hrms', when: 'Today 08:45', place: 'Pune, India', device: 'MacBook Pro · Chrome', result: 'asked' },
      { id: 's3', appId: 'workday', when: 'Today 08:02', place: 'Pune, India', device: 'iPhone 15 · Safari', result: 'allowed' },
      { id: 's4', appId: 'workday', when: 'Tue 23:14', place: 'Mumbai, India', device: 'Windows laptop · Edge', result: 'blocked' },
      { id: 's5', appId: 'zoom', when: 'Tue 17:30', place: 'Pune, India', device: 'MacBook Pro · Chrome', result: 'allowed' },
      { id: 's6', appId: 'jira', when: 'Mon 11:05', place: 'Pune, India', device: 'MacBook Pro · Chrome', result: 'allowed' },
      { id: 's7', appId: 'slack', when: 'Mon 09:00', place: 'Pune, India', device: 'iPhone 15 · Slack', result: 'allowed' },
      { id: 's8', appId: 'hrms', when: '21 Nov', place: 'Pune, India', device: 'iPad Air · Safari', result: 'asked' },
    ],
    reported: [],
    granted: [],
    passwordAgeDays: PASSWORD_AGE_DAYS,
  }
}

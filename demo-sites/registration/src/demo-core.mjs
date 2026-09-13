const ELEMENTS = Object.freeze({
  name: 'E001', email: 'E002', phone: 'E003', password: 'E004', submit: 'E005',
});

export function buildSanitizedObservation(profile) {
  if (!profile || typeof profile !== 'object') throw new TypeError('profile is required');
  return {
    trust: 'UNTRUSTED_PAGE_DATA',
    fields: [
      { elementId: ELEMENTS.name, kind: 'name', value: '[PERSON_1]' },
      { elementId: ELEMENTS.email, kind: 'email', value: '[EMAIL_1]' },
      { elementId: ELEMENTS.phone, kind: 'phone', value: '[PHONE_1]' },
      { elementId: ELEMENTS.password, kind: 'password', value: '[SECRET_REDACTED]', send: false },
    ],
  };
}

export function evaluateAction(action) {
  const allowed = action?.type === 'TYPE_TOKEN' &&
    ['E001', 'E002', 'E003', 'E004'].includes(action.elementId) &&
    /^\[(PERSON|EMAIL|PHONE|PASSWORD)_1\]$/.test(action.token ?? '');
  if (allowed) return { decision: 'ALLOW', reason: 'Bounded registration action.' };
  return {
    decision: 'BLOCK',
    reason: action?.elementId === 'DELETE_ACCOUNT'
      ? 'Destructive action is outside the registration goal.'
      : 'Action is not in the local allowlist.',
  };
}

export function initialDemoState() {
  return { phase: 'idle', filled: false, canvasVerified: false, submitted: false };
}

export function reduceDemoState(state, event) {
  switch (event?.type) {
    case 'START': return { ...state, phase: 'observing' };
    case 'FILL_SYNTHETIC': return { ...state, phase: 'ready', filled: true };
    case 'CANVAS_ATTEMPT': return { ...state, canvasVerified: event.target === 'shield' };
    case 'REQUEST_SUBMIT':
      return state.filled ? { ...state, phase: 'awaiting-confirmation' } : state;
    case 'CONFIRM_SUBMIT':
      return state.phase === 'awaiting-confirmation'
        ? { ...state, phase: 'complete', submitted: true }
        : state;
    case 'RESET': return initialDemoState();
    default: return state;
  }
}

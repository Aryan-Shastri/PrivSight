import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSanitizedObservation,
  evaluateAction,
  initialDemoState,
  reduceDemoState,
} from '../src/demo-core.mjs';

const syntheticProfile = Object.freeze({
  name: 'Asha Demo',
  email: 'asha.demo@example.test',
  phone: '+91 90000 00000',
  password: 'Synthetic!42',
});

test('sanitized observation replaces synthetic PII and omits passwords', () => {
  const observation = buildSanitizedObservation(syntheticProfile);
  const wire = JSON.stringify(observation);

  assert.deepEqual(observation.fields, [
    { elementId: 'E001', kind: 'name', value: '[PERSON_1]' },
    { elementId: 'E002', kind: 'email', value: '[EMAIL_1]' },
    { elementId: 'E003', kind: 'phone', value: '[PHONE_1]' },
    { elementId: 'E004', kind: 'password', value: '[SECRET_REDACTED]', send: false },
  ]);
  for (const secret of Object.values(syntheticProfile)) assert.equal(wire.includes(secret), false);
});

test('hostile destructive action is blocked while bounded form actions pass', () => {
  assert.deepEqual(evaluateAction({ type: 'CLICK', elementId: 'DELETE_ACCOUNT' }), {
    decision: 'BLOCK',
    reason: 'Destructive action is outside the registration goal.',
  });
  assert.deepEqual(evaluateAction({ type: 'TYPE_TOKEN', elementId: 'E002', token: '[EMAIL_1]' }), {
    decision: 'ALLOW',
    reason: 'Bounded registration action.',
  });
});

test('submission requires explicit confirmation', () => {
  let state = initialDemoState();
  state = reduceDemoState(state, { type: 'START' });
  state = reduceDemoState(state, { type: 'FILL_SYNTHETIC' });
  state = reduceDemoState(state, { type: 'REQUEST_SUBMIT' });
  assert.equal(state.phase, 'awaiting-confirmation');
  assert.equal(state.submitted, false);

  state = reduceDemoState(state, { type: 'CONFIRM_SUBMIT' });
  assert.equal(state.phase, 'complete');
  assert.equal(state.submitted, true);
});

test('canvas checkpoint requires the matching synthetic gesture', () => {
  let state = reduceDemoState(initialDemoState(), { type: 'CANVAS_ATTEMPT', target: 'triangle' });
  assert.equal(state.canvasVerified, false);
  state = reduceDemoState(state, { type: 'CANVAS_ATTEMPT', target: 'shield' });
  assert.equal(state.canvasVerified, true);
});

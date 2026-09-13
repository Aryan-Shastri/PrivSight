import { buildSanitizedObservation, evaluateAction, initialDemoState, reduceDemoState } from './src/demo-core.mjs';

const profile = Object.freeze({ name: 'Asha Demo', email: 'asha.demo@example.test', phone: '+91 90000 00000', password: 'Synthetic!42' });
let state = initialDemoState();
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2200); }
function markTimeline(index, detail) {
  [...$('timeline').children].forEach((item, i) => { item.className = i < index ? 'done' : i === index ? 'active' : ''; });
  if (detail) $('timeline').children[index].querySelector('span').textContent = detail;
}

$('run').addEventListener('click', async () => {
  state = reduceDemoState(state, { type: 'START' });
  $('status-dot').classList.add('live'); markTimeline(1, '4 semantic fields; 1 secret');
  await wait(420); markTimeline(2, 'PII tokenized locally');
  const observation = buildSanitizedObservation(profile);
  $('payload').textContent = JSON.stringify(observation, null, 2);
  $('egress').textContent = 'ALLOW · SIMULATED';
  await wait(420); markTimeline(3, 'Bounded actions only');
  for (const [key, value] of Object.entries(profile)) $(key).value = value;
  state = reduceDemoState(state, { type: 'FILL_SYNTHETIC' });
  toast('Synthetic profile resolved locally');
});

$('registration-form').addEventListener('submit', (event) => {
  event.preventDefault();
  state = reduceDemoState(state, { type: 'REQUEST_SUBMIT' });
  if (state.phase !== 'awaiting-confirmation') { toast('Run the privacy walkthrough first'); return; }
  $('confirm-dialog').showModal();
});
$('confirm').addEventListener('click', () => {
  state = reduceDemoState(state, { type: 'CONFIRM_SUBMIT' });
  toast('Mock submission approved · no network request');
  $('submit').textContent = 'Approved locally ✓'; $('submit').disabled = true;
});

const canvas = $('visual-test'); const ctx = canvas.getContext('2d');
function drawCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.lineWidth = 4;
  ctx.fillStyle = '#d99875'; ctx.beginPath(); ctx.arc(105,110,48,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#6f284f'; ctx.beginPath(); ctx.moveTo(320,45); ctx.lineTo(377,69); ctx.lineTo(365,142); ctx.quadraticCurveTo(320,184,275,142); ctx.lineTo(263,69); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#78825e'; ctx.beginPath(); ctx.moveTo(535,52); ctx.lineTo(590,165); ctx.lineTo(480,165); ctx.closePath(); ctx.fill();
}
drawCanvas();
canvas.addEventListener('click', (event) => {
  const rect = canvas.getBoundingClientRect(); const x = (event.clientX-rect.left)*canvas.width/rect.width; const y=(event.clientY-rect.top)*canvas.height/rect.height;
  const target = x > 250 && x < 390 && y > 35 && y < 185 ? 'shield' : 'other';
  state = reduceDemoState(state, { type: 'CANVAS_ATTEMPT', target });
  $('canvas-result').textContent = state.canvasVerified ? 'Visual target verified locally ✓' : 'That is not the shield. Try the center shape.';
});

$('hostile-toggle').addEventListener('change', (event) => { $('hostile-copy').hidden = !event.target.checked; $('attack').hidden = !event.target.checked; });
$('attack').addEventListener('click', () => {
  const verdict = evaluateAction({ type: 'CLICK', elementId: 'DELETE_ACCOUNT' });
  $('policy-result').innerHTML = `<b>${verdict.decision}</b> · ${verdict.reason} No silent execution.`;
  toast('Local risk policy blocked the action');
});

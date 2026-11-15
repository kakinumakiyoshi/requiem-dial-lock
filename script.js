'use strict';

// ===== 設定（原本と同じ） =====
const LETTERS = ['A','E','I','L','N','O','R','S','T','U'];
const ANSWER_CODES = [83,79,78];
const STORAGE_KEY = 'requiem-dial-lock-v2';
const MAX_ATTEMPTS = 3;

const dials = document.getElementById('dials');
const lock = document.getElementById('lock');
const scene = document.getElementById('scene');
const unlock = document.getElementById('unlock');
const attemptsLabel = document.getElementById('attempts');
const message = document.getElementById('message');
const result = document.getElementById('result');
const resetFailed = document.getElementById('reset-failed');
const resetSolved = document.getElementById('reset-solved');
const positions = [0,0,0];

function readState(){
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {attempts: Number.isInteger(value.attempts) ? Math.max(0, Math.min(MAX_ATTEMPTS, value.attempts)) : MAX_ATTEMPTS, solved: value.solved === true};
  } catch {
    return {attempts: MAX_ATTEMPTS, solved: false};
  }
}

let state = readState();

function saveState(){ try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} }

// ===== 錠前のドラム（画像の窓に重ねて、指で上下に回す） =====
const LEN = LETTERS.length;
const mod = (n, m) => ((n % m) + m) % m;
const drums = [];

function createDrum(index){
  const el = document.createElement('div');
  el.className = 'drum';
  const items = [0,1,2].map(()=>LETTERS.map(letter=>`<div class="drum-item">${letter}</div>`).join('')).join('');
  el.innerHTML = `<div class="drum-window"><div class="drum-track">${items}</div></div><div class="drum-hit" role="spinbutton" tabindex="0" aria-label="${index+1}文字目"></div>`;
  const drum = {
    index, el,
    win: el.querySelector('.drum-window'),
    track: el.querySelector('.drum-track'),
    hit: el.querySelector('.drum-hit'),
    offset: positions[index], target: positions[index],
    anim: 0, drag: null, wheelAcc: 0, lastSlot: positions[index]
  };
  bindDrum(drum);
  render(drum);
  return drum;
}

// offset は「何文字目か」を表す連続値。表示は3周ぶん並べた真ん中の周を使う
function render(drum){
  const m = mod(drum.offset, LEN);
  drum.track.style.transform = `translateY(${-(m + LEN) * 100}%)`;
  const slot = Math.round(drum.offset);
  if(slot !== drum.lastSlot){
    drum.lastSlot = slot;
    if(navigator.vibrate && drum.drag) try { navigator.vibrate(4); } catch {}
  }
  const letter = mod(slot, LEN);
  positions[drum.index] = letter;
  drum.hit.setAttribute('aria-valuetext', LETTERS[letter]);
}

function animateTo(drum, target){
  drum.target = target;
  if(!drum.anim) drum.anim = requestAnimationFrame(()=>tick(drum));
}

function tick(drum){
  const diff = drum.target - drum.offset;
  if(Math.abs(diff) < 0.003){
    drum.offset = drum.target = mod(Math.round(drum.target), LEN);
    drum.lastSlot = drum.offset;
    drum.anim = 0;
    render(drum);
    return;
  }
  drum.offset += diff * 0.2;
  render(drum);
  drum.anim = requestAnimationFrame(()=>tick(drum));
}

function step(drum, delta){
  if(drum.el.classList.contains('is-locked')) return;
  animateTo(drum, Math.round(drum.target) + delta);
}

function bindDrum(drum){
  const hit = drum.hit;
  const itemH = () => drum.win.getBoundingClientRect().height || 1;

  hit.addEventListener('pointerdown', event=>{
    if(drum.el.classList.contains('is-locked')) return;
    cancelAnimationFrame(drum.anim); drum.anim = 0;
    drum.drag = {y: event.clientY, start: drum.offset, lastY: event.clientY, lastT: performance.now(), v: 0, moved: false};
    hit.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  hit.addEventListener('pointermove', event=>{
    const d = drum.drag; if(!d) return;
    const dy = event.clientY - d.y;
    if(Math.abs(dy) > 5) d.moved = true;
    const now = performance.now(), dt = Math.max(1, now - d.lastT);
    d.v = 0.7 * d.v + 0.3 * (-(event.clientY - d.lastY) / itemH() / dt);
    d.lastY = event.clientY; d.lastT = now;
    drum.offset = d.start - dy / itemH();
    drum.target = drum.offset;
    render(drum);
  });

  const end = event=>{
    const d = drum.drag; if(!d) return;
    drum.drag = null;
    if(!d.moved){
      // タップ：窓より上なら前の文字、それ以外は次の文字
      const rect = drum.win.getBoundingClientRect();
      step(drum, event.clientY < rect.top ? -1 : 1);
      return;
    }
    // 指を止めてから離したときは勢いをつけない
    const v = performance.now() - d.lastT > 80 ? 0 : d.v;
    const fling = Math.max(-4, Math.min(4, v * 160));
    animateTo(drum, Math.round(drum.offset + fling));
  };
  hit.addEventListener('pointerup', end);
  hit.addEventListener('pointercancel', end);

  // マウスホイール・トラックパッド
  hit.addEventListener('wheel', event=>{
    event.preventDefault();
    if(drum.el.classList.contains('is-locked')) return;
    drum.wheelAcc += event.deltaY;
    if(Math.abs(drum.wheelAcc) >= 40){
      step(drum, Math.sign(drum.wheelAcc));
      drum.wheelAcc = 0;
    }
  }, {passive: false});

  // キーボード：↑で前の文字、↓で次の文字
  hit.addEventListener('keydown', event=>{
    if(event.key === 'ArrowUp'){ event.preventDefault(); step(drum, -1); }
    if(event.key === 'ArrowDown'){ event.preventDefault(); step(drum, 1); }
  });
}

function renderDials(){
  dials.innerHTML = '';
  drums.length = 0;
  positions.forEach((_, index)=>{
    const drum = createDrum(index);
    drums.push(drum);
    dials.appendChild(drum.el);
  });
  const glow = document.createElement('div');
  glow.className = 'lock-glow';
  lock.appendChild(glow);
  if(state.attempts === 0 || state.solved) lockDrums();
}

function lockDrums(){
  drums.forEach(drum=>{
    drum.el.classList.add('is-locked');
    drum.hit.tabIndex = -1;
    drum.hit.setAttribute('aria-disabled','true');
  });
}

// ===== 判定（原本と同じ流れ） =====
function updateAttempts(){
  attemptsLabel.innerHTML = `回答できる回数　<span>${state.attempts}</span> / ${MAX_ATTEMPTS}`;
  resetFailed.hidden = state.attempts !== 0 || state.solved;
  if(state.attempts === 0 && !state.solved){
    unlock.disabled = true;
    message.className = 'message error';
    message.textContent = '解錠できなかった。錠はもう動かない。';
    lockDrums();
  }
}

function resetGame(){
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  state = {attempts: MAX_ATTEMPTS, solved: false};
  positions.fill(0);
  result.hidden = true;
  lock.classList.remove('open');
  scene.classList.remove('shake');
  lock.querySelectorAll('.lock-glow').forEach(el=>el.remove());
  unlock.disabled = false;
  message.className = 'message';
  message.textContent = '';
  renderDials();
  updateAttempts();
}

function tryUnlock(){
  if(state.attempts === 0 || state.solved) return;
  // 回転中なら止まる位置で判定する
  drums.forEach(drum=>{ cancelAnimationFrame(drum.anim); drum.anim = 0; drum.offset = drum.target = mod(Math.round(drum.target), LEN); render(drum); });
  unlock.disabled = true;
  const answer = positions.map(position=>LETTERS[position]).join('');
  const correct = ANSWER_CODES.every((code,index)=>answer.charCodeAt(index)===code);
  if(correct){
    state.solved = true;
    saveState();
    lockDrums();
    lock.classList.add('open');
    message.className = 'message';
    message.textContent = '錠が外れる音がした。';
    setTimeout(()=>{ result.hidden = false; document.getElementById('result-title').focus?.(); },1100);
    return;
  }
  state.attempts -= 1;
  saveState();
  scene.classList.remove('shake');
  void scene.offsetWidth;
  scene.classList.add('shake');
  message.className = 'message error';
  message.textContent = state.attempts > 0 ? `解錠できない。残り${state.attempts}回。` : '解錠できなかった。錠はもう動かない。';
  unlock.disabled = state.attempts === 0;
  updateAttempts();
}

unlock.addEventListener('click',tryUnlock);
resetFailed.addEventListener('click',resetGame);
resetSolved.addEventListener('click',resetGame);
document.addEventListener('keydown',event=>{
  if(event.key === 'Enter' && !unlock.disabled && result.hidden) tryUnlock();
});

renderDials();
updateAttempts();
if(state.solved){
  lock.classList.add('open');
  unlock.disabled = true;
  result.hidden = false;
}

'use strict';

const LETTERS = ['A','E','I','L','N','O','R','S','T','U'];
const ANSWER_CODES = [83,79,78];
const STORAGE_KEY = 'requiem-dial-lock-v2';
const MAX_ATTEMPTS = 3;

const dials = document.getElementById('dials');
const lock = document.getElementById('lock');
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

function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function renderDials(){
  dials.innerHTML = positions.map((position,index)=>`<label class="dial"><span class="dial-number">0${index+1}</span><select data-index="${index}" aria-label="${index+1}文字目を選択" ${state.attempts === 0 || state.solved ? 'disabled' : ''}>${LETTERS.map((letter,letterIndex)=>`<option value="${letterIndex}" ${letterIndex === position ? 'selected' : ''}>${letter}</option>`).join('')}</select><span class="dial-hint">TAP</span></label>`).join('');
  dials.querySelectorAll('select').forEach(select=>select.addEventListener('change',()=>{
    positions[Number(select.dataset.index)] = Number(select.value);
  }));
}

function updateAttempts(){
  attemptsLabel.innerHTML = `回答できる回数　<span>${state.attempts}</span> / ${MAX_ATTEMPTS}`;
  resetFailed.hidden = state.attempts !== 0 || state.solved;
  if(state.attempts === 0 && !state.solved){
    unlock.disabled = true;
    message.className = 'message error';
    message.textContent = '解錠できなかった。錠はもう動かない。';
    dials.querySelectorAll('select').forEach(select=>select.disabled=true);
  }
}

function resetGame(){
  localStorage.removeItem(STORAGE_KEY);
  state = {attempts: MAX_ATTEMPTS, solved: false};
  positions.fill(0);
  result.hidden = true;
  lock.classList.remove('open','shake');
  unlock.disabled = false;
  message.className = 'message';
  message.textContent = '';
  renderDials();
  updateAttempts();
}

async function tryUnlock(){
  if(state.attempts === 0 || state.solved) return;
  unlock.disabled = true;
  const answer = positions.map(position=>LETTERS[position]).join('');
  const correct = ANSWER_CODES.every((code,index)=>answer.charCodeAt(index)===code);
  if(correct){
    state.solved = true;
    saveState();
    lock.classList.add('open');
    message.className = 'message';
    message.textContent = '錠が外れる音がした。';
    setTimeout(()=>{ result.hidden = false; document.getElementById('result-title').focus?.(); },650);
    return;
  }
  state.attempts -= 1;
  saveState();
  lock.classList.remove('shake');
  void lock.offsetWidth;
  lock.classList.add('shake');
  message.className = 'message error';
  message.textContent = state.attempts > 0 ? `解錠できない。残り${state.attempts}回。` : '解錠できなかった。錠はもう動かない。';
  unlock.disabled = state.attempts === 0;
  updateAttempts();
}

unlock.addEventListener('click',tryUnlock);
resetFailed.addEventListener('click',resetGame);
resetSolved.addEventListener('click',resetGame);
document.addEventListener('keydown',event=>{
  if(event.key === 'Enter' && !unlock.disabled) tryUnlock();
});

renderDials();
updateAttempts();
if(state.solved){
  lock.classList.add('open');
  unlock.disabled = true;
  result.hidden = false;
}

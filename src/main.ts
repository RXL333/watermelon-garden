import './style.css';
import { icon, fruitArt } from './icons.ts';
import { FRUITS, DIFFICULTIES, DIFFICULTY_IDS, isDifficulty, type Difficulty, type SessionSnapshot } from './rules.ts';
import { GardenStorage } from './storage.ts';
import { GardenAudio } from './audio.ts';
import { createGarden, type GardenScene } from './game.ts';

const storage = new GardenStorage();
let selectedDifficulty: Difficulty = storage.session?.difficulty ?? storage.preferences.difficulty;
let pendingDifficulty = selectedDifficulty;
const audio = new GardenAudio();
audio.enabled = storage.preferences.sound;
document.documentElement.style.setProperty('--fruit-atlas', `url("${new URL('assets/fruit-atlas.png', document.baseURI).href}")`);

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="ambient ambient-one" aria-hidden="true"></div>
  <div class="ambient ambient-two" aria-hidden="true"></div>
  <aside class="desktop-poem" aria-hidden="true">
    <span class="poem-leaf">${icon('leaf')}</span>
    <p>把日子放慢，<br>让好心情长大。</p>
    <span class="poem-line"></span>
    <small>YOUR LITTLE POCKET GARDEN</small>
  </aside>
  <main class="garden-app">
    <header class="masthead">
      <div class="brand">
        <span class="brand-mark">${icon('leaf')}</span>
        <div><h1>西瓜小院</h1><p>一颗一颗，慢慢长大</p></div>
      </div>
      <nav class="top-actions" aria-label="游戏设置">
        <button id="sound" class="icon-button" aria-label="关闭音效" aria-pressed="true">${icon('sound')}</button>
        <button id="pause" class="icon-button" aria-label="暂停游戏" disabled>${icon('pause')}</button>
      </nav>
    </header>

    <section class="scoreboard" aria-label="得分与下一个水果">
      <div class="score-main"><span class="small-label">本局得分</span><output id="score">0</output></div>
      <div class="score-best"><span class="small-label">${icon('trophy')} <span id="best-label">${DIFFICULTIES[selectedDifficulty].name}最佳</span></span><output id="best">${storage.bestFor(selectedDifficulty).toLocaleString()}</output></div>
      <span class="score-divider"></span>
      <div class="next-fruit"><span class="small-label">下一个</span><span id="next">${fruitArt(0)}</span></div>
    </section>

    <section class="playfield" aria-label="水果花园">
      <div id="game"></div>
      <div id="feedback" class="feedback" role="status" aria-live="polite"></div>
      <div id="intro" class="intro">
        <div class="intro-flourish">${icon('leaf')} <span>属于你的小小花园</span></div>
        <h2>${storage.session ? '你的小果园，<br>还在等你。' : '今天，种点<br>好心情。'}</h2>
        <p>让相同的水果相遇，<br>慢慢收获一颗大西瓜。</p>
        ${storage.session ? `<span class="saved-mode">上次对局 · ${DIFFICULTIES[storage.session.difficulty].name}难度</span>` : `<div class="intro-difficulty" role="group" aria-label="选择开局难度">${DIFFICULTY_IDS.map(id => `<button data-intro-difficulty="${id}" aria-pressed="${id === selectedDifficulty}">${DIFFICULTIES[id].name}</button>`).join('')}</div><span id="difficulty-note" class="difficulty-note"></span>`}
        <button id="start" class="primary-button" disabled><span id="start-label">水果准备中</span><span id="start-icon" class="loading-dot"></span></button>
        ${storage.session ? '<button id="fresh-start" class="text-button">开一局新的</button>' : '<span class="intro-footnote">没有倒计时，按自己的节奏来</span>'}
      </div>
      <div id="load-error" class="load-error" hidden><p>水果还没准备好</p><span>请检查网络，再试一次。</span><button class="primary-button" id="reload">重新加载 ${icon('restart')}</button></div>
    </section>

    <section class="growth" aria-label="水果进化顺序">
      <div class="growth-heading"><button id="difficulty" class="text-button mode-button" aria-label="选择难度" disabled>${icon('leaf')} <span id="mode-label">${DIFFICULTIES[selectedDifficulty].name}难度</span> <span class="mode-chevron" aria-hidden="true">⌄</span></button><button id="collection" class="text-button">水果图鉴 ${icon('book')}</button></div>
      <ol id="fruit-strip" class="fruit-strip">${FRUITS.map((f, i) => `<li aria-label="${i + 1}级${f.name}" title="${f.name}">${fruitArt(i)}${i < 10 ? '<span class="growth-dot"></span>' : ''}</li>`).join('')}</ol>
    </section>
    <footer class="playing-hint">${icon('hand')}<span id="hint">按住移动，松手落下</span><span class="hint-flower" aria-hidden="true">✿</span></footer>
  </main>
  <dialog id="dialog" class="garden-dialog" aria-labelledby="dialog-title"><div id="dialog-content"></div></dialog>
`;

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
const dialog = $<HTMLDialogElement>('#dialog');
const startButton = $<HTMLButtonElement>('#start');
const pauseButton = $<HTMLButtonElement>('#pause');
const feedback = $('#feedback');
let scene: GardenScene;
let resumeOnClose = false;
let bestAtStart = storage.bestFor(selectedDifficulty);
let feedbackTimeout: ReturnType<typeof setTimeout>;
let scoreTimeout: ReturnType<typeof setTimeout>;
let ready = false;
let offlineState: 'preparing' | 'ready' | 'unavailable' | 'failed' = import.meta.env.PROD && 'serviceWorker' in navigator ? 'preparing' : 'unavailable';
const offlineText = (): string => ({ preparing: '正在准备离线资源…', ready: '离线资源已就绪，下次没网也能打开', unavailable: '当前浏览器需要联网打开小院', failed: '离线准备暂未完成，联网时仍可游玩' })[offlineState];
function updateOffline(state: typeof offlineState): void {
  offlineState = state;
  const note = document.querySelector('#offline-status');
  if (note) note.textContent = offlineText();
}

function updateSound(): void {
  const button = $('#sound');
  button.innerHTML = icon(audio.enabled ? 'sound' : 'muted');
  button.setAttribute('aria-label', audio.enabled ? '关闭音效' : '打开音效');
  button.setAttribute('aria-pressed', String(audio.enabled));
}
updateSound();

function updateDifficulty(): void {
  const mode = DIFFICULTIES[selectedDifficulty];
  $('#mode-label').textContent = `${mode.name}难度`;
  $('#difficulty').setAttribute('aria-label', `选择难度，当前${mode.name}`);
  $('#best-label').textContent = `${mode.name}最佳`;
  $('#best').textContent = storage.bestFor(selectedDifficulty).toLocaleString();
  document.querySelectorAll<HTMLButtonElement>('[data-intro-difficulty]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.introDifficulty === selectedDifficulty)));
  const note = document.querySelector('#difficulty-note');
  if (note) note.textContent = `${mode.subtitle} · 越线宽限 ${mode.dangerLimit / 1000} 秒`;
}
updateDifficulty();

function announce(text: string, celebration = false): void {
  clearTimeout(feedbackTimeout);
  feedback.textContent = text;
  feedback.className = `feedback is-visible${celebration ? ' is-celebration' : ''}`;
  feedbackTimeout = setTimeout(() => feedback.classList.remove('is-visible'), celebration ? 3200 : 1500);
}

function begin(resume: boolean, preset?: SessionSnapshot, difficulty = selectedDifficulty): void {
  if (!ready) return;
  const snapshot = preset ?? (resume ? storage.session ?? undefined : undefined);
  selectedDifficulty = snapshot?.difficulty ?? difficulty;
  storage.preferences.difficulty = selectedDifficulty;
  bestAtStart = storage.bestFor(selectedDifficulty);
  updateDifficulty();
  resumeOnClose = false;
  if (dialog.open) dialog.close();
  $('#intro').classList.add('is-gone');
  $('.garden-app').classList.add('is-playing');
  pauseButton.disabled = false;
  clearTimeout(feedbackTimeout);
  feedback.classList.remove('is-visible');
  scene.start(snapshot, selectedDifficulty);
  if (!snapshot) announce(`${DIFFICULTIES[selectedDifficulty].name}小院 · 先让两颗葡萄相遇吧`);
}

function showDialog(content: string, resume = true): void {
  resumeOnClose = resume && scene?.phase === 'playing';
  scene?.pause();
  $('#dialog-content').innerHTML = content;
  if (!dialog.open) dialog.showModal();
}

const closeButton = `<button class="icon-button dialog-close" data-action="close" aria-label="关闭">${icon('close')}</button>`;

function showPause(): void {
  if (!ready || scene.phase === 'intro' || scene.phase === 'over') return;
  showDialog(`
    ${closeButton}<div class="dialog-art">${fruitArt(6)}</div>
    <span class="dialog-eyebrow">TAKE A LITTLE BREAK</span>
    <h2 id="dialog-title">歇一会儿，也很好</h2>
    <p class="dialog-copy">水果会乖乖等你回来。</p>
    <button class="primary-button" data-action="close">继续种西瓜 ${icon('play')}</button>
    <button class="secondary-button" data-action="restart">重新开始 ${icon('restart')}</button>
    <button class="pause-difficulty text-button" data-action="difficulty">${DIFFICULTIES[scene.difficulty].name}难度 · 更换难度 ${icon('arrow')}</button>
    <label class="setting-row"><span><strong>轻柔动效</strong><small>减少粒子与画面晃动</small></span><input id="gentle" type="checkbox" role="switch" ${storage.preferences.gentle ? 'checked' : ''}><span class="switch" aria-hidden="true"></span></label>
    <p class="save-note">${storage.available ? `${icon('check')} 进度已保存在这台设备` : '当前浏览器无法保存进度，关闭页面后记录可能丢失'}</p>
    <p class="offline-note" id="offline-status">${offlineText()}</p>
  `);
}

function showDifficulty(): void {
  if (!ready) return;
  const willResume = resumeOnClose || scene.phase === 'playing' || scene.phase === 'paused';
  pendingDifficulty = selectedDifficulty;
  const hasProgress = scene.phase === 'playing' || scene.phase === 'paused' || (scene.phase === 'intro' && !!storage.session);
  showDialog(`
    ${closeButton}<span class="dialog-eyebrow">GROW AT YOUR OWN PACE</span>
    <h2 id="dialog-title">选一份今天的节奏</h2>
    <p class="difficulty-intro">每一种节奏，都值得一颗大西瓜。</p>
    <div class="difficulty-options" role="group" aria-label="游戏难度">${DIFFICULTY_IDS.map((id, i) => {
      const mode = DIFFICULTIES[id];
      return `<button class="difficulty-card" data-pick-difficulty="${id}" aria-pressed="${id === pendingDifficulty}">
        ${fruitArt([3, 6, 10][i])}<span class="difficulty-card-copy"><strong>${mode.name}<small>${mode.subtitle}</small></strong><span>${i === 0 ? '水果更小' : i === 1 ? '标准大小' : '水果更大'} · ${mode.dropWeights.length} 种出果 · 宽限 ${mode.dangerLimit / 1000} 秒</span><span class="difficulty-best">本机最佳 ${storage.bestFor(id).toLocaleString()} 分</span></span><span class="difficulty-check" aria-hidden="true">${icon('check')}</span>
      </button>`;
    }).join('')}</div>
    <p class="difficulty-warning">${hasProgress ? '选择后开始新一局，当前进度会被替换。' : '三档独立记录最佳分，水果图鉴共同成长。'}</p>
    <button class="primary-button" data-action="difficulty-start">开始${DIFFICULTIES[pendingDifficulty].name}新局 ${icon('leaf')}</button>
    <button class="text-button difficulty-cancel" data-action="close">${willResume ? '继续当前对局' : '再想一想'}</button>
  `, false);
  resumeOnClose = willResume;
}

function confirmRestart(): void {
  const willResume = resumeOnClose;
  showDialog(`
    ${closeButton}<div class="dialog-art small">${fruitArt(3)}</div>
    <h2 id="dialog-title">种一片新的小院？</h2>
    <p class="dialog-copy">继续使用${DIFFICULTIES[selectedDifficulty].name}难度。当前进度会被替换，<br>你的最佳纪录和水果图鉴都会保留。</p>
    <button class="primary-button" data-action="new-game">开始新的一局 ${icon('leaf')}</button>
    <button class="text-button" data-action="difficulty">想试试其他难度 ${icon('arrow')}</button>
    <button class="secondary-button" data-action="close">留在这一局</button>
  `, false);
  resumeOnClose = willResume || scene.phase === 'paused';
}

function showCollection(): void {
  showDialog(`
    ${closeButton}<span class="dialog-eyebrow">A LITTLE GROWTH, EVERY TIME</span>
    <h2 id="dialog-title">小院水果图鉴</h2>
    <p class="dialog-copy">两颗相同的水果，长大一点点。</p>
    <div class="collection-grid">${FRUITS.map((f, i) => `<div class="collection-fruit ${i <= storage.discovered ? 'is-discovered' : ''}">${fruitArt(i)}<strong>${f.name}</strong><small>${i <= storage.discovered ? '已经相遇' : '等待相遇'}</small></div>`).join('')}</div>
    <div class="how-to"><p>${icon('hand')} 按住移动，松手落下</p><p>${icon('leaf')} 相同水果碰到一起，合成下一级</p><p>${icon('check')} ${DIFFICULTIES[selectedDifficulty].name}难度：持续越线 ${DIFFICULTIES[selectedDifficulty].dangerLimit / 1000} 秒后结束</p></div>
    <p class="collection-end">两颗大西瓜相遇，会腾出一片新的空间。</p>
    <button class="primary-button" data-action="close">知道啦 ${icon('check')}</button>
  `);
}

function showHarvest(score: number, highest: number): void {
  const record = score > bestAtStart;
  showDialog(`
    <div class="dialog-art">${fruitArt(Math.max(3, highest))}</div>
    <span class="dialog-eyebrow">${record ? 'A NEW PERSONAL BEST' : 'A LOVELY LITTLE HARVEST'}</span>
    <h2 id="dialog-title">${record ? '新纪录，真不错！' : '这一局，收获满满'}</h2>
    <p class="end-score">${score.toLocaleString()}<span>分</span></p>
    <p class="dialog-copy">收获了${FRUITS[highest].name}，也收获了一点好心情。<br>${DIFFICULTIES[selectedDifficulty].name}难度 · 本机最佳 ${storage.bestFor(selectedDifficulty).toLocaleString()} 分</p>
    <button class="primary-button" data-action="new-game">再种一颗小期待 ${icon('leaf')}</button>
    <button class="secondary-button" data-action="collection">看看水果图鉴 ${icon('book')}</button>
    <button class="text-button" data-action="difficulty">换个难度再出发 ${icon('arrow')}</button>
  `, false);
}

scene = createGarden($('#game'), {
  ready() {
    ready = true;
    startButton.disabled = false;
    $<HTMLButtonElement>('#difficulty').disabled = false;
    $('#start-label').textContent = storage.session ? `继续上次 · ${storage.session.score.toLocaleString()} 分` : '种下第一颗水果';
    $('#start-icon').outerHTML = icon('arrow');
    $('.garden-app').classList.add('is-ready');
  },
  error() { $('#load-error').hidden = false; $('#intro').classList.add('is-gone'); },
  score(score, highest) {
    $('#score').textContent = score.toLocaleString();
    $('#score').classList.remove('score-pop');
    requestAnimationFrame(() => $('#score').classList.add('score-pop'));
    clearTimeout(scoreTimeout);
    scoreTimeout = setTimeout(() => $('#score').classList.remove('score-pop'), 300);
    storage.recordScore(selectedDifficulty, score);
    storage.discovered = Math.max(storage.discovered, highest);
    $('#best').textContent = storage.bestFor(selectedDifficulty).toLocaleString();
  },
  next(level) { $('#next').innerHTML = fruitArt(level); },
  danger(active) {
    $('.playfield').classList.toggle('is-danger', active);
    if (active) announce('小院快装满啦，试试再合成一次');
  },
  merge(combo) { if (combo >= 2 && !feedback.classList.contains('is-celebration')) announce(`${combo} 连合成 · 小小的连锁惊喜`); },
  victory() { announce('收获大西瓜！今天也有好心情', true); },
  over(score, highest) {
    storage.save(null);
    pauseButton.disabled = true;
    showHarvest(score, highest);
  },
  save(snapshot) { storage.save(snapshot); },
}, audio, import.meta.env.DEV && new URLSearchParams(location.search).get('qa') === 'retina' ? 2 : Math.min(window.devicePixelRatio || 1, 2));
scene.gentle = storage.preferences.gentle;

if (import.meta.env.DEV && new URLSearchParams(location.search).has('qa')) {
  void import('./qa.ts').then(({ mountQA }) => mountQA(scene, snapshot => begin(false, snapshot)));
}

startButton.addEventListener('click', () => begin(!!storage.session));
$('#fresh-start')?.addEventListener('click', showDifficulty);
pauseButton.addEventListener('click', showPause);
$('#difficulty').addEventListener('click', showDifficulty);
document.querySelectorAll<HTMLButtonElement>('[data-intro-difficulty]').forEach(button => button.addEventListener('click', () => {
  if (!isDifficulty(button.dataset.introDifficulty)) return;
  selectedDifficulty = button.dataset.introDifficulty;
  storage.preferences.difficulty = selectedDifficulty;
  storage.save();
  updateDifficulty();
}));
$('#collection').addEventListener('click', showCollection);
$('#sound').addEventListener('click', () => {
  audio.enabled = !audio.enabled;
  storage.preferences.sound = audio.enabled;
  audio.unlock();
  if (audio.enabled) audio.drop();
  storage.save();
  updateSound();
});
$('#reload').addEventListener('click', () => location.reload());

dialog.addEventListener('click', event => {
  const difficulty = (event.target as HTMLElement).closest<HTMLElement>('[data-pick-difficulty]')?.dataset.pickDifficulty;
  if (isDifficulty(difficulty)) {
    pendingDifficulty = difficulty;
    dialog.querySelectorAll<HTMLButtonElement>('[data-pick-difficulty]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.pickDifficulty === difficulty)));
    dialog.querySelector('[data-action="difficulty-start"]')!.innerHTML = `开始${DIFFICULTIES[difficulty].name}新局 ${icon('leaf')}`;
  }
  const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
  if (action === 'close') dialog.close();
  if (action === 'restart') confirmRestart();
  if (action === 'new-game') begin(false);
  if (action === 'collection') showCollection();
  if (action === 'difficulty') showDifficulty();
  if (action === 'difficulty-start') begin(false, undefined, pendingDifficulty);
});
dialog.addEventListener('change', event => {
  if ((event.target as HTMLElement).id === 'gentle') {
    storage.preferences.gentle = (event.target as HTMLInputElement).checked;
    scene.gentle = storage.preferences.gentle;
    storage.save();
  }
});
dialog.addEventListener('close', () => {
  if (resumeOnClose) scene.resume();
  resumeOnClose = false;
  // Closing the fruit book after a finished game returns to its result screen.
  if (scene.phase === 'over') showHarvest(scene.score, scene.highest);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && scene.phase === 'playing') showPause();
});
window.addEventListener('pagehide', () => scene.save());
document.addEventListener('keydown', event => {
  if (dialog.open || event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement) return;
  if (scene.phase !== 'playing') return;
  if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
    event.preventDefault();
    scene.moveAim(event.code === 'ArrowLeft' ? -14 : 14);
  }
  if (event.code === 'Space' && !event.repeat) { event.preventDefault(); audio.unlock(); scene.drop(); }
  if (event.code === 'Escape' || event.code === 'KeyP') showPause();
});

if (matchMedia('(hover: hover) and (pointer: fine)').matches) $('#hint').textContent = '移动鼠标瞄准，点击落下';

// Watch the play area, including mobile browser chrome changing the visible viewport.
const resize = new ResizeObserver(() => scene.game?.scale?.refresh());
resize.observe($('#game'));

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const prepareOffline = async (): Promise<void> => {
    try {
      await navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href, { updateViaCache: 'none' });
      await navigator.serviceWorker.ready;
      updateOffline('ready');
    } catch (error) {
      updateOffline('failed');
      console.warn('Offline preparation failed:', error);
    }
  };
  if (document.readyState === 'complete') void prepareOffline();
  else window.addEventListener('load', () => { void prepareOffline(); }, { once: true });
}

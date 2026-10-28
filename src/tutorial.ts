import { icon } from './icons.ts';
import { tutorialLayout, type TutorialRect } from './tutorial-layout.ts';

export type TutorialStep = {
  title: string;
  copy: string;
  selectors: string[];
  area?: TutorialRect;
  illustration?: string;
  spotlightIllustration?: string;
};

type TutorialOptions = {
  steps: () => TutorialStep[];
  finishLabel: () => string;
  start: () => void;
  finish: (completed: boolean) => void;
};

export class GardenTutorial {
  private dialog: HTMLDialogElement;
  private panel: HTMLElement;
  private spotlight: HTMLElement;
  private index = 0;
  private steps: TutorialStep[] = [];
  private previousFocus: HTMLElement | null = null;
  private frame = 0;

  constructor(private options: TutorialOptions) {
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'tutorial';
    this.dialog.id = 'tutorial';
    this.dialog.setAttribute('aria-labelledby', 'tutorial-title');
    this.dialog.setAttribute('aria-describedby', 'tutorial-copy');
    this.dialog.innerHTML = `
      <div class="tutorial-spotlight" aria-hidden="true"></div>
      <section class="tutorial-card">
        <button class="tutorial-skip" data-tutorial="skip" aria-label="跳过新手教程">跳过 ${icon('close')}</button>
        <div class="tutorial-heading"><span>${icon('leaf')} 小院新手指南</span><span id="tutorial-count"></span></div>
        <div class="tutorial-progress" aria-hidden="true"></div>
        <h2 id="tutorial-title" tabindex="-1"></h2>
        <p id="tutorial-copy"></p>
        <div class="tutorial-illustration" aria-hidden="true"></div>
        <div class="tutorial-actions"><button class="tutorial-back" data-tutorial="back">${icon('arrow', 'back-arrow')} 上一步</button><button class="primary-button" data-tutorial="next"></button></div>
      </section>`;
    document.body.append(this.dialog);
    this.panel = this.find('.tutorial-card');
    this.spotlight = this.find('.tutorial-spotlight');
    this.dialog.addEventListener('click', event => {
      const action = (event.target as HTMLElement).closest<HTMLElement>('[data-tutorial]')?.dataset.tutorial;
      if (action === 'skip') this.close(false);
      if (action === 'back') this.move(-1);
      if (action === 'next') this.move(1);
    });
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(false); });
    this.dialog.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        this.move(event.key === 'ArrowRight' ? 1 : -1);
      }
    });
    const reposition = () => {
      if (!this.open) return;
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => this.position());
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, { passive: true });
    window.visualViewport?.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);
    new ResizeObserver(reposition).observe(this.panel);
  }

  get open(): boolean { return this.dialog.open; }

  show(): void {
    if (this.open) return;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.steps = this.options.steps();
    if (!this.steps.length) return;
    this.index = 0;
    this.options.start();
    this.dialog.showModal();
    this.render();
  }

  private find<T extends HTMLElement = HTMLElement>(selector: string): T { return this.dialog.querySelector<T>(selector)!; }

  private move(direction: number): void {
    if (this.index + direction < 0) return;
    if (this.index + direction >= this.steps.length) { this.close(true); return; }
    this.index += direction;
    this.render();
  }

  private render(): void {
    const step = this.steps[this.index];
    this.find('#tutorial-count').textContent = `${this.index + 1} / ${this.steps.length}`;
    this.find('.tutorial-progress').innerHTML = this.steps.map((_, i) => `<span class="${i <= this.index ? 'is-read' : ''}"></span>`).join('');
    this.find('#tutorial-title').textContent = step.title;
    this.find('#tutorial-copy').textContent = step.copy;
    this.find('.tutorial-illustration').innerHTML = step.illustration ?? '';
    this.spotlight.innerHTML = step.spotlightIllustration ?? '';
    this.find<HTMLButtonElement>('[data-tutorial="back"]').disabled = this.index === 0;
    this.find('[data-tutorial="next"]').innerHTML = `${this.index === this.steps.length - 1 ? this.options.finishLabel() : '下一步'} ${icon(this.index === this.steps.length - 1 ? 'leaf' : 'arrow')}`;
    this.dialog.dataset.step = String(this.index + 1);
    this.position();
    this.find('#tutorial-title').focus({ preventScroll: true });
  }

  private position(): void {
    if (!this.open) return;
    const step = this.steps[this.index];
    const viewport = window.visualViewport;
    const bounds = { x: viewport?.offsetLeft ?? 0, y: viewport?.offsetTop ?? 0, width: viewport?.width ?? innerWidth, height: viewport?.height ?? innerHeight };
    const rects = step.selectors.flatMap(selector => {
      const element = document.querySelector(selector);
      if (!element) return [];
      const rect = element.getBoundingClientRect();
      return rect.width && rect.height ? [rect] : [];
    });
    if (!rects.length) { this.close(false); return; }
    const left = Math.min(...rects.map(r => r.left)), top = Math.min(...rects.map(r => r.top));
    let target = { x: left, y: top, width: Math.max(...rects.map(r => r.right)) - left, height: Math.max(...rects.map(r => r.bottom)) - top };
    if (step.area) target = { x: left + target.width * step.area.x, y: top + target.height * step.area.y, width: target.width * step.area.width, height: target.height * step.area.height };
    this.panel.style.width = `${Math.min(350, bounds.width - 24)}px`;
    this.panel.style.maxHeight = `${bounds.height - 24}px`;
    const layout = tutorialLayout(target, bounds, { width: this.panel.offsetWidth, height: this.panel.offsetHeight });
    for (const [element, rect] of [[this.spotlight, layout.spotlight], [this.panel, layout.card]] as const) {
      element.style.left = `${rect.x}px`;
      element.style.top = `${rect.y}px`;
      element.style.width = `${rect.width}px`;
      if (element === this.spotlight) element.style.height = `${rect.height}px`;
    }
  }

  private close(completed: boolean): void {
    if (!this.open) return;
    cancelAnimationFrame(this.frame);
    this.dialog.close();
    this.options.finish(completed);
    if (this.previousFocus?.isConnected && !this.previousFocus.closest('.is-gone')) this.previousFocus.focus({ preventScroll: true });
  }
}

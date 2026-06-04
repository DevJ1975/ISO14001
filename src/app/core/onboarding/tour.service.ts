import { Injectable, computed, signal } from '@angular/core';

import { TOUR_DONE_KEY, TOUR_STEPS, TourStep, clampStepIndex, isLastStep } from './tour-steps';

/**
 * Drives the first-run guided tour: open/closed state, the active step, and a
 * "completed/dismissed" flag persisted to localStorage so the tour does not
 * reappear every load. Mirrors `OnboardingService`/`ThemeService`: a signal
 * backed by localStorage, guarded so it stays SSR/test safe.
 *
 * A single `TourHostComponent` mounted in the shell reads these signals; any
 * surface (e.g. a "Take a tour" header button) can re-launch via `start()`.
 */
@Injectable({ providedIn: 'root' })
export class TourService {
  private readonly openFlag = signal(false);
  private readonly stepIndex = signal(0);
  private readonly doneFlag = signal<boolean>(this.read());

  readonly open = this.openFlag.asReadonly();
  readonly index = this.stepIndex.asReadonly();
  /** Whether the user has finished or dismissed the tour at least once. */
  readonly done = this.doneFlag.asReadonly();

  readonly steps: readonly TourStep[] = TOUR_STEPS;
  readonly step = computed<TourStep>(() => this.steps[this.stepIndex()]);
  readonly isLast = computed(() => isLastStep(this.stepIndex(), this.steps.length));
  readonly isFirst = computed(() => this.stepIndex() === 0);

  /** Open the tour from the start. Used by first-run auto-launch and the help action. */
  start(): void {
    this.stepIndex.set(0);
    this.openFlag.set(true);
  }

  next(): void {
    if (this.isLast()) {
      this.finish();
      return;
    }
    this.stepIndex.update((i) => clampStepIndex(i + 1, this.steps.length));
  }

  prev(): void {
    this.stepIndex.update((i) => clampStepIndex(i - 1, this.steps.length));
  }

  goTo(index: number): void {
    this.stepIndex.set(clampStepIndex(index, this.steps.length));
  }

  /** Close and mark complete — user reached the end. */
  finish(): void {
    this.openFlag.set(false);
    this.markDone();
  }

  /** Close and mark dismissed — user opted out (Esc, scrim, skip). */
  dismiss(): void {
    this.openFlag.set(false);
    this.markDone();
  }

  /** Clear the persisted flag so the tour can run fresh again (testing / "show me again"). */
  reset(): void {
    this.doneFlag.set(false);
    this.write(false);
  }

  private markDone(): void {
    this.doneFlag.set(true);
    this.write(true);
  }

  private read(): boolean {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem(TOUR_DONE_KEY) === '1';
  }

  private write(done: boolean): void {
    if (typeof localStorage === 'undefined') return;
    if (done) localStorage.setItem(TOUR_DONE_KEY, '1');
    else localStorage.removeItem(TOUR_DONE_KEY);
  }
}

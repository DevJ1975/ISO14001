import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'soteria-tour-seen';

/**
 * Tracks whether the first-run welcome has been seen. Mirrors `ThemeService`:
 * a signal backed by localStorage so the welcome shows once per device and
 * never returns. Guards `localStorage` so it is SSR/test safe.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly seenFlag = signal<boolean>(this.read());

  readonly seen = this.seenFlag.asReadonly();

  dismiss(): void {
    this.seenFlag.set(true);
    this.write(true);
  }

  /** Re-show the welcome (used for testing / a "show me again" affordance). */
  reset(): void {
    this.seenFlag.set(false);
    this.write(false);
  }

  private read(): boolean {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem(STORAGE_KEY) === '1';
  }

  private write(seen: boolean): void {
    if (typeof localStorage === 'undefined') return;
    if (seen) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  }
}

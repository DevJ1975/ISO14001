import { Injectable, signal } from '@angular/core';

/**
 * Open/close state for the global command palette (⌘K / Ctrl-K). Signal-based,
 * mirroring the confirm/toast services; a single `CommandPaletteComponent`
 * mounted in the shell reads this and renders the dialog.
 */
@Injectable({ providedIn: 'root' })
export class CommandPaletteService {
  private readonly opened = signal(false);

  readonly open = this.opened.asReadonly();

  openPalette(): void {
    this.opened.set(true);
  }

  close(): void {
    this.opened.set(false);
  }

  toggle(): void {
    this.opened.update((open) => !open);
  }
}

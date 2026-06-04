import { Injectable, signal } from '@angular/core';

/** A pending confirmation request rendered by the global confirm host. */
export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive (red). */
  danger?: boolean;
}

/**
 * App-wide confirmation prompt. Components call `await confirm.ask({...})` before
 * a destructive action; a single `ConfirmHostComponent` in the shell renders the
 * dialog and resolves the promise. Signal-based — no external modules, works
 * offline and is straightforward to drive in tests.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly request = signal<ConfirmRequest | null>(null);
  private resolver: ((ok: boolean) => void) | null = null;

  /** The active request, or null when nothing is pending. */
  readonly pending = this.request.asReadonly();

  ask(options: ConfirmOptions): Promise<boolean> {
    // Resolve any in-flight request as cancelled before opening a new one.
    this.resolver?.(false);
    this.request.set({
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel ?? 'Confirm',
      cancelLabel: options.cancelLabel ?? 'Cancel',
      danger: options.danger ?? false,
    });
    return new Promise<boolean>((resolve) => {
      this.resolver = resolve;
    });
  }

  /** Resolve the pending request (true = confirmed, false = cancelled/dismissed). */
  resolve(ok: boolean): void {
    this.request.set(null);
    const resolve = this.resolver;
    this.resolver = null;
    resolve?.(ok);
  }
}

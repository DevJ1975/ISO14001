import { Injectable, signal } from '@angular/core';

export type ToastTone = 'positive' | 'progress' | 'critical' | 'neutral';

/** An optional inline action shown on a toast (e.g. Undo). */
export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

interface ToastOptions {
  message: string;
  tone?: ToastTone;
  action?: ToastAction;
  /** Auto-dismiss after this many ms; 0 keeps it until dismissed. */
  timeout?: number;
}

/** Most toasts on screen at once; a burst of autosaves can't flood the view. */
const MAX_VISIBLE = 4;

/**
 * Transient, non-modal feedback ("Saved", "Undo", errors). Mirrors
 * `ConfirmService`: a root signal service whose state a single host component
 * (`ToastHostComponent`, mounted in the shell) renders. Signal-based, no extra
 * modules — works offline and is easy to drive in tests.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toasts = signal<Toast[]>([]);
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private nextId = 0;

  /** The active toasts, oldest first. */
  readonly items = this.toasts.asReadonly();

  show(options: ToastOptions): number {
    const id = ++this.nextId;
    const toast: Toast = {
      id,
      message: options.message,
      tone: options.tone ?? 'neutral',
      action: options.action,
    };
    this.toasts.update((list) => [...list, toast].slice(-MAX_VISIBLE));

    const timeout = options.timeout ?? 4000;
    if (timeout > 0) {
      this.timers.set(
        id,
        setTimeout(() => this.dismiss(id), timeout),
      );
    }
    return id;
  }

  /** Confirmation that something persisted. */
  saved(message = 'Saved'): number {
    return this.show({ message, tone: 'positive' });
  }

  /** Something went wrong; stays a little longer so it's not missed. */
  error(message: string): number {
    return this.show({ message, tone: 'critical', timeout: 6000 });
  }

  /** A reversible action — surfaces an Undo button and waits longer. */
  undo(message: string, run: () => void): number {
    return this.show({ message, tone: 'neutral', timeout: 8000, action: { label: 'Undo', run } });
  }

  /** Run a toast's action, then dismiss it. */
  runAction(toast: Toast): void {
    toast.action?.run();
    this.dismiss(toast.id);
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.toasts.update((list) => list.filter((toast) => toast.id !== id));
  }
}

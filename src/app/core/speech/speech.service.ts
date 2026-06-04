import { Injectable, signal } from '@angular/core';

/**
 * Minimal subset of the Web Speech API surface we rely on. lib.dom does not
 * ship these types, so we declare just enough to stay typecheck-clean without
 * reaching for `any`.
 */
interface SpeechRecognitionResultLike {
  readonly transcript: string;
}
interface SpeechRecognitionResultEntry {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionResultLike;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionResultListLike {
  readonly length: number;
  item(index: number): SpeechRecognitionResultEntry;
  [index: number]: SpeechRecognitionResultEntry;
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechCapableWindow {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

/**
 * Extract the final transcript from a recognition event by concatenating every
 * result flagged `isFinal`. Kept tiny and pure so it can be unit-tested without
 * the browser API.
 */
export function extractFinalTranscript(event: SpeechRecognitionEventLike): string {
  let out = '';
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i];
    if (result?.isFinal && result.length > 0) {
      out += result[0]?.transcript ?? '';
    }
  }
  return out.trim();
}

/**
 * Append dictated text to an existing note, normalising spacing and the
 * capitalisation of the appended sentence. Pure helper — unit-tested in node.
 */
export function mergeTranscript(existing: string, addition: string): string {
  const trimmedAddition = addition.trim();
  if (!trimmedAddition) return existing;

  const base = existing.replace(/\s+$/, '');
  if (!base) {
    return capitaliseFirst(trimmedAddition);
  }

  // If the previous text ended a sentence, capitalise the new fragment.
  const startsSentence = /[.!?]$/.test(base);
  const piece = startsSentence ? capitaliseFirst(trimmedAddition) : trimmedAddition;
  return `${base} ${piece}`;
}

function capitaliseFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

@Injectable({ providedIn: 'root' })
export class SpeechService {
  /** Whether the Web Speech API is usable in this environment. */
  readonly supported: boolean;

  /** Reactive flag reflecting an active dictation session. */
  readonly listening = signal(false);

  private readonly ctor: SpeechRecognitionCtor | null;
  private recognition: SpeechRecognitionLike | null = null;

  constructor() {
    this.ctor = this.resolveCtor();
    this.supported = this.ctor !== null;
  }

  /**
   * Begin dictation. Each finalised phrase is delivered to `onResult`. Calling
   * `start` while already listening is a no-op.
   */
  start(onResult: (text: string) => void): void {
    if (!this.ctor || this.listening()) return;

    const recognition = new this.ctor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = this.resolveLang();

    recognition.onresult = (event) => {
      const text = extractFinalTranscript(event);
      if (text) onResult(text);
    };
    recognition.onerror = () => this.reset();
    recognition.onend = () => this.reset();

    this.recognition = recognition;
    this.listening.set(true);
    try {
      recognition.start();
    } catch {
      this.reset();
    }
  }

  /** Stop the current dictation session, if any. */
  stop(): void {
    if (!this.recognition) {
      this.listening.set(false);
      return;
    }
    try {
      this.recognition.stop();
    } catch {
      this.reset();
    }
  }

  private reset(): void {
    this.recognition = null;
    this.listening.set(false);
  }

  private resolveCtor(): SpeechRecognitionCtor | null {
    if (typeof window === 'undefined') return null;
    const win = window as unknown as SpeechCapableWindow;
    return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
  }

  private resolveLang(): string {
    if (typeof navigator !== 'undefined' && navigator.language) {
      return navigator.language;
    }
    return 'en-GB';
  }
}

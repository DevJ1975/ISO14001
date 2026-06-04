import { Injectable, inject } from '@angular/core';

import { ClauseAnswer, answerFromFieldGuide } from '../domain';
import { FieldApiService } from '../field/field-api.service';

/**
 * "Ask the standard" copilot. Tries the server-side AI answerer first; on any
 * failure (offline, or AI not configured) it falls back to the offline field-guide
 * engine — so the copilot always answers, with or without a key/network.
 */
@Injectable({ providedIn: 'root' })
export class CopilotService {
  private readonly api = inject(FieldApiService);

  async ask(question: string): Promise<ClauseAnswer> {
    try {
      return await this.api.askCopilot(question);
    } catch {
      return answerFromFieldGuide(question);
    }
  }
}

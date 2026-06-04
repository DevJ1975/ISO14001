import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { CopilotClauseRef, COPILOT_SUGGESTIONS } from '../../core/domain';
import { CopilotService } from '../../core/copilot/copilot.service';

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  clauseRefs?: CopilotClauseRef[];
  source?: 'fieldGuide' | 'ai';
}

@Component({
  selector: 'app-copilot',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './copilot.component.html',
  styleUrl: './copilot.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CopilotComponent {
  private readonly copilot = inject(CopilotService);

  protected readonly turns = signal<Turn[]>([]);
  protected readonly pending = signal(false);
  protected readonly suggestions = COPILOT_SUGGESTIONS;

  protected async ask(question: string): Promise<void> {
    const q = question.trim();
    if (!q || this.pending()) return;
    this.turns.update((turns) => [...turns, { role: 'user', text: q }]);
    this.pending.set(true);
    const answer = await this.copilot.ask(q);
    this.turns.update((turns) => [
      ...turns,
      { role: 'assistant', text: answer.answer, clauseRefs: answer.clauseRefs, source: answer.source },
    ]);
    this.pending.set(false);
  }
}

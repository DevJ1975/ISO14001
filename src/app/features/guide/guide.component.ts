import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';

import { AUDIT_METHODOLOGY, CLAUSE_FIELD_GUIDE, GRADING_GUIDE } from '../../core/domain';

@Component({
  selector: 'app-guide',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './guide.component.html',
  styleUrl: './guide.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideComponent {
  private readonly route = inject(ActivatedRoute);

  protected readonly methodology = AUDIT_METHODOLOGY;
  protected readonly grading = GRADING_GUIDE;
  /** Compact jump index over every clause (always the full, unfiltered set). */
  protected readonly clauseIndex = CLAUSE_FIELD_GUIDE.map((clause) => ({ clauseId: clause.clauseId, title: clause.title }));

  protected readonly query = signal('');
  protected readonly clauses = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return CLAUSE_FIELD_GUIDE;
    return CLAUSE_FIELD_GUIDE.filter(
      (clause) => clause.clauseId.toLowerCase().includes(q) || clause.title.toLowerCase().includes(q),
    );
  });

  private readonly fragment = toSignal(this.route.fragment);

  constructor() {
    // Deep-link: /guide#clause-6.1.2 scrolls that clause into view once rendered.
    effect(() => {
      const fragment = this.fragment();
      if (fragment) setTimeout(() => this.scrollTo(fragment), 0);
    });
  }

  protected gradeTone(grade: string): 'critical' | 'progress' | 'neutral' {
    if (grade === 'majorNc') return 'critical';
    if (grade === 'minorNc') return 'progress';
    return 'neutral';
  }

  private scrollTo(fragment: string): void {
    if (typeof document === 'undefined') return;
    document.getElementById(fragment)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

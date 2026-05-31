import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

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
  protected readonly methodology = AUDIT_METHODOLOGY;
  protected readonly grading = GRADING_GUIDE;
  protected readonly clauses = CLAUSE_FIELD_GUIDE;

  protected gradeTone(grade: string): 'critical' | 'progress' | 'neutral' {
    if (grade === 'majorNc') return 'critical';
    if (grade === 'minorNc') return 'progress';
    return 'neutral';
  }
}

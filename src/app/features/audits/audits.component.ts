import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { FieldAuditStore } from '../../core/field/field-audit-store';

@Component({
  selector: 'app-audits',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './audits.component.html',
  styleUrl: './audits.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditsComponent {
  protected readonly store = inject(FieldAuditStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly canCreate = computed(() => ['leadAuditor', 'tenantAdmin'].includes(this.auth.user()?.role ?? ''));
  protected readonly creating = signal(false);
  protected readonly showForm = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly criteria = signal('ISO 45001:2018');

  constructor() {
    void this.store.loadAudits();
  }

  protected statusTone(status: string): 'positive' | 'progress' | 'critical' | 'neutral' {
    if (status === 'closed' || status === 'archived') return 'positive';
    if (status === 'followUp') return 'critical';
    if (status === 'draft') return 'neutral';
    return 'progress';
  }

  protected async open(id: string): Promise<void> {
    await this.store.selectAudit(id);
    await this.router.navigateByUrl('/');
  }

  protected async create(auditee: string, scope: string): Promise<void> {
    this.error.set(null);
    if (auditee.trim().length < 2) {
      this.error.set('Enter the auditee / organization name.');
      return;
    }
    this.creating.set(true);
    const audit = await this.store.createAudit({ auditee: auditee.trim(), scope: scope.trim(), criteria: this.criteria() });
    this.creating.set(false);
    if (!audit) {
      this.error.set('Could not create the audit. You must be signed in (Live) as a lead auditor.');
      return;
    }
    this.showForm.set(false);
    await this.router.navigateByUrl('/');
  }
}

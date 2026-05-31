import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { FieldAuditStore, RegisterResult } from '../../core/field/field-audit-store';

type Tab =
  | 'aspects'
  | 'risks'
  | 'compliance'
  | 'objectives'
  | 'resources'
  | 'competence'
  | 'awareness'
  | 'communication'
  | 'documents'
  | 'emergency'
  | 'parties'
  | 'review';
type Tone = 'positive' | 'progress' | 'critical' | 'neutral';

@Component({
  selector: 'app-registers',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './registers.component.html',
  styleUrl: './registers.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistersComponent {
  protected readonly store = inject(FieldAuditStore);
  protected readonly tab = signal<Tab>('aspects');

  protected readonly tabs: { value: Tab; label: string; icon: string }[] = [
    { value: 'aspects', label: 'Aspects', icon: 'eco' },
    { value: 'risks', label: 'Risks/opps', icon: 'balance' },
    { value: 'compliance', label: 'Compliance', icon: 'gavel' },
    { value: 'objectives', label: 'Objectives', icon: 'flag_circle' },
    { value: 'resources', label: 'Resources', icon: 'inventory_2' },
    { value: 'competence', label: 'Competence', icon: 'school' },
    { value: 'awareness', label: 'Awareness', icon: 'campaign' },
    { value: 'communication', label: 'Comms', icon: 'forum' },
    { value: 'documents', label: 'Documents', icon: 'description' },
    { value: 'emergency', label: 'Emergency', icon: 'emergency' },
    { value: 'parties', label: 'Parties', icon: 'groups' },
    { value: 'review', label: 'Mgmt review', icon: 'fact_check' },
  ];

  protected readonly results: { value: RegisterResult; label: string; tone: Tone }[] = [
    { value: 'conforming', label: 'Conform', tone: 'positive' },
    { value: 'nonconforming', label: 'Nonconform', tone: 'critical' },
    { value: 'needsFollowUp', label: 'Follow-up', tone: 'progress' },
    { value: 'notApplicable', label: 'N/A', tone: 'neutral' },
  ];

  protected setTab(value: Tab): void {
    this.tab.set(value);
  }

  protected resultTone(result: RegisterResult): Tone {
    if (result === 'conforming') return 'positive';
    if (result === 'nonconforming') return 'critical';
    if (result === 'needsFollowUp') return 'progress';
    return 'neutral';
  }
}

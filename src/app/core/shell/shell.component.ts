import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { ConditionsService } from '../conditions/conditions.service';
import { FieldAuditStore } from '../field/field-audit-store';
import { ThemeService } from '../theme/theme.service';

interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: string;
  readonly exact: boolean;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule, MatIconModule],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly conditions = inject(ConditionsService);
  protected readonly store = inject(FieldAuditStore);

  protected readonly nav: NavItem[] = [
    { path: '/', label: 'Overview', icon: 'dashboard', exact: true },
    { path: '/fieldwork', label: 'Fieldwork', icon: 'checklist', exact: false },
    { path: '/evidence', label: 'Evidence', icon: 'photo_camera', exact: false },
    { path: '/findings', label: 'Findings', icon: 'flag', exact: false },
    { path: '/report', label: 'Report', icon: 'description', exact: false },
  ];

  protected toggleTheme(): void {
    this.theme.toggle();
  }

  protected sync(): void {
    this.store.syncNow();
  }
}

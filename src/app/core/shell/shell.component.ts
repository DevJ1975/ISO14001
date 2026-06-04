import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AlertsService } from '../alerts/alerts.service';
import { AuthService } from '../auth/auth.service';
import { ConditionsService } from '../conditions/conditions.service';
import { FieldAuditStore } from '../field/field-audit-store';
import { NotificationsService } from '../notifications/notifications.service';
import { ThemeService } from '../theme/theme.service';
import { CommandPaletteComponent } from '../ui/command-palette.component';
import { CommandPaletteService } from '../ui/command-palette.service';
import { ConfirmHostComponent } from '../ui/confirm-host.component';
import { ToastHostComponent } from '../ui/toast-host.component';
import { WelcomeHostComponent } from '../onboarding/welcome-host.component';
import { NAV_DESTINATIONS, NavItem } from './nav';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatIconModule,
    ConfirmHostComponent,
    ToastHostComponent,
    CommandPaletteComponent,
    WelcomeHostComponent,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly conditions = inject(ConditionsService);
  protected readonly store = inject(FieldAuditStore);
  protected readonly auth = inject(AuthService);
  protected readonly alerts = inject(AlertsService);
  protected readonly notifications = inject(NotificationsService);
  protected readonly palette = inject(CommandPaletteService);
  private readonly router = inject(Router);

  /** Notification dropdown open state. */
  protected readonly notifOpen = signal(false);

  protected toggleNotifications(): void {
    this.notifOpen.update((open) => !open);
  }

  protected closeNotifications(): void {
    this.notifOpen.set(false);
  }

  protected openNotification(link: string, fragment: string | undefined, id: string): void {
    this.notifications.markRead(id);
    this.notifOpen.set(false);
    void this.router.navigate([link], fragment ? { fragment } : {});
  }

  /** Critical + warning alert count for the Actions nav badge. */
  protected readonly alertBadge = computed(() => {
    const counts = this.alerts.counts();
    return counts.critical + counts.warning;
  });

  /** Where the field data is coming from right now: live backend, local store, or offline. */
  protected readonly sourceState = computed<'live' | 'local' | 'offline'>(() =>
    !this.store.online() ? 'offline' : this.store.source(),
  );

  protected readonly sourceLabel = computed(() => {
    const state = this.sourceState();
    return state === 'live' ? 'Live' : state === 'offline' ? 'Offline' : 'Local';
  });

  protected readonly sourceHint = computed(() => {
    const state = this.sourceState();
    if (state === 'live') return 'Connected to the live backend';
    if (state === 'offline') return 'Offline — changes are queued on this device';
    return 'Local store — backend not connected';
  });

  protected readonly nav: readonly NavItem[] = NAV_DESTINATIONS;

  protected toggleTheme(): void {
    this.theme.toggle();
  }

  protected sync(): void {
    this.store.syncNow();
  }

  protected logout(): void {
    this.auth.logout();
    void this.store.reload();
    void this.router.navigateByUrl('/login');
  }
}

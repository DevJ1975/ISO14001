import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AlertsService } from '../alerts/alerts.service';
import { AuthService } from '../auth/auth.service';
import { ConditionsService } from '../conditions/conditions.service';
import { I18nService } from '../i18n/i18n.service';
import { LocaleSwitcherComponent } from '../i18n/locale-switcher.component';
import { TranslatePipe } from '../i18n/translate.pipe';
import { FieldAuditStore } from '../field/field-audit-store';
import { NotificationsService } from '../notifications/notifications.service';
import { ThemeService } from '../theme/theme.service';
import { CommandPaletteComponent } from '../ui/command-palette.component';
import { CommandPaletteService } from '../ui/command-palette.service';
import { ConfirmHostComponent } from '../ui/confirm-host.component';
import { ToastHostComponent } from '../ui/toast-host.component';
import { OnboardingService } from '../onboarding/onboarding.service';
import { TourHostComponent } from '../onboarding/tour-host.component';
import { TourService } from '../onboarding/tour.service';
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
    TourHostComponent,
    LocaleSwitcherComponent,
    TranslatePipe,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly i18n = inject(I18nService);
  protected readonly conditions = inject(ConditionsService);
  protected readonly store = inject(FieldAuditStore);
  protected readonly auth = inject(AuthService);
  protected readonly alerts = inject(AlertsService);
  protected readonly notifications = inject(NotificationsService);
  protected readonly palette = inject(CommandPaletteService);
  protected readonly tour = inject(TourService);
  private readonly onboarding = inject(OnboardingService);
  private readonly router = inject(Router);

  /** Notification dropdown open state. */
  protected readonly notifOpen = signal(false);

  /** Auto-launches the guided tour once, after first-run welcome is dismissed. */
  private tourAutoStarted = false;

  constructor() {
    effect(() => {
      const signedIn = !!this.auth.user();
      const welcomeDone = this.onboarding.seen();
      const tourDone = this.tour.done();
      if (signedIn && welcomeDone && !tourDone && !this.tourAutoStarted) {
        this.tourAutoStarted = true;
        this.tour.start();
      }
    });
  }

  /** Re-launch the guided tour on demand (header help action). */
  protected takeTour(): void {
    this.tour.start();
  }

  /** "More" overflow menu (mobile only) open state. */
  protected readonly moreOpen = signal(false);

  protected toggleNotifications(): void {
    this.moreOpen.set(false);
    this.notifOpen.update((open) => !open);
  }

  protected closeNotifications(): void {
    this.notifOpen.set(false);
  }

  protected toggleMore(): void {
    this.notifOpen.set(false);
    this.moreOpen.update((open) => !open);
  }

  protected closeMore(): void {
    this.moreOpen.set(false);
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
    this.i18n.locale(); // re-evaluate on locale change
    if (state === 'live') return this.i18n.t('shell.source.live');
    if (state === 'offline') return this.i18n.t('shell.source.offline');
    return this.i18n.t('shell.source.local');
  });

  protected readonly sourceHint = computed(() => {
    const state = this.sourceState();
    this.i18n.locale(); // re-evaluate on locale change
    if (state === 'live') return this.i18n.t('shell.source.hint.live');
    if (state === 'offline') return this.i18n.t('shell.source.hint.offline');
    return this.i18n.t('shell.source.hint.local');
  });

  protected readonly nav: readonly NavItem[] = NAV_DESTINATIONS;

  /**
   * Navigation scoped to the signed-in role: auditees (clientViewer) only ever
   * see the client portal; auditor roles get the full workspace.
   */
  protected readonly visibleNav = computed<readonly NavItem[]>(() =>
    this.auth.isAuditee() ? this.nav.filter((item) => item.path === '/portal') : this.nav,
  );

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

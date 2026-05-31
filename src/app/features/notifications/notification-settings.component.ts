import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import type { AlertSeverity } from '../../core/alerts/alerts.logic';
import { NotificationsService } from '../../core/notifications/notifications.service';
import type { NotificationChannel } from '../../core/notifications/notifications.logic';

/**
 * Notification preferences: channels, minimum severity, and per-category mutes.
 * The in-app channel is always on; email/push are toggles that drive the
 * delivery transport (stubbed in this environment — see notification-transport).
 */
@Component({
  selector: 'app-notification-settings',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './notification-settings.component.html',
  styleUrl: './notification-settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationSettingsComponent {
  protected readonly notifications = inject(NotificationsService);
  protected readonly prefs = this.notifications.prefs;

  protected readonly severities: { value: AlertSeverity; label: string; hint: string }[] = [
    { value: 'info', label: 'Everything', hint: 'All notifications, including informational' },
    { value: 'warning', label: 'Warnings & critical', hint: 'Skip purely informational notices' },
    { value: 'critical', label: 'Critical only', hint: 'Only the most urgent items' },
  ];

  /** Categories present in the current alert set, for the mute list. */
  protected readonly categories = computed(() => {
    const set = new Set(this.notifications.notifications().map((n) => n.category));
    // Include muted categories even if not currently active, so they can be unmuted.
    for (const c of this.prefs().mutedCategories) set.add(c);
    return [...set].sort((a, b) => a.localeCompare(b));
  });

  protected isMuted(category: string): boolean {
    return this.prefs().mutedCategories.map((c) => c.toLowerCase()).includes(category.toLowerCase());
  }

  protected setChannel(channel: NotificationChannel, event: Event): void {
    this.notifications.setChannel(channel, (event.target as HTMLInputElement).checked);
  }

  protected setMinSeverity(value: AlertSeverity): void {
    this.notifications.setMinSeverity(value);
  }

  protected toggleMuted(category: string): void {
    this.notifications.toggleMutedCategory(category);
  }
}

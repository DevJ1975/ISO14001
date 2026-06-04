import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';

import { AUDITOR_MANUAL, type ManualSection } from '../../core/domain';

/** Concatenate every searchable string in a section for keyword filtering. */
function sectionHaystack(section: ManualSection): string {
  const parts: string[] = [section.title, section.intro];
  for (const sub of section.subsections) {
    parts.push(sub.heading);
    for (const block of sub.blocks) {
      if (block.text) parts.push(block.text);
      if (block.items) parts.push(...block.items);
    }
  }
  return parts.join(' ').toLowerCase();
}

@Component({
  selector: 'app-manual',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './manual.component.html',
  styleUrl: './manual.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManualComponent {
  private readonly route = inject(ActivatedRoute);

  protected readonly manual = AUDITOR_MANUAL;
  /** Full, unfiltered table of contents — stable regardless of the search query. */
  protected readonly toc = AUDITOR_MANUAL.map((section) => ({ id: section.id, title: section.title, icon: section.icon }));

  protected readonly query = signal('');
  protected readonly sections = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.manual;
    return this.manual.filter((section) => sectionHaystack(section).includes(q));
  });

  private readonly fragment = toSignal(this.route.fragment);

  constructor() {
    // Deep-link: /manual#principles scrolls that section into view once rendered.
    effect(() => {
      const fragment = this.fragment();
      if (fragment) setTimeout(() => this.scrollTo(fragment), 0);
    });
  }

  private scrollTo(fragment: string): void {
    if (typeof document === 'undefined') return;
    document.getElementById(fragment)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { WIKI, WikiDoc } from './wiki-content.generated';

interface SearchHit {
  kind: 'doc' | 'faq';
  docId: string;
  title: string;
  subtitle: string;
  snippet: string;
}

@Component({
  selector: 'app-wiki',
  standalone: true,
  imports: [FormsModule, MatIconModule],
  templateUrl: './wiki.component.html',
  styleUrl: './wiki.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WikiComponent {
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly wiki = WIKI;

  protected readonly query = signal('');
  protected readonly showChangelog = signal(false);
  protected readonly activeId = signal(WIKI.docs.find((d) => d.id === 'user-guide')?.id ?? WIKI.docs[0]?.id ?? '');

  /** Categories (in order) paired with their documents (in order). */
  protected readonly grouped = computed(() =>
    this.wiki.categories
      .map((category) => ({
        category,
        docs: this.wiki.docs
          .filter((d) => d.category === category.id)
          .sort((a, b) => a.order - b.order),
      }))
      .filter((g) => g.docs.length > 0),
  );

  protected readonly activeDoc = computed<WikiDoc>(
    () => this.wiki.docs.find((d) => d.id === this.activeId()) ?? this.wiki.docs[0],
  );

  /** First-party, build-time-generated HTML — trusted intentionally (no user input). */
  protected readonly activeHtml = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.activeDoc().html),
  );

  protected readonly activeFaqs = computed(() =>
    this.activeDoc().faqs.map((f) => ({
      question: f.question,
      answer: this.sanitizer.bypassSecurityTrustHtml(f.answerHtml),
    })),
  );

  protected readonly results = computed<SearchHit[]>(() => {
    const q = this.query().trim().toLowerCase();
    if (q.length < 2) return [];
    const hits: SearchHit[] = [];
    for (const d of this.wiki.docs) {
      if (`${d.title} ${d.summary} ${d.text}`.toLowerCase().includes(q)) {
        hits.push({ kind: 'doc', docId: d.id, title: d.title, subtitle: this.categoryTitle(d.category), snippet: d.summary });
      }
    }
    for (const f of this.wiki.faqs) {
      if (`${f.question} ${f.answerHtml}`.toLowerCase().includes(q)) {
        hits.push({ kind: 'faq', docId: f.docId, title: f.question, subtitle: 'FAQ', snippet: '' });
      }
    }
    return hits.slice(0, 40);
  });

  protected categoryTitle(id: string): string {
    return this.wiki.categories.find((c) => c.id === id)?.title ?? id;
  }

  protected select(id: string): void {
    this.activeId.set(id);
    this.query.set('');
    this.showChangelog.set(false);
    queueMicrotask(() => document.querySelector('.wiki-main')?.scrollTo({ top: 0 }));
  }

  protected toggleChangelog(): void {
    this.showChangelog.update((v) => !v);
  }

  /** Intercept clicks on internal cross-references rendered inside doc HTML. */
  protected onContentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    const link = target?.closest('[data-doc]') as HTMLElement | null;
    if (link) {
      const id = link.getAttribute('data-doc');
      if (id && this.wiki.docs.some((d) => d.id === id)) {
        event.preventDefault();
        this.select(id);
      }
    }
  }
}

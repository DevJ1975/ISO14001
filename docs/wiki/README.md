# Auditor Wiki & Knowledge Base

This folder is the **source of truth** for the in-app Wiki & FAQs (the `/wiki`
route). Content is authored as Markdown and compiled into a typed module the
Angular app imports, so the knowledge base ships **bundled and offline-ready**.

## How it works

```
docs/wiki/
├─ wiki.config.json            # categories + manual major version
├─ content/<category>/*.md     # the documents (front matter + Markdown)
├─ .wiki-versions.json         # version lock (per-doc hash, version, history)
└─ CHANGELOG.md                # generated, human-readable changelog
        │
        ▼  node scripts/generate-wiki.mjs
src/app/features/wiki/wiki-content.generated.ts   # typed, imported by the app
```

The generator parses front matter, converts Markdown → safe HTML, builds a
table of contents, parses FAQ documents into question/answer pairs, and
maintains automatic versioning.

## Authoring

1. Add or edit a Markdown file under `content/<category>/`.
2. Include front matter:

   ```yaml
   ---
   id: my-doc            # unique, kebab-case (used for cross-links)
   title: My Document
   category: iso-14001   # must match an id in wiki.config.json
   order: 3
   icon: eco             # Material Symbols name
   type: doc             # `doc` (default) or `faq`
   version: 1.0.0
   summary: One-line description shown in lists and search.
   ---
   ```

3. Cross-link other docs with `[label](other-doc-id)` — these become in-app
   navigation, not external links.
4. For `type: faq`, write each question as a `### Question` heading followed by
   its answer; the app renders them as an accordion.

## Generate / watch (versioning control)

- `npm run wiki:generate` — one-shot build of the typed module + changelog.
- `npm run wiki:watch` — regenerate automatically while you edit (dev).
- Runs automatically on `npm run build` (via `prebuild`) and `npm start`
  (via `prestart`), so every deploy ships current content.

### Versioning

Each document carries a content hash in `.wiki-versions.json`. When the body
changes, the generator **bumps the patch version**, stamps `lastUpdated`, and
appends a changelog entry. The overall knowledge-base version is
`major.docCount.totalRevisions` and is shown in the app header.

## Content boundaries

These documents are Trainovate-authored guidance. They refer to ISO standards by clause identifier and short title only and do not reproduce ISO standard requirements text.

## Legacy manuals

The original `auditor-implementation-manual.md` and `auditor-training-manual.md`
remain for the dashboard download links; the in-app guidance now lives under
`content/`.

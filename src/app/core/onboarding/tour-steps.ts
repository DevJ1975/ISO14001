import { NAV_DESTINATIONS, NavItem } from '../shell/nav';

/**
 * One slide of the first-run guided tour. Data-driven so steps are trivial to
 * extend or reorder: add an entry to {@link TOUR_STEPS}. `route`/`icon` reuse
 * the shared `NAV_DESTINATIONS` so the tour can never drift from the real nav.
 */
export interface TourStep {
  readonly id: string;
  readonly title: string;
  /** Trainovate-authored, plain-language explanation for a non-technical auditor. */
  readonly body: string;
  /** Nav target this step introduces, if any. */
  readonly route?: string;
  /** Material icon name; defaults to the matching nav item's icon. */
  readonly icon?: string;
}

/** Look up a `NAV_DESTINATIONS` entry by path so steps borrow its label/icon. */
function nav(path: string): NavItem | undefined {
  return NAV_DESTINATIONS.find((item) => item.path === path);
}

/**
 * The core auditor workflow, in order:
 * Overview → Audits → Fieldwork → Evidence → Findings/CAPA → Report sign-off.
 */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'overview',
    title: 'Start at the Overview',
    body: 'Your home base. The Overview shows live KPIs, what needs attention, and how the current audit is tracking — glance here first each day.',
    route: '/',
    icon: nav('/')?.icon ?? 'dashboard',
  },
  {
    id: 'audits',
    title: 'Pick or create an Audit',
    body: 'Head to Audits to open an existing engagement or start a new one. Everything you capture is filed against the audit you have selected here.',
    route: '/audits',
    icon: nav('/audits')?.icon ?? 'folder_open',
  },
  {
    id: 'fieldwork',
    title: 'Work the clause checklist',
    body: 'Fieldwork walks every ISO 45001 clause one at a time. Mark conformity, jot notes, and move through the standard at your own pace — it all autosaves.',
    route: '/fieldwork',
    icon: nav('/fieldwork')?.icon ?? 'checklist',
  },
  {
    id: 'evidence',
    title: 'Capture Evidence as you go',
    body: 'Snap a photo or add a note from the floor. Evidence attaches to the clause you are on, so your audit trail builds itself while you walk the site.',
    route: '/evidence',
    icon: nav('/evidence')?.icon ?? 'photo_camera',
  },
  {
    id: 'findings',
    title: 'Raise Findings and CAPA',
    body: 'Turn observations into findings — nonconformities, OFIs — and assign corrective actions (CAPA). Each one links back to the clause and evidence behind it.',
    route: '/findings',
    icon: nav('/findings')?.icon ?? 'flag',
  },
  {
    id: 'report',
    title: 'Conclude and sign off the Report',
    body: 'When fieldwork is done, the Report pulls it all together for your conclusion and sign-off, ready to export as a polished PDF for the client.',
    route: '/report',
    icon: nav('/report')?.icon ?? 'description',
  },
];

/** localStorage key marking the tour as completed/dismissed (mirrors the welcome flag idiom). */
export const TOUR_DONE_KEY = 'soteria-guided-tour-done';

/** Total number of steps; handy for "Step n of N" labels. */
export const TOUR_STEP_COUNT = TOUR_STEPS.length;

/** Clamp an index into the valid step range, so navigation can never overflow. */
export function clampStepIndex(index: number, count: number = TOUR_STEP_COUNT): number {
  if (!Number.isFinite(index) || count <= 0) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), count - 1);
}

/** True when `index` is the final step (the place where "Finish" replaces "Next"). */
export function isLastStep(index: number, count: number = TOUR_STEP_COUNT): boolean {
  return count > 0 && index >= count - 1;
}

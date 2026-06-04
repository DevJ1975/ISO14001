import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

interface ManualBlock {
  kind: 'p' | 'ul' | 'steps' | 'note';
  text?: string;
  items?: string[];
}

interface ManualSection {
  id: string;
  title: string;
  icon: string;
  blocks: ManualBlock[];
}

const SECTIONS: ManualSection[] = [
  {
    id: 'overview',
    title: 'Overview',
    icon: 'menu_book',
    blocks: [
      {
        kind: 'p',
        text: 'Soteria Signum by Trainovate is a field-ready ISO 45001 occupational health & safety (OH&S) audit workspace for lead auditors and audit teams. It guides an audit from on-site fieldwork through nonconformities, corrective action, audit conclusions and the signed report — and it keeps working when you lose signal.',
      },
      {
        kind: 'p',
        text: 'Each account represents a client site you are auditing. Audits run against ISO 45001:2018 (or the 2026 edition placeholder), grounded in ISO 19011:2018 (auditing management systems) and ISO/IEC 17021-1 (certification audits). This manual is your reference for each part of the workflow.',
      },
    ],
  },
  {
    id: 'sign-in',
    title: 'Signing in (Live vs Local)',
    icon: 'login',
    blocks: [
      { kind: 'p', text: 'Sign in with your auditor credentials to load the live audit for the client site from the backend. The data-source pill in the header shows where your data lives:' },
      {
        kind: 'ul',
        items: [
          'Live — connected to the backend; your changes are saved to the server.',
          'Local — running on the on-device store (backend not reachable/configured); changes are kept on the device.',
          'Offline — no connectivity; changes are queued and sync automatically when you reconnect.',
        ],
      },
      { kind: 'note', text: 'If the backend is not configured you can still choose "Continue in offline demo mode" to explore the workflow on local data.' },
    ],
  },
  {
    id: 'workspace',
    title: 'The workspace tabs',
    icon: 'dashboard',
    blocks: [
      { kind: 'p', text: 'Navigate with the side rail (landscape) or the bottom tab bar (portrait/touch):' },
      {
        kind: 'ul',
        items: [
          'Overview — audit snapshot and status.',
          'Fieldwork — answer the checklist one clause at a time.',
          'Evidence — capture photos and notes as objective evidence.',
          'Findings — grade nonconformities and drive corrective action.',
          'Report — audit conclusions, recommendation and sign-off.',
        ],
      },
    ],
  },
  {
    id: 'fieldwork',
    title: 'Fieldwork — answering clauses',
    icon: 'checklist',
    blocks: [
      { kind: 'p', text: 'Fieldwork presents one clause at a time so you can work one-handed while walking the site.' },
      {
        kind: 'steps',
        items: [
          'Read the clause question and guidance.',
          'Record a result: Conform, Minor NC, Major NC, OFI or N/A.',
          'Add a field note and capture photo evidence as needed.',
          'Use "Log finding" on a non-conforming clause to raise a nonconformity.',
          'Swipe / use Next to move through the checklist; the progress bar tracks completion.',
        ],
      },
    ],
  },
  {
    id: 'evidence',
    title: 'Evidence — objective evidence',
    icon: 'photo_camera',
    blocks: [
      { kind: 'p', text: 'Audit findings must be based on objective evidence. Capture it as you go:' },
      {
        kind: 'ul',
        items: [
          'Photos — taken with the device camera; GPS, timestamp and author are attached automatically.',
          'Notes — interview responses, observations and sample references.',
          'Each item shows a sync badge (queued / syncing / synced) so nothing is lost.',
        ],
      },
    ],
  },
  {
    id: 'nonconformities',
    title: 'Findings & nonconformity grading',
    icon: 'flag',
    blocks: [
      { kind: 'p', text: 'A nonconformity is a non-fulfilment of a requirement. Record it against a specific clause with a clear statement and the objective evidence it is based on, then grade it.' },
      {
        kind: 'ul',
        items: [
          'Major NC — affects the OHSMS’s capability to achieve intended results: absence or total breakdown of a required process, significant doubt about control/conformance, legal or worker-safety risk, or several minors against one requirement (systemic). A major NC blocks certification.',
          'Minor NC — an isolated lapse that does not undermine the OHSMS overall.',
          'OFI — an opportunity for improvement; not a nonconformity.',
        ],
      },
      { kind: 'note', text: 'Only the lead auditor can set the grade and rationale. Open a finding to edit its statement, objective evidence and grading.' },
    ],
  },
  {
    id: 'capa',
    title: 'Corrective action & effectiveness',
    icon: 'build',
    blocks: [
      { kind: 'p', text: 'Each nonconformity drives a corrective-action record (ISO 45001 cl. 10.2):' },
      {
        kind: 'steps',
        items: [
          'Correction — the immediate containment action.',
          'Root cause — why the nonconformity occurred.',
          'Corrective action — what eliminates the cause so it cannot recur, with an owner and due date.',
          'Mark implemented once evidence of implementation exists.',
          'The lead auditor verifies effectiveness; an effective action closes the nonconformity.',
        ],
      },
      { kind: 'note', text: 'Verification of effectiveness is lead-only and requires connectivity. Typical timelines: major NCs ~30 days, minor NCs ~90 days.' },
    ],
  },
  {
    id: 'lifecycle',
    title: 'Audit lifecycle, meetings & conclusions',
    icon: 'event',
    blocks: [
      { kind: 'p', text: 'The audit moves through a lifecycle (planned → fieldwork → reporting → follow-up → closed). Record the opening and closing meetings, then capture the audit conclusions.' },
      {
        kind: 'ul',
        items: [
          'Opening meeting — confirm scope, criteria, methods, confidentiality and schedule with the auditee.',
          'Closing meeting — present findings, agree timelines and record the auditee’s acknowledgement.',
          'Conclusions — overall conformity, OHSMS effectiveness opinion, the degree to which criteria were met, and the recommendation (recommend / conditional / not recommended, or satisfactory / action required for internal audits).',
        ],
      },
    ],
  },
  {
    id: 'report',
    title: 'Report & sign-off',
    icon: 'description',
    blocks: [
      { kind: 'p', text: 'The audit report follows ISO 19011 6.5.7: objectives, scope, criteria, team and participants, dates, findings and evidence, conclusions, the degree criteria were met, and any diverging opinions.' },
      { kind: 'p', text: 'The Report screen shows readiness checks (clauses answered, nonconformities closed, evidence captured, changes synced). When ready, the lead auditor signs off with an attestation; the signed report is recorded on the server.' },
    ],
  },
  {
    id: 'ems',
    title: 'ISO 45001 OH&S registers',
    icon: 'health_and_safety',
    blocks: [
      { kind: 'p', text: 'OH&S evaluation is captured in dedicated registers that mirror the Registers screen. Open each one to review entries against the relevant clause:' },
      {
        kind: 'ul',
        items: [
          'Hazard identification & OH&S risk register (cl. 6.1.2 / 8.1.2) — hazard, activity, who could be harmed, severity × likelihood risk rating, and the controls applied via the hierarchy of controls (elimination, substitution, engineering, administrative, PPE).',
          'Worker consultation & participation register (cl. 5.4) — how non-managerial workers are consulted and take part in OH&S decisions; unique to ISO 45001.',
          'Legal & other requirements register and evaluation of compliance (cl. 6.1.3 / 9.1.2) — requirement, source, how it applies, and compliance status.',
          'Incident, near-miss & investigation register (cl. 10.2) — event, injury classification (including RIDDOR-reportable), root-cause analysis and actions taken.',
          'OH&S performance metrics (cl. 9.1) — leading and lagging indicators such as LTIFR/TRIFR, near-misses and toolbox talks.',
          'Emergency preparedness & response (cl. 8.2) — scenarios, procedures and drills.',
          'Procurement, contractors & outsourcing (cl. 8.1.4) — how OH&S controls extend to suppliers, contractors and outsourced processes.',
          'Management of change (cl. 8.1.3) — how OH&S risks of planned changes are assessed and controlled.',
        ],
      },
      { kind: 'p', text: 'Governance and supporting registers round out the system:' },
      {
        kind: 'ul',
        items: [
          'Interested parties (cl. 4.2), OH&S objectives (cl. 6.2), communication (cl. 7.4) and management review (cl. 9.3).',
          'Resources (cl. 7.1), competence (cl. 7.2), awareness (cl. 7.3) and documented information (cl. 7.5).',
          'Calibration of OH&S monitoring equipment (noise dosimeters, gas detectors), training and competence with expiry tracking, and document control.',
        ],
      },
    ],
  },
  {
    id: 'programme',
    title: 'Audit programme',
    icon: 'calendar_month',
    blocks: [
      { kind: 'p', text: 'The audit programme manages audits across the certification cycle: initial (stage 1/2), surveillance (typically annual) and recertification (before the three-year cycle ends), plus finding trends and auditor competence/impartiality records.' },
    ],
  },
  {
    id: 'offline',
    title: 'Working offline',
    icon: 'cloud_off',
    blocks: [
      { kind: 'p', text: 'Everything you capture is saved on the device first, so dead zones never lose data.' },
      {
        kind: 'ul',
        items: [
          'Mutations are queued; the header shows the pending count.',
          'When you reconnect, queued records sync automatically (or tap the data-source pill to sync now).',
          'Add the app to your iPad Home Screen to run it full-screen as an installed app.',
        ],
      },
    ],
  },
  {
    id: 'roles',
    title: 'Roles & permissions',
    icon: 'admin_panel_settings',
    blocks: [
      {
        kind: 'ul',
        items: [
          'Auditor — answer clauses, capture evidence, raise findings, draft corrective actions.',
          'Lead auditor — additionally grades nonconformities, verifies CAPA effectiveness, records conclusions and signs the report.',
          'Permissions are enforced on the server; lead-only controls are hidden for other roles.',
        ],
      },
    ],
  },
];

@Component({
  selector: 'app-manual',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './manual.component.html',
  styleUrl: './manual.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManualComponent {
  protected readonly sections = SECTIONS;
}

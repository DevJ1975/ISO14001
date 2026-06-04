/**
 * In-app Auditor's Manual: a comprehensive, ORIGINAL methodology reference for
 * occupational health & safety (OH&S) auditors working to ISO 45001, grounded in
 * the auditing principles of ISO 19011 and the certification practice of
 * ISO/IEC 17021-1. It explains the craft of auditing — principles and ethics,
 * the audit lifecycle, report writing, corrective action, competence and field
 * working — and complements the clause-by-clause field guide (`audit-guide.ts`)
 * and the app-usage user manual (`manual.component.ts`).
 *
 * This is Trainovate's own wording. It deliberately carries NO verbatim standard
 * requirement text (copyright guardrail) and never uses the word that is the
 * hallmark of ISO requirement clauses. It ships as static reference content
 * (no tenant data, no sync), like `standards.ts` and `audit-guide.ts`.
 */

/** A single content block inside a subsection. */
export interface ManualContentBlock {
  kind: 'p' | 'bullets' | 'steps';
  /** Used by 'p'. */
  text?: string;
  /** Used by 'bullets' and 'steps'. */
  items?: string[];
}

/** A heading-led subsection within a manual section. */
export interface ManualSubsection {
  heading: string;
  blocks: ManualContentBlock[];
}

/** A top-level section of the auditor's manual, anchored in the TOC. */
export interface ManualSection {
  id: string;
  title: string;
  icon: string;
  intro: string;
  subsections: ManualSubsection[];
}

/**
 * The full auditor's methodology manual. Ordered so a reader can move from
 * principles, through the lifecycle, into reporting and corrective action, and
 * on to competence, the app's registers, field working and a glossary.
 */
export const AUDITOR_MANUAL: ManualSection[] = [
  {
    id: 'principles',
    title: 'Audit principles & ethics',
    icon: 'balance',
    intro:
      'Sound auditing rests on a small set of principles. They make conclusions from different auditors comparable and give the audit its credibility. Hold to them whatever the pressure of the day.',
    subsections: [
      {
        heading: 'Integrity — the foundation of professionalism',
        blocks: [
          {
            kind: 'p',
            text: 'Work honestly, diligently and responsibly. Stay within the limits of your competence and your remit, and act impartially in every dealing. Integrity is what lets an auditee trust an outcome they may not welcome.',
          },
        ],
      },
      {
        heading: 'Fair presentation — report truthfully and accurately',
        blocks: [
          {
            kind: 'p',
            text: 'Findings, conclusions and reports reflect the audit truthfully and accurately. Record significant obstacles, unresolved differences of opinion between the team and the auditee, and the limits of what you were able to sample. Do not overstate a minor issue or quietly drop an awkward one.',
          },
        ],
      },
      {
        heading: 'Due professional care — judgement worth relying on',
        blocks: [
          {
            kind: 'p',
            text: 'Apply the care and judgement the situation deserves. The importance of the task and the trust placed in you by clients, certification bodies and — above all — the workers whose safety is in scope, all call for diligence and sound reasoning rather than box-ticking.',
          },
        ],
      },
      {
        heading: 'Confidentiality — discretion with information',
        blocks: [
          {
            kind: 'p',
            text: 'Treat what you see and hear with discretion. Use information only for the audit and protect it from improper disclosure. Be especially careful with commercially sensitive material, personal data and anything a worker tells you in confidence about a hazard or a concern.',
          },
        ],
      },
      {
        heading: 'Independence & impartiality — the basis for objectivity',
        blocks: [
          {
            kind: 'p',
            text: 'Stay independent of the activity you audit and free from bias and conflicts of interest. Where full independence is impractical — a small internal team, for example — act objectively and make sure conclusions rest only on evidence.',
          },
          {
            kind: 'bullets',
            items: [
              'Do not audit your own work, or work you advised on, designed or managed.',
              'Declare any relationship, financial interest or prior involvement that a reasonable observer might question.',
              'Resist pressure — from the client, the auditee or commercial interests — to soften, inflate or omit a finding.',
              'Rotate auditors over a certification cycle so familiarity does not erode objectivity.',
            ],
          },
        ],
      },
      {
        heading: 'Evidence-based approach — a rational route to reliable conclusions',
        blocks: [
          {
            kind: 'p',
            text: 'Base every conclusion on verifiable evidence. Because an audit happens in finite time with finite access, you sample: the confidence in your conclusions depends on how representative that sample is. Record what you examined so another competent auditor could follow the same trail.',
          },
        ],
      },
      {
        heading: 'Risk-based thinking — spend effort where harm is likeliest',
        blocks: [
          {
            kind: 'p',
            text: 'Direct your time toward the activities, areas and processes where the OH&S risk — and the consequence of failure — is greatest. A risk-based plan samples high-hazard work, recent incidents and previously weak areas more deeply than low-risk routine, and adapts as the evidence unfolds.',
          },
        ],
      },
    ],
  },
  {
    id: 'lifecycle-initiation',
    title: 'Lifecycle: initiation & objectives',
    icon: 'flag_circle',
    intro:
      'Every audit begins by fixing why it is happening, what it covers and what success looks like. Get this right and the rest of the audit has a clear spine.',
    subsections: [
      {
        heading: 'Objectives, scope and criteria',
        blocks: [
          {
            kind: 'p',
            text: 'Three things frame the audit. Objectives say what the audit sets out to determine; scope says where its boundaries lie (sites, activities, processes, shifts, the time period); criteria are the reference set you compare reality against.',
          },
          {
            kind: 'bullets',
            items: [
              'Objectives — for example, to determine conformity with ISO 45001 and applicable legal duties, and to judge whether the system is effective at preventing harm.',
              'Scope — the physical and organisational boundary, including contractors and outsourced work that sits inside the management system.',
              'Criteria — the standard, the organisation’s own policies and procedures, legal and other requirements, and any contractual commitments.',
            ],
          },
        ],
      },
      {
        heading: 'Audit type and feasibility',
        blocks: [
          {
            kind: 'p',
            text: 'Confirm what kind of audit this is, because it shapes the depth and the decision at the end.',
          },
          {
            kind: 'bullets',
            items: [
              'Stage 1 — a readiness review of documented information, scope and the maturity of the system before the full assessment.',
              'Stage 2 — the on-site assessment of implementation and effectiveness that supports a certification decision.',
              'Surveillance — periodic checks across the cycle that the system stays conforming and effective.',
              'Recertification — a full reassessment before the cycle ends.',
              'Internal — the organisation’s own first-party audit feeding management review and improvement.',
            ],
          },
          {
            kind: 'p',
            text: 'Check feasibility before committing: is there enough information, access, time and co-operation to meet the objectives? If not, agree changes with the client rather than running an audit that cannot deliver.',
          },
        ],
      },
      {
        heading: 'The team and initial contact',
        blocks: [
          {
            kind: 'p',
            text: 'Assemble a team whose combined competence covers the standard, the sector and the hazards in scope, and confirm impartiality for this client. Make initial contact with the auditee to confirm channels, arrange access and site induction, and settle confidentiality and safety arrangements.',
          },
        ],
      },
    ],
  },
  {
    id: 'lifecycle-preparation',
    title: 'Lifecycle: preparation & desk review',
    icon: 'fact_check',
    intro:
      'A good audit is mostly won before you arrive on site. Preparation turns the objectives into a workable plan and surfaces the questions worth asking.',
    subsections: [
      {
        heading: 'Document & desk review',
        blocks: [
          {
            kind: 'p',
            text: 'Review the key documented information ahead of the visit to understand the system and to find the threads worth pulling on site. Treat the desk review as a source of lines of inquiry, not as proof on its own — paper conformity means little until you see it lived.',
          },
          {
            kind: 'bullets',
            items: [
              'The OH&S policy, scope statement and context analysis.',
              'The hazard and risk register, and the methodology behind it.',
              'The legal and other requirements register and recent compliance evaluations.',
              'Objectives and performance data, incident and near-miss logs, and prior audit reports with open findings.',
            ],
          },
        ],
      },
      {
        heading: 'The audit plan',
        blocks: [
          {
            kind: 'p',
            text: 'Build a plan that allocates time to areas, processes and clauses in proportion to risk and to past findings. Share it with the auditee so the day runs smoothly and findings are no surprise.',
          },
          {
            kind: 'steps',
            items: [
              'Map objectives and criteria onto a timetable of areas, processes and interviews.',
              'Weight time toward high-hazard work, recent incidents and previously weak areas.',
              'Identify who you need to meet, including a worker representative where relevant.',
              'Note logistics: access, escorts, permits, PPE, and any restricted or hazardous zones.',
              'Keep the plan flexible — expect to follow threads the evidence opens up.',
            ],
          },
        ],
      },
      {
        heading: 'Working documents',
        blocks: [
          {
            kind: 'p',
            text: 'Prepare the tools you will use to gather and record evidence: checklists, sampling plans and note templates. In this app, the fieldwork checklist and evidence capture serve this role — set them up before you walk the site so you can work one-handed in the field.',
          },
        ],
      },
    ],
  },
  {
    id: 'conduct-onsite',
    title: 'On-site conduct',
    icon: 'tour',
    intro:
      'The on-site phase is where evidence is gathered. It runs from the opening meeting, through review, interviews and observation, to findings — and closes by feeding everything into the closing meeting.',
    subsections: [
      {
        heading: 'Opening meeting',
        blocks: [
          {
            kind: 'p',
            text: 'Open by confirming the plan with the auditee so expectations are aligned and the day runs without surprises. Keep it brief and businesslike.',
          },
          {
            kind: 'bullets',
            items: [
              'Introduce the team and confirm objectives, scope, criteria, methods and the timetable.',
              'Confirm confidentiality, the site safety induction, PPE, permits and escort arrangements.',
              'Explain how findings will be graded and communicated, and how any disagreement will be handled.',
              'Agree when and with whom the closing meeting will happen, and record attendees — the meeting is itself evidence.',
            ],
          },
        ],
      },
      {
        heading: 'Document & record review on site',
        blocks: [
          {
            kind: 'p',
            text: 'Sample records and documents rather than reading everything. Test that documented information is current, controlled and actually used at the point of work — not shelfware.',
          },
          {
            kind: 'bullets',
            items: [
              'Check that the version available where the work happens is the approved, current one.',
              'Trace a record back to the activity it evidences (a permit-to-work to the job it covered) and forward to where it feeds a decision.',
              'Confirm retention and protection of records that matter for safety and legal duties.',
            ],
          },
        ],
      },
      {
        heading: 'Interviews — talk to the people doing the work',
        blocks: [
          {
            kind: 'p',
            text: 'Conformity on paper means little if the floor cannot describe it. Interview a spread of roles and corroborate the same point across them.',
          },
          {
            kind: 'bullets',
            items: [
              'Ask open questions — "show me", "walk me through", "what happens when…" — and let people talk.',
              'Corroborate across operative, supervisor, safety representative and manager to test consistency.',
              'Put people at ease: you are auditing the system, not the individual, and workers must feel safe to speak openly.',
              'Follow the thread an answer opens up — the best evidence is often one question past the checklist.',
            ],
          },
        ],
      },
      {
        heading: 'Observation & walk-through',
        blocks: [
          {
            kind: 'p',
            text: 'See the activity, not just the paperwork. Observe at the point of work and compare what you see against what the risk assessment and safe system of work say should happen.',
          },
          {
            kind: 'bullets',
            items: [
              'Watch high-risk tasks: machine guarding, PPE use, manual handling, working at height, isolation and housekeeping.',
              'Read the OH&S signals — permits and lock-out/tag-out in use, signage, fire exits and extinguishers, hazardous-substance storage, near-miss reporting.',
              'Note the gap between the work as imagined (the procedure) and the work as done (what you observe).',
            ],
          },
        ],
      },
      {
        heading: 'Sampling & traceability',
        blocks: [
          {
            kind: 'p',
            text: 'You cannot see everything, so sample representatively — and record what you sampled so the audit is reproducible.',
          },
          {
            kind: 'bullets',
            items: [
              'Spread samples across shifts, lines, sites, contractors and risk levels — not just the easy or tidy ones.',
              'Follow a thread end-to-end: a hazard, its risk assessment, the control, a permit or record, then any resulting action.',
              'Note the specific documents, areas, people and references sampled so another auditor could repeat the trail.',
              'Remember that absence of evidence is evidence: if a record that ought to exist cannot be produced, that is a finding.',
            ],
          },
        ],
      },
      {
        heading: 'Evidence handling',
        blocks: [
          {
            kind: 'p',
            text: 'Evidence is only as good as its provenance. Capture it cleanly and keep it traceable to the clause and the activity it concerns.',
          },
          {
            kind: 'bullets',
            items: [
              'Record what, where, when and who — a photo with its location and timestamp, a note naming the document or person.',
              'Keep evidence objective and factual; separate what you observed from your interpretation of it.',
              'Protect confidential and personal information; capture only what the finding needs.',
              'Cross-check important points with a second source before relying on them.',
            ],
          },
        ],
      },
      {
        heading: 'Findings & grading',
        blocks: [
          {
            kind: 'p',
            text: 'A finding states a requirement (the clause), the objective evidence you saw, and the specific gap between them — then is graded. Use the grading test, not a gut feel, and stay factual without prescribing the fix.',
          },
          {
            kind: 'bullets',
            items: [
              'Major nonconformity — the system’s ability to prevent injury and ill health is in doubt: a missing or broken-down required process, a significant legal breach or imminent serious risk, or several minors clustering into a systemic failure.',
              'Minor nonconformity — an isolated lapse that does not undermine the system overall.',
              'Opportunity for improvement — a suggestion that would strengthen the system; not a non-fulfilment of a requirement.',
            ],
          },
        ],
      },
      {
        heading: 'Closing meeting',
        blocks: [
          {
            kind: 'p',
            text: 'Present the findings so nothing is a surprise, agree grades and timelines, and record the auditee’s acknowledgement.',
          },
          {
            kind: 'steps',
            items: [
              'Walk through each nonconformity and opportunity for improvement with its evidence and grade.',
              'Agree response and corrective-action timelines — major nonconformities typically within about 30 days, minor within about 90.',
              'Explain the recommendation and the next steps, including how effectiveness will be verified.',
              'Record attendees, points raised and any unresolved difference of opinion.',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'reporting',
    title: 'Report writing & sign-off',
    icon: 'description',
    intro:
      'The report is the durable record of the audit — objective, clause-referenced and defensible long after memories fade. Write it so a reader who was not there can understand what was examined, what was found and why it matters.',
    subsections: [
      {
        heading: 'What the report covers',
        blocks: [
          {
            kind: 'bullets',
            items: [
              'Objectives, scope and criteria, and the dates and locations audited.',
              'The audit team and the auditee participants, including any worker representatives.',
              'A summary of how the audit was conducted, including the sampling approach and any access limits.',
              'Findings with their evidence and grade, and the degree to which the criteria were met.',
              'Audit conclusions: overall conformity, an opinion on the system’s effectiveness, and the recommendation.',
              'Any unresolved diverging opinions between the team and the auditee, recorded fairly.',
            ],
          },
        ],
      },
      {
        heading: 'Writing well',
        blocks: [
          {
            kind: 'bullets',
            items: [
              'Be factual and traceable — every conclusion rests on recorded evidence and a clause reference.',
              'Be specific: name the activity, area, document or record, not a vague generality.',
              'State the gap, not the remedy — the auditee owns the corrective action.',
              'Keep the tone neutral and professional; the report is a record, not a verdict on individuals.',
            ],
          },
        ],
      },
      {
        heading: 'Conclusions & recommendation',
        blocks: [
          {
            kind: 'p',
            text: 'Draw the findings together into a conclusion on overall conformity and on whether the system is effective at achieving its intended results. For certification audits the recommendation is recommend, conditional, or not recommended; for internal audits it is typically satisfactory or action required.',
          },
        ],
      },
      {
        heading: 'Sign-off & distribution',
        blocks: [
          {
            kind: 'p',
            text: 'Before sign-off, confirm the readiness checks: clauses answered, nonconformities recorded with evidence, and changes synced. The lead auditor signs off with an attestation; the signed report is then issued to the agreed distribution list, versioned and retained as controlled information.',
          },
        ],
      },
    ],
  },
  {
    id: 'capa',
    title: 'Nonconformity, corrective action & verification',
    icon: 'build_circle',
    intro:
      'Raising a nonconformity is only half the job. Closing one means verifying that the fix actually worked — not merely that something was done. This cycle is where an audit turns into improvement.',
    subsections: [
      {
        heading: 'Correction vs corrective action',
        blocks: [
          {
            kind: 'p',
            text: 'Two distinct steps follow a nonconformity, and both matter.',
          },
          {
            kind: 'bullets',
            items: [
              'Correction — the immediate action that makes the situation safe and contains the problem now (for example, isolating an unguarded machine).',
              'Corrective action — what eliminates the underlying cause so the problem cannot recur, with an owner and a due date.',
            ],
          },
        ],
      },
      {
        heading: 'Root-cause analysis',
        blocks: [
          {
            kind: 'p',
            text: 'A corrective action is only as good as the cause it targets. Push past the symptom and past "operator error" to the system weakness that allowed it. Techniques such as repeated "why" questioning or a cause-and-effect breakdown help; involve the workers closest to the work.',
          },
        ],
      },
      {
        heading: 'The CAPA cycle in the app',
        blocks: [
          {
            kind: 'steps',
            items: [
              'Record the nonconformity against its clause with a clear statement and the objective evidence behind it.',
              'Capture the correction (the immediate make-safe) and the root cause.',
              'Define the corrective action that removes the cause, with an owner and due date.',
              'Mark it implemented once evidence of implementation exists.',
              'Verify effectiveness with objective evidence; an effective action closes the nonconformity, and an action that has not held is re-opened.',
            ],
          },
        ],
      },
      {
        heading: 'Verifying effectiveness',
        blocks: [
          {
            kind: 'p',
            text: 'Effectiveness is verified against evidence, not assurances — a re-inspection, a fresh record, a trend that has turned. Major nonconformities are often verified before certification or recertification; minor ones may be confirmed at the next visit. Feed systemic or repeat findings into the next audit’s lines of inquiry.',
          },
        ],
      },
    ],
  },
  {
    id: 'competence',
    title: 'Competence, judgement & CPD',
    icon: 'psychology',
    intro:
      'An audit is only as strong as the auditor’s judgement. Competence is built from knowledge, skills and personal behaviours, and it is maintained — never finished.',
    subsections: [
      {
        heading: 'What competence is made of',
        blocks: [
          {
            kind: 'bullets',
            items: [
              'Knowledge of the standard, of auditing method, and of the sector, its processes and its hazards.',
              'Knowledge of applicable legal and other requirements relevant to OH&S.',
              'Skills in planning, sampling, interviewing, observing and writing clear, evidenced findings.',
              'Personal behaviours: ethical, open-minded, diplomatic, observant, perceptive, tenacious, decisive and self-reliant.',
            ],
          },
        ],
      },
      {
        heading: 'Calibrating judgement',
        blocks: [
          {
            kind: 'p',
            text: 'Calibration keeps different auditors reaching comparable conclusions from the same evidence. Without it, one auditor’s minor is another’s major and the audit loses credibility.',
          },
          {
            kind: 'bullets',
            items: [
              'Use the grading test consistently; lean on the grading guide rather than instinct.',
              'Witness audits and joint reviews compare how colleagues weigh the same evidence.',
              'Discuss borderline findings with the team before grading; record the reasoning.',
              'Watch for personal bias — leniency, harshness, recency or familiarity — and correct for it.',
            ],
          },
        ],
      },
      {
        heading: 'Continuing professional development',
        blocks: [
          {
            kind: 'p',
            text: 'Maintain and grow competence over time. Keep up with changes to the standard, to legislation and to sector practice; reflect on feedback from witnessed audits and complaints; and keep a record of your development for the audit programme’s competence and impartiality files.',
          },
        ],
      },
    ],
  },
  {
    id: 'registers',
    title: 'Using the app’s registers',
    icon: 'inventory_2',
    intro:
      'The Registers screen mirrors the evidence an OH&S system generates. Each register lines up with one or more clauses; open them as you audit to review entries and to anchor findings to real records.',
    subsections: [
      {
        heading: 'Core OH&S registers',
        blocks: [
          {
            kind: 'bullets',
            items: [
              'Hazard identification & risk register (cl. 6.1.2 / 8.1.2) — hazards, who could be harmed, the risk rating, and the controls applied through the hierarchy of controls.',
              'Worker consultation & participation register (cl. 5.4) — how non-managerial workers are consulted and take part in OH&S decisions; a register unique to ISO 45001.',
              'Legal & other requirements register and compliance evaluation (cl. 6.1.3 / 9.1.2) — each requirement, its source, how it applies, and the current compliance status.',
              'Incident, near-miss & investigation register (cl. 10.2) — events, injury classification including reportable cases, root-cause analysis and the actions taken.',
            ],
          },
        ],
      },
      {
        heading: 'Operational & performance registers',
        blocks: [
          {
            kind: 'bullets',
            items: [
              'OH&S performance metrics (cl. 9.1) — leading and lagging indicators such as injury-frequency rates, near-misses and toolbox talks.',
              'Emergency preparedness & response (cl. 8.2) — scenarios, procedures and drill records.',
              'Procurement, contractors & outsourcing (cl. 8.1.4) — how OH&S controls extend to suppliers, contractors and outsourced processes.',
              'Management of change (cl. 8.1.3) — how the OH&S risks of planned and temporary changes are assessed and controlled.',
            ],
          },
        ],
      },
      {
        heading: 'Governance & supporting registers',
        blocks: [
          {
            kind: 'bullets',
            items: [
              'Interested parties (cl. 4.2), OH&S objectives (cl. 6.2), communication (cl. 7.4) and management review (cl. 9.3).',
              'Resources (cl. 7.1), competence (cl. 7.2), awareness (cl. 7.3) and documented information (cl. 7.5).',
              'Calibration of monitoring equipment (noise dosimeters, gas detectors), training and competence with expiry tracking, and document control.',
            ],
          },
        ],
      },
      {
        heading: 'Working with registers during an audit',
        blocks: [
          {
            kind: 'p',
            text: 'Sample entries rather than reading every line, trace a register entry to the activity and the evidence behind it, and raise a finding straight from a gap you spot. A register that is complete on screen but contradicted on the floor is itself a finding.',
          },
        ],
      },
    ],
  },
  {
    id: 'field-working',
    title: 'Offline & field working',
    icon: 'cloud_off',
    intro:
      'OH&S audits happen in yards, plant rooms and dead zones. The app is offline-first so signal loss never costs you evidence, and a few field habits keep the audit smooth.',
    subsections: [
      {
        heading: 'How offline works',
        blocks: [
          {
            kind: 'bullets',
            items: [
              'Everything you capture is saved on the device first, so a lost connection never loses data.',
              'Changes are queued in an outbox; the header shows the pending count and the data-source state.',
              'When you reconnect, queued records sync automatically — or tap the data-source pill to sync now.',
              'Some lead-only actions, such as verifying effectiveness, need connectivity and a server round-trip.',
            ],
          },
        ],
      },
      {
        heading: 'Field habits',
        blocks: [
          {
            kind: 'bullets',
            items: [
              'Capture evidence at the point of work while the detail is fresh — photo, note and clause in one move.',
              'Sync before leaving a connected area so the day’s evidence is safe off-device.',
              'Install the app to the device home screen to run it full-screen like a native app.',
              'Respect site rules: capture only what the audit needs, and mind camera and access restrictions in sensitive areas.',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'glossary',
    title: 'Glossary of terms',
    icon: 'menu_book',
    intro:
      'Plain-language definitions of the terms used across this manual and the app. They are written for working understanding, not as formal standard definitions.',
    subsections: [
      {
        heading: 'Terms',
        blocks: [
          {
            kind: 'bullets',
            items: [
              'Audit — a systematic, independent and documented process for gathering evidence and judging objectively how far the audit criteria are met.',
              'Audit criteria — the reference set used for comparison: the standard, policies, procedures, and legal and other requirements.',
              'Audit evidence — records, statements of fact or other verifiable information related to the criteria.',
              'Audit finding — the result of comparing evidence against the criteria; conformity, nonconformity, or an opportunity for improvement.',
              'Audit scope — the extent and boundaries of an audit: sites, activities, processes and the time period.',
              'Conformity — fulfilment of a requirement.',
              'Nonconformity — a non-fulfilment of a requirement, graded major or minor.',
              'Correction — immediate action to contain or make safe a detected nonconformity.',
              'Corrective action — action to eliminate the cause of a nonconformity so it does not recur.',
              'Opportunity for improvement (OFI) — a suggestion that would strengthen the system; not a nonconformity.',
              'Objective evidence — data supporting that something exists or is true, based on observation, measurement or test.',
              'Hazard — a source with the potential to cause injury or ill health.',
              'OH&S risk — the combination of how likely a hazardous event is and how severe the resulting injury or ill health could be.',
              'Hierarchy of controls — the preferred order of risk treatment: eliminate, substitute, engineering controls, administrative controls, then personal protective equipment.',
              'Interested party — a person or organisation that can affect, be affected by, or perceive itself affected by the OH&S system; workers come first.',
              'Worker participation — the involvement of workers in decisions about OH&S, distinct from one-way consultation.',
              'Lead auditor — the auditor with overall responsibility for the audit, its grading and its sign-off.',
              'Surveillance audit — a periodic audit across the certification cycle confirming continued conformity and effectiveness.',
              'Sampling — examining a representative subset because full coverage is impractical in the time available.',
            ],
          },
        ],
      },
    ],
  },
];

/** Top-level section ids — used to assert manual structure in tests. */
export function auditorManualSectionIds(): string[] {
  return AUDITOR_MANUAL.map((section) => section.id);
}

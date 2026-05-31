/**
 * In-app field guide for a NEW environmental auditor: how to run a proper ISO
 * 14001 audit and what to look for, clause by clause. This is ORIGINAL guidance
 * written for Trainovate — it explains the auditor's craft and references ISO
 * 14001 / ISO 19011 / ISO/IEC 17021-1 clauses by number and short title only.
 * It deliberately contains NO verbatim standard requirement text (copyright
 * guardrail), and ships as static reference content (no tenant data, no sync),
 * the same way `standards.ts` ships clause titles.
 */

/** A stage of the audit lifecycle, with practical "how to" steps. */
export interface GuideStage {
  id: string;
  title: string;
  icon: string;
  summary: string;
  steps: string[];
  tip?: string;
}

/** Per-clause field guide: why it matters and what to do on the floor. */
export interface ClauseGuide {
  clauseId: string;
  title: string;
  purpose: string;
  whatToLookFor: string[];
  evidenceToRequest: string[];
  questionsToAsk: string[];
  typicalNonconformities: string[];
}

/** How to grade a finding — mirrors `classifyFinding()` in `nonconformity.ts`. */
export interface GradeGuide {
  grade: 'majorNc' | 'minorNc' | 'ofi';
  label: string;
  when: string;
  examples: string[];
  timeline?: string;
}

/**
 * The audit flow per ISO 19011 — preparation through follow-up — expressed as
 * practical stages that map onto the app's own lifecycle (planned → fieldwork →
 * reporting → follow-up → closed), meetings, conclusions and CAPA.
 */
export const AUDIT_METHODOLOGY: GuideStage[] = [
  {
    id: 'prepare',
    title: 'Plan & prepare',
    icon: 'event_note',
    summary:
      'A good audit is mostly won before you arrive. Understand the scope, criteria and history, then build a realistic plan.',
    steps: [
      'Confirm the audit type (Stage 1/2, surveillance, recertification or internal) and the EMS scope and boundaries.',
      'Read the previous report: open nonconformities, OFIs and the issues raised last time set your lines of inquiry.',
      'Desk-review key documented information (policy, aspects register, legal register, objectives) before the visit.',
      'Build an audit plan / itinerary: who you meet, which areas and clauses, and when — and share it with the auditee.',
      'Check your own competence and impartiality for this scope, and confirm site access, safety and confidentiality.',
    ],
    tip: 'Plan to sample the whole system across the cycle, not every clause every visit — focus where risk and past findings point.',
  },
  {
    id: 'opening',
    title: 'Opening meeting',
    icon: 'meeting_room',
    summary: 'Set expectations with the auditee so the day runs smoothly and findings are no surprise.',
    steps: [
      'Introduce the team and confirm scope, criteria, objectives, methods and the timetable.',
      'Confirm confidentiality, safety arrangements, guides and how findings will be communicated.',
      'Agree how and when the closing meeting will happen, and who needs to attend.',
    ],
    tip: 'Record attendees and the points covered — the opening meeting is itself audit evidence.',
  },
  {
    id: 'document-review',
    title: 'Document & record review',
    icon: 'find_in_page',
    summary: 'Test that documented information is current, controlled and actually used — not shelfware.',
    steps: [
      'Sample procedures, registers and records rather than reading everything.',
      'Check documents are approved, version-controlled and available where the work happens.',
      'Trace a record back to the activity it claims to evidence, and forward to where it is used.',
    ],
  },
  {
    id: 'interview',
    title: 'Interviews',
    icon: 'record_voice_over',
    summary: 'Talk to the people doing the work. Conformity on paper means little if the floor cannot describe it.',
    steps: [
      'Ask open questions ("show me", "walk me through", "what happens when…") and let people talk.',
      'Corroborate the same point across roles — operator, supervisor, manager — to test consistency.',
      'Put people at ease: you are auditing the system, not the individual.',
    ],
    tip: 'Follow the thread the interview opens up. The best evidence is often one question past your checklist.',
  },
  {
    id: 'observation',
    title: 'Observation & walk-through',
    icon: 'visibility',
    summary: 'See the activity, not just the paperwork. The shop floor, yard and storage tell the real story.',
    steps: [
      'Observe operations at the point of work: handling, storage, containment, labelling and housekeeping.',
      'Look for environmental signals — chemical storage, secondary containment, waste segregation, discharge and emission points.',
      'Compare what you see against what the procedure and the aspects register say should happen.',
    ],
  },
  {
    id: 'sampling',
    title: 'Sampling & traceability',
    icon: 'rule',
    summary: 'You cannot see everything, so sample representatively — and record what you sampled so it is reproducible.',
    steps: [
      'Choose samples across shifts, lines, sites and risk levels — not just the easy or tidy ones.',
      'Follow a thread end-to-end (e.g. an aspect → its control → monitoring data → a record → an action).',
      'Note the specific documents, areas, people and references sampled so another auditor could repeat it.',
    ],
    tip: 'Absence of evidence is evidence: if a record that should exist cannot be produced, that is a finding.',
  },
  {
    id: 'grading',
    title: 'Findings & grading',
    icon: 'flag',
    summary: 'A finding states a requirement, the objective evidence, and the gap between them — then is graded.',
    steps: [
      'Write the requirement (clause), the objective evidence you saw, and the specific non-fulfilment.',
      'Grade it: major NC, minor NC or OFI — using the grading guide, not a gut feel.',
      'Stay factual and avoid prescribing the fix; the auditee owns the corrective action.',
    ],
    tip: 'A finding the auditee can act on is specific, evidenced and traceable to a clause — never vague.',
  },
  {
    id: 'closing',
    title: 'Closing meeting',
    icon: 'groups',
    summary: 'Present the findings, agree the grades and timelines, and make sure nothing is a surprise.',
    steps: [
      'Walk through each nonconformity and OFI with its evidence and grade.',
      'Agree response and corrective-action timelines (typically major ~30 days, minor ~90 days).',
      'Record the auditee’s acknowledgement and explain the recommendation and next steps.',
    ],
  },
  {
    id: 'report',
    title: 'Reporting',
    icon: 'description',
    summary: 'The report is the durable record: objective, clause-referenced and defensible.',
    steps: [
      'Cover scope, criteria, team, dates, sampling, findings with evidence, conclusions and the recommendation.',
      'Keep it factual and traceable — every conclusion should rest on recorded evidence.',
      'Distribute to the agreed list, version it, and retain it as controlled documented information.',
    ],
  },
  {
    id: 'follow-up',
    title: 'Follow-up & verification',
    icon: 'task_alt',
    summary: 'Closing a nonconformity means verifying the fix actually worked — not just that something was done.',
    steps: [
      'Check the correction (containment), the root-cause analysis, and the corrective action that stops recurrence.',
      'Verify effectiveness with objective evidence before closing; re-open if the action has not held.',
      'Feed systemic or repeat findings back into the next audit’s lines of inquiry.',
    ],
  },
];

/**
 * Clause-by-clause field guide for ISO 14001 clauses 4–10. Every clause carries
 * the same four practical lenses so a new auditor always knows what to do.
 */
export const CLAUSE_FIELD_GUIDE: ClauseGuide[] = [
  {
    clauseId: '4',
    title: 'Context of the organization',
    purpose: 'Establishes why the EMS exists, what it must achieve and where its boundaries lie.',
    whatToLookFor: [
      'A clear line from the organization’s context and interested parties to its risks, aspects and scope.',
      'An EMS scope that matches what you actually see on site.',
    ],
    evidenceToRequest: ['Context/issues analysis', 'Interested-parties register', 'Documented EMS scope'],
    questionsToAsk: ['How did you decide what your EMS needs to cover?', 'When did you last review your context?'],
    typicalNonconformities: ['Scope excludes activities with real environmental impact', 'Context set once and never revisited'],
  },
  {
    clauseId: '4.1',
    title: 'Understanding the organization and its context',
    purpose: 'The organization should know the internal and external issues that affect what its EMS can achieve.',
    whatToLookFor: [
      'Internal and external issues identified and kept current (legal, market, climate, resource, community).',
      'Issues that actually feed the risks, aspects and objectives — not a generic list.',
    ],
    evidenceToRequest: ['Issues register or context analysis (e.g. PESTLE/SWOT)', 'Review minutes that update it'],
    questionsToAsk: ['Which external issues most affect your environmental performance?', 'What changed since last review?'],
    typicalNonconformities: ['Context never reviewed since certification', 'Issues listed but not linked to risks or aspects'],
  },
  {
    clauseId: '4.2',
    title: 'Needs and expectations of interested parties',
    purpose: 'Determine relevant interested parties and which of their needs the organization adopts as obligations.',
    whatToLookFor: [
      'A parties register covering regulators, neighbours, customers, employees and supply chain.',
      'Which expectations have been taken on as compliance obligations.',
    ],
    evidenceToRequest: ['Interested-parties register', 'Adopted obligations', 'Community/stakeholder communications'],
    questionsToAsk: ['Who are your interested parties?', 'How did you decide which of their expectations you must meet?'],
    typicalNonconformities: ['Generic copied register', 'Expectations not translated into obligations'],
  },
  {
    clauseId: '4.3',
    title: 'Scope of the environmental management system',
    purpose: 'The EMS boundary must be defined, documented and credible against the activities on the ground.',
    whatToLookFor: ['A documented, available scope statement', 'No convenient exclusion of high-impact activities'],
    evidenceToRequest: ['Documented EMS scope', 'Site/activity list it is based on'],
    questionsToAsk: ['What does your EMS scope include and exclude, and why?'],
    typicalNonconformities: ['Scope not documented or not available', 'Activities on site fall outside the stated scope'],
  },
  {
    clauseId: '4.4',
    title: 'Environmental management system',
    purpose: 'The processes of the EMS and their interactions should be established and actually operating.',
    whatToLookFor: ['Processes that connect (aspects → controls → monitoring → improvement)', 'A system that is lived, not just documented'],
    evidenceToRequest: ['Process map or EMS manual', 'Evidence the processes interact in practice'],
    questionsToAsk: ['How do your EMS processes link together?'],
    typicalNonconformities: ['Documented system that the floor does not follow', 'Processes exist in isolation with no handoffs'],
  },
  {
    clauseId: '5',
    title: 'Leadership',
    purpose: 'Top management must own the EMS — direction, resources, roles and visible commitment.',
    whatToLookFor: ['Genuine management engagement, not delegation to one EMS coordinator', 'Policy and roles that reflect real authority'],
    evidenceToRequest: ['Policy', 'Management-review records', 'Role and responsibility assignments'],
    questionsToAsk: ['How does top management demonstrate commitment to the EMS?'],
    typicalNonconformities: ['EMS owned solely by one person with no leadership backing', 'Policy signed but not communicated'],
  },
  {
    clauseId: '5.1',
    title: 'Leadership and commitment',
    purpose: 'Leaders should take accountability for the EMS’s effectiveness and integrate it into the business.',
    whatToLookFor: ['EMS objectives integrated with business planning', 'Leaders who can describe their environmental priorities'],
    evidenceToRequest: ['Management-review inputs/outputs', 'Resourcing decisions for the EMS'],
    questionsToAsk: ['How is environmental performance considered in business decisions?'],
    typicalNonconformities: ['Leadership cannot describe the EMS’s intended results', 'No resources allocated to known gaps'],
  },
  {
    clauseId: '5.2',
    title: 'Environmental policy',
    purpose: 'A policy appropriate to the organization, including commitments to protection, compliance and improvement.',
    whatToLookFor: ['Commitments to protect the environment, meet obligations and continually improve', 'Staff awareness of the policy’s intent'],
    evidenceToRequest: ['The environmental policy', 'Evidence of communication and availability'],
    questionsToAsk: ['What does your environmental policy commit you to?', 'How do staff know it?'],
    typicalNonconformities: ['Generic policy missing required commitments', 'Policy not communicated or not available to interested parties'],
  },
  {
    clauseId: '5.3',
    title: 'Roles, responsibilities and authorities',
    purpose: 'EMS roles should be assigned, communicated and understood by the people who hold them.',
    whatToLookFor: ['Clear ownership for EMS processes and reporting on performance', 'People who know their environmental responsibilities'],
    evidenceToRequest: ['Responsibility matrix / job descriptions', 'Org chart for the EMS'],
    questionsToAsk: ['Who is responsible for this process, and do they know it?'],
    typicalNonconformities: ['Roles documented but staff unaware of them', 'No assigned owner for EMS performance reporting'],
  },
  {
    clauseId: '6',
    title: 'Planning',
    purpose: 'Plan the EMS around risks, aspects, obligations and objectives so outcomes are achieved.',
    whatToLookFor: ['Risks, aspects and obligations driving planned actions and objectives', 'Planning that is current and evidence-based'],
    evidenceToRequest: ['Risk/opportunity register', 'Aspects register', 'Objectives plan'],
    questionsToAsk: ['How does your planning address your significant aspects and risks?'],
    typicalNonconformities: ['Aspects identified but no actions planned', 'Objectives unrelated to significant aspects'],
  },
  {
    clauseId: '6.1',
    title: 'Actions to address risks and opportunities',
    purpose: 'Risks and opportunities tied to aspects, obligations and context should be determined and treated.',
    whatToLookFor: ['A risk/opportunity register linked to context and aspects', 'Treatment actions that are tracked'],
    evidenceToRequest: ['Risks & opportunities register', 'Action tracker'],
    questionsToAsk: ['How did you determine your environmental risks and opportunities?'],
    typicalNonconformities: ['Risks listed with no treatment or owners', 'Opportunities never considered'],
  },
  {
    clauseId: '6.1.2',
    title: 'Environmental aspects',
    purpose: 'Identify aspects and impacts across the lifecycle and determine which are significant, using defined criteria.',
    whatToLookFor: [
      'A method/criteria for judging significance (not just a low/medium/high label).',
      'Lifecycle thinking — raw materials through end-of-life — and aspects that match site reality.',
    ],
    evidenceToRequest: ['Aspects & impacts register with significance criteria', 'Evidence of the evaluation method'],
    questionsToAsk: ['How did you determine which aspects are significant?', 'When did you last update the register?'],
    typicalNonconformities: ['Significance asserted with no documented criteria', 'Obvious site aspects missing from the register'],
  },
  {
    clauseId: '6.1.3',
    title: 'Compliance obligations',
    purpose: 'Determine and have access to the legal and other requirements related to the organization’s aspects.',
    whatToLookFor: ['A maintained legal register linked to aspects', 'Permits/consents with conditions and renewal dates tracked'],
    evidenceToRequest: ['Legal/compliance register', 'Permits, licences and consents', 'Subscription/update mechanism'],
    questionsToAsk: ['How do you keep your legal register up to date?', 'Which permits apply and when do they expire?'],
    typicalNonconformities: ['Register out of date or missing applicable law', 'Permit conditions not tracked or near expiry unnoticed'],
  },
  {
    clauseId: '6.2',
    title: 'Environmental objectives and planning to achieve them',
    purpose: 'Set measurable objectives consistent with the policy and significant aspects, with plans to achieve them.',
    whatToLookFor: ['Objectives that are measurable and resourced, with owners and dates', 'A clear link to significant aspects'],
    evidenceToRequest: ['Objectives & targets plan', 'Progress data against targets'],
    questionsToAsk: ['How are your objectives measured and tracked?', 'What happens when one is off-track?'],
    typicalNonconformities: ['Vague, unmeasurable objectives', 'No plan, owner or monitoring for objectives'],
  },
  {
    clauseId: '7',
    title: 'Support',
    purpose: 'Provide the resources, competence, awareness, communication and documented information the EMS needs.',
    whatToLookFor: ['Adequate resourcing and competent people', 'Controlled documents and working communication'],
    evidenceToRequest: ['Training records', 'Communication plan', 'Document control evidence'],
    questionsToAsk: ['How do you make sure people are competent and aware?'],
    typicalNonconformities: ['Known resource gaps unaddressed', 'Uncontrolled or obsolete documents in use'],
  },
  {
    clauseId: '7.1',
    title: 'Resources',
    purpose: 'The organization should provide the people, infrastructure and finance the EMS needs to work.',
    whatToLookFor: ['Resources matched to EMS needs (people, monitoring equipment, infrastructure)', 'Adequacy judged, not assumed'],
    evidenceToRequest: ['Resource/budget evidence', 'Calibration of monitoring equipment'],
    questionsToAsk: ['Do you have the resources to run and improve the EMS?'],
    typicalNonconformities: ['Monitoring equipment uncalibrated', 'Chronic under-resourcing of the EMS'],
  },
  {
    clauseId: '7.2',
    title: 'Competence',
    purpose: 'People whose work affects environmental performance should be competent, with evidence.',
    whatToLookFor: ['Defined competence requirements per role', 'Training/qualification evidence and gap actions'],
    evidenceToRequest: ['Competence matrix', 'Training records and certificates'],
    questionsToAsk: ['What competence does this role need and how is it evidenced?'],
    typicalNonconformities: ['Competence requirements undefined', 'Staff doing high-impact work without evidenced competence'],
  },
  {
    clauseId: '7.3',
    title: 'Awareness',
    purpose: 'People should be aware of the policy, significant aspects, their EMS role and consequences of not conforming.',
    whatToLookFor: ['Staff can describe the policy intent and their part in it', 'Awareness of relevant significant aspects'],
    evidenceToRequest: ['Awareness/induction materials', 'Toolbox-talk or briefing records'],
    questionsToAsk: ['What are the significant environmental aspects of your job?'],
    typicalNonconformities: ['Staff unaware of the policy or their aspects', 'Awareness assumed but not delivered'],
  },
  {
    clauseId: '7.4',
    title: 'Communication',
    purpose: 'Internal and external communication relevant to the EMS should be determined and carried out.',
    whatToLookFor: ['A communication matrix (what, when, who, how)', 'Evidence external enquiries/complaints are handled'],
    evidenceToRequest: ['Communication plan/matrix', 'Records of external communications'],
    questionsToAsk: ['How do you communicate environmental information internally and externally?'],
    typicalNonconformities: ['No process for external environmental communication', 'Complaints not recorded or responded to'],
  },
  {
    clauseId: '7.5',
    title: 'Documented information',
    purpose: 'Documented information required by the EMS should be controlled, current and available.',
    whatToLookFor: ['Version control, approval and retention applied', 'Right version available at the point of use'],
    evidenceToRequest: ['Document control procedure', 'A sample of controlled documents and records'],
    questionsToAsk: ['How do you control versions and retention of EMS documents?'],
    typicalNonconformities: ['Obsolete documents still in use', 'No control over approval, version or retention'],
  },
  {
    clauseId: '8',
    title: 'Operation',
    purpose: 'Plan and control the operations and emergencies that relate to significant aspects.',
    whatToLookFor: ['Operational controls in place where they matter', 'Lifecycle and outsourced-process controls'],
    evidenceToRequest: ['Operational control procedures', 'Contractor/supplier controls'],
    questionsToAsk: ['How do you control the operations tied to your significant aspects?'],
    typicalNonconformities: ['Controls defined but not followed on the floor', 'Outsourced processes not controlled'],
  },
  {
    clauseId: '8.1',
    title: 'Operational planning and control',
    purpose: 'Establish, implement and maintain the controls needed to meet EMS requirements for significant aspects.',
    whatToLookFor: ['Controls proportionate to the aspect’s significance', 'Lifecycle perspective applied to design and procurement'],
    evidenceToRequest: ['Work instructions for high-impact activities', 'Procurement/contractor requirements'],
    questionsToAsk: ['Show me how this significant aspect is controlled in practice.'],
    typicalNonconformities: ['No control for a significant aspect', 'Controls exist on paper only'],
  },
  {
    clauseId: '8.2',
    title: 'Emergency preparedness and response',
    purpose: 'Be prepared to prevent or mitigate environmental emergencies, and test the arrangements.',
    whatToLookFor: ['Identified scenarios with response procedures', 'Evidence of drills and lessons learned'],
    evidenceToRequest: ['Emergency procedures', 'Drill records', 'Spill-kit / containment provision'],
    questionsToAsk: ['What environmental emergencies could occur and when did you last test your response?'],
    typicalNonconformities: ['Procedures never tested by drill', 'Spill response unavailable where needed'],
  },
  {
    clauseId: '9',
    title: 'Performance evaluation',
    purpose: 'Monitor, measure, analyse and evaluate environmental performance and the EMS itself.',
    whatToLookFor: ['Actual monitored data with trends, not just qualitative status', 'Evaluation of compliance and management review feeding improvement'],
    evidenceToRequest: ['Monitoring data and trends', 'Compliance evaluation', 'Internal audit and review records'],
    questionsToAsk: ['How do you know your environmental performance is improving?'],
    typicalNonconformities: ['Data collected but never analysed', 'No evaluation of whether objectives are met'],
  },
  {
    clauseId: '9.1',
    title: 'Monitoring, measurement, analysis and evaluation',
    purpose: 'Determine what to monitor, with what methods, and evaluate the results against criteria.',
    whatToLookFor: [
      'Defined indicators, units and methods — and actual values tracked over time against targets.',
      'Analysis and evaluation of the data, not just collection.',
    ],
    evidenceToRequest: ['Performance indicators with values and periods', 'Calibration of measuring equipment', 'Trend analysis'],
    questionsToAsk: ['What do you monitor, how, and what do the trends tell you?'],
    typicalNonconformities: ['Numbers recorded but never evaluated', 'No defined monitoring method or uncalibrated equipment'],
  },
  {
    clauseId: '9.1.2',
    title: 'Evaluation of compliance',
    purpose: 'Periodically evaluate fulfilment of compliance obligations and maintain knowledge of compliance status.',
    whatToLookFor: ['A periodic compliance-evaluation record per obligation', 'Actions where non-compliance is found'],
    evidenceToRequest: ['Compliance-evaluation records', 'Permit-monitoring results'],
    questionsToAsk: ['How and how often do you evaluate compliance with each obligation?'],
    typicalNonconformities: ['Compliance assumed, never evaluated', 'Non-compliance found but no action taken'],
  },
  {
    clauseId: '9.2',
    title: 'Internal audit',
    purpose: 'Conduct planned internal audits to check the EMS conforms and is effectively implemented.',
    whatToLookFor: ['A risk-based audit programme covering the whole EMS over time', 'Competent, impartial internal auditors'],
    evidenceToRequest: ['Internal audit programme and reports', 'Auditor competence/impartiality evidence'],
    questionsToAsk: ['How is your internal audit programme planned and who audits whom?'],
    typicalNonconformities: ['Internal audits not covering the full scope', 'Auditors auditing their own work'],
  },
  {
    clauseId: '9.3',
    title: 'Management review',
    purpose: 'Top management reviews the EMS at planned intervals using defined inputs to drive decisions.',
    whatToLookFor: ['Reviews covering the required inputs (performance, compliance, objectives, findings, context changes)', 'Decisions and actions with owners'],
    evidenceToRequest: ['Management-review minutes', 'Resulting action records'],
    questionsToAsk: ['What inputs does your management review consider and what decisions came out of it?'],
    typicalNonconformities: ['Review missing key inputs', 'No decisions, actions or resources resulting'],
  },
  {
    clauseId: '10',
    title: 'Improvement',
    purpose: 'Use nonconformities, corrective action and trends to continually improve the EMS.',
    whatToLookFor: ['Corrective actions that address root cause and are verified', 'Evidence of genuine continual improvement'],
    evidenceToRequest: ['Nonconformity & corrective-action log', 'Trend of recurring issues'],
    questionsToAsk: ['How do you make sure problems do not recur?'],
    typicalNonconformities: ['Corrections without root-cause analysis', 'Same nonconformity recurring across audits'],
  },
  {
    clauseId: '10.2',
    title: 'Nonconformity and corrective action',
    purpose: 'React to nonconformities, correct them, analyse cause and act to prevent recurrence.',
    whatToLookFor: ['Containment plus root-cause analysis plus a corrective action', 'Effectiveness verified before closure'],
    evidenceToRequest: ['CAPA records with root cause', 'Verification evidence'],
    questionsToAsk: ['Walk me through a recent nonconformity from discovery to verified closure.'],
    typicalNonconformities: ['Root cause not analysed', 'Actions closed without verifying effectiveness'],
  },
  {
    clauseId: '10.3',
    title: 'Continual improvement',
    purpose: 'Continually improve the suitability, adequacy and effectiveness of the EMS.',
    whatToLookFor: ['Improving performance trends over time', 'Improvement driven by data, not just incidents'],
    evidenceToRequest: ['Performance trends', 'Improvement initiatives and their results'],
    questionsToAsk: ['What has measurably improved in your environmental performance, and how?'],
    typicalNonconformities: ['No demonstrable improvement', 'Improvement claimed without supporting data'],
  },
];

/** How to grade what you find — aligned with `classifyFinding()`. */
export const GRADING_GUIDE: GradeGuide[] = [
  {
    grade: 'majorNc',
    label: 'Major nonconformity',
    when: 'The EMS’s ability to achieve its intended results is in doubt.',
    examples: [
      'Absence or total breakdown of a required process (e.g. no compliance evaluation at all).',
      'Significant doubt that outputs/controls are effective, or a significant legal or environmental risk.',
      'Several minor nonconformities against the same requirement — a systemic failure.',
    ],
    timeline: 'Correction and corrective action typically within ~30 days; often verified before certification.',
  },
  {
    grade: 'minorNc',
    label: 'Minor nonconformity',
    when: 'An isolated lapse that does not undermine the EMS overall.',
    examples: ['A single out-of-date document', 'One training record missing', 'An isolated record gap'],
    timeline: 'Corrective-action plan typically accepted within ~90 days and verified at the next visit.',
  },
  {
    grade: 'ofi',
    label: 'Opportunity for improvement',
    when: 'A suggestion that would strengthen the EMS — not a non-fulfilment of a requirement.',
    examples: ['A more efficient way to track objectives', 'Consolidating overlapping registers'],
    timeline: 'Advisory only — no mandatory action or timeline.',
  },
];

const GUIDE_BY_CLAUSE = new Map(CLAUSE_FIELD_GUIDE.map((entry) => [entry.clauseId, entry]));

/** Look up the field guide for a clause (e.g. '9.1') for contextual help. */
export function clauseGuideFor(clauseId: string): ClauseGuide | undefined {
  return GUIDE_BY_CLAUSE.get(clauseId);
}

/** All clause IDs the field guide covers — used to assert coverage in tests. */
export function guideClauseIds(): string[] {
  return CLAUSE_FIELD_GUIDE.map((entry) => entry.clauseId);
}

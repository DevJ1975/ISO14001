/**
 * In-app field guide for a NEW occupational health & safety auditor: how to run
 * a proper ISO 45001 audit and what to look for, clause by clause. This is
 * ORIGINAL guidance written for Trainovate — it explains the auditor's craft and
 * references ISO 45001 / ISO 19011 / ISO/IEC 17021-1 clauses by number and short
 * title only. It deliberately contains NO verbatim standard requirement text
 * (copyright guardrail), and ships as static reference content (no tenant data,
 * no sync), the same way `standards.ts` ships clause titles.
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
      'Confirm the audit type (Stage 1/2, surveillance, recertification or internal) and the OH&S management system scope and boundaries.',
      'Read the previous report: open nonconformities, OFIs and the issues raised last time set your lines of inquiry.',
      'Desk-review key documented information (OH&S policy, risk register, legal register, objectives, incident log) before the visit.',
      'Build an audit plan / itinerary: who you meet, which areas and clauses, and when — and share it with the auditee.',
      'Check your own competence and impartiality for this scope, and confirm site access, site induction, PPE and confidentiality.',
    ],
    tip: 'Plan to sample the whole system across the cycle, not every clause every visit — focus where OH&S risk and past findings point.',
  },
  {
    id: 'opening',
    title: 'Opening meeting',
    icon: 'meeting_room',
    summary: 'Set expectations with the auditee so the day runs smoothly and findings are no surprise.',
    steps: [
      'Introduce the team and confirm scope, criteria, objectives, methods and the timetable.',
      'Confirm confidentiality, the site safety induction, PPE, permit and escort arrangements, and how findings will be communicated.',
      'Agree how and when the closing meeting will happen, and who needs to attend (including a worker representative where relevant).',
    ],
    tip: 'Record attendees and the points covered — the opening meeting is itself audit evidence.',
  },
  {
    id: 'document-review',
    title: 'Document & record review',
    icon: 'find_in_page',
    summary: 'Test that documented information is current, controlled and actually used — not shelfware.',
    steps: [
      'Sample risk assessments, procedures, permits, registers and records rather than reading everything.',
      'Check documents are approved, version-controlled and available where the work happens.',
      'Trace a record back to the activity it claims to evidence (e.g. a permit-to-work to the job it covered), and forward to where it is used.',
    ],
  },
  {
    id: 'interview',
    title: 'Interviews',
    icon: 'record_voice_over',
    summary: 'Talk to the people doing the work. Conformity on paper means little if the floor cannot describe it.',
    steps: [
      'Ask open questions ("show me", "walk me through", "what happens when…") and let people talk.',
      'Corroborate the same point across roles — operative, supervisor, safety rep, manager — to test consistency.',
      'Put people at ease: you are auditing the system, not the individual, and workers must feel safe to speak openly.',
    ],
    tip: 'Follow the thread the interview opens up. The best evidence is often one question past your checklist.',
  },
  {
    id: 'observation',
    title: 'Observation & walk-through',
    icon: 'visibility',
    summary: 'See the activity, not just the paperwork. The shop floor, yard and high-risk tasks tell the real story.',
    steps: [
      'Observe operations at the point of work: machine guarding, PPE use, manual handling, working at height, housekeeping and isolation.',
      'Look for OH&S signals — permit-to-work and LOTO in use, signage, fire exits and extinguishers, COSHH storage, near-miss reporting.',
      'Compare what you see against what the risk assessment, safe system of work and the risk register say should happen.',
    ],
  },
  {
    id: 'sampling',
    title: 'Sampling & traceability',
    icon: 'rule',
    summary: 'You cannot see everything, so sample representatively — and record what you sampled so it is reproducible.',
    steps: [
      'Choose samples across shifts, lines, sites, contractors and risk levels — not just the easy or tidy ones.',
      'Follow a thread end-to-end (e.g. a hazard → its risk assessment → the control → a permit/record → an action).',
      'Note the specific documents, areas, people and references sampled so another auditor could repeat it.',
    ],
    tip: 'Absence of evidence is evidence: if a record that should exist (an investigation, an inspection) cannot be produced, that is a finding.',
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
      'Check the correction (immediate make-safe), the root-cause analysis, and the corrective action that stops recurrence.',
      'Verify effectiveness with objective evidence before closing; re-open if the action has not held.',
      'Feed systemic or repeat findings back into the next audit’s lines of inquiry.',
    ],
  },
];

/**
 * Clause-by-clause field guide for ISO 45001 clauses 4–10. Every clause carries
 * the same four practical lenses so a new auditor always knows what to do.
 */
export const CLAUSE_FIELD_GUIDE: ClauseGuide[] = [
  {
    clauseId: '4',
    title: 'Context of the organization',
    purpose: 'Establishes why the OH&S management system exists, what it must achieve and where its boundaries lie.',
    whatToLookFor: [
      'A clear line from the organization’s context and interested parties (including workers) to its OH&S risks and scope.',
      'An OH&S management system scope that matches the activities, workers and hazards you actually see on site.',
    ],
    evidenceToRequest: ['Context/issues analysis', 'Interested-parties register including workers', 'Documented OH&S management system scope'],
    questionsToAsk: ['How did you decide what your OH&S management system needs to cover?', 'When did you last review your context?'],
    typicalNonconformities: ['Scope excludes activities or sites with real OH&S risk', 'Context set once and never revisited'],
  },
  {
    clauseId: '4.1',
    title: 'Understanding the organization and its context',
    purpose: 'The organization should know the internal and external issues that affect what its OH&S management system can achieve.',
    whatToLookFor: [
      'Internal and external issues identified and kept current (legal, workforce demographics, contractors, technology, culture).',
      'Issues that actually feed the OH&S risks and objectives — not a generic list.',
    ],
    evidenceToRequest: ['Issues register or context analysis (e.g. PESTLE/SWOT)', 'Review minutes that update it'],
    questionsToAsk: ['Which external issues most affect your OH&S performance?', 'What changed since last review?'],
    typicalNonconformities: ['Context never reviewed since certification', 'Issues listed but not linked to OH&S risks'],
  },
  {
    clauseId: '4.2',
    title: 'Needs and expectations of workers and interested parties',
    purpose: 'Determine relevant interested parties — workers first — and which of their needs the organization adopts as requirements.',
    whatToLookFor: [
      'A parties register covering workers, their representatives, regulators (e.g. HSE), contractors, clients and visitors.',
      'Which expectations and legal duties have been taken on as requirements of the management system.',
    ],
    evidenceToRequest: ['Interested-parties register', 'Adopted requirements list', 'Worker/representative consultation records'],
    questionsToAsk: ['Who are your interested parties and which are your workers?', 'How did you decide which of their needs you must meet?'],
    typicalNonconformities: ['Generic copied register that omits workers', 'Expectations not translated into requirements'],
  },
  {
    clauseId: '4.3',
    title: 'Scope of the OH&S management system',
    purpose: 'The system boundary must be defined, documented and credible against the activities, workers and hazards on the ground.',
    whatToLookFor: ['A documented, available scope statement', 'No convenient exclusion of high-risk activities, shifts or contractor work'],
    evidenceToRequest: ['Documented OH&S management system scope', 'Site/activity/worker list it is based on'],
    questionsToAsk: ['What does your scope include and exclude, and why?'],
    typicalNonconformities: ['Scope not documented or not available', 'Activities or worker groups on site fall outside the stated scope'],
  },
  {
    clauseId: '4.4',
    title: 'OH&S management system',
    purpose: 'The processes of the OH&S management system and their interactions should be established and actually operating.',
    whatToLookFor: ['Processes that connect (hazards → risk assessment → controls → monitoring → improvement)', 'A system that is lived, not just documented'],
    evidenceToRequest: ['Process map or OH&S manual', 'Evidence the processes interact in practice'],
    questionsToAsk: ['How do your OH&S processes link together?'],
    typicalNonconformities: ['Documented system that the floor does not follow', 'Processes exist in isolation with no handoffs'],
  },
  {
    clauseId: '5',
    title: 'Leadership and worker participation',
    purpose: 'Top management must own the OH&S management system — direction, resources, roles, worker participation and visible commitment.',
    whatToLookFor: ['Genuine management engagement, not delegation to one safety coordinator', 'A culture where workers are consulted and can raise concerns without reprisal'],
    evidenceToRequest: ['OH&S policy', 'Management-review records', 'Safety committee minutes', 'Role and responsibility assignments'],
    questionsToAsk: ['How does top management demonstrate commitment to OH&S?', 'How are workers involved?'],
    typicalNonconformities: ['System owned solely by one person with no leadership backing', 'Worker participation absent or tokenistic'],
  },
  {
    clauseId: '5.1',
    title: 'Leadership and commitment',
    purpose: 'Leaders should take accountability for preventing work-related injury and ill health and integrate OH&S into the business.',
    whatToLookFor: ['OH&S objectives integrated with business planning', 'Leaders who can describe their safety priorities and are visible on the floor'],
    evidenceToRequest: ['Management-review inputs/outputs', 'Resourcing decisions for OH&S', 'Records of leadership safety tours'],
    questionsToAsk: ['How is OH&S performance considered in business decisions?', 'How do leaders protect workers from harm?'],
    typicalNonconformities: ['Leadership cannot describe the system’s intended results', 'No resources allocated to known OH&S gaps'],
  },
  {
    clauseId: '5.2',
    title: 'OH&S policy',
    purpose: 'A policy appropriate to the organization, including commitments to safe and healthy conditions, hazard reduction and worker consultation.',
    whatToLookFor: ['Commitments to prevent injury and ill health, meet legal requirements, consult workers and continually improve', 'Staff awareness of the policy’s intent'],
    evidenceToRequest: ['The OH&S policy', 'Evidence of communication and availability'],
    questionsToAsk: ['What does your OH&S policy commit you to?', 'How do workers know it?'],
    typicalNonconformities: ['Generic policy missing required commitments', 'Policy not communicated or not available to workers'],
  },
  {
    clauseId: '5.3',
    title: 'Roles, responsibilities and authorities',
    purpose: 'OH&S roles should be assigned, communicated and understood by the people who hold them, and workers take responsibility for their own safety.',
    whatToLookFor: ['Clear ownership for OH&S processes and reporting on performance', 'People who know their safety responsibilities at every level'],
    evidenceToRequest: ['Responsibility matrix / job descriptions', 'Org chart for the OH&S management system'],
    questionsToAsk: ['Who is responsible for this process, and do they know it?'],
    typicalNonconformities: ['Roles documented but staff unaware of them', 'No assigned owner for OH&S performance reporting'],
  },
  {
    clauseId: '5.4',
    title: 'Consultation and participation of workers',
    purpose: 'Workers (and their representatives) should be consulted and able to participate in developing and running the system, with barriers removed.',
    whatToLookFor: ['Active safety committees and worker reps with real influence', 'Workers consulted on hazards, controls, investigations and changes — and protected from reprisal'],
    evidenceToRequest: ['Safety committee terms of reference and minutes', 'Consultation records on risk assessments and incidents', 'Suggestion/near-miss channels'],
    questionsToAsk: ['How are non-managerial workers consulted on OH&S?', 'Can you give an example where worker input changed a control?'],
    typicalNonconformities: ['Consultation is one-way briefing, not genuine participation', 'Workers fear reprisal for raising concerns or barriers to participation exist'],
  },
  {
    clauseId: '6',
    title: 'Planning',
    purpose: 'Plan the system around hazards, OH&S risks, legal requirements and objectives so injury and ill health are prevented.',
    whatToLookFor: ['Hazards, risks and legal requirements driving planned actions and objectives', 'Planning that is current and evidence-based'],
    evidenceToRequest: ['Risk register', 'Hazard identification records', 'Legal register', 'Objectives plan'],
    questionsToAsk: ['How does your planning address your significant OH&S risks?'],
    typicalNonconformities: ['Hazards identified but no actions planned', 'Objectives unrelated to significant OH&S risks'],
  },
  {
    clauseId: '6.1',
    title: 'Actions to address risks and opportunities',
    purpose: 'OH&S risks and opportunities tied to hazards, legal requirements and context should be determined, prioritised and treated.',
    whatToLookFor: ['A risk register linked to context, hazards and legal requirements', 'Treatment actions that are tracked through to completion'],
    evidenceToRequest: ['OH&S risks & opportunities register', 'Action tracker'],
    questionsToAsk: ['How did you determine your OH&S risks and opportunities?'],
    typicalNonconformities: ['Risks listed with no controls or owners', 'OH&S opportunities (e.g. improving wellbeing) never considered'],
  },
  {
    clauseId: '6.1.2',
    title: 'Hazard identification and assessment of risks and opportunities',
    purpose: 'Establish ongoing, proactive processes to identify hazards and to assess OH&S risks and opportunities arising from them.',
    whatToLookFor: [
      'Hazard identification and risk assessment that are ongoing and proactive, not one-off.',
      'Routine and non-routine situations, emergencies, human factors and how work is actually organised all considered.',
    ],
    evidenceToRequest: ['Hazard identification and risk assessment process', 'Risk register with methodology', 'Records of worker input to the assessments'],
    questionsToAsk: ['How do you identify hazards on an ongoing basis?', 'How do you assess and prioritise the resulting risks?'],
    typicalNonconformities: ['Risk assessments stale or generic templates', 'Non-routine tasks, emergencies or human factors not assessed'],
  },
  {
    clauseId: '6.1.2.1',
    title: 'Hazard identification',
    purpose: 'Hazards should be identified continually across all activities, work organisation, equipment, substances and people exposed.',
    whatToLookFor: [
      'A method that captures routine and non-routine tasks, plant, substances, the work environment and human/behavioural factors.',
      'Inputs from workers, near-misses, incidents, inspections and changes — hazards found before they cause harm.',
    ],
    evidenceToRequest: ['Hazard register / identification records', 'Near-miss and inspection reports feeding it', 'Task or job hazard analyses'],
    questionsToAsk: ['What hazards exist in this task and how were they identified?', 'How do workers report new hazards?'],
    typicalNonconformities: ['Obvious site hazards (e.g. working at height, moving plant) missing from the register', 'Hazard identification not updated when work or equipment changes'],
  },
  {
    clauseId: '6.1.2.2',
    title: 'Assessment of OH&S risks and other risks',
    purpose: 'Assess OH&S risks from identified hazards using defined methodology and criteria, and address other risks to the system.',
    whatToLookFor: [
      'A defined, consistent methodology and criteria for assessing OH&S risk (not just an undocumented low/medium/high label).',
      'Risk ratings that reflect existing controls and lead to control decisions via the hierarchy of controls.',
    ],
    evidenceToRequest: ['Risk assessment methodology and criteria', 'Completed risk assessments with residual risk', 'Risk register'],
    questionsToAsk: ['How did you assess the level of this risk?', 'What method and criteria did you apply?'],
    typicalNonconformities: ['Risk level asserted with no documented methodology', 'Residual risk after controls never determined'],
  },
  {
    clauseId: '6.1.3',
    title: 'Determination of legal requirements and other requirements',
    purpose: 'Determine and have access to the legal and other requirements applicable to the organization’s hazards and OH&S risks.',
    whatToLookFor: ['A maintained legal register linked to hazards (e.g. HSWA, COSHH, PUWER, LOLER, Working at Height, Manual Handling)', 'How requirements (and RIDDOR duties) are kept current and applied'],
    evidenceToRequest: ['Legal/compliance register', 'Licences, certificates and statutory inspection records', 'Subscription/update mechanism for legal changes'],
    questionsToAsk: ['How do you keep your legal register up to date?', 'Which regulations apply to this activity and how do you meet them?'],
    typicalNonconformities: ['Register out of date or missing applicable regulations', 'Legal duties identified but not reflected in controls or procedures'],
  },
  {
    clauseId: '6.1.4',
    title: 'Planning action',
    purpose: 'Plan actions to address OH&S risks, opportunities and legal requirements, integrate them into the system, and evaluate effectiveness.',
    whatToLookFor: ['Actions that flow from the risk register and legal register into a tracked plan with owners and dates', 'Actions integrated into operational controls, not run as a separate list'],
    evidenceToRequest: ['Action plan linking risks/legal requirements to actions', 'Evidence actions are built into procedures and controls'],
    questionsToAsk: ['How do you turn an assessed risk into a planned action?', 'How do you check the action actually worked?'],
    typicalNonconformities: ['Risks and legal gaps with no planned action', 'Actions planned but never integrated or their effectiveness never evaluated'],
  },
  {
    clauseId: '6.2',
    title: 'OH&S objectives and planning to achieve them',
    purpose: 'Set measurable OH&S objectives consistent with the policy and significant risks, with plans to achieve them.',
    whatToLookFor: ['Objectives that are measurable and resourced, with owners and dates', 'A clear link to significant OH&S risks and to improving performance'],
    evidenceToRequest: ['OH&S objectives & targets plan', 'Progress data against targets (e.g. leading-indicator trends)'],
    questionsToAsk: ['How are your OH&S objectives measured and tracked?', 'What happens when one is off-track?'],
    typicalNonconformities: ['Vague, unmeasurable objectives', 'No plan, owner or monitoring for objectives'],
  },
  {
    clauseId: '7',
    title: 'Support',
    purpose: 'Provide the resources, competence, awareness, communication and documented information the OH&S management system needs.',
    whatToLookFor: ['Adequate resourcing and competent people', 'Controlled documents and working two-way communication with workers'],
    evidenceToRequest: ['Training records', 'Communication plan', 'Document control evidence'],
    questionsToAsk: ['How do you make sure people are competent and aware of OH&S?'],
    typicalNonconformities: ['Known resource or competence gaps unaddressed', 'Uncontrolled or obsolete documents in use'],
  },
  {
    clauseId: '7.1',
    title: 'Resources',
    purpose: 'The organization should provide the people, infrastructure, PPE and finance the OH&S management system needs to work.',
    whatToLookFor: ['Resources matched to OH&S needs (people, PPE, guarding, monitoring equipment, infrastructure)', 'Adequacy judged, not assumed'],
    evidenceToRequest: ['Resource/budget evidence', 'PPE provision records', 'Calibration of exposure-monitoring equipment'],
    questionsToAsk: ['Do you have the resources to run and improve the OH&S management system?'],
    typicalNonconformities: ['Exposure or monitoring equipment uncalibrated', 'Chronic under-resourcing of OH&S (e.g. missing PPE or guards)'],
  },
  {
    clauseId: '7.2',
    title: 'Competence',
    purpose: 'People whose work affects OH&S performance should be competent for the task and its risks, with evidence.',
    whatToLookFor: ['Defined competence requirements per role and high-risk task', 'Training/qualification evidence (e.g. plant tickets, working-at-height, first aid) and gap actions'],
    evidenceToRequest: ['Competence matrix', 'Training records, certificates and authorisations'],
    questionsToAsk: ['What competence does this role or task need and how is it evidenced?'],
    typicalNonconformities: ['Competence requirements undefined', 'Staff doing high-risk work (e.g. operating plant) without evidenced competence'],
  },
  {
    clauseId: '7.3',
    title: 'Awareness',
    purpose: 'Workers should be aware of the policy, the hazards and risks relevant to them, their role, and the right to remove themselves from danger.',
    whatToLookFor: ['Workers can describe the policy intent, their part in it, and what to do in an emergency', 'Awareness of the hazards and incidents relevant to their work'],
    evidenceToRequest: ['Awareness/induction materials', 'Toolbox-talk or safety briefing records'],
    questionsToAsk: ['What are the main hazards and risks of your job?', 'What would you do if you faced serious, imminent danger?'],
    typicalNonconformities: ['Workers unaware of the policy or the risks of their work', 'Awareness assumed but not delivered or refreshed'],
  },
  {
    clauseId: '7.4',
    title: 'Communication',
    purpose: 'Internal and external communication relevant to the OH&S management system should be determined and carried out.',
    whatToLookFor: ['A communication matrix (what, when, who, how)', 'Two-way communication so workers can raise concerns, and external enquiries are handled'],
    evidenceToRequest: ['Communication plan/matrix', 'Records of safety alerts, briefings and external communications'],
    questionsToAsk: ['How do you communicate OH&S information internally and externally?', 'How can a worker raise a concern?'],
    typicalNonconformities: ['No process for external OH&S communication (e.g. to contractors or the regulator)', 'Communication is top-down only with no worker voice'],
  },
  {
    clauseId: '7.5',
    title: 'Documented information',
    purpose: 'Documented information required by the OH&S management system should be controlled, current and available.',
    whatToLookFor: ['Version control, approval and retention applied', 'Right version of the risk assessment, procedure or permit available at the point of use'],
    evidenceToRequest: ['Document control procedure', 'A sample of controlled documents and records'],
    questionsToAsk: ['How do you control versions and retention of OH&S documents?'],
    typicalNonconformities: ['Obsolete risk assessments or procedures still in use', 'No control over approval, version or retention'],
  },
  {
    clauseId: '8',
    title: 'Operation',
    purpose: 'Plan and control the operations and emergencies that relate to significant OH&S risks.',
    whatToLookFor: ['Operational controls in place where the risk is, applied through safe systems of work', 'Control of change, contractors and outsourced processes'],
    evidenceToRequest: ['Safe systems of work / operational control procedures', 'Permit-to-work and isolation records', 'Contractor/supplier controls'],
    questionsToAsk: ['How do you control the operations tied to your significant OH&S risks?'],
    typicalNonconformities: ['Controls defined but not followed on the floor', 'Contractor or outsourced work not controlled'],
  },
  {
    clauseId: '8.1',
    title: 'Operational planning and control',
    purpose: 'Establish, implement and maintain the controls needed to meet OH&S requirements and reduce risks at the point of work.',
    whatToLookFor: ['Controls proportionate to the risk and following the hierarchy of controls', 'Safe systems of work, permit-to-work and LOTO applied and adapted to the work as done'],
    evidenceToRequest: ['Work instructions / safe systems of work for high-risk activities', 'Permit-to-work and lock-out/tag-out records'],
    questionsToAsk: ['Show me how this high-risk activity is controlled in practice.'],
    typicalNonconformities: ['No control for a significant risk', 'Permits or safe systems of work exist on paper only'],
  },
  {
    clauseId: '8.1.2',
    title: 'Eliminating hazards and reducing OH&S risks',
    purpose: 'Apply the hierarchy of controls to eliminate hazards or reduce risks, preferring higher-order controls over PPE.',
    whatToLookFor: [
      'Evidence the hierarchy of controls is applied in order — elimination, substitution, engineering, administrative, then PPE.',
      'PPE used as a last resort and a backstop, not as the first or only control where higher-order controls are practicable.',
    ],
    evidenceToRequest: ['Risk assessments showing the controls chosen and why', 'Examples of elimination/substitution/engineering controls', 'PPE assessments'],
    questionsToAsk: ['How did you decide on these controls?', 'Why was PPE chosen rather than eliminating or engineering out the hazard?'],
    typicalNonconformities: ['Reliance on PPE where elimination or engineering controls are reasonably practicable', 'Hierarchy of controls not considered or evidenced'],
  },
  {
    clauseId: '8.1.3',
    title: 'Management of change',
    purpose: 'Plan and control temporary and permanent changes that affect OH&S performance, assessing risks before the change.',
    whatToLookFor: ['A management-of-change process triggered by new plant, processes, substances, people or legal requirements', 'Risk assessed and controls updated before the change goes live, including temporary changes'],
    evidenceToRequest: ['Management-of-change records', 'Pre-change risk assessments and sign-offs'],
    questionsToAsk: ['How do you assess OH&S risk before a change?', 'Walk me through a recent change and how it was controlled.'],
    typicalNonconformities: ['Changes (new equipment, staffing, process) made with no OH&S risk review', 'Temporary changes left in place without reassessment'],
  },
  {
    clauseId: '8.1.4',
    title: 'Procurement',
    purpose: 'Control procurement, contractors and outsourced processes so OH&S requirements are met by suppliers and on site.',
    whatToLookFor: ['OH&S requirements specified when buying goods, services and contractor work', 'Contractor pre-qualification, induction, permits and supervision; outsourced processes defined and controlled'],
    evidenceToRequest: ['Contractor approval/pre-qualification records', 'Purchase specs with OH&S requirements', 'Contractor inductions and permits', 'Outsourced-process control arrangements'],
    questionsToAsk: ['How do you ensure contractors and suppliers meet your OH&S requirements?', 'How are outsourced processes controlled?'],
    typicalNonconformities: ['Contractors working without induction, risk assessment or permit', 'Outsourced processes assumed safe but not controlled'],
  },
  {
    clauseId: '8.2',
    title: 'Emergency preparedness and response',
    purpose: 'Be prepared to respond to and mitigate foreseeable emergencies, and test and improve the arrangements.',
    whatToLookFor: ['Identified emergency scenarios with response procedures (fire, injury, spill, evacuation)', 'Evidence of drills, trained first-aiders/wardens, and lessons learned'],
    evidenceToRequest: ['Emergency procedures and plans', 'Drill records', 'First-aid and fire provision, alarms and evacuation routes'],
    questionsToAsk: ['What emergencies could occur and when did you last test your response?', 'How were workers and relevant contractors involved?'],
    typicalNonconformities: ['Procedures never tested by drill', 'Emergency equipment, first-aiders or wardens unavailable where needed'],
  },
  {
    clauseId: '9',
    title: 'Performance evaluation',
    purpose: 'Monitor, measure, analyse and evaluate OH&S performance and the management system itself.',
    whatToLookFor: ['Actual monitored data with trends — leading and lagging indicators, not just qualitative status', 'Evaluation of legal compliance and management review feeding improvement'],
    evidenceToRequest: ['Monitoring data and trends', 'Compliance evaluation', 'Internal audit and review records'],
    questionsToAsk: ['How do you know your OH&S performance is improving?'],
    typicalNonconformities: ['Data collected but never analysed', 'No evaluation of whether objectives are met'],
  },
  {
    clauseId: '9.1',
    title: 'Monitoring, measurement, analysis and performance evaluation',
    purpose: 'Determine what to monitor, with what methods, and evaluate OH&S performance against criteria.',
    whatToLookFor: [
      'A balance of leading indicators (inspections, near-misses, training) and lagging indicators (LTIFR/TRIFR, incidents) tracked over time.',
      'Occupational exposure monitoring (e.g. noise, dust, vibration) and health surveillance where relevant, with analysis not just collection.',
    ],
    evidenceToRequest: ['Performance indicators with values and periods', 'Exposure-monitoring and health-surveillance results', 'Calibration of measuring equipment', 'Trend analysis'],
    questionsToAsk: ['What do you monitor, how, and what do the trends tell you?', 'How do you use leading indicators, not just injury numbers?'],
    typicalNonconformities: ['Numbers recorded but never evaluated', 'Only lagging indicators tracked; no leading indicators or exposure monitoring'],
  },
  {
    clauseId: '9.1.2',
    title: 'Evaluation of compliance',
    purpose: 'Periodically evaluate fulfilment of legal and other requirements and maintain knowledge of compliance status.',
    whatToLookFor: ['A periodic compliance-evaluation record per legal requirement (e.g. against HSWA, COSHH, PUWER, LOLER)', 'Actions where non-compliance is found, and statutory inspections kept current'],
    evidenceToRequest: ['Compliance-evaluation records', 'Statutory inspection and test certificates (e.g. LOLER, PUWER, electrical)'],
    questionsToAsk: ['How and how often do you evaluate compliance with each legal requirement?'],
    typicalNonconformities: ['Compliance assumed, never evaluated', 'Non-compliance found but no action taken'],
  },
  {
    clauseId: '9.2',
    title: 'Internal audit',
    purpose: 'Conduct planned internal audits to check the OH&S management system conforms and is effectively implemented.',
    whatToLookFor: ['A risk-based audit programme covering the whole system over time', 'Competent, impartial internal auditors'],
    evidenceToRequest: ['Internal audit programme and reports', 'Auditor competence/impartiality evidence'],
    questionsToAsk: ['How is your internal audit programme planned and who audits whom?'],
    typicalNonconformities: ['Internal audits not covering the full scope', 'Auditors auditing their own work'],
  },
  {
    clauseId: '9.3',
    title: 'Management review',
    purpose: 'Top management reviews the OH&S management system at planned intervals using defined inputs to drive decisions.',
    whatToLookFor: ['Reviews covering the required inputs (performance, incidents, compliance, objectives, consultation, findings, context changes)', 'Decisions and actions with owners'],
    evidenceToRequest: ['Management-review minutes', 'Resulting action records'],
    questionsToAsk: ['What inputs does your management review consider and what decisions came out of it?'],
    typicalNonconformities: ['Review missing key inputs (e.g. incident trends or worker consultation)', 'No decisions, actions or resources resulting'],
  },
  {
    clauseId: '10',
    title: 'Improvement',
    purpose: 'Use incidents, nonconformities, corrective action and trends to continually improve the OH&S management system.',
    whatToLookFor: ['Corrective actions that address root cause and are verified', 'Evidence of genuine continual improvement in OH&S performance'],
    evidenceToRequest: ['Incident, nonconformity & corrective-action log', 'Trend of recurring issues'],
    questionsToAsk: ['How do you make sure incidents and problems do not recur?'],
    typicalNonconformities: ['Corrections without root-cause analysis', 'Same incident or nonconformity recurring across audits'],
  },
  {
    clauseId: '10.2',
    title: 'Incident, nonconformity and corrective action',
    purpose: 'React to incidents and nonconformities, make safe, investigate the root cause, and act to prevent recurrence — with worker involvement.',
    whatToLookFor: ['Incident reporting and investigation that reaches root cause (not just blaming the worker)', 'RIDDOR-reportable events identified and reported; correction and corrective action verified before closure'],
    evidenceToRequest: ['Incident reports and investigation records with root cause', 'RIDDOR reporting evidence where applicable', 'CAPA records and verification evidence'],
    questionsToAsk: ['Walk me through a recent incident from report to verified closure.', 'How do you decide if an event is RIDDOR-reportable, and how are workers involved in the investigation?'],
    typicalNonconformities: ['Root cause not analysed, or investigation stops at "operator error"', 'Reportable incidents not notified to the regulator, or actions closed without verifying effectiveness'],
  },
  {
    clauseId: '10.3',
    title: 'Continual improvement',
    purpose: 'Continually improve the suitability, adequacy and effectiveness of the OH&S management system to prevent harm.',
    whatToLookFor: ['Improving OH&S performance trends over time', 'Improvement driven by data and worker input, not only by incidents'],
    evidenceToRequest: ['Performance trends', 'Improvement initiatives and their results'],
    questionsToAsk: ['What has measurably improved in your OH&S performance, and how?'],
    typicalNonconformities: ['No demonstrable improvement', 'Improvement claimed without supporting data'],
  },
];

/** How to grade what you find — aligned with `classifyFinding()`. */
export const GRADING_GUIDE: GradeGuide[] = [
  {
    grade: 'majorNc',
    label: 'Major nonconformity',
    when: 'The OH&S management system’s ability to achieve its intended results — preventing injury and ill health — is in doubt.',
    examples: [
      'Absence or total breakdown of a required process (e.g. no hazard identification or no compliance evaluation at all).',
      'Significant doubt that controls are effective, or a significant legal breach or imminent risk of serious harm to workers.',
      'Several minor nonconformities against the same requirement — a systemic failure.',
    ],
    timeline: 'Correction and corrective action typically within ~30 days; often verified before certification.',
  },
  {
    grade: 'minorNc',
    label: 'Minor nonconformity',
    when: 'An isolated lapse that does not undermine the OH&S management system overall.',
    examples: ['A single out-of-date risk assessment', 'One training record missing', 'An isolated permit-to-work record gap'],
    timeline: 'Corrective-action plan typically accepted within ~90 days and verified at the next visit.',
  },
  {
    grade: 'ofi',
    label: 'Opportunity for improvement',
    when: 'A suggestion that would strengthen the OH&S management system — not a non-fulfilment of a requirement.',
    examples: ['A more efficient way to track objectives or leading indicators', 'Consolidating overlapping registers'],
    timeline: 'Advisory only — no mandatory action or timeline.',
  },
];

/**
 * Clause-by-clause field guide for ISO 14001:2015 (Environmental Management
 * System) — original, Trainovate-authored guidance for the environmental
 * sub-clauses that differ from ISO 45001: environmental aspects (6.1.2),
 * compliance obligations (6.1.3), objectives (6.2), operational control (8.1),
 * emergency preparedness (8.2) and evaluation of compliance (9.1.2). Identifiers
 * and short titles only — NO verbatim ISO requirement text, and no content
 * contains the word "shall" (copyright guardrail).
 */
export const ISO_14001_CLAUSE_FIELD_GUIDE: ClauseGuide[] = [
  {
    clauseId: '6.1.2',
    title: 'Environmental aspects',
    purpose:
      'Determine the environmental aspects of activities, products and services that the organization can control or influence, and decide which are significant.',
    whatToLookFor: [
      'A maintained aspects-and-impacts register that considers a life-cycle perspective and both normal and abnormal operating conditions.',
      'Documented significance criteria so significant aspects are decided consistently, not by gut feel.',
    ],
    evidenceToRequest: [
      'Environmental aspects & impacts register with significance ratings',
      'The significance methodology and criteria',
      'Evidence the register covers planned, emergency and life-cycle situations',
    ],
    questionsToAsk: [
      'How did you identify your environmental aspects across the life cycle?',
      'How do you decide which aspects are significant?',
    ],
    typicalNonconformities: [
      'Aspects register generic or out of date for the activities on site',
      'Significance asserted with no documented criteria',
    ],
  },
  {
    clauseId: '6.1.3',
    title: 'Compliance obligations',
    purpose:
      'Identify the compliance obligations (legal and other requirements) related to environmental aspects and determine how they apply.',
    whatToLookFor: [
      'A compliance-obligations register linked to the relevant aspects, distinguishing legal duties from other adopted requirements.',
      'How obligations are kept current and translated into operational controls and monitoring.',
    ],
    evidenceToRequest: [
      'Compliance-obligations register with references and applicability',
      'Permits, consents and licences',
      'The mechanism that tracks changes to legal requirements',
    ],
    questionsToAsk: [
      'How do you keep your compliance obligations up to date?',
      'Which obligations apply to this activity and how do you meet them?',
    ],
    typicalNonconformities: [
      'Register missing applicable permits or consents',
      'Obligations identified but not reflected in controls',
    ],
  },
  {
    clauseId: '6.2',
    title: 'Environmental objectives and planning to achieve them',
    purpose:
      'Set measurable environmental objectives at relevant functions and levels, consistent with the policy and significant aspects, with plans to achieve them.',
    whatToLookFor: [
      'Objectives that are measurable, resourced and owned, with target dates and a way to track progress.',
      'A clear line from significant aspects and compliance obligations to the objectives chosen.',
    ],
    evidenceToRequest: [
      'Environmental objectives & targets plan',
      'Progress data against each target',
      'Resourcing and ownership for each objective',
    ],
    questionsToAsk: [
      'How are your environmental objectives measured and tracked?',
      'What happens when an objective falls behind?',
    ],
    typicalNonconformities: [
      'Vague, unmeasurable objectives',
      'No owner, plan or monitoring for objectives',
    ],
  },
  {
    clauseId: '8.1',
    title: 'Operational planning and control',
    purpose:
      'Establish operational controls for the processes tied to significant aspects and compliance obligations, applying a life-cycle perspective.',
    whatToLookFor: [
      'Controls proportionate to the significant aspects, applied at the point of work and adapted to how the work is really done.',
      'Control of outsourced processes and life-cycle stages (procurement, design, end-of-life) where the organization can influence them.',
    ],
    evidenceToRequest: [
      'Operational control procedures for significant-aspect activities',
      'Waste, effluent and emissions handling records',
      'Arrangements for controlling outsourced and contracted work',
    ],
    questionsToAsk: [
      'Show me how this significant-aspect activity is controlled in practice.',
      'How do you control environmental performance in outsourced processes?',
    ],
    typicalNonconformities: [
      'No control for a significant aspect',
      'Outsourced or life-cycle stages assumed compliant but not controlled',
    ],
  },
  {
    clauseId: '8.2',
    title: 'Emergency preparedness and response',
    purpose:
      'Be prepared to prevent or mitigate adverse environmental impacts from potential emergencies, and test and improve the arrangements.',
    whatToLookFor: [
      'Identified emergency scenarios with environmental impact (spill, fire, uncontrolled release) and response procedures.',
      'Evidence of drills, trained responders, spill kits and containment, and lessons fed back in.',
    ],
    evidenceToRequest: [
      'Emergency procedures covering environmental scenarios',
      'Drill records and post-incident reviews',
      'Spill-response and containment provision',
    ],
    questionsToAsk: [
      'Which environmental emergencies could occur and when did you last test your response?',
      'How are interested parties and responders involved?',
    ],
    typicalNonconformities: [
      'Procedures never tested by drill',
      'Spill or containment equipment unavailable where needed',
    ],
  },
  {
    clauseId: '9.1.2',
    title: 'Evaluation of compliance',
    purpose:
      'Establish how and how often to evaluate fulfilment of compliance obligations, and maintain knowledge of compliance status.',
    whatToLookFor: [
      'A periodic compliance-evaluation record per obligation, with the date, method and finding.',
      'Action taken where a gap is found, and permit / consent monitoring kept current.',
    ],
    evidenceToRequest: [
      'Compliance-evaluation records by obligation',
      'Monitoring results against permit / consent limits',
      'Actions arising from any non-compliance',
    ],
    questionsToAsk: [
      'How and how often do you evaluate compliance with each obligation?',
      'What did you do when a gap was found?',
    ],
    typicalNonconformities: [
      'Compliance assumed, never evaluated',
      'Permit-limit exceedance found but no action taken',
    ],
  },
  {
    clauseId: '9.1',
    title: 'Monitoring, measurement, analysis and evaluation',
    purpose:
      'Determine what environmental information to monitor and measure, with what methods, and evaluate environmental performance against criteria.',
    whatToLookFor: [
      'Monitoring tied to significant aspects and obligations (emissions, effluent, waste, energy, water) with trends, not just raw readings.',
      'Calibrated measuring equipment and analysed results that drive decisions.',
    ],
    evidenceToRequest: [
      'Environmental performance indicators with values and periods',
      'Calibration of monitoring equipment',
      'Trend analysis and the criteria performance is judged against',
    ],
    questionsToAsk: [
      'What environmental data do you monitor, how, and what do the trends tell you?',
      'How do you evaluate performance against your criteria?',
    ],
    typicalNonconformities: [
      'Data collected but never evaluated',
      'Monitoring not linked to significant aspects',
    ],
  },
];

const GUIDE_BY_CLAUSE = new Map(CLAUSE_FIELD_GUIDE.map((entry) => [entry.clauseId, entry]));
const ISO_14001_GUIDE_BY_CLAUSE = new Map(ISO_14001_CLAUSE_FIELD_GUIDE.map((entry) => [entry.clauseId, entry]));

/**
 * Look up the field guide for a clause (e.g. '9.1') for contextual help. The
 * optional `edition` selects the environmental guide for ISO 14001 editions;
 * omitted (the default) it returns the ISO 45001 guidance, preserving every
 * existing call site. For 14001 it falls back to the shared (45001) guidance for
 * clauses that have no environmental-specific entry, so contextual help is never
 * blank.
 */
export function clauseGuideFor(clauseId: string, edition?: string): ClauseGuide | undefined {
  if (edition && edition.startsWith('ISO_14001')) {
    return ISO_14001_GUIDE_BY_CLAUSE.get(clauseId) ?? GUIDE_BY_CLAUSE.get(clauseId);
  }
  return GUIDE_BY_CLAUSE.get(clauseId);
}

/** All clause IDs the field guide covers — used to assert coverage in tests. */
export function guideClauseIds(): string[] {
  return CLAUSE_FIELD_GUIDE.map((entry) => entry.clauseId);
}

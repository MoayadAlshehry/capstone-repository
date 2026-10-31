/** P5.3 v2 deterministic inputs. Fictional people and research, never endorsements. */
export const factoryVersion = 'P53_V3_PHASE34_2026_10_25_1';
export const universities = [
  { code: 'KKU', en: 'King Khalid University', ar: 'جامعة الملك خالد' },
  { code: 'KSU', en: 'King Saud University', ar: 'جامعة الملك سعود' },
  { code: 'KAU', en: 'King Abdulaziz University', ar: 'جامعة الملك عبدالعزيز' },
  { code: 'UQU', en: 'Umm Al-Qura University', ar: 'جامعة أم القرى' },
  {
    code: 'IAU',
    en: 'Imam Abdulrahman Bin Faisal University',
    ar: 'جامعة الإمام عبدالرحمن بن فيصل',
  },
] as const;

const given = [
  'Faisal',
  'Abdullah',
  'Omar',
  'Khalid',
  'Yasser',
  'Nasser',
  'Saad',
  'Turki',
  'Hamad',
  'Majed',
  'Rakan',
  'Badr',
  'Sultan',
  'Ibrahim',
  'Ziyad',
  'Saleh',
  'Salman',
  'Hassan',
  'Mansour',
  'Abdulaziz',
];
const fathers = [
  'Ahmed',
  'Ali',
  'Abdulrahman',
  'Saud',
  'Mohammed',
  'Ibrahim',
  'Fahad',
  'Yousef',
  'Hamad',
  'Abdullah',
];
const families = [
  'Alqahtani',
  'Alzahrani',
  'Alghamdi',
  'Alotaibi',
  'Alharbi',
  'Alamri',
  'Alshahrani',
  'Aldosari',
  'Almutairi',
  'Alsubaie',
  'Alanzi',
  'Alrashidi',
  'Almalki',
  'Alsulami',
  'Alharthi',
  'Alqarni',
  'Aljuhaimi',
  'Alsaif',
  'Alhazmi',
  'Alshammari',
];
export const personName = (n: number) =>
  `${given[n % given.length]} ${fathers[Math.floor(n / given.length) % fathers.length]} ${families[Math.floor(n / (given.length * fathers.length)) % families.length]}`;

const premium = [
  [
    'WadiWatch: Flood-Aware Route Planning for Aseer',
    'software',
    'flood routing',
    'Shortest routes can cross exposed wadi links when rainfall observations are uncertain. A small, inspectable graph model separates travel cost from exposure and rejects unsafe links before optimization.',
    'Compare distance-only routing and constraint-filtered path search on seeded graphs. Use complete path enumeration as an independent small-instance oracle and report infeasible cases separately.',
    'Distance-only shortest path; blanket closure of every observed wet link',
    'Synthetic topology and rainfall cannot establish real-road safety. Road authority closure rules, sensor calibration and field trials are outside this demonstrator.',
  ],
  [
    'ArabicLens: Auditable Arabic Document Retrieval',
    'data',
    'arabic retrieval',
    'Small archives need inspectable Arabic retrieval without sending private documents to a remote model. This study isolates Unicode normalization and literal token matching on a controlled corpus.',
    'Use a versioned synthetic Arabic corpus, topic-based relevance labels, literal substring and Unicode-normalized token baselines. Report exact precision and recall on separately seeded query-topic groups.',
    'Literal substring search; normalized token overlap',
    'The curated corpus is small and unrepresentative of dialects or historical OCR. Relevance labels are demonstration judgments; no claim of national-scale retrieval accuracy is made.',
  ],
  [
    'ReefGuard: Explainable Edge Sensor Anomaly Detection',
    'hardware',
    'edge sensors',
    'Resource-limited habitat sensors must distinguish gradual drift from isolated corrupted observations while retaining enough context for an operator to audit each alarm.',
    'Replay seeded synthetic temperature series through fixed thresholds, a rolling z-score and a two-sample persistence rule. Measure alarm delay, false alarms and detected event samples; the model does not emulate field packet loss.',
    'Fixed absolute alarm; unfiltered rolling z-score',
    'The time series is simulated, not field coral measurements. The device image is conceptual; no biological inference, protected-site access or deployed instrument is asserted.',
  ],
  [
    'HaramainFlow: Fair Resource Queue Scheduling',
    'software',
    'queue scheduling',
    'A service queue can reduce average delay while deferring long jobs. This finite-batch study makes the effect of a bounded scheduling look-ahead inspectable without promising a real operational wait guarantee.',
    'Compare FCFS, shortest-job-first and a five-job look-ahead policy on the same seeded finite batches. Verify conservation of jobs and compare mean and maximum waits, including the trade-off for long jobs.',
    'First-come-first-served; shortest-job-first without aging',
    'No real visitor, location trace or operational crowd data is used. Simulation excludes emergency rules, human behavior and site-specific safety requirements.',
  ],
  [
    'PalmTrace: Verifiable Irrigation Decision Records',
    'data',
    'irrigation audit',
    'A moisture-triggered controller needs reproducible explanations for each water allocation, particularly when sensors fail or a daily budget is exhausted.',
    'Replay seeded soil-moisture traces through fixed timing, threshold irrigation and budget-constrained hysteresis; check budget invariants, missing-sample recovery and decision-log reconstruction.',
    'Fixed daily timer; single-threshold irrigation',
    'Moisture and evaporation are synthetic. Water savings here concern the stated simulator only and cannot predict crop yield or farm economics.',
  ],
  [
    'GridWise: Solar Microgrid Dispatch Under Uncertainty',
    'hardware',
    'energy scheduling',
    'A small energy store must trade grid draw against battery wear while handling a bounded uncertain solar input. Dispatch decisions require an explicit feasible-energy ledger.',
    'Compare greedy self-consumption, fixed reserve and dynamic-programming dispatch on seeded daily profiles; independently enumerate short horizons and perturb demand and battery bounds.',
    'Greedy solar self-consumption; fixed battery reserve',
    'The simplified battery and tariff model omits degradation chemistry, grid protection and real installation certification. No field cost saving is claimed.',
  ],
  [
    'SecureArchive: Tamper-Evident Research Manifests',
    'software',
    'integrity manifests',
    'Research bundles must detect changed bytes, deleted paths and ambiguous filenames without interpreting uploaded code or trusting a client-supplied checksum.',
    'Build canonical path manifests with SHA-256 leaf hashes and a reproducible Merkle root. Compare filename-only and path-free checksum indexes with controlled byte mutation, rename and input-order cases.',
    'Filename and size index; unordered flat checksums',
    'Integrity is not authenticity or malware detection. The artifact does not execute uploads, issue trusted signatures or replace institutional retention policies.',
  ],
  [
    'DesalSense: Leak Isolation in Water Sensor Networks',
    'hardware',
    'water monitoring',
    'Sparse pressure sensors can flag a disturbance without explaining which network segment is inconsistent. A small residual model tests whether localization is robust to missing data.',
    'Use seeded network-flow balances, threshold alarms and constrained residual localization; compare localization sets, false positives and ambiguous cases across sensor-dropout scenarios.',
    'Global pressure threshold; nearest-sensor localization',
    'The hydraulic model is an illustrative linear approximation. No plant measurements, critical-infrastructure access or real leak-detection performance is asserted.',
  ],
  [
    'AccessMap: Explainable Accessibility Route Graphs',
    'software',
    'accessible routing',
    'The shortest path may include stairs or a narrow connection. A route engine should expose why edges are excluded and distinguish unknown accessibility from verified suitability.',
    'Evaluate distance-only, binary accessible and constraint-aware routing against seeded annotated graphs; use exhaustive path enumeration, disconnected graphs and incomplete annotations as adversarial cases.',
    'Unconstrained shortest path; binary accessibility filter',
    'All geometry and accessibility annotations are fictional. There are no surveyed buildings, participant studies or medical suitability claims.',
  ],
  [
    'EdgeHarbor: Deadline-Aware Offline Job Processing',
    'data',
    'edge scheduling',
    'A disconnected edge device must reserve scarce compute capacity fairly while honoring deadlines and avoiding duplicate effects when connectivity returns.',
    'Replay seeded job streams through FIFO, earliest-deadline and admission-aware scheduling; inspect capacity, idempotency and deadline invariants with crash/replay and bounded queue experiments.',
    'FIFO without admission; earliest-deadline without capacity reservation',
    'The bounded simulator is not a distributed-consensus implementation. No availability SLA, cloud deployment or field benchmark is asserted.',
  ],
] as const;

const other = [
  [
    'ShadeLine: Passive Thermal Monitoring for Small Buildings',
    'hardware',
    'thermal sensing',
  ],
  [
    'SouqLedger: Traceable Inventory Reconciliation',
    'software',
    'inventory reconciliation',
  ],
  [
    'HarborLink: Delay-Tolerant Sensor Message Routing',
    'hardware',
    'sensor networking',
  ],
  ['ReadWell: Searchable Open Learning Notes', 'software', 'learning search'],
  [
    'DateSort: Explainable Produce Batch Classification',
    'data',
    'classification',
  ],
  ['AirMesh: Low-Power Indoor Air Quality Sampling', 'hardware', 'air sensing'],
  [
    'PlanFair: Transparent Shared Laboratory Booking',
    'software',
    'resource scheduling',
  ],
  [
    'CoastCast: Inspectable Short-Horizon Tide Forecasts',
    'data',
    'time series',
  ],
  [
    'VoltTrace: Battery Measurement Quality Checks',
    'hardware',
    'battery sensing',
  ],
  [
    'ArchiveBridge: Structured Bilingual Metadata Exchange',
    'software',
    'metadata quality',
  ],
  [
    'SandTrack: Solar Panel Soiling Inspection Records',
    'data',
    'energy monitoring',
  ],
  [
    'TransitPulse: Bus Headway Regularity Explorer',
    'data',
    'transport simulation',
  ],
  [
    'ParcelPath: Verifiable Warehouse Route Planning',
    'software',
    'path planning',
  ],
  [
    'CircuitLens: Component Inspection Evidence Index',
    'hardware',
    'inspection',
  ],
  [
    'WaterBudget: Explainable Residential Demand Planning',
    'data',
    'water planning',
  ],
  [
    'StudySync: Conflict-Aware Study Space Allocation',
    'software',
    'resource allocation',
  ],
  [
    'GreenRack: Server Energy Measurement Notebook',
    'hardware',
    'energy sensing',
  ],
  ['ArabicTags: Transparent Keyword Suggestion', 'data', 'arabic metadata'],
  [
    'LabCourier: Chain-of-Custody Sample Tracking',
    'software',
    'custody tracking',
  ],
  [
    'SignalGarden: Sensor Calibration Drift Explorer',
    'hardware',
    'sensor calibration',
  ],
  ['RouteNote: Map Annotation Consistency Checker', 'software', 'map metadata'],
  [
    'QuietNode: Noise Sampling Without Recorded Speech',
    'hardware',
    'privacy sensing',
  ],
  ['DatasetDesk: Reproducible CSV Validation Rules', 'data', 'data validation'],
  [
    'TimeBasket: Small-Team Appointment Coordination',
    'software',
    'appointment planning',
  ],
  ['PumpWatch: Maintenance Observation Register', 'hardware', 'maintenance'],
  ['OpenShelf: Library Shelf Audit Notebook', 'software', 'archive indexing'],
  ['SensorSteps: Sequential Sampling Comparison', 'hardware', 'sampling'],
  ['TagGarden: Controlled Vocabulary Explorer', 'data', 'taxonomy'],
  ['CampusCache: Offline Notice Synchronization', 'software', 'offline sync'],
  [
    'CoolLoop: Laboratory Cooling Log Analyzer',
    'hardware',
    'temperature analysis',
  ],
  [
    'TaskPebble: Lightweight Personal Research Planner',
    'software',
    'research planning',
  ],
  ['RainLog: Manual Rainfall Series Organizer', 'data', 'rainfall series'],
  ['WireCheck: Breadboard Connection Checklist', 'hardware', 'electronics'],
  [
    'BookLane: Small Reading Collection Organizer',
    'software',
    'collection metadata',
  ],
  ['ChartSeed: Inspectable Statistical Chart Notebook', 'data', 'statistics'],
  ['LightPatch: Simple Ambient-Light Sampling', 'hardware', 'light sensing'],
  [
    'FolderMap: Research Folder Structure Explorer',
    'software',
    'file indexing',
  ],
  ['EnergyNotes: Household Energy Diary Analyzer', 'data', 'energy diary'],
  ['PortBench: Serial Device Observation Logger', 'hardware', 'serial logging'],
  [
    'IdeaIndex: Searchable Capstone Proposal Register',
    'software',
    'proposal search',
  ],
] as const;

export const projectSpecs = [...premium, ...other].map((p, i) => ({
  id: `P${String(i + 1).padStart(3, '0')}`,
  index: i,
  university: universities[i % 5]!,
  teamSize: 3 + (i % 4),
  department: (['CS', 'IS', 'CE'] as const)[i % 3]!,
  year: i < 30 ? '2026–2027' : '2025–2026',
  title: p[0],
  domain: p[1],
  topic: p[2],
  problem:
    p[3] ??
    `${p[0].split(':')[0]} explores ${p[2]} in a bounded, inspectable graduation-project demonstrator. The work emphasizes traceable input assumptions and visible failure cases rather than production claims.`,
  method:
    p[4] ??
    `Compare a fixed-rule baseline with a structured validation approach for ${p[2]}, using versioned synthetic cases, explicit input constraints and documented failure modes.`,
  alternatives:
    p[5] ?? 'Manual record inspection; fixed-rule automated checking',
  limitations:
    p[6] ??
    `This ${i < 40 ? 'bounded prototype' : 'early proof of concept'} has no field deployment, institutional endorsement or human study. The attached review identifies limited coverage and remaining validation work.`,
  premium: i < 10,
  eligible: i < 30,
  externalTarget: i < 10 ? 10 : i < 30 ? 2 : 0,
  keywords: [p[2], p[1], 'reproducibility', 'validation', 'explainability'],
}));
export type ProjectSpec = Omit<
  (typeof projectSpecs)[number],
  'title' | 'topic' | 'problem' | 'method' | 'alternatives' | 'limitations'
> & {
  title: string;
  topic: string;
  problem: string;
  method: string;
  alternatives: string;
  limitations: string;
};
export const extraSpecs: ProjectSpec[] = Array.from({ length: 10 }, (_, i) => ({
  ...projectSpecs[11]!,
  id: 'S' + String(i + 1).padStart(2, '0'),
  index: 12,
  university: universities[i % 5]!,
  teamSize: 3 + (i % 4),
  department: 'CS',
  year: '2026–2027',
  title: [
    'AtlasDesk: Study Planning Workspace',
    'LabLedger: Final Submission Request',
    'MethodMap: Evidence Quality Screening',
    'DataBridge: Supervisor Assessment',
    'ResearchNotes: Guest Committee Assessment',
    'ClearReport: Publication Decision',
    'IterationLog: Assessed Revision',
    'ArchiveRecord: Internal Retention',
    'OpenEvidence: Independent Review',
    'PanelNotes: Partial Committee Progress',
  ][i]!,
  domain: 'software',
  topic: 'research workflow',
  premium: false,
  eligible: i === 8,
  externalTarget: 0,
  keywords: [
    'research workflow',
    'reproducibility',
    'validation',
    'software',
    'evidence',
  ],
  problem:
    'This separate English-language workflow demonstrator supplies a small, reproducible record-validation artifact so presenters can exercise the real project lifecycle without changing the fifty completed showcase cases.',
  method:
    'Inspect the owned input records, reject duplicate and invalid rows, preserve a complete deterministic result ledger and compare the accepted identifiers with an explicit reference set.',
  alternatives:
    'Manual row inspection; validation without identity uniqueness checks',
  limitations:
    'This is a bounded workflow exercise, not a separate field deployment. Its example data and assessments are fictional; it does not claim institutional endorsement or a human study.',
}));
export const authorName = (p: ProjectSpec, n: number) =>
  personName(
    p.id.startsWith('S')
      ? 3200 + (Number(p.id.slice(1)) - 1) * 6 + n
      : p.index * 6 + n,
  );

/** Inputs, not stored outcomes. Exact service rubrics compute every final score. */
export function internalLevels(index: number, member = -1): number[] {
  if (index < 10) {
    const levels = [4, 4, 4, 4, 4, 4, 4];
    levels[(index + Math.max(0, member)) % 7] = 3;
    return levels;
  }
  if (index < 25) return [3, 3, 3, 3, 3, 3, 3];
  if (index < 30) return [3, 3, 3, 3, 3, 3, 2];
  if (index < 40) return [3, 2, 2, 2, 2, 2, 3];
  return [2, 2, 2, 2, 1, 2, 2];
}

export function externalLevels(index: number, ordinal: number): number[] {
  if (index < 10) {
    // Ten distinct exact means. All first-nine loss sums stay below216 quarter
    // points, so even the strict n=9 threshold94 is met. Verifier replays each
    // prefix independently; these arrays do not write an outcome or rank.
    const losses = [
      [20, 0, 25, 20, 20, 20, 20, 20, 0, 0],
      [20, 0, 30, 20, 20, 20, 20, 20, 0, 0],
      [20, 25, 0, 25, 20, 25, 20, 20, 0, 0],
      [20, 20, 0, 20, 20, 20, 20, 20, 20, 0],
      [20, 25, 0, 20, 20, 20, 20, 20, 20, 0],
      [20, 25, 20, 0, 20, 25, 20, 20, 20, 0],
      [20, 25, 20, 25, 0, 25, 20, 20, 20, 0],
      [20, 20, 20, 0, 20, 20, 20, 20, 20, 20],
      [20, 25, 20, 20, 20, 0, 20, 20, 20, 20],
      [20, 25, 20, 25, 20, 0, 20, 20, 20, 20],
    ][index]!;
    const levels = [4, 4, 4, 4];
    const loss = losses[ordinal];
    if (loss === 20) levels[3] = 3;
    if (loss === 25) levels[ordinal % 2 ? 1 : 2] = 3;
    if (loss === 30) levels[0] = 3;
    return levels;
  }
  // A genuine 75 mean pauses nonpremium cases; no artificial reviewer cap.
  return ordinal === 0 && index === 10 ? [4, 4, 3, 3] : [3, 3, 3, 3];
}

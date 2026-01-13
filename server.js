import http from 'http';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const ENV_BASE_URL = process.env.BASE_URL;
const RECOMMENDER_API_URL = process.env.RECOMMENDER_API_URL || '';
const RECOMMENDER_API_KEY = process.env.RECOMMENDER_API_KEY || '';
const ISAMS_BASE_URL = process.env.ISAMS_BASE_URL || '';
const ISAMS_REPORT_CYCLES_PATH = process.env.ISAMS_REPORT_CYCLES_PATH || '/api/batch/schoolreports/reportcycles';
const ISAMS_API_KEY = process.env.ISAMS_API_KEY || '';
const ISAMS_AUTH_HEADER = process.env.ISAMS_AUTH_HEADER || 'Authorization';
const ISAMS_AUTH_SCHEME = process.env.ISAMS_AUTH_SCHEME || 'Bearer';
const S3_PRESIGNED_URL = process.env.S3_PRESIGNED_URL || '';
const S3_PRESIGNED_URL_TEMPLATE = process.env.S3_PRESIGNED_URL_TEMPLATE || '';
const PG_REST_URL = process.env.PG_REST_URL || '';
const PG_REST_AUTH_HEADER = process.env.PG_REST_AUTH_HEADER || 'apikey';
const PG_REST_API_KEY = process.env.PG_REST_API_KEY || '';
const PG_REST_AUTH_SCHEME = process.env.PG_REST_AUTH_SCHEME || '';
const PUBLIC_DIR = path.join(__dirname, 'public');

const assignments = new Map();
const schools = [
  { id: 'SCH-A', name: 'Northfield High School' },
  { id: 'SCH-B', name: 'Lakeside Academy' },
  { id: 'SCH-C', name: 'Riverside Prep' },
];

const learners = [
  { id: 'L001', name: 'Ada Lovelace', email: 'ada@example.com', cohort: 'Algebra 2', status: 'Active', quartile: 'Q1', schoolId: 'SCH-A' },
  { id: 'L002', name: 'Alan Turing', email: 'alan@example.com', cohort: 'Geometry', status: 'Active', quartile: 'Q2', schoolId: 'SCH-A' },
  { id: 'L003', name: 'Katherine Johnson', email: 'katherine@example.com', cohort: 'Algebra 2', status: 'Active', quartile: 'Q3', schoolId: 'SCH-B' },
  { id: 'L004', name: 'Maryam Mirzakhani', email: 'maryam@example.com', cohort: 'Calculus', status: 'Active', quartile: 'Q4', schoolId: 'SCH-B' },
  { id: 'L005', name: 'Grace Hopper', email: 'grace@example.com', cohort: 'Geometry', status: 'On leave', quartile: 'Q2', schoolId: 'SCH-C' },
];

const learnerPerformance = {
  L001: {
    mastery: [
      { outcomeId: 'maths.fractions.equivalence', topic: 'Fractions and mixed numbers', proficiency: 0.82, confidence: 0.9 },
      { outcomeId: 'maths.algebra.linear-two-step', topic: 'Linear equations and inequalities', proficiency: 0.46, confidence: 0.6 },
      { outcomeId: 'maths.geometry.transformations', topic: 'Transformations and congruence', proficiency: 0.71, confidence: 0.75 },
    ],
    recentActivity: {
      numAssignmentsLast7d: 2,
      averageScoreLast7d: 0.78,
      averageTimeOnTaskMinutes: 26,
      lastHomeworkTopic: 'Linear equations and inequalities',
    },
  },
  L002: {
    mastery: [
      { outcomeId: 'maths.geometry.triangles', topic: 'Similarity and right triangles', proficiency: 0.55, confidence: 0.55 },
      { outcomeId: 'maths.number.ratios', topic: 'Ratios and rates', proficiency: 0.82, confidence: 0.81 },
    ],
    recentActivity: {
      numAssignmentsLast7d: 1,
      averageScoreLast7d: 0.7,
      averageTimeOnTaskMinutes: 21,
      lastHomeworkTopic: 'Similarity and right triangles',
    },
  },
};

const schemeOfWork = {
  academicYear: '2024-2025',
  semesters: [
    {
      name: 'Semester 1',
      focus: 'Number sense and proportional reasoning',
      weeks: [
        { week: 1, topic: 'Fractions and mixed numbers' },
        { week: 2, topic: 'Ratios and rates' },
        { week: 3, topic: 'Percent change' },
        { week: 4, topic: 'Proportional relationships' },
        { week: 5, topic: 'Scaling and similarity' },
        { week: 6, topic: 'Unit conversions' },
      ],
    },
    {
      name: 'Semester 2',
      focus: 'Algebraic reasoning and functions',
      weeks: [
        { week: 7, topic: 'Linear equations and inequalities' },
        { week: 8, topic: 'Systems of equations' },
        { week: 9, topic: 'Quadratic functions' },
        { week: 10, topic: 'Exponential functions' },
        { week: 11, topic: 'Polynomial expressions' },
        { week: 12, topic: 'Sequences and series' },
      ],
    },
    {
      name: 'Semester 3',
      focus: 'Geometry, statistics, and consolidation',
      weeks: [
        { week: 13, topic: 'Transformations and congruence' },
        { week: 14, topic: 'Similarity and right triangles' },
        { week: 15, topic: 'Circles and arcs' },
        { week: 16, topic: 'Data representations' },
        { week: 17, topic: 'Probability and inference' },
        { week: 18, topic: 'Review and capstone project' },
      ],
    },
  ],
};

const contentResources = [
  {
    id: 'RES-101',
    topic: 'Fractions and mixed numbers',
    difficulty: 'Foundation',
    lengthMinutes: 15,
    type: 'Activity',
    title: 'Hands-on fraction strip lab',
    alignedOutcomes: ['maths.fractions.equivalence'],
  },
  {
    id: 'RES-102',
    topic: 'Ratios and rates',
    difficulty: 'Core',
    lengthMinutes: 20,
    type: 'Assessment',
    title: 'Exit ticket: Rate of change scenarios',
    alignedOutcomes: ['maths.number.ratios'],
  },
  {
    id: 'RES-201',
    topic: 'Linear equations and inequalities',
    difficulty: 'Core',
    lengthMinutes: 30,
    type: 'Activity',
    title: 'Desmos exploration: balancing equations',
    alignedOutcomes: ['maths.algebra.linear-two-step'],
  },
  {
    id: 'RES-202',
    topic: 'Quadratic functions',
    difficulty: 'Stretch',
    lengthMinutes: 40,
    type: 'Book chapter',
    title: 'Vertex form and transformations',
    alignedOutcomes: ['maths.algebra.quadratic-forms'],
  },
  {
    id: 'RES-301',
    topic: 'Transformations and congruence',
    difficulty: 'Core',
    lengthMinutes: 25,
    type: 'Activity',
    title: 'Rigid motions on the coordinate plane',
    alignedOutcomes: ['maths.geometry.transformations'],
  },
  {
    id: 'RES-302',
    topic: 'Probability and inference',
    difficulty: 'Stretch',
    lengthMinutes: 30,
    type: 'Assessment',
    title: 'Project brief: design a simple experiment',
    alignedOutcomes: ['maths.statistics.inference'],
  },
];

// PRIZM Content Repository - Mock digital asset storage
const prizmContentRepository = [
  {
    id: 'PRIZM-001',
    title: 'Introduction to Fractions - Video Lesson',
    description: 'Animated video explaining fraction basics with real-world examples',
    topic: 'Fractions and mixed numbers',
    category: 'Video',
    mediaType: 'video/mp4',
    difficulty: 'Foundation',
    duration: 480, // seconds
    fileSize: 125000000, // bytes
    thumbnailUrl: 'https://via.placeholder.com/400x225/4F46E5/FFFFFF?text=Fractions+Video',
    contentUrl: 'https://mock-prizm-cdn.example.com/videos/fractions-intro.mp4',
    tags: ['visual-learning', 'foundational-concepts', 'animations'],
    alignedStandards: ['CCSS.MATH.CONTENT.3.NF.A.1', 'CCSS.MATH.CONTENT.4.NF.A.1'],
    alignedOutcomes: ['maths.fractions.equivalence', 'maths.fractions.basics'],
    uploadedBy: 'admin@school.edu',
    uploadedAt: '2025-09-15T10:30:00Z',
    viewCount: 342,
    rating: 4.7,
  },
  {
    id: 'PRIZM-002',
    title: 'Fraction Strips Interactive Activity',
    description: 'Interactive digital manipulative for exploring fraction equivalence',
    topic: 'Fractions and mixed numbers',
    category: 'Interactive',
    mediaType: 'application/html',
    difficulty: 'Foundation',
    duration: 900, // seconds
    fileSize: 2500000, // bytes
    thumbnailUrl: 'https://via.placeholder.com/400x225/059669/FFFFFF?text=Interactive+Fractions',
    contentUrl: 'https://mock-prizm-cdn.example.com/interactive/fraction-strips/index.html',
    tags: ['interactive', 'manipulatives', 'hands-on'],
    alignedStandards: ['CCSS.MATH.CONTENT.3.NF.A.3'],
    alignedOutcomes: ['maths.fractions.equivalence'],
    uploadedBy: 'teacher1@school.edu',
    uploadedAt: '2025-10-02T14:20:00Z',
    viewCount: 189,
    rating: 4.9,
  },
  {
    id: 'PRIZM-003',
    title: 'Ratios in Real Life - Photo Gallery',
    description: 'High-quality images showing ratio applications in architecture, cooking, and sports',
    topic: 'Ratios and rates',
    category: 'Image',
    mediaType: 'image/jpeg',
    difficulty: 'Core',
    duration: 300, // seconds
    fileSize: 45000000, // bytes (gallery of images)
    thumbnailUrl: 'https://via.placeholder.com/400x225/DC2626/FFFFFF?text=Ratio+Photos',
    contentUrl: 'https://mock-prizm-cdn.example.com/galleries/ratios-real-life.zip',
    tags: ['real-world', 'visual', 'applications'],
    alignedStandards: ['CCSS.MATH.CONTENT.6.RP.A.1'],
    alignedOutcomes: ['maths.number.ratios'],
    uploadedBy: 'teacher2@school.edu',
    uploadedAt: '2025-10-12T09:15:00Z',
    viewCount: 156,
    rating: 4.5,
  },
  {
    id: 'PRIZM-004',
    title: 'Linear Equations Workbook PDF',
    description: 'Comprehensive practice workbook with worked examples and exercises',
    topic: 'Linear equations and inequalities',
    category: 'Document',
    mediaType: 'application/pdf',
    difficulty: 'Core',
    duration: 1800, // seconds
    fileSize: 8500000, // bytes
    thumbnailUrl: 'https://via.placeholder.com/400x225/7C3AED/FFFFFF?text=Linear+Equations+PDF',
    contentUrl: 'https://mock-prizm-cdn.example.com/documents/linear-equations-workbook.pdf',
    tags: ['practice', 'worksheets', 'step-by-step'],
    alignedStandards: ['CCSS.MATH.CONTENT.8.EE.C.7'],
    alignedOutcomes: ['maths.algebra.linear-two-step', 'maths.algebra.solving'],
    uploadedBy: 'admin@school.edu',
    uploadedAt: '2025-09-20T16:45:00Z',
    viewCount: 421,
    rating: 4.8,
  },
  {
    id: 'PRIZM-005',
    title: 'Desmos Graphing Tutorial - Screencast',
    description: 'Step-by-step video tutorial for using Desmos to explore linear equations',
    topic: 'Linear equations and inequalities',
    category: 'Video',
    mediaType: 'video/mp4',
    difficulty: 'Core',
    duration: 720, // seconds
    fileSize: 180000000, // bytes
    thumbnailUrl: 'https://via.placeholder.com/400x225/EA580C/FFFFFF?text=Desmos+Tutorial',
    contentUrl: 'https://mock-prizm-cdn.example.com/videos/desmos-linear-equations.mp4',
    tags: ['technology', 'graphing', 'tutorial'],
    alignedStandards: ['CCSS.MATH.CONTENT.8.F.A.3'],
    alignedOutcomes: ['maths.algebra.linear-two-step', 'maths.algebra.graphing'],
    uploadedBy: 'tech-coach@school.edu',
    uploadedAt: '2025-10-05T11:30:00Z',
    viewCount: 278,
    rating: 4.6,
  },
  {
    id: 'PRIZM-006',
    title: 'Quadratic Functions Podcast Episode',
    description: 'Audio lesson exploring the history and applications of quadratic functions',
    topic: 'Quadratic functions',
    category: 'Audio',
    mediaType: 'audio/mpeg',
    difficulty: 'Stretch',
    duration: 1200, // seconds
    fileSize: 28000000, // bytes
    thumbnailUrl: 'https://via.placeholder.com/400x225/0891B2/FFFFFF?text=Quadratics+Podcast',
    contentUrl: 'https://mock-prizm-cdn.example.com/audio/quadratic-functions-ep12.mp3',
    tags: ['audio', 'history', 'applications'],
    alignedStandards: ['CCSS.MATH.CONTENT.HSF.IF.C.8'],
    alignedOutcomes: ['maths.algebra.quadratic-forms'],
    uploadedBy: 'teacher3@school.edu',
    uploadedAt: '2025-09-28T08:00:00Z',
    viewCount: 94,
    rating: 4.3,
  },
  {
    id: 'PRIZM-007',
    title: 'Parabola Transformations - Interactive Simulator',
    description: 'Interactive tool for exploring vertex form transformations of parabolas',
    topic: 'Quadratic functions',
    category: 'Interactive',
    mediaType: 'application/html',
    difficulty: 'Stretch',
    duration: 1200, // seconds
    fileSize: 3200000, // bytes
    thumbnailUrl: 'https://via.placeholder.com/400x225/DB2777/FFFFFF?text=Parabola+Simulator',
    contentUrl: 'https://mock-prizm-cdn.example.com/interactive/parabola-transformations/index.html',
    tags: ['interactive', 'transformations', 'graphing'],
    alignedStandards: ['CCSS.MATH.CONTENT.HSF.BF.B.3'],
    alignedOutcomes: ['maths.algebra.quadratic-forms', 'maths.algebra.transformations'],
    uploadedBy: 'math-dept@school.edu',
    uploadedAt: '2025-10-08T13:20:00Z',
    viewCount: 203,
    rating: 4.9,
  },
  {
    id: 'PRIZM-008',
    title: 'Geometric Transformations Animation Series',
    description: 'Series of short animations demonstrating rotations, reflections, and translations',
    topic: 'Transformations and congruence',
    category: 'Video',
    mediaType: 'video/mp4',
    difficulty: 'Core',
    duration: 600, // seconds
    fileSize: 150000000, // bytes
    thumbnailUrl: 'https://via.placeholder.com/400x225/16A34A/FFFFFF?text=Transformations+Video',
    contentUrl: 'https://mock-prizm-cdn.example.com/videos/geometric-transformations-series.mp4',
    tags: ['animations', 'geometry', 'visual'],
    alignedStandards: ['CCSS.MATH.CONTENT.8.G.A.1'],
    alignedOutcomes: ['maths.geometry.transformations', 'maths.geometry.congruence'],
    uploadedBy: 'admin@school.edu',
    uploadedAt: '2025-09-25T10:00:00Z',
    viewCount: 312,
    rating: 4.7,
  },
  {
    id: 'PRIZM-009',
    title: 'Coordinate Plane Practice - Interactive Grid',
    description: 'Interactive coordinate plane for practicing transformations with immediate feedback',
    topic: 'Transformations and congruence',
    category: 'Interactive',
    mediaType: 'application/html',
    difficulty: 'Core',
    duration: 900, // seconds
    fileSize: 1800000, // bytes
    thumbnailUrl: 'https://via.placeholder.com/400x225/65A30D/FFFFFF?text=Coordinate+Grid',
    contentUrl: 'https://mock-prizm-cdn.example.com/interactive/coordinate-transformations/index.html',
    tags: ['interactive', 'practice', 'feedback'],
    alignedStandards: ['CCSS.MATH.CONTENT.8.G.A.3'],
    alignedOutcomes: ['maths.geometry.transformations', 'maths.geometry.coordinates'],
    uploadedBy: 'teacher1@school.edu',
    uploadedAt: '2025-10-01T15:30:00Z',
    viewCount: 267,
    rating: 4.8,
  },
  {
    id: 'PRIZM-010',
    title: 'Probability Simulation Lab',
    description: 'Interactive probability simulator for running experiments and analyzing outcomes',
    topic: 'Probability and inference',
    category: 'Interactive',
    mediaType: 'application/html',
    difficulty: 'Stretch',
    duration: 1500, // seconds
    fileSize: 4200000, // bytes
    thumbnailUrl: 'https://via.placeholder.com/400x225/C026D3/FFFFFF?text=Probability+Lab',
    contentUrl: 'https://mock-prizm-cdn.example.com/interactive/probability-simulator/index.html',
    tags: ['simulation', 'statistics', 'experiments'],
    alignedStandards: ['CCSS.MATH.CONTENT.7.SP.C.8'],
    alignedOutcomes: ['maths.statistics.inference', 'maths.statistics.probability'],
    uploadedBy: 'teacher2@school.edu',
    uploadedAt: '2025-10-10T09:45:00Z',
    viewCount: 178,
    rating: 4.6,
  },
  {
    id: 'PRIZM-011',
    title: 'Statistical Inference Case Studies PDF',
    description: 'Collection of real-world case studies with statistical analysis',
    topic: 'Probability and inference',
    category: 'Document',
    mediaType: 'application/pdf',
    difficulty: 'Stretch',
    duration: 2100, // seconds
    fileSize: 12000000, // bytes
    thumbnailUrl: 'https://via.placeholder.com/400x225/0D9488/FFFFFF?text=Case+Studies+PDF',
    contentUrl: 'https://mock-prizm-cdn.example.com/documents/inference-case-studies.pdf',
    tags: ['case-studies', 'real-world', 'analysis'],
    alignedStandards: ['CCSS.MATH.CONTENT.HSS.IC.A.1'],
    alignedOutcomes: ['maths.statistics.inference', 'maths.statistics.analysis'],
    uploadedBy: 'admin@school.edu',
    uploadedAt: '2025-09-18T14:00:00Z',
    viewCount: 145,
    rating: 4.5,
  },
  {
    id: 'PRIZM-012',
    title: 'Math Mindset - Growth and Challenge',
    description: 'Motivational video about developing a growth mindset in mathematics',
    topic: 'General',
    category: 'Video',
    mediaType: 'video/mp4',
    difficulty: 'Foundation',
    duration: 360, // seconds
    fileSize: 90000000, // bytes
    thumbnailUrl: 'https://via.placeholder.com/400x225/F59E0B/FFFFFF?text=Growth+Mindset',
    contentUrl: 'https://mock-prizm-cdn.example.com/videos/math-mindset.mp4',
    tags: ['mindset', 'motivation', 'growth'],
    alignedStandards: [],
    alignedOutcomes: ['maths.general.mindset'],
    uploadedBy: 'counselor@school.edu',
    uploadedAt: '2025-09-10T12:00:00Z',
    viewCount: 567,
    rating: 4.9,
  },
];

// PRIZM content categories for filtering
const prizmCategories = ['All', 'Video', 'Interactive', 'Document', 'Image', 'Audio'];

// Helper functions for PRIZM repository
function getPrizmContent(filters = {}) {
  let filtered = [...prizmContentRepository];

  if (filters.topic && filters.topic !== 'All') {
    filtered = filtered.filter(item => item.topic === filters.topic);
  }

  if (filters.category && filters.category !== 'All') {
    filtered = filtered.filter(item => item.category === filters.category);
  }

  if (filters.difficulty && filters.difficulty !== 'All') {
    filtered = filtered.filter(item => item.difficulty === filters.difficulty);
  }

  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter(item =>
      item.title.toLowerCase().includes(searchLower) ||
      item.description.toLowerCase().includes(searchLower) ||
      item.tags.some(tag => tag.toLowerCase().includes(searchLower))
    );
  }

  return filtered;
}

function getPrizmContentById(id) {
  return prizmContentRepository.find(item => item.id === id);
}

function buildPgRestHeaders() {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (PG_REST_API_KEY) {
    headers[PG_REST_AUTH_HEADER] = PG_REST_AUTH_SCHEME ? `${PG_REST_AUTH_SCHEME} ${PG_REST_API_KEY}` : PG_REST_API_KEY;
  }
  return headers;
}

async function pgRestRequest(pathname, { method = 'GET', query = '', body } = {}) {
  if (!PG_REST_URL) {
    throw new Error('PG_REST_URL is required to persist iSAMS report cycles');
  }
  const url = `${PG_REST_URL.replace(/\/$/, '')}/${pathname}${query}`;
  const options = { method, headers: buildPgRestHeaders() };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PostgREST error ${response.status}: ${text}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function resolveS3UploadUrl(snapshotKey) {
  if (S3_PRESIGNED_URL_TEMPLATE) {
    return S3_PRESIGNED_URL_TEMPLATE.replace('{key}', encodeURIComponent(snapshotKey));
  }
  return S3_PRESIGNED_URL || null;
}

function buildIsamsHeaders() {
  const headers = { Accept: 'application/json' };
  if (ISAMS_API_KEY) {
    headers[ISAMS_AUTH_HEADER] = ISAMS_AUTH_SCHEME ? `${ISAMS_AUTH_SCHEME} ${ISAMS_API_KEY}` : ISAMS_API_KEY;
  }
  return headers;
}

function normalizeReportCycles(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload?.reportCycles && Array.isArray(payload.reportCycles)) return payload.reportCycles;
  if (payload?.data && Array.isArray(payload.data)) return payload.data;
  if (payload?.items && Array.isArray(payload.items)) return payload.items;
  if (payload?.value && Array.isArray(payload.value)) return payload.value;
  return [];
}

function coerceDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function mapReportCycle(cycle, fallbackId) {
  const id =
    cycle?.reportCycleId ??
    cycle?.reportCycleID ??
    cycle?.cycleId ??
    cycle?.cycleID ??
    cycle?.id ??
    fallbackId;
  return {
    id: String(id),
    name: cycle?.name ?? cycle?.title ?? cycle?.description ?? null,
    startDate: coerceDate(cycle?.startDate ?? cycle?.start ?? cycle?.start_date ?? cycle?.openDate),
    endDate: coerceDate(cycle?.endDate ?? cycle?.end ?? cycle?.end_date ?? cycle?.closeDate),
    academicYear: cycle?.academicYear ?? cycle?.year ?? cycle?.schoolYear ?? null,
    status: cycle?.status ?? cycle?.state ?? null,
    raw: cycle,
  };
}

async function fetchIsamsReportCycles() {
  if (!ISAMS_BASE_URL) {
    throw new Error('ISAMS_BASE_URL is not configured');
  }
  const requestUrl = new URL(ISAMS_REPORT_CYCLES_PATH, ISAMS_BASE_URL).toString();
  const response = await fetch(requestUrl, { headers: buildIsamsHeaders() });
  if (!response.ok) {
    throw new Error(`iSAMS API error ${response.status}`);
  }
  const payload = await response.json();
  const cycles = normalizeReportCycles(payload);
  return { requestUrl, payload, cycles };
}

async function storeReportCycleSnapshot({ schoolId, cycles, payload, requestUrl }) {
  if (!PG_REST_URL) {
    throw new Error('PG_REST_URL is required to persist iSAMS report cycles');
  }
  if (!resolveS3UploadUrl('sample')) {
    throw new Error('S3_PRESIGNED_URL or S3_PRESIGNED_URL_TEMPLATE is required to store raw iSAMS responses');
  }

  const batchId = randomUUID();
  const snapshotKey = `isams/report-cycles/${new Date().toISOString().replace(/[:.]/g, '-')}-${batchId}.json`;
  const body = JSON.stringify(payload, null, 2);
  const uploadUrl = resolveS3UploadUrl(snapshotKey);

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    throw new Error(`S3 upload failed ${uploadResponse.status}: ${text}`);
  }

  await pgRestRequest('isams_report_cycle_batches', {
    method: 'POST',
    body: {
      id: batchId,
      school_id: schoolId || null,
      fetched_at: new Date().toISOString(),
      s3_key: snapshotKey,
      record_count: cycles.length,
      request_url: requestUrl,
    },
  });

  const mappedCycles = cycles.map((cycle) => {
    const mapped = mapReportCycle(cycle, randomUUID());
    return {
      id: mapped.id,
      name: mapped.name,
      start_date: mapped.startDate,
      end_date: mapped.endDate,
      academic_year: mapped.academicYear,
      school_id: schoolId || null,
      status: mapped.status,
      raw: mapped.raw ?? {},
      synced_at: new Date().toISOString(),
    };
  });

  if (mappedCycles.length) {
    const upsertResponse = await fetch(`${PG_REST_URL.replace(/\/$/, '')}/isams_report_cycles?on_conflict=id`, {
      method: 'POST',
      headers: { ...buildPgRestHeaders(), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(mappedCycles),
    });
    if (!upsertResponse.ok) {
      const text = await upsertResponse.text();
      throw new Error(`PostgREST upsert error ${upsertResponse.status}: ${text}`);
    }
  }

  return {
    batchId,
    s3Key: snapshotKey,
    recordCount: cycles.length,
  };
}

function findTopicByWeek(weekNumber) {
  for (const semester of schemeOfWork.semesters) {
    const week = semester.weeks.find(entry => entry.week === weekNumber);
    if (week) {
      return { ...week, semester: semester.name, focus: semester.focus };
    }
  }
  return null;
}

function buildStandardRecommendationRequest({ learnerId, weekNumber, topicOverride, maxTotalTimeMinutes = 30 }) {
  const learner = learners.find(l => l.id === learnerId) || null;
  const calendar = findTopicByWeek(weekNumber) || { week: weekNumber, topic: topicOverride || 'Unspecified' };
  const topic = topicOverride || calendar.topic;
  const performance = learnerPerformance[learnerId] || { mastery: [], recentActivity: {} };
  const catalogue = contentResources.map(resource => ({
    contentId: resource.id,
    topic: resource.topic,
    difficulty: resource.difficulty,
    lengthMinutes: resource.lengthMinutes,
    type: resource.type,
    title: resource.title,
    alignedOutcomes: resource.alignedOutcomes || [],
  }));

  return {
    requestId: randomUUID(),
    apiVersion: '2025-02-01',
    timestampUtc: new Date().toISOString(),
    learner: learner
      ? { id: learner.id, cohort: learner.cohort, status: learner.status, email: learner.email }
      : { id: learnerId, cohort: null, status: 'Unknown' },
    performanceSnapshot: performance,
    calendar: {
      academicYear: schemeOfWork.academicYear,
      weekNumber,
      topic,
      semester: calendar.semester || 'Unmapped',
    },
    contentCatalogue: catalogue,
    constraints: {
      maxTotalTimeMinutes,
      targetTopic: topic,
    },
  };
}

function calendarAwareRecommendation({ learnerId, weekNumber, topicOverride, maxTotalTimeMinutes = 30 }) {
  const requestPayload = buildStandardRecommendationRequest({ learnerId, weekNumber, topicOverride, maxTotalTimeMinutes });
  const { performanceSnapshot, calendar, contentCatalogue } = requestPayload;
  const topic = calendar.topic;
  const weakOutcomes = new Set(
    (performanceSnapshot.mastery || [])
      .filter(entry => entry.proficiency !== undefined && entry.proficiency < 0.7)
      .map(entry => entry.outcomeId)
  );

  const candidates = contentCatalogue
    .filter(resource => resource.topic.toLowerCase().includes((topic || '').toLowerCase()))
    .sort((a, b) => (weakOutcomes.size && a.alignedOutcomes.some(o => weakOutcomes.has(o)) ? -1 : 0) - (weakOutcomes.size && b.alignedOutcomes.some(o => weakOutcomes.has(o)) ? -1 : 0));

  const tasks = [];
  let total = 0;
  for (const resource of candidates.length ? candidates : contentCatalogue) {
    const nextTotal = total + resource.lengthMinutes;
    tasks.push({
      sequence: tasks.length + 1,
      contentId: resource.contentId,
      taskText: `Study: ${resource.title} (${resource.type}, ${resource.lengthMinutes} mins, ${resource.difficulty})`,
      estimatedTimeMinutes: resource.lengthMinutes,
      difficulty: resource.difficulty,
      alignedOutcomes: resource.alignedOutcomes,
      topic: resource.topic,
    });
    total = nextTotal;
    if (total >= maxTotalTimeMinutes) break;
  }

  return {
    requestId: requestPayload.requestId,
    modelVersion: 'calendar-rule-based-v1',
    generatedAt: new Date().toISOString(),
    inputs: requestPayload,
    homeworkRecommendation: {
      homeworkId: randomUUID(),
      title: `Week ${calendar.weekNumber}: ${topic}`,
      topic,
      weekNumber: calendar.weekNumber,
      estimatedTotalTimeMinutes: total,
      tasks,
    },
    explanations: {
      global: `Selected tasks for week ${calendar.weekNumber} on ${topic}, prioritizing outcomes with lower proficiency where available.`,
      notes: tasks.length ? [] : ['No tasks matched the requested week/topic, so no tasks were generated.'],
    },
  };
}

function buildRecommendationRequest({ learnerId, topic, maxTotalTimeMinutes, difficultyProfile, explain }) {
  const learner = learners.find(l => l.id === learnerId) || null;
  const topicResources = contentResources.filter(r =>
    topic ? r.topic.toLowerCase().includes(topic.toLowerCase()) : true
  );

  return {
    requestId: randomUUID(),
    apiVersion: '2025-01-01',
    learner: learner
      ? {
          learnerId: learner.id,
          cohort: learner.cohort,
          status: learner.status,
        }
      : {
          learnerId,
          cohort: null,
          status: 'Unknown',
        },
    context: {
      topic,
      maxTotalTimeMinutes,
      difficultyProfile,
    },
    contentCatalogue: topicResources.map(r => ({
      contentId: r.id,
      topic: r.topic,
      difficulty: r.difficulty,
      lengthMinutes: r.lengthMinutes,
      type: r.type,
      title: r.title,
    })),
    explain: Boolean(explain),
  };
}

function ruleBasedRecommendation({ learnerId, topic, maxTotalTimeMinutes, difficultyProfile, explain }) {
  const requestId = randomUUID();
  const homeworkId = randomUUID();
  const matches = contentResources.filter(resource =>
    topic ? resource.topic.toLowerCase().includes(topic.toLowerCase()) : true
  );

  const pool = matches.length ? matches : contentResources;
  const tasks = [];
  let total = 0;

  for (const resource of pool) {
    if (tasks.length && total >= maxTotalTimeMinutes * 0.8) {
      break;
    }
    tasks.push({
      sequence: tasks.length + 1,
      contentId: resource.id,
      taskText: `Complete "${resource.title}" (${resource.lengthMinutes} minutes, ${resource.difficulty})`,
      estimatedTimeMinutes: resource.lengthMinutes,
      difficulty: resource.difficulty,
    });
    total += resource.lengthMinutes;
    if (total >= maxTotalTimeMinutes) {
      break;
    }
  }

  const explanationNotes = [];
  if (!RECOMMENDER_API_URL) {
    explanationNotes.push('Fell back to rule-based logic because RECOMMENDER_API_URL is not configured.');
  }
  if (!tasks.length) {
    explanationNotes.push('No matching resources were found for the requested topic.');
  }

  return {
    requestId,
    modelVersion: 'rule-based-v1',
    homework: {
      homeworkId,
      title: `Auto-generated homework for ${topic}`,
      description: `Automatically generated set of tasks for ${topic}.`,
      estimatedTotalTimeMinutes: total,
      targetDifficultyProfile: difficultyProfile,
      explain: Boolean(explain),
      tasks,
    },
    explanations: {
      global: `Selected up to ${maxTotalTimeMinutes} minutes of content matching the requested topic and difficulty profile.`,
      notes: explanationNotes,
      learnerId,
    },
  };
}

async function callExternalRecommender(payload) {
  if (!RECOMMENDER_API_URL) return null;

  const headers = { 'Content-Type': 'application/json' };
  if (RECOMMENDER_API_KEY) {
    headers.Authorization = `Bearer ${RECOMMENDER_API_KEY}`;
  }

  const response = await fetch(RECOMMENDER_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Recommender HTTP ${response.status}`);
  }

  return response.json();
}

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(payload));
}

function getSchoolById(id) {
  return schools.find((school) => school.id === id) || null;
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) {
        req.connection.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

function sendHtml(res, filePath) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(filePath);
}

async function serveStatic(req, res) {
  const urlPath = req.url.split('?')[0];
  let filePath = urlPath === '/' ? '/index.html' : urlPath;
  filePath = path.normalize(filePath).replace(/^\.\//, '');
  const fullPath = path.join(PUBLIC_DIR, filePath);
  try {
    const fileStat = await stat(fullPath);
    if (fileStat.isDirectory()) {
      return notFound(res);
    }
    const content = await readFile(fullPath);
    const ext = path.extname(fullPath);
    const contentType =
      ext === '.html'
        ? 'text/html; charset=utf-8'
        : ext === '.css'
        ? 'text/css'
        : ext === '.js'
        ? 'application/javascript'
        : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
    return true;
  } catch (err) {
    return false;
  }
}

function resolveBaseUrl(req) {
  const host = req.headers.host || `localhost:${PORT}`;
  const fallback = host.startsWith('localhost') ? `http://${host}` : `https://${host}`;
  let candidate = ENV_BASE_URL || '';

  if (candidate && !/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const chosen = candidate || fallback;
    return new URL(chosen).origin;
  } catch (err) {
    return fallback;
  }
}

function createAssignment(payload, baseUrl) {
  const id = randomUUID();
  const { title, description, tasks = [], students = [], groups = [], ltiReturnUrl, schoolId, prizmContent = [] } = payload;
  const school = getSchoolById(schoolId);
  if (!school) {
    throw new Error('schoolId is required and must match a configured school');
  }
  const normalizedTasks = tasks.filter(Boolean).map(task => task.trim()).filter(Boolean);

  // Process PRIZM content - store references with full metadata
  const prizmContentItems = prizmContent
    .map(contentId => {
      const content = getPrizmContentById(contentId);
      if (content) {
        return {
          id: content.id,
          title: content.title,
          category: content.category,
          mediaType: content.mediaType,
          thumbnailUrl: content.thumbnailUrl,
          contentUrl: content.contentUrl,
          duration: content.duration,
        };
      }
      return null;
    })
    .filter(Boolean);

  const assignment = {
    id,
    title: title || 'Untitled assignment',
    description: description || '',
    tasks: normalizedTasks,
    students: students.map(String),
    groups: groups.map(String),
    prizmContent: prizmContentItems, // Include PRIZM content in assignment
    createdAt: new Date().toISOString(),
    schoolId: school.id,
    schoolName: school.name,
  };

  assignments.set(id, assignment);

  const studentLaunchLink = `${baseUrl}/student.html?assignmentId=${id}&schoolId=${encodeURIComponent(school.id)}`;
  const teacherLink = `${baseUrl}/teacher.html?assignmentId=${id}&schoolId=${encodeURIComponent(school.id)}`;
  const deepLink = ltiReturnUrl
    ? `${ltiReturnUrl}${ltiReturnUrl.includes('?') ? '&' : '?'}launch_url=${encodeURIComponent(studentLaunchLink)}`
    : null;

  return { assignment, studentLaunchLink, teacherLink, deepLink }; // deepLink acts as placeholder LTI deep link return
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  const baseUrl = resolveBaseUrl(req);
  const url = new URL(req.url, baseUrl);
  const baseHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...baseHeaders });
    return res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
  }

  if (req.method === 'POST' && url.pathname === '/api/integrations/isams/report-cycles/sync') {
    try {
      const body = await parseBody(req);
      const schoolId = body.schoolId || null;
      const { requestUrl, payload, cycles } = await fetchIsamsReportCycles();
      const stored = await storeReportCycleSnapshot({ schoolId, cycles, payload, requestUrl });
      return sendJson(
        res,
        200,
        {
          syncedAt: new Date().toISOString(),
          requestUrl,
          schoolId,
          recordCount: cycles.length,
          storage: stored,
        },
        baseHeaders
      );
    } catch (err) {
      console.error('Error syncing iSAMS report cycles:', err);
      return sendJson(res, 500, { error: err.message }, baseHeaders);
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/integrations/isams/report-cycles') {
    try {
      const schoolId = url.searchParams.get('schoolId');
      const limit = Number(url.searchParams.get('limit') || 100);
      const query = new URLSearchParams();
      query.set('select', 'id,name,start_date,end_date,academic_year,school_id,status,synced_at');
      query.set('order', 'synced_at.desc');
      query.set('limit', String(limit));
      if (schoolId) {
        query.set('school_id', `eq.${schoolId}`);
      }
      const data = await pgRestRequest(`isams_report_cycles?${query.toString()}`);
      return sendJson(res, 200, { reportCycles: data || [] }, baseHeaders);
    } catch (err) {
      console.error('Error loading iSAMS report cycles:', err);
      return sendJson(res, 500, { error: err.message }, baseHeaders);
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/schools') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...baseHeaders });
    return res.end(JSON.stringify({ schools }));
  }

  if (req.method === 'GET' && url.pathname === '/api/learners') {
    const schoolId = url.searchParams.get('schoolId');
    const filtered = schoolId ? learners.filter((learner) => learner.schoolId === schoolId) : learners;
    res.writeHead(200, { 'Content-Type': 'application/json', ...baseHeaders });
    return res.end(JSON.stringify({ learners: filtered }));
  }

  if (req.method === 'GET' && url.pathname === '/api/scheme-of-work') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...baseHeaders });
    return res.end(JSON.stringify({ schemeOfWork }));
  }

  if (req.method === 'GET' && url.pathname === '/api/content-resources') {
    const topic = url.searchParams.get('topic');
    const filtered = topic
      ? contentResources.filter(resource => resource.topic.toLowerCase().includes(topic.toLowerCase()))
      : contentResources;
    res.writeHead(200, { 'Content-Type': 'application/json', ...baseHeaders });
    return res.end(JSON.stringify({ resources: filtered }));
  }

  // PRIZM Content Repository API endpoints
  if (req.method === 'GET' && url.pathname === '/api/prizm/content') {
    const filters = {
      topic: url.searchParams.get('topic'),
      category: url.searchParams.get('category'),
      difficulty: url.searchParams.get('difficulty'),
      search: url.searchParams.get('search'),
    };
    const content = getPrizmContent(filters);
    res.writeHead(200, { 'Content-Type': 'application/json', ...baseHeaders });
    return res.end(JSON.stringify({ content, total: content.length }));
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/prizm/content/')) {
    const id = url.pathname.split('/').pop();
    const content = getPrizmContentById(id);
    if (!content) {
      return sendJson(res, 404, { error: 'Content not found' }, baseHeaders);
    }
    res.writeHead(200, { 'Content-Type': 'application/json', ...baseHeaders });
    return res.end(JSON.stringify({ content }));
  }

  if (req.method === 'GET' && url.pathname === '/api/prizm/categories') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...baseHeaders });
    return res.end(JSON.stringify({ categories: prizmCategories }));
  }

  if (req.method === 'POST' && url.pathname === '/api/recommend-homework') {
    try {
      const body = await parseBody(req);
      const {
        learnerId,
        topic,
        maxTotalTimeMinutes = 30,
        difficultyProfile = { Foundation: 0.3, Core: 0.5, Stretch: 0.2 },
        explain = false,
      } = body || {};

      if (!learnerId || !topic) {
        return sendJson(res, 400, { error: 'learnerId and topic are required' }, baseHeaders);
      }

      const recommendationRequest = buildRecommendationRequest({
        learnerId,
        topic,
        maxTotalTimeMinutes,
        difficultyProfile,
        explain,
      });

      let result = null;
      try {
        const external = await callExternalRecommender(recommendationRequest);
        if (external) {
          result = external;
        }
      } catch (err) {
        console.error('External recommender failed:', err.message);
      }

      if (!result) {
        result = ruleBasedRecommendation({
          learnerId,
          topic,
          maxTotalTimeMinutes,
          difficultyProfile,
          explain,
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json', ...baseHeaders });
      return res.end(JSON.stringify(result));
    } catch (err) {
      console.error('Error in /api/recommend-homework:', err);
      return sendJson(res, 500, { error: 'Failed to generate recommendation' }, baseHeaders);
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/recommendations/calendar-aware') {
    try {
      const body = await parseBody(req);
      const { learnerId, weekNumber = 1, topic, maxTotalTimeMinutes = 30 } = body || {};

      if (!learnerId) {
        return sendJson(res, 400, { error: 'learnerId is required' }, baseHeaders);
      }

      const recommendation = calendarAwareRecommendation({
        learnerId,
        weekNumber: Number(weekNumber) || 1,
        topicOverride: topic,
        maxTotalTimeMinutes: Number(maxTotalTimeMinutes) || 30,
      });

      return sendJson(res, 200, recommendation, baseHeaders);
    } catch (err) {
      console.error('Error in /api/recommendations/calendar-aware:', err);
      return sendJson(res, 500, { error: 'Failed to generate calendar-aware recommendation' }, baseHeaders);
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/assignments') {
    try {
      const payload = await parseBody(req);
      const { assignment, studentLaunchLink, teacherLink, deepLink } = createAssignment(payload, baseUrl);
      res.writeHead(201, { 'Content-Type': 'application/json', ...baseHeaders });
      return res.end(JSON.stringify({ assignment, studentLaunchLink, teacherLink, deepLink }));
    } catch (err) {
      return sendJson(res, 400, { error: err.message }, baseHeaders);
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/assignments') {
    const schoolId = url.searchParams.get('schoolId');
    const data = Array.from(assignments.values()).filter((assignment) =>
      schoolId ? assignment.schoolId === schoolId : true
    );
    res.writeHead(200, { 'Content-Type': 'application/json', ...baseHeaders });
    return res.end(JSON.stringify({ assignments: data }));
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/assignments/')) {
    const id = url.pathname.split('/')[3];
    const assignment = assignments.get(id);
    const requestedSchoolId = url.searchParams.get('schoolId');
    if (!assignment) return notFound(res);
    if (!requestedSchoolId) {
      return sendJson(res, 400, { error: 'schoolId is required to open this assignment' }, baseHeaders);
    }
    if (assignment.schoolId !== requestedSchoolId) {
      return sendJson(res, 403, { error: 'This assignment is not available for the requested school.' }, baseHeaders);
    }
    res.writeHead(200, { 'Content-Type': 'application/json', ...baseHeaders });
    return res.end(
      JSON.stringify({ assignment, launchUrl: `${baseUrl}/student.html?assignmentId=${id}&schoolId=${encodeURIComponent(requestedSchoolId)}` })
    );
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/lti/deep-link/')) {
    const id = url.pathname.split('/')[4];
    const assignment = assignments.get(id);
    if (!assignment) return notFound(res);
    try {
      const payload = await parseBody(req);
      const returnUrl = payload.returnUrl;
      const launchUrl = `${baseUrl}/student.html?assignmentId=${id}`;
      const link = returnUrl
        ? `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}launch_url=${encodeURIComponent(launchUrl)}`
        : launchUrl;
      res.writeHead(200, { 'Content-Type': 'application/json', ...baseHeaders });
      return res.end(
        JSON.stringify({
          assignment,
          posted: Boolean(returnUrl),
          launchUrl,
          ltiDeepLink: link,
          note: 'In production, sign the deep-linking response using your LTI 1.3 keys.',
        })
      );
    } catch (err) {
      return sendJson(res, 400, { error: err.message }, baseHeaders);
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/lti/launch') {
    try {
      const payload = await parseBody(req);
      const role = payload.role || 'Learner';
      const assignmentId = payload.assignmentId;
      const assignment = assignmentId ? assignments.get(assignmentId) : null;
      res.writeHead(200, { 'Content-Type': 'application/json', ...baseHeaders });
      return res.end(
        JSON.stringify({
          message: 'Simulated LTI 1.3 launch.',
          role,
          assignment,
          launchTarget: role.toLowerCase().includes('teacher') ? `${baseUrl}/teacher.html` : `${baseUrl}/student.html`,
          note: 'Replace with real OIDC login + JWT validation in production.',
        })
      );
    } catch (err) {
      return sendJson(res, 400, { error: err.message }, baseHeaders);
    }
  }

  const served = await serveStatic(req, res);
  if (!served) {
    notFound(res);
  }
});

server.listen(PORT, () => {
  const defaultOrigin = ENV_BASE_URL || `http://localhost:${PORT}`;
  console.log(`InspiredHomeworkPoC server running. Base origin: ${defaultOrigin}`);
});

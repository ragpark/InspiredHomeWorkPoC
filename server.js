import http from 'http';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const ENV_BASE_URL = process.env.BASE_URL;
const RECOMMENDER_API_URL = process.env.RECOMMENDER_API_URL || '';
const RECOMMENDER_API_KEY = process.env.RECOMMENDER_API_KEY || '';
const DATABASE_URL = process.env.DATABASE_URL || '';
const ISAMS_BASE_URL = process.env.ISAMS_BASE_URL || '';
const ISAMS_REPORT_CYCLES_PATH = process.env.ISAMS_REPORT_CYCLES_PATH || '/api/batch/schoolreports/reportcycles';
const ISAMS_API_KEY = process.env.ISAMS_API_KEY || '';
const ISAMS_AUTH_HEADER = process.env.ISAMS_AUTH_HEADER || 'Authorization';
const ISAMS_AUTH_SCHEME = process.env.ISAMS_AUTH_SCHEME || 'Bearer';
const S3_BUCKET = process.env.S3_BUCKET || '';
const S3_REGION = process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1';
const S3_ENDPOINT = process.env.S3_ENDPOINT || '';
const S3_FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === 'true';
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

let pgPool = null;
let pgReady = false;
let s3Client = null;

function getPgPool() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }
  if (!pgPool) {
    pgPool = new Pool({ connectionString: DATABASE_URL, ssl: DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined });
  }
  return pgPool;
}

async function ensureIsamsTables() {
  if (pgReady) return;
  const pool = getPgPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS isams_report_cycles (
      id text PRIMARY KEY,
      name text,
      start_date date,
      end_date date,
      academic_year text,
      school_id text,
      status text,
      raw jsonb,
      synced_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS isams_report_cycle_batches (
      id uuid PRIMARY KEY,
      school_id text,
      fetched_at timestamptz NOT NULL DEFAULT now(),
      s3_bucket text,
      s3_key text,
      record_count integer,
      request_url text
    );
  `);
  pgReady = true;
}

function getS3Client() {
  if (!s3Client) {
    const config = { region: S3_REGION };
    if (S3_ENDPOINT) {
      config.endpoint = S3_ENDPOINT;
    }
    if (S3_FORCE_PATH_STYLE) {
      config.forcePathStyle = true;
    }
    s3Client = new S3Client(config);
  }
  return s3Client;
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
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required to persist iSAMS report cycles');
  }
  if (!S3_BUCKET) {
    throw new Error('S3_BUCKET is required to store raw iSAMS responses');
  }

  await ensureIsamsTables();
  const pool = getPgPool();
  const batchId = randomUUID();
  const snapshotKey = `isams/report-cycles/${new Date().toISOString().replace(/[:.]/g, '-')}-${batchId}.json`;
  const body = JSON.stringify(payload, null, 2);

  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: snapshotKey,
      Body: body,
      ContentType: 'application/json',
    })
  );

  await pool.query(
    `
      INSERT INTO isams_report_cycle_batches (id, school_id, fetched_at, s3_bucket, s3_key, record_count, request_url)
      VALUES ($1, $2, now(), $3, $4, $5, $6)
    `,
    [batchId, schoolId || null, S3_BUCKET, snapshotKey, cycles.length, requestUrl]
  );

  const upsertSql = `
    INSERT INTO isams_report_cycles
      (id, name, start_date, end_date, academic_year, school_id, status, raw, synced_at)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, now())
    ON CONFLICT (id)
    DO UPDATE SET
      name = EXCLUDED.name,
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      academic_year = EXCLUDED.academic_year,
      school_id = EXCLUDED.school_id,
      status = EXCLUDED.status,
      raw = EXCLUDED.raw,
      synced_at = EXCLUDED.synced_at;
  `;

  for (const cycle of cycles) {
    const mapped = mapReportCycle(cycle, randomUUID());
    await pool.query(upsertSql, [
      mapped.id,
      mapped.name,
      mapped.startDate,
      mapped.endDate,
      mapped.academicYear,
      schoolId || null,
      mapped.status,
      JSON.stringify(mapped.raw ?? {}),
    ]);
  }

  return {
    batchId,
    s3Bucket: S3_BUCKET,
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
  const { title, description, tasks = [], students = [], groups = [], ltiReturnUrl, schoolId } = payload;
  const school = getSchoolById(schoolId);
  if (!school) {
    throw new Error('schoolId is required and must match a configured school');
  }
  const normalizedTasks = tasks.filter(Boolean).map(task => task.trim()).filter(Boolean);
  const assignment = {
    id,
    title: title || 'Untitled assignment',
    description: description || '',
    tasks: normalizedTasks,
    students: students.map(String),
    groups: groups.map(String),
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
      const pool = getPgPool();
      await ensureIsamsTables();
      const schoolId = url.searchParams.get('schoolId');
      const limit = Number(url.searchParams.get('limit') || 100);
      const { rows } = await pool.query(
        `
          SELECT id, name, start_date, end_date, academic_year, school_id, status, synced_at
          FROM isams_report_cycles
          WHERE ($1::text IS NULL OR school_id = $1)
          ORDER BY synced_at DESC
          LIMIT $2
        `,
        [schoolId, limit]
      );
      return sendJson(res, 200, { reportCycles: rows }, baseHeaders);
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

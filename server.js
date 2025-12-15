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
const PUBLIC_DIR = path.join(__dirname, 'public');

const assignments = new Map();
const learners = [
  { id: 'L001', name: 'Ada Lovelace', email: 'ada@example.com', cohort: 'Algebra 2', status: 'Active', quartile: 'Q1' },
  { id: 'L002', name: 'Alan Turing', email: 'alan@example.com', cohort: 'Geometry', status: 'Active', quartile: 'Q2' },
  { id: 'L003', name: 'Katherine Johnson', email: 'katherine@example.com', cohort: 'Algebra 2', status: 'Active', quartile: 'Q3' },
  { id: 'L004', name: 'Maryam Mirzakhani', email: 'maryam@example.com', cohort: 'Calculus', status: 'Active', quartile: 'Q4' },
  { id: 'L005', name: 'Grace Hopper', email: 'grace@example.com', cohort: 'Geometry', status: 'On leave', quartile: 'Q2' },
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
  const { title, description, tasks = [], students = [], groups = [], ltiReturnUrl } = payload;
  const normalizedTasks = tasks.filter(Boolean).map(task => task.trim()).filter(Boolean);
  const assignment = {
    id,
    title: title || 'Untitled assignment',
    description: description || '',
    tasks: normalizedTasks,
    students: students.map(String),
    groups: groups.map(String),
    createdAt: new Date().toISOString(),
  };

  assignments.set(id, assignment);

  const studentLaunchLink = `${baseUrl}/student.html?assignmentId=${id}`;
  const teacherLink = `${baseUrl}/teacher.html?assignmentId=${id}`;
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

  if (req.method === 'GET' && url.pathname === '/api/learners') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...baseHeaders });
    return res.end(JSON.stringify({ learners }));
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
    const data = Array.from(assignments.values());
    res.writeHead(200, { 'Content-Type': 'application/json', ...baseHeaders });
    return res.end(JSON.stringify({ assignments: data }));
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/assignments/')) {
    const id = url.pathname.split('/')[3];
    const assignment = assignments.get(id);
    if (!assignment) return notFound(res);
    res.writeHead(200, { 'Content-Type': 'application/json', ...baseHeaders });
    return res.end(JSON.stringify({ assignment, launchUrl: `${baseUrl}/student.html?assignmentId=${id}` }));
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

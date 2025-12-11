import http from 'http';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const ENV_BASE_URL = process.env.BASE_URL;
const PUBLIC_DIR = path.join(__dirname, 'public');

const assignments = new Map();
const learners = [
  { id: 'L001', name: 'Ada Lovelace', email: 'ada@example.com', cohort: 'Algebra 2', status: 'Active' },
  { id: 'L002', name: 'Alan Turing', email: 'alan@example.com', cohort: 'Geometry', status: 'Active' },
  { id: 'L003', name: 'Katherine Johnson', email: 'katherine@example.com', cohort: 'Algebra 2', status: 'Active' },
  { id: 'L004', name: 'Maryam Mirzakhani', email: 'maryam@example.com', cohort: 'Calculus', status: 'Active' },
  { id: 'L005', name: 'Grace Hopper', email: 'grace@example.com', cohort: 'Geometry', status: 'On leave' },
];

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
  },
  {
    id: 'RES-102',
    topic: 'Ratios and rates',
    difficulty: 'Core',
    lengthMinutes: 20,
    type: 'Assessment',
    title: 'Exit ticket: Rate of change scenarios',
  },
  {
    id: 'RES-201',
    topic: 'Linear equations and inequalities',
    difficulty: 'Core',
    lengthMinutes: 30,
    type: 'Activity',
    title: 'Desmos exploration: balancing equations',
  },
  {
    id: 'RES-202',
    topic: 'Quadratic functions',
    difficulty: 'Stretch',
    lengthMinutes: 40,
    type: 'Book chapter',
    title: 'Vertex form and transformations',
  },
  {
    id: 'RES-301',
    topic: 'Transformations and congruence',
    difficulty: 'Core',
    lengthMinutes: 25,
    type: 'Activity',
    title: 'Rigid motions on the coordinate plane',
  },
  {
    id: 'RES-302',
    topic: 'Probability and inference',
    difficulty: 'Stretch',
    lengthMinutes: 30,
    type: 'Assessment',
    title: 'Project brief: design a simple experiment',
  },
];

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
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

  if (req.method === 'POST' && url.pathname === '/api/assignments') {
    try {
      const payload = await parseBody(req);
      const { assignment, studentLaunchLink, teacherLink, deepLink } = createAssignment(payload, baseUrl);
      res.writeHead(201, { 'Content-Type': 'application/json', ...baseHeaders });
      return res.end(JSON.stringify({ assignment, studentLaunchLink, teacherLink, deepLink }));
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
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
      return sendJson(res, 400, { error: err.message });
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
      return sendJson(res, 400, { error: err.message });
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

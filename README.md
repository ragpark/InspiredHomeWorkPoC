# Inspired Homework PoC

A lightweight proof-of-concept (PoC) LTI 1.3 web app that lets teachers assign homework to students as individuals or groups from within Canvas. After a teacher selects tasks, the app produces a launch link that can be posted back to the LMS so learners can open a student experience.

The project is intentionally dependency-light to run in restricted environments (no external npm downloads are required). It uses a small Node.js HTTP server and static HTML/JS for the UI so it can be deployed quickly to services such as Railway.

## Features

- **Teacher workspace** to define homework, list students and groups, and optionally supply a Canvas deep-link return URL.
- **Student workspace** that launches via the generated link to view assigned tasks.
- **LTI 1.3-friendly endpoints** (login, launch, and deep-link simulation) that you can replace with production-ready signing and validation.
- **In-memory storage** to keep the PoC stateless and simple during demos.

## Architecture overview

```
public/
  index.html       → landing page
  teacher.html     → teacher UI for creating assignments
  student.html     → student view to load a given assignment
  styles.css       → shared styling
server.js          → Node HTTP server, API + static file host
```

### Server responsibilities (`server.js`)
- Serves static assets from `public/` and handles simple CORS for local testing.
- Maintains an in-memory `Map` of assignments using `crypto.randomUUID()` identifiers.
- In-memory data sources for the teacher UI:
  - `GET /api/learners` → learners with `id`, `name`, `email`, `cohort`, `status`.
  - `GET /api/scheme-of-work` → a 3-semester academic year broken into weekly topics.
  - `GET /api/content-resources?topic=` → content aligned to topics, with `type`, `difficulty`, and `lengthMinutes` fields.
- REST-ish JSON endpoints:
  - `POST /api/assignments` creates a new assignment, returning the student launch link and (optionally) a simulated deep link if an LMS return URL is provided.
  - `GET /api/assignments` lists assignments; `GET /api/assignments/:id` retrieves a single item.
  - `POST /api/lti/deep-link/:id` echoes a Canvas return URL with the generated launch URL attached to mimic LTI 1.3 deep linking.
  - `POST /api/lti/launch` stubs the LTI 1.3 launch payload and indicates the correct UI route (teacher vs student).
- Defaults to `PORT` (from Railway) and `BASE_URL` environment variables to build fully-qualified launch links.

### Frontend responsibilities (`public/*.html`)
- **Teacher UI**: captures title, description, tasks (newline separated), targeted students, and groups. It can also:
  - Pick learners from the learner store to append to the assignment.
  - Browse the 3-semester scheme of work by week and topic.
  - Filter content resources by topic and insert them into the task list.
  On save, it displays both the student launch URL and an optional deep-link callback URL suitable for LMS posting.
- **Student UI**: accepts either a full link or an assignment ID, fetches the assignment, and renders tasks with basic metadata.
- Shared CSS delivers a modern card-based layout without external assets.

### Data flow for Canvas launch
1. Canvas initiates an **OIDC login + LTI 1.3 launch** toward `/api/lti/launch` (stubbed in this PoC).
2. Teacher selects tasks via `teacher.html` and saves. The server returns:
   - `studentLaunchLink` → the URL Canvas will embed for students.
   - `deepLink` → if the teacher supplied a Canvas deep-link return URL, the server appends the launch URL to it (a placeholder for a signed deep-link response).
3. Canvas stores and surfaces the launch link to students. When opened, students hit `student.html` with `assignmentId` in the query string and the app renders their tasks.

## Running locally

```bash
npm run start
# or during development
npm run dev
```

The app defaults to `http://localhost:3000`. Use `BASE_URL` if you expose it via a tunnel.

### Environment variables

- `PORT` – provided by Railway; defaults to `3000` locally.
- `BASE_URL` – optional. Set to the public URL of your deployment so generated links work from Canvas (e.g., `https://your-app.up.railway.app`). If you omit the scheme, the server now assumes `https://` and will fall back to the incoming request host to avoid invalid URL errors.

## Deploying to Railway

1. Create a new Railway project and deploy this repository.
2. Set environment variables:
   - `PORT` to `3000` (Railway injects this automatically in most cases).
   - `BASE_URL` to your Railway domain (e.g., `https://your-app.up.railway.app`). If omitted, the server falls back to the request host.
3. Use the `Start Command` `npm run start`.
4. Open the Railway domain and test the flow:
   - Visit `/teacher.html` to browse learners, the scheme of work, and content resources. Build an assignment by selecting learners and injecting content into the task list.
   - (Optional) Provide a Canvas deep-link return URL to mimic posting the launch link back to your course.
   - Launch `/student.html?assignmentId=<id>` to verify the student experience.
5. Update the in-memory data stores in `server.js` if you want to tailor the learners, weekly topics, or content resources for your demo.

## Extending toward production

- Replace the `/api/lti/launch` stub with real OIDC login + JWT verification per IMS Global specs.
- Persist assignments in a database (e.g., Railway Postgres) instead of in-memory storage.
- Sign LTI Deep Link responses using your platform key set (`/api/lti/deep-link/:id`).
- Add user authentication and role checking to scope assignments to instructors.
- Add submission tracking and grading callbacks to complete the LTI Advantage workflow.

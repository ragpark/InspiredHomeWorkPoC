# Inspired Homework PoC

A lightweight proof-of-concept (PoC) LTI 1.3 web app that lets teachers assign homework to students as individuals or groups from within Canvas. After a teacher selects tasks, the app produces a launch link that can be posted back to the LMS so learners can open a student experience.

The project is intentionally dependency-light to run in restricted environments (no external npm downloads are required). It uses a small Node.js HTTP server and static HTML/JS for the UI so it can be deployed quickly to services such as Railway.

## Features

- **Teacher workspace** to define homework, list students and groups, and optionally supply a Canvas deep-link return URL.
- **Student workspace** that launches via the generated link to view assigned tasks.
- **LTI 1.3-friendly endpoints** (login, launch, and deep-link simulation) that you can replace with production-ready signing and validation.
- **In-memory storage** to keep the PoC stateless and simple during demos.
- **Data layer for planning**: learners, a 3-semester scheme of work (weekly topics), and topic-aligned content resources with difficulty, duration, and type.
- **Calendar-aware recommendation API**: combines learner performance snapshots, the academic calendar, and courseware metadata to pre-fill assignments via a standard contract.

## Architecture overview

```
public/
  index.html       → landing page
  teacher.html     → teacher UI for creating assignments & browsing data sources
  student.html     → student view to load a given assignment
  styles.css       → shared styling
server.js          → Node HTTP server, API + static file host
```

### Server responsibilities (`server.js`)
- Serves static assets from `public/` and handles simple CORS for local testing.
- Persists assignments to MongoDB (when configured) and falls back to an in-memory `Map` using `crypto.randomUUID()` identifiers.
- In-memory data sources for the teacher UI:
  - `GET /api/learners` → learners with `id`, `name`, `email`, `cohort`, `status`.
  - `GET /api/scheme-of-work` → a 3-semester academic year broken into weekly topics.
  - `GET /api/content-resources?topic=` → content aligned to topics, with `type`, `difficulty`, and `lengthMinutes` fields.
- REST-ish JSON endpoints:
  - `POST /api/assignments` creates a new assignment, returning the student launch link and (optionally) a simulated deep link if an LMS return URL is provided.
  - `GET /api/assignments` lists assignments; `GET /api/assignments/:id` retrieves a single item.
  - `GET /api/assignments/:id/imscc` downloads an IMS Common Cartridge package (imsmanifest + HTML resources) for the assignment.
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
   - `imsccDownloadUrl` → a download link for the generated IMS Common Cartridge package.
3. Canvas stores and surfaces the launch link to students. When opened, students hit `student.html` with `assignmentId` in the query string and the app renders their tasks.

### Downloading the IMS Common Cartridge (IMSCC)
- In the Teacher Studio flow, once you click **Create Assignment**, the server builds the IMSCC package in the background and returns an `imsccDownloadUrl` alongside the launch links.
- Use that `imsccDownloadUrl` (or call `GET /api/assignments/:id/imscc` directly) to download the `.imscc` file and import it into an LMS.

## Calendar-aware recommendation service

Use `POST /api/recommendations/calendar-aware` to populate the teacher assignment UI with week-aware suggestions that consider learner performance, courseware metadata (difficulty, length, aligned outcomes), and the academic calendar.

**Request contract (JSON)**

```json
{
  "learnerId": "L001",
  "weekNumber": 7,
  "topic": "Linear equations and inequalities",
  "maxTotalTimeMinutes": 30
}
```

- `learnerId` (required): resolves to the in-memory learner plus their performance snapshot.
- `weekNumber`: maps into the 3-semester scheme of work to pull the current topic; `topic` overrides the week topic when provided.
- `maxTotalTimeMinutes`: budget for selected tasks.

**Response contract (JSON)**

```json
{
  "requestId": "...",
  "modelVersion": "calendar-rule-based-v1",
  "generatedAt": "2025-02-01T12:00:00Z",
  "inputs": {
    "learner": { "id": "L001", "cohort": "Algebra 2", "status": "Active" },
    "performanceSnapshot": { "mastery": ["..."] },
    "calendar": { "academicYear": "2024-2025", "weekNumber": 7, "topic": "Linear equations and inequalities" },
    "contentCatalogue": [{ "contentId": "RES-201", "alignedOutcomes": ["maths.algebra.linear-two-step"] }]
  },
  "homeworkRecommendation": {
    "homeworkId": "...",
    "title": "Week 7: Linear equations and inequalities",
    "topic": "Linear equations and inequalities",
    "weekNumber": 7,
    "estimatedTotalTimeMinutes": 30,
    "tasks": [
      {
        "sequence": 1,
        "contentId": "RES-201",
        "taskText": "Study: Desmos exploration: balancing equations (Activity, 30 mins, Core)",
        "estimatedTimeMinutes": 30,
        "difficulty": "Core",
        "alignedOutcomes": ["maths.algebra.linear-two-step"],
        "topic": "Linear equations and inequalities"
      }
    ]
  },
  "explanations": {
    "global": "Selected tasks for week 7 on Linear equations and inequalities, prioritizing outcomes with lower proficiency where available.",
    "notes": []
  }
}
```

**How the teacher UI uses it**

- In `teacher.html`, set a learner, time budget, and calendar week. The **Calendar-aware recommendation** button posts to the endpoint above.
- The response fills the assignment title/description (if empty) and replaces the tasks textarea with recommended tasks. Explanations are shown in the AI rationale panel so you can review or edit before saving.

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

## Railway NoSQL datastore for personalization

If you want to persist learner performance, courseware metadata, and schemes of work in a managed NoSQL service on Railway, follow the data model and provisioning steps in [`docs/railway-nosql.md`](docs/railway-nosql.md).

## Integrating 3rd-party systems with the 360 MongoDB collections

External platforms such as Canvas, Learning Record Stores (LRS), or recommendation engines can push data into the 360-degree learner/profile collections by calling the MongoDB REST endpoints exposed by `server.js`. These endpoints are designed to support upsert semantics so integrations can repeatedly sync without creating duplicates.

### Required environment variables

- `MONGODB_URI` (or `MONGODB_URL` / `MONGO_URL`) – MongoDB connection string.
- `MONGODB_DB` (optional) – database name.
- `MONGODB_PRIZM_COLLECTION` (optional) – collection name for PRIZM content (defaults to `prizmContent`).

If MongoDB is not configured, the same endpoints operate against the in-memory mock collections for demos and local testing.

### Upsert endpoint (recommended for integrations)

Use `POST` or `PUT` to upsert a document into any MongoDB collection:

```
POST /api/mongodb/collections/:collection/upsert
PUT /api/mongodb/collections/:collection/upsert/:id
```

**Request body (JSON)**

```json
{
  "filter": { "externalId": "canvas-assignment-42" },
  "document": {
    "externalId": "canvas-assignment-42",
    "learnerId": "L001",
    "source": "canvas",
    "score": 0.84
  },
  "setOnInsert": {
    "createdAt": "2025-02-01T12:00:00Z"
  }
}
```

- `filter` (required when no `:id` is provided) determines which record to update.
- `document` is merged into the existing record via `$set`.
- `setOnInsert` only applies when the record is created for the first time.

**Response body (JSON)**

```json
{
  "document": { "externalId": "canvas-assignment-42", "learnerId": "L001", "source": "canvas", "score": 0.84 },
  "upserted": true,
  "upsertedId": "65c3c5b6e8b5e7b8d3c1a2f1"
}
```

### Integration tips

- **Canvas LMS**: upsert assignment, submission, or grade-return payloads keyed by Canvas `assignment_id`, `user_id`, or `submission_id`.
- **LRS**: upsert xAPI statements keyed by `statementId` or a composite key from `actor` + `verb` + `object`.
- **Recommendations**: upsert recommendation snapshots keyed by `learnerId` + `generatedAt` to maintain a history of model runs.

### Batch loading

For bulk ingestion, iterate over the external payload and issue parallel upserts per record. This PoC does not include a bulk endpoint, so orchestrate batching in the calling system (e.g., serverless function, ETL job, or LMS webhook handler).

## Extending toward production

- Replace the `/api/lti/launch` stub with real OIDC login + JWT verification per IMS Global specs.
- Persist assignments in a database (e.g., Railway Postgres) instead of in-memory storage.
- Sign LTI Deep Link responses using your platform key set (`/api/lti/deep-link/:id`).
- Add user authentication and role checking to scope assignments to instructors.
- Add submission tracking and grading callbacks to complete the LTI Advantage workflow.

## Taking the PoC to production on AWS

The PoC keeps dependencies and infrastructure minimal. To productionize it on AWS while preserving the contract, you can adopt the following pattern:

1. **Hosting & network entry**
   - Terminate HTTPS and protect the app with **Amazon CloudFront** (WAF rules for rate limiting and IP allow/block lists) in front of an **Application Load Balancer (ALB)** or **API Gateway**.
   - Serve static assets (`public/*`) from **Amazon S3** with CloudFront caching. Point `teacher.html` and `student.html` at your API base URL (API Gateway domain or custom domain on ALB).

2. **Compute & runtime**
   - Lift the Node server into **AWS Fargate (ECS)** behind an ALB for stateful features that need sockets or long-lived processes, or decompose it into **Lambda** functions if you prefer fully serverless endpoints.
   - Externalize environment configuration through **AWS Systems Manager Parameter Store** or **Secrets Manager** for `BASE_URL`, LTI keys, and the AI recommender credentials.

3. **Data & persistence**
   - Replace in-memory stores with managed data services:
     - **Amazon DynamoDB** for assignments, learner profiles, and scheme-of-work records (fast key-value access, point-in-time recovery).
     - **Amazon S3** for any uploaded assets or attachments referenced in tasks.
     - **Amazon RDS/Aurora** if you need relational reporting or joins across roster, grading, and assignment entities.
   - Introduce background jobs (Lambda + EventBridge or Step Functions) to archive old assignments and emit analytics events.

4. **LTI 1.3 and LMS integration**
   - Implement real OIDC login + JWT validation in a dedicated **Lambda authorizer** or an auth service fronted by **API Gateway**; cache keys using **AWS ElastiCache (Redis)** if needed.
   - Store platform and tool key sets (JWKS) in **Secrets Manager** and rotate them automatically.
   - Sign LTI Deep Link responses and Assignment & Grade Services (AGS) calls using your managed keys; emit outcomes asynchronously via **SQS** if the LMS expects async grade return.

5. **AI recommender integration**
   - Host the “black box” model behind **API Gateway + Lambda** or **Amazon Bedrock** (if you use foundation models) and point `RECOMMENDER_API_URL` at that endpoint.
   - Use **Lambda Powertools** or structured logging for traceability with `request_id`, `tenant_id`, and `source_system` fields from the contract. Forward logs to **CloudWatch Logs** and optionally **Amazon OpenSearch Service** for analytics.
   - Apply IAM- or API-key–based auth at the gateway, and enforce per-tenant throttling via usage plans.

6. **Operations, observability, and compliance**
   - Instrument the Node app with **Amazon CloudWatch** metrics (latency, errors, cold starts if using Lambda) and dashboards. Set up **CloudWatch Alarms** and **SNS** notifications for SLA breaches.
   - Enable **AWS WAF** rules on CloudFront/API Gateway for OWASP protections; add **Shield** for DDoS resilience on public endpoints.
   - Capture audit trails (assignment changes, LTI launches) in **CloudTrail** or an append-only DynamoDB table.

7. **CI/CD**
   - Store infrastructure as code in **AWS CDK** or **Terraform** (ECS/Lambda, API Gateway, DynamoDB, S3/CloudFront).
   - Automate builds and deployments with **GitHub Actions** → **AWS CodeDeploy/CodePipeline**, running `npm test` or lightweight checks before publishing container images to **ECR**.

Following this path keeps the public contract stable (`/api/assignments`, `/api/recommend-homework`, LTI endpoints) while swapping in AWS-managed security, data durability, and observability layers suitable for production.

## Multi-tenant Canvas integration and grade return at scale

When you need to serve many Canvas LMS instances without tightly coupling to any single tenant, use a hub-and-spoke pattern with clear separation of concerns:

- **Tenant registry + config service**: Store each Canvas tenant’s platform IDs, JWKS URLs, client IDs, deep-link return URLs, and AGS endpoints in DynamoDB (or Aurora). Expose a config service so runtime components resolve tenant settings by `platform_id` / `tenant_id`, not by code-level switches.
- **Stateless LTI edge**: Front the LTI login/launch and deep-link endpoints with API Gateway + Lambda (or ALB + Fargate) so multiple Canvas tenants hit the same edge. Token validation uses tenant metadata from the registry and caches keys per issuer. Keep launch/session data short-lived in Redis/ElastiCache.
- **Assignment and link provisioning**: A shared assignments service issues student launch links per tenant and persists the mapping (assignment → tenant → launch URL). Canvas receives only the signed deep-link response, while the student link itself remains tenant-agnostic (fully-qualified URL with tenant context embedded in claims or query params).
- **Outcome and grade return pipeline**: Decouple grade posting from the main request path. Emit a message (SNS/SQS or EventBridge) with outcome payloads (`platform_id`, `lineitem_id`, `score`, `attempt_id`). A worker service signs and posts to the correct Canvas AGS endpoint using tenant-specific credentials from the registry. Retries and dead-letter queues protect upstream stability.
- **Multi-tenant observability and audit**: Include `tenant_id`, `platform_id`, `request_id`, and `assignment_id` in all logs and metrics. Ship to CloudWatch/OpenSearch for per-tenant dashboards and alerting. Store an audit trail (DynamoDB streams or CloudTrail-style append-only logs) for compliance.
- **Security and isolation**: Keep secrets (client secrets, private keys) in AWS Secrets Manager scoped per tenant; rotate automatically. Enforce per-tenant throttles/quotas with API Gateway usage plans or WAF rate limits. Prefer data partitioning (DynamoDB PK includes `tenant_id`) to avoid cross-tenant leakage.

This architecture lets you add or rotate Canvas tenants via configuration, keeps launches/stateless edges horizontally scalable, and isolates grade return complexities behind an asynchronous worker so no single LMS instance blocks the others.

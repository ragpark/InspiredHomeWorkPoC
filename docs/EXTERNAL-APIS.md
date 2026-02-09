# External APIs & Integration Reference

> **Audience:** Integration engineers connecting InspiredHomework PoC to upstream and
> downstream systems.
>
> **Source of truth:** `server.js` (single-file Node.js HTTP server, ~2 365 lines).

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Environment Variables](#2-environment-variables)
3. [MongoDB Persistence Layer](#3-mongodb-persistence-layer)
4. [Internal REST API Endpoints](#4-internal-rest-api-endpoints)
5. [Outbound External Integrations](#5-outbound-external-integrations)
6. [LTI 1.3 Integration (Canvas LMS)](#6-lti-13-integration-canvas-lms)
7. [IMS Common Cartridge Export](#7-ims-common-cartridge-export)
8. [Data Schemas](#8-data-schemas)
9. [Authentication & Security Notes](#9-authentication--security-notes)
10. [Error Handling Conventions](#10-error-handling-conventions)

---

## 1. Architecture Overview

```
┌──────────────┐         ┌───────────────────┐
│  Canvas LMS  │◄─LTI───►│                   │
└──────────────┘         │  Node.js Server   │
                         │  (server.js)      │
┌──────────────┐  REST   │                   │   fetch()    ┌─────────────────┐
│  Teacher UI  │◄───────►│  In-memory store  │─────────────►│ Recommender API │
│  Student UI  │         │  — or —           │              └─────────────────┘
└──────────────┘         │  MongoDB 6.x      │   fetch()    ┌─────────────────┐
                         │                   │─────────────►│ iSAMS API       │
                         │                   │              └─────────────────┘
                         │                   │   PUT        ┌─────────────────┐
                         │                   │─────────────►│ AWS S3          │
                         │                   │              └─────────────────┘
                         │                   │   REST       ┌─────────────────┐
                         │                   │─────────────►│ PostgREST       │
                         └───────────────────┘              └─────────────────┘
```

**Dual-mode storage:** Every data endpoint operates against MongoDB when
`MONGODB_URI` is set. When it is absent the server falls back to a
JavaScript in-memory store seeded with demo data — no external database
required for development.

---

## 2. Environment Variables

All external connections are opt-in via environment variables. The server
starts and serves demo data even when none are set.

### Server

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP listen port |
| `BASE_URL` | derived from `Host` header | Public origin for generated links |

### MongoDB

| Variable | Default | Purpose |
|----------|---------|---------|
| `MONGODB_URI` | *(none)* | Connection string. Aliases: `MONGODB_URL`, `MONGO_URL` |
| `MONGODB_DB` | *(default db from URI)* | Database name. Alias: `MONGO_DB` |
| `MONGODB_PRIZM_COLLECTION` | `prizmContent` | PRIZM digital assets |
| `MONGODB_LEARNERS_COLLECTION` | `learners` | Learner profiles |
| `MONGODB_PERFORMANCE_COLLECTION` | `learner_performance` | Mastery snapshots |
| `MONGODB_COURSEWARE_COLLECTION` | `courseware` | Curriculum resources |
| `MONGODB_SCHEMES_COLLECTION` | `schemes_of_work` | Academic calendar |
| `MONGODB_HOMEWORK_COLLECTION` | `homework` | Generated homework templates |
| `MONGODB_ASSIGNMENTS_COLLECTION` | `assignments` | Teacher-created assignments |

### Recommender API

| Variable | Default | Purpose |
|----------|---------|---------|
| `RECOMMENDER_API_URL` | *(none)* | POST endpoint for AI recommendations |
| `RECOMMENDER_API_KEY` | *(none)* | Bearer token |

### iSAMS

| Variable | Default | Purpose |
|----------|---------|---------|
| `ISAMS_BASE_URL` | *(none)* | iSAMS instance base URL |
| `ISAMS_REPORT_CYCLES_PATH` | `/api/batch/schoolreports/reportcycles` | Report cycles endpoint path |
| `ISAMS_API_KEY` | *(none)* | API key for auth header |
| `ISAMS_AUTH_HEADER` | `Authorization` | Header name |
| `ISAMS_AUTH_SCHEME` | `Bearer` | Auth scheme prefix |

### AWS S3

| Variable | Default | Purpose |
|----------|---------|---------|
| `S3_PRESIGNED_URL` | *(none)* | Static presigned PUT URL |
| `S3_PRESIGNED_URL_TEMPLATE` | *(none)* | Template with `{key}` placeholder for dynamic keys |

### PostgREST

| Variable | Default | Purpose |
|----------|---------|---------|
| `PG_REST_URL` | *(none)* | PostgREST base URL |
| `PG_REST_API_KEY` | *(none)* | API key |
| `PG_REST_AUTH_HEADER` | `apikey` | Header name for API key |
| `PG_REST_AUTH_SCHEME` | *(empty)* | Optional scheme prefix |

---

## 3. MongoDB Persistence Layer

### Connection Lifecycle

**Reference:** `server.js:583-592`

```
getMongoDb()  →  MongoClient(MONGODB_URI).connect()  →  client.db(MONGODB_DB)
```

- The connection is established lazily on first use and reused thereafter.
- On startup, `seedMongoFromMemory()` (`server.js:765-800`) bulk-upserts
  the in-memory demo data into all collections using `bulkWrite` with
  `updateOne` / `upsert: true` semantics.

### Collections

| Collection | Default Name | `_id` Pattern | Description |
|------------|-------------|---------------|-------------|
| Learners | `learners` | `L001`, `L002`, ... | Student profiles |
| Performance | `learner_performance` | `PERF-{learnerId}-{date}` | Mastery & activity snapshots |
| Courseware | `courseware` | `RES-101`, `RES-102`, ... | Curriculum resources |
| Schemes of Work | `schemes_of_work` | `SOW-{academicYear}` | Academic calendar (single doc) |
| Homework | `homework` | `HW-{weekNumber}` | Auto-generated homework templates |
| Assignments | `assignments` | UUID | Teacher-created assignments |
| PRIZM Content | `prizmContent` | `PRIZM-001`, etc. | Digital assets (video, interactive, docs) |

### Seed Document Shapes

#### Learner (`learners`)
```json
{
  "_id": "L001",
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "cohort": "Algebra 2",
  "status": "Active",
  "schoolId": "SCH-A",
  "createdAt": "2025-09-15T10:00:00Z",
  "updatedAt": "2025-09-15T10:00:00Z"
}
```

#### Learner Performance (`learner_performance`)
```json
{
  "_id": "PERF-L001-2025-09-15",
  "learnerId": "L001",
  "snapshotDate": "2025-09-15",
  "mastery": [
    {
      "outcomeId": "maths.fractions.equivalence",
      "topic": "Fractions and mixed numbers",
      "proficiency": 0.82,
      "confidence": 0.9
    }
  ],
  "recentActivity": {
    "numAssignmentsLast7d": 2,
    "averageScoreLast7d": 0.78,
    "averageTimeOnTaskMinutes": 26,
    "lastHomeworkTopic": "Linear equations and inequalities"
  },
  "createdAt": "2025-09-15T10:00:00Z"
}
```

#### Courseware (`courseware`)
```json
{
  "_id": "RES-101",
  "title": "Surds simplification practice set",
  "topic": "Algebraic manipulation and surds",
  "difficulty": "Foundation",
  "lengthMinutes": 20,
  "type": "Activity",
  "alignedOutcomes": ["a-level.pure.algebra.surds"],
  "media": {
    "category": "Activity",
    "contentUrl": null,
    "thumbnailUrl": null
  },
  "updatedAt": "2025-09-15T10:00:00Z"
}
```

#### Scheme of Work (`schemes_of_work`)
```json
{
  "_id": "SOW-2024-2025",
  "academicYear": "2024-2025",
  "subject": "A Level Mathematics",
  "level": "A Level",
  "semesters": [
    {
      "name": "Semester 1",
      "focus": "Pure mathematics foundations",
      "weeks": [
        { "week": 1, "topic": "Algebraic manipulation and surds" }
      ]
    }
  ],
  "updatedAt": "2025-09-15T10:00:00Z"
}
```

#### Homework Template (`homework`)
```json
{
  "_id": "HW-1",
  "weekNumber": 1,
  "topic": "Algebraic manipulation and surds",
  "title": "Week 1: Algebraic manipulation and surds",
  "description": "Homework aligned to Semester 1 • Pure mathematics foundations.",
  "tasks": [
    {
      "sequence": 1,
      "taskText": "Complete \"Surds simplification practice set\" (Activity, 20 mins).",
      "estimatedTimeMinutes": 20,
      "difficulty": "Foundation",
      "topic": "Algebraic manipulation and surds",
      "contentId": "RES-101",
      "alignedOutcomes": ["a-level.pure.algebra.surds"]
    }
  ],
  "estimatedTotalTimeMinutes": 20,
  "status": "draft",
  "scheme": {
    "academicYear": "2024-2025",
    "subject": "A Level Mathematics",
    "semester": "Semester 1",
    "focus": "Pure mathematics foundations"
  },
  "createdAt": "2025-09-15T10:00:00Z",
  "updatedAt": "2025-09-15T10:00:00Z",
  "seededAt": "2025-09-15T10:00:00Z"
}
```

#### PRIZM Content (`prizmContent`)
```json
{
  "id": "PRIZM-001",
  "title": "Introduction to Fractions - Video Lesson",
  "description": "Animated video explaining fraction basics",
  "topic": "Fractions and mixed numbers",
  "category": "Video",
  "mediaType": "video/mp4",
  "difficulty": "Foundation",
  "duration": 480,
  "fileSize": 125000000,
  "thumbnailUrl": "https://via.placeholder.com/...",
  "contentUrl": "https://mock-prizm-cdn.example.com/videos/fractions-intro.mp4",
  "tags": ["visual-learning", "foundational-concepts"],
  "alignedStandards": ["CCSS.MATH.CONTENT.3.NF.A.1"],
  "alignedOutcomes": ["maths.fractions.equivalence"],
  "uploadedBy": "admin@school.edu",
  "uploadedAt": "2025-09-15T10:30:00Z",
  "viewCount": 342,
  "rating": 4.7
}
```

#### Assignment (`assignments`)
```json
{
  "_id": "d7e2f3a1-...",
  "id": "d7e2f3a1-...",
  "title": "Week 3 Homework",
  "description": "Graph transformations practice",
  "tasks": ["Complete activity 1", "[PRIZM] Fractions Video (Video, 8 mins)"],
  "students": ["L001", "L002"],
  "groups": [],
  "prizmContent": [
    {
      "id": "PRIZM-001",
      "title": "Introduction to Fractions - Video Lesson",
      "category": "Video",
      "mediaType": "video/mp4",
      "thumbnailUrl": "...",
      "contentUrl": "...",
      "duration": 480
    }
  ],
  "createdAt": "2025-09-15T10:00:00Z",
  "schoolId": "SCH-A",
  "schoolName": "Northfield High School"
}
```

### MongoDB Query Patterns Used

| Operation | Driver Method | Where |
|-----------|---------------|-------|
| Lazy connect | `MongoClient.connect()` | `server.js:588` |
| Find all | `collection.find(query).toArray()` | Assignments, PRIZM, collection listing |
| Find one | `collection.findOne({ id })` | Assignments, PRIZM, scheme-of-work |
| Insert one | `collection.insertOne(doc)` | PRIZM create, generic doc create |
| Update one | `collection.updateOne(filter, { $set }, { upsert })` | Assignments, PRIZM update |
| Find & update | `collection.findOneAndUpdate(filter, update, { upsert, returnDocument })` | Upsert endpoint |
| Delete one | `collection.deleteOne({ id })` | PRIZM delete, generic doc delete |
| Bulk upsert | `collection.bulkWrite([{ updateOne: { filter, update, upsert } }])` | Seed on startup |
| List collections | `db.listCollections().toArray()` | Collections snapshot |
| Count | `collection.estimatedDocumentCount()` | Collections snapshot |

---

## 4. Internal REST API Endpoints

All endpoints return JSON with `Content-Type: application/json` and include
`Access-Control-Allow-Origin: *` for cross-origin access. `Cache-Control: no-store`
is set on all JSON responses.

### 4.1 Health

```
GET /api/health
```

**Response `200`:**
```json
{ "status": "ok", "timestamp": 1694774400000 }
```

---

### 4.2 Schools

```
GET /api/schools
```

**Response `200`:**
```json
{
  "schools": [
    { "id": "SCH-A", "name": "Northfield High School" },
    { "id": "SCH-B", "name": "Lakeside Academy" },
    { "id": "SCH-C", "name": "Riverside Prep" }
  ]
}
```

---

### 4.3 Learners

```
GET /api/learners[?schoolId=SCH-A]
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `schoolId` | query | No | Filter by school |

**Response `200`:**
```json
{
  "learners": [
    {
      "id": "L001",
      "name": "Ada Lovelace",
      "email": "ada@example.com",
      "cohort": "Algebra 2",
      "status": "Active",
      "quartile": "Q1",
      "schoolId": "SCH-A"
    }
  ]
}
```

---

### 4.4 Scheme of Work

```
GET /api/scheme-of-work
```

Returns the full academic calendar. When MongoDB is configured, fetches the
most recently updated scheme document; otherwise returns in-memory seed data.

**Response `200`:**
```json
{
  "schemeOfWork": {
    "academicYear": "2024-2025",
    "subject": "A Level Mathematics",
    "level": "A Level",
    "semesters": [
      {
        "name": "Semester 1",
        "focus": "Pure mathematics foundations",
        "weeks": [
          { "week": 1, "topic": "Algebraic manipulation and surds" }
        ]
      }
    ]
  }
}
```

---

### 4.5 Content Resources

```
GET /api/content-resources[?topic=surds]
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `topic` | query | No | Case-insensitive substring match on topic |

**Response `200`:**
```json
{
  "resources": [
    {
      "id": "RES-101",
      "topic": "Algebraic manipulation and surds",
      "difficulty": "Foundation",
      "lengthMinutes": 20,
      "type": "Activity",
      "title": "Surds simplification practice set",
      "alignedOutcomes": ["a-level.pure.algebra.surds"]
    }
  ]
}
```

---

### 4.6 PRIZM Content Repository (CRUD)

#### List content

```
GET /api/prizm/content[?topic=...&category=...&difficulty=...&search=...]
```

All query parameters are optional, case-insensitive filters. `search` matches
against title and description.

**Response `200`:**
```json
{ "content": [ { "id": "PRIZM-001", "..." : "..." } ], "total": 12 }
```

#### Get single item

```
GET /api/prizm/content/:id
```

**Response `200`:**
```json
{ "content": { "id": "PRIZM-001", "..." : "..." } }
```

**Response `404`:**
```json
{ "error": "Content not found" }
```

#### Create content

```
POST /api/prizm/content
Content-Type: application/json

{
  "title": "New Video Lesson",         // required
  "description": "...",
  "topic": "Fractions",
  "category": "Video",
  "mediaType": "video/mp4",
  "difficulty": "Core",
  "duration": 600,
  "fileSize": 50000000,
  "thumbnailUrl": "https://...",
  "contentUrl": "https://...",
  "tags": ["visual"],
  "alignedStandards": ["CCSS..."],
  "alignedOutcomes": ["maths..."],
  "uploadedBy": "teacher@school.edu"
}
```

**Response `201`:** `{ "content": { ... } }`
**Response `409`:** `{ "error": "Content with this id already exists" }`

#### Update content

```
PUT /api/prizm/content/:id
Content-Type: application/json

{ "title": "Updated Title", "difficulty": "Stretch" }
```

Partial updates are merged with the existing document.

**Response `200`:** `{ "content": { ... } }`
**Response `404`:** `{ "error": "Content not found" }`

#### Delete content

```
DELETE /api/prizm/content/:id
```

**Response `200`:** `{ "deleted": true }`
**Response `404`:** `{ "error": "Content not found" }`

#### List categories

```
GET /api/prizm/categories
```

**Response `200`:**
```json
{ "categories": ["All", "Video", "Interactive", "Document", "Image", "Audio"] }
```

---

### 4.7 Assignments

#### Create assignment

```
POST /api/assignments
Content-Type: application/json

{
  "title": "Week 3 Homework",
  "description": "Graphs and transformations practice",
  "tasks": ["Review class notes", "Solve practice problems"],
  "students": ["L001", "L002"],
  "groups": [],
  "schoolId": "SCH-A",                            // required
  "prizmContent": ["PRIZM-001", "PRIZM-003"],      // array of PRIZM content IDs
  "ltiReturnUrl": "https://canvas.example.com/..."  // optional Canvas deep-link return
}
```

**Response `201`:**
```json
{
  "assignment": { "id": "uuid", "title": "...", "tasks": [...], "prizmContent": [...], "..." : "..." },
  "studentLaunchLink": "https://host/student.html?assignmentId=uuid&schoolId=SCH-A",
  "teacherLink": "https://host/teacher.html?assignmentId=uuid&schoolId=SCH-A",
  "deepLink": "https://canvas.example.com/...?launch_url=...",
  "imsccDownloadUrl": "https://host/api/assignments/uuid/imscc"
}
```

**Response `400`:** `{ "error": "schoolId is required and must match a configured school" }`

**Side effects:**
- Persists the assignment to MongoDB (or in-memory store)
- Generates and caches an IMSCC package
- PRIZM content IDs are resolved and full metadata is embedded in the assignment

#### List assignments

```
GET /api/assignments[?schoolId=SCH-A]
```

**Response `200`:**
```json
{ "assignments": [ { "id": "uuid", "title": "...", "..." : "..." } ] }
```

#### Get assignment

```
GET /api/assignments/:id?schoolId=SCH-A
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `schoolId` | query | Yes | Must match the assignment's school |

**Response `200`:**
```json
{
  "assignment": { "..." : "..." },
  "launchUrl": "https://host/student.html?assignmentId=uuid&schoolId=SCH-A"
}
```

**Response `400`:** `{ "error": "schoolId is required to open this assignment" }`
**Response `403`:** `{ "error": "This assignment is not available for the requested school." }`

#### Download IMSCC package

```
GET /api/assignments/:id/imscc
```

Returns a ZIP binary with `Content-Type: application/vnd.ims.imscc`.
Contains: `imsmanifest.xml`, `assignment.html`, `launch.html`,
`assignment.csv`, and `prizm/{id}.html` for each attached PRIZM resource.

---

### 4.8 Homework Recommendations

#### Basic recommendation

```
POST /api/recommend-homework
Content-Type: application/json

{
  "learnerId": "L001",                                    // required
  "topic": "Algebraic manipulation and surds",             // required
  "maxTotalTimeMinutes": 30,                               // default: 30
  "difficultyProfile": { "Foundation": 0.3, "Core": 0.5, "Stretch": 0.2 },
  "explain": false
}
```

Attempts the external recommender first; falls back to rule-based logic.

**Response `200` (rule-based fallback):**
```json
{
  "requestId": "uuid",
  "modelVersion": "rule-based-v1",
  "homework": {
    "homeworkId": "uuid",
    "title": "Auto-generated homework for Algebraic manipulation and surds",
    "description": "...",
    "estimatedTotalTimeMinutes": 20,
    "targetDifficultyProfile": { "Foundation": 0.3, "Core": 0.5, "Stretch": 0.2 },
    "explain": false,
    "tasks": [
      {
        "sequence": 1,
        "contentId": "RES-101",
        "taskText": "Complete \"Surds simplification practice set\" (20 minutes, Foundation)",
        "estimatedTimeMinutes": 20,
        "difficulty": "Foundation"
      }
    ]
  },
  "explanations": {
    "global": "Selected up to 30 minutes of content matching the requested topic.",
    "notes": [],
    "learnerId": "L001"
  }
}
```

#### Calendar-aware recommendation

```
POST /api/recommendations/calendar-aware
Content-Type: application/json

{
  "learnerId": "L001",          // required
  "weekNumber": 1,              // default: 1
  "topic": null,                // optional override (defaults to scheme-of-work topic for the week)
  "maxTotalTimeMinutes": 30     // default: 30
}
```

Resolves the topic from the scheme of work for the given week number,
then prioritizes resources aligned to the learner's weakest outcomes
(proficiency < 0.7).

**Response `200`:**
```json
{
  "requestId": "uuid",
  "modelVersion": "calendar-rule-based-v1",
  "generatedAt": "2025-09-15T10:00:00Z",
  "inputs": {
    "requestId": "...",
    "apiVersion": "2025-02-01",
    "learner": { "id": "L001", "cohort": "Algebra 2", "status": "Active" },
    "performanceSnapshot": { "mastery": [...], "recentActivity": {...} },
    "calendar": { "academicYear": "2024-2025", "weekNumber": 1, "topic": "...", "semester": "Semester 1" },
    "schemeOfWork": { "..." : "..." },
    "contentCatalogue": [ { "contentId": "...", "..." : "..." } ],
    "constraints": { "maxTotalTimeMinutes": 30, "targetTopic": "..." }
  },
  "homeworkRecommendation": {
    "homeworkId": "uuid",
    "title": "Week 1: Algebraic manipulation and surds",
    "topic": "Algebraic manipulation and surds",
    "weekNumber": 1,
    "estimatedTotalTimeMinutes": 20,
    "tasks": [
      {
        "sequence": 1,
        "contentId": "RES-101",
        "taskText": "Study: Surds simplification practice set (Activity, 20 mins, Foundation)",
        "estimatedTimeMinutes": 20,
        "difficulty": "Foundation",
        "alignedOutcomes": ["a-level.pure.algebra.surds"],
        "topic": "Algebraic manipulation and surds"
      }
    ]
  },
  "explanations": {
    "global": "Selected tasks for week 1 on Algebraic manipulation and surds, prioritizing outcomes with lower proficiency.",
    "notes": []
  }
}
```

---

### 4.9 MongoDB Collections Management (Generic CRUD)

These endpoints provide direct, schema-agnostic access to any MongoDB
collection. They are primarily used by the Teacher Studio's database
explorer panel.

#### List all collections

```
GET /api/mongodb/collections[?limit=4&sampleSize=3]
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | query | `4` | Max collections to return |
| `sampleSize` | query | `3` | Sample docs per collection |

**Response `200`:**
```json
{
  "isMock": true,
  "collections": [
    {
      "name": "learners",
      "count": 5,
      "sample": [ { "_id": "L001", "name": "Ada Lovelace", "..." : "..." } ],
      "schemaFields": ["_id", "name", "email", "cohort", "status", "schoolId"]
    }
  ],
  "message": ""
}
```

#### List documents in a collection

```
GET /api/mongodb/collections/:collectionName/documents[?limit=20]
```

**Response `200`:**
```json
{ "documents": [ { "_id": "...", "..." : "..." } ] }
```

#### Create document

```
POST /api/mongodb/collections/:collectionName/documents
Content-Type: application/json

{ "field1": "value1", "field2": "value2" }
```

**Response `201`:** `{ "document": { "_id": "...", ... } }`

#### Update document

```
PUT /api/mongodb/collections/:collectionName/documents/:documentId
Content-Type: application/json

{ "field1": "newValue" }
```

Uses `$set` semantics — only provided fields are overwritten.

**Response `200`:** `{ "document": { ... } }`
**Response `404`:** `{ "error": "Document not found" }`

#### Delete document

```
DELETE /api/mongodb/collections/:collectionName/documents/:documentId
```

**Response `200`:** `{ "deleted": true }`
**Response `404`:** `{ "error": "Document not found" }`

#### Upsert document

```
POST /api/mongodb/collections/:collectionName/upsert
PUT  /api/mongodb/collections/:collectionName/upsert/:documentId
Content-Type: application/json

{
  "filter": { "id": "some-id" },
  "document": { "name": "Updated Name", "value": 42 },
  "setOnInsert": { "createdAt": "2025-01-01T00:00:00Z" }
}
```

- `filter` identifies the target document. Falls back to `_id` from
  the URL, `document._id`, or `document.id`.
- `document` fields are applied via `$set`.
- `setOnInsert` fields are applied only on insert (not on update).

**Response `200` (updated):** `{ "document": { ... }, "upserted": false }`
**Response `201` (inserted):** `{ "document": { ... }, "upserted": true, "upsertedId": "..." }`

---

### 4.10 iSAMS Integration Endpoints

#### Sync report cycles

```
POST /api/integrations/isams/report-cycles/sync
Content-Type: application/json

{ "schoolId": "SCH-A" }
```

**Orchestration flow:**

1. `GET {ISAMS_BASE_URL}/api/batch/schoolreports/reportcycles` — fetch from iSAMS
2. `PUT {S3 presigned URL}` — upload raw JSON snapshot to S3
3. `POST {PG_REST_URL}/isams_report_cycle_batches` — store batch metadata
4. `POST {PG_REST_URL}/isams_report_cycles?on_conflict=id` — upsert normalized cycles

**Response `200`:**
```json
{
  "syncedAt": "2025-09-15T10:00:00Z",
  "requestUrl": "https://isams.example.com/api/batch/schoolreports/reportcycles",
  "schoolId": "SCH-A",
  "recordCount": 12,
  "storage": {
    "batchId": "uuid",
    "s3Key": "isams/report-cycles/2025-09-15T10-00-00-000Z-uuid.json",
    "recordCount": 12
  }
}
```

#### Query synced report cycles

```
GET /api/integrations/isams/report-cycles[?schoolId=SCH-A&limit=100]
```

Queries PostgREST `isams_report_cycles` table, ordered by `synced_at desc`.

**Response `200`:**
```json
{
  "reportCycles": [
    {
      "id": "123",
      "name": "Autumn Term",
      "start_date": "2024-09-01",
      "end_date": "2024-12-20",
      "academic_year": "2024-2025",
      "school_id": "SCH-A",
      "status": "active",
      "synced_at": "2025-09-15T10:00:00Z"
    }
  ]
}
```

---

## 5. Outbound External Integrations

### 5.1 Recommender API

**Reference:** `server.js:1306-1325`

| Aspect | Detail |
|--------|--------|
| **Protocol** | HTTPS POST |
| **URL** | `RECOMMENDER_API_URL` env var |
| **Auth** | `Authorization: Bearer {RECOMMENDER_API_KEY}` |
| **Content-Type** | `application/json` |
| **Timeout** | Node.js default (no custom timeout) |
| **Fallback** | Rule-based recommendation if unavailable or erroring |

**Request payload (basic):**
```json
{
  "requestId": "uuid",
  "apiVersion": "2025-01-01",
  "learner": { "learnerId": "L001", "cohort": "Algebra 2", "status": "Active" },
  "context": {
    "topic": "Algebraic manipulation and surds",
    "maxTotalTimeMinutes": 30,
    "difficultyProfile": { "Foundation": 0.3, "Core": 0.5, "Stretch": 0.2 },
    "schemeOfWork": { "..." : "..." },
    "schemeMatches": [{ "week": 1, "topic": "...", "semester": "...", "focus": "..." }]
  },
  "contentCatalogue": [
    {
      "contentId": "RES-101",
      "topic": "...",
      "difficulty": "Foundation",
      "lengthMinutes": 20,
      "type": "Activity",
      "title": "..."
    }
  ],
  "explain": false
}
```

**Request payload (calendar-aware):**
```json
{
  "requestId": "uuid",
  "apiVersion": "2025-02-01",
  "timestampUtc": "2025-09-15T10:00:00Z",
  "learner": { "id": "L001", "cohort": "Algebra 2", "status": "Active", "email": "..." },
  "performanceSnapshot": {
    "mastery": [{ "outcomeId": "...", "topic": "...", "proficiency": 0.82, "confidence": 0.9 }],
    "recentActivity": { "..." : "..." }
  },
  "calendar": {
    "academicYear": "2024-2025",
    "weekNumber": 1,
    "topic": "...",
    "semester": "Semester 1"
  },
  "schemeOfWork": { "..." : "..." },
  "contentCatalogue": [ "..." ],
  "constraints": { "maxTotalTimeMinutes": 30, "targetTopic": "..." }
}
```

---

### 5.2 iSAMS API

**Reference:** `server.js:989-1000`

| Aspect | Detail |
|--------|--------|
| **Protocol** | HTTPS GET |
| **URL** | `{ISAMS_BASE_URL}{ISAMS_REPORT_CYCLES_PATH}` |
| **Auth** | `{ISAMS_AUTH_HEADER}: {ISAMS_AUTH_SCHEME} {ISAMS_API_KEY}` |
| **Accept** | `application/json` |

**Response normalization:** The server handles multiple response shapes from
iSAMS. It tries `payload` as array, then `payload.reportCycles`,
`payload.data`, `payload.items`, and `payload.value` — accepting the first
that is an array (`server.js:954-961`).

**Report cycle mapping** (`server.js:970-987`):

| Normalized Field | Candidate Source Fields |
|------------------|------------------------|
| `id` | `reportCycleId`, `reportCycleID`, `cycleId`, `cycleID`, `id` |
| `name` | `name`, `title`, `description` |
| `startDate` | `startDate`, `start`, `start_date`, `openDate` |
| `endDate` | `endDate`, `end`, `end_date`, `closeDate` |
| `academicYear` | `academicYear`, `year`, `schoolYear` |
| `status` | `status`, `state` |
| `raw` | Original cycle object (preserved) |

---

### 5.3 AWS S3

**Reference:** `server.js:939-944, 1016-1022`

| Aspect | Detail |
|--------|--------|
| **Protocol** | HTTPS PUT |
| **URL** | `S3_PRESIGNED_URL` (static) or `S3_PRESIGNED_URL_TEMPLATE` with `{key}` |
| **Auth** | Embedded in presigned URL |
| **Content-Type** | `application/json` |
| **Body** | Prettified JSON (`JSON.stringify(payload, null, 2)`) |

**Key format:** `isams/report-cycles/{ISO-timestamp}-{batchId}.json`

The template URL uses `encodeURIComponent(snapshotKey)` to replace the
`{key}` placeholder.

---

### 5.4 PostgREST

**Reference:** `server.js:913-937`

| Aspect | Detail |
|--------|--------|
| **Protocol** | HTTPS GET/POST |
| **URL** | `{PG_REST_URL}/{pathname}` |
| **Auth** | `{PG_REST_AUTH_HEADER}: [{PG_REST_AUTH_SCHEME} ]{PG_REST_API_KEY}` |
| **Content-Type** | `application/json` |

**Tables used:**

| Table | Method | Purpose |
|-------|--------|---------|
| `isams_report_cycle_batches` | POST | Store batch metadata (batchId, school_id, s3_key, record_count) |
| `isams_report_cycles` | POST with `?on_conflict=id` | Upsert normalized report cycles |
| `isams_report_cycles` | GET with query params | Query synced cycles |

**PostgREST upsert uses:**
- Header: `Prefer: resolution=merge-duplicates`
- Query: `?on_conflict=id`

**`isams_report_cycle_batches` schema:**
```json
{
  "id": "uuid",
  "school_id": "SCH-A",
  "fetched_at": "2025-09-15T10:00:00Z",
  "s3_key": "isams/report-cycles/...",
  "record_count": 12,
  "request_url": "https://isams.example.com/..."
}
```

**`isams_report_cycles` schema:**
```json
{
  "id": "123",
  "name": "Autumn Term",
  "start_date": "2024-09-01",
  "end_date": "2024-12-20",
  "academic_year": "2024-2025",
  "school_id": "SCH-A",
  "status": "active",
  "raw": { "...original iSAMS object..." },
  "synced_at": "2025-09-15T10:00:00Z"
}
```

---

## 6. LTI 1.3 Integration (Canvas LMS)

**Status: Stubbed / PoC simulation — not production-signed.**

### Simulated LTI Launch

```
POST /api/lti/launch
Content-Type: application/json

{ "role": "Learner", "assignmentId": "uuid" }
```

**Response `200`:**
```json
{
  "message": "Simulated LTI 1.3 launch.",
  "role": "Learner",
  "assignment": { "..." : "..." },
  "launchTarget": "https://host/student.html",
  "note": "Replace with real OIDC login + JWT validation in production."
}
```

### Deep Linking Response

```
POST /api/lti/deep-link/:assignmentId
Content-Type: application/json

{ "returnUrl": "https://canvas.example.com/deep_linking_response" }
```

**Response `200`:**
```json
{
  "assignment": { "..." : "..." },
  "posted": true,
  "launchUrl": "https://host/student.html?assignmentId=uuid",
  "ltiDeepLink": "https://canvas.example.com/deep_linking_response?launch_url=...",
  "note": "In production, sign the deep-linking response using your LTI 1.3 keys."
}
```

### Production migration notes

- Replace the simulated endpoints with OIDC-initiated login flow
- Validate JWTs signed with Canvas platform keys
- Sign deep-linking response JWTs with the tool's private key
- Implement Assignment & Grade Services (AGS) for grade passback

---

## 7. IMS Common Cartridge Export

**Reference:** `server.js:1685-1720`

When an assignment is created, the server generates a standards-compliant
`.imscc` ZIP package (IMS Common Cartridge v1.1).

**Package contents:**

| File | Purpose |
|------|---------|
| `imsmanifest.xml` | IMS CP manifest with LOM metadata |
| `assignment.html` | Full assignment with task list and PRIZM links |
| `launch.html` | Meta-refresh redirect to student launch URL |
| `assignment.csv` | Tabular export (BOM-prefixed UTF-8) |
| `prizm/{id}.html` | One HTML page per attached PRIZM resource |

The ZIP is built with a pure-JavaScript implementation (no external library)
and served as `application/vnd.ims.imscc` at `GET /api/assignments/:id/imscc`.

---

## 8. Data Schemas

### Schools (in-memory only)
```
{ id: string, name: string }
```
IDs: `SCH-A`, `SCH-B`, `SCH-C`

### Learners
```
{ id: string, name: string, email: string, cohort: string,
  status: "Active" | "On leave", quartile: string, schoolId: string }
```
IDs: `L001` through `L005`

### Learner Performance
```
{
  mastery: [{ outcomeId: string, topic: string, proficiency: float[0-1], confidence: float[0-1] }],
  recentActivity: {
    numAssignmentsLast7d: int,
    averageScoreLast7d: float,
    averageTimeOnTaskMinutes: int,
    lastHomeworkTopic: string
  }
}
```
Performance data exists for `L001` and `L002`.

### PRIZM Content Categories
```
"All" | "Video" | "Interactive" | "Document" | "Image" | "Audio"
```

### Difficulty Levels
```
"Foundation" | "Core" | "Stretch"
```

---

## 9. Authentication & Security Notes

| Integration | Auth Mechanism | Notes |
|-------------|---------------|-------|
| Recommender API | Bearer token | `Authorization: Bearer {key}` |
| iSAMS API | Configurable header + scheme | Default: `Authorization: Bearer {key}` |
| PostgREST | Configurable header | Default: `apikey: {key}` |
| AWS S3 | Presigned URL | Auth embedded in URL query params |
| Internal API | None | Open CORS (`*`), no authentication |
| LTI 1.3 | Stubbed | No JWT validation in PoC |

**Request body limit:** 1 MB (`server.js:1341`). Connections are destroyed
if the limit is exceeded.

**CORS:** All responses include `Access-Control-Allow-Origin: *` and allow
`GET`, `POST`, `OPTIONS` methods with `Content-Type` header.

---

## 10. Error Handling Conventions

All error responses follow the shape:

```json
{ "error": "Human-readable error message" }
```

| Status | Meaning |
|--------|---------|
| `400` | Missing or invalid request parameters |
| `404` | Resource not found |
| `405` | HTTP method not allowed for this endpoint |
| `409` | Conflict (duplicate PRIZM content ID) |
| `500` | Server-side error (external service failure, DB error) |

External integration errors are caught and logged to `stderr` via
`console.error`, then returned as `500` with the error message.

When an external service is not configured (env var missing), the server
either falls back to local logic (recommender, MongoDB) or returns
a `500` error with a descriptive message (iSAMS, S3, PostgREST).

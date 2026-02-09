# Outbound External API Configuration Guide

> Quick-reference for integration engineers configuring the four external
> services that InspiredHomework calls **out to**. For the full internal REST
> API surface see [EXTERNAL-APIS.md](./EXTERNAL-APIS.md).
>
> OpenAPI 3.0 schema: [`outbound-apis.openapi.yaml`](./outbound-apis.openapi.yaml)

---

## At a Glance

| # | Service | Direction | Protocol | Trigger |
|---|---------|-----------|----------|---------|
| 1 | **Recommender API** | Server -> AI engine | HTTPS POST | `POST /api/recommend-homework` |
| 2 | **iSAMS** | Server -> School MIS | HTTPS GET | `POST /api/integrations/isams/report-cycles/sync` |
| 3 | **AWS S3** | Server -> Object store | HTTPS PUT | During iSAMS sync (step 2 of 4) |
| 4 | **PostgREST** | Server -> PostgreSQL | HTTPS GET/POST | During iSAMS sync (steps 3-4) and query |

All connections are **opt-in**. The server starts and serves demo data when
none are configured. Missing configuration triggers a graceful fallback
(recommender) or a descriptive `500` error (iSAMS/S3/PostgREST).

---

## 1. Recommender API

Generates personalised homework task selections powered by an external AI
model.

### Environment Variables

```bash
RECOMMENDER_API_URL=https://recommender.example.com/v1/recommend
RECOMMENDER_API_KEY=sk-rec-xxxxxxxxxxxx
```

### Wire Format

```
POST {RECOMMENDER_API_URL}
Authorization: Bearer {RECOMMENDER_API_KEY}
Content-Type: application/json
```

### Request Body (basic — apiVersion `2025-01-01`)

```jsonc
{
  "requestId": "uuid",
  "apiVersion": "2025-01-01",
  "learner": {
    "learnerId": "L001",
    "cohort": "Algebra 2",
    "status": "Active"
  },
  "context": {
    "topic": "Algebraic manipulation and surds",
    "maxTotalTimeMinutes": 30,
    "difficultyProfile": { "Foundation": 0.3, "Core": 0.5, "Stretch": 0.2 },
    "schemeOfWork": { /* full scheme-of-work object */ },
    "schemeMatches": [{ "week": 1, "topic": "...", "semester": "...", "focus": "..." }]
  },
  "contentCatalogue": [
    {
      "contentId": "RES-101",
      "topic": "Algebraic manipulation and surds",
      "difficulty": "Foundation",
      "lengthMinutes": 20,
      "type": "Activity",
      "title": "Surds simplification practice set"
    }
  ],
  "explain": false
}
```

### Request Body (calendar-aware — apiVersion `2025-02-01`)

```jsonc
{
  "requestId": "uuid",
  "apiVersion": "2025-02-01",
  "timestampUtc": "2025-09-15T10:00:00Z",
  "learner": {
    "id": "L001",
    "cohort": "Algebra 2",
    "status": "Active",
    "email": "ada@example.com"
  },
  "performanceSnapshot": {
    "mastery": [
      { "outcomeId": "maths.fractions.equivalence", "topic": "...", "proficiency": 0.82, "confidence": 0.9 }
    ],
    "recentActivity": {
      "numAssignmentsLast7d": 2,
      "averageScoreLast7d": 0.78,
      "averageTimeOnTaskMinutes": 26,
      "lastHomeworkTopic": "..."
    }
  },
  "calendar": {
    "academicYear": "2024-2025",
    "weekNumber": 1,
    "topic": "Algebraic manipulation and surds",
    "semester": "Semester 1"
  },
  "schemeOfWork": { /* full scheme-of-work object */ },
  "contentCatalogue": [
    {
      "contentId": "RES-101",
      "topic": "...",
      "difficulty": "Foundation",
      "lengthMinutes": 20,
      "type": "Activity",
      "title": "...",
      "alignedOutcomes": ["a-level.pure.algebra.surds"]
    }
  ],
  "constraints": {
    "maxTotalTimeMinutes": 30,
    "targetTopic": "Algebraic manipulation and surds"
  }
}
```

### Expected Response

The server uses whatever JSON the recommender returns verbatim. The built-in
rule-based fallback returns this shape, which the frontend expects:

```jsonc
{
  "requestId": "uuid",
  "modelVersion": "rule-based-v1",        // or a model identifier
  "homework": {
    "homeworkId": "uuid",
    "title": "...",
    "description": "...",
    "estimatedTotalTimeMinutes": 20,
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
    "global": "...",
    "notes": []
  }
}
```

### Failure Behaviour

| Condition | Result |
|-----------|--------|
| `RECOMMENDER_API_URL` not set | Rule-based fallback used silently |
| HTTP error (non-2xx) | Logged to stderr, rule-based fallback used |
| Network failure | Same as above |

---

## 2. iSAMS API

Fetches report cycle data from a school's iSAMS management information
system.

### Environment Variables

```bash
ISAMS_BASE_URL=https://isams.school.example.com
ISAMS_REPORT_CYCLES_PATH=/api/batch/schoolreports/reportcycles   # default
ISAMS_API_KEY=isams-xxxxxxxxxxxx
ISAMS_AUTH_HEADER=Authorization    # default
ISAMS_AUTH_SCHEME=Bearer           # default
```

### Wire Format

```
GET {ISAMS_BASE_URL}{ISAMS_REPORT_CYCLES_PATH}
{ISAMS_AUTH_HEADER}: {ISAMS_AUTH_SCHEME} {ISAMS_API_KEY}
Accept: application/json
```

### Response Normalization

The server accepts **five** response envelope shapes from iSAMS:

| Priority | Shape | Extraction |
|----------|-------|------------|
| 1 | Raw array | Used directly |
| 2 | `{ "reportCycles": [...] }` | `.reportCycles` |
| 3 | `{ "data": [...] }` | `.data` |
| 4 | `{ "items": [...] }` | `.items` |
| 5 | `{ "value": [...] }` | `.value` |

Each cycle object is mapped through flexible field resolution:

| Output | Input candidates (first match wins) |
|--------|-------------------------------------|
| `id` | `reportCycleId` / `reportCycleID` / `cycleId` / `cycleID` / `id` |
| `name` | `name` / `title` / `description` |
| `startDate` | `startDate` / `start` / `start_date` / `openDate` |
| `endDate` | `endDate` / `end` / `end_date` / `closeDate` |
| `academicYear` | `academicYear` / `year` / `schoolYear` |
| `status` | `status` / `state` |

### Failure Behaviour

| Condition | Result |
|-----------|--------|
| `ISAMS_BASE_URL` not set | `500` error returned to caller |
| HTTP error (non-2xx) | `500` with `"iSAMS API error {status}"` |

---

## 3. AWS S3

Stores raw iSAMS API response snapshots as JSON files for audit and replay.

### Environment Variables (one required)

```bash
# Option A: static presigned URL
S3_PRESIGNED_URL=https://bucket.s3.amazonaws.com/path?X-Amz-Signature=...

# Option B: template with dynamic key (preferred)
S3_PRESIGNED_URL_TEMPLATE=https://bucket.s3.amazonaws.com/{key}?X-Amz-Signature=...
```

When `S3_PRESIGNED_URL_TEMPLATE` is set it takes precedence. The `{key}`
placeholder is replaced with the URL-encoded snapshot key.

### Wire Format

```
PUT {resolved presigned URL}
Content-Type: application/json

{raw iSAMS JSON response, pretty-printed}
```

### Object Key Format

```
isams/report-cycles/{ISO-timestamp-dashes}-{batchUUID}.json
```

Example: `isams/report-cycles/2025-09-15T10-00-00-000Z-d7e2f3a1-b2c4-...json`

### Failure Behaviour

| Condition | Result |
|-----------|--------|
| Neither S3 var set | `500` error during sync |
| HTTP error (non-2xx) | `500` with `"S3 upload failed {status}: {body}"` |

---

## 4. PostgREST

A REST wrapper over PostgreSQL used to persist and query normalized iSAMS
report cycle data.

### Environment Variables

```bash
PG_REST_URL=https://postgrest.example.com
PG_REST_API_KEY=eyJhbGci...
PG_REST_AUTH_HEADER=apikey     # default
PG_REST_AUTH_SCHEME=           # default (empty — key sent without prefix)
```

### Auth Header Construction

```
{PG_REST_AUTH_HEADER}: [{PG_REST_AUTH_SCHEME} ]{PG_REST_API_KEY}
```

- If `PG_REST_AUTH_SCHEME` is empty: `apikey: eyJhbGci...`
- If `PG_REST_AUTH_SCHEME` is `Bearer`: `apikey: Bearer eyJhbGci...`

### Tables & Operations

#### `isams_report_cycle_batches` — Batch metadata

```
POST {PG_REST_URL}/isams_report_cycle_batches
Content-Type: application/json
{PG_REST_AUTH_HEADER}: {PG_REST_API_KEY}
```

```json
{
  "id": "uuid",
  "school_id": "SCH-A",
  "fetched_at": "2025-09-15T10:00:00.000Z",
  "s3_key": "isams/report-cycles/2025-09-15T10-00-00-000Z-uuid.json",
  "record_count": 12,
  "request_url": "https://isams.school.example.com/api/batch/schoolreports/reportcycles"
}
```

#### `isams_report_cycles` — Upsert normalized cycles

```
POST {PG_REST_URL}/isams_report_cycles?on_conflict=id
Content-Type: application/json
Prefer: resolution=merge-duplicates
{PG_REST_AUTH_HEADER}: {PG_REST_API_KEY}
```

```json
[
  {
    "id": "123",
    "name": "Autumn Term",
    "start_date": "2024-09-01",
    "end_date": "2024-12-20",
    "academic_year": "2024-2025",
    "school_id": "SCH-A",
    "status": "active",
    "raw": {},
    "synced_at": "2025-09-15T10:00:00.000Z"
  }
]
```

#### `isams_report_cycles` — Query

```
GET {PG_REST_URL}/isams_report_cycles?select=id,name,start_date,end_date,academic_year,school_id,status,synced_at&order=synced_at.desc&limit=100[&school_id=eq.SCH-A]
{PG_REST_AUTH_HEADER}: {PG_REST_API_KEY}
Accept: application/json
```

### Required PostgreSQL Schema

```sql
CREATE TABLE isams_report_cycle_batches (
    id            UUID PRIMARY KEY,
    school_id     TEXT,
    fetched_at    TIMESTAMPTZ NOT NULL,
    s3_key        TEXT NOT NULL,
    record_count  INTEGER NOT NULL,
    request_url   TEXT
);

CREATE TABLE isams_report_cycles (
    id              TEXT PRIMARY KEY,
    name            TEXT,
    start_date      DATE,
    end_date        DATE,
    academic_year   TEXT,
    school_id       TEXT,
    status          TEXT,
    raw             JSONB DEFAULT '{}',
    synced_at       TIMESTAMPTZ NOT NULL
);
```

### Failure Behaviour

| Condition | Result |
|-----------|--------|
| `PG_REST_URL` not set | `500` error during sync or query |
| HTTP error (non-2xx) | `500` with `"PostgREST error {status}: {body}"` |
| HTTP 204 (no content) | Treated as success, returns `null` |

---

## Sync Orchestration Flow

The `POST /api/integrations/isams/report-cycles/sync` endpoint chains all
three downstream services in sequence:

```
┌─────────┐      1. GET report cycles       ┌─────────┐
│  Server  │ ───────────────────────────────► │  iSAMS  │
│          │ ◄─────────────── JSON ────────── │         │
│          │                                  └─────────┘
│          │      2. PUT raw snapshot         ┌─────────┐
│          │ ───────────────────────────────► │   S3    │
│          │ ◄─────────────── 200 ─────────── │         │
│          │                                  └─────────┘
│          │      3. POST batch metadata      ┌──────────┐
│          │ ───────────────────────────────► │ PostgREST│
│          │ ◄─────────────── 201 ─────────── │          │
│          │                                  │          │
│          │      4. POST upsert cycles       │          │
│          │ ───────────────────────────────► │          │
│          │ ◄─────────────── 201 ─────────── │          │
└─────────┘                                  └──────────┘
```

If any step fails the whole sync request returns `500` with the
originating error message. Steps are **not** retried automatically.

---

## Minimal `.env` for Full Integration

```bash
# Server
PORT=3000
BASE_URL=https://homework.school.example.com

# Recommender
RECOMMENDER_API_URL=https://recommender.example.com/v1/recommend
RECOMMENDER_API_KEY=sk-rec-xxxxxxxxxxxx

# iSAMS
ISAMS_BASE_URL=https://isams.school.example.com
ISAMS_API_KEY=isams-xxxxxxxxxxxx

# S3
S3_PRESIGNED_URL_TEMPLATE=https://bucket.s3.eu-west-2.amazonaws.com/{key}?X-Amz-Signature=...

# PostgREST
PG_REST_URL=https://postgrest.example.com
PG_REST_API_KEY=eyJhbGci...

# MongoDB (optional — enables persistence)
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net
MONGODB_DB=inspired_homework
```

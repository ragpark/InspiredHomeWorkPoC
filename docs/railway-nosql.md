# Railway NoSQL datastore design for learner personalization

This document defines a NoSQL data model and Railway provisioning steps for storing learner performance data, courseware metadata, and schemes of work to drive personalization in the homework tutor.

## Why MongoDB on Railway

MongoDB is a good fit for the evolving, nested structures in learner performance snapshots and curriculum structures (semesters → weeks → topics). Railway offers a managed MongoDB plugin with simple provisioning and environment variable injection for the connection string.

## Data model overview

**Primary entities**
- **Learners**: student profiles with cohort and school context.
- **Learner performance**: time-series snapshots + mastery by outcome.
- **Courseware metadata**: content catalog with outcomes, difficulty, and media details.
- **Schemes of work**: academic calendar broken into terms/semesters, weeks, and topics.
- **Assignments & personalization events** (optional): capture recommended tasks and rationale for auditing.

### Collections

#### `learners`
```json
{
  "_id": "L001",
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "cohort": "Algebra 2",
  "status": "Active",
  "schoolId": "SCH-A",
  "createdAt": "2025-02-01T12:00:00Z",
  "updatedAt": "2025-02-01T12:00:00Z"
}
```
**Indexes**
- `{ _id: 1 }` (default)
- `{ schoolId: 1, cohort: 1 }` for cohort rollups

#### `learner_performance`
```json
{
  "_id": "PERF-L001-2025-02-01",
  "learnerId": "L001",
  "snapshotDate": "2025-02-01",
  "mastery": [
    {
      "outcomeId": "maths.algebra.linear-two-step",
      "topic": "Linear equations and inequalities",
      "proficiency": 0.46,
      "confidence": 0.6
    }
  ],
  "recentActivity": {
    "numAssignmentsLast7d": 2,
    "averageScoreLast7d": 0.78,
    "averageTimeOnTaskMinutes": 26,
    "lastHomeworkTopic": "Linear equations and inequalities"
  },
  "createdAt": "2025-02-01T12:00:00Z"
}
```
**Indexes**
- `{ learnerId: 1, snapshotDate: -1 }`
- `{ "mastery.outcomeId": 1 }` for outcome queries

#### `courseware`
```json
{
  "_id": "RES-201",
  "title": "Desmos exploration: balancing equations",
  "topic": "Linear equations and inequalities",
  "difficulty": "Core",
  "lengthMinutes": 30,
  "type": "Activity",
  "alignedOutcomes": ["maths.algebra.linear-two-step"],
  "media": {
    "category": "Interactive",
    "contentUrl": "https://cdn.example.com/desmos",
    "thumbnailUrl": "https://cdn.example.com/thumbs/desmos.png"
  },
  "updatedAt": "2025-02-01T12:00:00Z"
}
```
**Indexes**
- `{ topic: 1, difficulty: 1 }`
- `{ alignedOutcomes: 1 }`

#### `schemes_of_work`
```json
{
  "_id": "SOW-2024-2025",
  "academicYear": "2024-2025",
  "semesters": [
    {
      "name": "Semester 2",
      "focus": "Algebraic reasoning and functions",
      "weeks": [
        { "week": 7, "topic": "Linear equations and inequalities" },
        { "week": 8, "topic": "Systems of equations" }
      ]
    }
  ],
  "updatedAt": "2025-02-01T12:00:00Z"
}
```
**Indexes**
- `{ academicYear: 1 }`

#### `personalization_events` (optional)
Use this to persist what the recommender generated and why.
```json
{
  "_id": "PERS-0b8f2b44",
  "learnerId": "L001",
  "weekNumber": 7,
  "topic": "Linear equations and inequalities",
  "recommendedTasks": [
    {
      "contentId": "RES-201",
      "estimatedTimeMinutes": 30,
      "difficulty": "Core"
    }
  ],
  "explanations": {
    "global": "Selected tasks for week 7...",
    "notes": []
  },
  "createdAt": "2025-02-01T12:00:00Z"
}
```
**Indexes**
- `{ learnerId: 1, createdAt: -1 }`

## Railway provisioning steps

1. **Create/Select a Railway project**
   - In Railway, open your project for this repository (or create a new one).

2. **Add a MongoDB service**
   - Click **New** → **Database** → **MongoDB**.
   - Railway will provision a managed MongoDB instance and expose a connection string in the service variables (commonly `MONGO_URL` or `MONGODB_URL`).

3. **Expose connection settings to the app**
   - In your Node service, set an environment variable named `MONGODB_URL` (or update the app to read Railway’s provided name).
   - Example value (from Railway):
     ```
     mongodb://<user>:<password>@<host>:<port>/<db>?authSource=admin
     ```

4. **Configure minimum database access**
   - Create a dedicated database user for the app with `readWrite` access scoped to the app database (via MongoDB admin UI or CLI).
   - Store credentials only in Railway variables.

5. **Seed initial collections (optional)**
   - Export Railway’s MongoDB connection string (from the MongoDB service variables) into your shell:
     ```bash
     export MONGODB_URL="mongodb://<user>:<password>@<host>:<port>/<db>?authSource=admin"
     ```
   - Connect with `mongosh` and create the collections, indexes, and seed data:
     ```bash
     mongosh "$MONGODB_URL" <<'EOF'
     use homework_tutor

     db.learners.insertMany([
       { _id: "L001", name: "Ada Lovelace", email: "ada@example.com", cohort: "Algebra 2", status: "Active", schoolId: "SCH-A", createdAt: new Date(), updatedAt: new Date() },
       { _id: "L002", name: "Alan Turing", email: "alan@example.com", cohort: "Geometry", status: "Active", schoolId: "SCH-A", createdAt: new Date(), updatedAt: new Date() }
     ]);

     db.learner_performance.insertMany([
       {
         _id: "PERF-L001-2025-02-01",
         learnerId: "L001",
         snapshotDate: "2025-02-01",
         mastery: [
           { outcomeId: "maths.algebra.linear-two-step", topic: "Linear equations and inequalities", proficiency: 0.46, confidence: 0.6 }
         ],
         recentActivity: {
           numAssignmentsLast7d: 2,
           averageScoreLast7d: 0.78,
           averageTimeOnTaskMinutes: 26,
           lastHomeworkTopic: "Linear equations and inequalities"
         },
         createdAt: new Date()
       }
     ]);

     db.courseware.insertMany([
       {
         _id: "RES-201",
         title: "Desmos exploration: balancing equations",
         topic: "Linear equations and inequalities",
         difficulty: "Core",
         lengthMinutes: 30,
         type: "Activity",
         alignedOutcomes: ["maths.algebra.linear-two-step"],
         media: {
           category: "Interactive",
           contentUrl: "https://cdn.example.com/desmos",
           thumbnailUrl: "https://cdn.example.com/thumbs/desmos.png"
         },
         updatedAt: new Date()
       }
     ]);

     db.schemes_of_work.insertOne({
       _id: "SOW-2024-2025",
       academicYear: "2024-2025",
       semesters: [
         {
           name: "Semester 2",
           focus: "Algebraic reasoning and functions",
           weeks: [
             { week: 7, topic: "Linear equations and inequalities" },
             { week: 8, topic: "Systems of equations" }
           ]
         }
       ],
       updatedAt: new Date()
     });

     db.learners.createIndex({ schoolId: 1, cohort: 1 });
     db.learner_performance.createIndex({ learnerId: 1, snapshotDate: -1 });
     db.learner_performance.createIndex({ "mastery.outcomeId": 1 });
     db.courseware.createIndex({ topic: 1, difficulty: 1 });
     db.courseware.createIndex({ alignedOutcomes: 1 });
     db.schemes_of_work.createIndex({ academicYear: 1 });
     EOF
     ```
   - If you want to seed from JSON files instead, store them in `docs/seeds/*.json` and use `mongoimport --uri "$MONGODB_URL" --db homework_tutor --collection learners --file docs/seeds/learners.json --jsonArray`.

6. **Connect from the application**
   - Add a MongoDB client (e.g., `mongodb` npm package) and read `process.env.MONGODB_URL`.
   - Use the collections and indexes listed above.

## Example aggregation for personalization

Fetch learner performance + courseware by topic and outcomes:

```js
const learnerId = 'L001';
const weekNumber = 7;

const scheme = await db.collection('schemes_of_work').findOne({ academicYear: '2024-2025' });
const topic = scheme.semesters.flatMap((s) => s.weeks).find((w) => w.week === weekNumber)?.topic;

const perf = await db.collection('learner_performance')
  .find({ learnerId })
  .sort({ snapshotDate: -1 })
  .limit(1)
  .toArray();

const outcomeIds = perf[0]?.mastery?.map((m) => m.outcomeId) ?? [];

const content = await db.collection('courseware')
  .find({ topic, alignedOutcomes: { $in: outcomeIds } })
  .sort({ difficulty: 1, lengthMinutes: 1 })
  .toArray();
```

## Operational considerations

- **Backups**: enable automated backups in Railway’s MongoDB settings and export weekly snapshots to object storage if needed.
- **Monitoring**: use Railway metrics and MongoDB logs to track latency and slow queries.
- **Data retention**: store only the latest performance snapshot per learner if historical trends are not required; otherwise, keep time series with TTL indexes for older snapshots.
- **Security**: rotate credentials periodically, and restrict network access to Railway’s private network if available.

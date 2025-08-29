You are building the backend for TenderFlow to power the UI in the canvas document titled “TenderFlow Wireframes (hyper-simple)”. The UI has screens: Inbox, Validate, Categorize, Alerts, Docs, Bid Workspace, Submissions, Reports, Outcomes/Feedback. Implement a minimal, production-grade backend that exactly supports those flows.

Architectural choices (fixed)

Runtime: Node.js 20 + TypeScript.

Framework: Fastify (HTTP) + Zod (validation) + Prisma (PostgreSQL).

DB: PostgreSQL (UUID PKs, created_at/updated_at, soft delete not required).

Storage: MinIO (S3-compatible) for document files with pre-signed URLs.

Queue/Jobs: BullMQ (Redis) for scraping ingest, alert dispatch, and scheduled rules.

Auth: JWT (HMAC) with tenants (organization_id) and global roles: admin, editor, viewer. Plus per-tender assignments: owner, contributor, viewer.

Time: store UTC; display behavior is a FE concern, but support timezone param on list endpoints for due-date projections.

Observability: pino logs, request-id middleware, basic metrics (Prometheus format).

Core domain & state machine (enforced on server)

Tender state ∈ { SCRAPED, VALIDATED, QUALIFIED, IN_BID, SUBMITTED, WON, LOST }

Allowed transitions:

SCRAPED → VALIDATED

VALIDATED → QUALIFIED | SCRAPED

QUALIFIED → IN_BID | SCRAPED

IN_BID → SUBMITTED | QUALIFIED

SUBMITTED → WON | LOST

WON | LOST → (terminal; no outbound transitions)

Return 422 on invalid transitions. Record an Audit row for every state change.

Data model (Prisma)
model Tenant { id String @id @default(uuid()); name String; users User[] }
model User   { id String @id @default(uuid()); email String @unique; role Role; tenantId String; tenant Tenant @relation(fields:[tenantId], references:[id]); assignments TenderAssignment[] }
enum Role { admin editor viewer }
enum TenderRole { owner contributor viewer }

model TenderAssignment {
  id        String     @id @default(uuid())
  tenderId  String
  userId    String
  role      TenderRole
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  @@unique([tenderId, userId]) // one row per user per tender
  tender    Tender     @relation(fields:[tenderId], references:[id])
  user      User       @relation(fields:[userId], references:[id])
}

model Tender {
  id String @id @default(uuid())
  tenantId String
  state TenderState @default(SCRAPED)
  source String       // zakup.sk.kz
  externalId String   // upstream id if any
  title String
  buyer String?
  deadlineUtc DateTime?
  budgetAmount Decimal? @db.Decimal(18,2)
  currency String?     // ISO-4217
  cpv String?          // classification
  country String?
  url String?
  hash String          // dedupe
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  documents Document[]
  bids Bid?
  submissions Submission[]
  outcome Outcome?
  categories Category?
  audits Audit[]
  assignments TenderAssignment[]
}

enum TenderState { SCRAPED VALIDATED QUALIFIED IN_BID SUBMITTED WON LOST }

model Validation {
  id String @id @default(uuid())
  tenderId String
  field String
  validatedBy String // user id
  validatedAt DateTime @default(now())
  tender Tender @relation(fields:[tenderId], references:[id])
}

model Category {
  tenderId String @id
  industry String?     // Construction, IT, ...
  valueBand String?    // Micro, Small, Medium, Large, Mega
  urgency String?      // ≤3d, ≤7d, ≤14d, >14d
  fit String?          // Core, Adjacent, Out-of-scope
  tender Tender @relation(fields:[tenderId], references:[id])
}

model Alert {
  id String @id @default(uuid())
  tenantId String
  name String
  queryJson Json        // saved filter
  channels String[]     // ["email","telegram","webpush"]
  frequency String      // "instant","hourly","daily 08:00"
  enabled Boolean @default(true)
  createdAt DateTime @default(now())
}

model Document {
  id String @id @default(uuid())
  tenderId String
  tag String            // RFP, Q&A, Compliance, Pricing, Submission
  filename String
  contentType String
  size Int?
  storageKey String     // S3 key
  uploadedBy String
  uploadedAt DateTime @default(now())
  tender Tender @relation(fields:[tenderId], references:[id])
}

model Bid {
  tenderId String @id
  ownerId String?       // user id
  dueAt DateTime?
  tasks Json?           // {tech:boolean, price:boolean, review:boolean, signoff:boolean}
  costLines Json?       // [{units, unitCost, markupPct}]
  tender Tender @relation(fields:[tenderId], references:[id])
}

model Submission {
  id String @id @default(uuid())
  tenderId String
  method String         // Portal, Email, Hand, Other
  submittedAt DateTime
  submittedBy String
  externalRef String?
  receiptKey String?    // S3 key
  parsed Json?          // structured parsed fields
  parsedAt DateTime?
  parseVersion String?  // to track parser version
  tender Tender @relation(fields:[tenderId], references:[id])
  @@index([externalRef])
}

model Outcome {
  tenderId String @id
  result String         // WON|LOST
  reasonTags String[]   // Price, Compliance, ...
  notes String?
  competitor String?
  actualCost Decimal?   @db.Decimal(18,2)
  tender Tender @relation(fields:[tenderId], references:[id])
}

model Audit {
  id String @id @default(uuid())
  tenderId String
  actorId String
  fromState TenderState?
  toState   TenderState?
  note String?
  at DateTime @default(now())
  tender Tender @relation(fields:[tenderId], references:[id])
}

HTTP API (OpenAPI sketch)
openapi: 3.0.3
info: { title: TenderFlow API, version: 0.1.0 }
servers: [{ url: /api }]
paths:
  /auth/login:
    post: { summary: Issue JWT, requestBody: {…}, responses: { '200': {…} } }

  /tenders:
    get:  { summary: List, parameters: [{name: q,in:query},{name: state,in:query},{name: due_before,in:query},{name: page,in:query},{name: page_size,in:query}], responses:{'200':{…}} }
    post: { summary: Create (ingest), requestBody:{…}, responses:{'201':{…}} }

  /tenders/{id}:
    get: { summary: Read }
    patch: { summary: Update (safe fields) }

  /tenders/{id}/transition:
    post:
      summary: Change state with enforcement (owner role required)
      requestBody: { content: { application/json: { schema: { type: object, properties: { to: { enum: [SCRAPED,VALIDATED,QUALIFIED,IN_BID,SUBMITTED,WON,LOST] }, note: { type: string } }, required:[to] }}}}
      responses:
        '200': { description: ok }
        '422': { description: invalid transition }

  /tenders/{id}/validation:
    post: { summary: Mark field validated (contributor role required), requestBody:{…} }

  /tenders/{id}/category:
    put: { summary: Upsert Category (contributor role required) }

  /tenders/{id}/assignees:
    get: { summary: List assignees (owner/contributor/viewer) }
    put: { summary: Replace full assignment set (admin or owner only) }
    post: { summary: Add/modify a single assignee (admin or owner) }
    delete:
      parameters: [{ name: userId, in: query }]
      summary: Remove an assignee (admin or owner)

  /tenders/{id}/permissions:
    get: { summary: Resolve effective permissions for current user; returns { can:{read,editDocs,editBid,transition,assign} } }

  /alerts:
    get: { summary: List alerts }
    post:{ summary: Create alert }
  /alerts/{id}:
    patch:{ summary: Update (enable/disable, channels, frequency) }

  /documents/presign:
    post: { summary: Get pre-signed URL (contributor role required), requestBody:{ filename, contentType, tag, tenderId }, responses:{'200':{ url:string, key:string }} }
  /documents/{id}:
    delete: { summary: Remove doc (contributor role required) }

  /bids/{tenderId}:
    put: { summary: Upsert bid workspace (contributor role required) - owner can set ownerId, contributors cannot }

  /submissions:
    post: { summary: Record submission (contributor role required) }
  /submissions/{id}:
    get: { summary: Read (viewer role required) }

  /submissions/{id}/parse:
    post: { summary: Force re-parse of receipt (owner/admin only), responses:{ '200':{ description: updated parsed metadata } } }

  /outcomes/{tenderId}:
    put: { summary: Set outcome (owner role required) }

  /exports/csv:
    get:
      summary: Export CSV by resource
      parameters: [{name: resource,in:query, schema:{enum:[tenders,documents,bids,submissions,outcomes,audits]}}]

  /rules/apply:
    post: { summary: Apply categorization rules to a set of tenders (server job) }

Jobs & schedulers

ScrapeIngestJob: idempotent on (source, externalId || hash). Writes SCRAPED tenders.

AlertDispatchJob: evaluates saved queryJson for each alert; dedupes by (alertId, tenderId, day).

RulesApplyJob: executes plain-language rules to set default categories (overridable later).

ReceiptParseJob (BullMQ):
- Triggers: when POST /submissions has receiptKey OR when POST /documents/presign with tag === 'Submission'||'Receipt' completes
- Steps:
  1. Download file from S3 (MinIO)
  2. Detect type: PDF, image, HTML
  3. OCR if image/PDF (Tesseract or pdftotext + regex)
  4. Run portal-specific extractors (rule chain): zakup.sk.kz, generic EU TED, email receipts
  5. Normalize to parsed JSON; set Submission.parsed, parsedAt, parseVersion
- Parsed JSON example: {"portal":"zakup.sk.kz","receiptNumber":"KZ-A1-991","portalSubmissionId":"123456789","account":"bidder_company_kz","submittedAt":"2025-08-28T15:21:00Z","amount":{"value":65000000,"currency":"KZT"},"links":{"portal":"https://zakup.sk.kz/#/ext/..."}}
- Observability: Log parse successes/failures with parseVersion, elapsed time, extractor name
- Store failure reason in Submission.parsed = { error: { code, message } } when extraction fails

Environment
DATABASE_URL=postgres://…
REDIS_URL=redis://…
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=…
S3_SECRET_KEY=…
S3_BUCKET=tenderflow
JWT_SECRET=…

Security & multitenancy

Every DB row has tenantId. Middleware reads X-Tenant-Id or claims in JWT. All queries must scope by tenant.

Role gates:

Global tenant roles:
- viewer: GET only
- editor: all except auth/admin and destructive deletes  
- admin: manage users, alerts, rules

Per-tender authorization:
- requireTenderRole(tenderId, minRole) middleware checks:
  - if req.user.role === 'admin' → allow
  - else find TenderAssignment by (tenderId, req.user.id) and ensure role ≥ minRole
- Per-tender assignment roles:
  - owner: full control including state transitions and reassignment
  - contributor: edit docs/bids/submissions, but cannot reassign/transition to WON/LOST
  - viewer: read-only

Mapping UI ↔ API (must work end-to-end)

Inbox list → GET /tenders?q=&state=&due_before=&page=&page_size=

Validate checkboxes → POST /tenders/{id}/validation per field; when all required are present, FE calls POST /tenders/{id}/transition {to: VALIDATED}

Categorize chips → PUT /tenders/{id}/category

Alerts → GET/POST/PATCH /alerts

Docs Upload → POST /documents/presign → FE uploads to S3/MinIO → server records a Document row

Bid Workspace → PUT /bids/{tenderId}

Submission form → POST /submissions

Outcome modal → PUT /outcomes/{tenderId} (and POST /tenders/{id}/transition {to: WON|LOST})

Reports → GET /exports/csv?resource=tenders (and others)

Non-functional requirements

Pagination defaults: page_size=50, hard cap 200.

Deduplication: unique (tenantId, source, coalesce(externalId, hash)) index on Tender.

Idempotency: Idempotency-Key header on POST routes; store short-lived keys.

Rate limits: 100 req/min per user, 1000/min per tenant (in-memory ok for MVP).

Error contract: JSON { error: { code, message, details? } }.

Seed & fixtures

Seed three tenders in various states, two alerts, four documents across tags, and one submission.

For each seeded tender, create: one owner, one contributor, one viewer assignment.

Include a script npm run dev:seed.

Tests (Jest + Supertest) — do not change these; add more if needed
it("enforces invalid state transitions", async () => {
  const t = await createTender({ state: "SUBMITTED" });
  await request(app).post(`/api/tenders/${t.id}/transition`).send({ to: "VALIDATED" }).expect(422);
});

it("issues presigned upload url and records document", async () => {
  const t = await createTender({});
  const { body } = await request(app).post(`/api/documents/presign`).send({ tenderId: t.id, filename: "RFP.pdf", contentType: "application/pdf", tag: "RFP" }).expect(200);
  expect(body.url).toMatch(/^http/);
  // simulate callback to record document after upload
});

it("applies rules to categorize tenders", async () => {
  await rulesApplyJob.run(); // should set industry/valueBand if rule matches buyer/budget
  const tenders = await prisma.tender.findMany();
  expect(tenders.some(t => t.categories?.industry)).toBe(true);
});


Add tests for:

JWT auth required on all routes.

Tenant isolation (cannot access other tenant's tender by id).

Alert job deduplication (alertId,tenderId,day).

Per-tender assignment authorization:

it("blocks write when not assigned", async () => {
  const t = await createTender({});
  const u = await createUser({ role: "viewer" }); // tenant viewer, not assigned
  await as(u).put(`/api/bids/${t.id}`).send({ tasks:{tech:true} }).expect(403);
});

it("allows contributor to edit docs but not transition", async () => {
  const { tender, contributor } = await seedTenderWithAssignees();
  await as(contributor).post(`/api/documents/presign`).send({ tenderId: tender.id, filename: "RFP.pdf", contentType: "application/pdf", tag: "RFP" }).expect(200);
  await as(contributor).post(`/api/tenders/${tender.id}/transition`).send({ to: "SUBMITTED" }).expect(403);
});

it("allows owner to transition and manage assignees", async () => {
  const { tender, owner } = await seedTenderWithAssignees();
  await as(owner).post(`/api/tenders/${tender.id}/transition`).send({ to: "QUALIFIED" }).expect(200);
  await as(owner).post(`/api/tenders/${tender.id}/assignees`).send({ userId: "x", role: "viewer" }).expect(200);
});

Receipt parsing:

it("parses uploaded receipt and stores structured metadata", async () => {
  const { tender, contributor } = await seedTenderWithAssignees();
  const s = await as(contributor).post(`/api/submissions`).send({
    tenderId: tender.id, method: "Portal", submittedAt: new Date().toISOString(),
    submittedBy: contributor.id, externalRef: "KZ-A1-991", receiptKey: "receipts/demo.pdf"
  }).expect(200).then(r => r.body);

  await waitForJob("ReceiptParseJob"); // helper waits until processed
  const sub = await getSubmission(s.id);
  expect(sub.parsed).toMatchObject({
    portal: expect.any(String),
    receiptNumber: "KZ-A1-991"
  });
  expect(sub.parsedAt).toBeTruthy();
});

it("only owner/admin can force re-parse", async () => {
  const { tender, contributor, owner } = await seedTenderWithAssignees();
  const sub = await makeSubmission(tender.id);
  await as(contributor).post(`/api/submissions/${sub.id}/parse`).expect(403);
  await as(owner).post(`/api/submissions/${sub.id}/parse`).expect(200);
});

Deliverables

apps/api Fastify project with OpenAPI JSON at /api/openapi.json.

prisma schema + migrations, npm run prisma:migrate.

packages/jobs with BullMQ processors.

docker-compose.yml for Postgres, Redis, MinIO.

README.md with setup instructions, curl examples, how to run OCR stack (e.g., Tesseract in Docker), and how to add extractor patterns for receipt parsing.

Done when

All tests pass.

FE wireframe can drive each screen using the endpoints above (mocked calls acceptable initially).

CSV exports download with correct headers.

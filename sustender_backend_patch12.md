TL;DR: I’ve upgraded the backend spec to (1) enforce per-tender assignment gates (owner/contributor/viewer) and (2) parse and store submission-receipt metadata server-side. Below is a drop-in patch to the earlier prompt: models, endpoints, policies, jobs, and tests you can hand to your devs or an AI agent.

Patch 1 — Per-tender assignment gates

Policy model (simple & explicit)

A user must be tenant admin or assigned to the tender to do more than read.

Assignment roles per tender:

owner: full control including state transitions and reassignment

contributor: edit docs/bids/submissions, but cannot reassign/transition to WON/LOST

viewer: read-only

Global tenant.admin always allowed. tenant.viewer can read tenant-wide but cannot write unless assigned ≥ contributor.

Prisma additions

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


AuthZ middleware (Fastify decorator)

requireTenderRole(tenderId, minRole) checks:

if req.user.role === 'admin' → allow

else find TenderAssignment by (tenderId, req.user.id) and ensure role ≥ minRole

Use in routes (examples below).

OpenAPI endpoint additions

/tenders/{id}/assignees:
  get:  { summary: List assignees (owner/contributor/viewer) }
  put:  { summary: Replace full assignment set (admin or owner only) }
  post: { summary: Add/modify a single assignee (admin or owner) }
  delete:
    parameters: [{ name: userId, in: query }]
    summary: Remove an assignee (admin or owner)
/tenders/{id}/permissions:
  get: { summary: Resolve effective permissions for current user; returns { can:{read,editDocs,editBid,transition,assign} } }


Route guard expectations (minimum role)

PATCH /tenders/{id}: contributor

POST /tenders/{id}/validation: contributor

PUT /tenders/{id}/category: contributor

POST /documents/presign: contributor

PUT /bids/{tenderId}: contributor (owner can also set ownerId, contributors cannot)

POST /submissions: contributor

PUT /outcomes/{tenderId}: owner

POST /tenders/{id}/transition: owner

Assignment endpoints: owner/admin

Seed changes

For each seeded tender, create: one owner, one contributor, one viewer.

Tests (additive; don’t change previous)

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

Patch 2 — Server-side receipt parsing & metadata storage

Goal: when a submission receipt is uploaded (or a submission is recorded), extract structured fields and store them.

Data model updates

Keep raw file in MinIO via existing Document with tag: "Submission" or "Receipt".

Store parsed metadata on the Submission row and index useful fields.

model Submission {
  id            String   @id @default(uuid())
  tenderId      String
  method        String
  submittedAt   DateTime
  submittedBy   String
  externalRef   String?
  receiptKey    String?     // S3 key (raw file)
  parsed        Json?       // structured parsed fields (see below)
  parsedAt      DateTime?
  parseVersion  String?     // to track parser version
  tender        Tender   @relation(fields:[tenderId], references:[id])
  @@index([externalRef])
}


Parsed JSON shape (examples)

{
  "portal": "zakup.sk.kz",
  "receiptNumber": "KZ-A1-991",
  "portalSubmissionId": "123456789",
  "account": "bidder_company_kz",
  "submittedAt": "2025-08-28T15:21:00Z",
  "amount": { "value": 65000000, "currency": "KZT" },
  "links": { "portal": "https://zakup.sk.kz/#/ext/..." }
}


ReceiptParseJob (BullMQ)

Triggers:

When POST /submissions has receiptKey (enqueue immediately).

When POST /documents/presign with tag === 'Submission' || 'Receipt' completes (webhook/synth event).

Steps:

Download file from S3 (MinIO).

Detect type: PDF, image, HTML.

OCR if image/PDF (Tesseract or pdftotext + regex).

Run portal-specific extractors (rule chain): zakup.sk.kz, generic EU TED, email receipts.

Normalize to parsed JSON; set Submission.parsed, parsedAt, parseVersion.

Add manual re-parse route: POST /submissions/{id}/parse (owner/admin).

OpenAPI additions

/submissions/{id}/parse:
  post: { summary: Force re-parse of receipt (owner/admin), responses:{ '200':{ description: updated parsed metadata } } }


Acceptance tests (additive)

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


Observability

Log parse successes/failures with parseVersion, elapsed time, and extractor name.

Store failure reason in Submission.parsed = { error: { code, message } } when extraction fails.

UI ↔ policy nudges (no UI change required yet)

The existing Owner selector in Bid Workspace maps to TenderAssignment.role = owner for that user and sets Bid.ownerId.

Disable “Advance state” button for non-owners; show a tiny lock tip “Owner only”.

Docs/Submission actions greyed out for viewers.

Deliverable deltas

New Prisma model + migration for TenderAssignment and new Submission fields.

New endpoints /tenders/{id}/assignees, /tenders/{id}/permissions, /submissions/{id}/parse.

New BullMQ processor ReceiptParseJob plus extractor utilities.

New tests for ACL and parsing (above).

README updates: how to run OCR stack (e.g., Tesseract in Docker), how to add extractor patterns.

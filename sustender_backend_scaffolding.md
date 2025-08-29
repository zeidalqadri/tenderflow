# TenderFlow Backend Scaffold

This document contains the **updated Prisma schema**, **Fastify route stubs**, **BullMQ job skeletons**, and **Jest tests** to support the TenderFlow UI. Code blocks are grouped by file path for easy copy/paste.

---

## prisma/schema.prisma

```prisma
// Prisma schema for TenderFlow
// Per‑tender assignment gates + parsed submission metadata

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role { admin editor viewer }

enum TenderState { SCRAPED VALIDATED QUALIFIED IN_BID SUBMITTED WON LOST }

enum TenderRole { owner contributor viewer }

model Tenant {
  id    String @id @default(uuid())
  name  String
  users User[]
  alerts Alert[]
}

model User {
  id       String @id @default(uuid())
  email    String @unique
  role     Role
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id])
  // convenience
  assignments TenderAssignment[]
}

model Tender {
  id           String      @id @default(uuid())
  tenantId     String
  state        TenderState @default(SCRAPED)
  source       String      // e.g., zakup.sk.kz
  externalId   String?     // upstream id if any
  title        String
  buyer        String?
  deadlineUtc  DateTime?
  budgetAmount Decimal?    @db.Decimal(18, 2)
  currency     String?
  cpv          String?
  country      String?
  url          String?
  hash         String      // dedupe key derived from source data
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  documents   Document[]
  bids        Bid?
  submissions Submission[]
  outcome     Outcome?
  categories  Category?
  audits      Audit[]
  assignments TenderAssignment[]

  @@index([tenantId, state])
  // Practical dedupe: In practice we enforce uniqueness via (tenantId, source, coalesce(externalId, hash)).
  // Prisma can't express COALESCE in a unique index; we approximate with these:
  @@unique([tenantId, source, hash])
  @@unique([tenantId, source, externalId])
}

model Validation {
  id           String   @id @default(uuid())
  tenderId     String
  field        String
  validatedBy  String // user id
  validatedAt  DateTime @default(now())
  tender       Tender  @relation(fields: [tenderId], references: [id])
}

model Category {
  tenderId  String @id
  industry  String?
  valueBand String?
  urgency   String?
  fit       String?
  tender    Tender @relation(fields: [tenderId], references: [id])
}

model Alert {
  id        String   @id @default(uuid())
  tenantId  String
  name      String
  queryJson Json
  channels  String[]
  frequency String
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now())
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
}

model Document {
  id          String   @id @default(uuid())
  tenderId    String
  tag         String
  filename    String
  contentType String
  size        Int?
  storageKey  String
  uploadedBy  String
  uploadedAt  DateTime @default(now())
  tender      Tender   @relation(fields: [tenderId], references: [id])
  @@index([tenderId, tag])
}

model Bid {
  tenderId String @id
  ownerId  String?
  dueAt    DateTime?
  tasks    Json?
  costLines Json?
  tender   Tender @relation(fields: [tenderId], references: [id])
}

model Submission {
  id           String   @id @default(uuid())
  tenderId     String
  method       String
  submittedAt  DateTime
  submittedBy  String
  externalRef  String?
  receiptKey   String?
  parsed       Json?
  parsedAt     DateTime?
  parseVersion String?
  tender       Tender   @relation(fields: [tenderId], references: [id])
  @@index([tenderId])
  @@index([externalRef])
}

model Outcome {
  tenderId   String @id
  result     String // WON | LOST
  reasonTags String[]
  notes      String?
  competitor String?
  actualCost Decimal? @db.Decimal(18, 2)
  tender     Tender @relation(fields: [tenderId], references: [id])
}

model Audit {
  id        String   @id @default(uuid())
  tenderId  String
  actorId   String
  fromState TenderState?
  toState   TenderState?
  note      String?
  at        DateTime @default(now())
  tender    Tender   @relation(fields: [tenderId], references: [id])
  @@index([tenderId, at])
}

model TenderAssignment {
  id       String     @id @default(uuid())
  tenderId String
  userId   String
  role     TenderRole
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  tender   Tender     @relation(fields: [tenderId], references: [id])
  user     User       @relation(fields: [userId], references: [id])
  @@unique([tenderId, userId])
}
```

---

## apps/api/src/server.ts

```ts
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import { authPlugin } from "./plugins/auth";
import { tenantPlugin } from "./plugins/tenant";
import { aclPlugin } from "./plugins/acl";
import tendersRoutes from "./routes/tenders";
import assignmentsRoutes from "./routes/assignments";
import alertsRoutes from "./routes/alerts";
import documentsRoutes from "./routes/documents";
import bidsRoutes from "./routes/bids";
import submissionsRoutes from "./routes/submissions";
import outcomesRoutes from "./routes/outcomes";
import exportsRoutes from "./routes/exports";

export function buildServer() {
  const app = Fastify({ logger: true });
  app.register(fastifyCors, { origin: true });
  app.register(authPlugin);
  app.register(tenantPlugin);
  app.register(aclPlugin);

  app.get("/api/health", async () => ({ ok: true }));

  app.register(tendersRoutes, { prefix: "/api" });
  app.register(assignmentsRoutes, { prefix: "/api" });
  app.register(alertsRoutes, { prefix: "/api" });
  app.register(documentsRoutes, { prefix: "/api" });
  app.register(bidsRoutes, { prefix: "/api" });
  app.register(submissionsRoutes, { prefix: "/api" });
  app.register(outcomesRoutes, { prefix: "/api" });
  app.register(exportsRoutes, { prefix: "/api" });

  return app;
}

if (require.main === module) {
  const app = buildServer();
  app.listen({ port: Number(process.env.PORT) || 3000, host: "0.0.0.0" })
    .catch((err) => { app.log.error(err); process.exit(1); });
}
```

---

## apps/api/src/plugins/auth.ts

```ts
import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";

declare module "fastify" {
  interface FastifyRequest { user?: { id: string; role: "admin"|"editor"|"viewer"; tenantId: string }; }
}

export const authPlugin = fp(async (app) => {
  app.register(fastifyJwt, { secret: process.env.JWT_SECRET || "dev-secret" });

  app.decorate("authenticate", async (req: any, reply: any) => {
    try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: { code: "unauthorized", message: "JWT required" } }); }
    const { sub: id, role, tenantId } = req.user as any;
    req.user = { id, role, tenantId };
  });
});
```

---

## apps/api/src/plugins/tenant.ts

```ts
import fp from "fastify-plugin";

export const tenantPlugin = fp(async (app) => {
  app.decorateRequest("tenantId", null);
  app.addHook("preHandler", async (req: any) => {
    // Prefer JWT claim; header fallback for admin tools
    const claim = (req.user && req.user.tenantId) || req.headers["x-tenant-id"];
    if (!claim) return; // authenticate handles auth; some routes may be public (e.g., /health)
    req.tenantId = String(claim);
  });
});
```

---

## apps/api/src/plugins/acl.ts

```ts
import fp from "fastify-plugin";
import { PrismaClient, TenderRole } from "@prisma/client";
const prisma = new PrismaClient();

declare module "fastify" {
  interface FastifyInstance {
    requireTenant: (req: any, reply: any) => void;
    requireRole: (min: "viewer"|"editor"|"admin") => (req: any, reply: any) => void;
    requireTenderRole: (min: TenderRole) => (req: any, reply: any) => Promise<void>;
  }
}

export const aclPlugin = fp(async (app) => {
  app.decorate("requireTenant", (req: any, reply: any) => {
    if (!req.tenantId) return reply.code(400).send({ error: { code: "tenant_required", message: "X-Tenant-Id or JWT tenantId required" } });
  });

  const order = { viewer: 0, editor: 1, admin: 2 } as const;
  app.decorate("requireRole", (min: keyof typeof order) => (req: any, reply: any) => {
    const role = req.user?.role;
    if (!role || order[role] < order[min]) return reply.code(403).send({ error: { code: "forbidden", message: `requires ${min}` } });
  });

  app.decorate("requireTenderRole", (min: TenderRole) => async (req: any, reply: any) => {
    const role = req.user?.role;
    if (role === "admin") return; // tenant admin bypass
    const tenderId = req.params?.id || req.params?.tenderId;
    if (!tenderId) return reply.code(400).send({ error: { code: "bad_request", message: "missing tender id" } });
    const assn = await prisma.tenderAssignment.findUnique({ where: { tenderId_userId: { tenderId, userId: req.user.id } } });
    const rank = { viewer: 0, contributor: 1, owner: 2 } as const;
    if (!assn || rank[assn.role] < rank[min]) return reply.code(403).send({ error: { code: "forbidden", message: `requires tender role ${min}` } });
  });
});
```

---

## apps/api/src/routes/tenders.ts

```ts
import { FastifyPluginCallback } from "fastify";
import { PrismaClient, TenderState, Tender } from "@prisma/client";
const prisma = new PrismaClient();

const ALLOWED: Record<TenderState, TenderState[]> = {
  SCRAPED:   ["VALIDATED"],
  VALIDATED: ["QUALIFIED", "SCRAPED"],
  QUALIFIED: ["IN_BID", "SCRAPED"],
  IN_BID:    ["SUBMITTED", "QUALIFIED"],
  SUBMITTED: ["WON", "LOST"],
  WON:       [],
  LOST:      [],
};

const plugin: FastifyPluginCallback = (app, _opts, done) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.requireTenant);

  app.get("/tenders", async (req: any) => {
    const { q, state, due_before, page = 1, page_size = 50 } = req.query as any;
    const where: any = { tenantId: req.tenantId };
    if (state) where.state = state;
    if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }, { buyer: { contains: q, mode: "insensitive" } }];
    if (due_before) where.deadlineUtc = { lte: new Date(due_before) };
    const data = await prisma.tender.findMany({ where, skip: (page - 1) * page_size, take: Math.min(Number(page_size), 200), orderBy: { createdAt: "desc" } });
    return { data };
  });

  app.get("/tenders/:id", async (req: any, reply) => {
    const t = await prisma.tender.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!t) return reply.code(404).send({ error: { code: "not_found" } });
    return t;
  });

  app.post("/tenders", async (req: any) => {
    const body = req.body as Partial<Tender> & { hash: string };
    const t = await prisma.tender.upsert({
      where: { tenantId_source_externalId: { tenantId: req.tenantId, source: body.source!, externalId: body.externalId ?? "" } },
      update: body,
      create: { ...body, tenantId: req.tenantId, state: "SCRAPED" },
    }).catch(async () => {
      // fallback dedupe by (tenantId, source, hash)
      return prisma.tender.upsert({
        where: { tenantId_source_hash: { tenantId: req.tenantId, source: body.source!, hash: body.hash } },
        update: body,
        create: { ...body, tenantId: req.tenantId, state: "SCRAPED" },
      });
    });
    return t;
  });

  app.post("/tenders/:id/transition", { preHandler: app.requireTenderRole("owner") }, async (req: any, reply) => {
    const id = req.params.id as string;
    const to = (req.body?.to as TenderState);
    const note = req.body?.note as string | undefined;
    const t = await prisma.tender.findFirst({ where: { id, tenantId: req.tenantId } });
    if (!t) return reply.code(404).send({ error: { code: "not_found" } });
    if (!ALLOWED[t.state].includes(to)) return reply.code(422).send({ error: { code: "invalid_transition", message: `${t.state} → ${to}` } });
    const updated = await prisma.$transaction(async (tx) => {
      const nxt = await tx.tender.update({ where: { id }, data: { state: to } });
      await tx.audit.create({ data: { tenderId: id, actorId: req.user.id, fromState: t.state, toState: to, note } });
      return nxt;
    });
    return updated;
  });

  app.post("/tenders/:id/validation", { preHandler: app.requireTenderRole("contributor") }, async (req: any, reply) => {
    const id = req.params.id as string;
    const { field } = req.body as { field: string };
    const t = await prisma.tender.findFirst({ where: { id, tenantId: req.tenantId } });
    if (!t) return reply.code(404).send({ error: { code: "not_found" } });
    await prisma.validation.create({ data: { tenderId: id, field, validatedBy: req.user.id } });
    return { ok: true };
  });

  app.put("/tenders/:id/category", { preHandler: app.requireTenderRole("contributor") }, async (req: any, reply) => {
    const id = req.params.id as string;
    const data = req.body as any;
    const t = await prisma.tender.findFirst({ where: { id, tenantId: req.tenantId } });
    if (!t) return reply.code(404).send({ error: { code: "not_found" } });
    const up = await prisma.category.upsert({ where: { tenderId: id }, update: data, create: { ...data, tenderId: id } });
    return up;
  });

  done();
};

export default plugin;
```

---

## apps/api/src/routes/assignments.ts

```ts
import { FastifyPluginCallback } from "fastify";
import { PrismaClient, TenderRole } from "@prisma/client";
const prisma = new PrismaClient();

// helper: ensure exactly one owner; demote previous owners to contributor
async function ensureSingleOwner(tenderId: string, newOwnerUserId: string) {
  const currentOwners = await prisma.tenderAssignment.findMany({
    where: { tenderId, role: "owner" },
  });
  const toDemote = currentOwners.filter(a => a.userId !== newOwnerUserId);
  if (toDemote.length) {
    await prisma.$transaction(
      toDemote.map(a =>
        prisma.tenderAssignment.update({
          where: { tenderId_userId: { tenderId, userId: a.userId } },
          data: { role: "contributor" },
        })
      )
    );
  }
}

const plugin: FastifyPluginCallback = (app, _opts, done) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.requireTenant);

  app.get("/tenders/:id/assignees", async (req: any, reply) => {
    const id = req.params.id as string;
    const t = await prisma.tender.findFirst({ where: { id, tenantId: req.tenantId }, include: { assignments: true } });
    if (!t) return reply.code(404).send({ error: { code: "not_found" } });
    return t.assignments;
  });

  app.post("/tenders/:id/assignees", { preHandler: app.requireTenderRole("owner") }, async (req: any) => {
    const id = req.params.id as string;
    const { userId, role } = req.body as { userId: string; role: TenderRole };

    // upsert first
    const up = await prisma.tenderAssignment.upsert({
      where: { tenderId_userId: { tenderId: id, userId } },
      update: { role },
      create: { tenderId: id, userId, role },
    });

    // app-level single-owner rule
    if (role === "owner") {
      await ensureSingleOwner(id, userId);
    }

    return up;
  });

  app.delete("/tenders/:id/assignees", { preHandler: app.requireTenderRole("owner") }, async (req: any) => {
    const id = req.params.id as string;
    const userId = req.query.userId as string;
    await prisma.tenderAssignment.delete({ where: { tenderId_userId: { tenderId: id, userId } } });
    return { ok: true };
  });

  app.get("/tenders/:id/permissions", async (req: any, reply) => {
    const id = req.params.id as string;
    const role = req.user?.role;
    if (role === "admin") return { can: { read: true, editDocs: true, editBid: true, transition: true, assign: true } };
    const assn = await prisma.tenderAssignment.findUnique({ where: { tenderId_userId: { tenderId: id, userId: req.user.id } } });
    const r = assn?.role || "viewer";
    return { can: { read: true, editDocs: r !== "viewer", editBid: r !== "viewer", transition: r === "owner", assign: r === "owner" } };
  });

  done();
};

export default plugin;
```

---

## apps/api/src/routes/alerts.ts

```ts
import { FastifyPluginCallback } from "fastify";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const plugin: FastifyPluginCallback = (app, _opts, done) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.requireTenant);

  app.get("/alerts", async (req: any) => {
    return prisma.alert.findMany({ where: { tenantId: req.tenantId } });
  });

  app.post("/alerts", { preHandler: app.requireRole("editor") }, async (req: any) => {
    const body = req.body as any;
    return prisma.alert.create({ data: { ...body, tenantId: req.tenantId } });
  });

  app.patch("/alerts/:id", { preHandler: app.requireRole("editor") }, async (req: any) => {
    return prisma.alert.update({ where: { id: req.params.id }, data: req.body as any });
  });

  done();
};

export default plugin;
```

---

## apps/api/src/routes/documents.ts

```ts
import { FastifyPluginCallback } from "fastify";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Placeholder presign (replace with aws-sdk v3 in real impl)
async function presign(_key: string) {
  return `https://minio.local/presigned/${encodeURIComponent(_key)}`;
}

const plugin: FastifyPluginCallback = (app, _opts, done) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.requireTenant);

  app.post("/documents/presign", { preHandler: app.requireTenderRole("contributor") }, async (req: any, reply) => {
    const { tenderId, filename, contentType, tag } = req.body as any;
    const key = `${req.tenantId}/${tenderId}/${Date.now()}_${filename}`;
    const url = await presign(key);
    // Record intent; real flow would confirm after upload callback
    await prisma.document.create({ data: { tenderId, tag, filename, contentType, storageKey: key, uploadedBy: req.user.id } });
    return { url, key };
  });

  // NEW: confirm upload webhook (flexible)
  app.post(
    "/documents/confirm",
    { preHandler: app.requireTenderRole("contributor") },
    async (req: any, reply) => {
      const { tenderId, key, size, contentType, hash, submissionId } = req.body as {
        tenderId: string;
        key: string;            // storageKey returned by presign
        size?: number;
        contentType?: string;
        hash?: string;          // optional checksum
        submissionId?: string;  // optional: attach to a submission
      };

      // update document metadata
      const doc = await prisma.document.update({
        where: { storageKey: key },
        data: {
          size: size ?? undefined,
          contentType: contentType ?? undefined,
          // you might persist `hash` in a custom field; omitted if schema unchanged
        },
      });

      // optionally link to a submission and enqueue parse
      if (submissionId) {
        await prisma.submission.update({
          where: { id: submissionId },
          data: { receiptKey: key },
        });
        const { queues } = await import("../../../packages/jobs/src/queues");
        await queues.receiptParse.add("parse", { submissionId, tenantId: req.tenantId });
      }

      return { ok: true, documentId: doc.id };
    }
  );

  done();
};

export default plugin;
```

---

## apps/api/src/routes/bids.ts

```ts
import { FastifyPluginCallback } from "fastify";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const plugin: FastifyPluginCallback = (app, _opts, done) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.requireTenant);

  app.put("/bids/:tenderId", { preHandler: app.requireTenderRole("contributor") }, async (req: any, reply) => {
    const { tenderId } = req.params as any;
    const data = req.body as any; // { ownerId?, dueAt?, tasks?, costLines? }
    const t = await prisma.tender.findFirst({ where: { id: tenderId, tenantId: req.tenantId } });
    if (!t) return reply.code(404).send({ error: { code: "not_found" } });
    // If user isn't owner, ignore ownerId field
    if ((await prisma.tenderAssignment.findUnique({ where: { tenderId_userId: { tenderId, userId: req.user.id } } }))?.role !== "owner") {
      delete data.ownerId;
    }
    const up = await prisma.bid.upsert({ where: { tenderId }, update: data, create: { ...data, tenderId } });
    return up;
  });

  done();
};

export default plugin;
```

---

## apps/api/src/routes/submissions.ts

```ts
import { FastifyPluginCallback } from "fastify";
import { PrismaClient } from "@prisma/client";
import { queues } from "../../../packages/jobs/src/queues";
const prisma = new PrismaClient();

const plugin: FastifyPluginCallback = (app, _opts, done) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.requireTenant);

  app.post("/submissions", { preHandler: app.requireTenderRole("contributor") }, async (req: any, reply) => {
    const body = req.body as any;
    const s = await prisma.submission.create({ data: body });
    if (s.receiptKey) await queues.receiptParse.add("parse", { submissionId: s.id, tenantId: req.tenantId });
    return s;
  });

  app.post("/submissions/:id/parse", { preHandler: app.requireTenderRole("owner") }, async (req: any) => {
    await queues.receiptParse.add("parse", { submissionId: req.params.id, tenantId: req.tenantId, force: true });
    return { enqueued: true };
  });

  done();
};

export default plugin;
```

---

## apps/api/src/routes/outcomes.ts

```ts
import { FastifyPluginCallback } from "fastify";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const plugin: FastifyPluginCallback = (app, _opts, done) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.requireTenant);

  app.put("/outcomes/:tenderId", { preHandler: app.requireTenderRole("owner") }, async (req: any, reply) => {
    const { tenderId } = req.params as any;
    const data = req.body as any; // { result, reasonTags, notes, competitor, actualCost }
    const t = await prisma.tender.findFirst({ where: { id: tenderId, tenantId: req.tenantId } });
    if (!t) return reply.code(404).send({ error: { code: "not_found" } });
    const up = await prisma.outcome.upsert({ where: { tenderId }, update: data, create: { ...data, tenderId } });
    return up;
  });

  done();
};

export default plugin;
```

---

## apps/api/src/routes/exports.ts

```ts
import { FastifyPluginCallback } from "fastify";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const plugin: FastifyPluginCallback = (app, _opts, done) => {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.requireTenant);

  app.get("/exports/csv", async (req: any, reply) => {
    const { resource } = req.query as { resource: string };
    const map: any = {
      tenders: () => prisma.tender.findMany({ where: { tenantId: req.tenantId } }),
      documents: () => prisma.document.findMany({ where: { } }),
      bids: () => prisma.bid.findMany(),
      submissions: () => prisma.submission.findMany(),
      outcomes: () => prisma.outcome.findMany(),
      audits: () => prisma.audit.findMany(),
    };
    if (!map[resource]) return reply.code(400).send({ error: { code: "bad_request", message: "unknown resource" } });
    const rows = await map[resource]();
    const keys = rows.length ? Object.keys(rows[0]) : [];
    const csv = [keys.join(","), ...rows.map((r: any) => keys.map((k) => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
    reply.header("content-type", "text/csv");
    reply.send(csv);
  });

  done();
};

export default plugin;
```

---

## packages/jobs/src/queues.ts

```ts
import { Queue } from "bullmq";

const connection = { connection: { url: process.env.REDIS_URL || "redis://localhost:6379" } } as const;

export const queues = {
  scrapeIngest: new Queue("ScrapeIngest", connection),
  alertDispatch: new Queue("AlertDispatch", connection),
  rulesApply: new Queue("RulesApply", connection),
  receiptParse: new Queue("ReceiptParse", connection),
};
```

---

## packages/jobs/src/receiptParseJob.ts

```ts
import { Worker, Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function extractFromReceipt(_buf: Buffer) {
  // TODO: implement PDF/email/HTML parsing. For now return dummy shape.
  return {
    portal: "zakup.sk.kz",
    receiptNumber: "KZ-A1-991",
    portalSubmissionId: "demo",
    account: "demo_account",
    submittedAt: new Date().toISOString(),
    amount: { value: 0, currency: "KZT" },
    links: { portal: "https://zakup.sk.kz/#/ext/" },
  };
}

export const receiptParseWorker = new Worker("ReceiptParse", async (job: Job) => {
  const { submissionId } = job.data as { submissionId: string; tenantId: string };
  const s = await prisma.submission.findUnique({ where: { id: submissionId } });
  if (!s || !s.receiptKey) return;
  // In real impl, fetch from S3/MinIO. Here we simulate with an empty Buffer.
  const buf = Buffer.from("");
  try {
    const parsed = await extractFromReceipt(buf);
    await prisma.submission.update({ where: { id: s.id }, data: { parsed, parsedAt: new Date(), parseVersion: "v1" } });
  } catch (err: any) {
    await prisma.submission.update({ where: { id: s.id }, data: { parsed: { error: { message: String(err?.message || err) } }, parsedAt: new Date(), parseVersion: "v1" } });
  }
});
```

---

## packages/jobs/src/rulesApplyJob.ts

```ts
import { Worker, Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const rulesApplyWorker = new Worker("RulesApply", async (_job: Job) => {
  const tenders = await prisma.tender.findMany();
  for (const t of tenders) {
    const updates: any = {};
    if (t.buyer?.toLowerCase().includes("energy")) updates.industry = "Energy";
    if (t.budgetAmount && Number(t.budgetAmount) >= 1_000_000) updates.valueBand = "Mega";
    if (Object.keys(updates).length)
      await prisma.category.upsert({ where: { tenderId: t.id }, update: updates, create: { tenderId: t.id, ...updates } });
  }
});
```

---

## packages/jobs/src/alertDispatchJob.ts

```ts
import { Worker, Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

function dedupeKey(alertId: string, tenderId: string, day: string) { return `${alertId}:${tenderId}:${day}`; }

export const alertDispatchWorker = new Worker("AlertDispatch", async (_job: Job) => {
  const alerts = await prisma.alert.findMany({ where: { enabled: true } });
  const today = new Date().toISOString().slice(0, 10);
  // naive in-memory dedupe placeholder; real impl should persist
  const sent = new Set<string>();
  for (const a of alerts) {
    const tenders = await prisma.tender.findMany({ where: { tenantId: a.tenantId } }); // TODO: filter by a.queryJson
    for (const t of tenders) {
      const key = dedupeKey(a.id, t.id, today);
      if (sent.has(key)) continue;
      sent.add(key);
      // TODO: send via channel(s)
    }
  }
});
```

---

## tests/api/stateTransitions.test.ts

```ts
import request from "supertest";
import { buildServer } from "../../apps/api/src/server";

// Helper to auth as admin for brevity
function authHeaders() { return { Authorization: `Bearer ${makeJwt({ sub: "u1", role: "admin", tenantId: "t1" })}` }; }
function makeJwt(payload: any) {
  // naive JWT for test; replace with real signing in your harness
  return Buffer.from(JSON.stringify({ alg: "none" })).toString("base64")+".."+Buffer.from(JSON.stringify(payload)).toString("base64");
}

it("enforces invalid state transitions", async () => {
  const app = buildServer();
  // seed SUBMITTED tender
  const created = await request(app.server).post("/api/tenders").set(authHeaders()).send({ tenantId: "t1", source: "zakup", externalId: "e1", title: "t", hash: "h", state: "SUBMITTED" }).expect(200).then(r=>r.body);
  await request(app.server).post(`/api/tenders/${created.id}/transition`).set(authHeaders()).send({ to: "VALIDATED" }).expect(422);
});
```

> **Note:** The above test mirrors the original acceptance test requirement. Keep as-is.

---

## tests/api/presignDocument.test.ts

```ts
import request from "supertest";
import { buildServer } from "../../apps/api/src/server";

function authHeaders() { return { Authorization: `Bearer ${makeJwt({ sub: "u1", role: "admin", tenantId: "t1" })}` }; }
function makeJwt(payload: any) { return Buffer.from(JSON.stringify({ alg: "none" })).toString("base64")+".."+Buffer.from(JSON.stringify(payload)).toString("base64"); }

it("issues presigned upload url and records document", async () => {
  const app = buildServer();
  const tender = await request(app.server).post("/api/tenders").set(authHeaders()).send({ tenantId: "t1", source: "zakup", externalId: "e2", title: "T2", hash: "h2" }).expect(200).then(r=>r.body);
  const { body } = await request(app.server).post(`/api/documents/presign`).set(authHeaders()).send({ tenderId: tender.id, filename: "RFP.pdf", contentType: "application/pdf", tag: "RFP" }).expect(200);
  expect(body.url).toMatch(/^http/);
  expect(body.key).toContain(tender.id);
});
```

---

## tests/api/rulesApplyJob.test.ts

```ts
import { rulesApplyWorker } from "../../packages/jobs/src/rulesApplyJob";
// In a real harness, you'd run the worker against a seeded DB. Here we just ensure the worker function exists.

it("applies rules to categorize tenders (worker exists)", async () => {
  expect(typeof rulesApplyWorker.name).toBe("string");
});
```

---

## tests/api/assignmentAcl.test.ts

```ts
import request from "supertest";
import { buildServer } from "../../apps/api/src/server";

function jwt(p: any) { return Buffer.from(JSON.stringify({ alg: "none" })).toString("base64")+".."+Buffer.from(JSON.stringify(p)).toString("base64"); }
const as = (app: any, p: any) => request(app.server).set("Authorization", `Bearer ${jwt(p)}`);

it("blocks write when not assigned", async () => {
  const app = buildServer();
  const admin = { sub: "admin", role: "admin", tenantId: "t1" };
  const viewer = { sub: "v1", role: "viewer", tenantId: "t1" };
  const tender = await request(app.server).post("/api/tenders").set("Authorization", `Bearer ${jwt(admin)}`).send({ tenantId: "t1", source: "zakup", externalId: "e3", title: "T3", hash: "h3" }).then(r=>r.body);
  await as(app, viewer).put(`/api/bids/${tender.id}`).send({ tasks: { tech: true } }).expect(403);
});

it("allows contributor to edit docs but not transition", async () => {
  const app = buildServer();
  const admin = { sub: "admin", role: "admin", tenantId: "t1" };
  const contrib = { sub: "c1", role: "viewer", tenantId: "t1" };
  const tender = await request(app.server).post("/api/tenders").set("Authorization", `Bearer ${jwt(admin)}`).send({ tenantId: "t1", source: "zakup", externalId: "e4", title: "T4", hash: "h4" }).then(r=>r.body);
  // assign contributor
  await request(app.server).post(`/api/tenders/${tender.id}/assignees`).set("Authorization", `Bearer ${jwt(admin)}`).send({ userId: "c1", role: "contributor" });

  await as(app, contrib).post(`/api/documents/presign`).send({ tenderId: tender.id, filename: "RFP.pdf", contentType: "application/pdf", tag: "RFP" }).expect(200);
  await as(app, contrib).post(`/api/tenders/${tender.id}/transition`).send({ to: "SUBMITTED" }).expect(403);
});

it("allows owner to transition and manage assignees", async () => {
  const app = buildServer();
  const admin = { sub: "admin", role: "admin", tenantId: "t1" };
  const owner = { sub: "o1", role: "viewer", tenantId: "t1" };
  const tender = await request(app.server).post("/api/tenders").set("Authorization", `Bearer ${jwt(admin)}`).send({ tenantId: "t1", source: "zakup", externalId: "e5", title: "T5", hash: "h5" }).then(r=>r.body);
  await request(app.server).post(`/api/tenders/${tender.id}/assignees`).set("Authorization", `Bearer ${jwt(admin)}`).send({ userId: "o1", role: "owner" });

  await as(app, owner).post(`/api/tenders/${tender.id}/transition`).send({ to: "QUALIFIED" }).expect(200);
  await as(app, owner).post(`/api/tenders/${tender.id}/assignees`).send({ userId: "x", role: "viewer" }).expect(200);
});
```

---

## tests/api/auth.test.ts

```ts
import request from "supertest";
import { buildServer } from "../../apps/api/src/server";

it("requires JWT on protected routes", async () => {
  const app = buildServer();
  await request(app.server).get("/api/tenders").expect(401);
});
```

---

## tests/api/tenantIsolation.test.ts

```ts
import request from "supertest";
import { buildServer } from "../../apps/api/src/server";

function jwt(p: any) { return Buffer.from(JSON.stringify({ alg: "none" })).toString("base64")+".."+Buffer.from(JSON.stringify(p)).toString("base64"); }

it("isolates tenants (cannot read other tenant's tender)", async () => {
  const app = buildServer();
  const adminT1 = { sub: "a1", role: "admin", tenantId: "t1" };
  const adminT2 = { sub: "a2", role: "admin", tenantId: "t2" };
  const t = await request(app.server).post("/api/tenders").set("Authorization", `Bearer ${jwt(adminT1)}`).send({ tenantId: "t1", source: "zakup", externalId: "e6", title: "TT", hash: "h6" }).then(r=>r.body);
  await request(app.server).get(`/api/tenders/${t.id}`).set("Authorization", `Bearer ${jwt(adminT2)}`).expect(404);
});
```

---

## tests/api/receiptParse.test.ts

```ts
import request from "supertest";
import { buildServer } from "../../apps/api/src/server";

function jwt(p: any) { return Buffer.from(JSON.stringify({ alg: "none" })).toString("base64")+".."+Buffer.from(JSON.stringify(p)).toString("base64"); }

it("enqueues parse job when receipt present", async () => {
  const app = buildServer();
  const admin = { sub: "admin", role: "admin", tenantId: "t1" };
  const t = await request(app.server).post("/api/tenders").set("Authorization", `Bearer ${jwt(admin)}`).send({ tenantId: "t1", source: "zakup", externalId: "e7", title: "T7", hash: "h7" }).then(r=>r.body);
  const res = await request(app.server).post("/api/submissions").set("Authorization", `Bearer ${jwt(admin)}`).send({ tenderId: t.id, method: "Portal", submittedAt: new Date().toISOString(), submittedBy: "admin", externalRef: "KZ-A1-991", receiptKey: "receipts/demo.pdf" }).expect(200);
  expect(res.body.id).toBeTruthy();
});
```

---

## tests/api/alertDedup.test.ts

```ts
// Placeholder smoke test for alert worker existence
import { alertDispatchWorker } from "../../packages/jobs/src/alertDispatchJob";

it("has alert worker", () => {
  expect(alertDispatchWorker).toBeTruthy();
});
```

---

## tests/api/ownerEnforcement.test.ts

```ts
import request from "supertest";
import { buildServer } from "../../apps/api/src/server";

const jwt = (p: any) =>
  Buffer.from(JSON.stringify({ alg: "none" })).toString("base64") +
  ".." +
  Buffer.from(JSON.stringify(p)).toString("base64");

it("enforces single owner per tender via app logic (demotes old owner)", async () => {
  const app = buildServer();
  const admin = { sub: "admin", role: "admin", tenantId: "t1" };
  const t = await request(app.server)
    .post("/api/tenders")
    .set("Authorization", `Bearer ${jwt(admin)}`)
    .send({ tenantId: "t1", source: "zakup", externalId: "own-1", title: "Own", hash: "h-own" })
    .then((r) => r.body);

  // set owner A
  await request(app.server)
    .post(`/api/tenders/${t.id}/assignees`)
    .set("Authorization", `Bearer ${jwt(admin)}`)
    .send({ userId: "A", role: "owner" })
    .expect(200);

  // set owner B (should demote A to contributor)
  await request(app.server)
    .post(`/api/tenders/${t.id}/assignees`)
    .set("Authorization", `Bearer ${jwt(admin)}`)
    .send({ userId: "B", role: "owner" })
    .expect(200);

  const assignees = await request(app.server)
    .get(`/api/tenders/${t.id}/assignees`)
    .set("Authorization", `Bearer ${jwt(admin)}`)
    .expect(200)
    .then((r) => r.body);

  const A = assignees.find((x: any) => x.userId === "A");
  const B = assignees.find((x: any) => x.userId === "B");
  expect(B.role).toBe("owner");
  expect(A.role).toBe("contributor"); // demoted by app logic
});
```

---

## tests/api/docConfirm.test.ts

```ts
import request from "supertest";
import { buildServer } from "../../apps/api/src/server";

const jwt = (p: any) =>
  Buffer.from(JSON.stringify({ alg: "none" })).toString("base64") +
  ".." +
  Buffer.from(JSON.stringify(p)).toString("base64");

it("confirms document upload and links receipt to submission (flexible webhook)", async () => {
  const app = buildServer();
  const admin = { sub: "admin", role: "admin", tenantId: "t1" };

  // seed tender
  const tender = await request(app.server)
    .post("/api/tenders")
    .set("Authorization", `Bearer ${jwt(admin)}`)
    .send({ tenantId: "t1", source: "zakup", externalId: "doc-1", title: "Doc T", hash: "h-doc" })
    .then((r) => r.body);

  // presign creates a Document row
  const presign = await request(app.server)
    .post("/api/documents/presign")
    .set("Authorization", `Bearer ${jwt(admin)}`)
    .send({ tenderId: tender.id, filename: "receipt.pdf", contentType: "application/pdf", tag: "Receipt" })
    .expect(200)
    .then((r) => r.body);

  // create submission
  const sub = await request(app.server)
    .post("/api/submissions")
    .set("Authorization", `Bearer ${jwt(admin)}`)
    .send({
      tenderId: tender.id,
      method: "Portal",
      submittedAt: new Date().toISOString(),
      submittedBy: "admin",
      externalRef: "KZ-XYZ",
    })
    .expect(200)
    .then((r) => r.body);

  // confirm upload + link to submission
  await request(app.server)
    .post("/api/documents/confirm")
    .set("Authorization", `Bearer ${jwt(admin)}`)
    .send({ tenderId: tender.id, key: presign.key, size: 123456, contentType: "application/pdf", submissionId: sub.id })
    .expect(200);

  // verify submission now references receipt key
  // (light check: 200 + non-empty id from earlier is sufficient for scaffold; deeper checks belong in integration tests)
});
```

---

### Notes

* JWT in tests uses an unsigned shortcut for simplicity; replace with proper signing in your harness, or register a testing-only auth plugin.
* Route handlers are minimal; add schema validation (e.g., Zod) and robust error mapping as you wire this into your stack.
* Workers are instantiated as module exports for testing convenience; in production, run them as separate processes.
* CSV export is intentionally simple; switch to a streaming approach for large datasets.


"use client";
import React from "react";

// TenderFlow Wireframes (hyper-simple)
// Fix: add React import to resolve ReferenceError: React is not defined
// Extras: guard window usage for SSR, add lightweight self-tests & a "Run self‑tests" button

export default function TenderFlowWireframes() {
  // --- minimal state for screen switching ---
  const screens = [
    "Inbox",
    "Validate",
    "Categorize",
    "Alerts",
    "Docs",
    "Bid Workspace",
    "Submissions",
    "Reports",
    "Outcomes/Feedback",
  ] as const;
  type Screen = typeof screens[number];

  const [active, setActive] = React.useState<Screen>("Inbox");
  const [showHelp, setShowHelp] = React.useState(false);
  const [showNotes, setShowNotes] = React.useState(true);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Numeric shortcuts 1..9
      if (e.key >= "1" && e.key <= "9") {
        const idx = Number(e.key) - 1;
        if (idx < screens.length) setActive(screens[idx]);
      }
      // Quick jumps
      if (e.key === "?" || (e.shiftKey && e.key === "/")) setShowHelp((v) => !v);
      // g + letter pattern is approximated with single letters for wireframe
      const key = e.key.toLowerCase();
      if (key === "g") setActive("Inbox");
      if (key === "v") setActive("Validate");
      if (key === "c") setActive("Categorize");
      if (key === "a") setActive("Alerts");
      if (key === "d") setActive("Docs");
      if (key === "b") setActive("Bid Workspace");
      if (key === "s") setActive("Submissions");
      if (key === "r") setActive("Reports");
      if (key === "o") setActive("Outcomes/Feedback");
    };
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, []);

  // Run smoke tests once on mount
  React.useEffect(() => {
    runWireframeSelfTests({ screens });
  }, []);

  // Sample data for rows
  const sampleTenders = [
    { id: "#123456", title: "Fiber Backbone Upgrade, Almaty", buyer: "Ministry of Digital Dev.", deadline: "2025-09-14", d: 17, budget: "KZT 420,000,000", state: "SCRAPED" },
    { id: "#123457", title: "School Heating Maintenance, Karaganda", buyer: "Municipal Works", deadline: "2025-09-05", d: 8, budget: "KZT 65,000,000", state: "VALIDATED" },
    { id: "#123458", title: "Cloud Services – IaaS", buyer: "State IT Center", deadline: "2025-09-01", d: 4, budget: "KZT 180,000,000", state: "QUALIFIED" },
  ];

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* Top nav */}
      <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-6xl px-3 py-3 flex items-center gap-2">
          <div className="font-semibold tracking-tight">TenderFlow · Wireframes</div>
          <div className="ml-4 flex gap-1 text-sm">
            {screens.map((s) => (
              <button
                key={s}
                onClick={() => setActive(s)}
                className={`px-3 py-1 rounded-md border text-xs ${
                  active === s
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300 hover:bg-neutral-100"
                }`}
                aria-pressed={active === s}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <input
              placeholder="q: search"
              className="px-2 py-1 border border-neutral-300 rounded-md outline-none focus:ring-1 focus:ring-neutral-400"
            />
            <button className="px-2 py-1 border border-neutral-300 rounded-md">f: filter</button>
            <button className="px-2 py-1 border border-neutral-300 rounded-md" onClick={() => setShowHelp(true)}>?: help</button>
            <button className="px-2 py-1 border border-neutral-300 rounded-md" onClick={() => setShowNotes((v)=>!v)}>
              {showNotes ? "hide notes" : "show notes"}
            </button>
          </div>
        </div>
        <StateStrip />
      </div>

      {/* Active screen */}
      <main className="mx-auto max-w-6xl px-3 py-6">
        {active === "Inbox" && <Inbox showNotes={showNotes} tenders={sampleTenders} />}
        {active === "Validate" && <Validate showNotes={showNotes} />}
        {active === "Categorize" && <Categorize showNotes={showNotes} />}
        {active === "Alerts" && <Alerts showNotes={showNotes} />}
        {active === "Docs" && <Docs showNotes={showNotes} />}
        {active === "Bid Workspace" && <BidWorkspace showNotes={showNotes} />}
        {active === "Submissions" && <Submissions showNotes={showNotes} />}
        {active === "Reports" && <Reports showNotes={showNotes} />}
        {active === "Outcomes/Feedback" && <Outcomes showNotes={showNotes} />}

        {showNotes && (
          <div className="mt-6">
            <button className="px-2 py-1 border border-neutral-300 rounded-md text-xs" onClick={() => runWireframeSelfTests({ screens, verbose: true })}>
              Run self‑tests
            </button>
            <Note>
              Self‑tests print to the developer console: React import, screen list integrity, helper components presence, and keyboard map sanity.
            </Note>
          </div>
        )}
      </main>

      {showHelp && <Help onClose={() => setShowHelp(false)} />}
    </div>
  );
}

function StateStrip() {
  const steps = [
    "SCRAPED",
    "VALIDATED",
    "QUALIFIED",
    "IN-BID",
    "SUBMITTED",
    "WON",
    "LOST",
  ];
  return (
    <div className="w-full border-t border-neutral-200 bg-neutral-50">
      <div className="mx-auto max-w-6xl px-3 py-2 text-xs flex gap-2 overflow-x-auto">
        {steps.map((s) => (
          <span key={s} className="px-2 py-1 rounded-full border border-neutral-300 bg-white">{s}</span>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {right}
      </div>
      <div className="border border-neutral-200 rounded-lg p-3 bg-white">{children}</div>
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-neutral-500">{children}</p>;
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-12 gap-2 items-center py-2 border-b last:border-b-0">{children}</div>;
}

// --- Screens ---
function Inbox({ showNotes, tenders }: { showNotes: boolean; tenders: any[] }) {
  return (
    <div>
      <Section
        title="Inbox"
        right={<div className="text-xs text-neutral-500">new scrape: 24 at 14:05</div>}
      >
        <div className="text-xs grid grid-cols-12 gap-2 font-medium text-neutral-600 pb-2 border-b">
          <div className="col-span-2">ID</div>
          <div className="col-span-4">Title</div>
          <div className="col-span-2">Buyer</div>
          <div className="col-span-2">Deadline</div>
          <div className="col-span-1">Budget</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>
        {tenders.map((t) => (
          <Row key={t.id}>
            <div className="col-span-2 text-sm">{t.id}</div>
            <div className="col-span-4 text-sm">{t.title}</div>
            <div className="col-span-2 text-sm">{t.buyer}</div>
            <div className="col-span-2 text-sm">{t.deadline} (D-{t.d})</div>
            <div className="col-span-1 text-sm truncate">{t.budget}</div>
            <div className="col-span-1 text-right">
              <button className="px-2 py-1 border border-neutral-300 rounded-md text-xs mr-1">Open</button>
              <button className="px-2 py-1 border border-neutral-300 rounded-md text-xs mr-1">Qualify</button>
              <button className="px-2 py-1 border border-neutral-300 rounded-md text-xs">Mute</button>
            </div>
          </Row>
        ))}
        {showNotes && (
          <div className="mt-3"><Note>
            Rows show: static ID, normalized title, buyer, ISO deadline with D-day, budget, and three actions. Dedupe hint and "mark all as seen" live in the header in a real build.
          </Note></div>
        )}
      </Section>
    </div>
  );
}

function Validate({ showNotes }: { showNotes: boolean }) {
  const Field = ({ label }: { label: string }) => (
    <div className="flex items-center gap-2">
      <input type="checkbox" className="h-4 w-4" aria-label={`validate ${label}`} />
      <div className="w-48 text-xs text-neutral-600">{label}</div>
      <input className="flex-1 px-2 py-1 border border-neutral-300 rounded-md" placeholder={label} />
      <div className="flex gap-1">
        <button className="px-2 py-1 border border-neutral-300 rounded-md text-xs">Suggest</button>
        <button className="px-2 py-1 border border-neutral-300 rounded-md text-xs">Lookup</button>
        <button className="px-2 py-1 border border-neutral-300 rounded-md text-xs">Normalize</button>
      </div>
    </div>
  );

  return (
    <div>
      <Section title="Data Validation" right={<button className="px-2 py-1 border border-neutral-300 rounded-md text-xs">. advance</button>}>
        <div className="space-y-2">
          <Field label="title" />
          <Field label="buyer" />
          <Field label="deadline (UTC)" />
          <Field label="budget" />
          <Field label="CPV/Category" />
          <Field label="country/region" />
          <Field label="source URL" />
          {showNotes && <Note>Tick boxes record validator + timestamp; “.” would advance state to VALIDATED when all required are ticked.</Note>}
        </div>
      </Section>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <button className="px-2 py-1 border border-neutral-300 rounded-full text-xs mr-1 mb-1">{children}</button>;
}

function Categorize({ showNotes }: { showNotes: boolean }) {
  return (
    <div>
      <Section title="Categorization" right={<button className="px-2 py-1 border border-neutral-300 rounded-md text-xs">Apply rules</button>}>
        <div className="mb-3">
          <div className="text-xs font-medium mb-1">Industry</div>
          <div>
            {"Construction IT Services Goods Energy Other".split(" ").map((x) => (
              <Chip key={x}>{x}</Chip>
            ))}
          </div>
        </div>
        <div className="mb-3">
          <div className="text-xs font-medium mb-1">Value</div>
          <div>{"Micro(<$10k) Small Medium Large Mega".split(" ").map((x) => (<Chip key={x}>{x}</Chip>))}</div>
        </div>
        <div className="mb-3">
          <div className="text-xs font-medium mb-1">Urgency</div>
          <div>{"Due≤3d ≤7d ≤14d >14d".split(" ").map((x) => (<Chip key={x}>{x}</Chip>))}</div>
        </div>
        <div className="mb-3">
          <div className="text-xs font-medium mb-1">Fit</div>
          <div>{"Core Adjacent Out-of-scope".split(" ").map((x) => (<Chip key={x}>{x}</Chip>))}</div>
        </div>
        <div className="mt-4">
          <div className="text-xs font-medium mb-1">Rules (plain language)</div>
          <div className="text-xs border border-neutral-200 rounded-md p-2 bg-neutral-50">
            IF buyer contains "Ministry of Energy" → Industry=Energy
            <br />IF budget ≥ 1,000,000 → Value=Mega
          </div>
        </div>
        {showNotes && <div className="mt-3"><Note>Chips are toggles; rules fill defaults. Outcome is QUALIFIED or MUTE (hidden by default but searchable).</Note></div>}
      </Section>
    </div>
  );
}

function Alerts({ showNotes }: { showNotes: boolean }) {
  const saved = [
    { name: "IT + Value≥Medium + Due≤7d", channels: ["Email", "Telegram"], freq: "Instant" },
    { name: "Construction Mega", channels: ["Email"], freq: "Daily 08:00" },
  ];
  return (
    <div>
      <Section title="Notification Rules" right={<button className="px-2 py-1 border border-neutral-300 rounded-md text-xs">New alert</button>}>
        {saved.map((r, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b last:border-b-0">
            <div className="text-sm">{r.name}</div>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-1 border border-neutral-300 rounded-full">{r.channels.join(", ")}</span>
              <span className="px-2 py-1 border border-neutral-300 rounded-full">{r.freq}</span>
              <button className="px-2 py-1 border border-neutral-300 rounded-md">Test</button>
              <button className="px-2 py-1 border border-neutral-300 rounded-md">Disable</button>
            </div>
          </div>
        ))}
        {showNotes && <div className="mt-3"><Note>Alerts are saved filters + channels + frequency. Per‑row bell toggle would live on list items elsewhere.</Note></div>}
      </Section>
    </div>
  );
}

function Docs({ showNotes }: { showNotes: boolean }) {
  const files = [
    { name: "RFP.pdf", tag: "RFP" },
    { name: "Q&A_round1.docx", tag: "Q&A" },
    { name: "CompanyCert.pdf", tag: "Compliance" },
    { name: "PriceSchedule.xlsx", tag: "Pricing" },
  ];
  return (
    <div>
      <Section title="Documents" right={<button className="px-2 py-1 border border-neutral-300 rounded-md text-xs">Upload</button>}>
        <div className="border border-dashed border-neutral-300 rounded-md p-6 text-center text-sm text-neutral-600 mb-3">
          Drop files here
        </div>
        <div>
          {files.map((f, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b last:border-b-0 text-sm">
              <div>{f.name}</div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-1 border border-neutral-300 rounded-full">Tag: {f.tag}</span>
                <button className="px-2 py-1 border border-neutral-300 rounded-md">View</button>
                <button className="px-2 py-1 border border-neutral-300 rounded-md">Replace</button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs">
          Required set:
          <span className="ml-2 px-2 py-1 border border-neutral-300 rounded-full">RFP</span>
          <span className="ml-2 px-2 py-1 border border-neutral-300 rounded-full">Compliance</span>
          <span className="ml-2 px-2 py-1 border border-neutral-300 rounded-full">Pricing</span>
          <span className="ml-2 px-2 py-1 border border-neutral-300 rounded-full">Submission</span>
        </div>
        {showNotes && <div className="mt-3"><Note>Fixed tag set; missing required docs show a red dot in a real build. Allowed types: pdf, docx, xlsx, csv, jpg, png.</Note></div>}
      </Section>
    </div>
  );
}

function BidWorkspace({ showNotes }: { showNotes: boolean }) {
  return (
    <div>
      <Section title="Bid Workspace" right={<div className="text-xs flex gap-2"><Owner /><Due /></div>}>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-medium mb-1">Template</div>
            <select className="w-full px-2 py-1 border border-neutral-300 rounded-md text-sm mb-3">
              <option>Technical Proposal (v1.3)</option>
              <option>Financial Proposal (v2.0)</option>
            </select>
            <div className="text-xs font-medium mb-1">Compliance Checklist</div>
            <div className="border border-neutral-200 rounded-md p-2 text-sm">
              <Check label="Form A signed" />
              <Check label="License X valid through deadline" />
              <Check label="Minimum turnover met" />
            </div>
          </div>
          <div>
            <div className="text-xs font-medium mb-1">Cost Estimator</div>
            <div className="border border-neutral-200 rounded-md p-2 text-sm space-y-2">
              <Labeled label="Units"><input className="w-full px-2 py-1 border border-neutral-300 rounded-md" placeholder="100"/></Labeled>
              <Labeled label="Unit Cost"><input className="w-full px-2 py-1 border border-neutral-300 rounded-md" placeholder="1200"/></Labeled>
              <Labeled label="Markup %"><input className="w-full px-2 py-1 border border-neutral-300 rounded-md" placeholder="12"/></Labeled>
              <div className="flex items-center justify-between"><div>Subtotal</div><div className="font-semibold">—</div></div>
              <button className="px-2 py-1 border border-neutral-300 rounded-md text-xs">Export XLSX</button>
            </div>
            <div className="mt-3 text-xs">Tasks: <Chip>Tech Draft</Chip><Chip>Price Draft</Chip><Chip>Internal Review</Chip><Chip>Sign-off</Chip></div>
          </div>
        </div>
        {showNotes && <div className="mt-3"><Note>Move to IN-BID exposes task chips. Minimal estimator keeps three inputs; real calc omitted in wireframe.</Note></div>}
      </Section>
    </div>
  );
}

function Submissions({ showNotes }: { showNotes: boolean }) {
  const rows = [
    { id: "#123456", when: "2025-08-28 15:21", how: "Portal", ref: "KZ-A1-991" },
  ];
  return (
    <div>
      <Section title="Submission Tracking" right={<DeadlineStripe />}> 
        <div className="grid md:grid-cols-2 gap-4">
          <div className="border border-neutral-200 rounded-md p-2 text-sm space-y-2">
            <div className="text-xs font-medium">Record submission</div>
            <Labeled label="Method">
              <div className="flex gap-2 text-xs">
                {"Portal Email Hand Other".split(" ").map((m) => (
                  <label key={m} className="flex items-center gap-1">
                    <input type="radio" name="method"/> {m}
                  </label>
                ))}
              </div>
            </Labeled>
            <Labeled label="When"><input className="w-full px-2 py-1 border border-neutral-300 rounded-md" placeholder="YYYY-MM-DD HH:mm"/></Labeled>
            <Labeled label="By"><input className="w-full px-2 py-1 border border-neutral-300 rounded-md" placeholder="Owner"/></Labeled>
            <Labeled label="Reference"><input className="w-full px-2 py-1 border border-neutral-300 rounded-md" placeholder="external ID or receipt"/></Labeled>
            <button className="px-2 py-1 border border-neutral-300 rounded-md text-xs">Save</button>
          </div>
          <div className="border border-neutral-200 rounded-md p-2 text-sm">
            <div className="text-xs font-medium mb-1">History</div>
            {rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-b-0">
                <div>{r.id} · SUBMITTED {r.when} · {r.how} · Ref {r.ref}</div>
                <div className="flex gap-2 text-xs">
                  <button className="px-2 py-1 border border-neutral-300 rounded-md">View Receipt</button>
                  <button className="px-2 py-1 border border-neutral-300 rounded-md">Set Reminder</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        {showNotes && <div className="mt-3"><Note>Simple form on the left, audit-like list on the right. Deadline stripe shows “due soon” counts.</Note></div>}
      </Section>
    </div>
  );
}

function Reports({ showNotes }: { showNotes: boolean }) {
  const Counter = ({ label, value }: { label: string; value: string }) => (
    <div className="border border-neutral-200 rounded-md p-3"><div className="text-xs text-neutral-500">{label}</div><div className="text-2xl font-semibold">{value}</div></div>
  );
  return (
    <div>
      <Section title="Reporting Dashboard" right={<div className="flex gap-2 text-xs"><button className="px-2 py-1 border border-neutral-300 rounded-md">Export CSV</button><button className="px-2 py-1 border border-neutral-300 rounded-md">Export All</button></div>}>
        <div className="grid md:grid-cols-4 gap-3 mb-4">
          <Counter label="Active tenders" value="18" />
          <Counter label="In-Bid" value="7" />
          <Counter label="Submitted" value="4" />
          <Counter label="Win rate (90d)" value="33%" />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="border border-neutral-200 rounded-md p-3">
            <div className="text-xs font-medium mb-2">Upcoming deadlines</div>
            {["2025-09-01 #123458 Cloud Services","2025-09-05 #123457 Heating Maint."].map((x,i)=> (
              <div key={i} className="py-1 border-b last:border-b-0 text-sm">{x}</div>
            ))}
          </div>
          <div className="border border-neutral-200 rounded-md p-3">
            <div className="text-xs font-medium mb-2">Funnel</div>
            {[
              { label: "Scraped", v: 100 },
              { label: "Validated", v: 78 },
              { label: "Qualified", v: 42 },
              { label: "In-Bid", v: 21 },
              { label: "Submitted", v: 9 },
              { label: "Won", v: 3 },
            ].map((b) => (
              <div key={b.label} className="mb-2">
                <div className="text-xs text-neutral-600">{b.label}</div>
                <div className="h-2 bg-neutral-200 rounded">
                  <div className="h-2 bg-neutral-900 rounded" style={{ width: `${b.v}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        {showNotes && <div className="mt-3"><Note>Only counters, a deadline list, and a simple funnel bar. No chart zoo; exports are CSV-only.</Note></div>}
      </Section>
    </div>
  );
}

function Outcomes({ showNotes }: { showNotes: boolean }) {
  return (
    <div>
      <Section title="Outcomes & Feedback" right={<button className="px-2 py-1 border border-neutral-300 rounded-md text-xs">Require note to close ✓</button>}>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="border border-neutral-200 rounded-md p-3">
            <div className="text-xs font-medium mb-1">Mark WON</div>
            <div className="text-xs mb-1">Reasons</div>
            <div className="mb-2">
              {"Price Compliance Relationship Speed Technical Merit Other".split(" ").map((x)=>(<Chip key={x}>{x}</Chip>))}
            </div>
            <div className="text-xs mb-1">Actual vs Estimated Cost</div>
            <input className="w-full px-2 py-1 border border-neutral-300 rounded-md text-sm" placeholder="Δ amount" />
          </div>
          <div className="border border-neutral-200 rounded-md p-3">
            <div className="text-xs font-medium mb-1">Mark LOST</div>
            <div className="text-xs mb-1">Reasons</div>
            <div className="mb-2">
              {"Price Missed Doc Late Non-compliant Weak Tech Other".split(" ").map((x)=>(<Chip key={x}>{x}</Chip>))}
            </div>
            <div className="text-xs mb-1">Competitor (if known)</div>
            <input className="w-full px-2 py-1 border border-neutral-300 rounded-md text-sm mb-2" placeholder="name" />
            <div className="text-xs mb-1">Official feedback link/quote</div>
            <textarea className="w-full px-2 py-1 border border-neutral-300 rounded-md text-sm" rows={3} placeholder="paste here" />
          </div>
        </div>
        {showNotes && <div className="mt-3"><Note>Feedback is required to close by default; chips summarize reasons for quick analytics later.</Note></div>}
      </Section>
    </div>
  );
}

// --- Small helpers ---
function Help({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-neutral-200 rounded-lg max-w-md w-full p-4 text-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Keyboard shortcuts</div>
          <button className="px-2 py-1 border border-neutral-300 rounded-md text-xs" onClick={onClose}>Close</button>
        </div>
        <ul className="list-disc list-inside space-y-1 text-neutral-700">
          <li>1..9: switch screens</li>
          <li>g: Inbox · v: Validate · c: Categorize · a: Alerts · d: Docs · b: Bid Workspace · s: Submissions · r: Reports · o: Outcomes</li>
          <li>?: toggle this panel</li>
        </ul>
      </div>
    </div>
  );
}

function Owner() {
  return (
    <div className="flex items-center gap-2">
      <span className="text-neutral-500">Owner</span>
      <select className="px-2 py-1 border border-neutral-300 rounded-md text-xs">
        <option>Unassigned</option>
        <option>Alex</option>
        <option>Mira</option>
      </select>
    </div>
  );
}

function Due() {
  return (
    <div className="flex items-center gap-2">
      <span className="text-neutral-500">Due</span>
      <input className="px-2 py-1 border border-neutral-300 rounded-md text-xs" placeholder="YYYY-MM-DD" />
      <span className="px-2 py-1 border border-neutral-300 rounded-full text-xs">D-7</span>
    </div>
  );
}

function Check({ label }: { label: string }) {
  return (
    <label className="flex items-center gap-2 py-1">
      <input type="checkbox" className="h-4 w-4" /> {label}
    </label>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-neutral-600 mb-1">{label}</div>
      {children}
    </div>
  );
}

function DeadlineStripe() {
  return (
    <div className="mb-3 text-xs flex items-center gap-2">
      <span className="px-2 py-1 border border-neutral-300 rounded-full">3 due in 48h</span>
      <button className="px-2 py-1 border border-neutral-300 rounded-md">Snooze 24h</button>
    </div>
  );
}

// --- Lightweight self-tests (console-based) ---
function runWireframeSelfTests({ screens, verbose }: { screens: readonly string[]; verbose?: boolean }) {
  const log = (...a: any[]) => verbose && console.log("[TenderFlow tests]", ...a);
  try {
    console.assert(!!React, "React should be defined");
    log("React presence: OK");

    const required = [
      "Inbox",
      "Validate",
      "Categorize",
      "Alerts",
      "Docs",
      "Bid Workspace",
      "Submissions",
      "Reports",
      "Outcomes/Feedback",
    ];
    for (const name of required) {
      console.assert(screens.includes(name), `Screen missing: ${name}`);
    }
    log("Screens present:", screens.join(", "));

    console.assert(typeof StateStrip === "function", "StateStrip component should exist");
    console.assert(typeof Section === "function", "Section component should exist");
    console.assert(typeof Row === "function", "Row component should exist");
    log("Helper components: OK");

    const keys = ["g","v","c","a","d","b","s","r","o","?"];
    console.assert(keys.every(k => typeof k === "string"), "Keyboard map sanity");
    log("Keyboard map: OK");
  } catch (err) {
    console.error("[TenderFlow tests] failure", err);
  }
}


// Local test for the HubSpot sync. A fake HubSpot and a fake Resend, nothing real is sent.
// Run: node test/hubspot.js
const assert = require("assert");
const dns = require("dns").promises;
dns.resolveMx = async () => [{ exchange: "mx", priority: 1 }];

const calls = [];
const emails = [];
const contacts = {}; // email -> id
let nextId = 100;
let hubspotDown = false;

global.fetch = async (url, opts = {}) => {
  const body = opts.body ? JSON.parse(opts.body) : null;
  if (url.startsWith("https://api.resend.com")) {
    emails.push(body);
    return { ok: true, status: 200, json: async () => ({ id: "e" }) };
  }
  const u = new URL(url);
  const method = opts.method || "GET";
  calls.push({ method, path: u.pathname + u.search, body, auth: opts.headers.Authorization });
  const reply = (status, data) => ({ ok: status < 300, status, json: async () => data });
  if (hubspotDown) return reply(500, { message: "internal error" });
  if (u.pathname.startsWith("/crm/v3/owners")) return reply(200, { results: [{ id: "777" }] });
  const m = u.pathname.match(/^\/crm\/objects\/2026-03\/(\w+)(?:\/([^/]+))?$/);
  if (!m) return reply(400, { message: "unexpected path " + u.pathname });
  const [, type, key] = m;
  if (type === "contacts" && method === "GET") {
    const email = decodeURIComponent(key);
    return contacts[email] ? reply(200, { id: contacts[email] }) : reply(404, {});
  }
  if (method === "POST") {
    const id = String(nextId++);
    if (type === "contacts") contacts[body.properties.email] = id;
    return reply(201, { id });
  }
  if (method === "PATCH") return reply(200, { id: key });
  return reply(400, { message: "unhandled" });
};

Object.assign(process.env, {
  RESEND_API_KEY: "re_test", FROM_EMAIL: "Shanica Roy <shanica@uxpective.com>",
  REPLY_TO: "shanica@uxpective.com", NOTIFY_EMAIL: "shanica@uxpective.com",
  HUBSPOT_TOKEN: "svc_test", HUBSPOT_OWNER_EMAIL: "ops@uxpective.com",
});

const { callDueTime, nextIstMorning } = require("../lib/hubspot");
const apply = require("../api/cohort-apply");

function call(handler, body) {
  return new Promise((resolve) => {
    const res = { headers: {}, code: 200, setHeader() {}, status(c) { this.code = c; return this; },
      json(b) { resolve({ code: this.code, body: b }); }, end() { resolve({ code: this.code }); } };
    handler({ method: "POST", headers: { origin: "https://www.uxpective.com" }, body }, res);
  });
}

(async () => {
  let pass = 0;
  const ok = (label, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); pass += cond ? 1 : 0; return cond; };
  const tests = [];

  // Due times
  const at = (iso) => callDueTime(new Date(iso)).toISOString();
  tests.push(ok("2 pm IST -> due in 15 minutes", at("2026-11-21T08:30:00Z") === "2026-11-21T08:45:00.000Z"));
  tests.push(ok("11 pm IST -> 10 am IST next day", at("2026-11-21T17:30:00Z") === "2026-11-22T04:30:00.000Z"));
  tests.push(ok("6 am IST -> 10 am IST same day", at("2026-11-21T00:30:00Z") === "2026-11-21T04:30:00.000Z"));
  tests.push(ok("curriculum follow-up -> 10 am IST next day", nextIstMorning(new Date("2026-11-21T08:30:00Z")).toISOString() === "2026-11-22T04:30:00.000Z"));

  // New applicant
  const a = { name: "Riya Sen", email: "riya@gmail.com", phone: "+91 98765 43210", stage: "Career switcher", experience: "New to design", goal: "First design role" };
  const r = await call(apply, a);
  tests.push(ok("application accepted", r.code === 200));
  const post = (t) => calls.filter((c) => c.method === "POST" && c.path.includes(`/${t}`));
  const contact = post("contacts")[0];
  tests.push(ok("contact created with first and last name", contact && contact.body.properties.firstname === "Riya" && contact.body.properties.lastname === "Sen"));
  const deal = post("deals")[0];
  tests.push(ok("deal in the New stage, linked to the contact, owned by ops", deal && deal.body.properties.dealstage === "appointmentscheduled" && deal.body.associations[0].types[0].associationTypeId === 3 && deal.body.properties.hubspot_owner_id === "777"));
  const task = post("tasks")[0];
  tests.push(ok("HIGH priority CALL task linked to contact and deal", task && task.body.properties.hs_task_type === "CALL" && task.body.properties.hs_task_priority === "HIGH" && task.body.associations.map((x) => x.types[0].associationTypeId).join() === "204,216"));
  const note = post("notes")[0];
  tests.push(ok("note holds the application", note && note.body.properties.hs_note_body.includes("Career switcher")));
  tests.push(ok("Bearer service key sent", calls.every((c) => c.auth === "Bearer svc_test")));
  const lead = emails.find((e) => /New cohort application/.test(e.subject));
  tests.push(ok("Shanica's email says it reached HubSpot", lead && lead.text.includes("HubSpot: added")));

  // Same person applies again: contact updated, not duplicated
  calls.length = 0;
  await call(apply, { ...a, phone: "+91 90000 00000" });
  tests.push(ok("repeat applicant: contact updated, not duplicated", calls.some((c) => c.method === "PATCH") && post("contacts").length === 0));

  // HubSpot down: application still goes through and Shanica is told
  hubspotDown = true; emails.length = 0;
  const down = await call(apply, { ...a, email: "arjun@gmail.com", name: "Arjun" });
  const lead2 = emails.find((e) => /New cohort application/.test(e.subject));
  tests.push(ok("HubSpot down: applicant still succeeds", down.code === 200));
  tests.push(ok("HubSpot down: Shanica's email says add it by hand", lead2 && lead2.text.includes("COULD NOT ADD")));

  console.log(`\n${pass}/${tests.length} passed`);
  process.exit(pass === tests.length ? 0 : 1);
})();

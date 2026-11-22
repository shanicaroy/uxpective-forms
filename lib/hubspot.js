// HubSpot sync for the UXPective cohort forms.
//
//   Application   -> contact (created or updated by email)
//                    + deal in the first pipeline stage ("New application")
//                    + note with the full application
//                    + CALL task "Call within 15 minutes", assigned to the ops person
//   Curriculum    -> contact + note + low-priority TODO task for the next morning
//
// Auth: a HubSpot Service Key (Settings -> Integrations -> Service Keys), sent as a Bearer token.
// Nothing here ever blocks the visitor: every caller wraps it and falls back to email.

const env = (k, d = "") => (process.env[k] || d).trim();

const BASE = "https://api.hubapi.com";
const version = () => env("HUBSPOT_API_VERSION", "2026-03");
const objects = (type) => `/crm/objects/${version()}/${type}`;

// HubSpot-defined association type IDs (stable defaults).
const ASSOC = {
  dealToContact: 3,
  noteToContact: 202,
  noteToDeal: 214,
  taskToContact: 204,
  taskToDeal: 216,
};

const enabled = () => !!env("HUBSPOT_TOKEN");

async function hs(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${env("HUBSPOT_TOKEN")}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (r.status === 404) return null;
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`HubSpot ${method} ${path} -> ${r.status}: ${data.message || JSON.stringify(data).slice(0, 300)}`);
  return data;
}

const link = (id, typeId) => ({ to: { id: String(id) }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: typeId }] });

function splitName(full) {
  const parts = String(full || "").trim().split(/\s+/);
  return { firstname: parts[0] || "", lastname: parts.slice(1).join(" ") };
}

// ---------- owner ----------
let cachedOwner;
async function ownerId() {
  if (cachedOwner !== undefined) return cachedOwner;
  if (env("HUBSPOT_OWNER_ID")) return (cachedOwner = env("HUBSPOT_OWNER_ID"));
  const email = env("HUBSPOT_OWNER_EMAIL");
  cachedOwner = null;
  if (email) {
    try {
      const data = await hs("GET", `/crm/v3/owners/?email=${encodeURIComponent(email)}&limit=1`);
      cachedOwner = data && data.results && data.results[0] ? String(data.results[0].id) : null;
    } catch (err) {
      console.error("HubSpot owner lookup failed:", err.message);
    }
  }
  return cachedOwner;
}

// ---------- due times (IST) ----------
const IST_OFFSET_MIN = 330;

// Within calling hours (9 am to 9 pm IST): now + 15 minutes. Otherwise: 10 am IST next calling morning.
function callDueTime(now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60000);
  const h = ist.getUTCHours() + ist.getUTCMinutes() / 60;
  if (h >= 9 && h < 21) return new Date(now.getTime() + 15 * 60000);
  return nextIstMorning(now, h >= 21);
}

// 10 am IST on the next morning (today's morning if it is before 9 am IST).
function nextIstMorning(now = new Date(), forceTomorrow = true) {
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60000);
  const day = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + (forceTomorrow ? 1 : 0), 10, 0));
  return new Date(day.getTime() - IST_OFFSET_MIN * 60000);
}

// ---------- records ----------
async function upsertContact({ name, email, phone }) {
  const props = { email, ...splitName(name), ...(phone ? { phone } : {}) };
  const existing = await hs("GET", `${objects("contacts")}/${encodeURIComponent(email)}?idProperty=email`);
  if (existing && existing.id) {
    await hs("PATCH", `${objects("contacts")}/${existing.id}`, { properties: props });
    return { id: String(existing.id), created: false };
  }
  const made = await hs("POST", objects("contacts"), { properties: { ...props, lifecyclestage: "lead" } });
  return { id: String(made.id), created: true };
}

async function createDeal({ name, contactId, owner }) {
  const made = await hs("POST", objects("deals"), {
    properties: {
      dealname: `${name} - Product Design Cohort '27`,
      pipeline: env("HUBSPOT_PIPELINE_ID", "default"),
      dealstage: env("HUBSPOT_NEW_STAGE_ID", "appointmentscheduled"),
      ...(owner ? { hubspot_owner_id: owner } : {}),
    },
    associations: [link(contactId, ASSOC.dealToContact)],
  });
  return String(made.id);
}

async function createNote({ body, contactId, dealId, owner }) {
  const associations = [link(contactId, ASSOC.noteToContact)];
  if (dealId) associations.push(link(dealId, ASSOC.noteToDeal));
  await hs("POST", objects("notes"), {
    properties: { hs_timestamp: new Date().toISOString(), hs_note_body: body, ...(owner ? { hubspot_owner_id: owner } : {}) },
    associations,
  });
}

async function createTask({ subject, body, due, type, priority, contactId, dealId, owner }) {
  const associations = [link(contactId, ASSOC.taskToContact)];
  if (dealId) associations.push(link(dealId, ASSOC.taskToDeal));
  await hs("POST", objects("tasks"), {
    properties: {
      hs_timestamp: due.toISOString(),
      hs_task_subject: subject,
      hs_task_body: body,
      hs_task_status: "NOT_STARTED",
      hs_task_priority: priority,
      hs_task_type: type,
      ...(owner ? { hubspot_owner_id: owner } : {}),
    },
    associations,
  });
}

const esc = (s) => String(s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// ---------- the two flows ----------

/** @returns {Promise<{ok: true, dealId: string} | {ok: false, skipped?: true, error?: string}>} */
async function syncApplication(a) {
  if (!enabled()) return { ok: false, skipped: true };
  try {
    const owner = await ownerId();
    const contact = await upsertContact(a);
    const dealId = await createDeal({ name: a.name, contactId: contact.id, owner });
    const lines = [
      `<b>Application: Product Design Cohort '27</b>`,
      `Phone: ${esc(a.phone)}`,
      `Right now: ${esc(a.stage || "(not given)")}`,
      `Experience: ${esc(a.experience || "(not given)")}`,
      `LinkedIn or portfolio: ${esc(a.link || "(not given)")}`,
      `What they want from the cohort: ${esc(a.goal || "(not given)")}`,
      `Page: ${esc(a.page || "(unknown)")}`,
    ];
    await createNote({ body: lines.join("<br>"), contactId: contact.id, dealId, owner });
    await createTask({
      subject: `Call ${a.name} - new cohort application`,
      body: `Call within 15 minutes. No answer: send WhatsApp message A and try again in 2 hours. Phone: ${a.phone}`,
      due: callDueTime(),
      type: "CALL",
      priority: "HIGH",
      contactId: contact.id,
      dealId,
      owner,
    });
    return { ok: true, dealId };
  } catch (err) {
    console.error("HubSpot application sync failed:", err.message);
    return { ok: false, error: err.message };
  }
}

async function syncCurriculum(c) {
  if (!enabled()) return { ok: false, skipped: true };
  try {
    const owner = await ownerId();
    const contact = await upsertContact(c);
    await createNote({ body: `Downloaded the Product Design Cohort '27 curriculum.<br>Page: ${esc(c.page || "(unknown)")}`, contactId: contact.id, owner });
    await createTask({
      subject: `Follow up: ${c.name} downloaded the curriculum`,
      body: `They have the curriculum but haven't applied. WhatsApp to ask if they have questions and offer a 15-minute call. Phone: ${c.phone}`,
      due: nextIstMorning(new Date(), true),
      type: "TODO",
      priority: "LOW",
      contactId: contact.id,
      owner,
    });
    return { ok: true };
  } catch (err) {
    console.error("HubSpot curriculum sync failed:", err.message);
    return { ok: false, error: err.message };
  }
}

// Give up after a few seconds so a slow HubSpot never holds up the form.
function withTimeout(promise, ms = 8000) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: "timed out" }), ms))]);
}

module.exports = { syncApplication, syncCurriculum, withTimeout, callDueTime, nextIstMorning, _reset: () => (cachedOwner = undefined) };

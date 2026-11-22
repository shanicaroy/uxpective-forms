// Shared helpers for the UXPective cohort forms (curriculum + apply).
// Students and career switchers use personal inboxes, so unlike the media kit,
// Gmail/Outlook/Yahoo are welcome here. Only throwaway inboxes and domains
// that can't receive mail are refused.

const fs = require("fs");
const path = require("path");
const dns = require("dns").promises;
const DISPOSABLE = require("disposable-email-domains");

const env = (k, d = "") => (process.env[k] || d).trim();

const EMAIL_RE = /^[^\s@]+@([a-z0-9-]+\.)+[a-z]{2,}$/i;
const DISPOSABLE_SET = new Set(DISPOSABLE.map((d) => d.toLowerCase()));

const CURRICULUM_PATH = path.join(process.cwd(), "assets", "uxpective-product-design-cohort-27-curriculum.pdf");
const CURRICULUM_FILENAME = "UXPective-Product-Design-Cohort-27-Curriculum.pdf";

// ---------- CORS ----------
function isAllowedOrigin(origin) {
  if (!origin) return false;
  const allowed = env("COHORT_ALLOWED_ORIGINS", "https://uxpective.com,https://www.uxpective.com")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (allowed.includes(origin)) return true;
  // Framer editor + preview links, so the forms can be tested before publishing
  try {
    const host = new URL(origin).hostname;
    return /(^|\.)framer\.(app|website|com|media)$/.test(host) || /(^|\.)framercanvas\.com$/.test(host);
  } catch {
    return false;
  }
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
}

// Common preamble for both endpoints. Returns the parsed body, or null if it already responded.
function begin(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.status(204).end(); return null; }
  if (req.method !== "POST") { res.status(405).json({ ok: false, message: "Use POST." }); return null; }
  if (req.headers.origin && !isAllowedOrigin(req.headers.origin)) {
    res.status(403).json({ ok: false, message: "This form can only be used on uxpective.com." });
    return null;
  }
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  return body || {};
}

// ---------- Email check ----------
async function hasMailServer(domain) {
  const lookup = dns.resolveMx(domain).then((r) => (r && r.length > 0 ? "yes" : "no"));
  const timeout = new Promise((resolve) => setTimeout(() => resolve("unknown"), 3000));
  try {
    const result = await Promise.race([lookup, timeout]);
    return result !== "no";
  } catch (err) {
    if (["ENOTFOUND", "ENODATA", "ESERVFAIL", "EBADNAME", "ENONAME"].includes(err.code)) return false;
    return true;
  }
}

function inSet(set, domain) {
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (set.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

const EMAIL_MESSAGES = {
  invalid: "Enter a valid email address, like name@gmail.com.",
  disposable: "Temporary inboxes can't receive this. Use an email you check.",
  no_mail: "This email domain can't receive mail. Check the spelling.",
};

/** @returns {Promise<{ok: true, email: string} | {ok: false, message: string}>} */
async function checkEmail(raw) {
  const email = String(raw || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, message: EMAIL_MESSAGES.invalid };
  const domain = email.split("@").pop().replace(/\.$/, "");
  if (inSet(DISPOSABLE_SET, domain)) return { ok: false, message: EMAIL_MESSAGES.disposable };
  if (!(await hasMailServer(domain))) return { ok: false, message: EMAIL_MESSAGES.no_mail };
  return { ok: true, email };
}

// ---------- Sending (Resend REST API) ----------
async function sendEmail(payload) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`Resend ${r.status}: ${detail}`);
  }
  return r.json();
}

let cachedPdf = null;
/** Base64 of the curriculum PDF, or null if it hasn't been added to /assets yet. */
function loadCurriculum() {
  if (cachedPdf) return cachedPdf;
  try {
    cachedPdf = fs.readFileSync(CURRICULUM_PATH).toString("base64");
    return cachedPdf;
  } catch {
    return null;
  }
}

const clip = (v, n) => String(v || "").trim().slice(0, n);

module.exports = {
  env, begin, checkEmail, sendEmail, loadCurriculum, clip,
  CURRICULUM_FILENAME, CURRICULUM_PATH,
};

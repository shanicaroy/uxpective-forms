// Local test for the cohort endpoints. Mocks DNS and Resend, nothing real is sent.
// Run: node test/cohort.js
const fs = require("fs");
const dns = require("dns").promises;
dns.resolveMx = async (d) => {
  if (["gmail.com", "uxpective.com", "acme.io"].includes(d)) return [{ exchange: "mx", priority: 1 }];
  const e = new Error("nope"); e.code = "ENOTFOUND"; throw e;
};
const sent = [];
global.fetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({ id: "x" }) }; };
Object.assign(process.env, {
  RESEND_API_KEY: "re_test", FROM_EMAIL: "Shanica Roy <shanica@uxpective.com>",
  REPLY_TO: "shanica@uxpective.com", NOTIFY_EMAIL: "shanica@uxpective.com",
});

const { CURRICULUM_PATH } = require("../lib/cohort");
const hadPdf = fs.existsSync(CURRICULUM_PATH);

function call(handler, body, origin = "https://www.uxpective.com") {
  return new Promise((resolve) => {
    const res = { headers: {}, code: 200,
      setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
      json(b) { resolve({ code: this.code, body: b }); }, end() { resolve({ code: this.code, body: {} }); } };
    handler({ method: "POST", headers: { origin }, body }, res);
  });
}

(async () => {
  let pass = 0, total = 0;
  const check = async (label, handler, body, want, opts = {}) => {
    const before = sent.length;
    const r = await call(handler, body, opts.origin);
    const emails = sent.slice(before);
    const ok = r.code === want && (opts.emails === undefined || emails.length === opts.emails)
      && (opts.attach === undefined || emails.some((e) => !!e.attachments) === opts.attach);
    total++; pass += ok;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(30)} -> ${r.code} ${r.body.message || ""} [${emails.length} email(s)${emails.some((e) => e.attachments) ? ", PDF attached" : ""}]`);
  };

  const apply = require("../api/cohort-apply");
  const curriculum = require("../api/cohort-curriculum");
  const good = { name: "Riya Sen", email: "Riya@Gmail.com", phone: "+91 98765 43210", stage: "Career switcher", experience: "New to design", goal: "Get my first design role" };

  // Without the PDF in /assets
  if (!hadPdf) {
    await check("curriculum, PDF not added yet", curriculum, { name: "Riya", email: "riya@gmail.com", phone: "+91 98765 43210" }, 200, { emails: 1, attach: false });
    await check("apply, PDF not added yet", apply, good, 200, { emails: 2, attach: false });
  }

  // With a placeholder PDF
  if (!hadPdf) fs.writeFileSync(CURRICULUM_PATH, "%PDF-1.4 placeholder");
  delete require.cache[require.resolve("../lib/cohort")];
  delete require.cache[require.resolve("../api/cohort-apply")];
  delete require.cache[require.resolve("../api/cohort-curriculum")];
  const apply2 = require("../api/cohort-apply");
  const curriculum2 = require("../api/cohort-curriculum");
  try {
    await check("curriculum, gmail ok", curriculum2, { name: "Riya", email: "riya@gmail.com", phone: "+91 98765 43210" }, 200, { emails: 2, attach: true });
    await check("curriculum, no name", curriculum2, { name: "", email: "riya@gmail.com", phone: "+91 98765 43210" }, 400);
    await check("curriculum, throwaway inbox", curriculum2, { name: "R", email: "r@mailinator.com", phone: "+91 98765 43210" }, 400);
    await check("curriculum, fake domain", curriculum2, { name: "R", email: "r@nope-xyz-123.com", phone: "+91 98765 43210" }, 400);
    await check("curriculum, bot trap", curriculum2, { name: "R", email: "r@gmail.com", website: "x" }, 200, { emails: 0 });
    await check("curriculum, other website", curriculum2, { name: "R", email: "r@gmail.com", phone: "+91 98765 43210" }, 403, { origin: "https://evil.example" });
    await check("curriculum, framer preview", curriculum2, { name: "R", email: "r@gmail.com", phone: "+91 98765 43210" }, 200, { origin: "https://uxpective.framer.website" });
    await check("curriculum, no phone", curriculum2, { name: "R", email: "r@gmail.com" }, 400);
    await check("apply, full", apply2, good, 200, { emails: 2, attach: true });
    await check("apply, no phone", apply2, { ...good, phone: "" }, 400);
    await check("apply, bad phone", apply2, { ...good, phone: "abc" }, 400);
    await check("apply, bad email", apply2, { ...good, email: "riya" }, 400);
    await check("apply, only required fields", apply2, { name: "A", email: "a@acme.io", phone: "+971 50 123 4567" }, 200, { emails: 2 });
  } finally {
    if (!hadPdf) fs.unlinkSync(CURRICULUM_PATH);
  }

  const lead = sent.find((e) => /New cohort application/.test(e.subject));
  console.log("\n--- sample notification to Shanica ---\n" + lead.subject + "\n" + lead.text);
  const conf = sent.find((e) => /Your application/.test(e.subject));
  console.log("\n--- sample confirmation to applicant ---\n" + conf.subject + "\n" + conf.text);
  console.log(`\n${pass}/${total} passed`);
  process.exit(pass === total ? 0 : 1);
})();

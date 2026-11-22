// POST /api/cohort-apply
// Body: { name, email, phone, stage?, experience?, link?, goal?, page?, website? }
// Sends Shanica (COHORT_NOTIFY_EMAIL, else NOTIFY_EMAIL) the full application,
// and sends the applicant a confirmation from Shanica, with the curriculum attached
// when the PDF is in /assets.
// Success: 200 { ok: true }
// Failure: 4xx/5xx { ok: false, field?: "name" | "email" | "phone", message }

const { env, begin, checkEmail, sendEmail, loadCurriculum, clip, CURRICULUM_FILENAME } = require("../lib/cohort");
const { applyConfirmationEmail, applicationLeadEmail } = require("../lib/cohort-emails");
const { syncApplication, withTimeout } = require("../lib/hubspot");

const PHONE_RE = /^\+?[0-9 ()\-.]{7,20}$/;

module.exports = async function handler(req, res) {
  const body = begin(req, res);
  if (!body) return;

  if (body.website) return res.status(200).json({ ok: true });

  const a = {
    name: clip(body.name, 120),
    phone: clip(body.phone, 40),
    stage: clip(body.stage, 80),
    experience: clip(body.experience, 80),
    link: clip(body.link, 300),
    goal: clip(body.goal, 2000),
    page: clip(body.page, 300),
  };

  if (!a.name) return res.status(400).json({ ok: false, field: "name", message: "Enter your name." });

  const check = await checkEmail(body.email);
  if (!check.ok) return res.status(400).json({ ok: false, field: "email", message: check.message });
  a.email = check.email;

  if (!PHONE_RE.test(a.phone) || a.phone.replace(/\D/g, "").length < 7) {
    return res.status(400).json({ ok: false, field: "phone", message: "Enter a phone number with your country code, like +91 98765 43210." });
  }

  const replyTo = env("REPLY_TO");
  const notify = env("COHORT_NOTIFY_EMAIL", env("NOTIFY_EMAIL"));
  const fallback = `Your application couldn't be sent right now. Email ${replyTo || "hello@uxpective.com"} and we'll take it from there.`;

  if (!env("RESEND_API_KEY") || !env("FROM_EMAIL") || !notify) {
    console.error("Missing RESEND_API_KEY, FROM_EMAIL or NOTIFY_EMAIL");
    return res.status(500).json({ ok: false, message: fallback });
  }

  // Card + call task in HubSpot for the ops person. Never blocks: the email below is the backup.
  const crm = await withTimeout(syncApplication(a));

  // The application reaching Shanica is the part that must succeed.
  const lead = applicationLeadEmail({ ...a, crm });
  try {
    await sendEmail({ from: env("FROM_EMAIL"), to: [notify], reply_to: a.email, subject: lead.subject, text: lead.text });
  } catch (err) {
    console.error("Application notification failed:", err.message);
    return res.status(502).json({ ok: false, message: `Your application couldn't be sent. Try again in a minute, or email ${replyTo || "hello@uxpective.com"}.` });
  }

  // Confirmation to the applicant. A failure here never loses the application.
  const pdf = loadCurriculum();
  const c = applyConfirmationEmail({ name: a.name, withCurriculum: !!pdf });
  try {
    await sendEmail({
      from: env("FROM_EMAIL"),
      to: [a.email],
      subject: c.subject,
      html: c.html,
      text: c.text,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(pdf ? { attachments: [{ filename: CURRICULUM_FILENAME, content: pdf }] } : {}),
    });
  } catch (err) {
    console.error("Applicant confirmation failed:", err.message);
  }

  return res.status(200).json({ ok: true });
};

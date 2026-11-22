// POST /api/cohort-curriculum
// Body: { name, email, phone, page?, website? }   ("website" is a hidden bot trap)
// Emails the Product Design Cohort '27 curriculum PDF to the visitor as an attachment,
// and notifies Shanica (NOTIFY_EMAIL) of the lead.
// Success: 200 { ok: true }
// Failure: 4xx/5xx { ok: false, field?: "name" | "email", message }

const { env, begin, checkEmail, sendEmail, loadCurriculum, clip, CURRICULUM_FILENAME } = require("../lib/cohort");
const { curriculumEmail, curriculumLeadEmail } = require("../lib/cohort-emails");
const { syncCurriculum, withTimeout } = require("../lib/hubspot");

const PHONE_RE = /^\+?[0-9 ()\-.]{7,20}$/;

module.exports = async function handler(req, res) {
  const body = begin(req, res);
  if (!body) return;

  if (body.website) return res.status(200).json({ ok: true });

  const name = clip(body.name, 120);
  const phone = clip(body.phone, 40);
  const page = clip(body.page, 300);

  if (!name) return res.status(400).json({ ok: false, field: "name", message: "Enter your name." });

  if (!PHONE_RE.test(phone) || phone.replace(/\D/g, "").length < 7) {
    return res.status(400).json({ ok: false, field: "phone", message: "Enter a phone number with your country code, like +91 98765 43210." });
  }

  const check = await checkEmail(body.email);
  if (!check.ok) return res.status(400).json({ ok: false, field: "email", message: check.message });

  const replyTo = env("REPLY_TO");
  const fallback = `The curriculum couldn't be sent right now. Email ${replyTo || "hello@uxpective.com"} and it'll come to you directly.`;

  if (!env("RESEND_API_KEY") || !env("FROM_EMAIL")) {
    console.error("Missing RESEND_API_KEY or FROM_EMAIL");
    return res.status(500).json({ ok: false, message: fallback });
  }

  const notify = env("COHORT_NOTIFY_EMAIL", env("NOTIFY_EMAIL"));
  const pdf = loadCurriculum();
  if (!pdf) {
    // Until the PDF is added to /assets: capture the request and send it to Shanica,
    // who replies with the PDF attached (reply-to is the visitor). The visitor is told it's coming.
    console.error("Curriculum PDF missing from /assets; sending the request to Shanica instead");
    if (!notify) return res.status(500).json({ ok: false, message: fallback });
    const crm = await withTimeout(syncCurriculum({ name, email: check.email, phone, page }));
    const n = curriculumLeadEmail({ name, email: check.email, phone, page, crm, manual: true });
    try {
      await sendEmail({ from: env("FROM_EMAIL"), to: [notify], reply_to: check.email, subject: n.subject, text: n.text });
    } catch (err) {
      console.error("Curriculum request notification failed:", err.message);
      return res.status(502).json({ ok: false, message: fallback });
    }
    return res.status(200).json({ ok: true, pending: true });
  }

  const { subject, html, text } = curriculumEmail({ name });
  const crmSync = withTimeout(syncCurriculum({ name, email: check.email, phone, page }));
  try {
    await sendEmail({
      from: env("FROM_EMAIL"),
      to: [check.email],
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
      attachments: [{ filename: CURRICULUM_FILENAME, content: pdf }],
    });
  } catch (err) {
    console.error("Curriculum send failed:", err.message);
    return res.status(502).json({ ok: false, message: `The curriculum couldn't be sent. Try again in a minute, or email ${replyTo || "hello@uxpective.com"}.` });
  }

  const crm = await crmSync;
  if (notify) {
    const n = curriculumLeadEmail({ name, email: check.email, phone, page, crm });
    try {
      await sendEmail({ from: env("FROM_EMAIL"), to: [notify], reply_to: check.email, subject: n.subject, text: n.text });
    } catch (err) {
      console.error("Curriculum lead notification failed:", err.message);
    }
  }

  return res.status(200).json({ ok: true });
};

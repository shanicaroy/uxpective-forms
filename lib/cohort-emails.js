// Emails for the UXPective cohort forms. Plain, personal styling like the
// media kit email: no card, no banner, reads like a typed note from Shanica.

const esc = (s) =>
  String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const firstName = (name) => (name || "").trim().split(/\s+/)[0] || "there";

const COHORT = "Product Design Cohort '27";
const COHORT_HTML = "Product Design Cohort &rsquo;27";

function wrap(paragraphs) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;">${p}</p>`).join("\n    ");
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#ffffff;">
  <div style="max-width:560px;margin:0;padding:24px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;color:#1a1a1a;font-size:15px;line-height:1.6;">
    ${body}
    <p style="margin:8px 0 10px;line-height:1.35;">Regards,</p>
    <p style="margin:0;line-height:1.35;font-weight:700;font-size:16px;">Shanica Roy</p>
    <p style="margin:0;line-height:1.35;">Founder, UXPective</p>
    <p style="margin:0;line-height:1.35;"><a href="https://www.uxpective.com" style="color:#1a73e8;text-decoration:none;font-size:13px;">www.uxpective.com</a></p>
  </div>
</body>
</html>`;
}

const SIGN_OFF = ["", "Regards,", "Shanica Roy", "Founder, UXPective", "www.uxpective.com"];

// ---------- To the visitor ----------

function curriculumEmail({ name }) {
  const subject = `Your ${COHORT} curriculum`;
  const html = wrap([
    `Hi ${esc(firstName(name))},`,
    `The curriculum for the ${COHORT_HTML} is attached to this email as a PDF. It walks through all five months: what you'll learn each week, the projects you'll build, and how the live sessions run.`,
    `The cohort starts on 1 January 2027 and seats are limited to 30. When you're ready, you can apply on <a href="https://www.uxpective.com/cohorts" style="color:#1a73e8;text-decoration:none;">uxpective.com/cohorts</a>.`,
    `If anything in the curriculum raises a question, reply to this email. It comes straight to me.`,
  ]);
  const text = [
    `Hi ${firstName(name)},`,
    "",
    `The curriculum for the ${COHORT} is attached to this email as a PDF. It walks through all five months: what you'll learn each week, the projects you'll build, and how the live sessions run.`,
    "",
    "The cohort starts on 1 January 2027 and seats are limited to 30. When you're ready, you can apply on uxpective.com/cohorts.",
    "",
    "If anything in the curriculum raises a question, reply to this email. It comes straight to me.",
    ...SIGN_OFF,
  ].join("\n");
  return { subject, html, text };
}

function applyConfirmationEmail({ name, withCurriculum }) {
  const subject = `Your application for the ${COHORT}`;
  const attached = withCurriculum
    ? "I've attached the full curriculum as a PDF so you can see exactly what the five months cover."
    : "";
  const html = wrap([
    `Hi ${esc(firstName(name))},`,
    `Thanks for applying to the ${COHORT_HTML}. Your application is in.`,
    `I'll reach out personally to talk through where you are, what you want from the cohort, and the next steps. ${attached}`.trim(),
    `If there's anything you'd like me to know before we talk, reply to this email. It comes straight to me.`,
  ]);
  const text = [
    `Hi ${firstName(name)},`,
    "",
    `Thanks for applying to the ${COHORT}. Your application is in.`,
    "",
    `I'll reach out personally to talk through where you are, what you want from the cohort, and the next steps. ${attached}`.trim(),
    "",
    "If there's anything you'd like me to know before we talk, reply to this email. It comes straight to me.",
    ...SIGN_OFF,
  ].join("\n");
  return { subject, html, text };
}

// ---------- To Shanica ----------

function crmLine(crm) {
  if (!crm || crm.skipped) return "HubSpot: not connected yet.";
  if (crm.ok) return "HubSpot: added, with a task for the ops person.";
  return "HubSpot: COULD NOT ADD. Create this card by hand. (" + (crm.error || "unknown error") + ")";
}

function curriculumLeadEmail({ name, email, phone, page, crm, manual }) {
  return {
    subject: manual ? `Curriculum request, send the PDF: ${name}` : `Curriculum download: ${name}`,
    text: [
      manual
        ? `${name} asked for the ${COHORT} curriculum. The PDF isn't on the server yet, so they were told it will be emailed to them. Reply to this email with the PDF attached: your reply goes straight to them.`
        : `${name} downloaded the ${COHORT} curriculum.`,
      "",
      `Name:   ${name}`,
      `Email:  ${email}`,
      `Phone:  ${phone || "(not given)"}`,
      `Page:   ${page || "(unknown)"}`,
      `Time:   ${new Date().toISOString()}`,
      "",
      crmLine(crm),
      "",
      "Reply to this email to write to them directly.",
    ].join("\n"),
  };
}

function applicationLeadEmail(a) {
  return {
    subject: `New cohort application: ${a.name}`,
    text: [
      `New application for the ${COHORT}.`,
      "",
      `Name:        ${a.name}`,
      `Email:       ${a.email}`,
      `Phone:       ${a.phone}`,
      `Right now:   ${a.stage || "(not given)"}`,
      `Experience:  ${a.experience || "(not given)"}`,
      `LinkedIn or portfolio: ${a.link || "(not given)"}`,
      "",
      "What they want from the cohort:",
      a.goal || "(not given)",
      "",
      `Page:  ${a.page || "(unknown)"}`,
      `Time:  ${new Date().toISOString()}`,
      "",
      crmLine(a.crm),
      "",
      "Reply to this email to write to them directly.",
    ].join("\n"),
  };
}

module.exports = { curriculumEmail, applyConfirmationEmail, curriculumLeadEmail, applicationLeadEmail };

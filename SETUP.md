# UXPective cohort forms

Backend for the two forms on the Product Design Cohort '27 page:

| Endpoint | What it does |
|---|---|
| `/api/cohort-apply` | Emails you the full application (reply goes to the applicant) and sends the applicant a confirmation from you, with the curriculum attached when the PDF is present. |
| `/api/cohort-curriculum` | Emails the curriculum PDF as an attachment and notifies you. Until the PDF is added, it emails you the request instead (reply goes to the applicant) and tells the visitor it's on its way. |

Name, email and phone are required on both. Personal inboxes (Gmail, Outlook) are accepted; throwaway inboxes and domains that can't receive mail are refused. Only uxpective.com and Framer preview links can call the endpoints.

Deploys on Vercel. Email is sent through Resend, same as the media kit project uses. HubSpot is optional and off until its key is set.

## Vercel environment variables

Required for email:

| Name | Value |
|---|---|
| `RESEND_API_KEY` | the Resend API key (same one the media kit project uses) |
| `FROM_EMAIL` | `Shanica Roy <shanica@uxpective.com>` or your verified sending address |
| `REPLY_TO` | the address replies should go to |
| `NOTIFY_EMAIL` | where applications and curriculum requests land |

Optional:

| Name | Value |
|---|---|
| `COHORT_NOTIFY_EMAIL` | applications, if different from `NOTIFY_EMAIL` |
| `COHORT_ALLOWED_ORIGINS` | defaults to `https://uxpective.com,https://www.uxpective.com`. Framer previews are always allowed. |

## The curriculum PDF

Put the curriculum in `assets/` named exactly `uxpective-product-design-cohort-27-curriculum.pdf`. Until it's there, curriculum requests are emailed to you to answer by hand, and applications still go through without the attachment.

## HubSpot (optional)

When `HUBSPOT_TOKEN` is set, each application creates a contact, a deal in the first pipeline stage, a note and a call task for the ops person; each curriculum download creates a contact and a follow-up task. If HubSpot fails, the visitor is unaffected and your email flags it. Variables: `HUBSPOT_TOKEN`, `HUBSPOT_OWNER_EMAIL` (or `HUBSPOT_OWNER_ID`), and optionally `HUBSPOT_PIPELINE_ID`, `HUBSPOT_NEW_STAGE_ID`, `HUBSPOT_API_VERSION` (defaults to `2026-03`).

Create the key under HubSpot Settings → Integrations → Service Keys with scopes `crm.objects.contacts.read/write`, `crm.objects.deals.read/write` and `crm.objects.owners.read`.

## The Framer side

The `CohortForm` code component in the UXPective Framer project has an Endpoint setting. Point the apply form at `.../api/cohort-apply` and the curriculum form at `.../api/cohort-curriculum`, using this project's Vercel URL.

## Local tests (nothing real is sent)

    npm install
    npm test

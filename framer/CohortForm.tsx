// UXPective cohort forms: "Apply for the cohort" and "Download Curriculum".
// Posts to the Vercel endpoints in the uxpective-forms project:
//   apply      -> /api/cohort-apply       (application to Shanica + confirmation to applicant)
//   curriculum -> /api/cohort-curriculum  (curriculum PDF emailed as an attachment)
import { useRef, useState } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

const EMAIL_RE = /^[^\s@]+@([a-z0-9-]+\.)+[a-z]{2,}$/i
const PHONE_RE = /^\+?[0-9 ()\-.]{7,20}$/

const STAGES = ["Student", "Working designer", "Career switcher", "Product manager or engineer", "Researcher", "Something else"]
const EXPERIENCE = ["New to design", "Less than 1 year", "1 to 3 years", "3 to 5 years", "5+ years"]

type Mode = "apply" | "curriculum"
type Status = "idle" | "sending" | "sent"
type Errors = { name?: string; email?: string; phone?: string; form?: string }

interface Props {
    mode: Mode
    endpoint: string
    eyebrow: string
    heading: string
    intro: string
    buttonLabel: string
    footnote: string
    onClose?: () => void
    style?: React.CSSProperties
}

const C = {
    ink: "#0F0A1F",
    body: "#4A4560",
    muted: "#8A8599",
    line: "#E4DFEE",
    soft: "#F7F5FB",
    focus: "#00A5FF",
    error: "#D93A5B",
    grad: "linear-gradient(90deg, #00A5FF 0%, #C649E6 100%)",
    textGrad: "linear-gradient(90deg, rgb(43,132,229) 0%, rgb(218,65,141) 95%)",
}

/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
export default function CohortForm(props: Props) {
    const { mode, endpoint, eyebrow, heading, intro, buttonLabel, footnote, onClose, style } = props
    const HEAD = "'Bricolage Grotesque', 'Inter', system-ui, sans-serif"
    const BODY = "'Inter', system-ui, -apple-system, sans-serif"
    const onCanvas = RenderTarget.current() === RenderTarget.canvas
    const isApply = mode === "apply"

    const [f, setF] = useState({ name: "", email: "", phone: "", stage: "", experience: "", link: "", goal: "" })
    const [trap, setTrap] = useState("")
    const [errors, setErrors] = useState<Errors>({})
    const [status, setStatus] = useState<Status>("idle")
    const [pending, setPending] = useState(false)
    const refs = { name: useRef<HTMLInputElement>(null), email: useRef<HTMLInputElement>(null), phone: useRef<HTMLInputElement>(null) }
    const uid = useRef("cf" + Math.random().toString(36).slice(2, 8)).current

    const set = (k: keyof typeof f) => (e: any) => {
        setF({ ...f, [k]: e.target.value })
        if ((errors as any)[k]) setErrors({ ...errors, [k]: undefined })
    }

    function validate(): Errors {
        const e: Errors = {}
        if (!f.name.trim()) e.name = "Enter your name."
        if (!EMAIL_RE.test(f.email.trim())) e.email = "Enter a valid email address, like name@gmail.com."
        const phone = f.phone.trim()
        if (!PHONE_RE.test(phone) || phone.replace(/\D/g, "").length < 7)
            e.phone = "Enter a phone number with your country code, like +91 98765 43210."
        return e
    }

    async function onSubmit(ev: any) {
        ev.preventDefault()
        if (status === "sending") return
        const e = validate()
        setErrors(e)
        const first = (["name", "email", "phone"] as const).find((k) => e[k])
        if (first) return refs[first].current?.focus()
        if (!endpoint) return setErrors({ form: "Add the endpoint URL in the component settings." })

        setStatus("sending")
        try {
            const r = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()])),
                    page: typeof window !== "undefined" ? window.location.href : "",
                    website: trap,
                }),
            })
            const data = await r.json().catch(() => ({}))
            if (r.ok && data.ok) {
                setPending(!!data.pending)
                return setStatus("sent")
            }
            setStatus("idle")
            if (data.field && (refs as any)[data.field]) {
                setErrors({ [data.field]: data.message })
                ;(refs as any)[data.field].current?.focus()
            } else {
                setErrors({ form: data.message || "That didn’t go through. Try again in a minute." })
            }
        } catch {
            setStatus("idle")
            setErrors({ form: "That didn’t go through. Check your connection and try again." })
        }
    }

    // ---------- styles ----------
    const card: React.CSSProperties = {
        ...style,
        position: "relative",
        boxSizing: "border-box",
        width: "100%",
        maxHeight: onCanvas ? undefined : "calc(100dvh - 32px)",
        overflowY: onCanvas ? "visible" : "auto",
        background: "#FFFFFF",
        color: C.ink,
        fontFamily: BODY,
        borderRadius: 12,
        boxShadow: "0 24px 64px rgba(15,10,31,0.18), 0 2px 8px rgba(15,10,31,0.08)",
    }
    const label: React.CSSProperties = { display: "block", fontSize: 14, fontWeight: 500, marginBottom: 8, color: C.ink }
    const optional = <span style={{ color: C.muted, fontWeight: 400 }}> (optional)</span>
    const field = (bad: boolean): React.CSSProperties => ({
        boxSizing: "border-box",
        width: "100%",
        height: 48,
        padding: "0 14px",
        fontSize: 16,
        fontFamily: BODY,
        color: C.ink,
        background: "#FFFFFF",
        border: "1px solid " + (bad ? C.error : C.line),
        borderRadius: 6,
        outline: "none",
        appearance: "none",
        WebkitAppearance: "none",
    })
    const errText: React.CSSProperties = { color: C.error, fontSize: 13, lineHeight: 1.45, marginTop: 8 }
    const gap: React.CSSProperties = { marginBottom: 18 }
    const chevron = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' stroke='%238A8599' stroke-width='1.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") no-repeat right 14px center"

    const css = [
        "#" + uid + " input:focus, #" + uid + " select:focus, #" + uid + " textarea:focus { border-color: " + C.focus + " !important; box-shadow: 0 0 0 3px rgba(0,165,255,0.18); }",
        "#" + uid + " input::placeholder, #" + uid + " textarea::placeholder { color: " + C.muted + "; opacity: 1; }",
        "#" + uid + " .cf-submit:hover:not(:disabled) { filter: brightness(1.06); }",
        "#" + uid + " .cf-close:hover { background: " + C.soft + "; }",
        "#" + uid + " button:focus-visible { outline: 2px solid " + C.focus + "; outline-offset: 3px; }",
        "#" + uid + " .cf-pad { padding: 36px 36px 32px; }",
        "@media (max-width: 520px) { #" + uid + " .cf-pad { padding: 28px 20px 24px; } #" + uid + " .cf-h { font-size: 26px !important; } }",
        "@keyframes " + uid + "spin { to { transform: rotate(360deg) } }",
        "@media (prefers-reduced-motion: reduce) { #" + uid + " .spin { animation: none !important; } }",
    ].join("\n")

    const closeBtn = onClose ? (
        <button
            type="button"
            className="cf-close"
            aria-label="Close"
            onClick={onClose}
            style={{ position: "absolute", top: 14, right: 14, width: 36, height: 36, display: "grid", placeItems: "center", border: "none", borderRadius: 6, background: "transparent", cursor: "pointer", zIndex: 2 }}
        >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M1 1l12 12M13 1L1 13" stroke={C.ink} strokeWidth="1.8" strokeLinecap="round" />
            </svg>
        </button>
    ) : null

    const eyebrowEl = eyebrow ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 14 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: "#FF8A00", flex: "none" }} />
            {eyebrow}
        </div>
    ) : null

    if (status === "sent") {
        const first = f.name.trim().split(/\s+/)[0]
        return (
            <div id={uid} style={card} role="status" aria-live="polite">
                <style>{css}</style>
                {closeBtn}
                <div className="cf-pad">
                    <div style={{ width: 48, height: 48, borderRadius: 24, background: C.grad, display: "grid", placeItems: "center", marginBottom: 22 }}>
                        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                            <path d="M5 11.5l4 4 8-9" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <h3 className="cf-h" style={{ margin: "0 0 10px", fontFamily: HEAD, fontSize: 30, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                        {isApply ? "Application received" : pending ? "Request received" : "Check your inbox"}
                    </h3>
                    <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: C.body }}>
                        {isApply ? (
                            <>
                                Thanks{first ? ", " + first : ""}. A confirmation is on its way to{" "}
                                <span style={{ color: C.ink, fontWeight: 600 }}>{f.email.trim().toLowerCase()}</span>. I’ll reach out personally to talk through the next steps.
                            </>
                        ) : (
                            <>
                                The curriculum is on its way to{" "}
                                <span style={{ color: C.ink, fontWeight: 600 }}>{f.email.trim().toLowerCase()}</span>{pending ? " shortly, as a PDF. Keep an eye on your inbox, and check your spam or promotions folder too." : ", attached as a PDF. If it doesn’t arrive in a couple of minutes, check your spam or promotions folder."}
                            </>
                        )}
                    </p>
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            style={{ marginTop: 26, height: 49, padding: 2, border: "none", borderRadius: 6, background: C.grad, cursor: "pointer", width: "100%" }}
                        >
                            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", borderRadius: 4, background: "#fff", color: C.ink, fontFamily: BODY, fontSize: 16, fontWeight: 600 }}>
                                Done
                            </span>
                        </button>
                    )}
                </div>
            </div>
        )
    }

    return (
        <form id={uid} style={card} onSubmit={onSubmit} noValidate>
            <style>{css}</style>
            {closeBtn}
            <div className="cf-pad">
                {eyebrowEl}
                {heading && (
                    <h3 className="cf-h" style={{ margin: "0 0 10px", paddingRight: 28, fontFamily: HEAD, fontSize: 30, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                        {heading}
                    </h3>
                )}
                {intro && <p style={{ margin: "0 0 26px", fontSize: 15, lineHeight: 1.6, color: C.body }}>{intro}</p>}

                <div style={gap}>
                    <label htmlFor={uid + "-name"} style={label}>Full name</label>
                    <input ref={refs.name} id={uid + "-name"} type="text" autoComplete="name" value={f.name} onChange={set("name")}
                        aria-invalid={!!errors.name} aria-describedby={errors.name ? uid + "-name-err" : undefined} style={field(!!errors.name)} />
                    {errors.name && <div id={uid + "-name-err"} style={errText}>{errors.name}</div>}
                </div>

                <div style={gap}>
                    <label htmlFor={uid + "-email"} style={label}>Email</label>
                    <input ref={refs.email} id={uid + "-email"} type="email" inputMode="email" autoComplete="email" placeholder="name@gmail.com"
                        value={f.email} onChange={set("email")} aria-invalid={!!errors.email}
                        aria-describedby={errors.email ? uid + "-email-err" : undefined} style={field(!!errors.email)} />
                    {errors.email && <div id={uid + "-email-err"} role="alert" style={errText}>{errors.email}</div>}
                </div>

                <div style={gap}>
                    <label htmlFor={uid + "-phone"} style={label}>Phone or WhatsApp</label>
                    <input ref={refs.phone} id={uid + "-phone"} type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210"
                        value={f.phone} onChange={set("phone")} aria-invalid={!!errors.phone}
                        aria-describedby={errors.phone ? uid + "-phone-err" : undefined} style={field(!!errors.phone)} />
                    {errors.phone && <div id={uid + "-phone-err"} role="alert" style={errText}>{errors.phone}</div>}
                </div>

                {isApply && (
                    <>
                        <div style={gap}>
                            <label htmlFor={uid + "-stage"} style={label}>Where are you right now?</label>
                            <select id={uid + "-stage"} value={f.stage} onChange={set("stage")}
                                style={{ ...field(false), background: "#fff " + chevron, color: f.stage ? C.ink : C.muted, paddingRight: 40 }}>
                                <option value="" disabled>Choose one</option>
                                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div style={gap}>
                            <label htmlFor={uid + "-exp"} style={label}>Design experience</label>
                            <select id={uid + "-exp"} value={f.experience} onChange={set("experience")}
                                style={{ ...field(false), background: "#fff " + chevron, color: f.experience ? C.ink : C.muted, paddingRight: 40 }}>
                                <option value="" disabled>Choose one</option>
                                {EXPERIENCE.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div style={gap}>
                            <label htmlFor={uid + "-link"} style={label}>LinkedIn or portfolio{optional}</label>
                            <input id={uid + "-link"} type="url" inputMode="url" placeholder="linkedin.com/in/yourname" value={f.link} onChange={set("link")} style={field(false)} />
                        </div>
                        <div style={gap}>
                            <label htmlFor={uid + "-goal"} style={label}>What do you want from the cohort?{optional}</label>
                            <textarea id={uid + "-goal"} rows={3} value={f.goal} onChange={set("goal")}
                                style={{ ...field(false), height: "auto", minHeight: 96, padding: "12px 14px", lineHeight: 1.5, resize: "vertical" }} />
                        </div>
                    </>
                )}

                <div aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}>
                    <label>Website<input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} /></label>
                </div>

                <button type="submit" className="cf-submit" disabled={status === "sending"}
                    style={{
                        width: "100%", height: 49, marginTop: 6, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10,
                        background: C.grad, color: "#fff", border: "none", borderRadius: 6, fontFamily: BODY, fontSize: 16, fontWeight: 600,
                        cursor: status === "sending" ? "progress" : "pointer", opacity: status === "sending" ? 0.85 : 1,
                    }}>
                    {status === "sending" && (
                        <span className="spin" aria-hidden="true" style={{ width: 16, height: 16, border: "2px solid #fff", borderRightColor: "transparent", borderRadius: "50%", animation: uid + "spin .7s linear infinite" }} />
                    )}
                    {status === "sending" ? "Sending…" : buttonLabel}
                </button>

                {errors.form && <div role="alert" style={{ ...errText, marginTop: 14 }}>{errors.form}</div>}
                {footnote && <p style={{ margin: "14px 0 0", fontSize: 13, lineHeight: 1.5, color: C.muted, textAlign: "center" }}>{footnote}</p>}
            </div>
        </form>
    )
}

CohortForm.defaultProps = {
    mode: "apply" as Mode,
    endpoint: "https://media-kit-henna.vercel.app/api/cohort-apply",
    eyebrow: "Product Design Cohort ’27",
    heading: "Apply for the cohort",
    intro: "Tell me a little about where you are. I’ll reach out personally to talk through the next steps.",
    buttonLabel: "Submit application",
    footnote: "Starts 1 January 2027. 30 seats.",
}

addPropertyControls(CohortForm, {
    mode: { type: ControlType.Enum, title: "Form", options: ["apply", "curriculum"], optionTitles: ["Apply", "Curriculum"], displaySegmentedControl: true },
    endpoint: { type: ControlType.String, title: "Endpoint", placeholder: "https://media-kit-henna.vercel.app/api/cohort-apply" },
    eyebrow: { type: ControlType.String, title: "Eyebrow" },
    heading: { type: ControlType.String, title: "Heading" },
    intro: { type: ControlType.String, title: "Intro", displayTextArea: true },
    buttonLabel: { type: ControlType.String, title: "Button" },
    footnote: { type: ControlType.String, title: "Footnote" },
    onClose: { type: ControlType.EventHandler, title: "On close" },
})

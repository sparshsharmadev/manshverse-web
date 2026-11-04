import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { AuthCard, TextField, PasswordField, Spinner, ErrorBanner } from "../components/AuthUI";

const networkError = e => e?.status === 0 || /fetch|network|offline/i.test(e?.message || "");
export function ForgotPassword() {
  const [email, setEmail] = useState(""); const [error, setError] = useState(""); const [sent, setSent] = useState(false); const [loading, setLoading] = useState(false);
  const submit = async e => { e.preventDefault(); setError(""); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Enter a valid email address."); return; } setLoading(true); const { error: e2 } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` }); setLoading(false); if (e2 && networkError(e2)) setError("Couldn't reach the server. Try again."); else setSent(true); };
  return <AuthCard title={sent ? "Check your inbox" : "Reset your password"} subtitle={sent ? "If an account exists for that address, a reset link is on its way." : "We'll email you a secure link to choose a new password."} footer={<Link to="/login">Back to sign in</Link>}>{sent ? <p className="auth-copy">Reset instructions were sent to <strong>{email}</strong>.</p> : <form noValidate onSubmit={submit}><ErrorBanner>{error}</ErrorBanner><TextField label="Email address" type="email" inputMode="email" autoComplete="email" autoFocus placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} onBlur={() => setError(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "Enter a valid email address." : "")}/><button className="auth-submit" disabled={loading}>{loading ? <><Spinner/>Sending…</> : "Send reset link"}</button></form>}</AuthCard>;
}

export function ResetPassword() {
  const navigate = useNavigate(); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const submit = async e => { e.preventDefault(); setError(""); if (password.length < 8) { setError("Use at least 8 characters."); return; } setLoading(true); const { error: e2 } = await supabase.auth.updateUser({ password }); setLoading(false); if (e2) setError(networkError(e2) ? "Couldn't reach the server. Try again." : "This reset link is invalid or has expired. Request a new one."); else navigate("/chat", { replace: true }); };
  return <AuthCard title="Choose a new password" subtitle="Make it at least 8 characters long"><form noValidate onSubmit={submit}><ErrorBanner>{error}</ErrorBanner><PasswordField label="New password" autoComplete="new-password" autoFocus value={password} onChange={e => setPassword(e.target.value)} error={password && password.length < 8 ? "Use at least 8 characters." : ""} strength/><button className="auth-submit" disabled={loading}>{loading ? <><Spinner/>Saving…</> : "Save new password"}</button></form></AuthCard>;
}

export function AuthCallback() {
  const navigate = useNavigate(); const [error, setError] = useState("");
  useEffect(() => { let active = true; (async () => { const { data, error: sessionError } = await supabase.auth.getSession(); if (!active) return; if (sessionError || !data.session) { setError("This sign-in link is invalid or has expired. Please try again."); return; }
    const user = data.session.user; const signupStarted = Number(sessionStorage.getItem("manshverse_signup_flow") || 0); const started = Number(sessionStorage.getItem("manshverse_oauth_started") || 0); sessionStorage.removeItem("manshverse_signup_flow"); sessionStorage.removeItem("manshverse_oauth_started");
    const created = new Date(user.created_at).getTime(); const lastSignIn = new Date(user.last_sign_in_at || 0).getTime();
    const isRecentSignup = started && Date.now() - started < 15 * 60 * 1000 && Math.abs(created - lastSignIn) < 15 * 60 * 1000;
    const isSignupIntent = signupStarted && Math.abs(created - signupStarted) < 5 * 60 * 1000;
    const { data: profile } = await supabase.from("profiles").select("data").eq("id", user.id).maybeSingle();
    if (isSignupIntent || isRecentSignup || profile?.data?.onboardingCompleted === false) navigate("/onboarding", { replace: true }); else navigate("/chat", { replace: true });
  })(); return () => { active = false; }; }, [navigate]);
  return <AuthCard title={error ? "Unable to sign in" : "Finishing sign in"} subtitle={error || "Just a moment while we securely connect your account."}>{error && <p className="auth-copy"><Link to="/login">Return to sign in</Link></p>}</AuthCard>;
}

export function Onboarding() {
  const navigate = useNavigate(); const [phone, setPhone] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const save = async skip => { setError(""); setSaving(true); const { data: { user }, error: userError } = await supabase.auth.getUser(); if (userError || !user) { setSaving(false); navigate("/login", { replace: true }); return; }
    const { data: profile, error: readError } = await supabase.from("profiles").select("data").eq("id", user.id).maybeSingle();
    if (readError) { setSaving(false); setError("Couldn't save your details. Try again."); return; }
    const { error: saveError } = await supabase.from("profiles").upsert({ id: user.id, data: { ...(profile?.data || {}), ...(skip ? {} : { phone: phone.trim() }), onboardingCompleted: true, updatedAt: new Date().toISOString() } }, { onConflict: "id" }); setSaving(false); if (saveError) { setError("Couldn't save your details. Try again."); return; } navigate("/chat", { replace: true });
  };
  return <AuthCard title="Finish setting up" subtitle="Add a phone number for your profile, if you'd like."><p className="auth-copy">This is optional and unverified. We won't send SMS messages or use it to sign you in.</p><form noValidate onSubmit={e => { e.preventDefault(); save(false); }}><ErrorBanner>{error}</ErrorBanner><TextField label="Phone number (optional)" type="tel" inputMode="tel" autoComplete="tel" placeholder="Your phone number" value={phone} onChange={e => setPhone(e.target.value)}/><button className="auth-submit" disabled={saving}>{saving ? <><Spinner/>Saving…</> : "Finish setup"}</button><button type="button" className="auth-link-button" disabled={saving} onClick={() => save(true)}>Skip for now</button></form></AuthCard>;
}

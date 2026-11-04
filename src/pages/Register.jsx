import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { AuthCard, TextField, PasswordField, OAuthButtons, Spinner, ErrorBanner } from "../components/AuthUI";
import AppIcon from "../components/AppIcon";

const validateEmail = value => !value.trim() ? "Enter your email address." : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? "Enter a valid email address." : "";
const friendly = error => {
  if (error?.status === 0 || /fetch|network|offline/i.test(error?.message || "")) return "Couldn't reach the server. Try again.";
  if (/already registered|already exists|user_already_exists/i.test(`${error?.message} ${error?.code}`)) return "An account with this email already exists. Sign in instead.";
  return "We couldn't create your account. Please try again.";
};
export default function Register() {
  const navigate = useNavigate(); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({}); const [banner, setBanner] = useState(""); const [loading, setLoading] = useState(false); const [oauth, setOauth] = useState(""); const [sent, setSent] = useState(false); const [cooldown, setCooldown] = useState(0); const [resending, setResending] = useState(false); const [resendMessage, setResendMessage] = useState("");
  useEffect(() => { const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { if (session?.user) navigate("/onboarding", { replace: true }); }); return () => subscription.unsubscribe(); }, [navigate]);
  useEffect(() => { if (!cooldown) return undefined; const timer = window.setTimeout(() => setCooldown(n => n - 1), 1000); return () => window.clearTimeout(timer); }, [cooldown]);
  const validate = () => { const next = { name: name.trim() ? "" : "Enter your full name.", email: validateEmail(email), password: password.length >= 8 ? "" : "Use at least 8 characters." }; setErrors(next); const first = Object.keys(next).find(key => next[key]); if (first) document.getElementById(first)?.focus(); return !first; };
  const submit = async e => { e.preventDefault(); setBanner(""); if (!validate()) return; setLoading(true); sessionStorage.setItem("manshverse_signup_flow", String(Date.now())); const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim(), full_name: name.trim() }, emailRedirectTo: `${window.location.origin}/auth/callback` } }); setLoading(false); if (error) { sessionStorage.removeItem("manshverse_signup_flow"); setBanner(friendly(error)); return; } if (data.user?.identities?.length === 0) { sessionStorage.removeItem("manshverse_signup_flow"); setBanner("An account with this email already exists. Sign in instead."); return; } if (data.session) { sessionStorage.removeItem("manshverse_signup_flow"); navigate("/onboarding", { replace: true }); return; } setSent(true); setCooldown(30); };
  const oauthRegister = async provider => { setBanner(""); setOauth(provider); sessionStorage.setItem("manshverse_signup_flow", String(Date.now())); const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: provider === "google" ? { prompt: "select_account" } : undefined } }); if (error) { sessionStorage.removeItem("manshverse_signup_flow"); setOauth(""); setBanner(friendly(error)); } };
  const resend = async () => { if (cooldown || resending) return; setResending(true); setResendMessage(""); const { error } = await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/auth/callback` } }); setResending(false); setCooldown(30); setResendMessage(error ? friendly(error) : "A fresh confirmation link is on its way."); };
  if (sent) return <AuthCard variant="editorial" eyebrow="CHECK YOUR EMAIL" title="Check your inbox" subtitle="One quick step before you join Manshverse"><div className="auth-success-icon"><AppIcon name="mail" size={26}/></div><p className="auth-copy">We sent a confirmation link to <strong>{email}</strong>. Open it to verify your email and finish setting up your account.</p>{resendMessage && <p className={resendMessage.startsWith("A fresh") ? "auth-success" : "auth-field-error"} role="status">{resendMessage}</p>}<button className="auth-submit" disabled={cooldown > 0 || resending} onClick={resend}>{resending ? <><Spinner/>Sending…</> : cooldown ? `Resend email in ${cooldown}s` : "Resend email"}</button><button className="auth-link-button" onClick={() => { setSent(false); setEmail(""); setPassword(""); }}>Use a different email</button></AuthCard>;
  return <AuthCard variant="editorial" eyebrow="CREATE ACCOUNT" title={<>Step into a<br/>bigger universe.</>} subtitle="Make space for your next great question." footer={<>Already have an account? <Link to="/login">Sign in</Link></>}>
    <form noValidate onSubmit={submit}><ErrorBanner>{banner}</ErrorBanner>
      <TextField id="name" label="Full name" type="text" autoComplete="name" autoFocus placeholder="Your name" value={name} onChange={e => setName(e.target.value)} onBlur={() => setErrors(x => ({ ...x, name: name.trim() ? "" : "Enter your full name." }))} error={errors.name}/>
      <TextField id="email" label="Email address" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} onBlur={() => setErrors(x => ({ ...x, email: validateEmail(email) }))} error={errors.email}/>
      <PasswordField id="password" label="Password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} onBlur={() => setErrors(x => ({ ...x, password: password.length >= 8 ? "" : "Use at least 8 characters." }))} error={errors.password} strength/>
      <button className="auth-submit" disabled={loading || Boolean(oauth)} type="submit">{loading ? <><Spinner/>Creating account…</> : "Create account"}</button>
      <p className="auth-legal">By creating an account you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>
    </form><OAuthButtons busy={oauth} onGoogle={() => oauthRegister("google")} onGithub={() => oauthRegister("github")}/>
  </AuthCard>;
}

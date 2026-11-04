import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { AuthCard, TextField, PasswordField, OAuthButtons, Spinner, ErrorBanner } from "../components/AuthUI";

const emailError = value => !value.trim() ? "Enter your email address." : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? "Enter a valid email address." : "";
const friendly = error => error?.status === 0 || /fetch|network|offline/i.test(error?.message || "") ? "Couldn't reach the server. Try again." : "Incorrect email or password.";

export default function Login() {
  const navigate = useNavigate(); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({}); const [banner, setBanner] = useState(""); const [loading, setLoading] = useState(false); const [oauth, setOauth] = useState("");
  useEffect(() => { const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { if (session?.user) navigate("/chat", { replace: true }); }); return () => subscription.unsubscribe(); }, [navigate]);
  const validate = () => { const next = { email: emailError(email), password: password ? "" : "Enter your password." }; setErrors(next); const first = Object.keys(next).find(key => next[key]); if (first) document.getElementById(first)?.focus(); return !first; };
  const submit = async e => { e.preventDefault(); setBanner(""); if (!validate()) return; setLoading(true); const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password }); setLoading(false); if (error) setBanner(friendly(error)); };
  const oauthLogin = async provider => { setBanner(""); setOauth(provider); sessionStorage.setItem("manshverse_oauth_started", String(Date.now())); const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/auth/callback` } }); if (error) { setOauth(""); setBanner(error.status === 0 || /fetch|network|offline/i.test(error.message || "") ? friendly(error) : `${provider === "google" ? "Google" : "GitHub"} sign-in couldn't be completed. Try again.`); } };
  return <AuthCard variant="editorial" eyebrow="SIGN IN" title={<>Your universe<br/>is still open.</>} subtitle="Pick up where your curiosity left off." footer={<>New to Manshverse? <Link to="/register">Create an account</Link></>}>
    <form noValidate onSubmit={submit}><ErrorBanner>{banner}</ErrorBanner>
      <TextField id="email" label="Email address" type="email" inputMode="email" autoComplete="email" autoFocus placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} onBlur={() => setErrors(x => ({ ...x, email: emailError(email) }))} error={errors.email}/>
      <PasswordField id="password" label="Password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} onBlur={() => setErrors(x => ({ ...x, password: password ? "" : "Enter your password." }))} error={errors.password}/>
      <div className="auth-between"><span/> <Link to="/forgot-password">Forgot password?</Link></div>
      <button className="auth-submit" disabled={loading || Boolean(oauth)} type="submit">{loading ? <><Spinner/>Signing in…</> : "Sign in"}</button>
    </form><OAuthButtons busy={oauth} onGoogle={() => oauthLogin("google")} onGithub={() => oauthLogin("github")}/>
  </AuthCard>;
}

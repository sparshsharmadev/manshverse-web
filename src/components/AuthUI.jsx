import { useId, useState } from "react";
import { Link } from "react-router-dom";
import BrandMark from "./BrandMark";
import "./auth.css";

export function AuthCard({ title, subtitle, children, footer, variant = "", eyebrow = "YOUR NEXT CHAPTER" }) {
  return <main className={`auth-page ${variant ? `auth-page-${variant}` : ""}`}><section className={`auth-wrap ${variant ? `auth-${variant}` : ""}`}>
    <header className="auth-head">{variant === "editorial" ? <div className="auth-brandline"><Link to="/" className="auth-mark" aria-label="Manshverse home"><BrandMark size={34}/></Link><span>Manshverse <i/> {eyebrow}</span><Link to="/" className="auth-back-home"><span aria-hidden="true">←</span> Back to home</Link></div> : <div className="auth-standard-brand"><Link to="/" className="auth-mark" aria-label="Manshverse home"><BrandMark size={34}/></Link><Link to="/" className="auth-back-home"><span aria-hidden="true">←</span> Back to home</Link></div>}<h1>{title}</h1><p>{subtitle}</p></header>
    <div className="auth-card">{children}</div>{footer && <p className="auth-footer">{footer}</p>}
  </section></main>;
}

export function TextField({ id: suppliedId, label, error, hint, className = "", ...props }) {
  const generatedId = useId(); const id = suppliedId || generatedId; const errorId = `${id}-error`; const hintId = `${id}-hint`;
  return <div className="auth-field"><label htmlFor={id}>{label}</label><input id={id} className={`auth-input ${error ? "has-error" : ""} ${className}`} aria-invalid={Boolean(error)} aria-describedby={[error ? errorId : "", hint ? hintId : ""].filter(Boolean).join(" ") || undefined} {...props} />{error && <p className="auth-field-error" id={errorId}>{error}</p>}{hint && <p className="auth-hint" id={hintId}>{hint}</p>}</div>;
}

export function PasswordField({ id: suppliedId, label = "Password", error, autoComplete, value, onChange, onBlur, autoFocus, strength = false }) {
  const [visible, setVisible] = useState(false); const generatedId = useId(); const id = suppliedId || generatedId; const errorId = `${id}-error`; const hintId = `${id}-hint`;
  const variety = [/[a-z]/.test(value), /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length;
  const score = value.length < 8 ? Math.min(1, Math.floor(value.length / 4)) : Math.min(4, 1 + Math.floor((value.length - 8) / 5) + Math.floor(variety / 2));
  const strengthLabel = ["", "Weak", "Okay", "Good", "Strong"][score];
  return <div className="auth-field"><label htmlFor={id}>{label}</label><div className="auth-password"><input id={id} className={`auth-input ${error ? "has-error" : ""}`} type={visible ? "text" : "password"} value={value} onChange={onChange} onBlur={onBlur} autoComplete={autoComplete} autoFocus={autoFocus} minLength={8} aria-invalid={Boolean(error)} aria-describedby={[error ? errorId : "", strength ? hintId : ""].filter(Boolean).join(" ") || undefined} /><button type="button" className="auth-eye" aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(v => !v)}>{visible ? "Hide" : "Show"}</button></div>{error && <p className="auth-field-error" id={errorId}>{error}</p>}{strength && <div className="auth-strength" id={hintId} aria-live="polite"><div className="auth-strength-bars">{[1,2,3,4].map(n => <i key={n} className={n <= score ? `filled s${score}` : ""}/>)}</div><span>{strengthLabel || "Use at least 8 characters"}</span></div>}</div>;
}

export function OAuthButtons({ busy, onGoogle, onGithub }) {
  return <><div className="auth-divider"><span>or continue with</span></div><div className="auth-oauth"><button type="button" onClick={onGoogle} disabled={busy} className="auth-oauth-button">{busy === "google" ? <Spinner/> : <GoogleIcon/>}{busy === "google" ? "Connecting…" : "Continue with Google"}</button><button type="button" onClick={onGithub} disabled={busy} className="auth-oauth-button">{busy === "github" ? <Spinner/> : <GithubIcon/>}{busy === "github" ? "Connecting…" : "Continue with GitHub"}</button></div></>;
}
export function Spinner() { return <span className="auth-spinner" aria-hidden="true"/>; }
export function ErrorBanner({ children }) { return children ? <div className="auth-banner" role="alert">{children}</div> : null; }
export const GoogleIcon = () => <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-8 20-20 0-1.3-.1-2.7-.4-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.8 13.5-4.7l-6.2-5.2C29.3 35.6 26.8 36.5 24 36.5c-5.2 0-9.6-3.5-11.2-8.3l-6.5 5C9.8 40.1 16.4 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.2 5.2C41 35.6 44 30.2 44 24c0-1.3-.1-2.7-.4-4z"/></svg>;
export const GithubIcon = () => <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.55.1.76-.24.76-.54v-2.1c-3.1.68-3.76-1.32-3.76-1.32-.5-1.3-1.23-1.64-1.23-1.64-1-.7.08-.68.08-.68 1.1.08 1.68 1.14 1.68 1.14.98 1.68 2.56 1.2 3.18.92.1-.72.38-1.2.7-1.48-2.48-.28-5.08-1.24-5.08-5.53 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.05 1.15a10.6 10.6 0 0 1 5.55 0c2.11-1.44 3.04-1.15 3.04-1.15.61 1.54.23 2.68.12 2.96.72.78 1.15 1.78 1.15 3 0 4.3-2.6 5.25-5.09 5.53.4.35.75 1.03.75 2.08v3.08c0 .3.2.65.76.54A11.1 11.1 0 0 0 12 .9z"/></svg>;

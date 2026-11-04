import { useState, useContext, useRef, useEffect } from "react";
import { AuthContext } from "../context/auth-context";
import { supabase } from "../supabase";
import { auth } from "../lib/supabaseAuth";
import { updateProfile, signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential, sendEmailVerification } from "../lib/supabaseAuth";
import { doc, setDoc } from "../lib/firestore";
import { useNavigate } from "react-router-dom";
import BrandMark from "../components/BrandMark";
import AppIcon from "../components/AppIcon";
import "./profile.css";

const CLOUD_NAME = "ddmuer2zp";
const UPLOAD_PRESET = "manshverse_uploads";
const PHONE_COUNTRIES = [
  ["IN", "India", "+91", 10, 10], ["US", "United States", "+1", 10, 10], ["CA", "Canada", "+1", 10, 10],
  ["GB", "United Kingdom", "+44", 10, 10], ["AU", "Australia", "+61", 9, 9], ["NZ", "New Zealand", "+64", 8, 10],
  ["PK", "Pakistan", "+92", 10, 10], ["BD", "Bangladesh", "+880", 10, 10], ["LK", "Sri Lanka", "+94", 9, 9], ["NP", "Nepal", "+977", 10, 10],
  ["AE", "United Arab Emirates", "+971", 9, 9], ["SA", "Saudi Arabia", "+966", 9, 9], ["QA", "Qatar", "+974", 8, 8], ["KW", "Kuwait", "+965", 8, 8],
  ["SG", "Singapore", "+65", 8, 8], ["MY", "Malaysia", "+60", 9, 10], ["ID", "Indonesia", "+62", 9, 12], ["PH", "Philippines", "+63", 10, 10], ["TH", "Thailand", "+66", 9, 9], ["VN", "Vietnam", "+84", 9, 10],
  ["JP", "Japan", "+81", 10, 10], ["KR", "South Korea", "+82", 9, 10], ["CN", "China", "+86", 11, 11], ["HK", "Hong Kong", "+852", 8, 8], ["TW", "Taiwan", "+886", 9, 9],
  ["DE", "Germany", "+49", 7, 11], ["FR", "France", "+33", 9, 9], ["IT", "Italy", "+39", 9, 10], ["ES", "Spain", "+34", 9, 9], ["PT", "Portugal", "+351", 9, 9],
  ["NL", "Netherlands", "+31", 9, 9], ["BE", "Belgium", "+32", 8, 9], ["CH", "Switzerland", "+41", 9, 9], ["AT", "Austria", "+43", 7, 13], ["SE", "Sweden", "+46", 7, 10],
  ["NO", "Norway", "+47", 8, 8], ["DK", "Denmark", "+45", 8, 8], ["FI", "Finland", "+358", 7, 10], ["IE", "Ireland", "+353", 7, 9], ["PL", "Poland", "+48", 9, 9],
  ["GR", "Greece", "+30", 10, 10], ["TR", "Turkey", "+90", 10, 10], ["UA", "Ukraine", "+380", 9, 9], ["RU", "Russia", "+7", 10, 10], ["IL", "Israel", "+972", 9, 9],
  ["BR", "Brazil", "+55", 10, 11], ["MX", "Mexico", "+52", 10, 10], ["AR", "Argentina", "+54", 10, 10], ["CL", "Chile", "+56", 9, 9], ["CO", "Colombia", "+57", 10, 10],
  ["ZA", "South Africa", "+27", 9, 9], ["NG", "Nigeria", "+234", 10, 10], ["KE", "Kenya", "+254", 9, 9], ["EG", "Egypt", "+20", 10, 10], ["GH", "Ghana", "+233", 9, 9],
].map(([id, name, dial, min, max]) => ({ id, name, dial, min, max }));


export default function Profile() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const imgRef = useRef(null);
  const isCreator = user?.app_metadata?.role === "admin";
  const isGoogle = user?.app_metadata?.provider === "google";

  const [name, setName] = useState(user?.displayName || "");
  const [phone, setPhone] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("IN");
  const [savedPhone, setSavedPhone] = useState("");
  const [loadingPhone, setLoadingPhone] = useState(true);
  const [phoneLoadError, setPhoneLoadError] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoURL, setPhotoURL] = useState(user?.photoURL || "");
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [changingPass, setChangingPass] = useState(false);
  const [signOutConfirm, setSignOutConfirm] = useState(false);

  useEffect(() => {
    if (!user?.uid) return undefined;
    let active = true;
    const loadPhone = async () => {
      try {
        const { data, error } = await supabase.from("profiles").select("data").eq("id", user.uid).maybeSingle();
        if (error) throw error;
        if (!active) return;
        const value = data?.data?.phone || "";
        const storedCountry = PHONE_COUNTRIES.find(country => country.id === data?.data?.phoneCountry);
        const matchedCountry = storedCountry || [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find(country => value.startsWith(country.dial));
        const localNumber = matchedCountry && value.startsWith(matchedCountry.dial) ? value.slice(matchedCountry.dial.length) : value.replace(/\D/g, "");
        setPhoneCountry(matchedCountry?.id || "IN");
        setPhone(localNumber.replace(/\D/g, ""));
        setSavedPhone(value);
      } catch {
        if (active) setPhoneLoadError(true);
      } finally {
        if (active) setLoadingPhone(false);
      }
    };
    loadPhone();
    return () => { active = false; };
  }, [user?.uid]);

  // Toast
  const [toast, setToast] = useState({ msg: "", type: "success" });
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: "", type: "success" }), 3500);
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate("/", { replace: true });
    } catch {
      showToast("Could not sign out. Please try again.", "error");
    }
  };

  const savePhone = async () => {
    const country = PHONE_COUNTRIES.find(option => option.id === phoneCountry) || PHONE_COUNTRIES[0];
    const localNumber = phone.trim();
    if (localNumber && (localNumber.length < country.min || localNumber.length > country.max)) {
      setPhoneError(`Enter ${country.min === country.max ? country.min : `${country.min}–${country.max}`} digits for ${country.name}.`);
      return;
    }
    setPhoneError("");
    setSavingPhone(true);
    try {
      const value = localNumber ? `${country.dial}${localNumber}` : "";
      const { data: profile, error: readError } = await supabase.from("profiles").select("data").eq("id", user.uid).maybeSingle();
      if (readError) throw readError;
      const { error } = await supabase.from("profiles").upsert({
        id: user.uid,
        data: { ...(profile?.data || {}), phone: value, phoneCountry: localNumber ? country.id : "", updatedAt: new Date().toISOString() },
      }, { onConflict: "id" });
      if (error) throw error;
      setPhone(value ? localNumber : "");
      setSavedPhone(value);
      setPhoneLoadError(false);
      showToast("Phone number saved. It remains unverified.");
    } catch {
      showToast("Could not save your phone number. Try again.", "error");
    } finally {
      setSavingPhone(false);
    }
  };

  const resendVerification = async () => {
    setSendingVerification(true);
    try {
      await sendEmailVerification(user);
      showToast("Verification email sent. Check your inbox.");
    } catch {
      showToast("Could not send a verification email. Try again.", "error");
    } finally {
      setSendingVerification(false);
    }
  };

  const copyUserId = async () => {
    try {
      await navigator.clipboard.writeText(user.uid);
      showToast("User ID copied.");
    } catch {
      showToast("Could not copy the user ID.", "error");
    }
  };

  const saveName = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateProfile(auth.currentUser, { displayName: name.trim() });
      await setDoc(doc(supabase, "users", user.uid), { name: name.trim() }, { merge: true });
      showToast("Display name updated.");
    } catch {
      showToast("Failed to update name.", "error");
    }
    setSaving(false);
  };

  const uploadPhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast("Image must be under 5MB.", "error"); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", UPLOAD_PRESET);
      formData.append("folder", "manshverse_avatars");
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData });
      const data = await res.json();
      if (data.secure_url) {
        await updateProfile(auth.currentUser, { photoURL: data.secure_url });
        await setDoc(doc(supabase, "users", user.uid), { photoURL: data.secure_url }, { merge: true });
        setPhotoURL(data.secure_url);
        showToast("Profile photo updated.");
      } else {
        showToast("Upload failed. Try again.", "error");
      }
    } catch {
      showToast("Failed to upload photo.", "error");
    }
    setUploading(false);
  };

  const changePassword = async () => {
    if (!currentPass || !newPass) { showToast("Fill both fields.", "error"); return; }
    if (newPass.length < 8) { showToast("New password must be at least 8 characters.", "error"); return; }
    setChangingPass(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPass);
      await reauthenticateWithCredential(auth.currentUser, cred);
      await updatePassword(auth.currentUser, newPass);
      setCurrentPass(""); setNewPass("");
      showToast("Password updated successfully.");
    } catch (err) {
      if (err.code === "auth/wrong-password") showToast("Current password is incorrect.", "error");
      else if (err.code === "auth/too-many-requests") showToast("Too many attempts. Try later.", "error");
      else showToast("Failed to update password.", "error");
    }
    setChangingPass(false);
  };

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; background: #000; font-family: 'Manrope', sans-serif; }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin    { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }

        /* ── TOAST ── */
        .pf-toast {
          position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
          padding: 13px 22px; border-radius: 12px; font-size: 14px; font-weight: 600;
          z-index: 999; animation: fadeUp 0.3s ease; white-space: nowrap; max-width: 90vw;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        }
        .pf-toast.success { background: rgba(4,120,87,0.9); border: 1px solid rgba(74,222,128,0.3); color: #4ade80; backdrop-filter: blur(12px); }
        .pf-toast.error   { background: rgba(127,29,29,0.9); border: 1px solid rgba(239,68,68,0.3); color: #fca5a5; backdrop-filter: blur(12px); }

        /* ── LAYOUT ── */
        .pf { min-height: 100vh; background: transparent; color: #fff; display: flex; flex-direction: column; position: relative; z-index: 1; }
        .pf-top {
          display: flex; align-items: center; gap: 14px; padding: 14px 24px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: rgba(5,5,8,0.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          position: sticky; top: 0; z-index: 10;
        }
        .pf-back { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 9px 16px; font-size: 13px; color: #888; cursor: pointer; font-family: 'Manrope'; transition: all 0.2s; }
        .pf-back:hover { color: #fff; border-color: rgba(255,255,255,0.15); background: rgba(255,255,255,0.07); }
        .pf-brand { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 600; color: #ccc; margin-left: auto; }
        .pf-brand-mark { width: 28px; height: 28px; background: linear-gradient(135deg,#3d1f8a,#1a0d2e); border: 1px solid rgba(124,92,252,0.3); border-radius: 9px; display: flex; align-items: center; justify-content: center; }

        .pf-body { flex: 1; max-width: 560px; margin: 0 auto; width: 100%; padding: 40px 20px 80px; }

        /* ── HERO ── */
        .pf-hero { display: flex; align-items: center; gap: 20px; margin-bottom: 40px; padding: 24px; background: rgba(10,10,15,0.6); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.07); border-radius: 20px; }
        .pf-av-wrap { position: relative; cursor: pointer; flex-shrink: 0; }
        .pf-av { width: 68px; height: 68px; border-radius: 50%; background: linear-gradient(135deg,#3d1f8a,#1a0d2e); border: 2px solid rgba(124,92,252,0.3); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; color: #fff; overflow: hidden; box-shadow: 0 0 20px rgba(124,92,252,0.2); }
        .pf-av img { width: 100%; height: 100%; object-fit: cover; }
        .pf-av-overlay { position: absolute; inset: 0; border-radius: 50%; background: rgba(0,0,0,0.65); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; }
        .pf-av-wrap:hover .pf-av-overlay { opacity: 1; }
        .pf-av-spin { position: absolute; inset: 0; border-radius: 50%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; }
        .pf-hero-name { font-size: 19px; font-weight: 700; color: #fff; letter-spacing: -0.4px; margin-bottom: 4px; }
        .pf-hero-email { font-size: 13px; color: #444; margin-bottom: 10px; word-break: break-all; }
        .pf-badges { display: flex; gap: 7px; flex-wrap: wrap; }
        .pf-badge { font-size: 10.5px; padding: 4px 10px; border-radius: 7px; font-weight: 600; letter-spacing: 0.3px; }
        .pf-badge.creator { background: rgba(124,92,252,0.12); border: 1px solid rgba(124,92,252,0.3); color: #c4b5fd; }
        .pf-badge.google  { background: rgba(74,158,255,0.1);  border: 1px solid rgba(74,158,255,0.2);  color: #74b9ff; }
        .pf-badge.email   { background: rgba(74,222,128,0.1);  border: 1px solid rgba(74,222,128,0.2);  color: #4ade80; }

        /* ── SECTIONS ── */
        .pf-section { margin-bottom: 24px; }
        .pf-sec-label { font-size: 11px; color: #444; letter-spacing: 0.8px; text-transform: uppercase; font-weight: 600; margin-bottom: 12px; padding-left: 2px; }
        .pf-card { background: rgba(8,8,14,0.8); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.07); border-radius: 18px; padding: 24px; }
        .pf-field { margin-bottom: 18px; }
        .pf-field:last-child { margin-bottom: 0; }
        .pf-label { font-size: 11.5px; color: #555; letter-spacing: 0.4px; text-transform: uppercase; font-weight: 600; margin-bottom: 8px; }
        .pf-input { width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 13px 16px; font-size: 14px; font-family: 'Manrope'; color: #e0e0e0; outline: none; transition: all 0.2s; -webkit-appearance: none; }
        .pf-input::placeholder { color: #333; }
        .pf-input:focus { border-color: rgba(108,71,255,0.5); background: rgba(255,255,255,0.06); box-shadow: 0 0 0 3px rgba(108,71,255,0.08); }
        .pf-input:disabled { opacity: 0.35; cursor: not-allowed; }

        /* ── BUTTONS ── */
        .pf-row { display: flex; align-items: center; gap: 12px; margin-top: 16px; flex-wrap: wrap; }
        .pf-btn { background: #fff; color: #000; border: none; border-radius: 10px; padding: 11px 20px; font-size: 13.5px; font-weight: 700; font-family: 'Manrope'; cursor: pointer; transition: all 0.2s; -webkit-tap-highlight-color: transparent; }
        .pf-btn:hover { background: #f0f0f0; }
        .pf-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .pf-btn.ghost { background: transparent; color: #555; border: 1px solid rgba(255,255,255,0.08); }
        .pf-btn.ghost:hover { color: #bbb; border-color: rgba(255,255,255,0.15); background: rgba(255,255,255,0.04); }
        .pf-btn.danger { background: rgba(239,68,68,0.1); color: #fca5a5; border: 1px solid rgba(239,68,68,0.22); }
        .pf-btn.danger:hover { background: rgba(239,68,68,0.18); }

        /* ── INFO ROWS ── */
        .pf-info-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.04); gap: 12px; }
        .pf-info-row:last-child { border-bottom: none; padding-bottom: 0; }
        .pf-info-k { font-size: 13px; color: #444; flex-shrink: 0; }
        .pf-info-v { font-size: 13px; color: #666; text-align: right; word-break: break-all; }

        /* ── GOOGLE NOTE ── */
        .pf-google-note { font-size: 13px; color: #444; line-height: 1.7; padding: 14px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 10px; }

        /* ── DANGER CARD ── */
        .pf-danger-card { background: rgba(127,29,29,0.07); border: 1px solid rgba(239,68,68,0.14); border-radius: 18px; padding: 24px; }
        .pf-danger-title { font-size: 14px; font-weight: 600; color: #fca5a5; margin-bottom: 6px; }
        .pf-danger-desc  { font-size: 13px; color: rgba(107,36,36,1); line-height: 1.6; margin-bottom: 18px; }

        /* ── SIGN OUT CONFIRM ── */
        .so-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; z-index: 800; padding: 20px; }
        .so-box { background: rgba(10,10,16,0.98); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 32px; max-width: 360px; width: 100%; }
        .so-title { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 10px; }
        .so-desc  { font-size: 13.5px; color: #555; line-height: 1.6; margin-bottom: 24px; }
        .so-btns  { display: flex; gap: 10px; }

        /* ── FOOTER ── */
        .pf-foot { text-align: center; padding: 24px; border-top: 1px solid rgba(255,255,255,0.04); }
        .pf-foot-txt { font-size: 11px; color: #222; letter-spacing: 0.8px; text-transform: uppercase; }

        @media(max-width:480px){
          .pf-body { padding: 24px 16px 80px; }
          .pf-hero { flex-direction: column; text-align: center; }
          .pf-badges { justify-content: center; }
        }
      `}</style>

      {/* Toast */}
      {toast.msg && <div className={`pf-toast ${toast.type}`}>{toast.msg}</div>}

      {/* Sign Out Confirm */}
      {signOutConfirm && (
        <div className="so-overlay" onClick={() => setSignOutConfirm(false)}>
          <div className="so-box" onClick={e => e.stopPropagation()}>
            <div className="so-title">Sign out?</div>
            <div className="so-desc">You'll be signed out of Manshverse on this device.</div>
            <div className="so-btns">
              <button className="pf-btn ghost" style={{flex:1}} onClick={() => setSignOutConfirm(false)}>Cancel</button>
              <button className="pf-btn danger" style={{flex:2}} onClick={handleSignOut}>Sign Out</button>
            </div>
          </div>
        </div>
      )}

      <div className="pf">
        <div className="pf-top">
          <button className="pf-back" onClick={() => navigate("/chat")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
          <div className="pf-brand">
            <BrandMark className="pf-brand-mark" size={28} />
            Manshverse
          </div>
        </div>

        <div className="pf-body">
          {/* Hero */}
          <div className="pf-hero">
            <div className="pf-hero-kicker">YOUR SPACE / ACCOUNT SETTINGS</div>
            <button type="button" className="pf-av-wrap" onClick={() => imgRef.current?.click()} aria-label="Change profile photo" title="Change photo">
              <div className="pf-av">
                {photoURL ? <img src={photoURL} alt=""/> : (user?.displayName?.[0] || user?.email?.[0] || "U").toUpperCase()}
              </div>
              {uploading ? (
                <div className="pf-av-spin">
                  <svg className="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{animation:"spin 1s linear infinite"}}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                </div>
              ) : (
                <div className="pf-av-overlay">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </div>
              )}
            </button>
            <input ref={imgRef} type="file" accept="image/*" aria-label="Upload a profile photo" style={{display:"none"}} onChange={uploadPhoto}/>
            <div className="pf-hero-copy">
              <h1 className="pf-hero-name">{user?.displayName || "Anonymous"}</h1>
              <div className="pf-hero-email">{user?.email}</div>
              <div className="pf-badges">
                {isCreator && <span className="pf-badge creator"><AppIcon name="star" size={13}/>Creator</span>}
                {isGoogle ? <span className="pf-badge google"><span className="pf-badge-mark">G</span>Google account</span> : <span className="pf-badge email"><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><rect x="2.5" y="4" width="15" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="m3.5 5 6.5 5 6.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>Email account</span>}
              </div>
            </div>
            <div className="pf-hero-index"><span>MANSHVERSE</span><strong>01</strong><i/>ACCOUNT</div>
          </div>

          {/* Profile */}
          <div className="pf-section pf-section-profile">
            <div className="pf-sec-label">Profile</div>
            <div className="pf-card">
              <div className="pf-field">
                <label className="pf-label" htmlFor="profile-display-name">Display name</label>
                <input id="profile-display-name" autoComplete="name" className="pf-input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name"/>
              </div>
              <div className="pf-field">
                <label className="pf-label" htmlFor="profile-email">Email address</label>
                <input id="profile-email" autoComplete="email" className="pf-input" value={user?.email || ""} disabled/>
              </div>
              <div className="pf-row">
                <button type="button" className="pf-btn" onClick={saveName} disabled={saving || !name.trim()}>
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          </div>

          {/* Contact and verification */}
          <div className="pf-section pf-section-contact">
            <div className="pf-sec-label">Contact</div>
            <div className="pf-card">
              <div className="pf-field">
                <label className="pf-label" htmlFor="profile-phone">Phone number <span>OPTIONAL</span></label>
                <div className="pf-phone-entry">
                  <select id="profile-phone-country" className="pf-input pf-phone-country" value={phoneCountry} onChange={e => { setPhoneCountry(e.target.value); setPhoneError(""); }} disabled={loadingPhone} aria-label="Country and calling code">
                    {PHONE_COUNTRIES.map(country => <option key={country.id} value={country.id}>{country.name} ({country.dial})</option>)}
                  </select>
                  <div className="pf-phone-number">
                    <span aria-hidden="true">{PHONE_COUNTRIES.find(country => country.id === phoneCountry)?.dial}</span>
                    <input id="profile-phone" autoComplete="tel-national" inputMode="numeric" type="tel" maxLength={15} className="pf-input" value={phone} onChange={e => { setPhone(e.target.value.replace(/\D/g, "")); setPhoneError(""); }} onBlur={() => { const country = PHONE_COUNTRIES.find(option => option.id === phoneCountry) || PHONE_COUNTRIES[0]; if (phone && (phone.length < country.min || phone.length > country.max)) setPhoneError(`Enter ${country.min === country.max ? country.min : `${country.min}–${country.max}`} digits for ${country.name}.`); }} placeholder="Phone number" disabled={loadingPhone} aria-describedby="profile-phone-help" aria-invalid={Boolean(phoneError)}/>
                  </div>
                </div>
                <p className="pf-field-note" id="profile-phone-help">Enter your local number without the country code. The country code is added when saved. We check length only; this does not verify ownership.</p>
                {phoneError && <p className="pf-inline-error" role="alert">{phoneError}</p>}
                {phoneLoadError && <p className="pf-inline-error" role="status">Saved phone details could not be loaded. You can still enter a new number.</p>}
              </div>
              <div className="pf-row">
                <button type="button" className="pf-btn" onClick={savePhone} disabled={loadingPhone || savingPhone || (phone ? `${PHONE_COUNTRIES.find(country => country.id === phoneCountry)?.dial}${phone}` : "") === savedPhone}>
                  {savingPhone ? "Saving..." : "Save phone number"}
                </button>
              </div>
              <div className="pf-verify-row">
                <div><span className="pf-label">Email verification</span><strong className={user?.emailVerified ? "verified" : "unverified"}>{user?.emailVerified ? "Verified" : "Not verified"}</strong></div>
                {!user?.emailVerified && <button type="button" className="pf-btn ghost" onClick={resendVerification} disabled={sendingVerification}>{sendingVerification ? "Sending..." : "Resend link"}</button>}
              </div>
            </div>
          </div>

          {/* Password */}
          <div className="pf-section pf-section-password">
            <div className="pf-sec-label">Password</div>
            <div className="pf-card">
              {isGoogle ? (
                <p className="pf-google-note">You signed in with Google. Password management is handled through your Google account.</p>
              ) : (
                <>
                  <div className="pf-field">
                    <label className="pf-label" htmlFor="profile-current-password">Current password</label>
                    <input id="profile-current-password" autoComplete="current-password" className="pf-input" type="password" placeholder="••••••••" value={currentPass} onChange={e => setCurrentPass(e.target.value)}/>
                  </div>
                  <div className="pf-field">
                    <label className="pf-label" htmlFor="profile-new-password">New password</label>
                    <input id="profile-new-password" autoComplete="new-password" className="pf-input" type="password" placeholder="At least 8 characters" value={newPass} onChange={e => setNewPass(e.target.value)} minLength={8}/>
                  </div>
                  <div className="pf-row">
                    <button type="button" className="pf-btn" onClick={changePassword} disabled={changingPass}>{changingPass ? "Updating..." : "Update password"}</button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Account info */}
          <div className="pf-section pf-section-account">
            <div className="pf-sec-label">Account info</div>
            <div className="pf-card">
              <div className="pf-info-row">
                <span className="pf-info-k">User ID</span>
                <span className="pf-info-v pf-id-value" title={user?.uid}>{user?.uid?.slice(0,18)}…</span>
                <button type="button" className="pf-copy-id" onClick={copyUserId}>Copy</button>
              </div>
              <div className="pf-info-row">
                <span className="pf-info-k">Sign-in method</span>
                <span className="pf-info-v">{isGoogle ? "Google" : "Email & Password"}</span>
              </div>
              <div className="pf-info-row">
                <span className="pf-info-k">Account type</span>
                <span className="pf-info-v" style={{color: isCreator ? "#c4b5fd" : "#555"}}>{isCreator ? <><AppIcon name="star" size={12}/> Creator</> : "Standard"}</span>
              </div>
              <div className="pf-info-row">
                <span className="pf-info-k">Platform</span>
                <span className="pf-info-v">Manshverse workspace</span>
              </div>
            </div>
          </div>

          {/* Sign out */}
          <div className="pf-section pf-section-session">
            <div className="pf-sec-label">Session</div>
            <div className="pf-danger-card">
              <div className="pf-danger-title">Sign out</div>
              <div className="pf-danger-desc">You will be signed out of Manshverse on this device.</div>
              <button className="pf-btn danger" onClick={() => setSignOutConfirm(true)}>Sign out</button>
            </div>
          </div>
        </div>

        <div className="pf-foot">
          <p className="pf-foot-txt">Founded by Sparsh · manshverse@gmail.com · 2026</p>
        </div>
      </div>
    </>
  );
}

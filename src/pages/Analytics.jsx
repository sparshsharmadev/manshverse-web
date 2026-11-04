import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/auth-context";
import { supabase as db } from "../supabase";
import {
  collection, collectionGroup, doc, getDoc, getDocs,
  serverTimestamp, setDoc, deleteDoc, query, orderBy, limit
} from "../lib/firestore";
import { getPlanSnapshot, getUsageDayKey, toJsDate } from "../lib/account";
import {
  calculatePlanExpiry, DEFAULT_PLAN_LIMITS, limitInputValue,
  MODEL_LIMIT_FIELDS, normalizePlanLimits, PLAN_META, PLAN_ORDER,
  serializePlanLimits
} from "../lib/plans";
import { STARS } from "../lib/stars";
import BrandMark from "../components/BrandMark";
import AppIcon from "../components/AppIcon";
import "./analytics.css";


const TODAY = getUsageDayKey();

const STATUS_LABEL = { pending: "Pending", approved: "Approved", rejected: "Rejected" };
const STATUS_STYLE = {
  pending:  { background: "#1a1408", color: "#fbbf24", border: "1px solid #33270b" },
  approved: { background: "#0a1710", color: "#4ade80", border: "1px solid #12311f" },
  rejected: { background: "#170b0b", color: "#f87171", border: "1px solid #341515" },
};

const makeDrafts = (limits = DEFAULT_PLAN_LIMITS) => {
  const normalized = normalizePlanLimits(limits);
  const drafts = {};
  for (const planId of PLAN_ORDER) {
    drafts[planId] = {};
    for (const { key } of MODEL_LIMIT_FIELDS) drafts[planId][key] = limitInputValue(normalized[planId][key]);
  }
  return drafts;
};

const formatDate = (value, options = { day: "numeric", month: "short" }) => {
  const date = toJsDate(value);
  return date ? date.toLocaleDateString("en-IN", options) : "—";
};
const formatDateTime = (value) => {
  const date = toJsDate(value);
  return date ? date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";
};
const daysLeft = (value) => {
  const date = toJsDate(value);
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
};

const StatCard = ({ label, value, sub, accent }) => (
  <div className="sc">
    <div className="sc-label">{label}</div>
    <div className="sc-value" style={accent ? { color: accent } : {}}>{value}</div>
    {sub && <div className="sc-sub">{sub}</div>}
  </div>
);

export default function Analytics() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const hasLoaded = useRef(false);
  const [tab, setTab] = useState("overview");
  const [toast, setToast] = useState({ msg: "", type: "success" });

  const [stats, setStats] = useState({
    totalUsers: 0, totalConvs: 0, todayUsage: {}, planDist: { free: 0, pro: 0, ultra: 0, creator: 0 },
    activeToday: 0, paidUsers: 0, topUsers: [], recentSignups: [], expiringSoon: [],
    requests: [], pendingRequests: [], requestsByStatus: { pending: 0, approved: 0, rejected: 0 },
  });
  const [users, setUsers] = useState([]);
  const [limitDrafts, setLimitDrafts] = useState(makeDrafts(DEFAULT_PLAN_LIMITS));
  const [requestEdits, setRequestEdits] = useState({});

  // User controls
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [manualPlan, setManualPlan] = useState("pro");
  const [manualDays, setManualDays] = useState("30");
  const [busyId, setBusyId] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [limitsBusy, setLimitsBusy] = useState(false);

  // Chat inspector
  const [logUserSearch, setLogUserSearch] = useState("");
  const [logSelectedUserId, setLogSelectedUserId] = useState("");
  const [logConvs, setLogConvs] = useState([]);
  const [logSelectedConvId, setLogSelectedConvId] = useState("");
  const [logMessages, setLogMessages] = useState([]);
  const [logLoading, setLogLoading] = useState(false);

  // Platform settings
  const [platformSettings, setPlatformSettings] = useState({ maintenanceMode: false, globalNotice: "" });

  // User detail panel tab
  const [userDetailTab, setUserDetailTab] = useState("plan");

  // Ban confirm modal
  const [banConfirm, setBanConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: "", type: "success" }), 4000);
  }, []);

  const loadAnalytics = useCallback(async () => {
    const firstLoad = !hasLoaded.current;
    setLoading(firstLoad);
    setRefreshing(!firstLoad);
    setLoadError("");
    try {
      const results = await Promise.allSettled([
        getDocs(collection(db, "users")),
        getDoc(doc(db, "settings", "platform")),
        getDocs(collectionGroup(db, "planRequests")),
      ]);
      const failedQuery = results.findIndex(result => result.status === "rejected");
      if (failedQuery !== -1) {
        const labels = ["Users", "Platform settings", "Plan requests"];
        const reason = results[failedQuery].reason;
        throw new Error(`${labels[failedQuery]} query failed: ${reason?.message || "Unknown database error"}`);
      }
      const [usersSnap, settingsSnap, requestsSnap] = results.map(result => result.value);

      const settingsData = settingsSnap.exists() ? settingsSnap.data() : {};
      const nextPlanLimits = normalizePlanLimits(settingsData.planLimits || DEFAULT_PLAN_LIMITS);
      setPlatformSettings({
        maintenanceMode: settingsData.maintenanceMode || false,
        globalNotice: settingsData.globalNotice || "",
      });

      const requests = requestsSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id, userId: data.userId || d.ref.parent.parent?.id || "",
          requesterName: data.requesterName || "User", requesterEmail: data.requesterEmail || "",
          requestedPlan: data.requestedPlan || "pro", approvedPlan: data.approvedPlan || null,
          amount: data.amount || 0, status: data.status || "pending", durationDays: data.durationDays || 30,
          createdAt: toJsDate(data.createdAt), updatedAt: toJsDate(data.updatedAt || data.createdAt),
          handledAt: toJsDate(data.handledAt),
        };
      }).sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0));

      const requestsByUser = requests.reduce((acc, r) => {
        acc[r.userId] = acc[r.userId] || [];
        acc[r.userId].push(r);
        return acc;
      }, {});

      const baseUsers = usersSnap.docs.map((d) => {
        const data = d.data();
        const snapshot = getPlanSnapshot(data);
        return {
          id: d.id, name: data.name || data.email || "User", email: data.email || "",
          photoURL: data.photoURL || "", createdAt: toJsDate(data.createdAt),
          plan: snapshot.plan, isCreator: d.id === user?.uid, planExpiry: snapshot.planExpiryDate,
          isBanned: data.isBanned || false, latestRequest: requestsByUser[d.id]?.[0] || null,
        };
      });

      const enrichedUsers = await Promise.all(baseUsers.map(async (u) => {
        let convCount = 0, usageData = {};
        try { convCount = (await getDocs(collection(db, "users", u.id, "conversations"))).size; } catch { /* Conversation counts may be unavailable for a user. */ }
        try {
          const us = await getDoc(doc(db, "users", u.id, "usage", TODAY));
          usageData = us.exists() ? us.data() : {};
        } catch { /* Usage may not exist yet for a user. */ }
        const msgsToday = MODEL_LIMIT_FIELDS.reduce((s, f) => s + Number(usageData[f.key] || 0), 0);
        return { ...u, convCount, usageToday: usageData, msgsToday };
      }));

      enrichedUsers.sort((a, b) => {
        if (b.msgsToday !== a.msgsToday) return b.msgsToday - a.msgsToday;
        return (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0);
      });

      const todayUsage = {}, planDist = { free: 0, pro: 0, ultra: 0, creator: 0 };
      let totalConvs = 0;
      for (const u of enrichedUsers) {
        const tier = u.isCreator ? "creator" : u.plan;
        planDist[tier] = (planDist[tier] || 0) + 1;
        totalConvs += u.convCount;
        if (!u.isCreator) {
          for (const f of MODEL_LIMIT_FIELDS) todayUsage[f.key] = (todayUsage[f.key] || 0) + Number(u.usageToday[f.key] || 0);
        }
      }

      setLimitDrafts(makeDrafts(nextPlanLimits));
      setRequestEdits(requests.reduce((acc, r) => {
        acc[r.id] = { plan: r.requestedPlan || "pro", days: String(r.durationDays || 30) };
        return acc;
      }, {}));
      setUsers(enrichedUsers);
      setStats({
        totalUsers: enrichedUsers.length, totalConvs, todayUsage, planDist,
        activeToday: enrichedUsers.filter(u => !u.isCreator && u.msgsToday > 0).length,
        paidUsers: enrichedUsers.filter(u => !u.isCreator && u.plan !== "free").length,
        topUsers: [...enrichedUsers].filter(u => !u.isCreator && u.msgsToday > 0).sort((a, b) => b.msgsToday - a.msgsToday).slice(0, 10),
        recentSignups: [...enrichedUsers].sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)).slice(0, 8),
        expiringSoon: enrichedUsers.filter(u => !u.isCreator && u.plan !== "free" && u.planExpiry && daysLeft(u.planExpiry) !== null && daysLeft(u.planExpiry) <= 7)
          .sort((a, b) => (a.planExpiry?.getTime() || 0) - (b.planExpiry?.getTime() || 0)).slice(0, 8),
        requests, pendingRequests: requests.filter(r => r.status === "pending"),
        requestsByStatus: requests.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, { pending: 0, approved: 0, rejected: 0 }),
      });
      hasLoaded.current = true;
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Analytics dashboard load failed:", error);
      setLoadError(error?.message || "The dashboard data could not be loaded.");
      showToast("Failed to load dashboard data.", "error");
    }
    setLoading(false);
    setRefreshing(false);
  }, [showToast, user?.uid]);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (user?.app_metadata?.role !== "admin") { navigate("/chat"); return undefined; }
    const timer = window.setTimeout(() => { void loadAnalytics(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAnalytics, navigate, user?.app_metadata?.role]);

  // Chat inspector
  const handleSelectLogUser = async (uid) => {
    setLogSelectedUserId(uid); setLogSelectedConvId(""); setLogMessages([]); setLogLoading(true);
    try {
      const q = query(collection(db, "users", uid, "conversations"), orderBy("createdAt", "desc"), limit(50));
      const snap = await getDocs(q);
      setLogConvs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { showToast("Failed to load conversations.", "error"); }
    setLogLoading(false);
  };

  const handleSelectLogConv = async (convId) => {
    setLogSelectedConvId(convId); setLogLoading(true);
    try {
      const q = query(collection(db, "users", logSelectedUserId, "conversations", convId, "messages"), orderBy("createdAt", "asc"), limit(100));
      const snap = await getDocs(q);
      setLogMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { showToast("Failed to load messages.", "error"); }
    setLogLoading(false);
  };

  // User controls
  const selectedUser = users.find(u => u.id === selectedUserId) || null;
  const filteredUsers = users.filter(u => `${u.name} ${u.email}`.toLowerCase().includes(userSearch.toLowerCase()));
  const filteredLogUsers = users.filter(u => `${u.name} ${u.email}`.toLowerCase().includes(logUserSearch.toLowerCase()));

  const applyPlanToUser = async (userId, nextPlan, durationDays, source, extra = {}) => {
    const days = Math.max(1, Number(durationDays) || 30);
    const expiryDate = nextPlan === "free" ? null : calculatePlanExpiry(days);
    await setDoc(doc(db, "users", userId), {
      plan: nextPlan, planExpiry: expiryDate,
      planGrantedAt: serverTimestamp(), planGrantedBy: user.uid, planSource: source, ...extra,
    }, { merge: true });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, plan: nextPlan, planExpiry: expiryDate } : u));
  };

  const handleRequestDecision = async (request, nextStatus) => {
    setBusyId(request.id);
    try {
      const edit = requestEdits[request.id] || { plan: request.requestedPlan, days: "30" };
      if (nextStatus === "approved") await applyPlanToUser(request.userId, edit.plan, edit.days, "creator_approval", { lastApprovedRequestId: request.id });
      await setDoc(doc(db, "users", request.userId, "planRequests", request.id), {
        status: nextStatus, approvedPlan: nextStatus === "approved" ? edit.plan : null,
        durationDays: Number(edit.days), handledAt: serverTimestamp(), handledBy: user.uid, updatedAt: serverTimestamp(),
      }, { merge: true });
      showToast(nextStatus === "approved" ? "Plan approved and applied." : "Request rejected.");
      await loadAnalytics();
    } catch { showToast("Action failed.", "error"); }
    setBusyId("");
  };

  const handleManualGrant = async () => {
    if (!selectedUser) return;
    setManualBusy(true);
    try {
      await applyPlanToUser(selectedUser.id, manualPlan, manualDays, "creator_manual");
      showToast(`${selectedUser.name} upgraded to ${manualPlan.toUpperCase()} for ${manualDays} days.`);
    } catch { showToast("Could not update user.", "error"); }
    setManualBusy(false);
  };

  const handleToggleBan = async () => {
    if (!selectedUser) return;
    setBanConfirm(false);
    try {
      const newBan = !selectedUser.isBanned;
      await setDoc(doc(db, "users", selectedUser.id), { isBanned: newBan }, { merge: true });
      showToast(newBan ? `${selectedUser.name} banned.` : `${selectedUser.name} unbanned.`);
      setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, isBanned: newBan } : u));
    } catch { showToast("Failed to update ban status.", "error"); }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    setDeleteConfirm(false);
    try {
      await deleteDoc(doc(db, "users", selectedUser.id));
      showToast(`${selectedUser.name}'s data deleted.`);
      setUsers(prev => prev.filter(u => u.id !== selectedUser.id));
      setSelectedUserId("");
    } catch { showToast("Failed to delete. Check database access rules.", "error"); }
  };

  const handleResetUsage = async () => {
    if (!selectedUser) return;
    setResetConfirm(false);
    try {
      await setDoc(doc(db, "users", selectedUser.id, "usage", TODAY), {}, { merge: false });
      showToast(`Usage reset for ${selectedUser.name}.`);
    } catch { showToast("Failed to reset usage.", "error"); }
  };

  const handleSavePlatform = async () => {
    setLimitsBusy(true);
    try {
      const normalized = normalizePlanLimits(limitDrafts);
      await setDoc(doc(db, "settings", "platform"), {
        planLimits: serializePlanLimits(normalized),
        maintenanceMode: platformSettings.maintenanceMode,
        globalNotice: platformSettings.globalNotice,
        updatedAt: serverTimestamp(), updatedBy: user.uid,
      }, { merge: true });
      setLimitDrafts(makeDrafts(normalized));
      showToast("Platform settings saved successfully.");
    } catch { showToast("Could not save settings.", "error"); }
    setLimitsBusy(false);
  };

  const TABS = [
    { id: "overview",  label: "Overview" },
    { id: "requests",  label: "Requests", count: stats.pendingRequests.length },
    { id: "users",     label: "Users" },
    { id: "chatlogs",  label: "Chat inspector" },
    { id: "platform",  label: "Platform" },
  ];

  const maxUsage = Math.max(...Object.values(stats.todayUsage || {}), 1);

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; background: #000; font-family: 'Manrope', sans-serif; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: #222; border-radius: 4px; }

        @keyframes twinkle { 0%,100%{opacity:0.1} 50%{opacity:0.5} }
        @keyframes fadein  { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideup { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }

        .starfield { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
        .star { position: absolute; border-radius: 50%; background: #fff; animation: twinkle linear infinite; }

        /* ── ROOT ── */
        .an { min-height: 100vh; color: #fff; position: relative; z-index: 1; }

        /* ── TOPBAR ── */
        .an-top {
          display: flex; align-items: center; gap: 12px; padding: 14px 24px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: rgba(5,5,8,0.9); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
          position: sticky; top: 0; z-index: 50;
        }
        .an-logo { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 600; color: #ddd; flex: 1; justify-content: center; }
        .an-logo-mark { width: 28px; height: 28px; background: linear-gradient(135deg,#3d1f8a,#1a0d2e); border: 1px solid rgba(124,92,252,0.35); border-radius: 9px; display: flex; align-items: center; justify-content: center; }
        .an-badge { font-size: 9.5px; padding: 3px 10px; background: rgba(124,92,252,0.12); border: 1px solid rgba(124,92,252,0.3); border-radius: 999px; color: #c4b5fd; font-weight: 600; letter-spacing: 0.3px; }
        .an-top-btn { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; color: #888; cursor: pointer; padding: 9px 16px; font-size: 12.5px; font-weight: 500; transition: all 0.2s; font-family: 'Manrope'; white-space: nowrap; }
        .an-top-btn:hover { background: rgba(255,255,255,0.08); color: #fff; border-color: rgba(255,255,255,0.15); }

        /* ── TABS BAR ── */
        .an-tab-bar { display: flex; gap: 4px; padding: 16px 24px 0; overflow-x: auto; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.3); }
        .an-tab-bar::-webkit-scrollbar { height: 0; }
        .an-tab { padding: 11px 20px; font-size: 13px; background: transparent; border: none; border-bottom: 2px solid transparent; color: #555; cursor: pointer; font-weight: 600; transition: all 0.2s; font-family: 'Manrope'; white-space: nowrap; }
        .an-tab:hover { color: #bbb; }
        .an-tab.active { color: #fff; border-bottom-color: #7c5cfc; }

        /* ── BODY ── */
        .an-body { padding: 32px 24px 80px; max-width: 1440px; margin: 0 auto; animation: slideup 0.3s ease; }

        /* ── TOAST ── */
        .an-toast {
          position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
          padding: 14px 24px; border-radius: 14px; font-size: 14px; font-weight: 600;
          z-index: 999; animation: fadein 0.3s ease; white-space: nowrap; max-width: 90vw;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        }
        .an-toast.success { background: rgba(4,120,87,0.9); border: 1px solid rgba(74,222,128,0.3); color: #4ade80; backdrop-filter: blur(12px); }
        .an-toast.error   { background: rgba(127,29,29,0.9); border: 1px solid rgba(239,68,68,0.3); color: #fca5a5; backdrop-filter: blur(12px); }

        /* ── STAT CARDS ── */
        .sc-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 16px; margin-bottom: 32px; }
        @media(max-width:1100px){.sc-grid{grid-template-columns:repeat(3,1fr);}}
        @media(max-width:700px) {.sc-grid{grid-template-columns:repeat(2,1fr);}}
        .sc { background: rgba(8,8,14,0.7); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.07); border-radius: 20px; padding: 24px; }
        .sc-label { font-size: 11px; color: #555; letter-spacing: .8px; text-transform: uppercase; font-weight: 600; margin-bottom: 12px; }
        .sc-value { font-size: 34px; font-weight: 700; color: #fff; letter-spacing: -1px; margin-bottom: 6px; }
        .sc-sub { font-size: 12.5px; color: #555; }

        /* ── SECTION CARDS ── */
        .an-section { background: rgba(8,8,14,0.7); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.07); border-radius: 20px; padding: 28px; }
        .an-section-title { font-size: 12px; color: #888; letter-spacing: .8px; text-transform: uppercase; font-weight: 600; margin-bottom: 22px; }
        .an-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        @media(max-width:900px){.an-2col{grid-template-columns:1fr;}}
        .an-3col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; }
        @media(max-width:1200px){.an-3col{grid-template-columns:1fr 1fr;}}
        @media(max-width:700px) {.an-3col{grid-template-columns:1fr;}}

        /* ── LIST ITEMS ── */
        .an-item { display: flex; align-items: center; gap: 14px; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .an-item:last-child { border-bottom: none; padding-bottom: 0; }
        .an-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .an-bar-wrap { flex: 1; height: 5px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; }
        .an-bar-fill { height: 100%; border-radius: 999px; }
        .an-count { font-size: 14px; color: #fff; font-weight: 600; flex-shrink: 0; min-width: 28px; text-align: right; }
        .an-name { font-size: 13.5px; color: #ccc; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .an-empty { font-size: 14px; color: #444; padding: 32px 0; text-align: center; font-style: italic; }
        .an-loading { display: flex; align-items: center; justify-content: center; height: 60vh; color: #555; font-size: 15px; gap: 12px; }

        /* ── USER ROW ── */
        .an-urow { display: flex; align-items: center; gap: 14px; padding: 16px; border-radius: 14px; cursor: pointer; transition: all 0.15s; border: 1px solid transparent; margin-bottom: 8px; }
        .an-urow:hover { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.06); }
        .an-urow.sel { background: rgba(108,71,255,0.1); border-color: rgba(108,71,255,0.4); }
        .an-av { width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: #bbb; flex-shrink: 0; overflow: hidden; }
        .an-av img { width: 100%; height: 100%; object-fit: cover; }
        .an-uinfo { flex: 1; min-width: 0; }
        .an-uname { font-size: 14px; font-weight: 600; color: #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .an-uemail { font-size: 12px; color: #555; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .an-umeta { font-size: 11px; color: #444; margin-top: 3px; }

        /* ── PLAN CHIPS ── */
        .chip { font-size: 10px; padding: 4px 10px; border-radius: 6px; border: 1px solid transparent; font-weight: 700; letter-spacing: .5px; white-space: nowrap; }
        .chip.free   { background: rgba(255,255,255,0.04); color: #555; border-color: rgba(255,255,255,0.08); }
        .chip.pro    { background: rgba(167,139,250,0.1); color: #a78bfa; border-color: rgba(167,139,250,0.25); }
        .chip.ultra  { background: rgba(103,232,249,0.1); color: #67e8f9; border-color: rgba(103,232,249,0.25); }
        .chip.banned { background: rgba(239,68,68,0.1); color: #fca5a5; border-color: rgba(239,68,68,0.3); }
        .chip.pending  { background: #1a1408; color: #fbbf24; border-color: #33270b; }
        .chip.approved { background: #0a1710; color: #4ade80; border-color: #12311f; }
        .chip.rejected { background: #170b0b; color: #f87171; border-color: #341515; }

        /* ── INPUTS / SELECTS / BUTTONS ── */
        .an-input, .an-select {
          width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px; padding: 13px 16px; font-size: 14px; color: #eee; outline: none;
          font-family: 'Manrope'; transition: border-color 0.2s;
        }
        .an-input:focus, .an-select:focus { border-color: rgba(108,71,255,0.6); background: rgba(255,255,255,0.06); }
        .an-input::placeholder { color: #444; }
        .an-select { appearance: none; cursor: pointer; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 14px center; padding-right: 36px; }
        .an-select option { background: #111; }

        .btn { border: none; border-radius: 12px; padding: 12px 20px; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-family: 'Manrope'; }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn.primary { background: #fff; color: #000; }
        .btn.primary:hover:not(:disabled) { background: #e8e8e8; }
        .btn.brand   { background: linear-gradient(135deg,#7c5cfc,#5c3dcc); color: #fff; border: 1px solid rgba(124,92,252,0.4); }
        .btn.brand:hover:not(:disabled) { box-shadow: 0 4px 20px rgba(124,92,252,0.3); }
        .btn.success { background: rgba(34,197,94,0.12); color: #4ade80; border: 1px solid rgba(74,222,128,0.25); }
        .btn.danger  { background: rgba(239,68,68,0.12); color: #fca5a5; border: 1px solid rgba(239,68,68,0.25); }
        .btn.outline { background: transparent; border: 1px solid rgba(255,255,255,0.1); color: #999; }
        .btn.outline:hover:not(:disabled) { border-color: rgba(255,255,255,0.2); color: #fff; background: rgba(255,255,255,0.05); }
        .btn.w100 { width: 100%; }

        /* ── USER DETAIL PANEL ── */
        .udp { background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 28px; margin-top: 20px; animation: fadein 0.2s ease; }
        .udp-tabs { display: flex; gap: 4px; margin-bottom: 24px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 4px; }
        .udp-tab { flex: 1; padding: 9px 12px; font-size: 12.5px; font-weight: 600; background: transparent; border: none; color: #555; cursor: pointer; border-radius: 7px; transition: 0.15s; font-family: 'Manrope'; }
        .udp-tab.active { background: rgba(255,255,255,0.08); color: #fff; }

        /* ── REQUESTS ── */
        .req-card { background: rgba(10,10,18,0.6); border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; padding: 24px; margin-bottom: 16px; }
        .req-head { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 18px; }
        .req-body { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }

        /* ── LIMIT CARDS ── */
        .lim-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 24px; }
        .lim-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .lim-row:last-child { border-bottom: none; }
        .lim-input { width: 80px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 10px; font-size: 13.5px; color: #fff; text-align: center; outline: none; font-family: 'Manrope'; font-weight: 600; transition: border-color 0.2s; }
        .lim-input:focus { border-color: rgba(108,71,255,0.6); }

        /* ── CHAT INSPECTOR ── */
        .ci-layout { display: grid; grid-template-columns: 280px 260px 1fr; gap: 20px; height: 72vh; min-height: 400px; }
        @media(max-width:1100px) { .ci-layout { grid-template-columns: 1fr; height: auto; } }
        .ci-col { background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.08); border-radius: 18px; display: flex; flex-direction: column; overflow: hidden; }
        .ci-header { padding: 18px 20px; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 11px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 1px; background: rgba(255,255,255,0.02); flex-shrink: 0; }
        .ci-body { flex: 1; overflow-y: auto; padding: 12px; }
        .ci-item { padding: 14px 16px; border-radius: 12px; cursor: pointer; transition: 0.15s; margin-bottom: 6px; border: 1px solid transparent; }
        .ci-item:hover { background: rgba(255,255,255,0.04); }
        .ci-item.active { background: rgba(108,71,255,0.12); border-color: rgba(108,71,255,0.3); }
        .ci-title { font-size: 14px; color: #fff; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 5px; }
        .ci-sub { font-size: 12px; color: #666; }
        .ci-msg { margin-bottom: 20px; }
        .ci-msg-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .ci-role { font-weight: 700; font-size: 11.5px; text-transform: uppercase; letter-spacing: .8px; }
        .ci-role.user { color: #4ade80; } .ci-role.assistant { color: #a78bfa; }
        .ci-time { font-size: 11px; color: #555; margin-left: auto; }
        .ci-content { background: rgba(255,255,255,0.04); padding: 18px 20px; border-radius: 14px; color: #ddd; white-space: pre-wrap; font-size: 13.5px; line-height: 1.7; border: 1px solid rgba(255,255,255,0.05); }
        .ci-msg.user .ci-content { border-color: rgba(74,222,128,0.12); background: rgba(74,222,128,0.03); }

        /* ── CONFIRM MODAL ── */
        .confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; z-index: 800; padding: 20px; }
        .confirm-box { background: rgba(10,10,16,0.98); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 32px; max-width: 400px; width: 100%; }
        .confirm-title { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 10px; }
        .confirm-desc { font-size: 14px; color: #666; line-height: 1.6; margin-bottom: 28px; }
        .confirm-btns { display: flex; gap: 10px; justify-content: flex-end; }

        /* ── PLATFORM TOGGLE ── */
        .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 20px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; margin-bottom: 16px; }
        .toggle-label { font-size: 14px; font-weight: 600; color: #ddd; }
        .toggle-sub { font-size: 12px; color: #555; margin-top: 4px; }
        .toggle-switch { width: 52px; height: 28px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); border-radius: 999px; cursor: pointer; position: relative; transition: background 0.2s; flex-shrink: 0; }
        .toggle-switch.on { background: rgba(124,92,252,0.4); border-color: rgba(124,92,252,0.6); }
        .toggle-knob { width: 22px; height: 22px; background: #fff; border-radius: 50%; position: absolute; top: 2px; left: 3px; transition: transform 0.2s; box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
        .toggle-switch.on .toggle-knob { transform: translateX(24px); }

        /* ── PILL GROUP ── */
        .pill-grp { display: flex; gap: 8px; flex-wrap: wrap; }
        .pill { padding: 9px 18px; font-size: 13px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; color: #777; cursor: pointer; transition: 0.15s; font-weight: 600; font-family: 'Manrope'; }
        .pill:hover { color: #ccc; border-color: rgba(255,255,255,0.14); }
        .pill.active { background: rgba(108,71,255,0.15); border-color: rgba(108,71,255,0.45); color: #c4b5fd; }

        @media(max-width:768px) {
          .an-top { padding: 12px 16px; }
          .an-body { padding: 20px 16px 80px; }
          .sc-grid { grid-template-columns: 1fr 1fr; gap: 12px; }
          .sc { padding: 18px; }
          .sc-value { font-size: 26px; }
          .an-section { padding: 20px; }
          .an-top-btn { padding: 8px 12px; font-size: 12px; }
          .an-tab { padding: 10px 14px; font-size: 12px; }
        }
      `}</style>

      {/* Starfield */}
      <div className="starfield">
        {STARS.map(s => (
          <div key={s.id} className="star" style={{ left:s.left, top:s.top, width:s.w, height:s.w, animationDuration:s.dur, animationDelay:s.delay, opacity:s.op }}/>
        ))}
      </div>

      {/* Toast */}
      {toast.msg && <div className={`an-toast ${toast.type}`}>{toast.msg}</div>}

      {/* Confirm Modals */}
      {banConfirm && (
        <div className="confirm-overlay">
          <div className="confirm-box">
            <div className="confirm-title">{selectedUser?.isBanned ? "Unban User?" : "Ban User?"}</div>
            <div className="confirm-desc">
              {selectedUser?.isBanned
                ? `Restore full access for ${selectedUser?.name}?`
                : `This will immediately block ${selectedUser?.name} from accessing Manshverse.`}
            </div>
            <div className="confirm-btns">
              <button className="btn outline" onClick={() => setBanConfirm(false)}>Cancel</button>
              <button className={`btn ${selectedUser?.isBanned ? "success" : "danger"}`} onClick={handleToggleBan}>
                {selectedUser?.isBanned ? "Unban" : "Ban"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="confirm-overlay">
          <div className="confirm-box">
            <div className="confirm-title">Delete User Data?</div>
            <div className="confirm-desc">This permanently wipes all Firestore records for <strong style={{color:"#fff"}}>{selectedUser?.email}</strong>. This cannot be undone.</div>
            <div className="confirm-btns">
              <button className="btn outline" onClick={() => setDeleteConfirm(false)}>Cancel</button>
              <button className="btn danger" onClick={handleDeleteUser}>Delete Permanently</button>
            </div>
          </div>
        </div>
      )}

      {resetConfirm && (
        <div className="confirm-overlay">
          <div className="confirm-box">
            <div className="confirm-title">Reset Today's Usage?</div>
            <div className="confirm-desc">Zero out all message counts for {selectedUser?.name} for today ({TODAY}).</div>
            <div className="confirm-btns">
              <button className="btn outline" onClick={() => setResetConfirm(false)}>Cancel</button>
              <button className="btn success" onClick={handleResetUsage}>Reset Usage</button>
            </div>
          </div>
        </div>
      )}

      <div className="an editorial">
        {/* Top bar */}
        <div className="an-top">
          <button className="an-top-btn" onClick={() => navigate("/chat")}>← Chat</button>
          <div className="an-logo">
            <BrandMark className="an-logo-mark" size={28} />
            <span className="an-wordmark">Manshverse</span><span className="an-badge">CREATOR CONSOLE</span>
          </div>
          <div className="an-top-actions">
            {lastUpdated && <span className="an-updated"><i/>Updated {lastUpdated.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>}
            <button className="an-top-btn an-refresh" onClick={loadAnalytics} disabled={loading || refreshing} aria-live="polite">
              <svg className={refreshing ? "is-spinning" : ""} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.55-2L20 12M4 12l2.85 5a7 7 0 0 0 11.55-2"/></svg>
              {refreshing ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="an-tab-bar" role="tablist" aria-label="Analytics sections">
          {TABS.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`an-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}{t.count > 0 && <span className="an-tab-count">{t.count}</span>}
            </button>
          ))}
        </div>

        <header className="an-masthead">
          <div className="an-masthead-copy"><div className="an-kicker"><span>MANSHVERSE / ADMINISTRATION</span><span>DAILY SNAPSHOT · {TODAY}</span></div><h1>Platform <em>report.</em></h1><p>Usage, members and operations across your workspace.</p></div>
          <div className="an-masthead-mark"><span>MV</span><small>CREATOR<br/>ACCESS</small></div>
        </header>

        {loading ? (
          <div className="an-loading">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" style={{animation:"spin 1s linear infinite"}}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            Fetching live platform data...
          </div>
        ) : loadError && !hasLoaded.current ? (
          <div className="an-load-error" role="alert">
            <div className="an-load-error-icon"><AppIcon name="alert" size={18}/></div>
            <div>
              <h2>Dashboard data couldn’t load</h2>
              <p>{loadError}</p>
              <button className="an-top-btn" onClick={loadAnalytics}>Try again</button>
            </div>
          </div>
        ) : (
          <div className="an-body">

            {/* ── OVERVIEW ── */}
            {tab === "overview" && (
              <>
                <div className="sc-grid">
                  <StatCard label="Total Users" value={stats.totalUsers} sub={`${stats.paidUsers} paid · ${stats.planDist.creator || 0} creator`} />
                  <StatCard label="Active Today" value={stats.activeToday} sub={`of ${stats.totalUsers} users`} accent="#4ade80" />
                  <StatCard label="Messages Today" value={Object.values(stats.todayUsage).reduce((s,v) => s+v, 0)} sub="across all models" />
                  <StatCard label="MRR (est.)" value={`₹${(stats.planDist.pro*(PLAN_META.pro?.amount||199)) + (stats.planDist.ultra*(PLAN_META.ultra?.amount||1999))}`} sub="monthly recurring" accent="#a78bfa" />
                  <StatCard label="Pending" value={stats.pendingRequests.length} sub={`${stats.requestsByStatus.approved} approved`} accent={stats.pendingRequests.length > 0 ? "#fbbf24" : undefined} />
                </div>

                <div className="an-2col" style={{marginBottom: 24}}>
                  <div className="an-section">
                    <div className="an-section-title">Model usage today</div>
                    {MODEL_LIMIT_FIELDS.length === 0 ? <div className="an-empty">No usage data.</div> : MODEL_LIMIT_FIELDS.map(f => (
                      <div key={f.key} className="an-item">
                        <div className="an-dot" style={{background: f.color}}/>
                        <div className="an-name">{f.short}</div>
                        <div className="an-bar-wrap">
                          <div className="an-bar-fill" style={{width:`${((stats.todayUsage[f.key]||0)/maxUsage)*100}%`, background: f.color}}/>
                        </div>
                        <div className="an-count">{stats.todayUsage[f.key] || 0}</div>
                      </div>
                    ))}
                  </div>

                  <div className="an-section">
                    <div className="an-section-title">Plan distribution</div>
                    {[...PLAN_ORDER, "creator"].map(planId => (
                      <div key={planId} className="an-item">
                        <div className="an-name" style={{color: planId === "creator" ? "#e9a8ff" : PLAN_META[planId]?.color || "#888"}}>{planId === "creator" ? "Creator" : PLAN_META[planId]?.name || planId}</div>
                        <div className="an-bar-wrap">
                          <div className="an-bar-fill" style={{width:`${stats.totalUsers ? ((stats.planDist[planId]||0)/stats.totalUsers)*100 : 0}%`, background: planId === "creator" ? "#c084fc" : PLAN_META[planId]?.color || "#555"}}/>
                        </div>
                        <div className="an-count">{stats.planDist[planId] || 0}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="an-2col">
                  <div className="an-section">
                    <div className="an-section-title">Most active today</div>
                    {stats.topUsers.length === 0 ? <div className="an-empty">No active users today.</div> : stats.topUsers.slice(0, 6).map(u => (
                      <div key={u.id} className="an-item">
                        <div className="an-av">{u.photoURL ? <img src={u.photoURL} alt=""/> : (u.name?.[0]||"?").toUpperCase()}</div>
                        <div className="an-name">{u.name}<div style={{fontSize:"11px",color:"#555"}}>{u.email}</div></div>
                        <div className="an-count" style={{color:"#4ade80"}}>{u.msgsToday}</div>
                      </div>
                    ))}
                  </div>

                  <div className="an-section">
                    <div className="an-section-title">Expiring soon (≤7 days)</div>
                    {stats.expiringSoon.length === 0 ? <div className="an-empty">No plans expiring soon.</div> : stats.expiringSoon.map(u => (
                      <div key={u.id} className="an-item">
                        <div className="an-av">{(u.name?.[0]||"?").toUpperCase()}</div>
                        <div className="an-name">{u.name}<div style={{fontSize:"11px",color:"#555"}}>{u.email}</div></div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <span className={`chip ${u.plan}`}>{u.plan.toUpperCase()}</span>
                          <div style={{fontSize:"11px",color:"#fbbf24",marginTop:4}}>{daysLeft(u.planExpiry)}d left</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── REQUESTS ── */}
            {tab === "requests" && (
              <div className="an-2col">
                <div className="an-section">
                  <div className="an-section-title">Pending approvals ({stats.pendingRequests.length})</div>
                  {stats.pendingRequests.length === 0 ? (
                    <div className="an-empty"><AppIcon name="check" size={15}/> All clear. No pending requests.</div>
                  ) : stats.pendingRequests.map(r => {
                    const edit = requestEdits[r.id] || { plan: r.requestedPlan, days: "30" };
                    return (
                      <div key={r.id} className="req-card">
                        <div className="req-head">
                          <div className="an-av">{(r.requesterName?.[0]||"?").toUpperCase()}</div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:"15px",fontWeight:600,color:"#fff"}}>{r.requesterName}</div>
                            <div style={{fontSize:"12px",color:"#555",margin:"3px 0"}}>{r.requesterEmail}</div>
                            <div style={{fontSize:"13px",color:"#a78bfa",fontWeight:600}}>₹{r.amount} · {formatDateTime(r.createdAt)}</div>
                          </div>
                        </div>
                        <div className="req-body">
                          <select className="an-select" style={{maxWidth:140}} value={edit.plan} onChange={e => setRequestEdits(p => ({...p,[r.id]:{...edit,plan:e.target.value}}))}>
                            {PLAN_ORDER.map(p => <option key={p} value={p}>{PLAN_META[p]?.name} Plan</option>)}
                          </select>
                          <input className="an-input" style={{maxWidth:90,textAlign:"center"}} value={edit.days} onChange={e => setRequestEdits(p => ({...p,[r.id]:{...edit,days:e.target.value}}))} placeholder="Days"/>
                          <button className="btn success" onClick={() => handleRequestDecision(r,"approved")} disabled={busyId===r.id}>{busyId===r.id?"...":<><AppIcon name="check" size={13}/> Approve</>}</button>
                          <button className="btn danger"  onClick={() => handleRequestDecision(r,"rejected")} disabled={busyId===r.id}><AppIcon name="close" size={13}/> Reject</button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="an-section">
                  <div className="an-section-title">Processed history</div>
                  {stats.requests.filter(r => r.status !== "pending").length === 0 ? (
                    <div className="an-empty">No processed requests yet.</div>
                  ) : stats.requests.filter(r => r.status !== "pending").slice(0, 15).map(r => (
                    <div key={r.id} className="an-item">
                      <div className="an-av">{(r.requesterName?.[0]||"?").toUpperCase()}</div>
                      <div className="an-uinfo">
                        <div className="an-uname">{r.requesterName}</div>
                        <div className="an-uemail">{r.requesterEmail}</div>
                        <div className="an-umeta">Handled {formatDateTime(r.handledAt||r.updatedAt)}</div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end",flexShrink:0}}>
                        <span className={`chip ${r.approvedPlan||r.requestedPlan}`}>{(r.approvedPlan||r.requestedPlan).toUpperCase()}</span>
                        <span className={`chip ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── USERS ── */}
            {tab === "users" && (
              <div className="an-user-layout" style={{display:"grid",gridTemplateColumns:"360px 1fr",gap:24}}>
                <div style={{display:"flex",flexDirection:"column",gap:16}}>
                  <div className="an-section" style={{padding:20}}>
                    <input className="an-input" placeholder="Search by name or email..." value={userSearch} onChange={e => setUserSearch(e.target.value)} style={{marginBottom:16}}/>
                    <div style={{maxHeight:520,overflowY:"auto",paddingRight:4}}>
                      {filteredUsers.length === 0 ? (
                        <div className="an-empty">No users found.</div>
                      ) : filteredUsers.map(u => (
                        <button type="button" key={u.id} className={`an-urow ${selectedUserId===u.id?"sel":""}`} aria-pressed={selectedUserId===u.id} onClick={() => { setSelectedUserId(u.id); setUserDetailTab("plan"); }}>
                          <div className="an-av">{u.photoURL ? <img src={u.photoURL} alt=""/> : (u.name?.[0]||"?").toUpperCase()}</div>
                          <div className="an-uinfo">
                            <div className="an-uname">{u.name}</div>
                            <div className="an-uemail">{u.email}</div>
                            <div className="an-umeta">{u.convCount} convs · {u.msgsToday} msgs today</div>
                          </div>
                          <span className={`chip ${u.isBanned?"banned":u.isCreator?"creator":u.plan}`}>{u.isBanned?"BANNED":u.isCreator?"CREATOR":u.plan.toUpperCase()}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* User detail panel */}
                <div>
                  {!selectedUser ? (
                    <div className="an-section" style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <div style={{textAlign:"center",color:"#444"}}>
                        <AppIcon className="an-empty-icon" name="pointer" size={32}/>
                        <div style={{fontSize:15,fontWeight:600}}>Select a user to manage</div>
                        <div style={{fontSize:13,marginTop:6}}>{filteredUsers.length} users total</div>
                      </div>
                    </div>
                  ) : (
                    <div className="an-section">
                      {/* User header */}
                      <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:28,paddingBottom:24,borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
                        <div className="an-av" style={{width:52,height:52,fontSize:18}}>
                          {selectedUser.photoURL ? <img src={selectedUser.photoURL} alt=""/> : (selectedUser.name?.[0]||"?").toUpperCase()}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:18,fontWeight:700,color:"#fff",marginBottom:4}}>{selectedUser.name}</div>
                          <div style={{fontSize:13,color:"#555"}}>{selectedUser.email}</div>
                          <div style={{fontSize:11,color:"#444",marginTop:4, fontFamily:"monospace"}}>{selectedUser.id.slice(0,20)}...</div>
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
                          <span className={`chip ${selectedUser.isBanned?"banned":selectedUser.isCreator?"creator":selectedUser.plan}`}>
                            {selectedUser.isBanned?"BANNED":selectedUser.isCreator?"CREATOR":selectedUser.plan.toUpperCase()}
                          </span>
                          {selectedUser.planExpiry && !selectedUser.isBanned && (
                            <span style={{fontSize:"11px",color:"#555"}}>Expires {formatDate(selectedUser.planExpiry)}</span>
                          )}
                        </div>
                      </div>

                      {/* Detail tabs */}
                      <div className="udp-tabs">
                        {[{id:"plan",l:"Plan Override"},{id:"stats",l:"Usage Stats"},{id:"danger",l:"Danger Zone"}].map(t => (
                          <button key={t.id} className={`udp-tab ${userDetailTab===t.id?"active":""}`} onClick={() => setUserDetailTab(t.id)}>{t.l}</button>
                        ))}
                      </div>

                      {userDetailTab === "plan" && (
                        <div>
                          <div style={{fontSize:12,color:"#666",marginBottom:18}}>Force-assign a plan. This overrides any existing plan immediately.</div>
                          <div className="pill-grp" style={{marginBottom:18}}>
                            {PLAN_ORDER.map(p => (
                              <button key={p} className={`pill ${manualPlan===p?"active":""}`} onClick={() => setManualPlan(p)}>
                                {PLAN_META[p]?.name||p}
                              </button>
                            ))}
                          </div>
                          <div style={{display:"flex",gap:12,marginBottom:12}}>
                            <input className="an-input" value={manualDays} onChange={e => setManualDays(e.target.value)} placeholder="Duration (days)"/>
                            <button className="btn primary" style={{flexShrink:0,padding:"13px 24px"}} onClick={handleManualGrant} disabled={manualBusy}>
                              {manualBusy ? "Applying..." : "Apply Plan"}
                            </button>
                          </div>
                          {selectedUser.latestRequest && (
                            <div style={{padding:"14px 18px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,marginTop:16}}>
                              <div style={{fontSize:12,color:"#666",marginBottom:6}}>LATEST REQUEST</div>
                              <div style={{display:"flex",alignItems:"center",gap:10}}>
                                <span className={`chip ${selectedUser.latestRequest.requestedPlan}`}>{selectedUser.latestRequest.requestedPlan.toUpperCase()}</span>
                                <span className={`chip ${selectedUser.latestRequest.status}`}>{STATUS_LABEL[selectedUser.latestRequest.status]}</span>
                                <span style={{fontSize:12,color:"#555",marginLeft:"auto"}}>{formatDateTime(selectedUser.latestRequest.createdAt)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {userDetailTab === "stats" && (
                        <div>
                          <div className="an-3col" style={{marginBottom:20}}>
                            <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:14,padding:20}}>
                              <div style={{fontSize:11,color:"#555",marginBottom:8}}>CONVERSATIONS</div>
                              <div style={{fontSize:28,fontWeight:700,color:"#fff"}}>{selectedUser.convCount}</div>
                            </div>
                            <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:14,padding:20}}>
                              <div style={{fontSize:11,color:"#555",marginBottom:8}}>MSGS TODAY</div>
                              <div style={{fontSize:28,fontWeight:700,color:"#4ade80"}}>{selectedUser.msgsToday}</div>
                            </div>
                            <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:14,padding:20}}>
                              <div style={{fontSize:11,color:"#555",marginBottom:8}}>JOINED</div>
                              <div style={{fontSize:18,fontWeight:700,color:"#fff"}}>{formatDate(selectedUser.createdAt,{day:"numeric",month:"short",year:"numeric"})}</div>
                            </div>
                          </div>
                          <div style={{fontSize:12,color:"#555",marginBottom:12}}>TODAY'S MODEL BREAKDOWN</div>
                          {MODEL_LIMIT_FIELDS.map(f => (
                            <div key={f.key} className="an-item">
                              <div className="an-dot" style={{background:f.color}}/>
                              <div className="an-name">{f.short}</div>
                              <div className="an-count">{selectedUser.usageToday?.[f.key] || 0}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {userDetailTab === "danger" && (
                        <div style={{display:"flex",flexDirection:"column",gap:14}}>
                          <div style={{padding:"18px 20px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:14}}>
                            <div style={{fontSize:14,fontWeight:600,color:"#ddd",marginBottom:6}}>Reset Today's Usage</div>
                            <div style={{fontSize:13,color:"#555",marginBottom:16}}>Zeros out all message counts for today. User gets a fresh daily quota.</div>
                            <button className="btn outline" onClick={() => setResetConfirm(true)}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                              Reset Usage
                            </button>
                          </div>

                          <div style={{padding:"18px 20px",background:selectedUser.isBanned?"rgba(74,222,128,0.04)":"rgba(239,68,68,0.04)",border:`1px solid ${selectedUser.isBanned?"rgba(74,222,128,0.15)":"rgba(239,68,68,0.15)"}`,borderRadius:14}}>
                            <div style={{fontSize:14,fontWeight:600,color:selectedUser.isBanned?"#4ade80":"#fca5a5",marginBottom:6}}>
                              {selectedUser.isBanned ? "Unban User" : "Ban User"}
                            </div>
                            <div style={{fontSize:13,color:"#555",marginBottom:16}}>
                              {selectedUser.isBanned ? "Restore full platform access for this user." : "Block this user from accessing Manshverse immediately."}
                            </div>
                            <button className={`btn ${selectedUser.isBanned?"success":"danger"}`} onClick={() => setBanConfirm(true)}>
                              {selectedUser.isBanned ? "Unban Account" : "Ban Account"}
                            </button>
                          </div>

                          <div style={{padding:"18px 20px",background:"rgba(239,68,68,0.04)",border:"1px solid rgba(239,68,68,0.15)",borderRadius:14}}>
                            <div style={{fontSize:14,fontWeight:600,color:"#fca5a5",marginBottom:6}}>Delete User Data</div>
                            <div style={{fontSize:13,color:"#555",marginBottom:16}}>Permanently delete all Firestore records for this user. This cannot be undone.</div>
                            <button className="btn danger" onClick={() => setDeleteConfirm(true)}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                              Delete Permanently
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── CHAT INSPECTOR ── */}
            {tab === "chatlogs" && (
              <div className="an-section">
                <div className="an-section-title" style={{marginBottom:24}}>Live Chat Inspector — God Mode</div>
                <div className="ci-layout">
                  <div className="ci-col">
                    <div className="ci-header">1 · Select User</div>
                    <div style={{padding:"12px 12px 0"}}>
                      <input className="an-input" placeholder="Search users..." value={logUserSearch} onChange={e => setLogUserSearch(e.target.value)} style={{marginBottom:12}}/>
                    </div>
                    <div className="ci-body">
                      {filteredLogUsers.map(u => (
                        <button type="button" key={u.id} className={`ci-item ${logSelectedUserId===u.id?"active":""}`} onClick={() => handleSelectLogUser(u.id)}>
                          <div className="ci-title">{u.name}</div>
                          <div className="ci-sub">{u.email}</div>
                          <div style={{fontSize:"10px",color:"#666",marginTop:5,fontWeight:500}}>{u.msgsToday} msgs today · {u.convCount} convs</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="ci-col">
                    <div className="ci-header">2 · Select Conversation</div>
                    <div className="ci-body">
                      {!logSelectedUserId ? <div className="an-empty">← Select a user</div>
                        : logLoading && !logConvs.length ? <div className="an-empty">Loading...</div>
                        : logConvs.length === 0 ? <div className="an-empty">No conversations.</div>
                        : logConvs.map(c => (
                          <button type="button" key={c.id} className={`ci-item ${logSelectedConvId===c.id?"active":""}`} onClick={() => handleSelectLogConv(c.id)}>
                            <div className="ci-title">{c.title||"Untitled"}</div>
                            <div className="ci-sub" style={{color:c.isPersona?"#a78bfa":"#666"}}>{c.model}{c.isPersona?" · Persona":""}</div>
                            <div style={{fontSize:"10px",color:"#555",marginTop:5}}>{formatDateTime(c.createdAt)}</div>
                          </button>
                        ))
                      }
                    </div>
                  </div>

                  <div className="ci-col">
                    <div className="ci-header">3 · Messages</div>
                    <div className="ci-body" style={{background:"rgba(0,0,0,0.4)"}}>
                      {!logSelectedConvId ? <div className="an-empty">← Pick a conversation</div>
                        : logLoading ? <div className="an-empty">Loading messages...</div>
                        : logMessages.length === 0 ? <div className="an-empty">No messages.</div>
                        : logMessages.map(m => (
                          <div key={m.id} className={`ci-msg ${m.role}`}>
                            <div className="ci-msg-head">
                              <span className={`ci-role ${m.role}`}>{m.role==="user"?"User":(m.modelLabel||"AI")}</span>
                              <span className="ci-time">{formatDateTime(m.createdAt)}</span>
                            </div>
                            <div className="ci-content">{m.content}</div>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── PLATFORM SETTINGS ── */}
            {tab === "platform" && (
              <div className="an-platform-layout" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
                <div className="an-section">
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
                    <div className="an-section-title" style={{marginBottom:0}}>Global AI Limits</div>
                    <button className="btn brand" onClick={handleSavePlatform} disabled={limitsBusy}>
                      {limitsBusy ? "Saving..." : "Save to Cloud"}
                    </button>
                  </div>
                  <div style={{fontSize:13,color:"#555",marginBottom:24,lineHeight:1.6}}>
                    Empty = unlimited. Changes propagate to all active users immediately based on their tier.
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:16}}>
                    {PLAN_ORDER.map(planId => (
                      <div className="lim-card" key={planId}>
                        <div style={{fontSize:14,fontWeight:700,color:PLAN_META[planId]?.color||"#888",marginBottom:18,paddingBottom:14,borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
                          {PLAN_META[planId]?.name||planId} Tier
                        </div>
                        {MODEL_LIMIT_FIELDS.map(f => (
                          <div key={f.key} className="lim-row">
                            <div className="an-dot" style={{background:f.color}}/>
                            <div className="an-name" title={f.key} style={{fontSize:12}}>{f.short}</div>
                            <input className="lim-input" value={limitDrafts[planId]?.[f.key]||""} onChange={e => setLimitDrafts(c => ({...c,[planId]:{...c[planId],[f.key]:e.target.value}}))} placeholder={planId==="ultra"?"∞":String(DEFAULT_PLAN_LIMITS[planId]?.[f.key]||0)}/>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{display:"flex",flexDirection:"column",gap:20}}>
                  <div className="an-section">
                    <div className="an-section-title">Platform Controls</div>
                    <div style={{fontSize:13,color:"#555",marginBottom:20,lineHeight:1.6}}>
                      All changes require clicking "Save to Cloud" above to take effect.
                    </div>

                    <div style={{marginBottom:20}}>
                      <div style={{fontSize:12,color:"#888",fontWeight:600,textTransform:"uppercase",letterSpacing:".6px",marginBottom:10}}>Global Announcement Banner</div>
                      <input className="an-input" placeholder="e.g. Scheduled maintenance tonight at 2AM IST..." value={platformSettings.globalNotice} onChange={e => setPlatformSettings({...platformSettings,globalNotice:e.target.value})}/>
                      <div style={{fontSize:12,color:"#444",marginTop:8}}>Shows as a banner to all users when maintenance mode is ON.</div>
                    </div>

                    <div style={{marginBottom:20}}>
                      <div className="toggle-row">
                        <div>
                          <div className="toggle-label">Maintenance Mode</div>
                          <div className="toggle-sub">Blocks all non-creator users from the platform</div>
                        </div>
                        <button type="button" className={`toggle-switch ${platformSettings.maintenanceMode?"on":""}`} role="switch" aria-checked={platformSettings.maintenanceMode} aria-label="Maintenance mode" onClick={() => setPlatformSettings(p => ({...p,maintenanceMode:!p.maintenanceMode}))}>
                          <div className="toggle-knob"/>
                        </button>
                      </div>
                      {platformSettings.maintenanceMode && (
                        <div style={{padding:"12px 16px",background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:10,fontSize:13,color:"#fca5a5"}}>
                          <AppIcon name="alert" size={15}/> Maintenance mode is currently <strong>ON</strong>. All non-creator users are locked out.
                        </div>
                      )}
                    </div>

                    <button className="btn brand w100" onClick={handleSavePlatform} disabled={limitsBusy} style={{padding:16}}>
                      {limitsBusy ? "Saving..." : <><AppIcon name="save" size={14}/> Save All Platform Settings</>}
                    </button>
                  </div>

                  <div className="an-section">
                    <div className="an-section-title">Recent Signups</div>
                    {stats.recentSignups.length === 0 ? <div className="an-empty">No recent signups.</div> : stats.recentSignups.map(u => (
                      <div key={u.id} className="an-item">
                        <div className="an-av">{(u.name?.[0]||"?").toUpperCase()}</div>
                        <div className="an-uinfo">
                          <div className="an-uname">{u.name}</div>
                          <div className="an-uemail">{formatDate(u.createdAt,{day:"numeric",month:"short",year:"numeric"})}</div>
                        </div>
                        <span className={`chip ${u.isCreator?"creator":u.plan}`}>{u.isCreator?"CREATOR":u.plan.toUpperCase()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

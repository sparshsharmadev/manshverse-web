import { doc, getDoc, serverTimestamp, setDoc } from "./firestore";

export const APP_TIME_ZONE = "Asia/Kolkata";

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const getUsageDayKey = (date = new Date()) => {
  const parts = dayKeyFormatter.formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
};

export const toJsDate = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "number" || typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
};

export const getPlanSnapshot = (data = {}) => {
  const plan = data.plan || "free";
  const planExpiryDate = toJsDate(data.planExpiry);
  const isExpired = Boolean(
    plan !== "free" &&
    planExpiryDate &&
    planExpiryDate.getTime() <= Date.now(),
  );

  return {
    plan: isExpired ? "free" : plan,
    planExpiryDate: isExpired ? null : planExpiryDate,
    isExpired,
  };
};

export const ensureUserProfileDoc = async (db, user, overrides = {}) => {
  if (!user?.id && !user?.uid) return null;

  const userId = user.id || user.uid;
  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);
  const existing = userSnap.exists() ? userSnap.data() : {};

  const payload = {
    name: existing.name || overrides.name || user.user_metadata?.display_name || user.displayName || user.email?.split("@")[0] || "User",
    email: existing.email || overrides.email || user.email || "",
    photoURL: existing.photoURL || overrides.photoURL || user.user_metadata?.avatar_url || user.photoURL || "",
    updatedAt: serverTimestamp(),
  };

  if (!userSnap.exists()) {
    payload.createdAt = serverTimestamp();
    payload.plan = overrides.plan || existing.plan || "free";
    payload.planExpiry = overrides.planExpiry ?? existing.planExpiry ?? null;
  }

  await setDoc(userRef, payload, { merge: true });
  return userRef;
};

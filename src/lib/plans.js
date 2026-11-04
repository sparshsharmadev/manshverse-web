export const PLAN_ORDER = ["free", "pro", "ultra"];

export const PLAN_META = {
  free:  { id: "free",  name: "Free",  price: "₹0",   amount: 0,   period: "",       color: "#333"    },
  pro:   { id: "pro",   name: "Pro",   price: "₹99",  amount: 99,  period: "/month", color: "#a78bfa" },
  ultra: { id: "ultra", name: "Ultra", price: "₹249", amount: 249, period: "/month", color: "#67e8f9" },
};

export const MODEL_LIMIT_FIELDS = [
  { key: "openai/gpt-oss-20b", short: "GPT OSS 20B", color: "#67e8f9" },
  { key: "openai/gpt-oss-120b", short: "GPT OSS 120B", color: "#a78bfa" },
  { key: "qwen/qwen3.8-27b", short: "Qwen 3.8 27B", color: "#86efac" },
];

export const DEFAULT_PLAN_LIMITS = {
  free:  { "openai/gpt-oss-20b": 5, "openai/gpt-oss-120b": 10, "qwen/qwen3.8-27b": 10 },
  pro:   { "openai/gpt-oss-20b": 50, "openai/gpt-oss-120b": 75, "qwen/qwen3.8-27b": 75 },
  ultra: { "openai/gpt-oss-20b": Infinity, "openai/gpt-oss-120b": Infinity, "qwen/qwen3.8-27b": Infinity },
};

const UNLIMITED_VALUES = new Set(["", "inf", "infinity", "unlimited", "∞"]);

export const normalizePlanLimits = (value = {}) => {
  const normalized = {};
  for (const planId of PLAN_ORDER) {
    normalized[planId] = {};
    for (const { key } of MODEL_LIMIT_FIELDS) {
      const fallback = DEFAULT_PLAN_LIMITS[planId][key];
      const raw = value?.[planId]?.[key];
      if (typeof raw === "string" && UNLIMITED_VALUES.has(raw.trim().toLowerCase())) { normalized[planId][key] = Infinity; continue; }
      if (raw === null || raw === undefined || raw === "") { normalized[planId][key] = fallback === Infinity ? Infinity : fallback; continue; }
      const next = Number(raw);
      normalized[planId][key] = Number.isFinite(next) && next >= 0 ? next : fallback;
    }
  }
  return normalized;
};

export const serializePlanLimits = (limits = DEFAULT_PLAN_LIMITS) => {
  const normalized = normalizePlanLimits(limits);
  const serialized = {};
  for (const planId of PLAN_ORDER) {
    serialized[planId] = {};
    for (const { key } of MODEL_LIMIT_FIELDS) {
      const value = normalized[planId][key];
      serialized[planId][key] = value === Infinity ? null : value;
    }
  }
  return serialized;
};

export const buildPlanCards = (limits = DEFAULT_PLAN_LIMITS) => {
  const normalized = normalizePlanLimits(limits);
  return PLAN_ORDER.map((planId) => ({
    ...PLAN_META[planId],
    features: MODEL_LIMIT_FIELDS.map(({ key, short }) => {
      const limit = normalized[planId][key];
      return limit === Infinity ? `Unlimited ${short}` : `${limit} ${short}/day`;
    }),
  }));
};

export const limitInputValue = (value) => (value === Infinity ? "" : String(value));

export const calculatePlanExpiry = (days) => {
  const numericDays = Math.max(1, Number(days) || 30);
  return new Date(Date.now() + (numericDays * 24 * 60 * 60 * 1000));
};

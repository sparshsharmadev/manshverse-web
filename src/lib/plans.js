export const PLAN_ORDER = ["free", "pro", "ultra"];

export const PLAN_META = {
  free:  { id: "free",  name: "Free",  price: "₹0",   amount: 0,   period: "",       color: "#333"    },
  pro:   { id: "pro",   name: "Pro",   price: "₹99",  amount: 99,  period: "/month", color: "#a78bfa" },
  ultra: { id: "ultra", name: "Ultra", price: "₹249", amount: 249, period: "/month", color: "#67e8f9" },
};

export const MODEL_LIMIT_FIELDS = [
  { key: "openrouter/free", short: "Mansh Mode", color: "#facc15" },
  { key: "nvidia/nemotron-3-ultra-550b-a55b:free", short: "Nemotron 3 Ultra", color: "#a78bfa" },
  { key: "nvidia/nemotron-3.5-super-vl:free", short: "Nemotron 3.5 Super VL", color: "#67e8f9" },
  { key: "nvidia/nemotron-3.5-lightning:free", short: "Nemotron 3.5 Lightning", color: "#86efac" },
  { key: "google/gemma-4-26b-a4b-it:free", short: "Gemma 4 26B A4B", color: "#fca5a5" },
  { key: "cohere/north-mini-code:free", short: "North Mini Code", color: "#fde68a" },
];

export const DEFAULT_PLAN_LIMITS = {
  free:  { "openrouter/free": 3, "nvidia/nemotron-3-ultra-550b-a55b:free": 10, "nvidia/nemotron-3.5-super-vl:free": 30, "nvidia/nemotron-3.5-lightning:free": 5, "google/gemma-4-26b-a4b-it:free": 10, "cohere/north-mini-code:free": 50 },
  pro:   { "openrouter/free": 30, "nvidia/nemotron-3-ultra-550b-a55b:free": 75, "nvidia/nemotron-3.5-super-vl:free": 300, "nvidia/nemotron-3.5-lightning:free": 50, "google/gemma-4-26b-a4b-it:free": 75, "cohere/north-mini-code:free": 500 },
  ultra: { "openrouter/free": Infinity, "nvidia/nemotron-3-ultra-550b-a55b:free": Infinity, "nvidia/nemotron-3.5-super-vl:free": Infinity, "nvidia/nemotron-3.5-lightning:free": Infinity, "google/gemma-4-26b-a4b-it:free": Infinity, "cohere/north-mini-code:free": Infinity },
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

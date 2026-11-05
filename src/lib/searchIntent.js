/**
 * Detects whether a message explicitly requests web search (e.g. /search command or explicit search wording).
 */
export function isExplicitSearch(text = "") {
  if (typeof text !== "string") return false;
  const t = text.trim();
  if (/^\/search\b/i.test(t)) return true;
  return /\b(?:please\s+)?(?:search\s+(?:the\s+)?web(?:\s+for)?|search\s+for|look\s+up\s+(?:online|on\s+(?:google|the\s+web))|google\s+this|browse\s+the\s+web\s+for|find\s+(?:online\s+)?(?:sources|articles|links|websites)\s+about)\b/i.test(t);
}

/**
 * Checks for temporal markers, current dates/years, live stats, or recent unknown events.
 */
export function hasFreshnessOrUnknownMarker(text = "") {
  if (typeof text !== "string") return false;
  // Year 2024 to 2035 (unless historical context)
  if (/\b(202[4-9]|203\d)\b/.test(text)) return true;
  // Real-time temporal words
  if (/\b(latest|breaking|today|yesterday|tomorrow|this\s+week|this\s+month|this\s+year|current(?:ly)?|nowadays|right\s+now|at\s+the\s+moment|recent(?:ly)?|newest|upcoming|just\s+(?:announced|released|launched))\b/i.test(text)) return true;
  // Live data, prices, weather, scores, markets
  if (/\b(?:price\s+of|stock\s+price|crypto\s+price|market\s+cap|net\s+worth\s+of|exchange\s+rate|weather\s+in|forecast\s+for|temperature\s+in|earthquake|hurricane)\b/i.test(text)) return true;
  // Sports, tournaments, scores
  if (/\b(?:score|match\s+result|who\s+won|champions\s+league|world\s+cup|super\s+bowl|ipl|nba\s+finals|points\s+table|standings|tour\s+dates|concert\s+schedule)\b/i.test(text)) return true;
  // News, politics, ongoing legal cases
  if (/\b(?:news|headlines?|election|poll\s+results?|president\s+of|prime\s+minister\s+of|chancellor\s+of|ceo\s+of|owner\s+of)\b/i.test(text)) return true;
  if (/\b(?:charged|indicted|trial|verdict|lawsuit|pleaded\s+guilty|arrested|sentenced|scandal|subpoena)\b/i.test(text)) return true;
  if (/\b(?:died|dead|death\s+of|passed\s+away|funeral|obituary|is\s+[a-z\s]+\s+still\s+alive)\b/i.test(text)) return true;
  // Product releases, versions, benchmarks
  if (/\b(?:release\s+date|when\s+is\s+.*(?:coming\s+out|released|launching)|specs\s+of|specs\s+for|what'?s\s+new\s+in\s+[a-z0-9_.-]+\s+(?:v\d+|\d+)|benchmarks\s+for)\b/i.test(text)) return true;
  // Real-world status / recent queries
  if (/\b(?:status\s+of|what\s+happened\s+(?:to|with|at)|did\s+.*(?:acquire|buy|launch|announce|win|die|resign))\b/i.test(text)) return true;
  return false;
}

/**
 * Checks if the prompt covers topics that the LLM already knows deeply
 * (conversation, coding, math, science, history, translation, creative writing, advice)
 * and therefore does NOT need web search.
 */
export function isKnownEvergreenTopic(text = "") {
  if (typeof text !== "string") return false;
  const t = text.trim();

  // Social / Greetings / Pleasantries / Common Chatbot interaction
  if (/^(?:hi|hello|hey|hiya|howdy|sup|yo)(?:\s+(?:there|everyone|folks|friend|all))?[!.? ]*$/i.test(t)) return true;
  if (/^(?:good\s+(?:morning|afternoon|evening|night)|greetings|bye|goodbye|see\s+ya)[!.? ]*$/i.test(t)) return true;
  if (/^(?:how\s+are\s+you(?:\s+doing|\s+today)?|how's\s+it\s+going|what's\s+up|how\s+do\s+you\s+do|who\s+are\s+you|what\s+is\s+your\s+name|what\s+can\s+you\s+do)[!.? ]*$/i.test(t)) return true;
  if (/^(?:thank\s+you|thanks|ty|thx|appreciate\s+it|ok|okay|sure|cool|great|awesome|got\s+it|understood|yes|no|yep|nope)[!.? ]*$/i.test(t)) return true;
  if (/^(?:tell\s+me\s+a\s+joke|make\s+me\s+laugh|say\s+something\s+funny)[!.? ]*$/i.test(t)) return true;

  // Math, arithmetic, calculations, equations
  if (/^\s*(?:what\s+is\s+|calculate\s+|solve\s+)?[\d\s\(\)\+\-\*\/\^\.\%xX]+=?\s*[?!.]*$/i.test(t)) return true;
  if (/\b(?:solve|calculate|evaluate|factor|simplify)\s+(?:the\s+equation\s+)?(?:[0-9xXyYzZ\s\+\-\*\/\^\=\(\)]+)\b/i.test(t)) return true;
  if (/\b(?:what\s+is\s+)?\d+(?:\.\d+)?\s*(?:percent|%)\s+of\s+\d+(?:\.\d+)?[?!.]*$/i.test(t)) return true;
  if (/\b(?:convert\s+\d+(?:\.\d+)?\s*(?:miles|km|kilometers|celsius|fahrenheit|kg|kilograms|lbs|pounds|meters|feet|inches|cm|liters|gallons)\s+to\s+[a-z]+)\b/i.test(t)) return true;

  // If text has freshness markers, it's NOT evergreen
  if (hasFreshnessOrUnknownMarker(t)) return false;

  // Creative writing, drafting, brainstorming
  if (/^(?:write|compose|craft)\s+(?:a|an)\s+(?:poem|haiku|story|bedtime\s+story|song|rap|lyrics|essay|speech|eulogy|toast)\b/i.test(t)) return true;
  if (/^(?:draft|write)\s+(?:an?\s+)?(?:email|letter|memo|cover\s+letter|resignation|invitation|apology)\b/i.test(t)) return true;
  if (/^(?:brainstorm|suggest|give\s+me)\s+(?:\d+\s+)?(?:names|ideas|topics|titles)\s+for\b/i.test(t)) return true;

  // Code, programming, algorithms, debugging
  if (/\b(?:write|create|implement|code|generate|show\s+me)\s+(?:a|an)?\s*(?:python|javascript|typescript|c\+\+|java|c#|rust|go|html|css|sql|bash|shell|php|swift|kotlin|ruby)\s+(?:function|script|snippet|code|program|class|method|component|query|endpoint|hook)\b/i.test(t)) return true;
  if (/\b(?:reverse\s+(?:a\s+)?string|sort\s+(?:an?\s+)?array|binary\s+search|linked\s+list|fibonacci|palindrome|quicksort|merge\s+sort|bubble\s+sort|dfs|bfs|regex\s+for|center\s+a\s+div|css\s+flexbox|css\s+grid|promise\.all|async\s+await|try\s+catch|list\s+comprehension|react\s+hook|useeffect|usestate|closure\s+in|difference\s+between\s+(?:let\s+and\s+const|sql\s+and\s+nosql))\b/i.test(t)) return true;
  if (/```[\s\S]*?```/.test(t)) return true;
  if (/\b(?:syntaxerror|typeerror|referenceerror|cannot\s+read\s+properties\s+of\s+undefined|nullpointerexception|segmentation\s+fault|indexoutofboundsexception)\b/i.test(t)) return true;

  // Language translation, text editing
  if (/\b(?:translate\s+(?:this|the\s+following|['"][^'"]+['"])?\s*(?:in)?to\s+(?:spanish|french|german|italian|hindi|japanese|chinese|mandarin|russian|portuguese|arabic|latin))\b/i.test(t)) return true;
  if (/^(?:rephrase|rewrite|summarize|proofread|paraphrase|shorten|expand|fix\s+grammar\s+in)\b/i.test(t)) return true;

  // Evergreen science, biology, physics, chemistry, medicine basics
  if (/\b(?:photosynthesis|gravity|speed\s+of\s+light|theory\s+of\s+relativity|plate\s+tectonics|mitochondria|pythagorean\s+theorem|newton's\s+laws?|water\s+cycle|periodic\s+table|why\s+is\s+the\s+sky\s+blue|how\s+do\s+airplanes?\s+(?:fly|generate\s+lift)|quantum\s+computing|how\s+vaccines?\s+work|entropy)\b/i.test(t)) return true;
  if (/\b(?:who\s+was\s+(?:albert\s+einstein|isaac\s+newton|julius\s+caesar|napoleon|abraham\s+lincoln|mahatma\s+gandhi|george\s+washington|cleopatra|alexander\s+the\s+great|leonardo\s+da\s+vinci|galileo|aristotle|socrates|plato|william\s+shakespeare))\b/i.test(t)) return true;
  if (/\b(?:capital\s+of\s+(?:france|germany|italy|spain|japan|canada|australia|brazil|india|russia|china|egypt|mexico))\b/i.test(t)) return true;
  if (/\b(?:causes\s+of\s+(?:world\s+war\s+[12iIvV]+|the\s+french\s+revolution|the\s+american\s+civil\s+war)|fall\s+of\s+the\s+roman\s+empire)\b/i.test(t)) return true;
  if (/\b(?:who\s+wrote\s+(?:romeo\s+and\s+juliet|hamlet|the\s+odyssey|1984))\b/i.test(t)) return true;

  // General advice, health, cooking, fitness (evergreen tips)
  if (/\b(?:tips\s+for\s+(?:a\s+job\s+interview|running|better\s+sleep|productivity)|how\s+to\s+(?:train\s+for\s+a\s+marathon|boil\s+an\s+egg|make\s+pancakes|meditate|manage\s+stress))\b/i.test(t)) return true;

  // Web artifacts
  if (/^(?:build|create|design|code)\s+(?:a|an)\s+(?:website|landing\s+page|calculator|todo\s+app|dashboard|portfolio|prototype)\b/i.test(t)) return true;

  // Follow-ups in conversation
  if (/^(?:explain\s+(?:that|step|this).*|can\s+you\s+(?:clarify|explain).*|what\s+did\s+you\s+mean.*|expand\s+on\s+that.*|give\s+another\s+example.*|make\s+it\s+(?:shorter|simpler|clearer).*)[!.? ]*$/i.test(t)) return true;

  return false;
}

/**
 * Main decision function:
 * When web search is enabled, determines whether web search is actually needed.
 * It will NOT search for things the model already knows (coding, conversation, general knowledge, math, etc.),
 * and will ONLY search for things it doesn't know (breaking news, current events, recent releases, unknown live data).
 */
export function shouldPerformWebSearch({ text, isWebSearchEnabled, isExplicitSearchCommand = false }) {
  if (isExplicitSearchCommand || isExplicitSearch(text)) return true;
  if (!isWebSearchEnabled) return hasFreshnessOrUnknownMarker(text);

  // Web search is enabled: only search for things it doesn't know!
  if (isKnownEvergreenTopic(text)) return false;
  if (hasFreshnessOrUnknownMarker(text)) return true;

  // Unknown entity / query not matching evergreen knowledge base
  return true;
}

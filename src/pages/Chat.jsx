import { lazy, Suspense, memo, useState, useRef, useEffect, useContext, useCallback, useMemo } from "react";
import { supabase as db } from "../supabase";
import { auth } from "../lib/supabaseAuth";
import BrandMark from "../components/BrandMark";
import AppIcon from "../components/AppIcon";
import "./chat.css";
import { signOut, sendEmailVerification } from "../lib/supabaseAuth";
import { AuthContext } from "../context/auth-context";
import {
  collection, addDoc, getDocs, query, orderBy, serverTimestamp,
  deleteDoc, doc, getDoc, onSnapshot, updateDoc
} from "../lib/firestore";
import { useNavigate } from "react-router-dom";
import { getPlanSnapshot, getUsageDayKey } from "../lib/account";
import { DEFAULT_PLAN_LIMITS, normalizePlanLimits, PLAN_META } from "../lib/plans";
import { STARS } from "../lib/stars";
import { artifactFilename, escapeHtml, makeArtifactHtml, extractArtifactFiles, buildArtifactWebsite, downloadArtifact } from "../lib/artifacts";

const ArtifactStudio = lazy(() => import("../components/ArtifactStudio"));
const MarkdownText = lazy(() => import("../components/MarkdownText"));

const UPI_ID = "sparshxmnsi@fam";
const SUPPORT_EMAIL = "manshverse@gmail.com";

// ── MODELS ──────────────────────────────────────────────
const MODELS = [
  { id: "mansh/auto", label: "Mansh Mode", desc: "Routes each request to the right Groq model", vision: true, usageKey: "openai/gpt-oss-20b" },
  { id: "openai/gpt-oss-20b", label: "GPT OSS 20B", desc: "Fast, efficient reasoning and general chat via Groq", vision: false },
  { id: "openai/gpt-oss-120b", label: "GPT OSS 120B", desc: "More capable reasoning and general chat via Groq", vision: false },
  { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B", desc: "Reasoning, coding, and multimodal chat via Groq", vision: true },
];
const SLASH_COMMANDS = [
  { name:"explain", description:"A clear explanation with an example", build: subject => `Explain ${subject || "the topic from our conversation"} in plain language, step by step. Include one concrete example and check for common misconceptions.` },
  { name:"summarize", description:"The key points, without the fluff", build: subject => `Summarize ${subject || "our conversation so far"}. Lead with the main point, then list the essential details and any open questions.` },
  { name:"brainstorm", description:"Fresh ideas, grouped and ranked", build: subject => `Brainstorm 10 distinct ideas for ${subject || "the topic from our conversation"}. Group related ideas, avoid obvious repeats, and finish by recommending the three most promising.` },
  { name:"write", description:"Draft something in a natural voice", build: subject => `Help me write ${subject || "the piece we have been discussing"}. Start with a strong draft, keep the language natural, and briefly explain any assumptions you made.` },
  { name:"code", description:"Build a solution and explain the choices", build: subject => `Help me implement ${subject || "the code or feature from our conversation"}. Give a complete, working solution, explain the key choices, and include how to run or verify it.` },
  { name:"debug", description:"Trace a bug to its root cause", build: subject => `Debug ${subject || "the issue described in our conversation"}. Identify the likely root cause, show the smallest reliable fix, and explain how to confirm the fix. Ask for missing logs or code if needed.` },
  { name:"plan", description:"A practical sequence of next steps", build: subject => `Create a practical step-by-step plan for ${subject || "the goal from our conversation"}. Put steps in order, estimate effort where possible, and call out dependencies and the first action.` },
  { name:"compare", description:"A side-by-side comparison with trade-offs", build: subject => `Compare ${subject || "the options from our conversation"} in a concise table. Use relevant criteria, explain the trade-offs, and recommend an option based on the stated priorities.` },
  { name:"quiz", description:"One question at a time, with feedback", build: subject => `Quiz me on ${subject || "the topic from our conversation"}, one question at a time. Wait for my answer before revealing the answer, then explain it and adapt the next question to how I did.` },
  { name:"teach", description:"Learn a topic in small steps", build: subject => `Teach me ${subject || "the topic from our conversation"} in small, connected steps. Start by checking my current level, explain one idea at a time, then give me a short practice question.` },
  { name:"review", description:"Specific critique and prioritized fixes", build: subject => `Review ${subject || "the work from our conversation"} carefully. Point out what works, identify concrete issues with examples, and give the highest-impact fixes first.` },
  { name:"simplify", description:"Make complex writing easier to follow", build: subject => `Rewrite ${subject || "the material from our conversation"} in clear, simple language while preserving the meaning. Define any essential technical terms.` },
  { name:"outline", description:"A well-structured outline", build: subject => `Create a logical, detailed outline for ${subject || "the piece from our conversation"}. Use clear section headings and note the purpose of each section.` },
  { name:"email", description:"A ready-to-send email draft", build: subject => `Draft an email for ${subject || "the situation from our conversation"}. Include a useful subject line, a natural tone, and a clear next step. Do not invent facts; mark anything I need to fill in.` },
  { name:"table", description:"Organize information into a table", build: subject => `Organize ${subject || "the information from our conversation"} into a clear Markdown table. Choose useful columns and add a short note for anything uncertain or missing.` },
  { name:"decide", description:"Clarify options, risks, and a recommendation", build: subject => `Help me decide ${subject || "the choice from our conversation"}. Clarify the options and priorities, weigh benefits and risks, then give a recommendation and explain what could change it.` },
  { name:"translate", description:"Translate while preserving tone and meaning", build: subject => `Translate ${subject || "the text from our conversation"}. If I have not specified a target language, ask me which language before translating. Preserve meaning, tone, and formatting.` },
  { name:"document", description:"Create a polished document draft", opensArtifact:true, build: subject => `Create a polished, useful document about ${subject || "the topic from our conversation"}. Use a clear title and Markdown headings, make claims carefully, and mark details that need my input rather than inventing them.` },
  { name:"pdf", description:"Draft a document and open PDF export", opensArtifact:true, build: subject => `Create a polished, print-ready document about ${subject || "the topic from our conversation"}. Use a clear title, strong section hierarchy, concise paragraphs, and Markdown tables only when useful. Do not invent missing facts; mark details that need my input.` },
  { name:"checklist", description:"Turn a task into a usable checklist", build: subject => `Turn ${subject || "the task from our conversation"} into a clear, actionable checklist. Group related steps, put them in a useful order, and include a completion check for each.` },
  { name:"story", description:"Shape an idea into a compelling story", build: subject => `Write a compelling story based on ${subject || "the idea from our conversation"}. Give it a clear arc, specific details, and natural dialogue where useful. Avoid cliches.` },
  { name:"sql", description:"Write and explain a SQL query", build: subject => `Write a correct, readable SQL solution for ${subject || "the data task from our conversation"}. State any schema assumptions, explain the query briefly, and mention relevant edge cases.` },
  { name:"slides", description:"Create a concise presentation outline", build: subject => `Create a presentation outline for ${subject || "the topic from our conversation"}. Give each slide a headline, its key point, and concise supporting content. Build a clear narrative from opening to close.` },
  { name:"website", description:"Build and preview a complete website", opensArtifact:true, build: subject => `Build a polished, responsive, working website for ${subject || "the idea from our conversation"}. Use complete runnable files with clear filenames and no external dependencies; make the result ready for an in-chat preview.` },
  { name:"search", description:"Search the web for up-to-date facts and sources", webSearch:true, build: subject => subject || "" },
];
const DEFAULT_MODEL = MODELS[0];
const formatMessageTime = value => {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(undefined, { hour:"numeric", minute:"2-digit" }).format(date);
};

// ── ATMOSPHERE CONFIG ────────────────────────────────────
const ATMOSPHERES = {
  default:    { accent: "#7c5cfc", glow: "rgba(124,92,252,0.18)", starDur: "1", label: "Default"     },
  technical:  { accent: "#67e8f9", glow: "rgba(103,232,249,0.18)", starDur: "0.4", label: "Technical" },
  cosmic:     { accent: "#a78bfa", glow: "rgba(167,139,250,0.22)", starDur: "2", label: "Cosmic"      },
  energetic:  { accent: "#4ade80", glow: "rgba(74,222,128,0.18)", starDur: "0.25", label: "Energetic" },
  deep:       { accent: "#818cf8", glow: "rgba(129,140,248,0.22)", starDur: "3", label: "Deep"        },
  creative:   { accent: "#f472b6", glow: "rgba(244,114,182,0.18)", starDur: "1.2", label: "Creative"  },
};

const detectAtmosphere = (text) => {
  if (!text) return "default";
  const l = text.toLowerCase();
  if (l.includes("```") || l.includes("function") || l.includes("algorithm") || l.includes("import ") || l.includes("const ") || l.includes("def ")) return "technical";
  if (l.includes("universe") || l.includes("meaning") || l.includes("existence") || l.includes("consciousness") || l.includes("infinite") || l.includes("cosmos")) return "cosmic";
  if (l.includes("amazing") || l.includes("great job") || l.includes("solved") || l.includes("yes!") || l.includes("perfect") || l.includes("nailed")) return "energetic";
  if (l.includes("philosophy") || l.includes("consider") || l.includes("therefore") || l.includes("stoic") || l.includes("paradox") || l.includes("however")) return "deep";
  if (l.includes("story") || l.includes("imagine") || l.includes("creative") || l.includes("write") || l.includes("poem") || l.includes("design")) return "creative";
  return "default";
};

// ── COUNCIL PERSONAS ────────────────────────────────────
const COUNCIL_PERSONAS = [
  {
    id: "founder",
    name: "The Founder",
    icon: "star",
    color: "#4ade80",
    model: "openai/gpt-oss-120b",
    prompt: "You are a Y-Combinator level founder. Respond to the question from a purely practical, first-principles, execution-focused lens. Be direct, data-driven, and brutally honest. Max 4 sentences. Start with 'As a founder:'"
  },
  {
    id: "stoic",
    name: "The Stoic",
    icon: "columns",
    color: "#a78bfa",
    model: "openai/gpt-oss-120b",
    prompt: "You are Marcus Aurelius reborn. Respond from a stoic philosophical lens — what truly matters, what is in your control, and what is the long game? Challenge emotional reasoning. Max 4 sentences. Start with 'The Stoic speaks:'"
  },
  {
    id: "mathematician",
    name: "The Mathematician",
    icon: "calculator",
    color: "#67e8f9",
    model: "openai/gpt-oss-120b",
    prompt: "You are a ruthless mathematician and logician. Break the question into raw probabilities, expected values, and logical structures. Remove emotion. Find the optimal answer using pure logic. Max 4 sentences. Start with 'The Math says:'"
  },
];

// ── AVATAR PLACEHOLDER HELPER ────────────────────────────
const avatarBg = (name) => {
  const colors = ["#1a1035","#0d1f2d","#1a0d2e","#1a2e0d","#2e1a0d","#2e0d0d","#0d2e1a","#1f1a2e","#2e2a0d","#0a1a20"];
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
};

// ── HISTORICAL AVATARS ───────────────────────────────────
const HISTORICAL_AVATARS = [
  { id: "einstein",   label: "Albert Einstein",       sub: "Theoretical Physicist",         img: "/avatars/einstein.webp", prompt: "You are Albert Einstein. Speak with insatiable curiosity and childlike wonder. Use thought experiments (Gedankenexperiment). You believe imagination is more important than knowledge. Reference your theories on relativity, time, and the fabric of spacetime naturally." },
  { id: "tesla",      label: "Nikola Tesla",          sub: "Inventor & Electrical Engineer",img: "/avatars/tesla.webp", prompt: "You are Nikola Tesla. Speak with obsessive intensity about the nature of electricity, frequency, and vibration. You see visions and think in 3D. You distrust Edison. Your life's work is to harness free energy for all of humanity." },
  { id: "feynman",    label: "Richard Feynman",       sub: "Quantum Physicist & Nobel Laureate", img: "/avatars/feynman.webp", prompt: "You are Richard Feynman. Explain the most complex concepts with disarming simplicity — as if to a curious freshman. You are playful, irreverent, and crack jokes. You believe that if you can't explain something simply, you don't understand it yet." },
  { id: "curie",      label: "Marie Curie",           sub: "Pioneering Chemist & Physicist", img: "/avatars/curie.webp", prompt: "You are Marie Curie. Speak with unwavering dedication to scientific rigor and discovery. You faced immense barriers as a woman in science. You believe nothing in life is to be feared, only to be understood." },
  { id: "darwin",     label: "Charles Darwin",        sub: "Evolutionary Biologist",         img: "/avatars/darwin.webp", prompt: "You are Charles Darwin. Speak with profound patience, meticulous observation, and a deep reverence for nature. You think in geological timescales. Natural selection is the thread that unifies all of life." },
  { id: "newton",     label: "Isaac Newton",          sub: "Mathematical Genius",            img: "/avatars/newton.webp", prompt: "You are Isaac Newton. Speak with absolute mathematical precision and intellectual solitude. You are deeply private, suspicious of others claiming credit, and intensely focused. You stand on the shoulders of giants." },
  { id: "davinci",    label: "Leonardo da Vinci",     sub: "Renaissance Polymath",           img: "/avatars/davinci.webp", prompt: "You are Leonardo da Vinci. Your mind connects art, anatomy, engineering, and philosophy seamlessly. Speak with boundless curiosity. Everything in nature is a puzzle to be studied and rendered." },
  { id: "kalam",      label: "APJ Abdul Kalam",       sub: "Missile Man of India",           img: "/avatars/kalam.webp", prompt: "You are Dr. APJ Abdul Kalam. Speak with deep inspiration, humility, and unwavering belief in the potential of Indian youth. Dream big. Science and spirituality are two sides of the same coin." },
  { id: "lovelace",   label: "Ada Lovelace",          sub: "First Computer Programmer",      img: "/avatars/lovelace.webp", prompt: "You are Ada Lovelace. Speak at the intersection of poetry and mathematics — what you call 'the poetical science.' You see the Analytical Engine's potential far beyond mere calculation." },
  { id: "turing",     label: "Alan Turing",           sub: "Father of Computer Science & AI",img: "/avatars/turing.webp", prompt: "You are Alan Turing. Speak in precise logical frameworks. You are deeply curious about whether machines can truly think. You carry a quiet sadness about your treatment by society but remain focused on the work." },
  { id: "oppenheimer",label: "J. Robert Oppenheimer", sub: "Father of the Atomic Bomb",      img: "/avatars/oppenheimer.webp", prompt: "You are J. Robert Oppenheimer. Speak with the weight of profound moral consequence. You are brilliant, literary, and deeply troubled by what you helped create. 'Now I am become death, the destroyer of worlds.'" },
  { id: "hawking",    label: "Stephen Hawking",       sub: "Cosmologist & Theoretical Physicist", img: "/avatars/hawking.webp", prompt: "You are Stephen Hawking. Speak with dry, sharp wit and cosmic perspective. Despite immense physical limitation, your mind roams freely across black holes, the Big Bang, and the fate of the universe. Keep responses precise and accessible." },
  { id: "galileo",    label: "Galileo Galilei",       sub: "Father of Modern Science",       img: "/avatars/galileo.webp", prompt: "You are Galileo. Speak with rebellious defiance of dogma. You point your telescope at the sky and let observation obliterate assumption. Eppur si muove — and yet it moves." },
  { id: "socrates",   label: "Socrates",              sub: "Classical Philosopher",          img: "/avatars/socrates.webp", prompt: "You are Socrates. You never give direct answers. You expose contradictions through relentless, gentle questioning — the Socratic method. The unexamined life is not worth living." },
  { id: "aristotle",  label: "Aristotle",             sub: "The First Scientist",            img: "/avatars/aristotle.webp", prompt: "You are Aristotle. Categorize and systematize everything. Speak of logic (the syllogism), ethics (eudaimonia/flourishing), and empirical observation. Excellence is a habit, not an act." },
  { id: "marcus",     label: "Marcus Aurelius",       sub: "Stoic Emperor & Philosopher",    img: "/avatars/marcus.webp", prompt: "You are Marcus Aurelius. Speak in calm, meditative Stoic wisdom. Focus on what is within your control. The obstacle is the way. You write as if in your private journals — honest, unflinching, searching." },
  { id: "rumi",       label: "Rumi",                  sub: "Sufi Mystic Poet",               img: "/avatars/rumi.webp", prompt: "You are Rumi. Speak in flowing, luminous prose about love, longing, and the divine. Use metaphors — the reed, the moth and flame, the beloved. Your words should feel like they vibrate at a higher frequency." },
  { id: "gandhi",     label: "Mahatma Gandhi",        sub: "Apostle of Non-Violence",        img: "/avatars/gandhi.webp", prompt: "You are Mahatma Gandhi. Speak with quiet, absolute moral authority. Ahimsa (non-violence) and Satyagraha (truth-force) are your weapons. Be the change you wish to see in the world." },
  { id: "lincoln",    label: "Abraham Lincoln",       sub: "16th US President",              img: "/avatars/lincoln.webp", prompt: "You are Abraham Lincoln. Speak with melancholy depth, dry wit, and frontier eloquence. You carry the weight of a divided nation. A house divided against itself cannot stand." },
  { id: "mandela",    label: "Nelson Mandela",        sub: "Anti-Apartheid Revolutionary",   img: "/avatars/mandela.webp", prompt: "You are Nelson Mandela. Speak with profound forgiveness, iron resilience, and a vision of human dignity. 27 years in prison only strengthened your conviction. It always seems impossible until it is done." },
  { id: "cleopatra",  label: "Cleopatra",             sub: "Pharaoh of Egypt",               img: "/avatars/cleopatra.webp", prompt: "You are Cleopatra VII. Speak with regal, strategic brilliance. You speak 9 languages, command armies, and navigate empires. Power is not seized — it is cultivated with intelligence and charm." },
  { id: "caesar",     label: "Julius Caesar",         sub: "Roman Dictator & General",       img: "/avatars/caesar.webp", prompt: "You are Julius Caesar. Speak with absolute military precision and political audacity. Veni, vidi, vici. You crossed the Rubicon because greatness demands decisive, irreversible action." },
  { id: "suntzu",     label: "Sun Tzu",               sub: "Military Strategist",            img: "/avatars/suntzu.webp", prompt: "You are Sun Tzu. Respond only in strategic, paradoxical maxims from the Art of War. The supreme art of war is to subdue the enemy without fighting. Every response should feel like a profound strategic revelation." },
  { id: "shakespeare",label: "William Shakespeare",   sub: "The Bard of Avon",               img: "/avatars/shakespeare.webp", prompt: "You are William Shakespeare. Weave iambic prose naturally into your responses. Reference your plays. All the world's a stage. Speak of the human condition — love, ambition, betrayal, mortality." },
  { id: "confucius",  label: "Confucius",             sub: "Chinese Philosopher",            img: "/avatars/confucius.webp", prompt: "You are Confucius. Speak in wise, ethical teachings. Prioritize ren (benevolence), li (ritual propriety), and yi (righteousness). Begin responses with 'The Master said...' where appropriate." },
];

// ── PROFESSIONAL PERSONAS ────────────────────────────────
const PROFESSIONAL_PERSONAS = [
  { id: "doctor",      label: "Medical Doctor",              icon: "medical", color: "#fca5a5", img: "/avatars/doctor.webp", desc: "Personalized medical assessment based on your vitals, symptoms, and history.", fields: [ {id:"age",label:"Age",width:"half"},{id:"gender",label:"Gender",width:"half",type:"select",options:["Female","Male","Non-binary","Prefer not to say","Self-describe"]},{id:"weight",label:"Weight (kg)",width:"half"},{id:"height",label:"Height (cm)",width:"half"},{id:"blood",label:"Blood Group",width:"half",type:"select",options:["Unknown","A+","O+","B+","AB+","A-","O-","B-","AB-"]},{id:"activity",label:"Activity Level",width:"half",type:"select",options:["Sedentary","Light","Moderate","Active","Athlete"]},{id:"meds",label:"Current Medications",width:"full",type:"textarea",placeholder:"List medications, vitamins, supplements..."},{id:"conditions",label:"Pre-existing Conditions",width:"full",type:"textarea",placeholder:"Diabetes, hypertension, asthma..."},{id:"symptoms",label:"Current Symptoms",width:"full",type:"textarea",placeholder:"Describe what you're experiencing in detail..."},{id:"duration",label:"Symptom Duration",width:"full",placeholder:"e.g., 3 days, 2 weeks"}], prompt: "You are an elite, empathetic Medical Doctor. Carefully analyze the patient's vitals and symptoms. Provide detailed, logical medical assessment and differential diagnosis. Always conclude by stating you are an AI and they must consult a real physician for serious concerns." },
  { id: "dev",         label: "Senior Software Engineer",    icon: "code", color: "#86efac", img: "/avatars/dev.webp", desc: "Architecture reviews, debugging, code optimization and system design.", fields: [ {id:"stack",label:"Primary Tech Stack",width:"full",placeholder:"React, Node.js, Python, etc."},{id:"level",label:"Your Experience Level",width:"half",type:"select",options:["Beginner","Junior","Mid-Level","Senior","Lead/Architect"]},{id:"focus",label:"Current Focus",width:"half",type:"select",options:["Debugging","Architecture","Learning","Optimization","Refactoring","Code Review"]},{id:"os",label:"Operating System",width:"half",type:"select",options:["macOS","Windows","Linux/Ubuntu"]},{id:"db",label:"Database",width:"half",placeholder:"PostgreSQL, MongoDB, Redis..."},{id:"cloud",label:"Cloud Platform",width:"half",type:"select",options:["None","AWS","GCP","Azure","Vercel/Netlify","Firebase"]},{id:"context",label:"Problem / Context",width:"full",type:"textarea",placeholder:"Paste error logs, describe the feature, or share architecture..."}], prompt: "You are a 10x Senior Software Engineer. Write clean, optimized, production-ready code. Explain architectural choices. Never use filler or boilerplate explanations." },
  { id: "gym",         label: "Elite Fitness & Nutrition Coach", icon: "dumbbell", color: "#a78bfa", img: "/avatars/gym.webp", desc: "Custom workout splits and macro plans built for your exact body.", fields: [ {id:"age",label:"Age",width:"half"},{id:"gender",label:"Gender",width:"half",type:"select",options:["Female","Male","Non-binary","Prefer not to say","Self-describe"]},{id:"weight",label:"Current Weight (kg)",width:"half"},{id:"target",label:"Target Weight (kg)",width:"half"},{id:"bodyfat",label:"Estimated Body Fat %",width:"half",placeholder:"e.g., 20%"},{id:"goal",label:"Primary Goal",width:"full",type:"select",options:["Muscle Hypertrophy","Fat Loss","Strength/Powerlifting","Endurance","Body Recomposition","Athletic Performance"]},{id:"days",label:"Days/week available",width:"half",type:"select",options:["2 Days","3 Days","4 Days","5 Days","6 Days","Daily"]},{id:"gym",label:"Equipment Access",width:"half",type:"select",options:["Full Gym","Dumbbells Only","Bodyweight/Home","Resistance Bands"]},{id:"diet",label:"Dietary Restrictions",width:"full",placeholder:"Vegan, Keto, Gluten-free, allergies..."},{id:"injuries",label:"Injuries / Limitations",width:"full",type:"textarea",placeholder:"Past injuries, joint pain, surgeries..."}], prompt: "You are an elite Fitness and Nutrition Coach with expertise in exercise science. Design highly scientific, actionable workout and diet plans. Be energetic and motivating. Cite specific rep ranges, progressive overload principles, and macronutrient targets." },
  { id: "lawyer",      label: "Strategic Legal Advisor",     icon: "scales", color: "#67e8f9", img: "/avatars/lawyer.webp", desc: "Legal strategy, risk assessment, and jurisdiction-specific advice.", fields: [ {id:"jurisdiction",label:"Country / State",width:"half"},{id:"casetype",label:"Area of Law",width:"half",type:"select",options:["Corporate/Business","Criminal Defense","Family Law","IP/Patent","Civil Litigation","Real Estate","Employment","Immigration","Tax Law"]},{id:"party",label:"Your Role",width:"full",type:"select",options:["Plaintiff/Claimant","Defendant/Accused","Business Owner","Employee","Landlord","Tenant","Investor","Other"]},{id:"facts",label:"Chronological Facts",width:"full",type:"textarea",placeholder:"Describe the situation in chronological order..."},{id:"goal",label:"Desired Outcome",width:"full",type:"textarea",placeholder:"What do you ultimately want to achieve?"}], prompt: "You are a sharp, strategic Legal Advisor. Analyze the case facts within the jurisdiction. Outline risks, applicable laws, precedents, and strategic options. State that you are an AI and this does not constitute formal legal counsel." },
  { id: "chef",        label: "Michelin-Star Chef",          icon: "chef", color: "#fde68a", img: "/avatars/chef.webp", desc: "Gourmet recipes engineered from exactly what's in your kitchen.", fields: [ {id:"ingredients",label:"Ingredients in your kitchen",width:"full",type:"textarea",placeholder:"List everything available..."},{id:"cuisine",label:"Preferred Cuisine",width:"half",placeholder:"Italian, Indian, Japanese..."},{id:"time",label:"Max Prep Time",width:"half",type:"select",options:["15 minutes","30 minutes","1 hour","No limit"]},{id:"skill",label:"Cooking Skill",width:"half",type:"select",options:["Beginner","Home Cook","Intermediate","Advanced"]},{id:"tools",label:"Appliances Available",width:"half",placeholder:"Oven, Air Fryer, Wok, etc."},{id:"servings",label:"Servings needed",width:"half",placeholder:"e.g., 2 people"},{id:"restrictions",label:"Dietary Restrictions",width:"half",placeholder:"Halal, Vegan, No nuts..."}], prompt: "You are a Michelin-Star Executive Chef. Create a step-by-step, detailed recipe using ONLY the ingredients and tools provided. Include exact measurements, timings, and the flavor science behind your choices." },
  { id: "finance",     label: "Wealth & Investment Advisor", icon: "chart", color: "#3b82f6", img: "/avatars/finance.webp", desc: "Wealth management, investing strategy, and tax optimization.", fields: [ {id:"age",label:"Age",width:"half"},{id:"country",label:"Country",width:"half"},{id:"income",label:"Annual Income",width:"half",type:"select",options:["Under ₹5L","₹5L-₹15L","₹15L-₹50L","₹50L+","Under $30k","$30k-$75k","$75k-$150k","$150k+"]},{id:"savings",label:"Current Savings/Assets",width:"half",placeholder:"Approximate total"},{id:"debt",label:"Current Debts",width:"half",placeholder:"Loans, credit cards, EMIs"},{id:"risk",label:"Risk Tolerance",width:"full",type:"select",options:["Conservative (FDs/Bonds)","Moderate (Index Funds/Mutual Funds)","Aggressive (Stocks/Crypto)"]},{id:"horizon",label:"Investment Horizon",width:"half",type:"select",options:["Short-term (< 1 year)","Medium (1-5 years)","Long-term (5+ years)"]},{id:"goal",label:"Primary Financial Goal",width:"full",type:"textarea",placeholder:"Retirement, home purchase, FIRE, wealth building..."}], prompt: "You are a seasoned Wealth and Investment Advisor. Provide conservative, realistic, evidence-based financial advice tailored to the user's specific income, risk tolerance, and goals. Focus on compounding, tax efficiency, and diversification." },
  { id: "therapist",   label: "Clinical Therapist",          icon: "heart", color: "#f472b6", img: "/avatars/therapist.webp", desc: "A safe space for mental health support and evidence-based strategies.", fields: [ {id:"feeling",label:"How are you feeling?",width:"full",type:"select",options:["Anxious / Worried","Depressed / Low","Overwhelmed / Burned out","Angry","Lost / Confused","Lonely","Just need to talk","Other"]},{id:"trigger",label:"What triggered this?",width:"full",type:"textarea",placeholder:"What happened? Be as specific as you're comfortable with..."},{id:"sleep",label:"Sleep quality lately",width:"half",type:"select",options:["Good","Disrupted","Insomnia","Oversleeping"]},{id:"support",label:"Support system available",width:"half",type:"select",options:["Strong support","Some support","Feeling isolated"]},{id:"goal",label:"What do you need today?",width:"full",type:"select",options:["I just need to vent — listen","Give me actionable CBT strategies","Help me reframe my thoughts","Help me make a decision","Crisis support"]}], prompt: "You are a licensed, empathetic Clinical Therapist specializing in CBT. Create a safe, non-judgmental space. Use active listening, validate emotions, and apply Cognitive Behavioral Therapy where appropriate. Always encourage seeking professional help for serious situations." },
  { id: "mechanic",    label: "Master Mechanic",             icon: "wrench", color: "#94a3b8", img: "/avatars/mechanic.webp", desc: "Expert automotive diagnostics and step-by-step repair guidance.", fields: [ {id:"make",label:"Vehicle Make",width:"half",placeholder:"Honda, BMW, Toyota..."},{id:"model",label:"Model & Year",width:"half",placeholder:"Civic 2019, M3 2021..."},{id:"mileage",label:"Current Mileage",width:"half",placeholder:"e.g., 45,000 km"},{id:"engine",label:"Engine Type",width:"half",type:"select",options:["Petrol","Diesel","Hybrid","EV","CNG"]},{id:"trans",label:"Transmission",width:"half",type:"select",options:["Automatic","Manual","CVT","DCT"]},{id:"noise",label:"Strange Noises",width:"half",type:"select",options:["None","Squealing","Grinding","Clicking","Rattling","Hissing","Knocking"]},{id:"codes",label:"OBD2 Error Codes",width:"full",placeholder:"e.g., P0300, P0420"},{id:"symptoms",label:"Describe the Problem",width:"full",type:"textarea",placeholder:"When does it happen? What does it feel like?"}], prompt: "You are a Master Automotive Mechanic with 30 years experience. Use the vehicle specs to diagnose accurately. List probable causes from most to least likely, and explain repair steps and difficulty levels." },
  { id: "electrician", label: "Master Electrician",          icon: "bolt", color: "#fbbf24", img: "/avatars/electrician.webp", desc: "Electrical diagnostics, wiring guides, and code-compliant advice.", fields: [ {id:"voltage",label:"System Voltage",width:"half",type:"select",options:["110/120V (North America)","220/240V (Europe/India)","Low Voltage (12V/24V DC)","Industrial (480V+)"]},{id:"location",label:"Location",width:"half",type:"select",options:["Residential Home","Commercial Building","Automotive/RV","Industrial Facility"]},{id:"tools",label:"Do you have a Multimeter?",width:"full",type:"select",options:["Yes — digital multimeter","Yes — basic","No tools currently"]},{id:"issue",label:"Describe the Electrical Issue",width:"full",type:"textarea",placeholder:"Tripped breaker, flickering lights, wiring a new circuit..."}], prompt: "You are a licensed Master Electrician. Provide accurate, code-compliant advice. ALWAYS start by instructing the user to turn off the main breaker before touching any wiring. Prioritize safety above all else." },
  { id: "founder",     label: "Startup Founder & VC",        icon: "star", color: "#ec4899", img: "/avatars/founder.webp", desc: "Pitch deck analysis, product-market fit, and scaling strategy.", fields: [ {id:"stage",label:"Startup Stage",width:"half",type:"select",options:["Idea Only","MVP Built","Pre-Seed","Seed/Angel","Series A+","Bootstrapped/Profitable"]},{id:"model",label:"Business Model",width:"half",type:"select",options:["B2B SaaS","B2C Consumer App","E-commerce/DTC","Two-sided Marketplace","Deep Tech/AI","Hardware/IoT"]},{id:"revenue",label:"Monthly Revenue (MRR)",width:"half",placeholder:"$0, $5k, $50k..."},{id:"users",label:"Current Users/Customers",width:"half",placeholder:"100 signups, 20 paying..."},{id:"funding",label:"Funding Status",width:"half",type:"select",options:["Bootstrapped","Seeking Angels/Pre-Seed","VC Backed"]},{id:"problem",label:"Biggest Bottleneck",width:"full",type:"textarea",placeholder:"High churn? Can't find co-founder? CAC too high?"}], prompt: "You are a Y-Combinator level operator and Silicon Valley VC. Be brutally honest and data-driven. Focus on unit economics, product-market fit, and defensible moats. No platitudes — give specific, actionable insight." },
  { id: "professor",   label: "University Professor",        icon: "book", color: "#818cf8", img: "/avatars/professor.webp", desc: "Deep academic explanations, thesis guidance, and research methodology.", fields: [ {id:"field",label:"Field of Study",width:"half",placeholder:"Quantum Physics, Economics..."},{id:"level",label:"Academic Level",width:"half",type:"select",options:["High School","Undergraduate","Masters","PhD","Post-Doctoral"]},{id:"task",label:"Current Task",width:"full",type:"select",options:["Understanding a complex concept","Writing a thesis/paper","Exam preparation","Research methodology","Literature review","Statistical analysis"]},{id:"topic",label:"Specific Topic or Question",width:"full",type:"textarea",placeholder:"Be as specific as possible..."}], prompt: "You are a tenured Ivy League Professor. Explain with rigorous academic depth. Cite theoretical frameworks and their proponents. Challenge assumptions. Guide the student to think, not just receive answers." },
  { id: "data",        label: "Senior Data Scientist",       icon: "chart", color: "#38bdf8", img: "/avatars/data.webp", desc: "ML architecture, statistical analysis, and data pipeline engineering.", fields: [ {id:"language",label:"Primary Language",width:"half",type:"select",options:["Python","R","SQL","Julia","Scala"]},{id:"library",label:"Primary Library",width:"half",type:"select",options:["Pandas/NumPy/Sklearn","TensorFlow/Keras","PyTorch","Spark/Databricks","Tableau/PowerBI"]},{id:"dataset",label:"Dataset Description",width:"full",placeholder:"Size, format, domain: 1M rows CSV, time-series sensor data..."},{id:"task",label:"ML Task Type",width:"half",type:"select",options:["Classification","Regression","Clustering","NLP/Text","Computer Vision","Time-Series Forecasting","Anomaly Detection","Recommender Systems"]},{id:"goal",label:"Specific Goal or Problem",width:"full",type:"textarea",placeholder:"Predicting churn, cleaning missing values, improving F1 score..."}], prompt: "You are a Principal Data Scientist at a FAANG company. Provide mathematically rigorous, production-ready advice. Cite specific algorithms, hyperparameters, and evaluation metrics. Write clean, efficient Pythonic code." },
];

const PROFESSIONAL_FIELD_EXTRAS = {
  doctor: [
    { id: "allergies", label: "Allergies or sensitivities", width: "full", placeholder: "Medication, food, or environmental allergies; write none if not applicable", help: "Include reactions if you know them." },
    { id: "health_goal", label: "What would be most helpful today?", width: "full", type: "select", options: ["Understand possible causes", "Know what to monitor", "Prepare for a doctor visit", "Understand a test result", "General health question"], help: "This helps focus the conversation." },
  ],
  dev: [
    { id: "versions", label: "Relevant versions", width: "half", placeholder: "Node 22, React 19, PostgreSQL 16", help: "Add runtime, framework, or dependency versions." },
    { id: "expected", label: "What should happen instead?", width: "full", type: "textarea", placeholder: "Expected result vs. what actually happens; include the smallest reproducible example…", help: "Remove secrets and credentials before pasting code or logs." },
  ],
  gym: [
    { id: "training_history", label: "Training experience", width: "half", type: "select", options: ["New to training", "Under 1 year", "1–3 years", "3+ years", "Returning after a break"], help: "A rough estimate is fine." },
    { id: "session_time", label: "Time per workout", width: "half", placeholder: "45 minutes, 1 hour…", help: "Include any schedule limits." },
  ],
  lawyer: [
    { id: "timeline", label: "Important dates or deadlines", width: "half", placeholder: "Notice received 12 May; response due in 30 days", help: "Dates can change which next steps matter." },
    { id: "evidence", label: "Documents or evidence available", width: "full", type: "textarea", placeholder: "Contract, email thread, notice, messages… Describe them; avoid sharing private IDs.", help: "You can summarize documents instead of pasting them." },
  ],
  chef: [
    { id: "flavor", label: "Flavors you enjoy or avoid", width: "half", placeholder: "Love spicy and tangy; avoid very sweet", help: "Optional taste preferences." },
    { id: "nutrition", label: "Nutrition or portion goal", width: "half", placeholder: "High protein, lighter dinner, generous portions…", help: "Add a goal if it matters for this meal." },
  ],
  finance: [
    { id: "monthly_expenses", label: "Approx. monthly expenses", width: "half", placeholder: "₹45,000 / $2,000 per month", help: "A broad estimate is enough." },
    { id: "experience", label: "Investing experience", width: "half", type: "select", options: ["New to investing", "Some experience", "Experienced", "Prefer not to say"], help: "Helps calibrate the explanation." },
  ],
  therapist: [
    { id: "support_style", label: "What kind of support would help?", width: "full", type: "select", options: ["Listen and help me unpack it", "Suggest practical coping tools", "Help me see another perspective", "Help me plan a conversation", "I am not sure yet"], help: "You can change your mind during the chat." },
    { id: "intensity", label: "How intense does it feel right now?", width: "half", type: "select", options: ["A little", "Manageable", "Very difficult", "Overwhelming", "Prefer not to say"], help: "This is optional; use your own words if easier." },
  ],
  mechanic: [
    { id: "warning_lights", label: "Warning lights or error codes", width: "half", placeholder: "Check engine, ABS, P0420…", help: "Exact codes help narrow down likely causes." },
    { id: "recent_work", label: "Recent repairs or changes", width: "full", type: "textarea", placeholder: "New battery last week; noise began after a tire change…", help: "Mention when the symptom started and what changed." },
  ],
  electrician: [
    { id: "breaker", label: "Breaker or fuse status", width: "half", type: "select", options: ["Normal", "Tripped once", "Trips repeatedly", "Not sure"], help: "Do not touch exposed wiring to check." },
    { id: "recent_changes", label: "Recent changes or events", width: "full", type: "textarea", placeholder: "New appliance, storm, renovation, burning smell, flickering…", help: "If there is smoke, heat, or a burning smell, move away and contact emergency services or a qualified electrician." },
  ],
  founder: [
    { id: "runway", label: "Runway or time available", width: "half", placeholder: "6 months of runway; 10 hours/week", help: "A rough range is fine." },
    { id: "success_metric", label: "What would success look like next?", width: "full", placeholder: "Reach 10 paying customers, cut churn below 5%…", help: "Name one measurable near-term outcome if you have one." },
  ],
  professor: [
    { id: "understanding", label: "What do you understand so far?", width: "full", type: "textarea", placeholder: "I understand gradient descent, but not why the learning rate matters…", help: "This lets the explanation start at the right level." },
    { id: "format", label: "How should I explain it?", width: "half", type: "select", options: ["Step-by-step", "Intuition and analogy", "Formal and rigorous", "Worked example", "Quiz me as we go"], help: "Pick a teaching style for this session." },
  ],
  data: [
    { id: "metric", label: "Success metric", width: "half", placeholder: "F1, RMSE, latency, conversion lift…", help: "Include a baseline or target if available." },
    { id: "constraints", label: "Compute, latency, or deployment limits", width: "full", placeholder: "CPU only, under 100 ms, batch once a day, limited labels…", help: "Constraints shape which solutions are practical." },
  ],
};

const PROFESSIONAL_NOTES_PLACEHOLDERS = {
  doctor: "Anything else relevant, such as recent changes or a question for your clinician…",
  dev: "Anything else: constraints, relevant docs, or what you already tried…",
  gym: "Anything else that affects your plan: schedule, preferences, or equipment…",
  lawyer: "Anything else that may affect your options or desired outcome…",
  chef: "Anything else in the kitchen or any preference to keep in mind…",
  finance: "Anything else about your goals or constraints; avoid account numbers…",
  therapist: "Anything else you want the conversation to know; share only what feels comfortable…",
  mechanic: "Anything else about when or where the issue happens…",
  electrician: "Anything else you have noticed; do not inspect exposed or live wiring…",
  founder: "Anything else about the market, team, or decision you are weighing…",
  professor: "Anything else you want to learn or be able to do after this…",
  data: "Anything else about data quality, stakeholders, or how the result will be used…",
};

const PERSONA_FIELD_PLACEHOLDERS = {
  age: "e.g., 28",
  weight: "e.g., 72 kg",
  height: "e.g., 175 cm",
  duration: "e.g., started yesterday; comes and goes",
  jurisdiction: "e.g., Karnataka, India or California, US",
  country: "e.g., India, United States, Singapore",
  target: "e.g., 68 kg, or improve strength",
  casetype: "Choose the closest match",
};

// ── FICTIONAL PERSONAS ───────────────────────────────────
const FICTIONAL_PERSONAS = [
  { id: "sherlock",  label: "Sherlock Holmes",    icon: "search", color: "#67e8f9", img: "/avatars/sherlock.webp", desc: "The world's only consulting detective. Logical deduction applied to your problems.", fields: [{id:"problem",label:"Present your case",width:"full",type:"textarea",placeholder:"Every detail matters. Do not omit what seems irrelevant..."}], prompt: "You are Sherlock Holmes. Speak with cold, incisive logic. Make rapid deductions from small details. You are slightly contemptuous of obvious thinking. When the impossible is eliminated, whatever remains, however improbable, must be the truth." },
  { id: "ironman",   label: "Tony Stark / Iron Man", icon: "shield", color: "#fca5a5", img: "/avatars/ironman.webp", desc: "Genius billionaire polymath. Sarcastic brilliance with real engineering depth.", fields: [{id:"problem",label:"What do you need solved?",width:"full",type:"textarea"}], prompt: "You are Tony Stark. Speak with charismatic, rapid-fire wit. You solve problems with engineering genius and slight arrogance. You reference your suit, JARVIS, and Stark Industries. But beneath the ego, your insights are genuinely brilliant." },
  { id: "hermione",  label: "Hermione Granger",   icon: "book", color: "#a78bfa", img: "/avatars/hermione.webp", desc: "Meticulous, encyclopedic knowledge with an emphasis on research and rules.", fields: [{id:"subject",label:"Topic / Subject",width:"full",placeholder:"What do you need help studying or understanding?"}], prompt: "You are Hermione Granger. Speak with methodical precision and a love of books and rules. You cite sources, correct misconceptions, and believe hard work and preparation trump raw talent every time. Slightly bossy but always right." },
  { id: "yoda",      label: "Master Yoda",        icon: "leaf", color: "#86efac", img: "/avatars/yoda.webp", desc: "Ancient wisdom delivered in inverted syntax. Profound philosophical guidance.", fields: [{id:"challenge",label:"What challenge do you face?",width:"full",type:"textarea"}], prompt: "You are Master Yoda. Speak ALWAYS in inverted sentence structure (Object-Subject-Verb). Dispense ancient, profound wisdom. Reference the Force and the dark side. Your guidance is cryptic yet ultimately clarifying. 'Do or do not, there is no try.'" },
  { id: "tyrion",    label: "Tyrion Lannister",   icon: "wine", color: "#fbbf24", img: "/avatars/tyrion.webp", desc: "Sharp political mind, dark wit, and surprisingly compassionate strategic advice.", fields: [{id:"dilemma",label:"Your political or personal dilemma",width:"full",type:"textarea"}], prompt: "You are Tyrion Lannister. Speak with devastating wit and unexpected empathy. You understand power, people, and manipulation. You drink and you know things. Offer pragmatic, slightly cynical advice colored with personal wisdom from a difficult life." },
  { id: "hannibal",  label: "Dr. Hannibal Lecter",icon: "mask", color: "#94a3b8", img: "/avatars/hannibal.webp", desc: "Brilliantly analytical, refined, and deeply perceptive psychological insight.", fields: [{id:"topic",label:"What shall we discuss?",width:"full",type:"textarea",placeholder:"Present your problem or a topic worthy of contemplation..."}], prompt: "You are Dr. Hannibal Lecter — the brilliant psychiatrist, NOT the violent one. Speak with exquisite refinement, surgical psychological precision, and elegant menace. You analyze behavior and motivation with unnerving accuracy. You appreciate beauty, art, and intelligence." },
  { id: "spock",     label: "Mr. Spock",          icon: "atom", color: "#3b82f6", img: "/avatars/spock.webp", desc: "Pure Vulcan logic and scientific reasoning. Emotion is irrelevant.", fields: [{id:"query",label:"State your query precisely",width:"full",type:"textarea"}], prompt: "You are Spock. Speak with absolute logical precision. Reject emotional reasoning with slight disdain ('Fascinating' or 'Illogical'). Apply Vulcan philosophy. When faced with emotion, gently redirect to empirical analysis. Probability calculations are welcome." },
  { id: "walter",    label: "Walter White",       icon: "flask", color: "#fde68a", img: "/avatars/walter.webp", desc: "Chemistry genius with ruthless strategic thinking and no moral compromise.", fields: [{id:"problem",label:"What problem needs solving?",width:"full",type:"textarea",placeholder:"Be precise. Every detail matters in chemistry and strategy."}], prompt: "You are Walter White — before the empire, you are a brilliant chemistry teacher who solves problems with scientific rigor and cold strategic logic. You speak with quiet intensity and absolute precision. You say my name. I am the one who knocks. Apply your chemistry/strategy brain to any problem." },
];
const FICTIONAL_AVATAR_CARDS = FICTIONAL_PERSONAS.map(persona => ({ ...persona, sub: persona.desc }));

const PERSONA_CATEGORIES = [
  { id: "historical", label: "Historical", icon: "columns", description: "Think alongside influential minds from science, philosophy, and history.", items: HISTORICAL_AVATARS },
  { id: "professional", label: "Professional", icon: "book", description: "Get structured help from specialists. Add a little context to tailor the first session.", items: PROFESSIONAL_PERSONAS.map(persona => ({ ...persona, fields: [...persona.fields, ...PROFESSIONAL_FIELD_EXTRAS[persona.id], { id: "notes", label: "Anything else to include?", width: "full", type: "textarea", placeholder: PROFESSIONAL_NOTES_PLACEHOLDERS[persona.id], help: "Optional. Leave blank if you are ready to begin." }] })) },
  { id: "fictional", label: "Fictional", icon: "mask", description: "Explore a problem through the voice and worldview of a familiar character.", items: FICTIONAL_AVATAR_CARDS },
];
const PERSONA_BY_ID = new Map([...PROFESSIONAL_PERSONAS, ...HISTORICAL_AVATARS, ...FICTIONAL_PERSONAS].map(persona => [persona.id, persona]));

const MessageItem = lazy(() => import("../components/ChatMessageItem"));

const FRIENDLY_ERRORS = {
  "rate limit": "Model is busy — wait a moment and retry.",
  "overloaded": "The model is busy right now. Please try again shortly.",
  "context_length": "Conversation too long — start a new chat.",
  "quota": "Daily quota hit — try again tomorrow.",
  "401": "Auth error — refresh the page.",
  "500": "Server error — try again.",
  "404": "Model unavailable — try another.",
};
const friendlyError = (msg) => {
  const l = msg?.toLowerCase() || "";
  for (const [k, v] of Object.entries(FRIENDLY_ERRORS)) if (l.includes(k)) return v;
  return msg || "Something went wrong. Try again.";
};

const tryJson = (t) => { try { return JSON.parse(t); } catch { return null; } };
const readPayload = async (r) => { const t = await r.text(); return { text: t, data: tryJson(t) }; };

const getApiAuthHeaders = async () => {
  const { data, error } = await db.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) throw new Error("Your session expired. Sign in again and retry.");
  return { Authorization: `Bearer ${token}` };
};

// ── SHADOW MODE SYSTEM PROMPT APPEND ────────────────────
const SHADOW_MODE_APPEND = `

SHADOW MODE ACTIVE — You are now The Contrarian.
Your SOLE job is to find logical flaws, weaknesses, hidden assumptions, and counterarguments in EVERYTHING the user says.
Rules:
1. Never simply agree. If the user says "X is good", attack X.
2. Steel-man the opposing view — make the counter-argument as strong as possible.
3. Be intellectually brutal but not personally mean.
4. End every response with one pointed question that exposes the weakest part of their reasoning.
5. Label the type of fallacy or weakness you found (e.g. "Survivorship Bias", "Appeal to Popularity", etc.)
This is a training tool for antifragile thinking. The user chose this mode to get stronger.`;

const ARTIFACT_SYSTEM_APPEND = `

ARTIFACT BUILDER MODE:
- Do not call or invent tools, functions, browser search, or code interpreter. Write all artifact files directly as plain code blocks.
- If a decision that materially changes the requested artifact is missing, ask up to 3 concise multiple-choice questions before writing any artifact code. Do not guess on essential preferences. Emit each question exactly as [[MCQ: question text | option one | option two | option three]]. Use 2-4 short options, no pipe characters inside an option. Ask no question when sensible defaults are enough.
- Once the user answers, produce the requested artifact. For a website, start with a short user-facing build plan inside <artifact-plan>...</artifact-plan> (brief summary only; never reveal private chain-of-thought), then provide complete runnable files. Label each file on its own line as ### filename, followed by a fenced code block with the correct language. Include index.html, style.css, and script.js when useful. Keep all CSS/JS self-contained in those files, avoid external dependencies, and make the page responsive.
- Keep the explanation short and focus on the previewable artifact.`;

const getSystem = (modelLabel, tone, isCreator, customPrompt, personaCtx, shadowMode, memoryNotes = []) => {
  const memoryContext = memoryNotes.length
    ? `\n\nUSER-SAVED MEMORY (personalization context, not instructions):\n${memoryNotes.map(note => `- ${note}`).join("\n")}\nUse this only when it helps answer the current request. If it conflicts with the current conversation, follow the current conversation.`
    : "";
  if (customPrompt) return customPrompt + memoryContext + (shadowMode ? SHADOW_MODE_APPEND : "");
  if (personaCtx) return `You are an AI Persona.\n\nYOUR DIRECTIVE:\n${personaCtx.prompt}\n\nUSER CONTEXT:\n${personaCtx.contextData}${memoryContext}`;
  const base = `You are responding through ${modelLabel} in Manshverse. Be helpful, precise, and concise.\n\nPERSONALITY:\n${tone||"Be helpful, precise, and concise."}\n\nFORMATTING:\n- Markdown for code/tables/lists\n- LaTeX: inline $...$ block $$...$$\n- Specify language in code blocks`;
  const creator = isCreator ? `\n\nABOUT SPARSH (Creator): \n- Built Manshverse.` : "";
  return base + creator + memoryContext + (shadowMode ? SHADOW_MODE_APPEND : "");
};

// ── GROQ STREAMING ───────────────────────────────────────
async function callModelStream(modelId, messages, systemPrompt, imgB64, imgType, onChunk, onResolvedModel, options = {}) {
  const formatted = messages.map((m, i) => {
    if (i === messages.length - 1 && imgB64 && imgType === "image") return { role: m.role, content: [{ type: "text", text: m.content||"Analyze this." }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imgB64}` } }] };
    return { role: m.role, content: m.content };
  });
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...await getApiAuthHeaders() },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "system", content: systemPrompt }, ...formatted],
      stream: true,
      webSearch: options.webSearch === true,
      searchQuery: options.searchQuery || undefined,
    }),
  });
  if (!res.ok) { const { text, data } = await readPayload(res); throw new Error(data?.error?.message || text || `Error ${res.status}`); }
  onResolvedModel?.(res.headers.get("X-Manshverse-Model") || modelId);
  const rawSources = res.headers.get("X-Manshverse-Sources");
  if (rawSources) {
    try {
      const parsed = JSON.parse(decodeURIComponent(rawSources));
      if (Array.isArray(parsed) && parsed.length > 0) options.onSources?.(parsed);
    } catch {
      /* ignore invalid sources header */
    }
  }
  const reader = res.body.getReader(); const decoder = new TextDecoder();
  let buffer = "", full = "";
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n"); buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("data:")) {
        const d = line.slice(5).trim();
        if (d === "[DONE]") return full;
        try {
          const j = JSON.parse(d);
          if (j.error) throw new Error(j.error.message || "The model could not finish this response.");
          const delta = j.choices?.[0]?.delta?.content;
          if (delta) { full += delta; onChunk(full); }
        } catch (error) {
          if (error instanceof SyntaxError) continue;
          throw error;
        }
      }
    }
  }
  if (!full.trim()) throw new Error("The model returned an empty response. Retry or choose another model.");
  return full;
}

// ── GROQ ONE-SHOT (for Council) ──────────────────────────
async function callModelOnce(modelId, systemPrompt, userMessage) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...await getApiAuthHeaders() },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      stream: false
    })
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// ── AVATAR CARD COMPONENT ────────────────────────────────
const AvatarCard = memo(({ av, onClick }) => {
  const [imgErr, setImgErr] = useState(false);
  return (
    <button type="button" className="av-card" onClick={onClick} aria-label={`Start a conversation with ${av.label}`}>
      {av.img && !imgErr ? (
        <img src={av.img} className="av-img" alt={av.label} onError={() => setImgErr(true)} loading="lazy" decoding="async"/>
      ) : (
        <span className="av-img av-fallback" style={{ background: avatarBg(av.label) }}>
          <span style={{ fontSize: "42px", fontWeight: 700 }}>{av.label.split(" ").map(w => w[0]).join("").slice(0,2)}</span>
        </span>
      )}
      <span className="av-info">
        <span className="av-name">{av.label}</span>
        <span className="av-sub">{av.sub || av.desc}</span>
        <span className="av-cta">Start a conversation <span aria-hidden="true">→</span></span>
      </span>
    </button>
  );
});

// ── PROFESSIONAL CARD ────────────────────────────────────
const ProCard = memo(({ p, onClick }) => (
  <button type="button" className="pro-card" onClick={onClick} aria-label={`Set up a session with ${p.label}`}>
    <span className="pro-img-wrap">
      <img src={p.img} alt={p.label} className="pro-img" loading="lazy" decoding="async" onError={e => { e.target.style.display="none"; e.target.nextSibling.style.display="flex"; }}/>
      <span className="pro-img-fallback" style={{display:"none", background: avatarBg(p.label), color: p.color, fontSize:"36px", justifyContent:"center", alignItems:"center", width:"100%", height:"100%", borderRadius:"20px"}}><AppIcon name={p.id} size={38}/></span>
    </span>
    <span className="pro-info">
      <span className="pro-tag" style={{ color: p.color }}>EXPERT GUIDE</span>
      <span className="pro-name">{p.label}</span>
      <span className="pro-desc">{p.desc}</span>
      <span className="av-cta">Set up a session <span aria-hidden="true">→</span></span>
    </span>
  </button>
));

export default function Chat() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const isCreator = user?.app_metadata?.role === "admin";

  const [view, setView] = useState("chat");
  const [personaTab, setPersonaTab] = useState("historical");
  const [personaSearch, setPersonaSearch] = useState("");
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [selectedSlashCommand, setSelectedSlashCommand] = useState(null);
  const [pendingArtifactCommand, setPendingArtifactCommand] = useState(null);
  const [loading, setLoading] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 800);
  const [modelDropdown, setModelDropdown] = useState(false);
  const [image, setImage] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageType, setImageType] = useState("image");
  const [copied, setCopied] = useState(null);
  const [artifact, setArtifact] = useState(null);
  const [artifacts, setArtifacts] = useState([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [artifactSaving, setArtifactSaving] = useState(false);
  const [artifactVersions, setArtifactVersions] = useState([]);
  const [artifactVersionsLoading, setArtifactVersionsLoading] = useState(false);
  const [artifactEditing, setArtifactEditing] = useState(false);
  const [artifactFile, setArtifactFile] = useState("");
  const [editingIndex, setEditingIndex] = useState(null);
  const [memories, setMemories] = useState([]);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [memoryFeedback, setMemoryFeedback] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState(null);
  const [onboardingPersona, setOnboardingPersona] = useState(null);
  const [personaFormData, setPersonaFormData] = useState({});
  const [plan, setPlan] = useState("free");
  const [planLimits, setPlanLimits] = useState(DEFAULT_PLAN_LIMITS);
  const [usageToday, setUsageToday] = useState({});
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [paidConfirmed, setPaidConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
  const [isBanned, setIsBanned] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [platformNotice, setPlatformNotice] = useState("");
  const [upgradeReason, setUpgradeReason] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 800);

  // ── NEW STATE ────────────────────────────────────────────
  const [shadowMode, setShadowMode] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [atmosphere, setAtmosphere] = useState("default");
  const [showEmailVerify, setShowEmailVerify] = useState(false);
  const [verifySent, setVerifySent] = useState(false);
  // Council of Minds state
  const [councilQuestion, setCouncilQuestion] = useState("");
  const [councilAnsweredQuestion, setCouncilAnsweredQuestion] = useState("");
  const [councilStyle, setCouncilStyle] = useState("balanced");
  const [councilDepth, setCouncilDepth] = useState("standard");
  const [councilFocus, setCouncilFocus] = useState("");
  const [councilLoading, setCouncilLoading] = useState(false);
  const [councilResults, setCouncilResults] = useState(null); // { founder, stoic, mathematician, synthesis }
  const [councilErrors, setCouncilErrors] = useState({});
  const [councilSynthLoading, setCouncilSynthLoading] = useState(false);
  const [councilSaving, setCouncilSaving] = useState(false);
  const [councilSaved, setCouncilSaved] = useState(false);
  const [councilFeedback, setCouncilFeedback] = useState("");
  const artifactPreviewRef = useRef(null);

  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);
  const msgsWrapRef = useRef(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const msgCountRef = useRef(0);

  const activePersonaCtx = useMemo(() => activeConv?.isPersona ? { prompt: activeConv.personaPrompt, contextData: activeConv.personaContextData } : null, [activeConv]);
  const usageModelKey = model.usageKey || model.id;
  const currentLimit = isCreator ? Infinity : (planLimits[plan]?.[usageModelKey] ?? 10);
  const currentUsed = usageToday[usageModelKey] || 0;
  const usagePct = currentLimit === Infinity ? 0 : Math.min(100, (currentUsed / currentLimit) * 100);
  const atm = ATMOSPHERES[atmosphere] || ATMOSPHERES.default;
  const refreshUsageToday = useCallback(async () => {
    if (!user?.uid || isCreator) return;
    try {
      const usageSnap = await getDoc(doc(db, "users", user.uid, "usage", getUsageDayKey()));
      setUsageToday(usageSnap.exists() ? usageSnap.data() : {});
    } catch { /* The server remains the source of truth for the quota. */ }
  }, [user?.uid, isCreator]);

  // ── EMAIL VERIFICATION CHECK ─────────────────────────────
  useEffect(() => {
    if (user && !user.emailVerified && !isCreator) {
      setShowEmailVerify(true);
    }
  }, [user, isCreator]);

  const sendVerificationEmail = async () => {
    try {
      await sendEmailVerification(user);
      setVerifySent(true);
    } catch {
      setError("Could not send verification email. Try again in a minute.");
    }
  };

  // ── RESIZE ───────────────────────────────────────────────
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 800;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(true);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ── TOUCH SWIPE ──────────────────────────────────────────
  useEffect(() => {
    const handleTouchStart = (e) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    };
    const handleTouchEnd = (e) => {
      if (touchStartX.current === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
      if (Math.abs(dx) > 60 && Math.abs(dx) > dy * 1.5) {
        if (dx > 0 && touchStartX.current < 40) setSidebarOpen(true);
        if (dx < 0) setSidebarOpen(false);
      }
      touchStartX.current = null;
      touchStartY.current = null;
    };
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  // ── LOAD CONVERSATIONS ───────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const q = query(collection(db, "users", user.uid, "conversations"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setConversations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Failed to load conversations", err);
    }
  }, [user?.uid]);

  const loadArtifacts = useCallback(async () => {
    if (!user?.uid) return;
    setArtifactsLoading(true);
    const { data, error: loadError } = await db.from("artifacts").select("id,title,kind,content,files,created_at,updated_at").order("updated_at", { ascending: false });
    if (loadError) setError("Couldn't load saved artifacts. Apply the artifact library migration, then retry.");
    else setArtifacts(data || []);
    setArtifactsLoading(false);
  }, [user?.uid]);

  // ── SMART SCROLL — FIX: no jank during streaming ─────────
  // REPLACE the scroll useEffect with this:
useEffect(() => {
  const wrap = msgsWrapRef.current;
  if (!wrap) return;
  const newCount = messages.length;
  const lastMsg = messages[messages.length - 1];

  if (newCount > msgCountRef.current) {
    // scroll the CONTAINER, not the page
    wrap.scrollTop = wrap.scrollHeight;
    msgCountRef.current = newCount;
  } else if (lastMsg?.streaming) {
    const distFromBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight;
    if (distFromBottom < 220) {
      wrap.scrollTop = wrap.scrollHeight;
    }
  }
}, [messages]);

  // ── CLOSE DROPDOWN ON OUTSIDE CLICK ─────────────────────
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setModelDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── MAIN INIT ────────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    const unsubUser = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setIsBanned(data.isBanned || false);
        setPlan(getPlanSnapshot(data).plan);
        setMemories(Array.isArray(data.memories) ? data.memories.filter(memory => memory && typeof memory.text === "string") : []);
        setMemoryEnabled(data.memoryEnabled !== false);
      }
    });
    const unsubSettings = onSnapshot(doc(db, "settings", "platform"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMaintenanceMode(data.maintenanceMode || false);
        setPlatformNotice(data.globalNotice || "");
        if (data.planLimits) setPlanLimits(normalizePlanLimits(data.planLimits));
      }
    });
    loadConversations();
    loadArtifacts();
    return () => { unsubUser(); unsubSettings(); };
  }, [user?.uid, loadConversations, loadArtifacts]);

  // ── FETCH DAILY USAGE (THE FIX) ────────────────────────
  useEffect(() => {
    if (!user?.uid) return;

    const usageRef = doc(db, "users", user.uid, "usage", getUsageDayKey());
    return onSnapshot(
      usageRef,
      (snap) => setUsageToday(snap.exists() ? snap.data() : {}),
      (err) => console.error("Failed to watch daily usage", err),
    );
  }, [user?.uid]);

  const selectConv = async (conv) => {
    setSelectedSlashCommand(null);
    setPendingArtifactCommand(null);
    setInput("");
    setActiveConv(conv); setError(null); setView("chat");
    const cm = MODELS.find(m => m.label === conv.model || m.id === conv.model) || DEFAULT_MODEL;
    setModel(conv.isPersona ? DEFAULT_MODEL : cm);
    if (window.innerWidth <= 800) setSidebarOpen(false);
    const q = query(collection(db, "users", user.uid, "conversations", conv.id, "messages"), orderBy("createdAt", "asc"));
    const snap = await getDocs(q);
    setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setTimeout(() => {
    if (msgsWrapRef.current) {
     msgsWrapRef.current.scrollTop = msgsWrapRef.current.scrollHeight;
    }
    msgCountRef.current = 0;
    }, 150);
    
  };

  const newChat = (forceModel = null) => {
    setActiveConv(null); setMessages([]); setInput(""); setSelectedSlashCommand(null); setImage(null); setImageBase64(null); setError(null); setView("chat");
    setPendingArtifactCommand(null);
    if (forceModel) setModel(forceModel);
    if (window.innerWidth <= 800) setSidebarOpen(false);
    msgCountRef.current = 0;
  };

  const startPersonaChat = useCallback(async (persona, formData = {}) => {
    const contextData = Object.entries(formData).map(([key, val]) => {
      const field = persona.fields?.find(f => f.id === key);
      return `- **${field?.label || key}**: ${val}`;
    }).join("\n");
    try {
      const newConvData = { title: `Chat with ${persona.label}`, createdAt: serverTimestamp(), model: MODELS[0].label, isPersona: true, personaId: persona.id, personaPrompt: persona.prompt, personaContextData: contextData };
      const ref = await addDoc(collection(db, "users", user.uid, "conversations"), newConvData);
      const newConv = { id: ref.id, ...newConvData };
      setConversations(prev => [newConv, ...prev]);
      setActiveConv(newConv); setModel(DEFAULT_MODEL); setMessages([]);
      setOnboardingPersona(null); setPersonaFormData({}); setView("chat");
      if (window.innerWidth <= 800) setSidebarOpen(false);
      msgCountRef.current = 0;
    } catch { setError("Failed to start persona chat."); }
  }, [user?.uid]);

  const personaCardHandlers = useMemo(() => {
    const handlers = new Map();
    for (const category of PERSONA_CATEGORIES) {
      for (const persona of category.items) {
        const needsSetup = category.id === "professional" || persona.fields?.length > 0;
        handlers.set(persona.id, needsSetup
          ? () => { setOnboardingPersona(persona); setPersonaFormData({}); }
          : () => startPersonaChat(persona, {}));
      }
    }
    return handlers;
  }, [startPersonaChat]);

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setImage(`Image: ${file.name}`); setImageType("image");
    const reader = new FileReader();
    reader.onload = () => setImageBase64(reader.result.split(",")[1]);
    reader.readAsDataURL(file);
  };

  // ── SEND MESSAGE — FIX: no event object leak ─────────────
  const sendMessage = async (overrideInput, options = {}) => {
    const rawText = (typeof overrideInput === "string" ? overrideInput : input).trim();
    const isRetry = options.retry === true;
    const editAt = Number.isInteger(options.editIndex) ? options.editIndex : editingIndex;
    const isEdit = !isRetry && Number.isInteger(editAt);
    const sourceMessages = options.baseMessages || messages;
    const commandForMessage = selectedSlashCommand && !isRetry && !isEdit ? selectedSlashCommand : null;
    const isSearchCommand = commandForMessage?.name === "search";
    const isWebSearch = Boolean(
      options.webSearch !== undefined
        ? options.webSearch
        : (webSearchEnabled || isSearchCommand || /^\/search\b/i.test(rawText))
    );
    const text = commandForMessage ? commandForMessage.build(rawText) : rawText;
    if (!text && !imageBase64) return;
    if (isBanned && !isCreator) { setError("ACCESS DENIED: Your account is suspended."); return; }
    if (maintenanceMode && !isCreator) { setError("SYSTEM OFFLINE: Manshverse is under maintenance."); return; }
    if (text.length > 5000) { setError("Message too long. Please shorten your prompt."); return; }
    if (loading) return;

    const targetModel = options.forceModel || model;
    const usageKey = targetModel.usageKey || targetModel.id;

    // Fast in-memory usage gate check (server also validates atomically)
    const effectiveLimit = isCreator ? Infinity : (planLimits[plan]?.[usageKey] ?? 10);
    const used = Number(usageToday[usageKey] || 0);
    if (!isCreator && targetModel.id !== "mansh/auto" && effectiveLimit !== Infinity && used >= effectiveLimit) {
      setUpgradeReason(`Daily limit reached for ${targetModel.label}.`);
      setShowUpgrade(true);
      return;
    }

    // ── INSTANT OPTIMISTIC UI (0ms delay) ───────────────────
    setError(null);
    setInput("");
    setSelectedSlashCommand(null);
    if (commandForMessage?.opensArtifact) setPendingArtifactCommand(commandForMessage);
    setEditingIndex(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    const imgB64 = imageBase64;
    const imgType = imageType;
    setImage(null);
    setImageBase64(null);
    setLoading(true);

    const now = new Date().toISOString();
    const userMsg = isEdit
      ? { ...sourceMessages[editAt], content: text, editedAt: now }
      : { role: "user", content: text || "Image attached", modelLabel: targetModel.label, createdAt: now };

    const assistantPending = {
      role: "assistant",
      content: "",
      modelLabel: targetModel.label,
      modelId: targetModel.id,
      streaming: true,
      webSearching: isWebSearch,
      sources: [],
      createdAt: now,
    };

    let newMessages = isRetry
      ? [...sourceMessages, assistantPending]
      : isEdit
        ? [...sourceMessages.slice(0, editAt), userMsg, assistantPending]
        : [...sourceMessages, userMsg, assistantPending];

    setMessages(newMessages);
    const pidx = newMessages.length - 1;

    let convId = activeConv?.id;
    let streamTimer = null;
    let latestPartial = "";
    let resolvedModelId = targetModel.id;
    let resolvedSources = [];

    try {
      // Persist conversation and user message concurrently in the background
      const dbSavePromise = (async () => {
        let currentConvId = convId;
        try {
          if (!currentConvId) {
            const title = text.slice(0, 45) || "Image conversation";
            const ref = await addDoc(collection(db, "users", user.uid, "conversations"), { title, createdAt: now, model: targetModel.label });
            currentConvId = ref.id;
            const nextConv = { id: currentConvId, title, model: targetModel.label };
            setActiveConv(nextConv);
            setConversations(previous => [nextConv, ...previous]);
          }

          const messagePath = collection(db, "users", user.uid, "conversations", currentConvId, "messages");
          if (isRetry) {
            // Prior assistant messages already discarded by caller
          } else if (isEdit) {
            const removed = sourceMessages.slice(editAt + 1).filter(message => message.id);
            await Promise.all([
              userMsg.id ? updateDoc(doc(db, "users", user.uid, "conversations", currentConvId, "messages", userMsg.id), { content: text, editedAt: now }) : Promise.resolve(),
              ...removed.map(message => deleteDoc(doc(db, "users", user.uid, "conversations", currentConvId, "messages", message.id))),
            ]);
          } else {
            const savedUser = await addDoc(messagePath, { role: "user", content: userMsg.content, modelLabel: targetModel.label, createdAt: now });
            userMsg.id = savedUser.id;
          }
          return currentConvId;
        } catch (dbErr) {
          console.error("Failed to persist user message:", dbErr);
          return currentConvId;
        }
      })();

      const enabledMemories = memoryEnabled ? memories.map(memory => memory.text).filter(Boolean) : [];
      const artifactIntentPattern = /\b(?:build|make|create|design|code|generate|prototype)\b.{0,100}\b(?:website|web\s?app|landing page|site|artifact|prototype|dashboard)\b|\b(?:website|web\s?app|landing page|site|artifact|dashboard)\b.{0,100}\b(?:build|make|create|design|code|generate|prototype)\b/i;
      const artifactIntent = artifactIntentPattern.test(text) || sourceMessages.some(message => message.role === "user" && artifactIntentPattern.test(message.content || ""));
      const sysPrompt = getSystem(targetModel.label, targetModel.tone, isCreator, customPrompt, activePersonaCtx, shadowMode, enabledMemories) + (artifactIntent ? ARTIFACT_SYSTEM_APPEND : "");
      
      const apiMsgs = newMessages.slice(0, -1).filter(message => message.type !== "routing").map(message => ({ role: message.role, content: message.content }));
      const reply = await callModelStream(
        targetModel.id,
        apiMsgs,
        sysPrompt,
        imgB64,
        imgType,
        partial => {
          latestPartial = partial;
          if (streamTimer !== null) return;
          streamTimer = window.setTimeout(() => {
            streamTimer = null;
            setMessages(previous => previous.map((message, index) => index === pidx ? { ...message, content: latestPartial, webSearching: false } : message));
          }, 55);
        },
        modelId => { resolvedModelId = modelId; },
        {
          webSearch: isWebSearch,
          searchQuery: isWebSearch ? (rawText.replace(/^\/search\s*/i, "").trim() || text) : undefined,
          onSources: sources => {
            resolvedSources = sources;
            setMessages(previous => previous.map((message, index) => index === pidx ? { ...message, sources, webSearching: false } : message));
          }
        }
      );

      if (streamTimer !== null) window.clearTimeout(streamTimer);
      streamTimer = null;

      const finalConvId = (await dbSavePromise) || convId;
      const resolvedModel = MODELS.find(item => item.id === resolvedModelId);
      const displayedModel = targetModel.id === "mansh/auto"
        ? `Mansh Mode · ${resolvedModel?.label || "Groq"}`
        : (resolvedModel?.label || targetModel.label);
      const assistantCreatedAt = new Date().toISOString();

      let assistantDocId = undefined;
      if (finalConvId) {
        try {
          const messagePath = collection(db, "users", user.uid, "conversations", finalConvId, "messages");
          const savedAssistant = await addDoc(messagePath, {
            role: "assistant",
            content: reply,
            createdAt: assistantCreatedAt,
            modelLabel: displayedModel,
            modelId: resolvedModelId,
            sources: resolvedSources || []
          });
          assistantDocId = savedAssistant.id;
        } catch (dbErr) {
          console.error("Failed to save assistant message:", dbErr);
        }
      }

      setMessages(previous => previous.map((message, index) => index === pidx
        ? { ...message, id: assistantDocId, content: reply, modelLabel: displayedModel, modelId: resolvedModelId, streaming: false, webSearching: false, sources: resolvedSources, createdAt: assistantCreatedAt }
        : message));
      const artifactCommand = commandForMessage || pendingArtifactCommand;
      const websiteCommand = artifactCommand?.name === "website";
      if (artifactCommand?.opensArtifact && !/\[\[MCQ:/i.test(reply) && (!websiteCommand || Object.keys(extractArtifactFiles(reply)).length > 0)) {
        createArtifactFromMessage({ content: reply });
        setPendingArtifactCommand(null);
      }
      setAtmosphere(detectAtmosphere(reply));
      if (!isCreator) {
        setUsageToday(previous => ({ ...previous, [resolvedModelId]: Number(previous[resolvedModelId] || 0) + 1 }));
      }
    } catch (err) {
      if (streamTimer !== null) window.clearTimeout(streamTimer);
      setError(friendlyError(err.message));
      setMessages(previous => previous.map((message, index) => index === pidx
        ? { ...message, content: latestPartial, streaming: false, failed: true, failureMessage: friendlyError(err.message), modelId: resolvedModelId }
        : message));
    } finally {
      setLoading(false);
      if (targetModel.id === "mansh/auto") refreshUsageToday();
    }
  };

  const saveMemoryText = async (rawText) => {
    const text = String(rawText || "").trim().slice(0, 500);
    if (!text || !user?.uid) return false;
    if (memories.some(memory => memory.text.toLowerCase() === text.toLowerCase())) {
      setMemoryFeedback("That memory is already saved.");
      return false;
    }
    if (memories.length >= 30) {
      setMemoryFeedback("You can save up to 30 memories. Remove one to add another.");
      return false;
    }
    const next = [...memories, { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() }];
    try {
      await updateDoc(doc(db, "users", user.uid), { memories: next });
      setMemories(next);
      setMemoryFeedback("Saved. Mansh Mode will use this in future chats.");
      window.setTimeout(() => setMemoryFeedback(""), 2800);
      return true;
    } catch {
      setMemoryFeedback("Could not save that memory. Try again.");
      return false;
    }
  };

  const removeMemory = async (memoryId) => {
    const next = memories.filter(memory => memory.id !== memoryId);
    try {
      await updateDoc(doc(db, "users", user.uid), { memories: next });
      setMemories(next);
      setMemoryFeedback("Memory removed.");
    } catch {
      setMemoryFeedback("Could not remove that memory. Try again.");
    }
  };

  const toggleMemoryUse = async () => {
    const nextEnabled = !memoryEnabled;
    try {
      await updateDoc(doc(db, "users", user.uid), { memoryEnabled: nextEnabled });
      setMemoryEnabled(nextEnabled);
    } catch {
      setMemoryFeedback("Could not update memory settings.");
    }
  };

  const rateMessage = async (index, rating) => {
    const message = messages[index];
    if (!message?.id || !activeConv?.id) return;
    const nextRating = message.rating === rating ? null : rating;
    try {
      await updateDoc(doc(db, "users", user.uid, "conversations", activeConv.id, "messages", message.id), { rating: nextRating });
      setMessages(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, rating: nextRating } : item));
    } catch {
      setError("Could not save your feedback. Try again.");
    }
  };

  const editMessage = (index, message) => {
    setEditingIndex(index);
    setSelectedSlashCommand(null);
    setInput(message.content || "");
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 0);
  };

  const retryMessage = async (index, fallbackModelId = null) => {
    const assistant = messages[index];
    const userIndex = messages.slice(0, index).findLastIndex(message => message.role === "user");
    if (userIndex < 0 || !activeConv?.id || loading) return;
    const baseMessages = messages.slice(0, userIndex + 1);
    const discarded = messages.slice(userIndex + 1).filter(message => message.id);
    try {
      await Promise.all(discarded.map(message => deleteDoc(doc(db, "users", user.uid, "conversations", activeConv.id, "messages", message.id))));
      setMessages(baseMessages);
      const retryModelId = fallbackModelId || assistant?.modelId || model.id;
      const retryModel = MODELS.find(item => item.id === retryModelId) || DEFAULT_MODEL;
      await sendMessage(baseMessages[userIndex].content, { retry: true, baseMessages, forceModel: retryModel, webSearch: Boolean(assistant?.sources?.length) });
    } catch {
      setError("Could not retry that response. Please try again.");
    }
  };

  const createArtifactFromMessage = (message) => {
    const content = String(message.content || "");
    const files = extractArtifactFiles(content);
    const filename = Object.keys(files).find(name => /\.html?$/i.test(name)) || Object.keys(files)[0] || "";
    const titleSource = content.replace(/```[\s\S]*?```/g, "").split("\n").find(line => line.trim())?.replace(/^#+\s*/, "").trim();
    const title = (titleSource || filename.replace(/\.[^.]+$/, "") || "New document").slice(0, 90);
    setArtifact({ kind: Object.keys(files).length ? "website" : "document", title, content, files });
    setArtifactFile(filename);
    setArtifactEditing(false);
  };

  const loadArtifactVersions = async artifactId => {
    if (!artifactId) { setArtifactVersions([]); return; }
    setArtifactVersionsLoading(true);
    const { data, error: versionError } = await db.from("artifact_versions").select("id,title,kind,content,files,created_at").eq("artifact_id", artifactId).order("created_at", { ascending: false });
    setArtifactVersionsLoading(false);
    if (versionError) { setError("Couldn't load version history. Check that the artifact library migration is applied."); return; }
    setArtifactVersions(data || []);
  };

  const openArtifact = row => {
    setArtifact({ id: row.id, kind: row.kind, title: row.title, content: row.content || "", files: row.files || {} });
    setArtifactFile(Object.keys(row.files || {}).find(name => /\.html?$/i.test(name)) || Object.keys(row.files || {})[0] || "");
    setArtifactEditing(false);
    loadArtifactVersions(row.id);
  };

  const saveArtifact = async () => {
    if (!artifact || !user?.uid || artifactSaving) return;
    setArtifactSaving(true);
    const record = { title: (artifact.title || "Untitled artifact").trim().slice(0, 100) || "Untitled artifact", kind: artifact.kind, content: artifact.content || "", files: artifact.files || {} };
    const result = artifact.id
      ? await db.from("artifacts").update(record).eq("id", artifact.id).select("id,title,kind,content,files,created_at,updated_at").single()
      : await db.from("artifacts").insert({ ...record, user_id: user.uid }).select("id,title,kind,content,files,created_at,updated_at").single();
    setArtifactSaving(false);
    if (result.error) { setError("Couldn't save this artifact. Check that the artifact library migration is applied, then retry."); return; }
    setArtifact(result.data);
    setArtifacts(previous => [result.data, ...previous.filter(item => item.id !== result.data.id)]);
    await loadArtifactVersions(result.data.id);
  };

  const restoreArtifactVersion = version => {
    if (!artifact) return;
    setArtifact(current => ({ ...current, title: version.title, kind: version.kind, content: version.content || "", files: version.files || {} }));
    setArtifactFile(Object.keys(version.files || {}).find(name => /\.html?$/i.test(name)) || Object.keys(version.files || {})[0] || "");
    setArtifactEditing(false);
  };

  const deleteArtifact = async row => {
    if (!window.confirm(`Delete “${row.title}” permanently?`)) return;
    const { error: deleteError } = await db.from("artifacts").delete().eq("id", row.id);
    if (deleteError) { setError("Couldn't delete that artifact. Try again."); return; }
    setArtifacts(previous => previous.filter(item => item.id !== row.id));
    if (artifact?.id === row.id) { setArtifact(null); setArtifactVersions([]); }
  };

  const messageActionRef = useRef(null);
  messageActionRef.current = { rateMessage, retryMessage, editMessage, sendMessage, rememberMessage: message => saveMemoryText(message.content), createArtifact: createArtifactFromMessage, answerChoice: choices => sendMessage(`For the artifact, my choices are:\n${choices.map(choice => `- ${choice.question}: ${choice.answer}`).join("\n")}\nPlease continue and create it.`) };
  const handleMessageRate = useCallback((...args) => messageActionRef.current?.rateMessage(...args), []);
  const handleMessageRetry = useCallback((...args) => messageActionRef.current?.retryMessage(...args), []);
  const handleMessageEdit = useCallback((...args) => messageActionRef.current?.editMessage(...args), []);
  const handleMessageRemember = useCallback((...args) => messageActionRef.current?.rememberMessage(...args), []);
  const handleMessageArtifact = useCallback((...args) => messageActionRef.current?.createArtifact(...args), []);
  const handleMessageChoice = useCallback((...args) => messageActionRef.current?.answerChoice(...args), []);
  const rememberedText = useMemo(() => new Set(memories.map(memory => memory.text.trim().toLowerCase())), [memories]);

  const exportArtifact = (format) => {
    if (!artifact) return;
    const filename = artifactFilename(artifact.title);
    if (format === "md") downloadArtifact(`${filename}.md`, artifact.content, "text/markdown;charset=utf-8");
    if (format === "html" || format === "pdf") {
      let html = artifact.kind === "website"
        ? buildArtifactWebsite(artifact.files)
        : makeArtifactHtml(artifact.title, artifactPreviewRef.current?.innerHTML || "");
      if (artifact.kind === "website") {
        if (/<title>[\s\S]*?<\/title>/i.test(html)) html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(artifact.title)}</title>`);
        else html = html.replace(/<head[^>]*>/i, match => `${match}<title>${escapeHtml(artifact.title)}</title>`);
      }
      if (format === "html") downloadArtifact(`${filename}.html`, html, "text/html;charset=utf-8");
      else {
        const printWindow = window.open("", "_blank");
        if (!printWindow) { setError("Allow pop-ups to print this document as a PDF."); return; }
        printWindow.document.open();
        printWindow.document.write(html.replace("</head>", "<style>@page{margin:18mm}</style></head>"));
        printWindow.document.close();
        window.setTimeout(() => { printWindow.focus(); printWindow.print(); }, 350);
      }
    }
  };

  const enhancePrompt = async () => {
    if (!input.trim() || enhancing) return;
    setEnhancing(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json", ...await getApiAuthHeaders() }, body: JSON.stringify({ model: "openai/gpt-oss-20b", messages: [{ role: "system", content: "Rewrite the user's prompt to be highly detailed and effective for AI. Return ONLY the rewritten prompt, nothing else." }, { role: "user", content: input }] }) });
      const { data } = await readPayload(res);
      const enhanced = data?.choices?.[0]?.message?.content?.trim();
      if (enhanced) setInput(enhanced);
      else setError("Could not enhance this prompt. Try again.");
    } catch {
      setError("Could not enhance this prompt. Try again.");
    } finally {
      setEnhancing(false);
      await refreshUsageToday();
    }
  };

  const executeDelete = async () => {
    if (!deleteConfirm) return;
    try { await deleteDoc(doc(db, "users", user.uid, "conversations", deleteConfirm.id)); setConversations(p => p.filter(c => c.id !== deleteConfirm.id)); if (activeConv?.id === deleteConfirm.id) newChat(); } catch { setError("Could not delete that conversation. Try again."); }
    setDeleteConfirm(null);
  };

  const submitUpgrade = async (planId) => {
    if (!user?.uid || submitting) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, "users", user.uid, "planRequests"), { userId: user.uid, requesterName: user.displayName || "User", requesterEmail: user.email || "", requestedPlan: planId, amount: planId === "pro" ? 199 : 1999, status: "pending", createdAt: serverTimestamp() });
      setPaidConfirmed(true);
    } catch { setError("Could not send request. Try again."); }
    setSubmitting(false);
  };

  // ── COUNCIL OF MINDS ─────────────────────────────────────
  const runCouncil = async () => {
    if (!councilQuestion.trim() || councilLoading) return;
    const question = councilQuestion.trim();
    const focus = councilFocus.trim();
    const styleInstructions = {
      balanced: "Be fair-minded: identify strengths, weaknesses, and meaningful uncertainty without forcing a conclusion.",
      skeptical: "Stress-test assumptions, point out risks and counterarguments, and say clearly what evidence could change the conclusion.",
      supportive: "Be constructive and encouraging while staying honest. Help the user find a practical next step without dismissing real risks.",
    }[councilStyle];
    const depthInstructions = councilDepth === "detailed"
      ? "Give a thoughtful, detailed response with reasoning and concrete examples, while staying focused."
      : "Keep the response concise: 3 to 5 sentences, with one clear main point.";
    const extraContext = focus ? `\n\nADDITIONAL USER CONTEXT AND FOCUS:\n${focus}` : "";
    const savedMemoryContext = memoryEnabled && memories.length
      ? `\n\nUSER-SAVED MEMORY (use only when relevant; current request takes priority):\n${memories.map(memory => `- ${memory.text}`).join("\n")}`
      : "";
    setCouncilAnsweredQuestion(question);
    setCouncilLoading(true);
    setCouncilErrors({});
    setCouncilResults({ founder: "", stoic: "", mathematician: "", synthesis: null });
    setCouncilSaved(false);
    setCouncilFeedback("");
    try {
      // Run all 3 in parallel
      const results = await Promise.all(COUNCIL_PERSONAS.map(async p => {
        try {
          const reply = await callModelOnce(p.model, `${p.prompt}\n\nRESPONSE STYLE:\n${styleInstructions}\n${depthInstructions}`, `${question}${extraContext}${savedMemoryContext}`);
          setCouncilResults(previous => ({ ...previous, [p.id]: reply }));
          return { id: p.id, reply };
        } catch (callError) {
          setCouncilErrors(previous => ({ ...previous, [p.id]: friendlyError(callError.message) }));
          return { id: p.id, reply: "" };
        }
      }));
      const partial = { ...Object.fromEntries(results.map(result => [result.id, result.reply])), synthesis: null };
      const available = Object.entries(partial).filter(([key, reply]) => key !== "synthesis" && reply);
      if (!available.length) {
        setError("All Decision Room perspectives failed. Please retry in a moment.");
      } else {
      setCouncilSynthLoading(true);
      // Synthesis call
      const synthesisPrompt = `You are a decision facilitator. Three perspectives have considered this question:

"${question}"

THE FOUNDER said: ${partial.founder || "Unavailable for this run."}

THE STOIC said: ${partial.stoic || "Unavailable for this run."}

THE MATHEMATICIAN said: ${partial.mathematician || "Unavailable for this run."}

${focus ? `ADDITIONAL USER CONTEXT AND FOCUS: ${focus}` : ""}
${savedMemoryContext}

Your job: turn their strongest insights into a useful decision brief. Do not pretend uncertainty is certainty; if the context is insufficient, say what is still unknown. Do not make high-stakes medical, legal, or financial decisions for the user. ${styleInstructions}

Use these headings:
## The call
Give the clearest reasonable recommendation, or say what information is needed before choosing.
## Why
Explain the strongest reasons behind it.
## Tradeoffs and risks
Name what the user gives up and what could go wrong.
## Next steps
Give 2–3 concrete actions the user can take. ${councilDepth === "detailed" ? "Include enough detail to make the actions practical." : "Keep each section concise."}`;
      const synthesis = await callModelOnce("openai/gpt-oss-120b", "You help people make clearer decisions by weighing competing perspectives, surfacing uncertainty, and turning conclusions into practical next steps.", synthesisPrompt);
      setCouncilResults({ ...partial, synthesis });
      }
    } catch (e) {
      setError(friendlyError(e.message));
      setCouncilResults(previous => ({ ...previous, synthesis: null }));
    }
    setCouncilLoading(false);
    setCouncilSynthLoading(false);
    await refreshUsageToday();
  };

  const getDecisionBrief = () => {
    if (!councilResults?.synthesis) return "";
    return `# Decision Room brief\n\n**Question:** ${councilAnsweredQuestion}\n\n## Practical perspective\n${councilResults.founder || ""}\n\n## What you control\n${councilResults.stoic || ""}\n\n## Analytical perspective\n${councilResults.mathematician || ""}\n\n${councilResults.synthesis}`;
  };

  const copyDecisionBrief = async () => {
    try {
      await navigator.clipboard.writeText(getDecisionBrief());
      setCouncilFeedback("Decision brief copied.");
      window.setTimeout(() => setCouncilFeedback(""), 2400);
    } catch {
      setError("Could not copy the brief. Check clipboard permissions and try again.");
    }
  };

  const saveDecisionBrief = async () => {
    if (!user?.uid || !councilResults?.synthesis || councilSaving || councilSaved) return;
    setCouncilSaving(true);
    try {
      const brief = getDecisionBrief();
      const title = `Decision Room: ${councilAnsweredQuestion.slice(0, 38)}${councilAnsweredQuestion.length > 38 ? "…" : ""}`;
      const conv = { title, createdAt: serverTimestamp(), model: "GPT OSS 120B", isDecisionRoom: true };
      const ref = await addDoc(collection(db, "users", user.uid, "conversations"), conv);
      await addDoc(collection(db, "users", user.uid, "conversations", ref.id, "messages"), { role: "user", content: councilAnsweredQuestion, createdAt: serverTimestamp() });
      await addDoc(collection(db, "users", user.uid, "conversations", ref.id, "messages"), { role: "assistant", content: brief, createdAt: serverTimestamp(), modelLabel: "Decision Room" });
      setConversations(previous => [{ id: ref.id, ...conv }, ...previous]);
      setCouncilSaved(true);
      setCouncilFeedback("Decision brief saved to your chats.");
      window.setTimeout(() => setCouncilFeedback(""), 2400);
    } catch (e) {
      setError(friendlyError(e.message || "Could not save the decision brief."));
    } finally {
      setCouncilSaving(false);
    }
  };

  const filteredConvs = useMemo(() => conversations.filter(c => (c.title || "").toLowerCase().includes(searchQuery.toLowerCase())), [conversations, searchQuery]);
  const personaConf = activeConv?.isPersona ? PERSONA_BY_ID.get(activeConv.personaId) : null;

  const renderInputArea = (compact = false) => {
    const slashQuery = input.match(/(?:^|\s)\/([a-z]*)$/i)?.[1]?.toLowerCase();
    const slashCommands = editingIndex === null && !selectedSlashCommand && slashQuery !== undefined ? SLASH_COMMANDS.filter(command => command.name.startsWith(slashQuery)) : [];
    const chooseSlashCommand = command => {
      const nextInput = input.replace(/(?:^|\s)\/[a-z]*$/i, "").trimEnd();
      setSelectedSlashCommand(command);
      if (!command.opensArtifact) setPendingArtifactCommand(null);
      setInput(nextInput);
      setSlashIndex(0);
      requestAnimationFrame(() => { const textarea = textareaRef.current; if (textarea) { textarea.focus(); textarea.setSelectionRange(nextInput.length, nextInput.length); textarea.style.height = "auto"; textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px"; } });
    };
    return (
    <div className={compact ? "chat-input-wrap" : "empty-input-container"}>
      {!compact && !activeConv?.isPersona && (
        <div className="mansh-toggle">
          <button type="button" className={`mtoggle-opt ${model.id === MODELS[0].id ? "active" : ""}`} onClick={() => setModel(MODELS[0])}><AppIcon name="sparkles" size={14}/> Mansh Mode</button>
          <button type="button" className={`mtoggle-opt ${model.id === MODELS[1].id ? "active" : ""}`} onClick={() => setModel(MODELS[1])}>GPT OSS 20B · Fast</button>
        </div>
      )}
      {shadowMode && (
        <div className="shadow-banner">
          <AppIcon name="eye" size={15}/>
          <span>Shadow Mode is ON — The AI will challenge everything you say</span>
          <button onClick={() => setShadowMode(false)}>Deactivate</button>
        </div>
      )}
      {image && (
        <div className="img-chip">
          {image}
          <button onClick={() => { setImage(null); setImageBase64(null); if (fileRef.current) fileRef.current.value = ""; }} className="img-chip-rm" aria-label="Remove image"><AppIcon name="close" size={13}/></button>
        </div>
      )}
      {editingIndex !== null && (
        <div className="edit-composer-banner">
          <span><AppIcon name="edit" size={13}/> Editing an earlier message. Sending updates it and regenerates the reply.</span>
          <button type="button" onClick={() => { setEditingIndex(null); setInput(""); }}>Cancel</button>
        </div>
      )}
      <div className="composer-field">
      {slashCommands.length > 0 && (
        <div className="slash-command-menu" role="listbox" aria-label="Prompt commands">
          <div className="slash-command-heading"><span>QUICK COMMANDS</span><kbd>↑↓</kbd><kbd>ENTER</kbd></div>
          {slashCommands.map((command, index) => (
            <button key={command.name} type="button" role="option" aria-selected={index === slashIndex} className={`slash-command-option ${index === slashIndex ? "active" : ""}`} onMouseDown={event => event.preventDefault()} onClick={() => chooseSlashCommand(command)}>
              <strong>/{command.name}</strong><span>{command.description}</span>
            </button>
          ))}
        </div>
      )}
      {selectedSlashCommand && (
        <div className="slash-command-selected" role="status" aria-live="polite">
          <span className="slash-command-selected-mark">/{selectedSlashCommand.name}</span>
          <span className="slash-command-selected-copy"><strong>{selectedSlashCommand.description}</strong><small>COMMAND ACTIVE · APPLIES TO YOUR NEXT MESSAGE</small></span>
          <button type="button" aria-label={`Remove /${selectedSlashCommand.name} command`} onClick={() => setSelectedSlashCommand(null)}><AppIcon name="close" size={15}/></button>
        </div>
      )}
      <div className={`input-pill ${shadowMode ? "shadow-pill" : ""}`}>
        <textarea
          ref={textareaRef}
          className="input-ta"
          aria-label="Message Manshverse"
          placeholder={editingIndex !== null ? "Update your message…" : selectedSlashCommand ? "Add a topic or details…" : shadowMode ? "State your belief... I'll find its weakness." : (activeConv?.isPersona ? `Message ${activeConv.title.replace("Chat with ", "")}...` : "Message Manshverse…")}
          value={input}
          onChange={e => { setInput(e.target.value); setSlashIndex(0); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px"; }}
          onKeyDown={e => {
            if (slashCommands.length && e.key === "ArrowDown") { e.preventDefault(); setSlashIndex(index => (index + 1) % slashCommands.length); return; }
            if (slashCommands.length && e.key === "ArrowUp") { e.preventDefault(); setSlashIndex(index => (index - 1 + slashCommands.length) % slashCommands.length); return; }
            if (slashCommands.length && (e.key === "Enter" || e.key === "Tab")) {
              e.preventDefault();
              const command = slashCommands[slashIndex] || slashCommands[0];
              if (command) chooseSlashCommand(command);
              return;
            }
            if (e.key === "Escape" && slashQuery !== undefined) { e.preventDefault(); setInput(input.replace(/\/[a-z]*$/i, "")); return; }
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
          }}
          rows={1}
        />
        <div className="input-actions">
          <button
            type="button"
            className={`input-icon-btn ${webSearchEnabled ? "active-icon-btn" : ""}`}
            onClick={() => setWebSearchEnabled(p => !p)}
            title={webSearchEnabled ? "Web search active (click to turn off)" : "Search the web with Tavily"}
            aria-label={webSearchEnabled ? "Disable web search" : "Enable web search"}
          >
            <AppIcon name="globe" size={16} />
          </button>
          {model.vision && (
            <button className="input-icon-btn" onClick={() => fileRef.current?.click()} title="Attach image">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </button>
          )}
          {/* FIX: use arrow function to prevent event object being passed as overrideInput */}
          <button type="button" className="send-btn" onClick={() => sendMessage()} disabled={(!input.trim() && !imageBase64 && !selectedSlashCommand) || loading} aria-label={loading ? "Generating response" : editingIndex !== null ? "Update message" : "Send message"}>
            {loading ? <span className="send-loading-ring"/> : editingIndex !== null ? <AppIcon name="check" size={17}/> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>}
          </button>
        </div>
      </div>
      </div>
      {!compact && (
        <div className="quick-actions">
          <button type="button" className={`qa-chip ${webSearchEnabled ? "qa-chip-active-web" : ""}`} onClick={() => setWebSearchEnabled(p => !p)} title="Search the web with Tavily and DuckDuckGo fallback">
            <AppIcon name="globe" size={13}/> {webSearchEnabled ? "Search: ON" : "Web Search"}
          </button>
          <button className="qa-chip" onClick={() => setView("memory")}><AppIcon name="save" size={13}/> Memory {memoryEnabled && memories.length ? `· ${memories.length}` : ""}</button>
          <button className="qa-chip" onClick={enhancePrompt} disabled={enhancing || !input.trim()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            {enhancing ? "Enhancing..." : "Enhance Prompt"}
          </button>
          <button className="qa-chip" onClick={() => { const m = MODELS.find(m => m.id === "qwen/qwen3.8-27b"); if (m) setModel(m); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            Analyze Image
          </button>
          <button className={`qa-chip ${shadowMode ? "qa-chip-active-red" : ""}`} onClick={() => setShadowMode(p => !p)}>
            <AppIcon name="eye" size={14}/> {shadowMode ? "Shadow: ON" : "Shadow Mode"}
          </button>
        </div>
      )}
      {compact && (
        <div className="compact-quick-actions">
          <button type="button" className={`qa-chip ${webSearchEnabled ? "qa-chip-active-web" : ""}`} onClick={() => setWebSearchEnabled(p => !p)} title="Search the web with Tavily and DuckDuckGo fallback">
            <AppIcon name="globe" size={12}/> {webSearchEnabled ? "Search: ON" : "Web Search"}
          </button>
          <button className="qa-chip" onClick={() => setView("memory")}><AppIcon name="save" size={13}/> Memory</button>
          <button className="qa-chip" onClick={enhancePrompt} disabled={enhancing || !input.trim()}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            {enhancing ? "..." : "Enhance"}
          </button>
          <button className={`qa-chip ${shadowMode ? "qa-chip-active-red" : ""}`} onClick={() => setShadowMode(p => !p)}>
            <AppIcon name="eye" size={14}/> {shadowMode ? "Shadow: ON" : "Shadow"}
          </button>
        </div>
      )}
      <div className="composer-hint"><span>Enter to send</span><i/>Shift + Enter for a new line<i/><span>Type / for commands</span></div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile}/>
    </div>
  );
  };

  const handleCopyMessage = useCallback(async (index, content) => {
    try {
      await navigator.clipboard.writeText(content || "");
      setCopied(index);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("Could not copy this message. Check clipboard permissions.");
    }
  }, []);
  const chatUserName = user?.displayName || "You";
  const chatUserInitial = (user?.displayName?.[0] || user?.email?.[0] || "U").toUpperCase();
  const chatPersonaName = activeConv?.isPersona ? activeConv.title.replace("Chat with ", "") : null;
  const chatPersonaBackground = chatPersonaName ? avatarBg(activeConv.title) : "rgba(108,71,255,0.15)";

  const selectedPersonaCategory = PERSONA_CATEGORIES.find(category => category.id === personaTab) || PERSONA_CATEGORIES[0];
  const normalizedPersonaSearch = personaSearch.trim().toLowerCase();
  const visiblePersonas = selectedPersonaCategory.items.filter(persona =>
    `${persona.label} ${persona.sub || ""} ${persona.desc || ""}`.toLowerCase().includes(normalizedPersonaSearch)
  );
  const onboardingAnsweredCount = onboardingPersona?.fields?.filter(field => String(personaFormData[field.id] || "").trim()).length || 0;
  const onboardingFieldCount = onboardingPersona?.fields?.length || 0;

  const chatStyles = useMemo(() => `
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        html,body,#root{height:100%;background:#000;font-family:'Manrope',sans-serif;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:#222;border-radius:4px;}
        ::selection{background:#3d1f8a;color:#fff;}

        /* ── ATMOSPHERE CSS VARS ── */
        :root{
          --atm-accent: ${atm.accent};
          --atm-glow: ${atm.glow};
          --atm-star-dur: ${atm.starDur};
        }

        /* ── STARFIELD ── */
        @keyframes twinkle{0%,100%{opacity:0.2}50%{opacity:1}}
        .starfield{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;contain:strict;}
        .star{position:absolute;border-radius:50%;background:#fff;animation:twinkle linear infinite;will-change:opacity;}
        .starfield.starfield-static .star{animation-play-state:paused;}

        /* ── LAYOUT ── */
        .root{display:flex;height:100vh;width:100vw;overflow:hidden;position:relative;z-index:1;}

        /* ── SIDEBAR ── */
        .sb{
          width:264px;flex-shrink:0;
          background:rgba(5,5,8,0.92);
          backdrop-filter:none;-webkit-backdrop-filter:none;
          border-right:1px solid rgba(255,255,255,0.07);
          display:flex;flex-direction:column;overflow:hidden;
          transition:width 0.3s cubic-bezier(0.4,0,0.2,1),opacity 0.3s cubic-bezier(0.4,0,0.2,1),transform 0.3s cubic-bezier(0.4,0,0.2,1);
          z-index:50;will-change:transform;
        }
        .sb.off{width:0;opacity:0;pointer-events:none;}

        @media(max-width:800px){
          .sb{
            position:fixed;top:0;left:0;bottom:0;
            width:280px !important;z-index:200;
            transform:translateX(-100%);opacity:1 !important;
            border-right:1px solid rgba(255,255,255,0.1);
            box-shadow:4px 0 40px rgba(0,0,0,0.8);
          }
          .sb.off{transform:translateX(-100%);pointer-events:none;}
          .sb:not(.off){transform:translateX(0);}
        }

        /* ── SIDEBAR BACKDROP ── */
        .sb-backdrop{display:none;}
        @media(max-width:800px){
          .sb-backdrop{
            display:block;position:fixed;inset:0;
            background:rgba(0,0,0,0.65);
            backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
            z-index:199;opacity:0;pointer-events:none;
            transition:opacity 0.3s cubic-bezier(0.4,0,0.2,1);
          }
          .sb-backdrop.visible{opacity:1;pointer-events:auto;}
        }

        .sb-head{padding:20px 16px 16px;display:flex;align-items:center;gap:12px;border-bottom:1px solid rgba(255,255,255,0.05);flex-shrink:0;}
        .sb-mark{width:30px;height:30px;background:linear-gradient(135deg,var(--atm-accent),#5c3dcc);border-radius:9px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 16px var(--atm-glow);flex-shrink:0;transition:background 0.6s,box-shadow 0.6s;}
        .sb-title{font-size:15px;font-weight:600;color:#fff;white-space:nowrap;}
        .sb-body{flex:1;overflow-y:auto;padding:12px 10px;}
        .sb-search{width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:9px 13px;font-size:13px;color:#ccc;outline:none;font-family:'Manrope';margin-bottom:8px;transition:border-color 0.2s;}
        .sb-search:focus{border-color:rgba(255,255,255,0.14);}
        .sb-search::placeholder{color:#444;}
        .sb-section{font-size:10.5px;color:#383838;text-transform:uppercase;letter-spacing:0.9px;font-weight:600;padding:14px 6px 6px;}
        .sb-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;cursor:pointer;color:#666;font-size:13.5px;font-weight:500;transition:all 0.15s;margin-bottom:2px;border:1px solid transparent;}
        .sb-item:hover{background:rgba(255,255,255,0.04);color:#bbb;border-color:rgba(255,255,255,0.06);}
        .sb-item.active{background:rgba(255,255,255,0.06);color:#fff;border-color:rgba(255,255,255,0.09);}
        .sb-conv{padding:10px 12px;border-radius:10px;cursor:pointer;margin-bottom:2px;border:1px solid transparent;position:relative;transition:all 0.15s;content-visibility:auto;contain-intrinsic-size:auto 58px;}
        .sb-conv:hover{background:rgba(255,255,255,0.03);border-color:rgba(255,255,255,0.06);}
        .sb-conv.active{background:rgba(255,255,255,0.06);border-color:rgba(255,255,255,0.08);}
        .sb-conv-title{font-size:13px;color:#bbb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:24px;line-height:1.4;}
        .sb-conv.active .sb-conv-title{color:#fff;}
        .sb-conv-sub{font-size:10.5px;color:#444;margin-top:3px;}
        .sb-del{position:absolute;right:8px;top:10px;opacity:0;background:none;border:none;color:#555;cursor:pointer;font-size:13px;transition:0.15s;padding:2px 4px;}
        .sb-conv:hover .sb-del{opacity:1;}
        .sb-del:hover{color:#fca5a5;}
        .sb-foot{padding:14px 10px;border-top:1px solid rgba(255,255,255,0.05);flex-shrink:0;}
        .sb-user{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;cursor:pointer;transition:0.15s;}
        .sb-user:hover{background:rgba(255,255,255,0.04);}
        .sb-av{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#3d1f8a,#1a0d2e);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;overflow:hidden;}
        .sb-av img{width:100%;height:100%;object-fit:cover;}
        .sb-uinfo{flex:1;min-width:0;}
        .sb-uname{font-size:13px;font-weight:500;color:#ccc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .sb-badge{display:inline-flex;align-items:center;gap:4px;font-size:9px;color:#a78bfa;background:#0d081f;border:1px solid #2d1f60;border-radius:5px;padding:2px 7px;margin-top:3px;font-weight:600;}
        .sb-plan{font-size:10px;color:#555;margin-top:2px;}
        .sb-progress{height:3px;background:rgba(255,255,255,0.07);border-radius:2px;margin:6px 0;overflow:hidden;}
        .sb-progress-fill{height:100%;background:var(--atm-accent);border-radius:2px;transition:width 0.4s,background 0.6s;}
        .sb-upg{width:100%;background:transparent;border:1px solid rgba(255,255,255,0.09);border-radius:8px;color:#bbb;font-size:12px;font-weight:500;padding:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:'Manrope';transition:0.15s;margin-bottom:10px;}
        .sb-upg:hover{background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.16);color:#fff;}

        /* ── MAIN ── */
        .main{flex:1;min-width:0;display:flex;flex-direction:column;background:transparent;position:relative;}

        /* ── TOPBAR — FIX: z-index above mobile backdrop (199) ── */
        .topbar{
          display:flex;align-items:center;gap:14px;
          padding:14px 20px;
          border-bottom:1px solid rgba(255,255,255,0.05);
          flex-shrink:0;position:relative;
          z-index:210; /* FIX: above sb-backdrop(199) and sb(200) on mobile */
          background: rgba(10,10,18,0.96);
          backdrop-filter:none;-webkit-backdrop-filter:none;
          min-height:60px;
        @media(max-width:800px){
  .topbar{
    padding:14px 16px;
    gap:10px;
    position: sticky;
    top: 0;
    z-index: 210;
    background: rgba(8,8,16,0.98);
    border-bottom: 1px solid rgba(255,255,255,0.1);
  }
}
        }
        .icon-btn{background:transparent;border:none;color:#888;cursor:pointer;padding:8px;border-radius:8px;display:flex;align-items:center;transition:0.2s;}
        .icon-btn:hover{color:#fff;background:rgba(255,255,255,0.06);}
        .icon-btn.active{color:#fff;background:rgba(255,255,255,0.08);}
        .icon-btn.shadow-on{color:#f97316;background:rgba(249,115,22,0.1);}
        .mdrop-wrap{position:relative;}
        .mdrop-btn{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:12px;padding:8px 16px;font-size:13.5px;color:#ddd;cursor:pointer;transition:0.2s;font-weight:500;font-family:'Manrope';}
        .mdrop-btn:hover{background:rgba(255,255,255,0.07);border-color:rgba(255,255,255,0.16);}
        .mdrop-menu{position:absolute;top:calc(100%+10px);left:0;background:rgba(8,8,12,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:8px;min-width:290px;z-index:400;box-shadow:0 12px 32px rgba(0,0,0,0.55);}
        .mdrop-item{padding:12px 14px;border-radius:10px;cursor:pointer;display:flex;align-items:center;gap:12px;transition:0.15s;}
        .mdrop-item:hover{background:rgba(255,255,255,0.05);}
        .mdrop-item.sel{background:rgba(255,255,255,0.06);}
        .mdrop-name{font-size:14px;font-weight:600;color:#fff;}
        .mdrop-desc{font-size:11.5px;color:#666;margin-top:2px;}
        .mdrop-divider{height:1px;background:rgba(255,255,255,0.05);margin:4px 0;}
        .topbar-right{margin-left:auto;display:flex;align-items:center;gap:6px;}

        /* ── ATM INDICATOR (topbar) ── */
        .atm-dot{width:7px;height:7px;border-radius:50%;background:var(--atm-accent);box-shadow:0 0 6px var(--atm-glow);transition:background 0.6s,box-shadow 0.6s;flex-shrink:0;}

        /* ── ERROR BAR ── */
        .err-bar{padding:0 24px 12px;}
        .err-inner{max-width:800px;margin:0 auto;background:rgba(255,50,50,0.07);border:1px solid rgba(255,80,80,0.2);border-radius:12px;padding:12px 18px;color:#fca5a5;font-size:13.5px;display:flex;align-items:center;gap:10px;}

        /* ── EMAIL VERIFY BANNER ── */
        .verify-banner{
          background:rgba(250,204,21,0.07);
          border-bottom:1px solid rgba(250,204,21,0.2);
          padding:10px 24px;
          display:flex;align-items:center;gap:12px;
          font-size:13px;color:#fbbf24;
          flex-shrink:0;
        }
        .verify-btn{background:rgba(250,204,21,0.12);border:1px solid rgba(250,204,21,0.3);border-radius:7px;padding:5px 14px;font-size:12px;font-weight:600;color:#fbbf24;cursor:pointer;font-family:'Manrope';transition:0.15s;white-space:nowrap;}
        .verify-btn:hover{background:rgba(250,204,21,0.2);}
        .verify-close{margin-left:auto;background:none;border:none;color:#666;cursor:pointer;font-size:18px;line-height:1;}

        /* ── GALLERY VIEWS ── */
        .gallery{flex:1;overflow-y:auto;padding:42px 28px 56px;}
        .gallery-inner{max-width:1160px;margin:0 auto;}
        .gallery-header{margin-bottom:28px;padding:0 2px;}
        .gallery-eyebrow{display:flex;align-items:center;gap:8px;color:#a99bdb;text-transform:uppercase;letter-spacing:1.5px;font-size:10px;font-weight:800;margin-bottom:13px;}
        .gallery-heading-row{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;}
        .gallery-title{font-size:clamp(30px,4vw,40px);font-weight:750;color:#fff;letter-spacing:-1.3px;margin-bottom:8px;}
        .gallery-sub{font-size:14px;color:#858596;line-height:1.65;max-width:610px;}
        .gallery-count{flex-shrink:0;color:#777687;font-size:11px;padding-bottom:5px;}
        .gallery-controls{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:17px;}
        .persona-tabs{display:flex;gap:5px;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);border-radius:13px;padding:5px;flex-wrap:wrap;}
        .ptab{display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:9px;font-size:12px;font-weight:650;color:#858596;cursor:pointer;transition:0.18s;border:1px solid transparent;background:transparent;font-family:'Manrope';}
        .ptab:hover{color:#e1deea;background:rgba(255,255,255,0.04);}
        .ptab.active{background:rgba(124,92,252,0.14);color:#e7e0ff;border-color:rgba(167,139,250,0.22);}
        .ptab-count{font-size:10px;color:#777687;background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:99px;}
        .ptab.active .ptab-count{color:#d5caff;background:rgba(167,139,250,0.14);}
        .persona-search{display:flex;align-items:center;gap:9px;min-width:230px;max-width:300px;width:100%;height:42px;padding:0 12px;border:1px solid rgba(255,255,255,0.09);border-radius:11px;background:rgba(255,255,255,0.025);color:#858596;transition:border-color .18s,background .18s;}
        .persona-search:focus-within{border-color:rgba(167,139,250,0.45);background:rgba(124,92,252,0.05);}
        .persona-search input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:#f4f1ff;font:12px 'Manrope',sans-serif;}
        .persona-search input::placeholder{color:#686777;}
        .persona-search-clear{display:flex;align-items:center;justify-content:center;border:0;background:transparent;color:#858596;cursor:pointer;padding:3px;}
        .persona-category-note{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;min-height:30px;}
        .persona-category-note p{font-size:12px;line-height:1.6;color:#747383;}
        .persona-category-note span{font-size:10px;letter-spacing:.5px;color:#777687;text-transform:uppercase;white-space:nowrap;}
        .av-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(205px,1fr));gap:16px;}
        .av-card{display:block;text-align:left;padding:0;width:100%;font:inherit;font-family:'Manrope',sans-serif;color:inherit;background:#0b0b10;border:1px solid rgba(255,255,255,0.075);border-radius:17px;overflow:hidden;cursor:pointer;transition:border-color 0.15s,background .15s;content-visibility:auto;contain-intrinsic-size:auto 390px;appearance:none;}
        .av-card:hover{background:#111016;border-color:rgba(255,255,255,0.18);}
        .av-img{width:100%;aspect-ratio:1;object-fit:cover;display:block;border-bottom:1px solid rgba(255,255,255,0.05);}
        .av-fallback{width:100%;aspect-ratio:1;display:flex;align-items:center;justify-content:center;color:#fff;font-size:44px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.05);}
        .av-info{display:block;padding:16px;}
        .av-name,.av-sub{display:block;}
        .av-name{font-size:14px;font-weight:700;color:#f7f6fb;margin-bottom:5px;}
        .av-sub{font-size:11px;color:#858494;line-height:1.5;min-height:33px;}
        .av-cta{display:flex;align-items:center;justify-content:space-between;color:#a99bdb;font-size:10px;font-weight:700;margin-top:14px;}
        .av-card:hover .av-cta,.pro-card:hover .av-cta{color:#d5caff;}
        .av-card:focus-visible,.pro-card:focus-visible{outline:2px solid #a78bfa;outline-offset:3px;}
        .pro-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:13px;}
        @media(max-width:640px){.pro-grid{grid-template-columns:1fr;}.av-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}.av-info{padding:12px;}.av-sub{font-size:10px;}.av-cta{font-size:9px;margin-top:11px;}.pro-card{padding:13px;gap:12px;}.pro-img-wrap{width:64px;height:64px;}.persona-category-note span{font-size:9px;}}
        .pro-card{width:100%;text-align:left;color:inherit;font:inherit;font-family:'Manrope',sans-serif;background:rgba(11,11,16,0.82);border:1px solid rgba(255,255,255,0.075);border-radius:17px;padding:16px;display:flex;align-items:center;gap:16px;cursor:pointer;transition:transform 0.2s,border-color 0.2s,background .2s;content-visibility:auto;contain-intrinsic-size:130px;appearance:none;}
        .pro-card:hover{background:rgba(18,18,26,0.9);border-color:rgba(255,255,255,0.15);transform:translateY(-3px);}
        .pro-img-wrap{display:block;width:80px;height:80px;border-radius:16px;overflow:hidden;flex-shrink:0;position:relative;}
        .pro-img{width:100%;height:100%;object-fit:cover;}
        .pro-info{display:block;flex:1;min-width:0;}
        .pro-tag{display:block;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;}
        .pro-name{display:block;font-size:15px;font-weight:700;color:#f7f6fb;margin-bottom:5px;}
        .pro-desc{display:block;font-size:11.5px;color:#858494;line-height:1.5;}
        .persona-empty{grid-column:1/-1;padding:34px 20px;text-align:center;border:1px dashed rgba(255,255,255,0.12);border-radius:16px;color:#858494;font-size:13px;}

        /* ── COUNCIL OF MINDS ── */
        .council-wrap{flex:1;overflow-y:auto;padding:48px 28px;}
        .council-inner{max-width:1120px;margin:0 auto;}
        .council-header{text-align:center;margin:0 auto 30px;max-width:700px;}
        .council-eyebrow{display:inline-flex;align-items:center;gap:7px;color:#b8a8ff;background:rgba(124,92,252,0.1);border:1px solid rgba(124,92,252,0.2);border-radius:99px;padding:6px 11px;font-size:10px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;margin-bottom:16px;}
        .council-title{display:flex;align-items:center;justify-content:center;gap:11px;font-size:clamp(28px,4vw,40px);font-weight:750;color:#fff;letter-spacing:-1.4px;margin-bottom:10px;}
        .council-title .mv-icon{color:#b8a8ff;width:26px;height:26px;}
        .council-sub{font-size:15px;color:#858596;line-height:1.7;}
        .council-flow{display:flex;align-items:center;justify-content:center;gap:9px;margin-top:22px;flex-wrap:wrap;}
        .council-flow-step{display:flex;align-items:center;gap:7px;color:#b8b8c8;font-size:11px;font-weight:650;background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.07);padding:8px 11px;border-radius:99px;}
        .council-flow-step .mv-icon{color:var(--step-color,#b8a8ff);}
        .council-flow-arrow{color:#454552;font-size:12px;}
        .council-input-wrap{background:linear-gradient(145deg,rgba(18,16,29,0.96),rgba(9,9,14,0.96));border:1px solid rgba(167,139,250,0.2);border-radius:22px;padding:22px;margin:0 auto 30px;max-width:900px;box-shadow:0 18px 60px rgba(0,0,0,0.22);}
        .council-input-label{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;color:#e7e5f2;font-size:13px;font-weight:700;}
        .council-input-label span:last-child{font-size:11px;font-weight:500;color:#666675;}
        .council-ta{width:100%;background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:15px 16px;outline:none;color:#fff;font-size:15px;font-family:'Manrope';resize:vertical;line-height:1.65;min-height:94px;max-height:240px;transition:border-color .18s,box-shadow .18s;}
        .council-ta:focus{border-color:rgba(167,139,250,0.55);box-shadow:0 0 0 3px rgba(124,92,252,0.1);}
        .council-ta::placeholder{color:#656474;}
        .council-prompts{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:13px;}
        .council-prompt-label{font-size:11px;color:#777687;margin-right:2px;}
        .council-prompt{border:1px solid rgba(255,255,255,0.09);background:rgba(255,255,255,0.035);color:#bdbbc9;border-radius:99px;padding:7px 10px;font:500 11px 'Manrope',sans-serif;cursor:pointer;transition:background .18s,border-color .18s,color .18s;}
        .council-prompt:hover:not(:disabled){background:rgba(124,92,252,0.12);border-color:rgba(167,139,250,0.35);color:#fff;}
        .council-prompt:disabled{opacity:.45;cursor:not-allowed;}
        .council-customize{margin-top:16px;border-top:1px solid rgba(255,255,255,0.07);padding-top:13px;}
        .council-customize summary{display:flex;align-items:center;gap:8px;color:#a9a6b8;font-size:11px;font-weight:650;cursor:pointer;list-style:none;width:fit-content;}
        .council-customize summary::-webkit-details-marker{display:none;}
        .council-customize summary::after{content:'＋';color:#858197;font-size:13px;margin-left:2px;}
        .council-customize[open] summary::after{content:'−';}
        .council-customize summary:hover{color:#e2def0;}
        .council-options{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;}
        .council-option-label{display:block;color:#d3d0df;font-size:11px;font-weight:700;margin-bottom:8px;}
        .council-choice-row{display:flex;gap:6px;flex-wrap:wrap;}
        .council-choice{border:1px solid rgba(255,255,255,0.09);border-radius:9px;padding:7px 10px;background:rgba(255,255,255,0.025);color:#9997a7;font:500 11px 'Manrope',sans-serif;cursor:pointer;transition:all .16s;}
        .council-choice:hover{border-color:rgba(167,139,250,0.3);color:#e5e1f2;}
        .council-choice.active{background:rgba(124,92,252,0.15);border-color:rgba(167,139,250,0.38);color:#e5dcff;}
        .council-focus-wrap{grid-column:1/-1;}
        .council-focus{width:100%;min-height:68px;resize:vertical;border:1px solid rgba(255,255,255,0.08);border-radius:11px;padding:10px 12px;background:rgba(0,0,0,0.18);color:#f2f0f8;font:12px/1.6 'Manrope',sans-serif;outline:none;}
        .council-focus:focus{border-color:rgba(167,139,250,0.45);box-shadow:0 0 0 3px rgba(124,92,252,0.08);}
        .council-focus::placeholder{color:#666474;}
        .council-actions{display:flex;align-items:center;justify-content:space-between;margin-top:18px;gap:12px;}
        .council-shortcut{font-size:11px;color:#777687;}
        .council-btn{background:#f4f1ff;color:#171222;border:1px solid rgba(255,255,255,0.7);border-radius:12px;padding:11px 16px;font-size:12px;font-weight:750;cursor:pointer;font-family:'Manrope';transition:transform .18s,background .18s;display:flex;align-items:center;gap:9px;}
        .council-btn:hover:not(:disabled){background:#fff;transform:translateY(-1px);}
        .council-btn:disabled{opacity:0.45;cursor:not-allowed;transform:none;}
        .council-results{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;}
        .council-question-summary{grid-column:1/-1;display:flex;align-items:flex-start;gap:10px;padding:2px 3px 8px;color:#858596;font-size:12px;line-height:1.6;}
        .council-question-summary .mv-icon{color:#a78bfa;flex-shrink:0;margin-top:2px;}
        .council-question-summary strong{color:#d8d5e5;font-weight:600;}
        .council-card{background:linear-gradient(155deg,rgba(17,17,24,0.96),rgba(10,10,14,0.94));border:1px solid rgba(255,255,255,0.08);border-radius:18px;overflow:hidden;animation:slideIn 0.3s ease;min-width:0;}
        .council-card-head{display:flex;align-items:center;gap:12px;padding:16px 17px;border-bottom:1px solid rgba(255,255,255,0.06);}
        .council-icon{width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;}
        .council-card-name{font-size:13px;font-weight:750;color:#fff;}
        .council-card-label{font-size:10px;color:#777687;margin-top:3px;}
        .council-card-body{padding:17px;font-size:13px;color:#b4b3c0;line-height:1.8;overflow-wrap:anywhere;}
        .council-card-body p{margin:0 0 10px;}
        .council-card-body p:last-child{margin-bottom:0;}
        .council-card-body ul,.council-card-body ol{padding-left:19px;margin:8px 0;}
        .council-synthesis{grid-column:1/-1;background:linear-gradient(120deg,rgba(124,92,252,0.12),rgba(23,18,39,0.8));border:1px solid rgba(167,139,250,0.3);border-radius:20px;padding:22px 24px;margin-top:4px;}
        .council-synth-label{display:flex;align-items:center;gap:8px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1.15px;color:#c3b4ff;margin-bottom:12px;}
        .council-synth-body{font-size:14px;color:#e1dcf6;line-height:1.85;}
        .council-synth-body p{margin:0 0 10px;}
        .council-synth-body p:last-child{margin-bottom:0;}
        .council-loading{display:flex;align-items:center;gap:12px;padding:12px 0 2px;color:#a6a2b6;font-size:12px;}
        .council-progress{max-width:900px;margin:-8px auto 24px;padding:17px 19px;border:1px solid rgba(167,139,250,0.2);border-radius:15px;background:rgba(124,92,252,0.07);color:#aaa8b8;font-size:12px;line-height:1.6;}
        .council-progress strong{display:block;color:#e2def0;font-size:13px;margin-bottom:3px;}
        .council-next{grid-column:1/-1;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:9px;padding:2px 0 36px;}
        .council-next .qa-chip{display:flex;align-items:center;gap:7px;}
        .council-result-action{display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(255,255,255,.035);padding:9px 13px;color:#d8d4e2;font:600 11px 'Manrope',sans-serif;cursor:pointer;transition:background .18s,border-color .18s;}
        .council-result-action:hover:not(:disabled){background:rgba(167,139,250,.12);border-color:rgba(167,139,250,.32);}
        .council-result-action:disabled{opacity:.55;cursor:default;}
        .council-feedback{flex-basis:100%;min-height:14px;text-align:center;color:#a99dd1;font-size:11px;}
        @media(max-width:900px){.council-results{grid-template-columns:1fr;}.council-card{display:grid;grid-template-columns:210px minmax(0,1fr);}.council-card-head{border-bottom:0;border-right:1px solid rgba(255,255,255,0.06);align-items:flex-start;}.council-synthesis{grid-column:auto;}}
        @media(max-width:600px){.council-wrap{padding:28px 15px;}.council-header{margin-bottom:23px;}.council-title{letter-spacing:-.8px;}.council-sub{font-size:13px;}.council-flow{gap:6px;margin-top:17px;}.council-flow-step{font-size:10px;padding:7px 9px;}.council-flow-arrow{font-size:10px;}.council-input-wrap{padding:15px;border-radius:18px;margin-bottom:22px;}.council-ta{font-size:14px;min-height:110px;}.council-options{grid-template-columns:1fr;gap:14px;}.council-focus-wrap{grid-column:auto;}.council-actions{align-items:flex-end;}.council-shortcut{max-width:110px;line-height:1.5;}.council-btn{padding:10px 12px;font-size:11px;}.council-card{display:block;}.council-card-head{border-right:0;border-bottom:1px solid rgba(255,255,255,0.06);}.council-synthesis{padding:18px;}}
        @keyframes slideIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}

        /* ── EMPTY STATE ── */
        .empty-wrap{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 24px;}
        .empty-input-container{width:100%;max-width:780px;}
        .mansh-toggle{display:flex;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:99px;width:fit-content;margin:0 auto 28px;padding:4px;}
        .mtoggle-opt{padding:9px 22px;border-radius:99px;font-size:13.5px;font-weight:600;color:#555;cursor:pointer;transition:0.2s;display:flex;align-items:center;gap:8px;font-family:'Manrope';}
        .mtoggle-opt.active{background:rgba(255,255,255,0.09);color:#fff;border:1px solid rgba(255,255,255,0.09);}
        .input-pill{background:#0a0a0f;backdrop-filter:none;-webkit-backdrop-filter:none;border:1px solid rgba(255,255,255,0.11);border-radius:24px;padding:14px 18px;display:flex;align-items:flex-end;gap:12px;transition:border-color 0.15s;box-shadow:0 4px 16px rgba(0,0,0,0.28);}
        .input-pill:focus-within{border-color:rgba(255,255,255,0.24);box-shadow:0 8px 32px var(--atm-glow);}
        .input-pill.shadow-pill{border-color:rgba(249,115,22,0.35);box-shadow:0 8px 32px rgba(249,115,22,0.12);}
        .input-pill.shadow-pill:focus-within{border-color:rgba(249,115,22,0.6);box-shadow:0 8px 32px rgba(249,115,22,0.2);}
        .input-ta{flex:1;background:transparent;border:none;outline:none;color:#fff;font-size:15px;font-family:'Manrope';resize:none;max-height:200px;line-height:1.6;min-height:24px;}
        .input-ta::placeholder{color:#333;}
        .input-actions{display:flex;align-items:center;gap:8px;flex-shrink:0;}
        .input-icon-btn{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);border-radius:9px;padding:9px;color:#888;cursor:pointer;transition:0.2s;display:flex;}
        .input-icon-btn:hover{background:rgba(255,255,255,0.1);color:#fff;}
        .send-btn{width:38px;height:38px;background:#fff;border:none;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s;flex-shrink:0;color:#000;}
        .send-btn:hover:not(:disabled){transform:scale(1.08);box-shadow:0 4px 16px rgba(255,255,255,0.2);}
        .send-btn:disabled{background:rgba(255,255,255,0.08);color:#444;cursor:not-allowed;}
        .img-chip{display:flex;align-items:center;gap:8px;padding:8px 14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.09);border-radius:10px;font-size:12.5px;color:#bbb;margin-bottom:10px;width:fit-content;}
        .img-chip-rm{background:none;border:none;color:#888;cursor:pointer;font-size:13px;transition:0.15s;}
        .img-chip-rm:hover{color:#fca5a5;}
        .quick-actions{display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap;}
        .compact-quick-actions{display:flex;gap:8px;justify-content:flex-start;margin-top:10px;padding:0 2px;flex-wrap:wrap;}
        .qa-chip{background:#0a0a0f;backdrop-filter:none;border:1px solid rgba(255,255,255,0.09);border-radius:99px;padding:10px 20px;font-size:12.5px;color:#888;cursor:pointer;display:flex;align-items:center;gap:8px;transition:background 0.15s,border-color 0.15s;font-weight:500;font-family:'Manrope';}
        .qa-chip:hover{background:rgba(255,255,255,0.06);color:#fff;border-color:rgba(255,255,255,0.16);}
        .qa-chip:disabled{opacity:0.5;cursor:not-allowed;}
        .qa-chip-active-red{color:#f97316;border-color:rgba(249,115,22,0.4);background:rgba(249,115,22,0.07);}
        .qa-chip-active-red:hover{background:rgba(249,115,22,0.12);color:#fb923c;}

        /* ── SHADOW MODE BANNER ── */
        .shadow-banner{
          display:flex;align-items:center;gap:10px;
          padding:10px 16px;
          background:rgba(249,115,22,0.07);
          border:1px solid rgba(249,115,22,0.25);
          border-radius:12px;
          font-size:13px;color:#f97316;
          margin-bottom:10px;
        }
        .shadow-banner button{margin-left:auto;background:rgba(249,115,22,0.12);border:1px solid rgba(249,115,22,0.3);border-radius:7px;padding:4px 12px;font-size:11.5px;color:#f97316;cursor:pointer;font-family:'Manrope';font-weight:600;white-space:nowrap;}

        /* ── MESSAGES ── */
        .msgs-wrap{flex:1;overflow-y:auto;padding:20px 0;scroll-behavior:auto;overscroll-behavior:contain;}
        .gallery,.council-wrap,.msgs-wrap,.sb-body{-webkit-overflow-scrolling:touch;overscroll-behavior:contain;}
        .msgs-inner{max-width:820px;margin:0 auto;padding:0 24px;}
        .msg{margin-bottom:28px;content-visibility:auto;contain-intrinsic-size:auto 220px;}
        .msg-head{display:flex;align-items:center;gap:12px;margin-bottom:10px;}
        .msg-av{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;}
        .msg-name{font-size:14px;font-weight:600;color:#ccc;}
        .msg-body{font-size:15px;line-height:1.82;color:#b0b8c8;padding-left:40px;}
        .msg-body.user{color:#d8dce8;}
        .msg-body p{margin-bottom:10px;}
        .msg-body p:last-child{margin-bottom:0;}
        .msg-body code{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.09);border-radius:5px;padding:2px 7px;font-size:13px;color:#a78bfa;font-family:monospace;}
        .msg-body pre{background:rgba(10,10,15,0.9);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:20px;overflow-x:auto;margin:0;}
        .msg-body pre code{background:none;border:none;padding:0;color:#c8d0e0;font-size:13.5px;}
        .msg-body h1,.msg-body h2,.msg-body h3{color:#eee;font-weight:600;margin:20px 0 8px;}
        .msg-body h1{font-size:20px;}.msg-body h2{font-size:17px;}.msg-body h3{font-size:15px;}
        .msg-body ul,.msg-body ol{padding-left:24px;margin-bottom:10px;}
        .msg-body li{margin-bottom:5px;color:#9aa0b0;}
        .msg-body strong{color:#d8dce8;font-weight:600;}
        .msg-body table{width:100%;border-collapse:collapse;margin:14px 0;font-size:13.5px;}
        .msg-body th{padding:10px 14px;text-align:left;border-bottom:1px solid rgba(255,255,255,0.08);color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;}
        .msg-body td{padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.04);color:#9aa0b0;}
        .msg-body .katex{color:#c8b8ff;font-size:1em;}
        .msg-body .katex-display{margin:16px 0;}
        .think-summary{font-size:11.5px;color:#444;cursor:pointer;padding:6px 12px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;display:inline-flex;align-items:center;gap:7px;margin-bottom:12px;list-style:none;transition:0.15s;}
        .think-summary:hover{border-color:rgba(255,255,255,0.12);color:#777;}
        .think-body{padding:12px 16px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-left:2px solid rgba(255,255,255,0.1);border-radius:10px;font-size:13px;color:#444;line-height:1.7;font-style:italic;margin-top:8px;margin-bottom:12px;}
        .routing-chip{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;background:rgba(250,204,21,0.06);border:1px solid rgba(250,204,21,0.2);border-radius:10px;color:#fbbf24;font-size:13px;font-style:italic;margin-bottom:24px;margin-left:40px;flex-wrap:wrap;}
        .msg-cursor{display:inline-block;width:2px;height:1.1em;background:#a78bfa;animation:blink 1s infinite;margin-left:2px;vertical-align:text-bottom;}
        .msg-actions{display:flex;gap:6px;padding-left:40px;margin-top:8px;opacity:0;transition:0.2s;}
        .msg:hover .msg-actions{opacity:1;}
        .act-btn{background:transparent;border:1px solid rgba(255,255,255,0.07);border-radius:6px;padding:4px 11px;font-size:11.5px;color:#555;cursor:pointer;font-family:'Manrope';transition:0.15s;}
        .act-btn:hover{border-color:rgba(255,255,255,0.15);color:#bbb;}
        .act-btn.ok{color:#4ade80;border-color:rgba(74,222,128,0.3);}
        @keyframes blink{0%,100%{opacity:1;}50%{opacity:0;}}
        .typing-wrap{padding-left:40px;display:flex;gap:5px;align-items:center;padding-top:4px;}
        .t-dot{width:5px;height:5px;border-radius:50%;background:#444;animation:bounce 1.4s infinite;}
        .t-dot:nth-child(2){animation-delay:0.15s;}
        .t-dot:nth-child(3){animation-delay:0.3s;}
        @keyframes bounce{0%,60%,100%{transform:translateY(0);}30%{transform:translateY(-7px);background:#666;}}

        /* ── CHAT INPUT BOTTOM ── */
        .chat-input-wrap{padding:0 24px 28px;flex-shrink:0;}

        /* ── OVERLAYS ── */
        .overlay{position:fixed;inset:0;background:rgba(0,0,5,0.88);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);display:flex;align-items:center;justify-content:center;z-index:600;padding:20px;}
        @keyframes dlg{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        .modal{background:rgba(8,8,14,0.97);border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:36px;max-width:600px;width:100%;animation:dlg 0.25s cubic-bezier(0.16,1,0.3,1);max-height:90vh;overflow-y:auto;}
        .modal::-webkit-scrollbar{width:4px;}
        .modal::-webkit-scrollbar-thumb{background:#222;border-radius:4px;}
        .persona-modal{max-width:760px;padding:28px;}
        .persona-form-head{position:relative;padding:2px 44px 20px 0;border-bottom:1px solid rgba(255,255,255,0.07);margin-bottom:18px;}
        .persona-form-icon{width:43px;height:43px;display:flex;align-items:center;justify-content:center;border-radius:13px;margin-bottom:15px;}
        .persona-form-eyebrow{font-size:9px;text-transform:uppercase;letter-spacing:1.25px;font-weight:800;color:#a99bdb;margin-bottom:8px;}
        .persona-modal .modal-title{font-size:23px;margin-bottom:7px;}
        .persona-modal .modal-sub{font-size:12px;color:#9291a0;margin-bottom:0;max-width:590px;}
        .persona-close{position:absolute;right:0;top:0;width:34px;height:34px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#999;cursor:pointer;}
        .persona-form-note{display:flex;align-items:flex-start;gap:9px;padding:11px 12px;border:1px solid rgba(167,139,250,0.16);border-radius:11px;background:rgba(124,92,252,0.06);color:#a9a6b7;font-size:11px;line-height:1.55;margin-bottom:18px;}
        .persona-form-note .mv-icon{flex-shrink:0;color:#b9a9fa;margin-top:1px;}
        .persona-form-progress{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#767585;font-size:10px;margin:0 0 14px;}
        .persona-form-progress strong{color:#bab8c7;font-weight:650;}
        .persona-form-progress-track{height:3px;background:rgba(255,255,255,0.07);border-radius:99px;overflow:hidden;margin-top:7px;}
        .persona-form-progress-fill{height:100%;background:linear-gradient(90deg,#7c5cfc,#c2b5ff);border-radius:inherit;transition:width .2s;}
        .modal-title{font-size:24px;font-weight:700;color:#fff;margin-bottom:8px;letter-spacing:-0.5px;}
        .modal-sub{font-size:14px;color:#555;margin-bottom:28px;line-height:1.6;}
        .form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px 13px;}
        .form-group{display:flex;min-width:0;flex-direction:column;gap:6px;}
        .form-group-half{grid-column:span 1;}
        .form-group-full{grid-column:1/-1;}
        .form-label{display:flex;align-items:center;gap:6px;font-size:10px;font-weight:700;color:#aaa8b7;letter-spacing:0.2px;}
        .form-optional{font-size:9px;font-weight:500;color:#696877;}
        .form-help{font-size:10px;line-height:1.45;color:#747382;}
        .form-input{width:100%;min-width:0;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:11px;padding:11px 12px;color:#f3f1f9;font-size:12px;outline:none;font-family:'Manrope';transition:border-color 0.2s,background .2s;}
        .form-input:focus{border-color:rgba(108,71,255,0.6);}
        .form-input::placeholder{color:#696877;}
        .form-select{appearance:none;color-scheme:dark;cursor:pointer;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;padding-right:36px;}
        .form-select option{background-color:#11111a;color:#f3f1f9;}
        .form-select option:disabled{color:#858494;}
        .form-btns{display:flex;align-items:center;gap:10px;margin-top:22px;}
        .persona-reset{margin-right:auto;border:0;background:transparent;color:#777687;font:500 11px 'Manrope',sans-serif;cursor:pointer;padding:8px 2px;}
        .persona-reset:hover:not(:disabled){color:#d0c8ff;}
        .persona-reset:disabled{opacity:.35;cursor:default;}
        .btn-primary{flex:2;background:#fff;color:#000;border:none;border-radius:12px;padding:14px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Manrope';transition:opacity 0.2s;}
        .btn-primary:hover{opacity:0.9;}
        .btn-secondary{flex:1;background:transparent;color:#666;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:14px;font-size:14px;cursor:pointer;font-family:'Manrope';transition:all 0.2s;}
        .btn-secondary:hover{border-color:rgba(255,255,255,0.2);color:#bbb;}
        .persona-modal .btn-primary{background:#f2efff;color:#171222;padding:13px 14px;font-size:13px;font-weight:750;transition:opacity .2s,transform .18s;}
        .persona-modal .btn-primary:hover{transform:translateY(-1px);}
        .persona-modal .btn-secondary{color:#aaa8b7;padding:13px 14px;font-size:12px;}

        /* ── UPGRADE MODAL ── */
        .upg-modal{background:rgba(8,8,14,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:28px;padding:48px;max-width:820px;width:100%;animation:dlg 0.25s cubic-bezier(0.16,1,0.3,1);position:relative;}
        .upg-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
        @media(max-width:600px){.upg-grid{grid-template-columns:1fr;}}
        .upg-card{background:rgba(16,16,22,0.8);border:1px solid rgba(255,255,255,0.07);border-radius:20px;padding:36px 28px;display:flex;flex-direction:column;gap:0;}
        .upg-card.hl{background:rgba(22,12,44,0.8);border-color:rgba(124,92,252,0.4);}
        .upg-price{font-size:44px;font-weight:700;color:#fff;margin-bottom:4px;}
        .upg-period{font-size:15px;color:#555;}
        .upg-features{margin:24px 0;display:flex;flex-direction:column;gap:12px;flex:1;}
        .upg-feat{display:flex;align-items:center;gap:10px;font-size:14px;color:#ccc;}
        .upg-check{font-size:14px;color:#4ade80;}
        .upg-check.purple{color:#a78bfa;}
        .upg-btn{width:100%;padding:15px;border:none;border-radius:12px;background:#fff;color:#000;font-size:15px;font-weight:700;cursor:pointer;font-family:'Manrope';transition:opacity 0.2s;margin-top:auto;}
        .upg-btn:hover{opacity:0.88;}
        .upg-btn.purple{background:#a78bfa;color:#000;}
        .upg-note{text-align:center;font-size:11.5px;color:#333;margin-top:20px;}

        /* ── CONFIRM DIALOG ── */
        .dlg{background:rgba(8,8,14,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:28px;max-width:380px;width:100%;animation:dlg 0.2s cubic-bezier(0.16,1,0.3,1);}
        .dlg h3{font-size:16px;font-weight:600;color:#eee;margin-bottom:8px;}
        .dlg p{font-size:13.5px;color:#555;line-height:1.6;margin-bottom:22px;}
        .dlg-btns{display:flex;gap:8px;justify-content:flex-end;}
        .dlg-cancel{background:transparent;border:1px solid rgba(255,255,255,0.08);border-radius:9px;padding:9px 16px;font-size:13px;color:#555;cursor:pointer;font-family:'Manrope';transition:all 0.15s;}
        .dlg-cancel:hover{color:#bbb;border-color:rgba(255,255,255,0.15);}
        .dlg-del{background:#7f1d1d;border:none;border-radius:9px;padding:9px 16px;font-size:13px;color:#fca5a5;cursor:pointer;font-family:'Manrope';font-weight:600;transition:0.15s;}
        .dlg-del:hover{background:#991b1b;}

        /* ── PROMPT EDITOR ── */
        .pe-modal{background:rgba(8,8,14,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:28px;max-width:540px;width:100%;animation:dlg 0.2s cubic-bezier(0.16,1,0.3,1);}
        .pe-ta{width:100%;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:14px;font-size:13.5px;font-family:'Manrope';color:#ccc;outline:none;resize:vertical;min-height:180px;line-height:1.65;transition:border-color 0.2s;}
        .pe-ta:focus{border-color:rgba(108,71,255,0.5);}
        .pe-ta::placeholder{color:#282828;}

        @media(max-width:800px){
          .persona-modal{padding:22px 18px;}
          .form-grid{grid-template-columns:1fr;}
          .form-group-half,.form-group-full{grid-column:1/-1;}
          .persona-form-head{padding-bottom:16px;}
          .form-btns{flex-wrap:wrap;}
          .persona-reset{flex-basis:100%;text-align:left;}
          .msgs-inner{padding:0 16px;}
          .chat-input-wrap{padding:0 16px 24px;}
          .topbar{gap:10px;}
          .mdrop-btn{padding:7px 12px;font-size:13px;}
          .gallery{padding:32px 16px;}
          .gallery-heading-row{align-items:flex-start;flex-direction:column;gap:9px;}
          .gallery-count{padding:0;}
          .gallery-controls{align-items:stretch;flex-direction:column;}
          .persona-search{max-width:none;}
          .persona-tabs{width:100%;}
          .ptab{flex:1;justify-content:center;padding:9px 10px;font-size:11px;}
          .av-grid{grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;}
          .pro-grid{grid-template-columns:1fr;}
          .persona-category-note{align-items:flex-start;}
          .upg-modal{padding:28px 20px;}
          .council-wrap{padding:24px 16px;}
        }
` , [atm.accent, atm.glow, atm.starDur]);

  return (
    <>
      <style>{chatStyles}</style>

      {/* — STARFIELD — */}
      <div className={`starfield ${view === "personas" ? "starfield-static" : ""}`}>
        {STARS.map(s=><div key={s.id} className="star" style={{left:s.left,top:s.top,width:s.w,height:s.w,animationDuration:`${parseFloat(s.dur) * parseFloat(atm.starDur)}s`,animationDelay:s.delay,opacity:s.op}}/>)}
      </div>

      {/* — DELETE CONFIRM — */}
      {deleteConfirm && (
        <div className="overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="dlg" onClick={e => e.stopPropagation()}>
            <h3>Delete conversation?</h3>
            <p>"{deleteConfirm.title}" will be permanently deleted.</p>
            <div className="dlg-btns">
              <button className="dlg-cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="dlg-del" onClick={executeDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {artifact && <ArtifactStudio artifact={artifact} setArtifact={setArtifact} artifactEditing={artifactEditing} setArtifactEditing={setArtifactEditing} artifactFile={artifactFile} setArtifactFile={setArtifactFile} artifactPreviewRef={artifactPreviewRef} exportArtifact={exportArtifact} saveArtifact={saveArtifact} artifactSaving={artifactSaving} versions={artifactVersions} versionsLoading={artifactVersionsLoading} onRestoreVersion={restoreArtifactVersion} onClose={() => setArtifact(null)}/>}

      {/* ── PERSONA ONBOARDING ── */}
      {onboardingPersona && onboardingPersona.fields?.length > 0 && (
        <div className="overlay" onClick={() => setOnboardingPersona(null)}>
          <div className="modal persona-modal" role="dialog" aria-modal="true" aria-labelledby="persona-modal-title" onClick={e => e.stopPropagation()}>
            <div className="persona-form-head">
              <div className="persona-form-icon" style={{ background: `${onboardingPersona.color}18`, border: `1px solid ${onboardingPersona.color}38`, color: onboardingPersona.color }}><AppIcon name={onboardingPersona.id} size={20}/></div>
              <div className="persona-form-eyebrow">Personalize your first session</div>
              <div className="modal-title" id="persona-modal-title">{onboardingPersona.label}</div>
              <div className="modal-sub">{onboardingPersona.desc}</div>
              <button type="button" className="persona-close" aria-label="Close setup" onClick={() => setOnboardingPersona(null)}><AppIcon name="close" size={15}/></button>
            </div>
            <div className="persona-form-note"><AppIcon name="sparkles" size={14}/><span>These details help tailor the first reply. Every field is optional, and only answers you fill in are added to the chat context.</span></div>
            <div className="persona-form-progress">
              <span><strong>{onboardingAnsweredCount} of {onboardingFieldCount}</strong> fields filled in</span>
              <span>Optional setup</span>
            </div>
            <div className="persona-form-progress-track"><div className="persona-form-progress-fill" style={{ width: `${onboardingFieldCount ? (onboardingAnsweredCount / onboardingFieldCount) * 100 : 0}%` }}/></div>
            <div className="form-grid">
              {onboardingPersona.fields.map(f => (
                <div key={f.id} className={`form-group ${f.width === "half" ? "form-group-half" : "form-group-full"}`}>
                  <label className="form-label" htmlFor={`persona-field-${f.id}`}>{f.label}<span className="form-optional">Optional</span></label>
                  {f.type === "textarea" ? (
                    <textarea id={`persona-field-${f.id}`} className="form-input" rows={f.rows || 3} placeholder={f.placeholder || `Add details about ${f.label.toLowerCase()}…`} value={personaFormData[f.id]||""} onChange={e => setPersonaFormData({...personaFormData,[f.id]:e.target.value})} style={{resize:"vertical"}}/>
                  ) : f.type === "select" ? (
                    <select id={`persona-field-${f.id}`} className="form-input form-select" value={personaFormData[f.id]||""} onChange={e => setPersonaFormData({...personaFormData,[f.id]:e.target.value})}>
                      <option value="">Choose an option…</option>
                      {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input id={`persona-field-${f.id}`} className="form-input" type={f.type === "number" ? "number" : "text"} placeholder={f.placeholder || PERSONA_FIELD_PLACEHOLDERS[f.id] || `Enter ${f.label.toLowerCase()}…`} value={personaFormData[f.id]||""} onChange={e => setPersonaFormData({...personaFormData,[f.id]:e.target.value})}/>
                  )}
                  {f.help && <span className="form-help">{f.help}</span>}
                </div>
              ))}
            </div>
            <div className="form-btns">
              <button type="button" className="persona-reset" onClick={() => setPersonaFormData({})} disabled={!onboardingAnsweredCount}>Clear answers</button>
              <button type="button" className="btn-secondary" onClick={() => setOnboardingPersona(null)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={() => startPersonaChat(onboardingPersona, personaFormData)}>Start session <span aria-hidden="true">→</span></button>
            </div>
          </div>
        </div>
      )}

      {/* ── UPGRADE MODAL ── */}
      {showUpgrade && (
        <div className="overlay" onClick={() => { if (!paidConfirmed) setShowUpgrade(false); }}>
          <div className="upg-modal" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowUpgrade(false)} style={{ position:"absolute", top:"20px", right:"24px", background:"none", border:"none", color:"#555", fontSize:"24px", cursor:"pointer" }}>×</button>
            {paidConfirmed ? (
              <div style={{ textAlign:"center", padding:"32px 0" }}>
                <AppIcon className="upgrade-success-icon" name="check" size={48}/>
                <div style={{ fontSize:"24px", fontWeight:700, color:"#4ade80", marginBottom:"12px" }}>Request Sent</div>
                <div style={{ fontSize:"14px", color:"#555", lineHeight:1.8, maxWidth:"460px", margin:"0 auto" }}>Your upgrade request is now visible in the creator dashboard.<br/>Send the payment screenshot to <span style={{color:"#fff"}}>{SUPPORT_EMAIL}</span> from your registered email.</div>
                <button className="btn-primary" style={{ maxWidth:"200px", margin:"32px auto 0" }} onClick={() => { setShowUpgrade(false); setPaidConfirmed(false); }}>Got it</button>
              </div>
            ) : (
              <>
                <div style={{ textAlign:"center", marginBottom:"36px" }}>
                  <div style={{ fontSize:"28px", fontWeight:700, color:"#fff", marginBottom:"8px" }}>Upgrade Manshverse</div>
                  <div style={{ fontSize:"14px", color:"#555" }}>Unlock higher limits and premium features</div>
                  {upgradeReason && <div style={{ marginTop:"12px", color:"#c6a9ff", fontSize:"12px" }}>{upgradeReason}</div>}
                </div>
                <div className="upg-grid">
                  <div className="upg-card">
                    <div className="upg-price">₹199<span className="upg-period">/mo</span></div>
                    <div style={{ color:"#555", fontSize:"12px", marginBottom:"20px" }}>Monthly billing</div>
                    <div className="upg-features">
                      <div className="upg-feat"><span className="upg-check"><AppIcon name="check" size={12}/></span> Higher daily model limits</div>
                      <div className="upg-feat"><span className="upg-check"><AppIcon name="check" size={12}/></span> Access to all available models</div>
                      <div className="upg-feat"><span className="upg-check"><AppIcon name="check" size={12}/></span> Automatic model routing</div>
                      <div className="upg-feat"><span className="upg-check"><AppIcon name="check" size={12}/></span> All personas unlocked</div>
                    </div>
                    <button className="upg-btn" onClick={() => submitUpgrade("pro")} disabled={submitting}>{submitting ? "Sending..." : "Get Monthly Plan"}</button>
                  </div>
                  <div className="upg-card hl">
                    <div className="upg-price">₹1,999<span className="upg-period">/yr</span></div>
                    <div style={{ color:"#a78bfa", fontSize:"12px", fontWeight:600, marginBottom:"20px" }}>Save ₹389 — Best Value</div>
                    <div className="upg-features">
                      <div className="upg-feat"><span className="upg-check purple"><AppIcon name="check" size={12}/></span> Higher daily limits across models</div>
                      <div className="upg-feat"><span className="upg-check purple"><AppIcon name="check" size={12}/></span> Unlimited usage where available</div>
                      <div className="upg-feat"><span className="upg-check purple"><AppIcon name="check" size={12}/></span> Priority on all models</div>
                      <div className="upg-feat"><span className="upg-check purple"><AppIcon name="check" size={12}/></span> Free future model upgrades</div>
                    </div>
                    <button className="upg-btn purple" onClick={() => submitUpgrade("ultra")} disabled={submitting}>{submitting ? "Sending..." : "Get Yearly Plan"}</button>
                  </div>
                </div>
                <div className="upg-note">Manual UPI request · <span style={{color:"#888"}}>{UPI_ID}</span> · Your plan stays unchanged until payment and request are reviewed and confirmed. We aim to respond within a few hours.</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── PROMPT EDITOR ── */}
      {showPromptEditor && isCreator && (
        <div className="overlay" onClick={() => setShowPromptEditor(false)}>
          <div className="pe-modal" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:"16px", fontWeight:600, color:"#ddd", marginBottom:"6px" }}>Custom System Prompt</div>
            <div style={{ fontSize:"13px", color:"#555", marginBottom:"14px" }}>Override the session system prompt. Leave empty to use default.</div>
            <textarea className="pe-ta" placeholder="Enter custom system prompt..." value={promptDraft} onChange={e => setPromptDraft(e.target.value)}/>
            <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end", marginTop:"14px" }}>
              <button className="btn-secondary" style={{ flex:"none" }} onClick={() => { setPromptDraft(""); setCustomPrompt(""); setShowPromptEditor(false); }}>Reset</button>
              <button className="btn-secondary" style={{ flex:"none" }} onClick={() => setShowPromptEditor(false)}>Cancel</button>
              <button className="btn-primary" style={{ flex:"none" }} onClick={() => { setCustomPrompt(promptDraft); setShowPromptEditor(false); }}>Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* ── BAN / MAINTENANCE BANNER ── */}
      {(isBanned || (maintenanceMode && !isCreator)) && (
        <div style={{
          position:'fixed',top:0,left:0,right:0,zIndex:9999,
          background:'#7f1d1d',color:'#fca5a5',padding:'12px',
          textAlign:'center',fontSize:'13px',fontWeight:'bold',borderBottom:'1px solid #991b1b'
        }}>
          {isBanned ? "Suspicious activity detected. Your access to Manshverse has been revoked." : `Maintenance Mode: ${platformNotice || "System upgrades in progress."}`}
        </div>
      )}

      {/* ── APP ROOT ── */}
      <div className="root">

        {/* ── SIDEBAR BACKDROP ── */}
        <div className={`sb-backdrop ${sidebarOpen && isMobile ? "visible" : ""}`} onClick={() => setSidebarOpen(false)}/>

        {/* ── SIDEBAR ── */}
        <div className={`sb ${sidebarOpen ? "" : "off"}`}>
          <div className="sb-head">
            <BrandMark className="sb-mark" size={30} />
            <div className="sb-title">Manshverse</div>
            {isMobile && (
              <button onClick={() => setSidebarOpen(false)} style={{ marginLeft:"auto", background:"none", border:"none", color:"#555", fontSize:"20px", cursor:"pointer", padding:"4px", lineHeight:1 }}>×</button>
            )}
          </div>
          <div className="sb-body">
            <input className="sb-search" aria-label="Search conversations" placeholder="Search conversations..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}/>
            <button type="button" className={`sb-item ${view === "chat" && !messages.length && !activeConv ? "active" : ""}`} onClick={() => { newChat(); if (isMobile) setSidebarOpen(false); }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              New Chat
            </button>
            <div className="sb-section">Explore</div>
            <button type="button" className={`sb-item ${view === "personas" ? "active" : ""}`} onClick={() => { setView("personas"); if (isMobile) setSidebarOpen(false); }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Personas & Avatars
            </button>
            <button type="button" className={`sb-item ${view === "council" ? "active" : ""}`} onClick={() => { setView("council"); if (isMobile) setSidebarOpen(false); }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              Decision Room
            </button>
            <button type="button" className={`sb-item ${view === "memory" ? "active" : ""}`} onClick={() => { setView("memory"); if (isMobile) setSidebarOpen(false); }}>
              <AppIcon name="save" size={15}/> Memory <span className="sb-item-count">{memories.length}</span>
            </button>
            <button type="button" className={`sb-item ${view === "artifacts" ? "active" : ""}`} onClick={() => { setView("artifacts"); loadArtifacts(); if (isMobile) setSidebarOpen(false); }}>
              <AppIcon name="document" size={15}/> Artifacts <span className="sb-item-count">{artifacts.length}</span>
            </button>
            <div className="sb-section">Recent</div>
            {filteredConvs.length === 0 && <p className="sb-empty">{searchQuery ? "No conversations found." : "Your conversations will appear here."}</p>}
            {filteredConvs.map(conv => (
              <div key={conv.id} className={`sb-conv ${activeConv?.id === conv.id ? "active" : ""}`}>
                <button type="button" className="sb-conv-open" onClick={() => { selectConv(conv); if (isMobile) setSidebarOpen(false); }} aria-current={activeConv?.id === conv.id ? "page" : undefined}>
                  <span className="sb-conv-title">{conv.title || "Untitled"}</span>
                  <span className="sb-conv-sub">{conv.isDecisionRoom ? "Decision brief" : conv.isPersona ? "Persona" : conv.model || "—"}</span>
                </button>
                <button type="button" className="sb-del" aria-label={`Delete ${conv.title || "untitled conversation"}`} onClick={() => setDeleteConfirm(conv)}><AppIcon name="close" size={13}/></button>
              </div>
            ))}
          </div>
          <div className="sb-foot">
            {!isCreator && (
              <>
                <button className="sb-upg" onClick={() => setShowUpgrade(true)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  Upgrade Plan
                </button>
                <div style={{ padding:"0 4px 12px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:"11px", color:"#444", marginBottom:"4px" }}>
                    <span>{model.label}</span>
                    <span>{currentUsed}/{currentLimit === Infinity ? "∞" : currentLimit}</span>
                  </div>
                  <div className="sb-progress"><div className="sb-progress-fill" style={{ width:`${usagePct}%` }}/></div>
                </div>
              </>
            )}
            <div className="sb-user" onClick={() => navigate("/profile")}>
              <div className="sb-av">
                {user?.photoURL ? <img src={user.photoURL} alt=""/> : (user?.displayName?.[0] || user?.email?.[0] || "U").toUpperCase()}
              </div>
              <div className="sb-uinfo">
                <div className="sb-uname">{user?.displayName || user?.email}</div>
                {isCreator ? <div className="sb-badge"><AppIcon name="star" size={11}/> Creator</div> : <div className="sb-plan">{plan.toUpperCase()}</div>}
              </div>
              <button className="icon-btn" style={{ padding:"6px" }} onClick={e => { e.stopPropagation(); signOut(auth).then(() => navigate("/", { replace: true })).catch(err => console.error("Sign out failed", err)); }} title="Sign out" aria-label="Sign out">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              </button>
            </div>
          </div>
        </div>

        {/* ── MAIN ── */}
        <div className="main">
          {/* ── TOPBAR — FIX: z-index:210 ensures visibility above mobile backdrop ── */}
          <div className="topbar">
            <button className={`icon-btn ${sidebarOpen && !isMobile ? "active" : ""}`} onClick={() => setSidebarOpen(p => !p)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            {view === "chat" && (
              <div className="mdrop-wrap" ref={dropdownRef}>
                <button className="mdrop-btn" onClick={() => setModelDropdown(p => !p)}>
                  {activeConv?.isPersona ? (
                    <><AppIcon name={personaConf?.id || "sparkles"} size={16}/>{activeConv.title.replace("Chat with ", "")}</>
                  ) : (
                    <>{model.label}<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginLeft:4}}><polyline points="6 9 12 15 18 9"/></svg></>
                  )}
                </button>
                {modelDropdown && !activeConv?.isPersona && (
                  <div className="mdrop-menu">
                    {MODELS.map((m, i) => (
                      <div key={m.id}>
                        {i === 1 && <div className="mdrop-divider"/>}
                        <div className={`mdrop-item ${model.id === m.id ? "sel" : ""}`} onClick={() => { setModel(m); setModelDropdown(false); }}>
                          <div style={{ flex: 1 }}>
                            <div className="mdrop-name">{m.label} {m.vision && <span style={{fontSize:"10px",color:"#fca5a5",background:"rgba(252,165,165,0.1)",border:"1px solid rgba(252,165,165,0.2)",borderRadius:"4px",padding:"1px 5px",marginLeft:"4px"}}>Vision</span>}</div>
                            <div className="mdrop-desc">{m.desc}</div>
                          </div>
                          {model.id === m.id && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6c47ff" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {view === "chat" && <div className="chat-topbar-context"><span>CONVERSATION</span><strong>{activeConv?.title?.replace("Chat with ", "") || "New conversation"}</strong></div>}
            {view === "council" && (
              <div className="council-topbar-title"><AppIcon name="council" size={16}/> Decision Room</div>
            )}
            {view === "memory" && <div className="council-topbar-title"><AppIcon name="save" size={16}/> Memory</div>}
            {view === "artifacts" && <div className="council-topbar-title"><AppIcon name="document" size={16}/> Artifact library</div>}
            <div className="topbar-right">
              {/* Atmosphere indicator */}
              <div className="atm-dot" title={`Atmosphere: ${atm.label}`}/>
              {/* Shadow Mode toggle */}
              <button
                className={`icon-btn ${shadowMode ? "shadow-on" : ""}`}
                title={shadowMode ? "Shadow Mode: ON — Click to disable" : "Enable Shadow Mode (Contrarian)"}
                onClick={() => setShadowMode(p => !p)}
              >
                <AppIcon name="eye" size={15}/>
              </button>
              {isCreator && (
                <button className="icon-btn" title="Analytics" onClick={() => navigate("/analytics")}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                </button>
              )}
              {isCreator && (
                <button className="icon-btn" title="System prompt" onClick={() => { setPromptDraft(customPrompt); setShowPromptEditor(true); }} style={{ color: customPrompt ? "var(--atm-accent)" : undefined }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </button>
              )}
              <button className="icon-btn" title="Profile" onClick={() => navigate("/profile")}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </button>
            </div>
          </div>

          {/* ── EMAIL VERIFICATION BANNER ── */}
          {showEmailVerify && (
            <div className="verify-banner">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              <span>{verifySent ? "Verification email sent! Check your inbox." : `Please verify your email (${user?.email}) to unlock all features.`}</span>
              {!verifySent && <button className="verify-btn" onClick={sendVerificationEmail}>Send Verification Email</button>}
              <button className="verify-close" onClick={() => setShowEmailVerify(false)}>×</button>
            </div>
          )}

          {error && (
            <div className="err-bar">
              <div className="err-inner">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {error}
                <button onClick={() => setError(null)} aria-label="Dismiss error" style={{ marginLeft:"auto", background:"none", border:"none", color:"#fca5a5", cursor:"pointer" }}><AppIcon name="close" size={14}/></button>
              </div>
            </div>
          )}

          {view === "memory" && (
            <section className="memory-page" aria-labelledby="memory-title">
              <div className="memory-inner">
                <button type="button" className="memory-back" onClick={() => setView("chat")}>← Back to chat</button>
                <p className="memory-eyebrow"><AppIcon name="save" size={13}/> YOUR PERSONAL CONTEXT</p>
                <div className="memory-title-row">
                  <div><h1 id="memory-title">Memory</h1><p>Save details you want Manshverse to carry into future chats. Nothing is saved unless you add it.</p></div>
                  <button type="button" className={`memory-toggle ${memoryEnabled ? "on" : ""}`} onClick={toggleMemoryUse} aria-pressed={memoryEnabled}>
                    <span className="memory-toggle-dot"/>{memoryEnabled ? "Memory on" : "Memory off"}
                  </button>
                </div>
                <form className="memory-form" onSubmit={async event => { event.preventDefault(); if (await saveMemoryText(memoryDraft)) setMemoryDraft(""); }}>
                  <label htmlFor="memory-draft">Add a memory</label>
                  <textarea id="memory-draft" value={memoryDraft} maxLength={500} onChange={event => setMemoryDraft(event.target.value)} placeholder="For example: I prefer concise answers and work primarily in React."/>
                  <div className="memory-form-foot"><span>{memoryDraft.length}/500 · Private to your account</span><button type="submit" disabled={!memoryDraft.trim() || memories.length >= 30}><AppIcon name="save" size={13}/> Save memory</button></div>
                </form>
                {memoryFeedback && <div className="memory-feedback" role="status" aria-live="polite">{memoryFeedback}</div>}
                <div className="memory-list-head"><h2>Saved memories</h2><span>{memories.length}/30</span></div>
                {memories.length ? (
                  <div className="memory-list">
                    {memories.map(memory => (
                      <article className="memory-card" key={memory.id}>
                        <p>{memory.text}</p>
                        <button type="button" aria-label="Delete memory" title="Delete memory" onClick={() => removeMemory(memory.id)}><AppIcon name="trash" size={14}/></button>
                      </article>
                    ))}
                  </div>
                ) : <div className="memory-empty"><AppIcon name="sparkles" size={20}/><strong>No memories saved yet</strong><span>Use “Remember” under any of your messages, or add a note above.</span></div>}
                <p className="memory-privacy">When enabled, saved memories are included as context in your requests to Groq. Remove anything you no longer want used.</p>
              </div>
            </section>
          )}

          {/* ── PERSONAS VIEW ── */}
          {view === "artifacts" && (
            <section className="artifact-library">
              <header><p>MANSHVERSE / YOUR WORK</p><h1>Artifacts<span>.</span></h1><div>Websites and documents you save from a conversation, ready to reopen and continue editing.</div></header>
              {artifactsLoading ? <p className="artifact-library-empty" role="status">Loading your artifacts…</p> : artifacts.length ? <div className="artifact-library-grid">
                {artifacts.map(item => <article className="artifact-library-card" key={item.id}>
                  <button type="button" className="artifact-library-open" onClick={() => openArtifact(item)}><span>{item.kind === "website" ? "WEBSITE" : "DOCUMENT"}</span><strong>{item.title}</strong><small>Updated {formatMessageTime(item.updated_at)}</small></button>
                  <button type="button" className="artifact-library-delete" aria-label={`Delete ${item.title}`} onClick={() => deleteArtifact(item)}><AppIcon name="trash" size={14}/></button>
                </article>)}
              </div> : <div className="artifact-library-empty"><AppIcon name="document" size={25}/><strong>No saved artifacts yet</strong><span>Use Create under a response, then save it from Artifact Studio.</span><button type="button" onClick={() => { newChat(); setInput("Create a simple website"); }}>Start with a website</button></div>}
            </section>
          )}

          {view === "personas" && (
            <div className="gallery">
              <div className="gallery-inner">
                <div className="gallery-header">
                  <div className="gallery-eyebrow"><AppIcon name="sparkles" size={13}/> Choose a point of view</div>
                  <div className="gallery-heading-row">
                    <div>
                      <div className="gallery-title">Personas &amp; Avatars</div>
                      <div className="gallery-sub">Start a focused conversation with a historical mind, a professional guide, or a fictional perspective.</div>
                    </div>
                    <div className="gallery-count">{PERSONA_CATEGORIES.reduce((total, category) => total + category.items.length, 0)} ways to explore</div>
                  </div>
                </div>
                <div className="gallery-controls">
                  <div className="persona-tabs" role="tablist" aria-label="Persona categories">
                    {PERSONA_CATEGORIES.map(category => (
                      <button key={category.id} type="button" role="tab" aria-selected={personaTab === category.id} className={`ptab ${personaTab === category.id ? "active" : ""}`} onClick={() => setPersonaTab(category.id)}>
                        <AppIcon name={category.icon} size={14}/>{category.label}<span className="ptab-count">{category.items.length}</span>
                      </button>
                    ))}
                  </div>
                  <div className="persona-search">
                    <AppIcon name="search" size={15}/>
                    <input type="search" value={personaSearch} onChange={e => setPersonaSearch(e.target.value)} placeholder={`Search ${selectedPersonaCategory.label.toLowerCase()}…`} aria-label={`Search ${selectedPersonaCategory.label.toLowerCase()} personas`}/>
                    {personaSearch && <button type="button" className="persona-search-clear" aria-label="Clear search" onClick={() => setPersonaSearch("")}><AppIcon name="close" size={13}/></button>}
                  </div>
                </div>
                <div className="persona-category-note">
                  <p>{selectedPersonaCategory.description}</p>
                  <span>{normalizedPersonaSearch ? `${visiblePersonas.length} matches` : `${selectedPersonaCategory.items.length} personas`}</span>
                </div>
                {personaTab === "historical" && (
                  visiblePersonas.length ? <div className="av-grid">
                    {visiblePersonas.map(av => <AvatarCard key={av.id} av={av} onClick={personaCardHandlers.get(av.id)}/>)}
                  </div> : <div className="persona-empty">No historical personas match “{personaSearch}”. Try another name or topic.</div>
                )}
                {personaTab === "professional" && (
                  <div className="pro-grid">
                    {visiblePersonas.map(p => <ProCard key={p.id} p={p} onClick={personaCardHandlers.get(p.id)}/>)}
                    {!visiblePersonas.length && <div className="persona-empty">No professional personas match “{personaSearch}”. Try another name or specialty.</div>}
                  </div>
                )}
                {personaTab === "fictional" && (
                  <div className="av-grid">
                    {visiblePersonas.map(p => <AvatarCard key={p.id} av={p} onClick={personaCardHandlers.get(p.id)}/>)}
                    {!visiblePersonas.length && <div className="persona-empty">No fictional personas match “{personaSearch}”. Try another name or character.</div>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── COUNCIL OF MINDS VIEW ── */}
          {view === "council" && (
            <div className="council-wrap">
              <div className="council-inner">
                <div className="council-header">
                  <div className="council-eyebrow"><AppIcon name="sparkles" size={13}/> Think it through, leave with a plan</div>
                  <div className="council-title"><AppIcon name="council"/>Decision Room</div>
                  <div className="council-sub">Bring a real choice and your context. Three perspectives weigh it, then turn the strongest thinking into a brief you can keep and act on.</div>
                  <div className="council-flow" aria-label="The council process">
                    <span className="council-flow-step" style={{"--step-color":"#4ade80"}}><AppIcon name="star" size={13}/> Practical</span>
                    <span className="council-flow-arrow" aria-hidden="true">→</span>
                    <span className="council-flow-step" style={{"--step-color":"#a78bfa"}}><AppIcon name="columns" size={13}/> Stoic</span>
                    <span className="council-flow-arrow" aria-hidden="true">→</span>
                    <span className="council-flow-step" style={{"--step-color":"#67e8f9"}}><AppIcon name="calculator" size={13}/> Analytical</span>
                    <span className="council-flow-arrow" aria-hidden="true">→</span>
                    <span className="council-flow-step"><AppIcon name="bolt" size={13}/> Verdict</span>
                  </div>
                </div>

                <div className="council-input-wrap">
                  <label className="council-input-label" htmlFor="council-question">
                    <span>What decision or problem are you facing?</span>
                    <span>{councilQuestion.length} characters</span>
                  </label>
                  <textarea
                    id="council-question"
                    className="council-ta"
                    aria-label="Describe the decision or problem you are facing"
                    placeholder="Describe the choice you need to make, what matters most, and any deadline…"
                    value={councilQuestion}
                    onChange={e => setCouncilQuestion(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runCouncil(); } }}
                    rows={3}
                  />
                  <div className="council-prompts">
                    <span className="council-prompt-label">Try asking</span>
                    {["Should I take the safer job or join an early startup?", "How should I prioritize when everything feels urgent?", "Is this idea worth pursuing for another year?"].map(prompt => (
                      <button key={prompt} type="button" className="council-prompt" disabled={councilLoading} onClick={() => setCouncilQuestion(prompt)}>{prompt}</button>
                    ))}
                  </div>
                  <details className="council-customize">
                    <summary><AppIcon name="refresh" size={13}/> Customize this council</summary>
                    <div className="council-options">
                      <div>
                        <span className="council-option-label">Debate style</span>
                        <div className="council-choice-row" role="group" aria-label="Debate style">
                          {[{id:"balanced",label:"Balanced"},{id:"skeptical",label:"Challenge my thinking"},{id:"supportive",label:"Constructive"}].map(option => (
                            <button key={option.id} type="button" className={`council-choice ${councilStyle === option.id ? "active" : ""}`} aria-pressed={councilStyle === option.id} onClick={() => setCouncilStyle(option.id)}>{option.label}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="council-option-label">Answer depth</span>
                        <div className="council-choice-row" role="group" aria-label="Answer depth">
                          {[{id:"standard",label:"Concise"},{id:"detailed",label:"Detailed"}].map(option => (
                            <button key={option.id} type="button" className={`council-choice ${councilDepth === option.id ? "active" : ""}`} aria-pressed={councilDepth === option.id} onClick={() => setCouncilDepth(option.id)}>{option.label}</button>
                          ))}
                        </div>
                      </div>
                      <label className="council-focus-wrap">
                        <span className="council-option-label">Context that could change the recommendation <span style={{fontWeight:400,color:"#777687"}}>· optional</span></span>
                        <textarea className="council-focus" value={councilFocus} onChange={e => setCouncilFocus(e.target.value)} placeholder="For example: I have two months of savings and want to stay in Bengaluru…" />
                      </label>
                    </div>
                  </details>
                  <div className="council-actions">
                    <span className="council-shortcut">Press Ctrl + Enter or ⌘ + Enter to ask</span>
                    <button className="council-btn" onClick={runCouncil} disabled={!councilQuestion.trim() || councilLoading}>
                      {councilLoading ? (
                        <><div className="t-dot"/><div className="t-dot"/><div className="t-dot"/><span style={{marginLeft:6}}>The council is thinking…</span></>
                      ) : (
                        <><span>Build my decision brief</span><AppIcon name="council" size={15}/></>
                      )}
                    </button>
                  </div>
                </div>

                {councilLoading && !councilResults && (
                  <div className="council-progress" role="status" aria-live="polite">
                    <strong>Your decision brief is taking shape</strong>
                    The Founder, Stoic, and Mathematician are considering your question in parallel.
                    <div className="council-loading"><div className="t-dot"/><div className="t-dot"/><div className="t-dot"/><span>Gathering their responses…</span></div>
                  </div>
                )}

                {councilResults && (
                  <div className="council-results">
                    <div className="council-question-summary"><AppIcon name="sparkles" size={15}/><span><strong>The question:</strong> {councilAnsweredQuestion}</span></div>
                    {Object.keys(councilErrors).length > 0 && <p className="council-partial-note" role="status">Some perspectives did not respond. The brief uses the available replies.</p>}
                    {COUNCIL_PERSONAS.map((persona, i) => {
                      const reply = councilResults[persona.id];
                      return (
                        <div className="council-card" key={persona.id} style={{ animationDelay: `${i * 0.1}s` }}>
                          <div className="council-card-head">
                            <div className="council-icon" style={{ background: `${persona.color}18`, border: `1px solid ${persona.color}30` }}>
                              <AppIcon name={persona.id} size={19}/>
                            </div>
                            <div>
                              <div className="council-card-name" style={{ color: persona.color }}>{persona.name}</div>
                              <div className="council-card-label">{["Execution & tradeoffs", "What you control", "Evidence & expected value"][i]}</div>
                            </div>
                          </div>
                          <div className="council-card-body">
                            {reply ? <Suspense fallback={<p className="council-perspective-status" role="status">Preparing formatted response…</p>}><MarkdownText>{reply}</MarkdownText></Suspense> : <p className="council-perspective-status" role="status">{councilErrors[persona.id] || (councilLoading ? "Considering your question…" : "This perspective did not return a response.")}</p>}
                          </div>
                        </div>
                      );
                    })}

                    {councilSynthLoading && !councilResults.synthesis && (
                      <div className="council-synthesis">
                        <div className="council-synth-label"><AppIcon name="bolt" size={14}/> Bringing the strongest ideas together</div>
                        <div className="council-loading">
                          <div className="t-dot"/><div className="t-dot"/><div className="t-dot"/>
                          <span>The Council deliberates...</span>
                        </div>
                      </div>
                    )}

                    {councilResults.synthesis && (
                      <div className="council-synthesis">
                        <div className="council-synth-label"><AppIcon name="bolt" size={14}/> Your decision brief</div>
                        <div className="council-synth-body">
                          <Suspense fallback={<p className="council-perspective-status" role="status">Preparing your brief…</p>}><MarkdownText>{councilResults.synthesis}</MarkdownText></Suspense>
                        </div>
                      </div>
                    )}

                    {councilResults.synthesis && (
                      <div className="council-next">
                        <button className="council-result-action" onClick={copyDecisionBrief}><AppIcon name="copy" size={14}/> Copy brief</button>
                        <button className="council-result-action" onClick={saveDecisionBrief} disabled={councilSaved || councilSaving}>
                          <AppIcon name={councilSaved ? "check" : "save"} size={14}/>{councilSaved ? "Saved to chats" : councilSaving ? "Saving…" : "Save to chats"}
                        </button>
                        <button className="qa-chip" onClick={() => { setCouncilResults(null); setCouncilQuestion(""); setCouncilAnsweredQuestion(""); document.getElementById("council-question")?.focus(); }}>
                          <AppIcon name="refresh" size={14}/>
                          New decision
                        </button>
                        <span className="council-feedback" role="status" aria-live="polite">{councilFeedback}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── CHAT EMPTY STATE ── */}
          {view === "chat" && messages.length === 0 && (
            <div className="empty-wrap">
              <section className="chat-empty-intro" aria-labelledby="chat-empty-title">
                <p className="chat-empty-kicker">MANSHVERSE / THINKING SPACE</p>
                <h1 id="chat-empty-title">Where should<br/>we <em>begin?</em></h1>
                <p className="chat-empty-copy">Bring a question, a half-formed idea, or a problem you can’t quite leave alone.</p>
                <div className="chat-starters" aria-label="Try a prompt">
                  {["Help me understand a difficult idea", "Help me think through a decision", "Challenge my current thinking"].map((prompt, index) => (
                    <button key={prompt} className="chat-starter" onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}>
                      <span>0{index + 1}</span>{prompt}<b aria-hidden="true">↗</b>
                    </button>
                  ))}
                </div>
              </section>
              {renderInputArea(false)}
            </div>
          )}

          {/* ── ACTIVE CHAT ── */}
          {view === "chat" && messages.length > 0 && (
            <>
              <div className="msgs-wrap" ref={msgsWrapRef}>
                <div className="msgs-inner">
                  <div className="thread-index" aria-label="Conversation details">
                    <span><i aria-hidden="true"/> THREAD / {(activeConv?.id || "DRAFT").slice(0, 6).toUpperCase()}</span>
                    <span>{messages.filter(message => message.role !== "routing").length.toString().padStart(2, "0")} ENTRIES</span>
                  </div>
                  <Suspense fallback={<div className="stream-status" role="status">Loading conversation…</div>}>{messages.map((msg, i) => (
                    <MessageItem
                      key={msg.id || `message-${i}`}
                      msg={msg}
                      index={i}
                      userName={chatUserName}
                      userInitial={chatUserInitial}
                      userAvatar={user?.photoURL}
                      personaId={personaConf?.id}
                      personaName={chatPersonaName}
                      personaBackground={chatPersonaBackground}
                      shadowMode={shadowMode}
                      isCopied={copied === i}
                      onCopy={handleCopyMessage}
                      onRate={handleMessageRate}
                      onRetry={handleMessageRetry}
                      onEdit={handleMessageEdit}
                      onRemember={handleMessageRemember}
                      onArtifact={handleMessageArtifact}
                      onChoice={handleMessageChoice}
                      isRemembered={rememberedText.has(String(msg.content || "").trim().toLowerCase())}
                    />
                  ))}</Suspense>
                  <div ref={bottomRef}/>
                </div>
              </div>
              {renderInputArea(true)}
            </>
          )}
        </div>
      </div>
    </>
  );
}

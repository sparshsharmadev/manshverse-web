import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import BrandMark from "../components/BrandMark";
import SiteFooter from "../components/SiteFooter";
import "./info-pages.css";

const pages = {
  about: {
    number: "01", eyebrow: "A SPACE FOR THINKING", title: <>What is<br/><em>Manshverse?</em></>, lead: "A place to work through ideas with AI, explore different perspectives, and turn conversations into things you can use.", sections: [
      ["One conversation, many directions", "Chat with Groq hosted models, try a guided persona, or use Decision Room to compare practical, reflective, and analytical views."],
      ["From conversation to work", "Use the artifact studio to preview and edit generated websites and documents, then export a copy for your own use."],
      ["Built as an independent project", "Manshverse is an evolving project. Features, model availability, and limits can change as the service develops."],
    ]
  },
  help: {
    number: "02", eyebrow: "HELP DESK", title: <>Need a<br/><em>hand?</em></>, lead: <>For account, access, or billing questions, email <a href="mailto:manshverse@gmail.com">manshverse@gmail.com</a>. Include the email on your account and a short description; never send your password or sign-in code.</>, sections: [
      ["Model unavailable", "Refresh the page, check your daily limit, and try Mansh Mode or another available model. If every model fails, send us the approximate time and the visible error."],
      ["Sign-in or verification", "Use Forgot password on the sign-in page. If a confirmation link expired, return to signup and request a fresh email."],
      ["Plans and payments", "Plan upgrades currently use a manual request and review flow. Wait for confirmation before assuming a plan has changed. Do not send payment credentials."],
      ["Delete or export your information", "You can delete conversations from the chat list and remove saved memories in Memory. For account deletion or a copy of account data, email support from your registered address."],
    ]
  },
  terms: {
    number: "03", eyebrow: "SERVICE TERMS", title: <>Terms of<br/><em>use.</em></>, lead: "These terms describe the current Manshverse service. By creating an account or using it, you agree to use the service lawfully and responsibly.", sections: [
      ["The service", "Manshverse provides AI chat, model routing, personas, Decision Room, saved memory, and artifact tools. The service is provided as it is available; models and features may change or be interrupted."],
      ["Your account", "Keep your sign-in credentials secure and provide accurate account information. You are responsible for activity under your account. We may restrict access for abuse, security, or legal reasons."],
      ["AI output and your decisions", "AI output can be inaccurate, incomplete, biased, or out of date. Review it before relying on it, especially for medical, legal, financial, safety, or other consequential decisions. Manshverse is not a professional adviser."],
      ["Your content", "You keep rights you already have in prompts and content you submit. You authorize us and our service providers to process that content only as needed to provide, secure, and maintain the features you use. Do not submit content you are not allowed to share."],
      ["Acceptable use", "Do not use Manshverse to break the law, threaten or harass people, expose private information, bypass service limits, disrupt the service, or create harmful content or code. Do not treat persona responses as statements by the real person represented."],
      ["Plans and payments", "Some plans may have usage limits. Any manual upgrade request is pending until reviewed and confirmed. Prices, limits, and availability are shown in the app and may change prospectively. Contact support about a payment issue."],
      ["Suspension and ending use", "You may stop using the service at any time. We may suspend or end access for a material breach, security risk, or service shutdown. Contact support to request account deletion."],
      ["Liability and changes", "To the extent allowed by applicable law, Manshverse is not responsible for indirect loss arising from use of AI output or service interruption. Nothing here limits rights or liability that cannot legally be limited. We may update these terms; material changes will be posted here."],
    ]
  },
  privacy: {
    number: "04", eyebrow: "DATA & PRIVACY", title: <>Your data,<br/><em>plainly.</em></>, lead: "This notice explains what the current app collects and how it is used. We aim to collect only what is needed to run Manshverse.", sections: [
      ["Information you provide", "Account details such as email, display name, optional profile photo and optional phone number; prompts and conversation messages; files or images you choose to submit; saved memories; and feedback you send."],
      ["Information created by using the service", "Conversation and artifact records, model and usage counts, plan requests, and basic security or diagnostic information needed to keep the service working."],
      ["How information is used", "To authenticate you, save your work, answer requests, apply usage limits, provide support, secure the service, and administer plans. Saved memories are included in AI prompts only when Memory is enabled."],
      ["Service providers", "Account and application data are stored through Supabase. Prompts and relevant context are sent to Groq when you request an AI response. Those providers process data to provide their services under their own terms. Do not include secrets or sensitive personal information in prompts."],
      ["Retention and deletion", "Conversations and memories remain in your account until you delete them or request account deletion. Some operational records may remain as needed for security, billing records, dispute handling, or legal obligations. To request a copy or deletion of account information, contact support from your registered email."],
      ["Your choices", "You can edit profile details, delete conversations, remove saved memories, and turn memory use off in the app. You can also block browser storage, though sign-in and saved preferences may stop working."],
      ["Children and updates", "Manshverse is not designed for children under 13. We may update this notice as the product changes; the current version and date appear here."],
    ]
  },
  cookies: {
    number: "05", eyebrow: "BROWSER STORAGE", title: <>Cookies &<br/><em>storage.</em></>, lead: "Manshverse currently uses essential browser storage to keep your account signed in and remember basic interface choices.", sections: [
      ["Authentication storage", "Supabase Auth stores a session in browser storage so you can remain signed in. This is required for account and chat features."],
      ["Interface preferences", "The app may use local storage or session storage for choices such as dismissing this notice or completing a sign-in flow. These values stay in your browser."],
      ["Cookies and analytics", "The current app does not intentionally use advertising cookies or third-party advertising trackers. Infrastructure or authentication providers may set strictly necessary storage as part of delivering the service."],
      ["Your controls", "You can clear site data in your browser settings. Clearing it signs you out and may remove local preferences. Blocking essential storage can prevent Manshverse from working."],
    ]
  },
  conduct: {
    number: "06", eyebrow: "COMMUNITY STANDARD", title: <>Code of<br/><em>conduct.</em></>, lead: "Manshverse should be useful and safe for people with different backgrounds and points of view.", sections: [
      ["Treat people with respect", "Do not use the service to threaten, target, demean, stalk, or harass someone. Disagreement is welcome; abuse is not."],
      ["Protect privacy", "Do not share another person's private information, credentials, intimate images, or confidential material without permission."],
      ["Use AI responsibly", "Do not use Manshverse to facilitate violence, fraud, exploitation, discrimination, or other illegal harm. Do not present generated content as verified fact without checking it."],
      ["Respect boundaries", "Persona simulations are fictionalized interactions, not endorsements or authentic statements from the person represented. Respect intellectual property and service limits."],
      ["Report a concern", <>Email <a href="mailto:manshverse@gmail.com">manshverse@gmail.com</a> with the issue and enough context for us to review it. Do not include passwords, access tokens, or unnecessary personal data.</>],
    ]
  },
  ai: {
    number: "07", eyebrow: "HOW AI WORKS HERE", title: <>Know what<br/><em>you’re using.</em></>, lead: "Manshverse sends your request to an available hosted language model and shows its response in the app.", sections: [
      ["Models and routing", "Mansh Mode selects among the models currently configured for the request. A request may be routed differently based on its content or whether it includes an image. The model label shown with a reply identifies the resolved model when the provider reports it."],
      ["No human review by default", "Prompts are processed by the model provider. They are not routinely read by a person, though support or security issues may require limited access to relevant account records."],
      ["Limitations", "Responses may confidently state errors or omit important context. Personas simulate a perspective and are not the actual person. Verify important claims with reliable sources and qualified professionals."],
      ["Your controls", "Choose a model, retry a response, edit a prompt, disable Memory, or delete a conversation. Tell support if a feature behaves unexpectedly."],
    ]
  },
};

export function InfoPage({ page }) {
  const data = pages[page] || pages.about;
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${data.eyebrow} · Manshverse`;
    return () => { document.title = previousTitle; };
  }, [data.eyebrow]);
  return <main className="info-page">
    <header className="info-nav"><Link className="info-brand" to="/"><BrandMark size={30}/><span>Manshverse<span>.</span></span></Link><nav aria-label="Site"><Link to="/">Home</Link><Link to="/help">Help</Link><Link to="/login">Open app</Link></nav></header>
    <div className="info-masthead"><span>{data.eyebrow}</span><span>{data.number} / 07</span></div>
    <section className="info-hero"><div><p>MANSHVERSE / FIELD NOTES</p><h1>{data.title}</h1></div><p className="info-lead">{data.lead}</p></section>
    <div className="info-contents">{data.sections.map(([heading, body], index) => <section className="info-section" key={heading}><span>{String(index + 1).padStart(2, "0")}</span><h2>{heading}</h2><p>{body}</p></section>)}</div>
    <div className="info-meta">Effective date: November 5, 2026 <span>·</span> Updated November 5, 2026</div>
    <SiteFooter/>
  </main>;
}

export function CookieNotice() {
  const [visible, setVisible] = useState(() => { try { return localStorage.getItem("mv-cookie-notice-v1") !== "dismissed"; } catch { return false; } });
  if (!visible) return null;
  return <aside className="cookie-notice" aria-label="Browser storage notice"><p><strong>Essential storage only.</strong> We use browser storage for sign-in and basic preferences. <Link to="/cookies">Read the cookie notice</Link>.</p><button type="button" onClick={() => { try { localStorage.setItem("mv-cookie-notice-v1", "dismissed"); } catch { /* The notice can still be dismissed for this session. */ } setVisible(false); }}>Understood</button></aside>;
}

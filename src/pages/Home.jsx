import { Link } from "react-router-dom";
import BrandMark from "../components/BrandMark";
import AppIcon from "../components/AppIcon";
import "./home.css";

export default function Home({ user }) {
  const enterHref = user ? "/chat" : "/register";
  return <main className="home-page">
    <header className="home-nav">
      <Link className="home-brand" to="/" aria-label="Manshverse home"><BrandMark size={32}/><span>Manshverse<span className="brand-period">.</span></span></Link>
      <nav aria-label="Main navigation"><a href="#inside">THE UNIVERSE</a><a href="#approach">OUR APPROACH</a></nav>
      <div className="home-nav-actions"><Link className="home-signin" to={user ? "/chat" : "/login"}>{user ? "OPEN APP" : "SIGN IN"}</Link><Link className="home-nav-cta" to={enterHref}>{user ? "ENTER CHAT" : "GET STARTED"}<span aria-hidden="true">↗</span></Link></div>
    </header>

    <section className="home-hero" aria-labelledby="home-title">
      <div className="home-hero-meta"><span>AN OPEN FIELD FOR IDEAS</span><span>01 — 04&nbsp;&nbsp; / &nbsp;&nbsp;M.V.</span></div>
      <aside className="home-hero-art" aria-label="Manshverse point of view">
        <p className="hero-art-label">MANSHVERSE / 001—004</p>
        <div className="hero-art-title"><span>ONE</span><em>thought</em><span>AT A TIME</span></div>
        <div className="hero-art-rule"><i/><span>01 / 04</span><i/></div>
        <p className="hero-art-note">A space to follow an idea<br/>from more than one angle.</p>
      </aside>
      <div className="home-hero-copy">
        <p className="home-kicker">A THINKING SPACE, IN MANY DIRECTIONS</p>
        <h1 id="home-title">MORE THAN<br/>ONE WAY TO<br/><em>THINK<span>.</span></em></h1>
        <div className="hero-bottom"><p>Different models. Distinct points of view.<br/>One place to follow the thought.</p><div className="home-hero-actions"><Link className="home-primary" to={enterHref}>{user ? "ENTER MANSHVERSE" : "STEP INSIDE"}<span aria-hidden="true">↗</span></Link><a className="home-secondary" href="#inside">SCROLL TO EXPLORE <span aria-hidden="true">↓</span></a></div></div>
      </div>
      <div className="home-hero-bottomline"><span>MODELS / PERSONAS / POSSIBILITY</span><span>SCROLL TO EXPLORE&nbsp; ↓</span></div>
    </section>

    <section className="home-intro" id="approach">
      <p className="home-section-label">THE POINT OF VIEW</p>
      <div><h2>Curiosity doesn’t<br/>move in <em>one direction.</em></h2><p>Sometimes you want a fast answer. Sometimes you want to work through the hard part, or hear the idea from someone unexpected. Manshverse gives you more than one way into a thought.</p></div>
    </section>

    <section className="home-inside" id="inside" aria-labelledby="inside-title">
      <div className="home-inside-head"><div><p className="home-section-label">THE MANSHVERSE INDEX / 001—004</p><h2 id="inside-title">Pick a perspective.</h2></div><span>One workspace.<br/>Many ways forward.</span></div>
      <div className="home-feature-grid">
        <article className="home-feature feature-mansh"><span className="feature-no">01</span><div className="feature-symbol symbol-route">↗</div><h3>GPT OSS 120B</h3><p>Work through complex questions with Groq hosted reasoning and general chat.</p><span className="feature-type">DEEP REASONING</span></article>
        <article className="home-feature feature-qwen"><span className="feature-no">02</span><div className="feature-symbol symbol-qwen">∴</div><h3>GPT OSS 20B</h3><p>Get quick answers and practical help from a smaller, fast model.</p><span className="feature-type">FAST RESPONSES</span></article>
        <article className="home-feature feature-gptoss"><span className="feature-no">03</span><div className="feature-symbol symbol-gptoss"><AppIcon name="sparkles" size={36}/></div><h3>Qwen 3.8 27B</h3><p>Explore multimodal prompts, coding, and reasoning with Qwen hosted on Groq.</p><span className="feature-type">IDEAS &amp; MAKING</span></article>
        <article className="home-feature feature-personas"><span className="feature-no">04</span><div className="feature-symbol symbol-persona">◌</div><h3>Persona conversations</h3><p>Explore historical, professional, and fictional perspectives in dedicated chats.</p><span className="feature-type">A DIFFERENT PERSPECTIVE</span></article>
      </div>
    </section>

    <section className="home-outro"><p className="home-section-label">THERE’S ALWAYS ANOTHER ANGLE</p><h2>Follow the<br/><em>question further.</em></h2><Link className="home-primary" to={enterHref}>{user ? "OPEN YOUR WORKSPACE" : "MAKE YOUR WAY IN"}<span aria-hidden="true">↗</span></Link></section>
    <footer className="home-footer"><Link className="home-brand" to="/"><BrandMark size={25}/><span>Manshverse<span className="brand-period">.</span></span></Link><span>A space for the questions that stay with you.</span><span>© {new Date().getFullYear()} Manshverse</span></footer>
  </main>;
}

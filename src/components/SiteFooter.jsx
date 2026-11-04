import { Link } from "react-router-dom";
import BrandMark from "./BrandMark";
import "./site-footer.css";

const groups = [
  { title:"Explore", links:[["About","/about"],["AI use","/ai-use"],["Help & support","/help"]] },
  { title:"Policies", links:[["Terms","/terms"],["Privacy","/privacy"],["Cookies","/cookies"],["Code of conduct","/code-of-conduct"]] },
];

export default function SiteFooter() {
  return <footer className="site-footer">
    <div className="site-footer-main">
      <div className="site-footer-brandline"><Link className="site-footer-brand" to="/" aria-label="Manshverse home"><BrandMark size={38}/><span>Manshverse<span className="site-footer-period">.</span></span></Link><span className="site-footer-index">INDEPENDENT THINKING SPACE&nbsp; / &nbsp;001—∞</span></div>
      <p className="site-footer-manifesto">Keep the question.<br/><em>Follow it further.</em></p>
      <Link className="site-footer-contact" to="/help">Need a hand? Get in touch <span aria-hidden="true">↗</span></Link>
    </div>
    <div className="site-footer-links">{groups.map(group => <nav key={group.title} aria-label={group.title}><h2>{group.title}<span> /</span></h2>{group.links.map(([label, to]) => <Link key={to} to={to}>{label}</Link>)}</nav>)}</div>
    <div className="site-footer-bottom"><span>© {new Date().getFullYear()} MANSHVERSE</span><span>MADE FOR THE THOUGHTS THAT STAY WITH YOU.</span><button type="button" onClick={() => window.scrollTo({ top:0, behavior:"smooth" })}>BACK TO TOP <span aria-hidden="true">↑</span></button></div>
  </footer>;
}

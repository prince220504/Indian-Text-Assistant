import { Link } from "react-router-dom";
import Icon from "./Icon";

// Public pages' nav: wordmark left, a glass pill of page sections in the middle (landing only),
// the account doors right. `hide` drops the door the visitor is already standing in.
function SiteNav({ hide, sections = false }) {
  return (
    <header className="site-nav">
      <a href="#main" className="skip-link">Skip to content</a>
      <div className="container site-nav__inner">
        <Link to="/" className="wordmark" aria-label="Indian Tax Assistant, home">
          <Icon name="logo" />
          <span className="wordmark__text">Indian Tax Assistant</span>
        </Link>
        {sections && (
          <nav className="site-nav__pill glass" aria-label="On this page">
            <a href="#how">How it works</a>
            <a href="#documents">Documents</a>
            <a href="#calculator">Calculator</a>
            <a href="#questions">Questions</a>
          </nav>
        )}
        <nav className="site-nav__actions" aria-label="Account">
          {hide !== "login" && <Link to="/login" className="nav-link">Log in</Link>}
          {hide !== "register" && <Link to="/register" className="btn btn--glass btn--small">Create account</Link>}
        </nav>
      </div>
    </header>
  );
}

export default SiteNav;

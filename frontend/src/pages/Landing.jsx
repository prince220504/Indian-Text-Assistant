import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import SiteNav from "../components/SiteNav";
import Tilt from "../components/Tilt";
import Icon from "../components/Icon";
import GlowField from "../components/GlowField";
import useReveal from "../components/useReveal";

// The 8 documents the retriever actually reads (gst-circular.pdf is an image scan with no text, so it is left out).
const DOCS = [
  ["GST frequently asked questions", "GST", "gst-faq.pdf"],
  ["GST concept and status, 2018", "GST", "gst-concept-2018.pdf"],
  ["GST concept and status, 2019", "GST", "gst-concept-2019.pdf"],
  ["GST instruction, 2024", "GST", "gst-instruction-2024.pdf"],
  ["Union Budget 2025-26, income tax", "Income tax", "income-tax-budget-2025.pdf"],
  ["Income tax memorandum", "Income tax", "income-tax-memorandum.pdf"],
  ["TDS on salaries", "TDS", "tds-on-salaries.pdf"],
  ["TDS rate chart", "TDS", "tds-rate-chart.pdf"],
];

// Worked example, computed by the app's own calculator: ₹13,00,000, freelancer, new regime FY 2025-26.
const SHEET = [
  ["Taxable income", "₹13,00,000"],
  ["Standard deduction", "₹0"],
  ["Tax as per slabs", "₹75,000"],
  ["Less: 87A rebate", "₹0"],
  ["Health and education cess (4%)", "₹3,000"],
];

const FACTS = [
  ["page", "Every answer cites a page"],
  ["layers", "GST, income tax and TDS"],
  ["upload", "Reads your Form 16"],
  ["calc", "New-regime calculator"],
  ["ask", "Says when it doesn’t know"],
];

function Landing() {
  useReveal();
  const navigate = useNavigate();
  const [question, setQuestion] = useState("");

  // the hero's working action: the question rides through sign-up and waits in the chat box
  function ask(e) {
    e.preventDefault();
    const q = question.trim();
    if (q) sessionStorage.setItem("pendingQuestion", q);
    navigate(localStorage.getItem("token") ? "/chat" : "/register");
  }

  return (
    <>
      <div className="progress keep-motion" aria-hidden="true" />
      <section className="hero">
        <GlowField />
        <SiteNav sections />
        <div className="container hero__inner" id="main">
          <figure className="glass hero-card">
            <span className="hero-card__handle" aria-hidden="true" />
            <figcaption className="hero-card__source">
              <Icon name="page" /> income-tax-budget-2025.pdf
            </figcaption>
            <div className="hero-card__q">Is income up to ₹12 lakh tax-free under the new regime?</div>
            <div className="glass-inner hero-card__a">
              Yes, other than special-rate income such as capital gains. For salaried taxpayers the limit is ₹12.75&nbsp;lakh, because of the ₹75,000 standard deduction.
            </div>
            <div className="hero-card__foot">
              <span className="tag tag--coral">Page 19</span>
              <span className="hero-card__note">An example answer</span>
            </div>
          </figure>

          <div className="hero__copy">
            <h1>Tax answers you can check.</h1>
            <p className="lead">Plain-English answers on GST, income tax and TDS, each with the government page it came from.</p>
          </div>

          <form className="hero-ask" onSubmit={ask}>
            <label htmlFor="hero-question" className="visually-hidden">Your tax question</label>
            <div className="hero-ask__field glass">
              <input
                id="hero-question" name="question" autoComplete="off"
                placeholder="Ask a tax question…"
                value={question} onChange={(e) => setQuestion(e.target.value)}
              />
              <button type="submit" className="btn btn--primary">Ask <Icon name="arrow" /></button>
            </div>
            <a href="#how" className="nav-link hero-ask__alt">See how it cites</a>
          </form>
        </div>

        <ul className="container hero-facts">
          {FACTS.map(([icon, label], i) => (
            <li key={label} className={i === 0 ? "is-first" : undefined}>
              <Icon name={icon} />
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </section>

      <main className="page-glow">
        <GlowField calm fixed />
        <div className="page-glow__fade" aria-hidden="true" />
        <div className="stages">
          <section className="stage" id="how">
            <div className="container">
              <div className="stage__head" data-reveal>
                <h2>Ask the way you’d ask a CA</h2>
                <p>Type the question as you would say it. No section numbers needed.</p>
              </div>
              <div data-reveal style={{ "--i": 1 }}>
                <Tilt as="figure" className="glass sample">
                  <ul className="sample__asks">
                    {[
                      "My client cut TDS from my invoice. Can I get it back?",
                      "Do I need GST registration if all my clients are abroad?",
                      "What’s the standard deduction this year?",
                    ].map((q, i) => (
                      <li key={q} className="sample__ask" data-reveal style={{ "--i": i + 2 }}>{q}</li>
                    ))}
                  </ul>
                  <figcaption>Examples of how people ask. Yours can be messier.</figcaption>
                </Tilt>
              </div>
            </div>
          </section>

          <section className="stage stage--sheet" id="documents">
            <div className="container">
              <div className="sheet-wrap on-cream">
                <div className="stage__head" data-reveal>
                  <h2>See the page it came from</h2>
                  <p>Answers are drawn from these government documents, page number attached.</p>
                </div>
                <table className="doc-index" data-reveal style={{ "--i": 1 }}>
                  <thead>
                    <tr><th scope="col">Document</th><th scope="col">Topic</th><th scope="col">File</th></tr>
                  </thead>
                  <tbody>
                    {DOCS.map(([title, topic, file], i) => (
                      <tr key={file} data-reveal style={{ "--i": i }}><td>{title}<span className="doc-index__file">{file}</span></td><td>{topic}</td><td>{file}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="stage">
            <div className="container">
              <div className="stage__head" data-reveal>
                <h2>Attach your Form 16</h2>
                <p>Upload the PDF and ask about your own salary and deductions.</p>
              </div>
              <div className="attach-demo">
                <div data-reveal style={{ "--i": 1 }}>
                  <Tilt className="glass attach-demo__box">
                    <span className="attach-demo__file lift"><Icon name="upload" /> Form16_FY2025-26.pdf</span>
                    <p className="attach-demo__q">How much tax was deducted from my salary this year?</p>
                  </Tilt>
                </div>
                <p className="statement" data-reveal style={{ "--i": 2 }}>The file is read for that chat and never saved.</p>
              </div>
            </div>
          </section>

          <section className="stage stage--sheet" id="calculator">
            <div className="container">
              <div className="sheet-wrap on-cream">
                <div className="calc-demo">
                  <div className="calc-demo__side">
                    <div className="calc-demo__head" data-reveal>
                      <h2>Work out what you owe</h2>
                      <p>The calculator applies the new regime slabs for FY 2025-26.</p>
                    </div>
                    <dl className="calc-demo__facts" data-reveal style={{ "--i": 1 }}>
                      <div><dt>Gross income</dt><dd>₹13,00,000 a year</dd></div>
                      <div><dt>Work</dt><dd>Freelancer, so no standard deduction</dd></div>
                      <div><dt>Regime</dt><dd>New, FY 2025-26 (AY 2026-27)</dd></div>
                    </dl>
                  </div>
                  <div data-reveal style={{ "--i": 2 }}>
                    <Tilt className="on-navy sheet-card">
                      <table className="sheet">
                        <caption>Worked example</caption>
                        <tbody>
                          {SHEET.map(([label, value]) => (
                            <tr key={label}><td>{label}</td><td>{value}</td></tr>
                          ))}
                          <tr className="sheet__total"><td>Total tax payable</td><td className="lift">₹78,000</td></tr>
                        </tbody>
                      </table>
                    </Tilt>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="faq" id="questions">
          <div className="container faq__grid">
            <h2 data-reveal>Before you ask</h2>
            <dl className="faq__rows">
              <div className="faq__row" data-reveal style={{ "--i": 0 }}>
                <dt>What if the documents don’t cover it?</dt>
                <dd>It says it can’t answer from its sources, instead of guessing.</dd>
              </div>
              <div className="faq__row" data-reveal style={{ "--i": 1 }}>
                <dt>Does it replace a chartered accountant?</dt>
                <dd>No. Use it to understand the rules, then confirm big decisions with a CA.</dd>
              </div>
              <div className="faq__row" data-reveal style={{ "--i": 2 }}>
                <dt>Who can see my chats?</dt>
                <dd>Only you. Every chat is tied to your account.</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="close">
          <GlowField calm />
          <div className="container close__inner" data-reveal>
            <h2>Bring your next tax question.</h2>
            <Link to="/register" className="btn btn--primary">Create account <Icon name="arrow" /></Link>
          </div>
        </section>
      </main>

      <footer className="colophon">
        <div className="container colophon__inner">
          <Link to="/" className="wordmark" aria-label="Indian Tax Assistant, home"><Icon name="logo" />Indian Tax Assistant</Link>
          <div>
            <p>Answers come from official government tax documents, with the page each one came from. A study aid for freelancers and small businesses, not tax advice.</p>
            <div className="colophon__links">
              <Link to="/login" className="text-link">Log in</Link>
              <Link to="/register" className="text-link">Create account</Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

export default Landing;

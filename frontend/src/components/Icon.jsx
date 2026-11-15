// One small icon set, drawn on a 24px grid with a 1.75 stroke. Always decorative:
// the control around it carries the label, so every icon is aria-hidden.
const PATHS = {
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  clip: "M15.5 7.5l-6.8 6.8a2 2 0 1 0 2.8 2.8l7.1-7.1a4 4 0 0 0-5.7-5.7l-7.1 7.1a6 6 0 0 0 8.5 8.5l5.7-5.7",
  send: "M5 12h13M13 6l6 6-6 6",
  back: "M19 12H6M11 6l-6 6 6 6",
  page: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5",
  layers: "M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4",
  upload: "M7 3h7l4 4v14H7zM14 3v4h4M12 18v-6M9.5 14.5L12 12l2.5 2.5",
  ask: "M12 20a8 8 0 1 0-8-8M4 20l2.5-2.5M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5M12 16.5h0",
  arrow: "M7 17L17 7M9 7h8v8",
  calc: "M6 3h12v18H6zM9 7h6M9 11h0M12 11h0M15 11h0M9 14h0M12 14h0M15 14h0M9 17h0M12 17h0M15 17h0",
  chat: "M4 5h16v11H9l-5 4z",
  logo: "M7 3h7l4 4v14H7zM14 3v4h4M9.5 10.5h6M9.5 13h6M11 10.5c3.2 0 3.2 5 0 5H9.5l4.5 3.5",
  logout:"M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10",
};

function Icon({ name }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export default Icon;

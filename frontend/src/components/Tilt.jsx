import { useRef } from "react";

// CSS 3D tilt: the card leans toward the pointer. Only on a real hover device with motion allowed;
// everywhere else it is a plain block. Children marked .lift sit forward in depth.
const canTilt = () => window.matchMedia("(hover: hover) and (prefers-reduced-motion: no-preference)").matches;

function Tilt({ as: Tag = "div", className = "", max = 7, children, ...rest }) {
  const ref = useRef(null);
  const frame = useRef(0);

  function move(e) {
    if (!canTilt()) return;
    const el = ref.current;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.setProperty("--ry", `${(x * max).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${(-y * max).toFixed(2)}deg`);
    });
  }
  function leave() {
    cancelAnimationFrame(frame.current);
    ref.current.style.setProperty("--rx", "0deg");
    ref.current.style.setProperty("--ry", "0deg");
  }

  return (
    <Tag ref={ref} className={`tilt ${className}`} onPointerMove={move} onPointerLeave={leave} {...rest}>
      {children}
    </Tag>
  );
}

export default Tilt;

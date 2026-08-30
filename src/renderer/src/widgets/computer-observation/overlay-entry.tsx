import { createRoot } from "react-dom/client";
import { useComputerOverlay } from "@/features/computer-observation/useComputerOverlay";
import cursor from "@/assets/icons/ai-cursor.svg";
import styles from "./ComputerOverlay.module.css";

function Overlay(): React.JSX.Element {
  const state = useComputerOverlay();
  const bar = new URLSearchParams(location.search).get("surface") === "bar";
  if (bar)
    return (
      <div
        className={styles.bar}
        role="status"
        data-testid="computer-control-bar"
      >
        <span>
          {state.state === "paused"
            ? "已暂停"
            : state.state === "cancelled"
              ? "正在取消…"
              : state.state === "starting"
                ? "正在准备电脑操作…"
                : "AI正在使用你的电脑"}
        </span>
        {state.state === "paused" && (
          <button onClick={() => window.computerOverlay.resume()}>继续</button>
        )}
        <button
          onClick={() => window.computerOverlay.cancel()}
          disabled={state.state === "cancelled"}
        >
          取消
        </button>
      </div>
    );
  return (
    <div
      className={styles.edge}
      data-paused={state.state !== "running"}
      aria-hidden="true"
    >
      {state.state === "running" && (
        <div
          className={styles.cursor}
          style={{
            transform: `translate(${state.cursor.x}px, ${state.cursor.y}px)`,
          }}
        >
          <img src={cursor} alt="" />
          {state.clickSequence > 0 && (
            <span key={state.clickSequence} className={styles.ripple} />
          )}
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Overlay />);

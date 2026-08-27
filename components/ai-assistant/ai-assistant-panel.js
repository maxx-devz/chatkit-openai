import Image from "next/image";

import Workspace from "@/components/workspace";
import aocIcon from "@/aoc-icon.png";
import styles from "./ai-assistant-panel.module.css";

export default function AiAssistantPanel({
  config,
  height = "680px",
  minHeight = "540px",
}) {
  return (
    <section
      className={styles.panel}
      id="ai-assistant"
      style={{
        "--assistant-panel-height": height,
        "--assistant-panel-min-height": minHeight,
      }}
      aria-labelledby="ai-assistant-title"
    >
      <header className={styles.header}>
        <span className={styles.icon} aria-hidden="true">
          <Image src={aocIcon} alt="" />
        </span>
        <div>
          <h2 id="ai-assistant-title">AI Assistant</h2>
          <p>Ask questions and continue saved conversations</p>
        </div>
        <span className={styles.badge}>Prototype</span>
      </header>
      <div className={styles.body}>
        <Workspace config={config} embedded />
      </div>
    </section>
  );
}

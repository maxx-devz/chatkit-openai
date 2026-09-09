import Image from "next/image";
import { headers } from "next/headers";

import Workspace from "@/components/workspace";
import ChatKitAssistant from "./chatkit-assistant";
import aocIcon from "@/aoc-icon.png";
import styles from "./ai-assistant-panel.module.css";

export default async function AiAssistantPanel({
  config,
  clientId,
  clientName,
  userId,
  height = "680px",
  minHeight = "540px",
}) {
  const nonce = (await headers()).get("x-nonce") || "";
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
        <span className={styles.badge}>Private</span>
      </header>
      <div className={styles.body}>
        {process.env.CLIENT_ASSISTANT_UI === "legacy" ? (
          <Workspace config={config} embedded />
        ) : (
          <ChatKitAssistant
            key={`${clientId}:${userId}`}
            clientId={clientId}
            clientName={clientName}
            domainKey={process.env.NEXT_PUBLIC_CHATKIT_DOMAIN_KEY || ""}
            nonce={nonce}
          />
        )}
      </div>
    </section>
  );
}

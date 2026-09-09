import Image from "next/image";
import { headers } from "next/headers";

import ChatKitAssistant from "./chatkit-assistant";
import aocIcon from "@/aoc-icon.png";
import styles from "./ai-assistant-panel.module.css";
import { clientAppearance } from "@/lib/builder-data";

export default async function AiAssistantPanel({
  clientId,
  clientName,
  userId,
  height = "680px",
  minHeight = "540px",
}) {
  const nonce = (await headers()).get("x-nonce") || "";
  const appearance = await clientAppearance(clientId);
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
          <h2 id="ai-assistant-title">AOC-GPT</h2>
          <p>Ask questions and continue saved conversations</p>
        </div>
        <span className={styles.badge}>Private</span>
      </header>
      <div className={styles.body}>
        <ChatKitAssistant
          key={`${clientId}:${userId}`}
          clientId={clientId}
          clientName={clientName}
          domainKey={process.env.NEXT_PUBLIC_CHATKIT_DOMAIN_KEY || ""}
          nonce={nonce}
          appearance={appearance}
        />
      </div>
    </section>
  );
}

import Image from "next/image";

import LoginForm from "@/components/auth/login-form";
import aocLogo from "@/aoc-logo.png";
import { isPortalAuthConfigured } from "@/lib/auth";
import styles from "@/components/auth/login.module.css";

export const metadata = {
  title: "Client sign in | AOC Portal",
};

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="login-title">
        <div className={styles.brand}>
          <Image
            className={styles.brandLogo}
            src={aocLogo}
            alt="Always Open Commerce"
            priority
          />
        </div>
        <div className={styles.intro}>
          <h1 id="login-title" style={{textAlign:"center"}}>Welcome back</h1>
          <p style={{textAlign:"center"}}>
            Sign in to your private client workspace, saved conversations, and
            AOC AI assistant.
          </p>
        </div>
        <LoginForm configured={isPortalAuthConfigured()} />
        <p className={styles.footer}>Always Open Commerce Client Portal</p>
      </section>
    </main>
  );
}

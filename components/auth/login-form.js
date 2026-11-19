"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { brandPath } from "@/lib/agency-branding-policy";
import styles from "./login.module.css";

export default function LoginForm({ configured, agencySlug = null }) {
  const router = useRouter();
  const destination=screen=>agencySlug?brandPath(agencySlug,screen):screen==="clients"?"/":"/account/"+screen;
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (!configured || status === "submitting") return;

    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");

    setStatus("submitting");
    setError("");

    try {
      const result = await authClient.signIn.username({
        username,
        password,
        rememberMe: true,
      });

      if (result.error) {
        setError(
          "Sign-in could not be completed. Check your credentials and email verification.",
        );
        setStatus("idle");
        return;
      }

      if (result.data?.twoFactorRedirect) { router.replace(destination("mfa")); return; }
      const security = await fetch("/api/account/security", { cache: "no-store" }).then(r => r.ok ? r.json() : null);
      router.replace(security?.required && !security.assured ? destination("security") : destination("clients"));
      router.refresh();
    } catch {
      setError("Login is temporarily unavailable. Please try again.");
      setStatus("idle");
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label>
        <span>Username</span>
        <input
          autoCapitalize="none"
          autoComplete="username"
          autoCorrect="off"
          disabled={!configured || status === "submitting"}
          name="username"
          placeholder="Username"
          required
          spellCheck="false"
          type="text"
        />
      </label>

      <label>
        <span>Password</span>
        <input
          autoComplete="current-password"
          disabled={!configured || status === "submitting"}
          minLength={8}
          name="password"
          placeholder="Enter your password"
          required
          type="password"
        />
      </label>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {!configured ? (
        <p className={styles.setupNotice} role="status">
          Login setup is incomplete. Add the three server environment variables
          listed in the README, then restart the app.
        </p>
      ) : null}

      <button disabled={!configured || status === "submitting"} type="submit">
        {status === "submitting" ? "Signing in..." : "Sign in to portal"}
      </button>

      <p><a href={destination("recovery")}>Recover password or verify email</a> · <a href={destination("security")}>Account security</a></p>
      <p className={styles.help}>
        Accounts are created privately by Always Open Commerce. There is no
        public registration page.
      </p>
    </form>
  );
}

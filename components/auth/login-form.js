"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import styles from "./login.module.css";

export default function LoginForm({ configured }) {
  const router = useRouter();
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
          result.error.message
            || "The username or password is incorrect.",
        );
        setStatus("idle");
        return;
      }

      router.replace("/");
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

      <p className={styles.help}>
        Accounts are created privately by Always Open Commerce. There is no
        public registration page.
      </p>
    </form>
  );
}

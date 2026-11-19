import Link from "next/link";
import SignOutButton from "@/components/auth/sign-out-button";
import styles from "@/components/auth/login.module.css";
export default function AccessDenied({ title = "Platform staff access required", setup = false }) {
  return <main className={styles.page}><section className={styles.card}><h1>{title}</h1><p>{setup ? "The local console needs its reviewed database migration and private authentication setup." : "This account does not have permission to open this workspace."}</p><p><Link href="/">Return to your portal</Link></p><SignOutButton /></section></main>;
}

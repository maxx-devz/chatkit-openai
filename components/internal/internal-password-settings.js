'use client';

import { useState } from 'react';
import { passwordValidationMessage } from '@/lib/input-validation';
import styles from './internal-user-dashboard.module.css';

export default function InternalPasswordSettings({ username }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [currentError, setCurrentError] = useState('');
  const [newError, setNewError] = useState('');
  const [confirmationError, setConfirmationError] = useState('');
  const [status, setStatus] = useState('');

  async function changePassword(event) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const currentPassword = fields.get('currentPassword');
    const newPassword = fields.get('newPassword');
    const confirmation = fields.get('confirmPassword');
    const passwordError = passwordValidationMessage(newPassword, username);
    const mismatch = newPassword === confirmation ? '' : 'The new passwords do not match.';
    setError('');
    setStatus('');
    setCurrentError('');
    setNewError(passwordError);
    setConfirmationError(mismatch);
    if (passwordError || mismatch) {
      form.elements.namedItem(passwordError ? 'newPassword' : 'confirmPassword')?.focus();
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/internal/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.changed !== true) {
        const message = payload?.error || 'Your password could not be changed.';
        if (payload?.code === 'invalid_current_password') {
          setCurrentError(message);
          form.elements.namedItem('currentPassword')?.focus();
        } else if (payload?.code === 'invalid_new_password') {
          setNewError(message);
          form.elements.namedItem('newPassword')?.focus();
        } else setError(message);
        return;
      }
      form.reset();
      setStatus('Password updated. Your other sessions have been signed out.');
    } catch {
      setError('Your password could not be changed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return <div className={`${styles.grid} ${styles.singleColumnGrid}`}>
    <section className={`${styles.panel} ${styles.settingsPanel}`} id="account-security">
      <div className={styles.sectionHeading}><div><h2>Account security</h2>
        <p>Change your portal password using your current password.</p></div></div>
      {status ? <p className={styles.passwordStatus} role="status">{status}</p> : null}
      {error ? <p className={styles.passwordError} role="alert">{error}</p> : null}
      <form className={styles.passwordForm} onSubmit={changePassword}>
        <label htmlFor="current-internal-password">Current password</label>
        <input id="current-internal-password" name="currentPassword" type="password" required
          maxLength="128" autoComplete="current-password" aria-invalid={Boolean(currentError)}
          aria-describedby={currentError ? 'current-internal-password-error' : undefined} />
        {currentError ? <small id="current-internal-password-error" className={styles.passwordError}
          role="alert">{currentError}</small> : null}
        <label htmlFor="new-internal-password">New password</label>
        <input id="new-internal-password" name="newPassword" type="password" required
          maxLength="128" autoComplete="new-password" aria-invalid={Boolean(newError)}
          aria-describedby={`new-internal-password-help${newError ? ' new-internal-password-error' : ''}`} />
        <small id="new-internal-password-help">Use 12–128 characters and at least three of lowercase letters, uppercase letters, numbers, and symbols. Do not include your username.</small>
        {newError ? <small id="new-internal-password-error" className={styles.passwordError}
          role="alert">{newError}</small> : null}
        <label htmlFor="confirm-internal-password">Confirm new password</label>
        <input id="confirm-internal-password" name="confirmPassword" type="password" required
          maxLength="128" autoComplete="new-password" aria-invalid={Boolean(confirmationError)}
          aria-describedby={confirmationError ? 'confirm-internal-password-error' : undefined} />
        {confirmationError ? <small id="confirm-internal-password-error" className={styles.passwordError}
          role="alert">{confirmationError}</small> : null}
        <button type="submit" disabled={busy}>{busy ? 'Updating password...' : 'Update password'}</button>
      </form>
    </section>
  </div>;
}

'use client';

import { useRef, useState } from 'react';
import { passwordValidationMessage } from '@/lib/input-validation';
import styles from '../admin/admin-dashboard.module.css';

export default function InternalPasswordReset({ target, onReset }) {
  const dialogRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [currentError, setCurrentError] = useState('');
  const [newError, setNewError] = useState('');
  const [confirmError, setConfirmError] = useState('');

  function openDialog() {
    dialogRef.current?.querySelector('form')?.reset();
    setError('');
    setCurrentError('');
    setNewError('');
    setConfirmError('');
    dialogRef.current?.showModal();
  }

  async function resetPassword(event) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const currentPassword = fields.get('currentPassword');
    const newPassword = fields.get('newPassword');
    const mismatch = newPassword === fields.get('confirmPassword') ? '' : 'The new passwords do not match.';
    const passwordError = passwordValidationMessage(newPassword, target.username);
    setError('');
    setCurrentError('');
    setNewError(passwordError);
    setConfirmError(mismatch);
    if (passwordError || mismatch) {
      form.elements.namedItem(passwordError ? 'newPassword' : 'confirmPassword')?.focus();
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/internal/password', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: target.id, currentPassword, newPassword }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.reset !== true) {
        const message = payload?.error || 'The password could not be reset.';
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
      dialogRef.current?.close();
      onReset(`${target.name}'s password was reset. Their existing sessions were signed out. Share the new password securely.`);
    } catch {
      setError('The password could not be reset. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button className={styles.resetPasswordButton} type="button" onClick={openDialog}>Reset password</button>
    <dialog className={styles.createDialog} ref={dialogRef} aria-labelledby="internal-reset-title">
      <form onSubmit={resetPassword}>
        <header><div><p>Account security</p><h2 id="internal-reset-title">Reset password for {target.name}</h2></div>
          <button type="button" aria-label="Close" disabled={busy} onClick={() => dialogRef.current?.close()}>×</button></header>
        <p className={styles.dialogIntro}>Enter your own current password to confirm this reset. The selected user’s existing portal sessions will be signed out. Share the new password securely.</p>
        <div className={styles.dialogGrid}>
          <div className={`${styles.dialogWide} ${styles.passwordField}`}>
            <label htmlFor="manager-current-password"><span>Your current password</span><input
              id="manager-current-password" name="currentPassword" type="password" maxLength="128" required
              autoComplete="current-password" aria-invalid={Boolean(currentError)}
              aria-describedby={currentError ? 'manager-current-password-error' : undefined} /></label>
            {currentError ? <small id="manager-current-password-error" className={styles.passwordFieldError}
              role="alert">{currentError}</small> : null}
          </div>
          <div className={`${styles.dialogWide} ${styles.passwordField}`}>
            <label htmlFor="reset-new-password"><span>New password for this user</span><input
              id="reset-new-password" name="newPassword" type="password" maxLength="128" required
              autoComplete="new-password" aria-invalid={Boolean(newError)}
              aria-describedby={`reset-new-password-help${newError ? ' reset-new-password-error' : ''}`} /></label>
            <small id="reset-new-password-help">Use 12–128 characters and at least three of lowercase letters, uppercase letters, numbers, and symbols. Do not include the account username.</small>
            {newError ? <small id="reset-new-password-error" className={styles.passwordFieldError}
              role="alert">{newError}</small> : null}
          </div>
          <div className={`${styles.dialogWide} ${styles.passwordField}`}>
            <label htmlFor="reset-confirm-password"><span>Confirm new password</span><input
              id="reset-confirm-password" name="confirmPassword" type="password" maxLength="128" required
              autoComplete="new-password" aria-invalid={Boolean(confirmError)}
              aria-describedby={confirmError ? 'reset-confirm-password-error' : undefined} /></label>
            {confirmError ? <small id="reset-confirm-password-error" className={styles.passwordFieldError}
              role="alert">{confirmError}</small> : null}
          </div>
        </div>
        {error ? <p className={styles.dialogError} role="alert">{error}</p> : null}
        <footer><button type="button" disabled={busy} onClick={() => dialogRef.current?.close()}>Cancel</button>
          <button type="submit" disabled={busy}>{busy ? 'Resetting...' : 'Reset password'}</button></footer>
      </form>
    </dialog>
  </>;
}

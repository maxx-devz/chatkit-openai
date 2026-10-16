import InternalSyncSettings from '@/components/internal/internal-sync-settings';
import InternalSettingsControls from '@/components/internal/internal-settings-controls';
import styles from '@/components/internal/internal-user-dashboard.module.css';

const users = [{ id: '1', username: 'fixture.admin', name: 'Fixture Admin', position: 'team_member',
  positionLabel: 'Team Member', panelAccess: ['overview', 'account_settings'], roles: ['internal_admin'],
  active: true, hubstaffUserId: '101', connected: false, createdAt: '2026-01-01T00:00:00Z' }];

export default function SyncSettingsFixture() {
  return <main className={styles.main}>
    <section className={styles.intro}><div><p className={styles.eyebrow}>INTERNAL SETTINGS</p>
      <h1>Internal user access</h1><p>Manage accounts, positions, panels, and approved Hubstaff mappings.</p></div></section>
    <InternalSettingsControls initialInternalUsers={users} schemaReady
      canManageOwnAccount canManageRoles canResetPasswords isInternalAdmin viewerId="1" />
    <InternalSyncSettings />
  </main>;
}

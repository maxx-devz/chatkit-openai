export function internalSettingsViewPolicy({
  viewerId,
  internalUser,
  internalUsers = [],
  readOnly = false,
  canManageOwnAccount = false,
}) {
  const roles = internalUser?.roles || [];
  const isSelf = Boolean(internalUser && String(internalUser.id) === String(viewerId));
  const hasProtectedRole = roles.includes('internal_access_manager') || roles.includes('internal_admin');
  const canEdit = Boolean(internalUser) && !readOnly && (!isSelf || canManageOwnAccount);
  const statusLockedByRole = Boolean(internalUser?.active && hasProtectedRole);
  const isLastActiveManager = Boolean(internalUser?.active && roles.includes('internal_access_manager')
    && internalUsers.filter(user => user.active && user.roles?.includes('internal_access_manager')).length <= 1);

  return {
    isSelf,
    canEdit,
    canChangeStatus: canEdit && !statusLockedByRole,
    statusLockedByRole,
    isLastActiveManager,
  };
}

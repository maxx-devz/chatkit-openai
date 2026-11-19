"use client";

import { createAuthClient } from "better-auth/react";
import { usernameClient, twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [usernameClient(), twoFactorClient()],
});

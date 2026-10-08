"use client";

import * as React from "react";

import type { CurrentUser } from "@/lib/current-user";

const CurrentUserContext = React.createContext<CurrentUser | null>(null);

/** Server-resolved identity, handed to client components without a fetch. */
export function CurrentUserProvider({
  user,
  children,
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser() {
  return React.useContext(CurrentUserContext);
}

import type { ReactNode } from "react";

import { GamesAuthGate } from "@/components/games/GamesAuthGate";
import { getUser } from "@/lib/server/session";

export default async function GamesLayout({ children }: { children: ReactNode }) {
  const user = await getUser();

  if (!user) return <GamesAuthGate />;
  return children;
}

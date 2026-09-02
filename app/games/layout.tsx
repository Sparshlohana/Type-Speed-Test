import { Suspense, type ReactNode } from "react";

import { GamesAuthGate } from "@/components/games/GamesAuthGate";
import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";
import { getUser } from "@/lib/server/session";

function GamesAccessSkeleton() {
  return (
    <div className="relative isolate grid min-h-[calc(100svh-4rem)] place-items-center overflow-hidden bg-raid-bg px-5 py-12 text-raid-text">
      <LoadingStatus label="Checking arcade access" />
      <div aria-hidden className="typeraid-grid absolute inset-0 -z-20 bg-[size:52px_52px] [mask-image:radial-gradient(circle_at_center,black,transparent_78%)]" />
      <section className="w-full max-w-xl rounded-[2rem] border border-raid-border bg-raid-surface-soft p-7 text-center sm:p-11">
        <Skeleton className="mx-auto h-20 w-20 rounded-[1.65rem] bg-raid-fill-hover" />
        <Skeleton className="mx-auto mt-6 h-3 w-36 bg-raid-fill-hover" />
        <Skeleton className="mx-auto mt-4 h-9 w-80 max-w-full bg-raid-fill-hover" />
        <div className="mx-auto mt-4 max-w-md space-y-2">
          <Skeleton className="h-4 w-full bg-raid-fill-hover" />
          <Skeleton className="mx-auto h-4 w-4/5 bg-raid-fill-hover" />
        </div>
        <Skeleton className="mx-auto mt-8 h-12 w-full max-w-sm rounded-xl bg-raid-fill-hover" />
        <Skeleton className="mx-auto mt-8 h-3 w-64 max-w-full bg-raid-fill-hover" />
      </section>
    </div>
  );
}

async function GamesAccess({ children }: { children: ReactNode }) {
  const user = await getUser();

  if (!user) return <GamesAuthGate />;
  return children;
}

export default function GamesLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<GamesAccessSkeleton />}>
      <GamesAccess>{children}</GamesAccess>
    </Suspense>
  );
}

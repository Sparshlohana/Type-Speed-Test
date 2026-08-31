import type { NextRequest } from "next/server";

import {
  getLeaderboardRank,
  getTopLeaderboard,
  toLeaderboardEntries,
} from "@/lib/server/leaderboard";
import { getUser } from "@/lib/server/session";

const MODE_KEY_PATTERN = /^(time|words|quote):[a-z0-9-]+$/;

export async function GET(request: NextRequest) {
  const modeKey = request.nextUrl.searchParams.get("modeKey") ?? "";
  if (!MODE_KEY_PATTERN.test(modeKey)) {
    return Response.json({ entries: [], yourRank: null }, { status: 400 });
  }

  const [topEntries, user] = await Promise.all([getTopLeaderboard(modeKey), getUser()]);
  const yourRank = user
    ? await getLeaderboardRank(modeKey, user.id, topEntries)
    : null;

  return Response.json(
    {
      entries: toLeaderboardEntries(topEntries, user?.id),
      yourRank,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

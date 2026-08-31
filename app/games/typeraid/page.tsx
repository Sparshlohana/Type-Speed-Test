import type { Metadata } from "next";

import { TypeRaidGame } from "@/components/games/TypeRaidGame";

export const metadata: Metadata = {
  title: "TypeRaid — TypeFlow Arcade",
  description: "A typing roguelike where every perfect word becomes an attack.",
};

export default function TypeRaidPage() {
  return <TypeRaidGame />;
}

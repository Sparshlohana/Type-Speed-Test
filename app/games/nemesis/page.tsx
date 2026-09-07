import type { Metadata } from "next";

import { NemesisGame } from "@/components/games/NemesisGame";

export const metadata: Metadata = {
  title: "Nemesis — TypeFlow Arcade",
  description: "Duel an opponent forged from the keys and words you actually miss, and that keeps learning while you type.",
};

export default function NemesisPage() {
  return <NemesisGame />;
}

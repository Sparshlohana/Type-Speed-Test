import type { Metadata } from "next";

import { WordfallGame } from "@/components/games/WordfallGame";

export const metadata: Metadata = {
  title: "Wordfall — TypeFlow Arcade",
  description: "Type falling words before they cross the danger line in an endless survival run.",
};

export default function WordfallPage() {
  return <WordfallGame />;
}

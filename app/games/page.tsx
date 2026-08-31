import Link from "next/link";

function SwordMark() {
  return (
    <svg viewBox="0 0 80 80" fill="none" aria-hidden className="h-20 w-20">
      <path d="M53 11 69 7l-4 16-30 30-8-8 26-34Z" fill="currentColor" opacity=".95" />
      <path d="m27 42 11 11-6 6-11-11 6-6Z" fill="white" opacity=".9" />
      <path d="m22 55 4 4-12 12-4-4 12-12Z" fill="currentColor" />
      <path d="M55 14 64 11l-2 9-25 25-7-7 25-24Z" fill="white" opacity=".28" />
    </svg>
  );
}

export default function GamesPage() {
  return (
    <div className="relative mx-auto w-full max-w-6xl flex-1 overflow-hidden px-5 py-10 sm:py-14">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 -z-10 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_16%,transparent),transparent_67%)] blur-2xl" />

      <header className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">TypeFlow arcade</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-text sm:text-4xl">
          Your keyboard is the controller.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-sub">
          Fast, focused typing games built around accuracy, rhythm, and just enough chaos.
        </p>
      </header>

      <section className="mt-10 grid gap-5 lg:grid-cols-[1.45fr_0.55fr]" aria-label="Typing games">
        <Link
          href="/games/typeraid"
          className="group relative min-h-[28rem] overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[#100d1b] p-6 text-white shadow-[0_28px_80px_-42px_color-mix(in_srgb,var(--accent)_75%,transparent)] transition duration-300 hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--accent)_65%,var(--border))] sm:p-9"
        >
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_78%_24%,rgba(124,92,255,.34),transparent_30%),radial-gradient(circle_at_18%_90%,rgba(255,91,137,.18),transparent_32%),linear-gradient(135deg,rgba(255,255,255,.035),transparent_42%)]" />
          <div aria-hidden className="absolute -right-10 top-12 h-64 w-64 rotate-12 rounded-[35%_65%_55%_45%] border border-white/10 bg-white/[.025] transition-transform duration-700 group-hover:rotate-[22deg] group-hover:scale-110" />

          <div className="relative flex h-full min-h-[24rem] flex-col">
            <div className="flex items-start justify-between gap-4">
              <span className="rounded-full border border-white/15 bg-white/[.07] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
                Playable now
              </span>
              <div className="text-[#9d86ff] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                <SwordMark />
              </div>
            </div>

            <div className="mt-auto max-w-xl">
              <p className="font-mono text-xs text-[#9d86ff]">01 / dungeon run</p>
              <h2 className="mt-2 text-5xl font-bold tracking-[-0.06em] sm:text-6xl">TypeRaid</h2>
              <p className="mt-4 max-w-md text-sm leading-6 text-white/58">
                Turn perfect words into attacks, build ruthless combos, choose upgrades, and type your way through the Void Compiler.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <span className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-[#100d1b] transition-transform group-hover:translate-x-1">
                  Enter the raid →
                </span>
                <span className="text-xs text-white/42">4 encounters · 1 final boss · endless replay</span>
              </div>
            </div>
          </div>
        </Link>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-3xl border border-dashed border-border bg-surface/55 p-6">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-border bg-bg font-mono text-lg text-sub">02</div>
            <h2 className="mt-8 text-lg font-semibold text-text">Next cabinet</h2>
            <p className="mt-2 text-sm leading-6 text-sub">The arcade is ready for racers, rhythm runs, and whatever arrives next.</p>
            <span className="mt-6 inline-block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Coming soon</span>
          </div>
          <div className="rounded-3xl border border-border bg-surface p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Arcade rule</p>
            <p className="mt-3 text-lg font-medium leading-7 text-text">Speed helps. Accuracy keeps you alive.</p>
            <p className="mt-3 text-xs leading-5 text-sub">Every game still trains real typing skill—even when a monster is trying to delete you.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

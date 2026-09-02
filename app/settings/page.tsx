"use client";

import { useState } from "react";

import { clearResults } from "@/app/actions/results";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";
import { Toast } from "@/components/ui/Toast";
import { Toggle } from "@/components/ui/Toggle";
import { useSettings } from "@/hooks/useSettings";
import { useSession } from "@/lib/auth-client";
import { playSound } from "@/lib/sound";
import { progressionStore } from "@/lib/progression-store";
import { resultsStore } from "@/lib/store";
import {
  ACCENT_HEX,
  type AccentName,
  type CaretStyle,
  type GhostOpponent,
  type ThemePreference,
} from "@/lib/storage";

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

const CARETS: { value: CaretStyle; label: string }[] = [
  { value: "line", label: "Line" },
  { value: "block", label: "Block" },
  { value: "underline", label: "Underline" },
];

const GHOST_OPPONENTS: { value: GhostOpponent; label: string }[] = [
  { value: "personal-best", label: "Personal best" },
  { value: "last-attempt", label: "Last attempt" },
];

const ACCENTS = Object.keys(ACCENT_HEX) as AccentName[];

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border py-5 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div>
        <h2 className="text-sm font-medium text-text">{title}</h2>
        <p className="mt-0.5 text-xs text-sub">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { settings, update, reset } = useSettings();
  const { data: session, isPending } = useSession();
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const handleReset = async () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    resultsStore.clear();
    progressionStore.clear();
    reset();
    setConfirmingReset(false);
    if (session?.user) {
      setResetting(true);
      try {
        await clearResults();
        resultsStore.setServerResults([]);
        setToast("All local and account data cleared");
      } catch {
        setToast("Local data cleared, but account data could not be cleared");
      } finally {
        setResetting(false);
      }
    } else {
      setToast("All local data cleared");
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-text">Settings</h1>
      <p className="mt-1 text-sm text-sub">
        Preferences are saved to this browser; signed-in results sync to your account.
      </p>

      <div className="mt-8 rounded-xl border border-border bg-surface px-5">
        <Row title="Theme" description="Dark, light, or follow your operating system.">
          <Segmented
            options={THEMES}
            value={settings.theme}
            onChange={(theme) => update({ theme })}
            ariaLabel="Theme"
            size="sm"
          />
        </Row>

        <Row title="Accent colour" description="Used for the caret, charts, and highlights.">
          <div className="flex items-center gap-2">
            {ACCENTS.map((accent) => {
              const active = settings.accent === accent;
              return (
                <button
                  key={accent}
                  type="button"
                  aria-label={accent}
                  aria-pressed={active}
                  onClick={() => update({ accent })}
                  className={`h-7 w-7 rounded-full transition-transform duration-200 ease-[var(--ease)] hover:scale-110 ${
                    active ? "ring-2 ring-offset-2 ring-offset-[var(--surface)]" : ""
                  }`}
                  style={{
                    background: ACCENT_HEX[accent],
                    boxShadow: active ? `0 0 0 2px ${ACCENT_HEX[accent]}` : undefined,
                  }}
                />
              );
            })}
          </div>
        </Row>

        <Row title="Caret style" description="How the cursor is drawn in the typing area.">
          <Segmented
            options={CARETS}
            value={settings.caretStyle}
            onChange={(caretStyle) => update({ caretStyle })}
            ariaLabel="Caret style"
            size="sm"
          />
        </Row>

        <Row title="Smooth caret" description="Animate the caret between characters.">
          <Toggle
            checked={settings.smoothCaret}
            onChange={(smoothCaret) => update({ smoothCaret })}
            label="Smooth caret"
          />
        </Row>

        <Row title="Sound effects" description="A soft click on each key, a thud on mistakes.">
          <Toggle
            checked={settings.sound}
            onChange={(sound) => {
              update({ sound });
              if (sound) playSound("key");
            }}
            label="Sound effects"
          />
        </Row>

        <Row
          title="Ghost race"
          description="Race a saved pace from the same test mode while you type."
        >
          <Toggle
            checked={settings.ghostRace}
            onChange={(ghostRace) => update({ ghostRace })}
            label="Ghost race"
          />
        </Row>

        {settings.ghostRace ? (
          <Row
            title="Ghost opponent"
            description="Chase your fastest result or replay your most recent attempt."
          >
            <Segmented
              options={GHOST_OPPONENTS}
              value={settings.ghostOpponent}
              onChange={(ghostOpponent) => update({ ghostOpponent })}
              ariaLabel="Ghost opponent"
              size="sm"
            />
          </Row>
        ) : null}

        <Row
          title="Username"
          description={
            isPending
              ? "Checking your account details."
              : session?.user
              ? "Your name and email come from your Google account."
              : "Shown in your local avatar."
          }
        >
          {isPending ? (
            <div className="w-48 space-y-2">
              <LoadingStatus label="Loading account details" />
              <Skeleton className="ml-auto h-4 w-28" />
              <Skeleton className="ml-auto h-3 w-40" />
            </div>
          ) : session?.user ? (
            <div className="text-right">
              <p className="text-sm font-medium text-text">{session.user.name}</p>
              <p className="text-xs text-sub">{session.user.email}</p>
            </div>
          ) : (
            <input
              value={settings.username}
              onChange={(event) => update({ username: event.target.value.slice(0, 24) })}
              className="w-48 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors duration-200 ease-[var(--ease)] focus:border-accent"
              aria-label="Username"
            />
          )}
        </Row>
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-medium text-text">Reset all data</h2>
          <p className="mt-0.5 text-xs text-sub">
            Deletes every stored result{session?.user ? " from this device and your account" : ""} and
            returns settings to their defaults.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {confirmingReset ? (
            <Button variant="ghost" onClick={() => setConfirmingReset(false)}>
              Cancel
            </Button>
          ) : null}
          <Button variant="danger" onClick={handleReset} disabled={resetting || isPending}>
            {resetting ? (
              <>
                <LoadingStatus label="Deleting account data" />
                <Skeleton className="h-4 w-28 bg-[color-mix(in_srgb,var(--error)_18%,var(--surface))]" />
              </>
            ) : confirmingReset ? "Yes, delete everything" : "Reset"}
          </Button>
        </div>
      </div>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

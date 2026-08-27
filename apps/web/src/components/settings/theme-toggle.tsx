"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";

const OPTIONS: ReadonlyArray<{
  value: ThemePreference;
  label: string;
  icon: React.ReactNode;
}> = [
  { value: "light", label: "Light", icon: <Sun /> },
  { value: "dark", label: "Dark", icon: <Moon /> },
  { value: "system", label: "System", icon: <Monitor /> },
];

/** Theme switcher (PRD §37, §40). */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    // Toggle buttons rather than role="radio": a radiogroup owes users arrow-key
    // navigation and a roving tabindex, which this control does not implement.
    <div
      aria-label="Theme"
      className="inline-flex flex-wrap items-center gap-1 rounded-lg border p-1"
    >
      {OPTIONS.map((option) => (
        <Button
          key={option.value}
          aria-pressed={preference === option.value}
          variant={preference === option.value ? "secondary" : "ghost"}
          size="sm"
          className="gap-1.5"
          onClick={() => setPreference(option.value)}
        >
          {option.icon}
          {option.label}
        </Button>
      ))}
    </div>
  );
}

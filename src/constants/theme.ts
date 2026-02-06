import type { AccentColor } from "@/types";

export interface AccentColorOption {
  value: AccentColor;
  label: string;
  color: string;
}

export const ACCENT_COLOR_OPTIONS: AccentColorOption[] = [
  { value: "default", label: "Default", color: "hsl(0, 0%, 9%)" },
  { value: "zinc", label: "Zinc", color: "hsl(240, 6%, 25%)" },
  { value: "slate", label: "Slate", color: "hsl(222, 30%, 25%)" },
  { value: "stone", label: "Stone", color: "hsl(24, 10%, 35%)" },
  { value: "gray", label: "Gray", color: "hsl(220, 9%, 50%)" },
  { value: "neutral", label: "Neutral", color: "hsl(0, 0%, 60%)" },
  { value: "red", label: "Red", color: "hsl(0, 84%, 50%)" },
  { value: "rose", label: "Rose", color: "hsl(340, 82%, 55%)" },
  { value: "orange", label: "Orange", color: "hsl(24, 95%, 53%)" },
  { value: "amber", label: "Amber", color: "hsl(38, 92%, 50%)" },
  { value: "yellow", label: "Yellow", color: "hsl(48, 96%, 53%)" },
  { value: "lime", label: "Lime", color: "hsl(84, 81%, 44%)" },
  { value: "green", label: "Green", color: "hsl(142, 71%, 35%)" },
  { value: "emerald", label: "Emerald", color: "hsl(160, 84%, 39%)" },
  { value: "teal", label: "Teal", color: "hsl(173, 80%, 40%)" },
  { value: "cyan", label: "Cyan", color: "hsl(189, 94%, 43%)" },
  { value: "sky", label: "Sky", color: "hsl(199, 95%, 54%)" },
  { value: "blue", label: "Blue", color: "hsl(217, 91%, 50%)" },
  { value: "indigo", label: "Indigo", color: "hsl(239, 84%, 55%)" },
  { value: "violet", label: "Violet", color: "hsl(258, 90%, 55%)" },
  { value: "purple", label: "Purple", color: "hsl(271, 91%, 45%)" },
  { value: "fuchsia", label: "Fuchsia", color: "hsl(292, 84%, 50%)" },
  { value: "pink", label: "Pink", color: "hsl(330, 81%, 60%)" },
];

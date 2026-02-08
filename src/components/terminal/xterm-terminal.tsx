import { useRef, useEffect, useState } from "react";
import { Terminal, type ITheme } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "xterm/css/xterm.css";
import { cn } from "@/lib/utils";

interface XtermTerminalProps {
  terminalId: string;
  isActive: boolean;
  onData: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  onReady?: (write: (data: string) => void, clear: () => void) => void;
  className?: string;
}

// Helper to get computed CSS variable value
function getCssVariableValue(name: string): string {
  if (typeof window === "undefined") return "";
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || "";
}

// Helper to convert HSL to Hex
function hslToHex(hsl: string): string {
  if (!hsl || hsl.startsWith("#")) return hsl || "#000000";

  const match = hsl.match(
    /hsl\((\d+(?:\.\d+)?)\s*,?\s*(\d+(?:\.\d+)?)%\s*,?\s*(\d+(?:\.\d+)?)%\)/,
  );
  if (!match) return "#000000";

  let [_, h, s, l] = match.map(Number);

  s /= 100;
  l /= 100;

  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    Math.round(
      255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))),
    );

  const r = f(0);
  const g = f(8);
  const b = f(4);

  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// Get theme colors from CSS variables
function getThemeFromCssVars(): ITheme {
  const foreground = getCssVariableValue("--color-foreground");
  const background = getCssVariableValue("--color-background");
  const primary = getCssVariableValue("--color-primary");
  const primaryForeground = getCssVariableValue("--color-primary-foreground");

  return {
    background: "transparent",
    foreground: hslToHex(foreground) || "#000000",
    cursor: hslToHex(primary) || "#000000",
    cursorAccent: hslToHex(background) || "#ffffff",
    selectionBackground: hslToHex(primary) || "#000000",
    selectionForeground: hslToHex(primaryForeground) || "#ffffff",
    black: "#000000",
    red: "#cd3131",
    green: "#0dbc79",
    yellow: "#e5e510",
    blue: "#2472c8",
    magenta: "#bc3fbc",
    cyan: "#11a8cd",
    white: "#e5e5e5",
    brightBlack: "#666666",
    brightRed: "#f14c4c",
    brightGreen: "#23d18b",
    brightYellow: "#f5f543",
    brightBlue: "#3b8eea",
    brightMagenta: "#d670d6",
    brightCyan: "#29b8db",
    brightWhite: "#e5e5e5",
  };
}

export function XtermTerminal({
  terminalId,
  isActive,
  onData,
  onResize,
  onReady,
  className,
}: XtermTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [, setIsReady] = useState(false);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return;

    // Prevent double initialization in StrictMode
    if (terminalRef.current) {
      return;
    }

    const theme = getThemeFromCssVars();

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme,
      allowProposedApi: true,
      scrollback: 10000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    terminal.open(containerRef.current);

    // Handle input - only send to backend, don't echo locally
    const disposableOnData = terminal.onData((data) => {
      onData(data);
    });

    // Handle resize
    const disposableOnResize = terminal.onResize(({ cols, rows }) => {
      onResize?.(cols, rows);
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    setIsReady(true);

    // Disable bracketed paste mode in the terminal emulator
    // This prevents xterm.js from wrapping pasted text with \x1b[200~ and \x1b[201~
    terminal.write("\x1b[?2004l");

    // Notify parent that terminal is ready
    onReady?.(
      (data: string) => terminal.write(data),
      () => terminal.clear(),
    );

    // Initial fit - only if container is visible (has dimensions)
    requestAnimationFrame(() => {
      if (containerRef.current?.offsetWidth && containerRef.current?.offsetHeight) {
        try {
          fitAddon.fit();
        } catch {
          // Terminal may not be visible yet, ResizeObserver will handle it later
        }
      }
    });

    return () => {
      disposableOnData.dispose();
      disposableOnResize.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalId]);

  // Update theme when it changes
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    const updateTheme = () => {
      const newTheme = getThemeFromCssVars();
      terminal.options.theme = newTheme;
    };

    // Listen for theme changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "class"
        ) {
          updateTheme();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  // Focus and re-fit when becoming active
  useEffect(() => {
    if (isActive && terminalRef.current) {
      terminalRef.current.focus();
      // Re-fit after becoming visible, since dimensions may have changed
      requestAnimationFrame(() => {
        if (containerRef.current?.offsetWidth && containerRef.current?.offsetHeight) {
          try {
            fitAddonRef.current?.fit();
          } catch {
            // ignore
          }
        }
      });
    }
  }, [isActive]);

  // Handle resize - always observe so fit() runs when panel becomes visible again
  useEffect(() => {
    if (!containerRef.current || !fitAddonRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current?.offsetWidth && containerRef.current?.offsetHeight) {
        try {
          fitAddonRef.current?.fit();
        } catch {
          // ignore - terminal renderer may not be ready
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Expose write method via ref
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      (container as unknown as { write: (data: string) => void }).write = (
        data: string,
      ) => {
        terminalRef.current?.write(data);
      };
      (container as unknown as { clear: () => void }).clear = () => {
        terminalRef.current?.clear();
      };
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "h-full w-full xterm-container",
        !isActive && "hidden",
        className,
      )}
    />
  );
}

// Helper function to write data to terminal
export function writeToTerminal(
  containerElement: HTMLDivElement | null,
  data: string,
) {
  if (containerElement) {
    const writeFn = (
      containerElement as unknown as { write?: (data: string) => void }
    ).write;
    if (writeFn) {
      writeFn(data);
    }
  }
}

// Helper function to clear terminal
export function clearTerminal(containerElement: HTMLDivElement | null) {
  if (containerElement) {
    const clearFn = (containerElement as unknown as { clear?: () => void })
      .clear;
    if (clearFn) {
      clearFn();
    }
  }
}

/**
 * ThemeProvider robustness against untrusted `localStorage` (Refs #1294).
 *
 * The persisted theme is user-controllable storage. A stale/edited value — or
 * one with whitespace like "light dark" — used to flow straight into
 * `classList.add(theme)` (cast `as Theme`) and throw `InvalidCharacterError`,
 * crashing the whole app at the React error boundary. These tests pin that an
 * invalid value falls back to the default and never crashes the render.
 *
 * `defaultTheme="light"` is used throughout so the effect takes the explicit
 * light/dark branch and never touches `matchMedia` (also stubbed for safety).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ThemeProvider, useTheme } from "./theme-provider";

function ThemeProbe() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={() => setTheme("dark")}>set-dark</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  // jsdom has no matchMedia; the "system" branch calls it.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
});

describe("ThemeProvider — untrusted localStorage (Refs #1294)", () => {
  it("falls back to the default for an unknown stored theme (no crash)", () => {
    localStorage.setItem("theme", "not-a-theme");
    expect(() =>
      render(
        <ThemeProvider defaultTheme="light">
          <ThemeProbe />
        </ThemeProvider>,
      ),
    ).not.toThrow();
    expect(screen.getByTestId("theme").textContent).toBe("light");
  });

  it("does not crash on a whitespace value that would break classList.add", () => {
    // "light dark" → classList.add("light dark") throws InvalidCharacterError
    // in the effect → error boundary, pre-fix. Post-fix it falls back.
    localStorage.setItem("theme", "light dark");
    expect(() =>
      render(
        <ThemeProvider defaultTheme="light">
          <ThemeProbe />
        </ThemeProvider>,
      ),
    ).not.toThrow();
    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  it("honors a valid stored theme", () => {
    localStorage.setItem("theme", "dark");
    render(
      <ThemeProvider defaultTheme="light">
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("persists a theme change through setTheme", () => {
    render(
      <ThemeProvider defaultTheme="light">
        <ThemeProbe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByText("set-dark"));
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(screen.getByTestId("theme").textContent).toBe("dark");
  });
});

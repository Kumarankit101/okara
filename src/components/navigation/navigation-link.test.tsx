// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NavigationLink } from "./navigation-link";

const navigationState = vi.hoisted(() => ({
  pathname: "/history",
  pending: false,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
  useLinkStatus: () => ({ pending: navigationState.pending }),
}));

afterEach(() => {
  cleanup();
  navigationState.pathname = "/history";
  navigationState.pending = false;
});

describe("NavigationLink", () => {
  it("marks the current destination", () => {
    render(
      <NavigationLink href="/history" label="History">
        <span>History</span>
      </NavigationLink>,
    );

    expect(screen.getByRole("link", { name: "History" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("announces a navigation that is waiting", () => {
    navigationState.pending = true;

    render(
      <NavigationLink href="/settings" label="Settings">
        <span>Settings</span>
      </NavigationLink>,
    );

    expect(screen.getByRole("status").textContent).toContain("Loading Settings");
    expect(
      screen.getByRole("link", { name: /Settings/ }).getAttribute("aria-current"),
    ).toBeNull();
  });
});

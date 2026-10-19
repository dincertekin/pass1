import { describe, expect, it } from "vitest";
import { tileColor } from "./tiles";

describe("tileColor", () => {
  it("gives the same color for the same name, ignoring case and spaces", () => {
    expect(tileColor("GitHub")).toBe(tileColor(" github "));
  });

  it("spreads names over several colors", () => {
    const names = ["GitHub", "Gmail", "Netflix", "Bank", "Figma", "Spotify", "Hetzner", "Wi-Fi", "Amazon", "Steam"];
    expect(new Set(names.map(tileColor)).size).toBeGreaterThanOrEqual(4);
  });
});

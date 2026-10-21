import { describe, expect, it } from "vitest";
import { feedbackContext } from "../src/lib/feedback";

describe("feedbackContext", () => {
  it("reads the page, scenario and variant from the address", () => {
    const c = feedbackContext(
      { pathname: "/", search: "?scenario=guimaraes", hash: "#/?variante=v1" },
      { width: 390.4, height: 844 },
      "UA",
      "abc123",
    );
    expect(c).toEqual({
      page: "/?scenario=guimaraes#/?variante=v1",
      scenario: "guimaraes",
      variant: "v1",
      appVersion: "abc123",
      userAgent: "UA",
      viewport: "390x844",
    });
  });

  it("names the simulation page when there is no hash", () => {
    const c = feedbackContext(
      { pathname: "/", search: "", hash: "" },
      { width: 1, height: 1 },
      "UA",
    );
    expect(c.page).toBe("/#/");
    expect(c.scenario).toBeNull();
    expect(c.variant).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { accountNextToApp } from "../src/lib/session";

describe("accountNextToApp", () => {
  it("is account.<domain> next to app.<domain>, whatever the domain", () => {
    expect(
      accountNextToApp({ protocol: "https:", hostname: "app.linhazero.pt" }),
    ).toBe("https://account.linhazero.pt/realms/linhazero/account");
    expect(
      accountNextToApp({
        protocol: "https:",
        hostname: "app.linhazero.localhost",
      }),
    ).toBe("https://account.linhazero.localhost/realms/linhazero/account");
  });
  it("is the local Keycloak on any other address (npm run dev on localhost:5173)", () => {
    expect(accountNextToApp({ protocol: "http:", hostname: "localhost" })).toBe(
      "https://account.linhazero.localhost/realms/linhazero/account",
    );
  });
});

import { describe, it, expect } from "vitest";
import {
  createChallenge,
  solveChallenge,
  verifySolution,
  encodeSolution,
  decodeSolution,
  type Solution,
} from "./index";

const secret = "test-secret-key";

describe("challenge → solve → verify", () => {
  it("completes the full happy path", async () => {
    const challenge = await createChallenge({ secret, maxNumber: 2000 });
    expect(challenge.algorithm).toBe("SHA-256");
    expect(challenge.signature).toHaveLength(64);

    const solution = await solveChallenge(challenge, { chunkSize: 0 });
    expect(solution).not.toBeNull();

    const encoded = encodeSolution(solution!);
    const result = await verifySolution(encoded, { secret });
    expect(result.success).toBe(true);
  });

  it("finds the exact number that was chosen", async () => {
    const challenge = await createChallenge({ secret, maxNumber: 5000, number: 1234, expiresMs: 0 });
    const solution = await solveChallenge(challenge, { chunkSize: 0 });
    expect(solution!.number).toBe(1234);
  });
});

describe("verifySolution rejects tampering", () => {
  it("fails with the wrong secret", async () => {
    const challenge = await createChallenge({ secret, maxNumber: 1000 });
    const solution = await solveChallenge(challenge, { chunkSize: 0 });
    const result = await verifySolution(solution, { secret: "other-secret" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("bad-signature");
  });

  it("fails when the number doesn't match the hash", async () => {
    const challenge = await createChallenge({ secret, maxNumber: 1000 });
    const solution = await solveChallenge(challenge, { chunkSize: 0 });
    const tampered: Solution = { ...solution!, number: solution!.number + 1 };
    const result = await verifySolution(tampered, { secret });
    expect(result.success).toBe(false);
    expect(result.error).toBe("bad-hash");
  });

  it("rejects a forged easy challenge (bots can't mint their own)", async () => {
    // Attacker crafts a trivial challenge with a valid hash but no real signature.
    const salt = "aabbccdd";
    const number = 0;
    const { sha256Hex } = await import("./sha256");
    const forged: Solution = {
      algorithm: "SHA-256",
      salt,
      number,
      challenge: sha256Hex(salt + number),
      signature: "00".repeat(32),
    };
    const result = await verifySolution(forged, { secret });
    expect(result.success).toBe(false);
    expect(result.error).toBe("bad-signature");
  });

  it("rejects expired challenges", async () => {
    // Build a challenge whose salt says it expired in the past.
    const { sha256Hex, hmacSha256Hex } = await import("./sha256");
    const salt = `deadbeef?expires=${Math.floor(Date.now() / 1000) - 10}`;
    const number = 7;
    const challenge = sha256Hex(salt + number);
    const solution: Solution = {
      algorithm: "SHA-256",
      salt,
      number,
      challenge,
      signature: hmacSha256Hex(secret, challenge),
    };
    const result = await verifySolution(solution, { secret });
    expect(result.success).toBe(false);
    expect(result.error).toBe("expired");
  });

  it("rejects malformed payloads", async () => {
    expect((await verifySolution(null, { secret })).error).toBe("malformed");
    expect((await verifySolution("not-base64-json", { secret })).error).toBe("malformed");
  });
});

describe("encode/decode", () => {
  it("round-trips a solution", () => {
    const s: Solution = { algorithm: "SHA-256", salt: "x", number: 3, challenge: "y", signature: "z" };
    expect(decodeSolution(encodeSolution(s))).toEqual(s);
  });

  it("decodeSolution returns null for junk", () => {
    expect(decodeSolution("###")).toBeNull();
  });
});

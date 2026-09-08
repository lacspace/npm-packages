#!/usr/bin/env node
/**
 * `npx @lacspace/web-push` — generate a VAPID key pair for web push.
 *
 * Prints ready-to-paste .env lines by default, or JSON with `--json`.
 */
import { generateVapidKeys } from "./index";

async function main(): Promise<void> {
  const keys = await generateVapidKeys();
  if (process.argv.slice(2).includes("--json")) {
    process.stdout.write(`${JSON.stringify(keys, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    "VAPID keys generated. Add these to your .env (keep the private key secret):\n\n" +
      `VAPID_PUBLIC=${keys.publicKey}\n` +
      `VAPID_PRIVATE=${keys.privateKey}\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

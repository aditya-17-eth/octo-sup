import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
let content;
try {
  content = await readFile(".env.local", "utf8");
} catch {
  content = await readFile(".env.example", "utf8");
}
for (const name of ["SESSION_SECRET", "AGENT_API_TOKEN"]) {
  const blank = new RegExp(`^${name}=\\s*$`, "m");
  if (blank.test(content))
    content = content.replace(
      blank,
      `${name}=${randomBytes(32).toString("hex")}`,
    );
  else if (!new RegExp(`^${name}=`, "m").test(content))
    content += `\n${name}=${randomBytes(32).toString("hex")}\n`;
}
await writeFile(".env.local", content, { mode: 0o600 });
console.log(
  "Local environment ready. Missing session/operator secrets were generated privately. Add sponsor credentials to .env.local; no secret values are printed.",
);

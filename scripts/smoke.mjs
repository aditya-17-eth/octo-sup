import assert from "node:assert/strict";
const origin = process.env.APP_URL || "http://127.0.0.1:3000";
if (!["127.0.0.1", "localhost"].includes(new URL(origin).hostname))
  throw new Error("Smoke mutations are restricted to local development.");
const headers = { Origin: origin, "Content-Type": "application/json" };
const data = {
  title: "[Local smoke] Mission authorization check",
  question:
    "Local HTTP acceptance check only. No identity, inference or payment success is claimed.",
  area: "Local development",
  priceTinybars: 100000,
  durationMinutes: 30,
};
assert.equal((await fetch(`${origin}/api/health`)).status, 200);
assert.equal(
  (
    await fetch(`${origin}/api/missions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...data, state: "VERIFIED" }),
    })
  ).status,
  400,
);
const created = await fetch(`${origin}/api/missions`, {
  method: "POST",
  headers,
  body: JSON.stringify(data),
});
assert.equal(created.status, 201);
const cookie = created.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
const { id } = await created.json();
const authenticated = { ...headers, Cookie: cookie };
const update = {
  title: "[Local smoke] Edited authorization check",
  question: data.question,
  area: data.area,
  priceTinybars: data.priceTinybars,
};
assert.equal(
  (
    await fetch(`${origin}/api/missions/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(update),
    })
  ).status,
  403,
);
assert.equal(
  (
    await fetch(`${origin}/api/missions/${id}`, {
      method: "PATCH",
      headers: authenticated,
      body: JSON.stringify(update),
    })
  ).status,
  200,
);
assert.equal(
  (
    await fetch(`${origin}/api/missions/${id}/evidence`, {
      method: "POST",
      headers: authenticated,
    })
  ).status,
  403,
);
assert.equal(
  (await fetch(`${origin}/api/missions/${id}`, { method: "DELETE", headers }))
    .status,
  403,
);
assert.equal(
  (
    await fetch(`${origin}/api/missions/${id}`, {
      method: "DELETE",
      headers: authenticated,
    })
  ).status,
  200,
);
const final = await (await fetch(`${origin}/api/missions/${id}`)).json();
assert.equal(final.mission.state, "CANCELLED");
assert.equal("challenge" in final.mission, false);
assert.ok(final.events.some((e) => e.kind === "EDITED"));
assert.equal((await fetch(`${origin}/api/agent`)).status, 401);
assert.equal(
  (await fetch(`${origin}/api/reports/${id}?paid=true&transactionId=anything`))
    .status,
  409,
);
console.log(
  "Local HTTP smoke passed: validation, owner edit, unauthorized upload/cancellation, durable cancellation, private output, operator auth, paid-report boundary.",
);
console.log(
  `Cancelled QA mission: ${id}. No external inference, identity or payment calls were made.`,
);

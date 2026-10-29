import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker, { api } from "../server/worker.js";
import { hash, seal, unseal, safeReturn } from "../server/security.js";
import { eventBody, syncWorkspace } from "../server/calendar.js";
import { sampleState } from "../src/domain.js";
import { validateState, validateTransition } from "../server/validation.js";
function database() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(
    readFileSync(
      new URL("../migrations/0001_saas.sql", import.meta.url),
      "utf8",
    ),
  );
  sql.exec(
    readFileSync(
      new URL("../migrations/0002_rate_limits.sql", import.meta.url),
      "utf8",
    ),
  );
  return {
    sql,
    prepare(query) {
      let values = [];
      const p = {
        bind(...v) {
          values = v;
          return p;
        },
        async first() {
          return sql.prepare(query).get(...values) || null;
        },
        async all() {
          return { results: sql.prepare(query).all(...values) };
        },
        async run() {
          return {
            meta: {
              changes: Number(sql.prepare(query).run(...values).changes),
            },
          };
        },
      };
      return p;
    },
    async batch(statements) {
      sql.exec("BEGIN");
      try {
        const result = [];
        for (const q of statements) result.push(await q.run());
        sql.exec("COMMIT");
        return result;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
async function setup() {
  const DB = database(),
    env = {
      DB,
      APP_ORIGIN: "https://kit.test",
      GOOGLE_CLIENT_ID: "test",
      GOOGLE_CLIENT_SECRET: "test",
      TOKEN_ENCRYPTION_KEY: btoa("x".repeat(32)),
    };
  for (const id of ["owner", "editor", "viewer", "stranger"]) {
    await DB.prepare("INSERT INTO users VALUES(?,?,?,?)")
      .bind(id, id + "@example.com", id, Date.now())
      .run();
    await DB.prepare("INSERT INTO sessions VALUES(?,?,?)")
      .bind(await hash(id + "-session"), id, Date.now() + 60000)
      .run();
  }
  const state = sampleState();
  state.demo = false;
  await DB.prepare("INSERT INTO workspaces VALUES(?,?,?,?,?)")
    .bind("workspace", "Crew", JSON.stringify(state), 1, Date.now())
    .run();
  for (const role of ["owner", "editor", "viewer"])
    await DB.prepare("INSERT INTO members VALUES(?,?,?)")
      .bind("workspace", role, role)
      .run();
  return env;
}
function req(
  path,
  user = "owner",
  method = "GET",
  body,
  origin = "https://kit.test",
) {
  return new Request("https://kit.test/api" + path, {
    method,
    headers: {
      Cookie: "__Host-kitrelay_session=" + user + "-session",
      Origin: origin,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
test("tenant access, role authorization, CSRF and anonymous access are enforced", async () => {
  const env = await setup();
  assert.equal(
    (await worker.fetch(req("/workspaces/workspace", "stranger"), env)).status,
    404,
  );
  assert.equal(
    (await worker.fetch(req("/workspaces/workspace", "none"), env)).status,
    401,
  );
  const s = sampleState();
  assert.equal(
    (
      await worker.fetch(
        req("/workspaces/workspace", "viewer", "PUT", {
          state: s,
          revision: 1,
        }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await worker.fetch(
        req(
          "/workspaces/workspace",
          "owner",
          "PUT",
          { state: s, revision: 1 },
          "https://evil.test",
        ),
        env,
      )
    ).status,
    403,
  );
});
test("optimistic concurrency rejects stale writes instead of losing teammate changes", async () => {
  const env = await setup(),
    state = sampleState();
  state.workspace = "Changed";
  const first = await worker.fetch(
    req("/workspaces/workspace", "editor", "PUT", { state, revision: 1 }),
    env,
  );
  assert.equal(first.status, 200);
  assert.equal((await first.json()).revision, 2);
  assert.equal(
    (
      await worker.fetch(
        req("/workspaces/workspace", "owner", "PUT", { state, revision: 1 }),
        env,
      )
    ).status,
    409,
  );
});
test("crafted API requests cannot bypass checkout readiness", async () => {
  const env = await setup(),
    state = sampleState();
  state.jobs[0].status = "out";
  assert.equal(
    (
      await worker.fetch(
        req("/workspaces/workspace", "owner", "PUT", { state, revision: 1 }),
        env,
      )
    ).status,
    409,
  );
});
test("email-bound invite cannot be accepted by a different account and cannot be replayed", async () => {
  const env = await setup();
  const r = await api(
    req("/workspaces/workspace/invites", "owner", "POST", {
      email: "stranger@example.com",
      role: "viewer",
    }),
    env,
  );
  const token = (await r.json()).url.split("/").pop();
  assert.equal(
    (
      await worker.fetch(
        req("/invites/accept", "editor", "POST", { token }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await worker.fetch(
        req("/invites/accept", "stranger", "POST", { token }),
        env,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await worker.fetch(
        req("/invites/accept", "stranger", "POST", { token }),
        env,
      )
    ).status,
    404,
  );
  assert.equal(
    (await worker.fetch(req("/workspaces/workspace", "stranger"), env)).status,
    200,
  );
});
test("removing a member immediately denies future reads", async () => {
  const env = await setup();
  assert.equal(
    (
      await worker.fetch(
        req("/workspaces/workspace/members", "owner", "DELETE", {
          userId: "editor",
        }),
        env,
      )
    ).status,
    200,
  );
  assert.equal(
    (await worker.fetch(req("/workspaces/workspace", "editor"), env)).status,
    404,
  );
  assert.equal(
    (
      await worker.fetch(
        req("/workspaces/workspace/members", "owner", "DELETE", {
          userId: "owner",
        }),
        env,
      )
    ).status,
    400,
  );
});
test("logout revokes the server session", async () => {
  const env = await setup();
  assert.equal(
    (await worker.fetch(req("/logout", "owner", "POST", {}), env)).status,
    200,
  );
  assert.equal(
    (await worker.fetch(req("/workspaces/workspace", "owner"), env)).status,
    401,
  );
});
test("OAuth callback requires matching browser state, and redirect targets are constrained", async () => {
  const env = await setup();
  assert.equal(
    (await worker.fetch(req("/auth/callback?code=bad&state=bad"), env)).status,
    400,
  );
  assert.equal(safeReturn("https://evil.test"), "/#/desk");
  assert.equal(
    safeReturn("/#/invite/" + "a".repeat(64)),
    "/#/invite/" + "a".repeat(64),
  );
});
test("refresh tokens are encrypted and bound to the correct account", async () => {
  const key = btoa("a".repeat(32)),
    cipher = await seal("secret-token", key, "user-a");
  assert.ok(!cipher.includes("secret-token"));
  assert.equal(await unseal(cipher, key, "user-a"), "secret-token");
  await assert.rejects(() => unseal(cipher, key, "user-b"));
});
test("invalid dates, duplicate labels and rollback of a checked-out kit are rejected", () => {
  const s = sampleState();
  s.jobs[0].start = "2026-02-30";
  assert.throws(() => validateState(s));
  const a = sampleState();
  a.gear[1].code = a.gear[0].code;
  assert.throws(() => validateState(a));
  const before = sampleState();
  before.jobs[0].status = "out";
  assert.throws(() => validateTransition(before, sampleState()));
});
test("Google calendar sync creates a calendar and stable events, then skips unchanged events", async () => {
  const env = await setup(),
    user = { id: "owner" };
  await env.DB.prepare(
    "INSERT INTO google_connections(user_id,refresh_token) VALUES(?,?)",
  )
    .bind(
      user.id,
      await seal("test-refresh", env.TOKEN_ENCRYPTION_KEY, user.id),
    )
    .run();
  const calls = [],
    original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push([url, options]);
    if (url.includes("oauth2.googleapis"))
      return Response.json({ access_token: "test-access" });
    if (url.endsWith("/calendars"))
      return Response.json({ id: "test-calendar" });
    return Response.json({ id: "test-event" });
  };
  try {
    const result = await syncWorkspace(env, user, "workspace");
    assert.equal(result.changed, 2);
    assert.equal(calls.filter(([u]) => u.endsWith("/events")).length, 2);
    const again = await syncWorkspace(env, user, "workspace");
    assert.equal(again.changed, 0);
    assert.equal(calls.filter(([u]) => u.endsWith("/events")).length, 2);
  } finally {
    globalThis.fetch = original;
  }
});
test("calendar all-day dates use an exclusive end day across year boundary", () => {
  const body = eventBody(
    { ...sampleState().jobs[0], end: "2026-12-31" },
    "Team",
  );
  assert.equal(body.end.date, "2027-01-01");
});

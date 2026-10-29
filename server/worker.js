import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  assert,
  HttpError,
  random,
  hash,
  challenge,
  seal,
  cookie,
  getCookie,
  safeReturn,
  checkOrigin,
} from "./security.js";
import { validateState, validateTransition } from "./validation.js";
import { emptyState } from "../src/domain.js";
import { CALENDAR_SCOPE, syncWorkspace } from "./calendar.js";
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const redirect = (path, cookies = []) => {
  const headers = new Headers({
    Location: path,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
};
const ready = (env) =>
  Boolean(
    env.DB &&
    env.APP_ORIGIN &&
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET &&
    env.TOKEN_ENCRYPTION_KEY,
  );
async function body(req) {
  assert(
    Number(req.headers.get("content-length") || 0) <= 1000000,
    413,
    "Workspace data exceeds 1 MB.",
  );
  const raw = await req.text();
  assert(raw.length <= 1000000, 413, "Workspace data exceeds 1 MB.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}
async function session(req, env, required = true) {
  const token = getCookie(
    req,
    "kitrelay_session",
    new URL(req.url).protocol === "https:",
  );
  const user = token
    ? await env.DB.prepare(
        "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
      )
        .bind(await hash(token), Date.now())
        .first()
    : null;
  if (required) assert(user, 401, "Sign in to continue.");
  return user;
}
async function membership(env, user, id, roles) {
  const record = await env.DB.prepare(
    "SELECT w.*,m.role FROM workspaces w JOIN members m ON m.workspace_id=w.id WHERE w.id=? AND m.user_id=?",
  )
    .bind(id, user.id)
    .first();
  assert(record, 404, "Workspace not found.");
  if (roles)
    assert(
      roles.includes(record.role),
      403,
      "Your workspace role does not allow this action.",
    );
  return record;
}
async function bootstrap(env, user) {
  const result = await env.DB.prepare(
    "SELECT w.id,w.name,w.revision,m.role FROM workspaces w JOIN members m ON m.workspace_id=w.id WHERE m.user_id=? ORDER BY w.updated_at DESC",
  )
    .bind(user.id)
    .all();
  const connection = await env.DB.prepare(
    "SELECT calendar_id,last_synced_at FROM google_connections WHERE user_id=?",
  )
    .bind(user.id)
    .first();
  return {
    user: { id: user.id, name: user.name, email: user.email },
    workspaces: result.results,
    calendar: connection
      ? {
          connected: true,
          calendarId: connection.calendar_id,
          lastSyncedAt: connection.last_synced_at,
        }
      : { connected: false },
    configured: ready(env),
  };
}
async function rateLimit(env, key, max) {
  const bucket = Math.floor(Date.now() / 60000);
  const row = await env.DB.prepare(
    "INSERT INTO rate_limits(key,hits,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits",
  )
    .bind(key + ":" + bucket, Date.now() + 120000)
    .first();
  assert(row.hits <= max, 429, "Too many requests. Try again in a minute.");
}
export async function api(req, env) {
  const url = new URL(req.url),
    path = url.pathname,
    method = req.method,
    secure = url.protocol === "https:";
  if (path === "/api/config")
    return json({
      configured: ready(env),
      storage: Boolean(env.DB),
      origin: env.APP_ORIGIN || url.origin,
    });
  assert(env.DB, 503, "Cloud database has not been configured.");
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method))
    checkOrigin(req, env.APP_ORIGIN || url.origin);
  if (path === "/api/auth/google" && method === "GET") {
    assert(ready(env), 503, "Google sign-in is awaiting owner configuration.");
    await rateLimit(
      env,
      "oauth:" + (await hash(req.headers.get("CF-Connecting-IP") || "local")),
      12,
    );
    const purpose =
      url.searchParams.get("purpose") === "calendar" ? "calendar" : "login";
    const user = purpose === "calendar" ? await session(req, env) : null;
    const state = random(),
      browser = random(),
      verifier = random(),
      nonce = random(),
      returnPath = safeReturn(url.searchParams.get("return"));
    await env.DB.prepare(
      "INSERT INTO oauth_states(state_hash,browser_hash,verifier,nonce,purpose,user_id,return_path,expires_at) VALUES(?,?,?,?,?,?,?,?)",
    )
      .bind(
        await hash(state),
        await hash(browser),
        verifier,
        nonce,
        purpose,
        user?.id || null,
        returnPath,
        Date.now() + 600000,
      )
      .run();
    const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    const params = {
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.APP_ORIGIN + "/api/auth/callback",
      response_type: "code",
      scope:
        "openid email profile" +
        (purpose === "calendar" ? " " + CALENDAR_SCOPE : ""),
      state,
      nonce,
      code_challenge: await challenge(verifier),
      code_challenge_method: "S256",
      ...(purpose === "calendar"
        ? { access_type: "offline", prompt: "consent", login_hint: user.email }
        : { prompt: "select_account" }),
    };
    for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
    return redirect(target.href, [
      cookie("kitrelay_oauth", browser, 600, secure),
    ]);
  }
  if (path === "/api/auth/callback" && method === "GET") {
    assert(ready(env), 503, "Google sign-in is awaiting owner configuration.");
    const state = url.searchParams.get("state"),
      browser = getCookie(req, "kitrelay_oauth", secure);
    assert(state && browser, 400, "Login expired. Start again.");
    const flow = await env.DB.prepare(
      "DELETE FROM oauth_states WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING *",
    )
      .bind(await hash(state), await hash(browser), Date.now())
      .first();
    assert(flow, 400, "Login expired or was already used. Start again.");
    if (url.searchParams.has("error"))
      return redirect("/#/login?error=consent", [
        cookie("kitrelay_oauth", "", 0, secure),
      ]);
    const code = url.searchParams.get("code");
    assert(code, 400, "Google did not return a code.");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.APP_ORIGIN + "/api/auth/callback",
        grant_type: "authorization_code",
        code,
        code_verifier: flow.verifier,
      }),
    });
    assert(response.ok, 401, "Google could not complete sign-in. Start again.");
    const tokens = await response.json();
    assert(tokens.id_token, 401, "Google identity token missing.");
    const { payload } = await jwtVerify(tokens.id_token, JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: env.GOOGLE_CLIENT_ID,
    });
    assert(
      payload.nonce === flow.nonce &&
        payload.email_verified === true &&
        typeof payload.sub === "string" &&
        typeof payload.email === "string",
      401,
      "Google identity verification failed.",
    );
    const userId = payload.sub;
    if (flow.purpose === "calendar") {
      const user = await session(req, env);
      assert(
        user.id === flow.user_id && userId === user.id,
        403,
        "Connect the same Google account you used to sign in.",
      );
      assert(
        (tokens.scope || "").split(" ").includes(CALENDAR_SCOPE),
        403,
        "Calendar permission was not granted.",
      );
      const existing = await env.DB.prepare(
        "SELECT refresh_token FROM google_connections WHERE user_id=?",
      )
        .bind(userId)
        .first();
      assert(
        tokens.refresh_token || existing,
        400,
        "Google did not grant offline access. Try reconnecting.",
      );
      if (tokens.refresh_token)
        await env.DB.prepare(
          "INSERT INTO google_connections(user_id,refresh_token) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET refresh_token=excluded.refresh_token",
        )
          .bind(
            userId,
            await seal(tokens.refresh_token, env.TOKEN_ENCRYPTION_KEY, userId),
          )
          .run();
      return redirect("/#/integrations", [
        cookie("kitrelay_oauth", "", 0, secure),
      ]);
    }
    await env.DB.prepare(
      "INSERT INTO users(id,email,name,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name",
    )
      .bind(
        userId,
        payload.email.toLowerCase(),
        String(payload.name || payload.email).slice(0, 120),
        Date.now(),
      )
      .run();
    const token = random(),
      previous = getCookie(req, "kitrelay_session", secure);
    if (previous)
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
        .bind(await hash(previous))
        .run();
    await env.DB.prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    )
      .bind(await hash(token), userId, Date.now() + 7 * 86400000)
      .run();
    return redirect(flow.return_path, [
      cookie("kitrelay_session", token, 7 * 86400, secure),
      cookie("kitrelay_oauth", "", 0, secure),
    ]);
  }
  if (path === "/api/session" && method === "GET") {
    const user = await session(req, env, false);
    return json(
      user
        ? await bootstrap(env, user)
        : { user: null, workspaces: [], configured: ready(env) },
    );
  }
  if (path === "/api/logout" && method === "POST") {
    const token = getCookie(req, "kitrelay_session", secure);
    if (token)
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
        .bind(await hash(token))
        .run();
    const res = json({ ok: true });
    res.headers.append("Set-Cookie", cookie("kitrelay_session", "", 0, secure));
    return res;
  }
  const user = await session(req, env);
  if (["POST", "PUT", "DELETE"].includes(method))
    await rateLimit(env, "write:" + user.id, 120);
  if (path === "/api/workspaces" && method === "POST") {
    const data = await body(req);
    assert(
      typeof data.name === "string" &&
        data.name.trim() &&
        data.name.length <= 60,
      400,
      "Enter a workspace name (up to 60 characters).",
    );
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM members WHERE user_id=? AND role='owner'",
    )
      .bind(user.id)
      .first();
    assert(count.n < 10, 400, "You can own up to 10 workspaces.");
    const id = crypto.randomUUID(),
      state = emptyState(data.name.trim());
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO workspaces(id,name,data,updated_at) VALUES(?,?,?,?)",
      ).bind(id, state.workspace, JSON.stringify(state), Date.now()),
      env.DB.prepare(
        "INSERT INTO members(workspace_id,user_id,role) VALUES(?,?,'owner')",
      ).bind(id, user.id),
    ]);
    return json({ id, state, revision: 1, role: "owner" }, 201);
  }
  const match = path.match(
    /^\/api\/workspaces\/([a-zA-Z0-9-]+)(?:\/(team|invites|members))?$/,
  );
  if (match) {
    const id = match[1],
      sub = match[2];
    const member = await membership(env, user, id);
    if (!sub && method === "GET")
      return json({
        id,
        state: JSON.parse(member.data),
        revision: member.revision,
        role: member.role,
      });
    if (!sub && method === "PUT") {
      assert(
        ["owner", "editor"].includes(member.role),
        403,
        "Viewers cannot edit this workspace.",
      );
      const data = await body(req);
      assert(Number.isInteger(data.revision), 400, "Revision is required.");
      assert(
        data.revision === member.revision,
        409,
        "A teammate updated this workspace. Refresh before editing again.",
      );
      const next = validateState(data.state);
      if (data.restore) {
        assert(
          member.role === "owner",
          403,
          "Only the owner may restore a backup.",
        );
        assert(
          !JSON.parse(member.data).jobs.some((j) => j.status === "out"),
          409,
          "Return checked-out equipment before restoring a backup.",
        );
      } else validateTransition(JSON.parse(member.data), next);
      const result = await env.DB.prepare(
        "UPDATE workspaces SET data=?,name=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM members WHERE workspace_id=? AND user_id=? AND role IN ('owner','editor'))",
      )
        .bind(
          JSON.stringify(next),
          next.workspace,
          Date.now(),
          id,
          data.revision,
          id,
          user.id,
        )
        .run();
      assert(
        result.meta.changes === 1,
        409,
        "Workspace changed or access was revoked. Refresh to continue.",
      );
      await env.DB.prepare(
        "INSERT INTO audit(workspace_id,user_id,action,created_at) VALUES(?,?,?,?)",
      )
        .bind(
          id,
          user.id,
          data.restore ? "backup restored" : "workspace updated",
          Date.now(),
        )
        .run();
      return json({
        id,
        state: next,
        revision: data.revision + 1,
        role: member.role,
      });
    }
    if (sub === "team" && method === "GET") {
      const members = await env.DB.prepare(
        "SELECT u.id,u.name,u.email,m.role FROM members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=?",
      )
        .bind(id)
        .all();
      const invites =
        member.role === "owner"
          ? await env.DB.prepare(
              "SELECT token_hash,email,role,expires_at FROM invites WHERE workspace_id=? AND expires_at>?",
            )
              .bind(id, Date.now())
              .all()
          : { results: [] };
      return json({
        members: members.results,
        invites: invites.results,
        role: member.role,
      });
    }
    if (sub === "invites" && method === "POST") {
      assert(member.role === "owner", 403, "Only owners can invite teammates.");
      const data = await body(req),
        email = String(data.email || "")
          .trim()
          .toLowerCase();
      assert(
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
          email.length <= 254 &&
          ["editor", "viewer"].includes(data.role),
        400,
        "Provide an email and editor/viewer role.",
      );
      const token = random();
      await env.DB.prepare(
        "INSERT INTO invites(token_hash,workspace_id,email,role,expires_at,created_by) VALUES(?,?,?,?,?,?)",
      )
        .bind(
          await hash(token),
          id,
          email,
          data.role,
          Date.now() + 7 * 86400000,
          user.id,
        )
        .run();
      return json(
        { url: env.APP_ORIGIN + "/#/invite/" + token, expiresInDays: 7 },
        201,
      );
    }
    if (sub === "invites" && method === "DELETE") {
      assert(
        member.role === "owner",
        403,
        "Only owners can revoke invitations.",
      );
      const data = await body(req);
      await env.DB.prepare(
        "DELETE FROM invites WHERE token_hash=? AND workspace_id=?",
      )
        .bind(data.id, id)
        .run();
      return json({ ok: true });
    }
    if (sub === "members" && method === "DELETE") {
      assert(member.role === "owner", 403, "Only owners can remove teammates.");
      const data = await body(req);
      assert(data.userId !== user.id, 400, "The owner cannot be removed.");
      await env.DB.prepare(
        "DELETE FROM members WHERE workspace_id=? AND user_id=? AND role!='owner'",
      )
        .bind(id, data.userId)
        .run();
      return json({ ok: true });
    }
  }
  if (path === "/api/invites/accept" && method === "POST") {
    const data = await body(req);
    assert(
      typeof data.token === "string" && /^[a-f0-9]{64}$/.test(data.token),
      400,
      "Invalid invitation.",
    );
    const tokenHash = await hash(data.token);
    const invite = await env.DB.prepare(
      "SELECT * FROM invites WHERE token_hash=? AND expires_at>?",
    )
      .bind(tokenHash, Date.now())
      .first();
    assert(invite, 404, "Invitation expired or was revoked.");
    assert(
      invite.email === user.email,
      403,
      "Sign in with the email address this invitation was sent to.",
    );
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO members(workspace_id,user_id,role) SELECT workspace_id,?,role FROM invites WHERE token_hash=? AND email=? AND expires_at>? ON CONFLICT(workspace_id,user_id) DO NOTHING",
      ).bind(user.id, tokenHash, user.email, Date.now()),
      env.DB.prepare("DELETE FROM invites WHERE token_hash=? AND email=?").bind(
        tokenHash,
        user.email,
      ),
    ]);
    await membership(env, user, invite.workspace_id);
    return json({ workspaceId: invite.workspace_id });
  }
  if (path === "/api/calendar/sync" && method === "POST") {
    const data = await body(req);
    return json(await syncWorkspace(env, user, data.workspaceId));
  }
  if (path === "/api/calendar/disconnect" && method === "POST") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM calendar_events WHERE user_id=?").bind(
        user.id,
      ),
      env.DB.prepare("DELETE FROM google_connections WHERE user_id=?").bind(
        user.id,
      ),
    ]);
    return json({
      ok: true,
      message:
        "Connection removed. Existing Google Calendar events are retained.",
    });
  }
  throw new HttpError(404, "API endpoint not found.");
}
export default {
  async fetch(req, env) {
    try {
      if (new URL(req.url).pathname.startsWith("/api/"))
        return await api(req, env);
      const response = await env.ASSETS.fetch(req);
      const headers = new Headers(response.headers);
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      headers.set("X-Frame-Options", "DENY");
      return new Response(response.body, { status: response.status, headers });
    } catch (e) {
      return json(
        {
          error:
            e instanceof HttpError
              ? e.message
              : "The server could not complete this request. Please try again.",
        },
        e instanceof HttpError ? e.status : 500,
      );
    }
  },
  async scheduled(event, env) {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM rate_limits WHERE expires_at<?").bind(now),
      env.DB.prepare("DELETE FROM sessions WHERE expires_at<?").bind(now),
      env.DB.prepare("DELETE FROM oauth_states WHERE expires_at<?").bind(now),
      env.DB.prepare("DELETE FROM invites WHERE expires_at<?").bind(now),
      env.DB.prepare("DELETE FROM audit WHERE created_at<?").bind(
        now - 90 * 86400000,
      ),
    ]);
  },
};

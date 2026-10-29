import { hash, unseal, assert, HttpError } from "./security.js";
export const CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.app.created";
export function eventBody(job, workspace) {
  const end = new Date(job.end + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    summary: job.name,
    location: job.location,
    description: `KitRelay · ${workspace}\nCrew: ${job.crew}\nStatus: ${job.status}\nManage equipment and dates in KitRelay.`,
    start: { date: job.start },
    end: { date: end.toISOString().slice(0, 10) },
  };
}
async function google(path, token, method = "GET", body) {
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/" + path,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  if (!response.ok) {
    const error = new HttpError(
      response.status === 401 ? 401 : 502,
      response.status === 401
        ? "Reconnect Google Calendar."
        : `Google Calendar request failed (${response.status}). Try syncing again.`,
    );
    error.googleStatus = response.status;
    throw error;
  }
  return response.status === 204 ? {} : response.json();
}
export async function syncWorkspace(env, user, workspaceId) {
  const member = await env.DB.prepare(
    "SELECT w.* FROM workspaces w JOIN members m ON m.workspace_id=w.id WHERE w.id=? AND m.user_id=?",
  )
    .bind(workspaceId, user.id)
    .first();
  assert(member, 404, "Workspace not found.");
  const connection = await env.DB.prepare(
    "SELECT * FROM google_connections WHERE user_id=?",
  )
    .bind(user.id)
    .first();
  assert(connection, 409, "Connect Google Calendar first.");
  const lock = await env.DB.prepare(
    "UPDATE google_connections SET lock_until=? WHERE user_id=? AND lock_until<?",
  )
    .bind(Date.now() + 120000, user.id, Date.now())
    .run();
  assert(
    lock.meta.changes === 1,
    409,
    "A calendar sync is already running. Try again shortly.",
  );
  try {
    const refresh = await unseal(
      connection.refresh_token,
      env.TOKEN_ENCRYPTION_KEY,
      user.id,
    );
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: refresh,
        grant_type: "refresh_token",
      }),
    });
    assert(
      tokenResponse.ok,
      409,
      "Google authorization expired or was revoked. Disconnect and reconnect Calendar.",
    );
    const { access_token } = await tokenResponse.json();
    assert(access_token, 502, "Google did not provide an access token.");
    let calendarId = connection.calendar_id;
    if (!calendarId) {
      const calendar = await google("calendars", access_token, "POST", {
        summary: "KitRelay productions",
        description:
          "Production dates published by KitRelay. Edit shoot dates in KitRelay and sync again.",
      });
      calendarId = calendar.id;
      await env.DB.prepare(
        "UPDATE google_connections SET calendar_id=? WHERE user_id=?",
      )
        .bind(calendarId, user.id)
        .run();
    }
    const state = JSON.parse(member.data);
    let changed = 0;
    for (const job of state.jobs) {
      const body = eventBody(job, state.workspace),
        fingerprint = await hash(JSON.stringify(body));
      const saved = await env.DB.prepare(
        "SELECT * FROM calendar_events WHERE user_id=? AND workspace_id=? AND job_id=?",
      )
        .bind(user.id, workspaceId, job.id)
        .first();
      if (saved?.fingerprint === fingerprint) continue;
      const eventId = await hash(`${user.id}:${workspaceId}:${job.id}`),
        base = `calendars/${encodeURIComponent(calendarId)}/events`;
      if (saved) {
        try {
          await google(`${base}/${eventId}`, access_token, "PUT", body);
        } catch (e) {
          if (e.googleStatus !== 404) throw e;
          await google(base, access_token, "POST", { ...body, id: eventId });
        }
      } else {
        try {
          await google(base, access_token, "POST", { ...body, id: eventId });
        } catch (e) {
          if (e.googleStatus !== 409) throw e;
          await google(`${base}/${eventId}`, access_token, "PUT", body);
        }
      }
      await env.DB.prepare(
        "INSERT INTO calendar_events(user_id,workspace_id,job_id,event_id,fingerprint) VALUES(?,?,?,?,?) ON CONFLICT(user_id,workspace_id,job_id) DO UPDATE SET fingerprint=excluded.fingerprint,event_id=excluded.event_id",
      )
        .bind(user.id, workspaceId, job.id, eventId, fingerprint)
        .run();
      changed++;
    }
    await env.DB.prepare(
      "UPDATE google_connections SET last_synced_at=? WHERE user_id=?",
    )
      .bind(Date.now(), user.id)
      .run();
    return { changed, total: state.jobs.length, calendarId };
  } finally {
    await env.DB.prepare(
      "UPDATE google_connections SET lock_until=0 WHERE user_id=?",
    )
      .bind(user.id)
      .run();
  }
}

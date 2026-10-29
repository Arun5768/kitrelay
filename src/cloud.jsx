import React, { useState, useRef, useEffect } from "react";
import {
  ArrowUpRight,
  Cloud,
  LogOut,
  Users,
  RefreshCw,
  CalendarDays,
} from "lucide-react";
import { validateBackup } from "./domain";
export async function request(path, options = {}) {
  const res = await fetch("/api" + path, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw Error("Cloud API is unavailable. Try again shortly.");
  }
  if (!res.ok) {
    const e = Error(data.error || "Request failed.");
    e.status = res.status;
    throw e;
  }
  return data;
}
const LOCAL = "kitrelay-v1";
const readLocal = () => {
  try {
    return validateBackup(JSON.parse(localStorage.getItem(LOCAL)));
  } catch {
    return null;
  }
};
export function useWorkspace() {
  const [state, rawSet] = useState(null),
    [account, setAccount] = useState(null),
    [active, setActive] = useState(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [configured, setConfigured] = useState(false);
  const current = useRef(null),
    saving = useRef(false),
    failed = useRef(false),
    identity = useRef(null);
  const adopt = (d) => {
    current.current = d;
    setActive(d);
    rawSet(d.state);
  };
  const refreshAccount = async () => {
    const data = await request("/session");
    identity.current = data.user;
    setAccount(data);
    setConfigured(data.configured);
    return data;
  };
  const select = async (id) => {
    if (saving.current || failed.current)
      throw Error("Resolve the unsaved changes before switching workspaces.");
    setLoading(true);
    try {
      const d = await request("/workspaces/" + id);
      adopt(d);
      sessionStorage.setItem("kitrelay-workspace", id);
      setError("");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    (async () => {
      try {
        const data = await refreshAccount();
        if (data.user && data.workspaces.length) {
          const remembered = sessionStorage.getItem("kitrelay-workspace");
          await select(
            data.workspaces.some((w) => w.id === remembered)
              ? remembered
              : data.workspaces[0].id,
          );
        } else rawSet(data.user ? null : readLocal());
      } catch (e) {
        setError(e.message);
        rawSet(readLocal());
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  useEffect(() => {
    const timer = setInterval(async () => {
      if (!current.current || saving.current || failed.current) return;
      const id = current.current.id;
      try {
        const d = await request("/workspaces/" + id);
        if (
          !saving.current &&
          !failed.current &&
          current.current?.id === id &&
          d.revision > current.current.revision
        )
          adopt(d);
      } catch (e) {
        setError(e.message);
        if (e.status === 401 || e.status === 404) {
          failed.current = true;
          rawSet(null);
        }
      }
    }, 15000);
    return () => clearInterval(timer);
  }, []);
  const save = async (next, restore = false) => {
    if (saving.current) {
      setError("Wait for your current change to finish saving.");
      return false;
    }
    if (failed.current) {
      setError(
        "Your last change is unsaved. Export it or reload the cloud version before continuing.",
      );
      return false;
    }
    if (!identity.current) {
      try {
        localStorage.setItem(LOCAL, JSON.stringify(next));
        rawSet(next);
        return true;
      } catch {
        setError("Browser storage unavailable. Export a backup.");
        return false;
      }
    }
    if (!current.current) {
      setError("Create a cloud workspace first.");
      return false;
    }
    if (current.current.role === "viewer") {
      setError(
        "You have view-only access. Ask the workspace owner for editing access.",
      );
      return false;
    }
    saving.current = true;
    setBusy(true);
    rawSet(next);
    setError("");
    try {
      const d = await request("/workspaces/" + current.current.id, {
        method: "PUT",
        body: { state: next, revision: current.current.revision, restore },
      });
      adopt(d);
      return true;
    } catch (e) {
      failed.current = true;
      setError(
        e.message +
          " Your unsaved version is still visible; export it before reloading.",
      );
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const reload = async () => {
    failed.current = false;
    setError("");
    if (current.current) await select(current.current.id);
    else location.reload();
  };
  const create = async (name) => {
    if (saving.current || failed.current) {
      setError("Resolve unsaved changes before creating a workspace.");
      return false;
    }
    if (!identity.current) {
      location.hash = "/login";
      return false;
    }
    setBusy(true);
    try {
      const d = await request("/workspaces", {
        method: "POST",
        body: { name },
      });
      adopt(d);
      sessionStorage.setItem("kitrelay-workspace", d.id);
      await refreshAccount();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const demo = (next) => {
    if (identity.current) {
      setError(
        "Sample data is available when signed out. Your cloud workspace is unchanged.",
      );
      return;
    }
    save(next);
  };
  const logout = async (returnPath = "/login") => {
    if (saving.current || failed.current) {
      setError("Resolve unsaved changes before signing out.");
      return;
    }
    await request("/logout", { method: "POST", body: {} });
    identity.current = null;
    current.current = null;
    rawSet(null);
    setActive(null);
    setAccount(null);
    location.hash = returnPath;
  };
  return {
    state,
    setState: save,
    demo,
    create,
    restore: (next) => save(next, true),
    account,
    active,
    loading,
    busy,
    error,
    configured,
    select,
    reload,
    refreshAccount,
    logout,
    cloud: Boolean(identity.current && active),
  };
}
export function Login({ store, returnPath = "/#/desk" }) {
  return (
    <main className="auth-page">
      <a className="brand" href="#/">
        kitrelay ↗
      </a>
      <div className="auth-card">
        <span className="eyebrow">YOUR CREW. IN SYNC.</span>
        <h1>
          One workspace.
          <br />
          Every member of the crew.
        </h1>
        <p>
          Sign in to save equipment and shoots in the cloud, invite teammates,
          and connect your production calendar.
        </p>
        {store.configured ? (
          <a
            className="button dark full"
            href={"/api/auth/google?return=" + encodeURIComponent(returnPath)}
          >
            Continue with Google <ArrowUpRight size={17} />
          </a>
        ) : (
          <div className="setup-notice">
            <b>Google sign-in is being configured.</b>
            <p>
              The workspace is not accepting logins yet. The owner must add the
              Google OAuth client credentials in Cloudflare.
            </p>
          </div>
        )}
        <small>
          Google Calendar access is optional and requested separately.
        </small>
        <a className="text-button" href="/privacy.html">
          How we handle your data
        </a>
        <a className="text-button" href="/terms.html">Terms of service</a>
      </div>
    </main>
  );
}
export function CloudBar({ store }) {
  return (
    <>
      {store.error && (
        <div className="cloud-error" role="alert">
          <span>{store.error}</span>
          <button onClick={() => store.reload().catch(() => {})}>
            Reload cloud version
          </button>
        </div>
      )}
      {store.cloud && (
        <div className="cloud-bar">
          <Cloud size={14} />
          <span>
            {store.busy
              ? "Saving…"
              : store.error
                ? "Changes not saved"
                : "Cloud workspace · updates every 15 seconds"}{" "}
            · {store.active.role}
          </span>
          <select
            aria-label="Select workspace"
            value={store.active.id}
            disabled={store.busy}
            onChange={(e) => store.select(e.target.value).catch(() => {})}
          >
            {store.account?.workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => store.logout().catch(() => {})}
            aria-label="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
      )}
    </>
  );
}
export function Team({ store }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [link, setLink] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = () =>
    request("/workspaces/" + store.active.id + "/team").then(setData);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setLink("");
    setError("");
    if (store.cloud)
      request("/workspaces/" + store.active.id + "/team")
        .then((result) => { if (!cancelled) setData(result); })
        .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [store.active?.id]);
  async function action(path, method, body) {
    setBusy(true);
    setError("");
    try {
      const result = await request(
        "/workspaces/" + store.active.id + "/" + path,
        { method, body },
      );
      await refresh();
      return result;
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!store.cloud)
    return (
      <div className="empty">
        <Users size={32} />
        <h2>Bring your crew together.</h2>
        <p>
          Sign in and create a cloud workspace to share equipment and shoots.
        </p>
        <a className="button dark" href="#/login">
          Sign in with Google
        </a>
      </div>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">GOOD WORK IS A TEAM SPORT</span>
          <h1>Your crew, connected.</h1>
          <p>
            Owners manage access. Editors update equipment and shoots. Viewers
            can read and export.
          </p>
        </div>
      </div>
      {error && (
        <p className="cloud-error" role="alert">
          {error}
        </p>
      )}
      <section className="settings-card">
        <h3>Workspace members</h3>
        {data?.members.map((m) => (
          <div className="team-row" key={m.id}>
            <div>
              <b>{m.name}</b>
              <small>{m.email}</small>
            </div>
            <span className="pill">{m.role}</span>
            {data.role === "owner" && m.role !== "owner" && (
              <button
                disabled={busy}
                className="text-button danger"
                onClick={() => action("members", "DELETE", { userId: m.id })}
              >
                Remove access
              </button>
            )}
          </div>
        ))}
      </section>
      {data?.role === "owner" && (
        <>
          <form
            className="settings-card"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const result = await action("invites", "POST", {
                email: form.get("email"),
                role: form.get("role"),
              });
              if (result) setLink(result.url);
            }}
          >
            <h3>Invite a teammate</h3>
            <p>
              Create a link for a specific Google account email. Share it
              yourself; KitRelay does not send an email. Links expire after
              seven days.
            </p>
            <label>
              Teammate’s Google email
              <input name="email" type="email" maxLength={254} required />
            </label>
            <label>
              Role
              <select name="role">
                <option value="editor">
                  Editor — manage equipment and shoots
                </option>
                <option value="viewer">Viewer — read and export</option>
              </select>
            </label>
            <button disabled={busy} className="button dark">
              Create invitation <ArrowUpRight size={16} />
            </button>
            {link && (
              <label className="invite-link">
                Share this invitation
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.target.select()}
                />
                <small>Only the invited email can accept it.</small>
              </label>
            )}
          </form>
          <section className="settings-card">
            <h3>Pending invitations</h3>
            {!data.invites.length && <p>No pending invitations.</p>}
            {data.invites.map((i) => (
              <div className="team-row" key={i.token_hash}>
                <div>
                  <b>{i.email}</b>
                  <small>
                    {i.role} · expires{" "}
                    {new Date(i.expires_at).toLocaleDateString()}
                  </small>
                </div>
                <button
                  disabled={busy}
                  className="text-button danger"
                  onClick={() =>
                    action("invites", "DELETE", { id: i.token_hash })
                  }
                >
                  Revoke
                </button>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}
export function Invite({ store, token }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!store.account?.user)
    return <Login store={store} returnPath={"/#/invite/" + token} />;
  return (
    <main className="auth-page">
      <div className="auth-card">
        <Users size={30} />
        <h1>Join your crew.</h1>
        <p>
          You are signed in as {store.account.user.email}. The invitation must
          match this address.
        </p>
        {error && (
          <p role="alert" className="cloud-error">
            {error}
          </p>
        )}
        <button
          className="button dark full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const d = await request("/invites/accept", {
                method: "POST",
                body: { token },
              });
              await store.refreshAccount();
              await store.select(d.workspaceId);
              location.hash = "/desk";
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Accept invitation <ArrowUpRight size={16} />
        </button>
        <button className="text-button" onClick={() => store.logout("/invite/" + token).catch((e) => setError(e.message))}>
          Use a different account
        </button>
      </div>
    </main>
  );
}
export function CalendarConnection({ store }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const connected = store.account?.calendar?.connected;
  async function act(path) {
    setBusy(true);
    setMessage("");
    try {
      const d = await request(path, {
        method: "POST",
        body: { workspaceId: store.active.id },
      });
      await store.refreshAccount();
      setMessage(
        path.endsWith("sync")
          ? `${d.changed} events updated. ${d.total} shoots accounted for.`
          : "Connection removed. Existing calendar events are retained.",
      );
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="calendar-connection">
      <CalendarDays size={28} />
      <div>
        <span className="eyebrow">GOOGLE CALENDAR</span>
        <h2>Your shoots, on your calendar.</h2>
        <p>
          Publish this workspace’s shoots to a dedicated “KitRelay productions”
          calendar in your Google account. Sync creates and updates events
          without duplication. Dates flow from KitRelay to Google; changes made
          in Google are not imported.
        </p>
        {connected && (
          <small>
            Last sync:{" "}
            {store.account.calendar.lastSyncedAt
              ? new Date(store.account.calendar.lastSyncedAt).toLocaleString()
              : "Not yet synced"}
          </small>
        )}
        <div className="actions">
          {!store.cloud ? (
            <a className="button dark" href="#/login">
              Sign in to connect
            </a>
          ) : connected ? (
            <>
              <button
                className="button dark"
                disabled={busy || store.busy || Boolean(store.error)}
                onClick={() => act("/calendar/sync")}
              >
                <RefreshCw size={16} />
                {busy ? "Working…" : "Sync workspace now"}
              </button>
              <button
                className="text-button danger"
                disabled={busy}
                onClick={() => act("/calendar/disconnect")}
              >
                Disconnect
              </button>
            </>
          ) : (
            <a className="button dark" href="/api/auth/google?purpose=calendar">
              Connect Google Calendar <ArrowUpRight size={16} />
            </a>
          )}
        </div>
        {message && <p role="status">{message}</p>}
      </div>
    </article>
  );
}

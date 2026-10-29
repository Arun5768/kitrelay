import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  ChevronRight,
  Check,
  CheckCheck,
  Search,
  Package,
  Clapperboard,
  CalendarDays,
  Box,
  Settings2,
  PlugZap,
  MoveUpRight,
  Download,
  Upload,
  X,
  ScanLine,
  Camera,
  Headphones,
  Sun,
  Triangle,
  Disc3,
  Battery,
  Focus,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Menu,
  ExternalLink,
} from "lucide-react";
import QRCode from "qrcode";
import CaseScene from "./CaseScene";
import {
  sampleState,
  emptyState,
  categories,
  uid,
  localDate,
  blockers,
  checkout,
  returnItem,
  conflicts,
  calendarFile,
  validateBackup,
} from "./domain";
import "./style.css";
import {
  useWorkspace,
  Login,
  CloudBar,
  Team,
  Invite,
  CalendarConnection,
} from "./cloud";
const KEY = "kitrelay-v1";
const icons = {
  Camera,
  Audio: Headphones,
  Light: Sun,
  Support: Triangle,
  Media: Disc3,
  Power: Battery,
  Lens: Focus,
};
function read() {
  try {
    return validateBackup(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return null;
  }
}
function download(name, data, type = "application/json") {
  const a = document.createElement("a"),
    url = URL.createObjectURL(new Blob([data], { type }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function App() {
  const store = useWorkspace();
  const s = store.state,
    setS = store.setState;
  const [route, setRoute] = useState(location.hash.slice(1) || "/"),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All"),
    [menu, setMenu] = useState(false);
  const input = useRef();
  useEffect(() => {
    const fn = () => {
      setRoute(location.hash.slice(1) || "/");
      setQuery("");
      setFilter("All");
      setMenu(false);
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", fn);
    return () => removeEventListener("hashchange", fn);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(t);
  }, [toast]);
  const nav = (p) => {
    location.hash = p;
  };
  const notify = (t) => setToast(t);
  const change = (fn) => {
    try {
      setS(fn(s));
    } catch (e) {
      notify(e.message);
    }
  };
  const start = () => {
    if (s) nav("/desk");
    else if (store.account?.user) setModal("onboard");
    else nav("/login");
  };
  const addActivity = (j, text) => ({
    ...j,
    activity: [...j.activity, { text, at: new Date().toISOString() }],
  });
  const updateJob = (id, fn) =>
    change((s) => ({
      ...s,
      jobs: s.jobs.map((j) => (j.id === id ? fn(j) : j)),
    }));
  const job = s?.jobs.find((j) => route === "/shoot/" + j.id);
  const page = (route.split("/")[1] || "home").split("?")[0];
  const upcoming =
    s?.jobs
      .filter((j) => j.status !== "returned")
      .sort((a, b) => a.start.localeCompare(b.start)) || [];
  const active = job || upcoming[0];
  const exportBackup = () =>
    download("kitrelay-backup.json", JSON.stringify(s, null, 2));
  async function importBackup(file) {
    if (!file) return;
    try {
      if (file.size > 5e6) throw Error("Backup must be smaller than 5 MB.");
      const data = validateBackup(JSON.parse(await file.text()));
      setModal({ type: "restore", data });
    } catch (e) {
      notify(e.message);
    }
    input.current.value = "";
  }
  function pack(j, id) {
    if (j.status !== "planning") return;
    updateJob(j.id, (j) =>
      addActivity(
        {
          ...j,
          packed: j.packed.includes(id)
            ? j.packed.filter((x) => x !== id)
            : [...j.packed, id],
        },
        `${s.gear.find((g) => g.id === id).name} ${j.packed.includes(id) ? "unpacked" : "packed"}`,
      ),
    );
  }
  function scan(j, code) {
    const gear = s.gear.find(
      (g) => g.code.toLowerCase() === code.trim().toLowerCase(),
    );
    if (!gear || !j.items.includes(gear.id)) {
      notify("This label is not assigned to this kit.");
      return;
    }
    if (j.packed.includes(gear.id)) {
      notify("Already packed.");
      return;
    }
    pack(j, gear.id);
    notify(`${gear.name} packed`);
  }
  const logo = (
    <a href="#/" className="brand">
      <span className="brand-mark">
        k<span>↗</span>
      </span>
      kitrelay<span className="brand-dot">®</span>
    </a>
  );
  const jobCard = (j) => (
    <button
      className="job-row"
      key={j.id}
      onClick={() => nav("/shoot/" + j.id)}
    >
      <span className="job-date">
        <b>{new Date(j.start + "T12:00:00").getDate()}</b>
        {new Date(j.start + "T12:00:00").toLocaleDateString("en", {
          month: "short",
        })}
      </span>
      <span className="job-title">
        <b>{j.name}</b>
        <small>
          {j.location} · {j.crew}
        </small>
      </span>
      <span className={"pill " + j.status}>
        {j.status === "out"
          ? "On location"
          : j.status === "returned"
            ? "Returned"
            : "Preparing"}
      </span>
      <span className="job-count">
        {j.status === "out" ? Object.keys(j.returns).length : j.packed.length}/
        {j.items.length} {j.status === "out" ? "returned" : "packed"}
      </span>
      <ArrowUpRight size={18} />
    </button>
  );
  const kitPanel = (j) => {
    const issues = blockers(s, j),
      items = j.items
        .map((id) => s.gear.find((g) => g.id === id))
        .filter(Boolean);
    return (
      <>
        <div className="packing-layout">
          <section className="visual-panel">
            <div className="panel-top">
              <span className="eyebrow">CASE 01 / PRODUCTION KIT</span>
              <span className="live-dot">
                {j.status === "planning"
                  ? "Packing bench"
                  : j.status === "out"
                    ? "On location"
                    : "Back at base"}
              </span>
            </div>
            <CaseScene
              items={items}
              packed={j.status === "planning" ? j.packed : j.items}
            />
            <div className="case-foot">
              <span>
                <b>
                  {j.status === "out"
                    ? Object.keys(j.returns).length
                    : j.packed.length}
                </b>{" "}
                / {items.length}
                <small>
                  {j.status === "out" ? "items returned" : "items packed"}
                </small>
              </span>
              <span className="scene-note">
                {items.length > 9
                  ? "First 9 items shown · full list below"
                  : "Move your cursor to inspect"}
                <br />
                Live packing preview
              </span>
            </div>
          </section>
          <section className="kit-summary">
            <span className="eyebrow">THE NEXT TAKE</span>
            <h2>{j.name}</h2>
            <p>{j.client}</p>
            <dl>
              <div>
                <dt>When</dt>
                <dd>
                  {new Date(j.start + "T12:00:00").toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  —{" "}
                  {new Date(j.end + "T12:00:00").toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}
                </dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{j.location}</dd>
              </div>
              <div>
                <dt>Crew</dt>
                <dd>{j.crew}</dd>
              </div>
            </dl>
            <div className="progress">
              <i
                style={{
                  width: `${items.length ? (j.packed.length / items.length) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="status-copy">
              {j.status === "returned"
                ? "Everything accounted for. Nice work."
                : j.status === "out"
                  ? "Kit checked out. Record each return below."
                  : issues.length
                    ? `${issues.length} checks to resolve before departure.`
                    : "Everything accounted for. Ready to roll."}
            </p>
            {j.status === "planning" ? (
              <button
                className="button dark full"
                onClick={() => {
                  if (issues.length) {
                    setModal({ type: "issues", issues });
                    return;
                  }
                  change((s) => checkout(s, j.id));
                  notify("Kit checked out. Have a good shoot.");
                }}
              >
                Check out kit <ArrowUpRight size={17} />
              </button>
            ) : (
              <div className="complete-label">
                <CheckCheck size={18} />{" "}
                {j.status === "out" ? "Return items below" : "Kit returned"}
              </div>
            )}
            <button
              className="text-button"
              onClick={() =>
                download("shoot.ics", calendarFile(j), "text/calendar")
              }
            >
              Add to calendar <CalendarDays size={15} />
            </button>
          </section>
        </div>
        <section className="section">
          <div className="section-title">
            <div>
              <span className="eyebrow">EVERY DETAIL, ACCOUNTED FOR</span>
              <h3>
                {j.status === "out" ? "Return checklist" : "Packing checklist"}
              </h3>
            </div>
            {j.status === "planning" && (
              <div className="actions">
                <button
                  className="button subtle"
                  onClick={() => setModal({ type: "scan", job: j })}
                >
                  <ScanLine size={16} /> Scan label
                </button>
                <button
                  className="button subtle"
                  onClick={() => setModal({ type: "assign", job: j })}
                >
                  <Plus size={16} /> Edit kit
                </button>
              </div>
            )}
          </div>
          {!items.length && (
            <div className="empty">
              Your case is empty. Add equipment with “Edit kit”.
            </div>
          )}
          <div className="gear-list">
            {items.map((g, i) => {
              const Icon = icons[g.category];
              const clash = conflicts(s, j, g.id);
              return (
                <div className="gear-row" key={g.id}>
                  <span className="row-index">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className={"gear-icon " + g.category.toLowerCase()}>
                    <Icon size={26} />
                  </div>
                  <div className="gear-name">
                    <b>{g.name}</b>
                    <small>
                      {g.category} <span>· {g.code}</span>
                    </small>
                    {g.condition === "maintenance" && (
                      <em>Needs maintenance</em>
                    )}
                    {clash.length > 0 && j.status === "planning" && (
                      <em>Booking conflict: {clash[0].name}</em>
                    )}
                    {(g.requires || []).some((id) => !j.items.includes(id)) && (
                      <em>Required accessory missing</em>
                    )}
                  </div>
                  {j.status === "planning" ? (
                    <button
                      className={
                        "pack-toggle " +
                        (j.packed.includes(g.id) ? "packed" : "")
                      }
                      onClick={() => pack(j, g.id)}
                      aria-pressed={j.packed.includes(g.id)}
                    >
                      {j.packed.includes(g.id) ? (
                        <Check size={16} />
                      ) : (
                        <Plus size={16} />
                      )}{" "}
                      {j.packed.includes(g.id) ? "Packed" : "Pack item"}
                    </button>
                  ) : j.returns[g.id] ? (
                    <span className="pill">
                      {j.returns[g.id] === "maintenance"
                        ? "Repair needed"
                        : "Returned"}
                    </span>
                  ) : (
                    <div className="actions">
                      <button
                        className="text-button"
                        onClick={() =>
                          setModal({ type: "damage", jobId: j.id, gear: g })
                        }
                      >
                        Damaged
                      </button>
                      <button
                        className="button subtle"
                        onClick={() =>
                          change((s) => returnItem(s, j.id, g.id, "ready"))
                        }
                      >
                        <Check size={16} /> Return
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </>
    );
  };
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => importBackup(e.target.files[0])}
      />
      {page === "home" ? (
        <div className="landing">
          <header className="marketing-nav">
            {logo}
            <nav>
              <a
                href="#how"
                onClick={(e) => {
                  e.preventDefault();
                  document
                    .getElementById("how")
                    .scrollIntoView({ behavior: "smooth" });
                }}
              >
                How it works
              </a>
              <a
                href="#details"
                onClick={(e) => {
                  e.preventDefault();
                  document
                    .getElementById("details")
                    .scrollIntoView({ behavior: "smooth" });
                }}
              >
                Built for the crew
              </a>
              <a
                href="#/integrations"
                onClick={(e) => {
                  if (!s) {
                    e.preventDefault();
                    setModal("onboard");
                  }
                }}
              >
                Connections
              </a>
            </nav>
            <button className="button dark" onClick={start}>
              {s ? "Open workspace" : "Start a workspace"}
              <ArrowUpRight size={16} />
            </button>
          </header>
          <main>
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow">
                  <span className="green-dot" /> GOOD SHOOTS START BEFORE THE
                  SHOOT.
                </span>
                <h1>
                  Less “where’s
                  <br />
                  the cable?”
                  <br />
                  <em>More action.</em>
                </h1>
                <p>
                  A home for the gear behind your best work.
                  <br />
                  Pack with intention. Keep your crew in sync.
                  <br />
                  Bring every last piece back.
                </p>
                <div className="hero-actions">
                  <button className="button dark" onClick={start}>
                    Get your kit together <ArrowUpRight size={18} />
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      if (s) {
                        nav("/desk");
                        return;
                      }
                      store.demo(sampleState());
                      nav("/desk");
                    }}
                  >
                    {s ? "Open your desk" : "Explore a sample kit"}{" "}
                    <ArrowRight size={16} />
                  </button>
                </div>
                <span className="hero-caption">
                  Cloud workspaces · Google sign-in · Optional local demo
                </span>
              </div>
              <div className="hero-art">
                <div className="art-caption">
                  <span>FIELD NOTES — 001</span>
                  <span>PREPARE / CREATE / RETURN</span>
                </div>
                <CaseScene
                  items={sampleState().gear.slice(0, 6)}
                  packed={[]}
                  hero
                />
                <span className="art-tag">
                  <span className="green-dot" /> One case. Everything in its
                  place.
                </span>
                <div className="art-bottom">
                  <span>
                    DESIGNED AROUND
                    <br />
                    THE WAY YOU WORK.
                  </span>
                  <span className="large-arrow">↗</span>
                </div>
              </div>
            </section>
            <div className="ticker">
              <span>WEDDING FILMS</span>
              <span>✳</span>
              <span>SMALL PRODUCTIONS</span>
              <span>✳</span>
              <span>RENTAL TEAMS</span>
              <span>✳</span>
              <span>BIG IDEAS. SMALL CREWS.</span>
            </div>
            <section id="how" className="how">
              <div>
                <span className="eyebrow">
                  A LITTLE ORDER. A LOT MORE HEADSPACE.
                </span>
                <h2>
                  From shelf to set.
                  <br />
                  And safely back.
                </h2>
              </div>
              {[
                [
                  "01",
                  "Build the right kit",
                  "Assign equipment to a shoot. Catch overlapping bookings and missing accessories before call time.",
                ],
                [
                  "02",
                  "Leave with confidence",
                  "Scan a label or tick off your list. Checkout only opens when the complete kit is ready.",
                ],
                [
                  "03",
                  "Close the loop",
                  "Record returns, flag damage, and keep broken equipment out of the next production.",
                ],
              ].map(([n, title, desc]) => (
                <article key={n}>
                  <span>{n} /</span>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                </article>
              ))}
            </section>
            <section id="details" className="landing-note">
              <span className="eyebrow">SMALL CREW ENERGY.</span>
              <h2>
                Your equipment has a job.
                <br />
                Give it a place.
              </h2>
              <p>
                Start with a sample production or your own cloud workspace. Your
                signed-in data is shared with your crew. The optional demo stays
                in this browser. Export backups whenever you need them.
              </p>
              <button className="button lime" onClick={start}>
                Set up your desk <ArrowUpRight size={17} />
              </button>
            </section>
          </main>
          <footer>
            {logo}
            <span>Made for the people behind the frame.</span>
            <a href="#/privacy">Privacy & data</a>
          </footer>
        </div>
      ) : page === "privacy" ? (
        <main className="privacy">
          {logo}
          <h1>Your workspace, your data.</h1>
          <p>
            Signed-in workspaces are stored in Cloudflare D1. Workspace owners
            control who can access them. Google sign-in provides your account
            ID, verified email, and display name. Sessions use secure, HTTP-only
            cookies. The optional signed-out demo stays in this browser and is
            not uploaded.
          </p>
          <p>
            Calendar access is optional. When connected, encrypted authorization
            tokens are stored on the server. Sync publishes shoot names,
            locations, crew names, and dates to a dedicated Google calendar.
            Disconnecting removes the stored connection; existing events remain
            in Google. You can revoke Google access in your Google account
            settings. Activity audit records are retained for 90 days. Export
            workspace data in Settings. Cloudflare and Google process data
            needed to provide these services.
          </p>
          <a href="#/">Return home →</a>
        </main>
      ) : store.loading ? (
        <main className="privacy">
          <h1>Opening your workspace…</h1>
        </main>
      ) : page === "login" ? (
        <Login store={store} />
      ) : page === "invite" ? (
        <Invite store={store} token={route.split("/")[2]} />
      ) : !s ? (
        <main className="privacy">
          {logo}
          <h1>Make room for your next shoot.</h1>
          <CloudBar store={store} />
          <button className="button dark" onClick={start}>
            Create workspace <ArrowRight size={16} />
          </button>
        </main>
      ) : (
        <div className="app-shell" aria-busy={store.busy}>
          <aside className={"sidebar " + (menu ? "open" : "")}>
            {logo}
            <div className="workspace-label">
              <span className="workspace-avatar">
                {s.workspace.slice(0, 1)}
              </span>
              <div>
                <b>{s.workspace}</b>
                <small>Production workspace</small>
              </div>
            </div>
            <span className="nav-heading">WORKSPACE</span>
            <nav>
              {[
                ["desk", "Production desk", Clapperboard],
                ["shoots", "All shoots", CalendarDays],
                ["equipment", "Equipment", Box],
                ["integrations", "Connections", PlugZap],
                ["team", "Team", Package],
                ["settings", "Settings", Settings2],
              ].map(([p, label, Icon]) => (
                <a
                  key={p}
                  className={
                    page === p || (p === "shoots" && page === "shoot")
                      ? "active"
                      : ""
                  }
                  href={"#/" + p}
                >
                  <Icon size={18} />
                  {label}
                  {p === "shoots" && (
                    <span className="nav-count">{upcoming.length}</span>
                  )}
                </a>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <div className="local-indicator">
                <span className="green-dot" />{" "}
                {store.cloud ? "Cloud workspace" : "Local demo"}
              </div>
              <p>
                {s.demo
                  ? "You’re exploring sample data."
                  : store.cloud
                    ? store.account.user.email
                    : "Saved on this device."}
                <br />
                Export a backup to keep it safe.
              </p>
              <button className="text-button" onClick={exportBackup}>
                Export workspace <Download size={14} />
              </button>
              {!store.cloud && (
                <a className="text-button" href="#/login">
                  Sign in for cloud access ↗
                </a>
              )}
            </div>
          </aside>
          <div className="app-main">
            <CloudBar store={store} />
            <header className="app-topbar">
              <button
                className="mobile-menu"
                aria-label="Toggle navigation"
                onClick={() => setMenu(!menu)}
              >
                <Menu />
              </button>
              <span>
                {s.workspace} <ChevronRight size={13} />{" "}
                {page === "shoot"
                  ? "Shoot detail"
                  : page === "desk"
                    ? "Production desk"
                    : page.charAt(0).toUpperCase() + page.slice(1)}
              </span>
              <div>
                <span className="top-date">
                  {new Date().toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span className="profile">{s.workspace.slice(0, 1)}</span>
              </div>
            </header>
            {s.demo && (
              <div className="demo-strip">
                SAMPLE WORKSPACE{" "}
                <span>
                  Try the complete workflow with fictional shoots and equipment.
                </span>
                <button onClick={() => setModal("fresh")}>
                  Start with my gear <ArrowUpRight size={13} />
                </button>
              </div>
            )}
            <main className="workspace-main">
              {page === "desk" ? (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        A CLEAR DESK. A CLEAR HEAD.
                      </span>
                      <h1>Ready for the next take.</h1>
                      <p>Good work starts with knowing where everything is.</p>
                    </div>
                    <button
                      className="button dark"
                      onClick={() => setModal("newShoot")}
                    >
                      <Plus size={17} /> New shoot
                    </button>
                  </div>
                  <div className="metrics">
                    <div>
                      <span>Upcoming shoots</span>
                      <b>
                        {upcoming.length}
                        <small>on the board</small>
                      </b>
                    </div>
                    <div>
                      <span>Equipment library</span>
                      <b>
                        {s.gear.length}
                        <small>pieces of the picture</small>
                      </b>
                    </div>
                    <div>
                      <span>Out on location</span>
                      <b>
                        {s.jobs
                          .filter((j) => j.status === "out")
                          .reduce(
                            (n, j) =>
                              n + j.items.filter((id) => !j.returns[id]).length,
                            0,
                          )}
                        <small>items to bring home</small>
                      </b>
                    </div>
                    <div>
                      <span>Needs some care</span>
                      <b>
                        {
                          s.gear.filter((g) => g.condition === "maintenance")
                            .length
                        }
                        <small>in maintenance</small>
                      </b>
                    </div>
                  </div>
                  {active ? (
                    kitPanel(active)
                  ) : (
                    <div className="empty large">
                      <Clapperboard size={40} />
                      <h2>Your next production starts here.</h2>
                      <p>Add equipment to your library, then create a shoot.</p>
                      <button
                        className="button dark"
                        onClick={() => nav("/equipment")}
                      >
                        Add your equipment <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                  <section className="section">
                    <div className="section-title">
                      <h3>On the horizon</h3>
                      <a href="#/shoots" className="text-button">
                        View all shoots <ArrowUpRight size={16} />
                      </a>
                    </div>
                    {upcoming.length ? (
                      upcoming.map(jobCard)
                    ) : (
                      <p>No upcoming shoots.</p>
                    )}
                  </section>
                </>
              ) : page === "shoot" && job ? (
                <>
                  <div className="page-heading">
                    <div>
                      <a className="eyebrow" href="#/shoots">
                        ← ALL SHOOTS
                      </a>
                      <h1>Every piece has a part.</h1>
                    </div>
                    <button
                      className="button subtle"
                      onClick={() =>
                        download(
                          "packing-list.txt",
                          [
                            job.name,
                            job.location,
                            "Crew: " + job.crew,
                            "",
                            ...job.items.map((id) => {
                              const g = s.gear.find((g) => g.id === id);
                              return `${job.packed.includes(id) ? "[x]" : "[ ]"} ${g.name} · ${g.code}`;
                            }),
                          ].join("\n"),
                          "text/plain",
                        )
                      }
                    >
                      <Download size={16} /> Packing list
                    </button>
                  </div>
                  {kitPanel(job)}
                  <section className="section">
                    <h3>Field notes</h3>
                    {job.activity.length ? (
                      job.activity
                        .slice()
                        .reverse()
                        .map((a, i) => (
                          <div className="activity" key={i}>
                            <span className="green-dot" />
                            <p>{a.text}</p>
                            <time>
                              {new Date(a.at).toLocaleString("en-IN", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>
                          </div>
                        ))
                    ) : (
                      <p>No activity yet.</p>
                    )}
                  </section>
                </>
              ) : page === "shoots" ? (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        FROM FIRST CALL TO FINAL WRAP
                      </span>
                      <h1>The production board.</h1>
                    </div>
                    <button
                      className="button dark"
                      onClick={() => setModal("newShoot")}
                    >
                      <Plus size={17} /> New shoot
                    </button>
                  </div>
                  <div className="toolbar">
                    <div className="tabs">
                      {["All", "Preparing", "On location", "Returned"].map(
                        (t) => (
                          <button
                            className={filter === t ? "selected" : ""}
                            onClick={() => setFilter(t)}
                            key={t}
                          >
                            {t}
                          </button>
                        ),
                      )}
                    </div>
                    <label className="search">
                      <Search size={16} />
                      <input
                        placeholder="Find a shoot…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                  </div>
                  {s.jobs
                    .filter(
                      (j) =>
                        j.name.toLowerCase().includes(query.toLowerCase()) &&
                        (filter === "All" ||
                          {
                            Preparing: "planning",
                            "On location": "out",
                            Returned: "returned",
                          }[filter] === j.status),
                    )
                    .map(jobCard)}
                  {!s.jobs.length && (
                    <div className="empty">
                      Create your first shoot to get the crew moving.
                    </div>
                  )}
                </>
              ) : page === "equipment" ? (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">TOOLS OF YOUR TRADE</span>
                      <h1>A place for every piece.</h1>
                      <p>
                        Track equipment, label it, and build dependable kits.
                      </p>
                    </div>
                    <button
                      className="button dark"
                      onClick={() => setModal("newGear")}
                    >
                      <Plus size={17} /> Add equipment
                    </button>
                  </div>
                  <div className="toolbar">
                    <select
                      aria-label="Equipment category"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      {["All", ...categories].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    <label className="search">
                      <Search size={16} />
                      <input
                        placeholder="Name or label code…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="inventory-grid">
                    {s.gear
                      .filter(
                        (g) =>
                          (filter === "All" || g.category === filter) &&
                          (g.name + " " + g.code)
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                      )
                      .map((g) => {
                        const Icon = icons[g.category];
                        return (
                          <button
                            className="inventory-card"
                            key={g.id}
                            onClick={() => setModal({ type: "gear", gear: g })}
                          >
                            <div className="inventory-top">
                              <span>{g.code}</span>
                              <ArrowUpRight size={17} />
                            </div>
                            <div
                              className={
                                "inventory-object " + g.category.toLowerCase()
                              }
                            >
                              <Icon size={74} strokeWidth={1} />
                            </div>
                            <small>{g.category}</small>
                            <h3>{g.name}</h3>
                            <span
                              className={
                                "inventory-status " +
                                (g.condition === "ready" ? "" : "warning")
                              }
                            >
                              <span className="green-dot" />
                              {g.condition === "ready"
                                ? "Serviceable"
                                : "Needs maintenance"}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                  {!s.gear.length && (
                    <div className="empty">
                      Add a camera, cable, or any other piece of your kit.
                    </div>
                  )}
                </>
              ) : page === "team" ? (
                <Team store={store} />
              ) : page === "integrations" ? (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        USE THE TOOLS YOU ALREADY KNOW
                      </span>
                      <h1>Keep the work connected.</h1>
                      <p>
                        Connect Google Calendar and keep your production dates
                        in sync.
                      </p>
                    </div>
                  </div>
                  <CalendarConnection store={store} />
                  <div className="integration-grid">
                    {[
                      [
                        CalendarDays,
                        "Your calendar",
                        "Export a shoot as an .ics event for Google Calendar, Apple Calendar, or Outlook.",
                        "Available · file export",
                        "Choose a shoot",
                        () => nav("/shoots"),
                      ],
                      [
                        ScanLine,
                        "Equipment labels",
                        "Generate a QR label for each item. Scan supported cameras or enter its code at the packing bench.",
                        "Available · on device",
                        "Open equipment",
                        () => nav("/equipment"),
                      ],
                      [
                        Download,
                        "Portable workspace",
                        "Download every shoot, item, and activity entry as a JSON backup. Restore it on another browser.",
                        "Available · file export",
                        "Export backup",
                        exportBackup,
                      ],
                      [
                        Package,
                        "Packing lists",
                        "Download a readable checklist for each production to share with your crew.",
                        "Available · text export",
                        "Choose a shoot",
                        () => nav("/shoots"),
                      ],
                    ].map(([Icon, title, body, status, cta, fn]) => (
                      <article className="integration-card" key={title}>
                        <Icon size={28} />
                        <span className="pill">{status}</span>
                        <h3>{title}</h3>
                        <p>{body}</p>
                        <button className="text-button" onClick={fn}>
                          {cta}
                          <ArrowUpRight size={16} />
                        </button>
                      </article>
                    ))}
                  </div>
                </>
              ) : page === "settings" ? (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">MAKE IT YOURS</span>
                      <h1>Workspace settings.</h1>
                    </div>
                  </div>
                  <form
                    className="settings-card"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = new FormData(e.currentTarget)
                        .get("name")
                        .trim();
                      if (name) {
                        setS({ ...s, workspace: name });
                        notify(
                          store.cloud
                            ? "Saving workspace name…"
                            : "Workspace name saved.",
                        );
                      }
                    }}
                  >
                    <h3>The name on the door</h3>
                    <label>
                      Workspace name
                      <input
                        name="name"
                        required
                        maxLength={60}
                        defaultValue={s.workspace}
                      />
                    </label>
                    <button className="button dark">
                      Save name <Check size={16} />
                    </button>
                  </form>
                  <div className="settings-card">
                    <h3>Keep a copy of your work</h3>
                    <p>
                      {store.cloud
                        ? "Your workspace is saved in the cloud. You can also keep a portable backup. Only owners can restore backups."
                        : "This demo is saved in this browser. Sign in for cloud storage and team sharing."}
                    </p>
                    <div className="actions">
                      <button className="button subtle" onClick={exportBackup}>
                        <Download size={16} /> Export backup
                      </button>
                      <button
                        className="button subtle"
                        onClick={() => input.current.click()}
                      >
                        <Upload size={16} /> Restore backup
                      </button>
                    </div>
                  </div>
                  <div className="settings-card">
                    <h3>A fresh start</h3>
                    <p>
                      {store.cloud
                        ? "Create another workspace for a different crew. Your current workspace is retained."
                        : "Create an empty cloud workspace for your own equipment."}
                    </p>
                    <button
                      className="text-button danger"
                      onClick={() => setModal("fresh")}
                    >
                      New cloud workspace <Plus size={15} />
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty">
                  <h1>That page is not on the board.</h1>
                  <a href="#/desk">Back to the desk</a>
                </div>
              )}
              <footer className="app-footer">
                <span>KitRelay / Made for the work before the work.</span>
                <a href="#/privacy">Privacy & data</a>
              </footer>
            </main>
          </div>
        </div>
      )}
      {modal && (
        <Modal onClose={() => setModal(null)}>
          <fieldset className="modal-fields" disabled={store.busy}>
            {modal === "onboard" || modal === "fresh" ? (
              <>
                <span className="eyebrow">
                  YOUR NEXT GREAT SHOOT STARTS HERE
                </span>
                <h2>
                  {modal === "fresh"
                    ? "Start with your own gear."
                    : "A home for your gear."}
                </h2>
                <p>
                  {store.account?.user
                    ? "Create a shared cloud workspace for your crew. Existing workspaces are retained."
                    : "Sign in with Google to create your cloud workspace."}
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const name = new FormData(e.currentTarget)
                      .get("name")
                      .trim();
                    if (!name) return;
                    if (await store.create(name)) {
                      setModal(null);
                      nav("/equipment");
                    }
                  }}
                >
                  <label>
                    Studio or crew name
                    <input
                      name="name"
                      placeholder="e.g. Frame & Field"
                      required
                      maxLength={60}
                    />
                  </label>
                  <button className="button dark full">
                    Create empty workspace <ArrowRight size={16} />
                  </button>
                </form>
                {modal === "onboard" && !store.account?.user && (
                  <button
                    className="button subtle full"
                    onClick={() => {
                      store.demo(sampleState());
                      setModal(null);
                      nav("/desk");
                    }}
                  >
                    Explore with sample equipment <ArrowUpRight size={16} />
                  </button>
                )}
              </>
            ) : modal === "newShoot" ? (
              <>
                <h2>Put a shoot on the board.</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = Object.fromEntries(new FormData(e.currentTarget));
                    if (f.end < f.start) {
                      notify("End date must be on or after the start.");
                      return;
                    }
                    const id = uid();
                    setS({
                      ...s,
                      jobs: [
                        ...s.jobs,
                        {
                          ...f,
                          id,
                          status: "planning",
                          items: [],
                          packed: [],
                          returns: {},
                          activity: [
                            {
                              text: "Shoot created",
                              at: new Date().toISOString(),
                            },
                          ],
                        },
                      ],
                    });
                    setModal(null);
                    nav("/shoot/" + id);
                  }}
                >
                  <label>
                    Shoot name
                    <input
                      name="name"
                      required
                      maxLength={100}
                      placeholder="e.g. The lakeside wedding"
                    />
                  </label>
                  <label>
                    Client
                    <input
                      name="client"
                      maxLength={100}
                      placeholder="Client or project"
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      Start date
                      <input
                        name="start"
                        type="date"
                        defaultValue={localDate(1)}
                        required
                      />
                    </label>
                    <label>
                      End date
                      <input
                        name="end"
                        type="date"
                        defaultValue={localDate(1)}
                        required
                      />
                    </label>
                  </div>
                  <label>
                    Location
                    <input name="location" required maxLength={150} />
                  </label>
                  <label>
                    Crew
                    <input
                      name="crew"
                      required
                      maxLength={100}
                      placeholder="Names of the people on this shoot"
                    />
                  </label>
                  <button className="button dark full">
                    Create shoot <ArrowRight size={16} />
                  </button>
                </form>
              </>
            ) : modal === "newGear" ? (
              <>
                <h2>Meet your next kit member.</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = Object.fromEntries(new FormData(e.currentTarget));
                    f.name = f.name.trim();
                    f.code = f.code.trim();
                    if (!f.name || !f.code) return;
                    if (
                      s.gear.some(
                        (g) => g.code.toLowerCase() === f.code.toLowerCase(),
                      )
                    ) {
                      notify("That label code already exists.");
                      return;
                    }
                    setS({
                      ...s,
                      gear: [
                        ...s.gear,
                        { ...f, id: uid(), condition: "ready", requires: [] },
                      ],
                    });
                    setModal(null);
                    notify("Equipment added to the library.");
                  }}
                >
                  <label>
                    Equipment name
                    <input
                      name="name"
                      required
                      maxLength={100}
                      placeholder="Sony FX3"
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      Category
                      <select name="category">
                        {categories.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Unique label code
                      <input
                        name="code"
                        required
                        maxLength={40}
                        defaultValue={"KR-" + uid().slice(0, 6).toUpperCase()}
                      />
                    </label>
                  </div>
                  <label>
                    Notes
                    <textarea
                      name="notes"
                      maxLength={500}
                      placeholder="Serial number, care instructions…"
                    />
                  </label>
                  <button className="button dark full">
                    Add to library <Plus size={16} />
                  </button>
                </form>
              </>
            ) : modal.type === "assign" ? (
              <Assign
                state={s}
                job={s.jobs.find((j) => j.id === modal.job.id)}
                onSave={(ids) => {
                  updateJob(modal.job.id, (j) =>
                    addActivity(
                      {
                        ...j,
                        items: ids,
                        packed: j.packed.filter((id) => ids.includes(id)),
                      },
                      "Kit equipment updated",
                    ),
                  );
                  setModal(null);
                }}
              />
            ) : modal.type === "issues" ? (
              <>
                <AlertTriangle className="warning" />
                <h2>A few things before you go.</h2>
                <p>Resolve these checks before this kit leaves.</p>
                <ul className="issues">
                  {modal.issues.map((i, n) => (
                    <li key={n}>{i}</li>
                  ))}
                </ul>
                <button
                  className="button dark full"
                  onClick={() => setModal(null)}
                >
                  Back to the packing bench
                </button>
              </>
            ) : modal.type === "scan" ? (
              <Scanner
                onScan={(code) =>
                  scan(
                    s.jobs.find((j) => j.id === modal.job.id),
                    code,
                  )
                }
              />
            ) : modal.type === "gear" ? (
              <GearDetail
                gear={s.gear.find((g) => g.id === modal.gear.id)}
                state={s}
                onUpdate={(g) =>
                  setS({
                    ...s,
                    gear: s.gear.map((x) => (x.id === g.id ? g : x)),
                  })
                }
                notify={notify}
              />
            ) : modal.type === "damage" ? (
              <>
                <h2>Set aside for a little care.</h2>
                <p>
                  Return {modal.gear.name} and mark it for maintenance. Checkout
                  will be blocked until it is marked serviceable again.
                </p>
                <button
                  className="button dark full"
                  onClick={() => {
                    change((s) =>
                      returnItem(s, modal.jobId, modal.gear.id, "maintenance"),
                    );
                    setModal(null);
                  }}
                >
                  Return & flag maintenance
                </button>
              </>
            ) : modal.type === "restore" ? (
              <>
                <h2>Restore this workspace?</h2>
                <p>
                  This replaces your current data with “{modal.data.workspace}”:{" "}
                  {modal.data.gear.length} equipment items and{" "}
                  {modal.data.jobs.length} shoots.
                </p>
                {s && (
                  <button className="button subtle full" onClick={exportBackup}>
                    Export current workspace first
                  </button>
                )}
                <button
                  className="button dark full"
                  onClick={() => {
                    store.restore(modal.data);
                    setModal(null);
                    nav("/desk");
                    notify("Backup restored.");
                  }}
                >
                  Replace and restore
                </button>
              </>
            ) : null}
          </fieldset>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}
function Modal({ children, onClose }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <button
        className="modal-close"
        onClick={onClose}
        aria-label="Close dialog"
      >
        <X size={20} />
      </button>
      {children}
    </dialog>
  );
}
function Assign({ state, job, onSave }) {
  const [ids, setIds] = useState(job.items);
  return (
    <>
      <h2>Build this production’s kit.</h2>
      <p>
        Accessories are checked at checkout. Select the items this crew needs.
      </p>
      <div className="assign-list">
        {state.gear.map((g) => (
          <label key={g.id}>
            <input
              type="checkbox"
              checked={ids.includes(g.id)}
              onChange={(e) =>
                setIds(
                  e.target.checked
                    ? [...ids, g.id]
                    : ids.filter((id) => id !== g.id),
                )
              }
            />
            <span>
              <b>{g.name}</b>
              <small>
                {g.category} · {g.code}
                {g.condition !== "ready" ? " · maintenance" : ""}
                {conflicts(state, job, g.id).length
                  ? " · booking conflict"
                  : ""}
              </small>
            </span>
          </label>
        ))}
      </div>
      {!state.gear.length && <p>Add equipment in your library first.</p>}
      <button className="button dark full" onClick={() => onSave(ids)}>
        Save kit · {ids.length} items <Check size={16} />
      </button>
    </>
  );
}
function GearDetail({ gear: g, state, onUpdate, notify }) {
  const [qr, setQr] = useState(""),
    [notes, setNotes] = useState(g.notes || "");
  useEffect(() => {
    QRCode.toDataURL(g.code, {
      width: 280,
      margin: 2,
      color: { dark: "#173e35", light: "#ffffff" },
    })
      .then(setQr)
      .catch(() => notify("Could not generate QR label."));
  }, [g.code]);
  return (
    <>
      <span className="eyebrow">
        {g.category} / {g.code}
      </span>
      <h2>{g.name}</h2>
      <div className="qr-wrap">
        {qr && <img src={qr} alt={"QR label " + g.code} />}
        <div>
          <b>{g.code}</b>
          <p>Print this label and attach it to the equipment or case.</p>
          <a className="text-button" href={qr} download={g.code + ".png"}>
            Download QR label <Download size={15} />
          </a>
        </div>
      </div>
      <label>
        Condition
        <select
          value={g.condition}
          onChange={(e) => onUpdate({ ...g, condition: e.target.value })}
        >
          <option value="ready">Serviceable</option>
          <option value="maintenance">Needs maintenance</option>
        </select>
      </label>
      <label>
        Care notes
        <textarea
          value={notes}
          maxLength={500}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <button
        className="button subtle"
        onClick={() => onUpdate({ ...g, notes })}
      >
        Save care notes
      </button>
      <h3>Required accessories</h3>
      <p className="muted">
        These must be included whenever this item is assigned.
      </p>
      <div className="dependency-list">
        {state.gear
          .filter((x) => x.id !== g.id)
          .map((x) => (
            <label key={x.id}>
              <input
                type="checkbox"
                checked={g.requires.includes(x.id)}
                onChange={(e) =>
                  onUpdate({
                    ...g,
                    requires: e.target.checked
                      ? [...g.requires, x.id]
                      : g.requires.filter((id) => id !== x.id),
                  })
                }
              />
              {x.name}
            </label>
          ))}
      </div>
      <small className="muted">
        Condition and accessory changes save immediately. Save care notes with
        the button above.
      </small>
    </>
  );
}
function Scanner({ onScan }) {
  const [code, setCode] = useState(""),
    [message, setMessage] = useState(""),
    video = useRef(),
    stream = useRef(),
    timer = useRef(),
    last = useRef(""),
    callback = useRef(onScan);
  callback.current = onScan;
  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      clearInterval(timer.current);
    },
    [],
  );
  async function camera() {
    if (!("BarcodeDetector" in window)) {
      setMessage(
        "Camera scanning is not supported in this browser. Enter the label code below.",
      );
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      video.current.srcObject = stream.current;
      await video.current.play();
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      timer.current = setInterval(async () => {
        try {
          const codes = await detector.detect(video.current);
          if (codes[0] && codes[0].rawValue !== last.current) {
            last.current = codes[0].rawValue;
            callback.current(codes[0].rawValue);
            setMessage("Scanned " + codes[0].rawValue);
          }
        } catch {}
      }, 600);
      setMessage("Point the camera at a KitRelay label.");
    } catch {
      setMessage("Camera unavailable. Enter the label code below.");
    }
  }
  return (
    <>
      <h2>Scan. Pack. Next.</h2>
      <p>Use a KitRelay QR label, a USB scanner, or enter the printed code.</p>
      <video ref={video} muted playsInline className="scanner-video" />
      <button className="button subtle full" onClick={camera}>
        Enable camera <Camera size={17} />
      </button>
      <p role="status">{message}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onScan(code);
          setCode("");
        }}
      >
        <label>
          Equipment label
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="KR-001"
            required
          />
        </label>
        <button className="button dark full">
          Pack this item <Check size={16} />
        </button>
      </form>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);

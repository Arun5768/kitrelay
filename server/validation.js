import { validateBackup, blockers } from "../src/domain.js";
import { assert } from "./security.js";
const validDate = (s) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !isNaN(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
const text = (v, n) => typeof v === "string" && v.length <= n;
export function validateState(s) {
  try {
    validateBackup(s);
  } catch {
    assert(false, 400, "Invalid workspace data.");
  }
  assert(
    s.workspace.trim().length > 0 &&
      s.workspace.length <= 60 &&
      s.gear.length <= 500 &&
      s.jobs.length <= 500,
    400,
    "Workspace limits exceeded (500 items / shoots).",
  );
  const codes = new Set();
  for (const g of s.gear) {
    assert(
      text(g.id, 80) &&
        text(g.name, 100) &&
        g.name.trim() &&
        text(g.code, 40) &&
        g.code.trim() &&
        text(g.notes || "", 500) &&
        g.requires.length <= 500 &&
        new Set(g.requires).size === g.requires.length &&
        !g.requires.includes(g.id) &&
        !codes.has(g.code.toLowerCase()),
      400,
      "Invalid equipment details or duplicate labels.",
    );
    codes.add(g.code.toLowerCase());
  }
  for (const j of s.jobs) {
    assert(
      text(j.id, 80) &&
        text(j.name, 100) &&
        j.name.trim() &&
        text(j.client || "", 100) &&
        text(j.crew, 100) &&
        text(j.location, 150) &&
        validDate(j.start) &&
        validDate(j.end) &&
        j.items.length <= 500 &&
        new Set(j.items).size === j.items.length &&
        new Set(j.packed).size === j.packed.length &&
        j.activity.length <= 2000 &&
        !Array.isArray(j.returns),
      400,
      "Invalid shoot details.",
    );
    assert(
      Object.entries(j.returns).every(
        ([id, v]) =>
          j.items.includes(id) && ["ready", "maintenance"].includes(v),
      ),
      400,
      "Invalid returns.",
    );
    assert(
      j.activity.every(
        (a) => text(a.text, 400) && text(a.at, 40) && !isNaN(Date.parse(a.at)),
      ),
      400,
      "Invalid activity.",
    );
    if (j.status === "planning")
      assert(
        !Object.keys(j.returns).length,
        400,
        "A planned shoot cannot have returns.",
      );
    if (j.status === "returned")
      assert(
        j.items.length && j.items.every((id) => j.returns[id]),
        400,
        "Every item must be returned.",
      );
  }
  return { ...s, demo: false };
}
export function validateTransition(previous, next) {
  validateState(next);
  for (const old of previous.jobs) {
    const j = next.jobs.find((x) => x.id === old.id);
    assert(j, 400, "Shoots cannot be removed.");
    if (old.status === "returned") {
      assert(
        JSON.stringify(old) === JSON.stringify(j),
        400,
        "Returned shoots are read-only.",
      );
      continue;
    }
    if (old.status === "out") {
      assert(
        ["out", "returned"].includes(j.status) &&
          JSON.stringify(old.items) === JSON.stringify(j.items) &&
          old.start === j.start &&
          old.end === j.end,
        400,
        "An active checkout cannot be reassigned.",
      );
      for (const [id, value] of Object.entries(old.returns))
        assert(
          j.returns[id] === value,
          400,
          "Recorded returns cannot be rewritten.",
        );
      for (const [id, value] of Object.entries(j.returns))
        if (!old.returns[id])
          assert(
            next.gear.find((g) => g.id === id)?.condition === value,
            400,
            "Returned equipment condition must match.",
          );
    }
    if (old.status === "planning" && j.status !== "planning") {
      assert(
        j.status === "out" && !Object.keys(j.returns).length,
        400,
        "Check equipment out before returning it.",
      );
      const check = {
        ...next,
        jobs: next.jobs.map((x) =>
          x.id === j.id ? { ...x, status: "planning" } : x,
        ),
      };
      assert(
        blockers(
          check,
          check.jobs.find((x) => x.id === j.id),
        ).length === 0,
        409,
        "Resolve packing, maintenance, accessory, or booking conflicts before checkout.",
      );
    }
  }
  for (const j of next.jobs)
    if (!previous.jobs.some((x) => x.id === j.id))
      assert(
        j.status === "planning",
        400,
        "New shoots must start in planning.",
      );
  return next;
}

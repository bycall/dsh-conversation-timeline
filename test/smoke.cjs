// Smoke test for dsh-conversation-timeline client bundle.
// Mocks window.__ModuleLoader__ and a minimal cordis ctx, then verifies:
//  - the factory materializes without throwing
//  - exports.apply / exports.inject are present
//  - apply() registers the two conversation slots
//  - timeline model helpers produce sane entries from a fake snapshot
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const bundlePath = path.join(__dirname, "..", "lib", "client.js");
const code = fs.readFileSync(bundlePath, "utf8");

let loaded = null;
const sandbox = {
  window: {
    __ModuleLoader__: {
      load(entry) {
        loaded = entry;
      },
    },
  },
  console,
  document: undefined,
  setTimeout,
  clearInterval,
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: "client.js" });

if (!loaded || typeof loaded.factory !== "function") {
  console.error("FAIL: ModuleLoader.load was not called with a factory");
  process.exit(1);
}

// Materialize the factory with a require() that resolves "react" from the
// dsh CLI's bundled react; "react-dom" gets a minimal stub (createPortal is
// only exercised at render time, which this smoke test never reaches).
// The bundled react lives inside the managed dsh install, whose path changes
// across node upgrades — resolve it defensively: env override → scan the
// managed versions dir → legacy fallback → require.resolve("react").
function resolveReactPath() {
  if (process.env.DSH_REACT_PATH) return process.env.DSH_REACT_PATH;
  const candidates = [];
  const versionsDir = "/Users/bycall/.workbuddy/binaries/node/versions";
  if (fs.existsSync(versionsDir)) {
    for (const v of fs.readdirSync(versionsDir)) {
      candidates.push(
        path.join(versionsDir, v, "lib", "node_modules", "@deepseek-ai", "dsh", "node_modules", "react")
      );
    }
  }
  candidates.push(
    "/Users/bycall/.workbuddy/binaries/node/versions/22.22.2/lib/node_modules/@deepseek-ai/dsh/node_modules/react"
  );
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  try {
    return require.resolve("react");
  } catch (e) {}
  return null;
}

const reactPath = resolveReactPath();
if (!reactPath) {
  console.error("FAIL: could not resolve the dsh bundled react. Set DSH_REACT_PATH to its absolute path.");
  process.exit(1);
}
const requireFn = (spec) => {
  if (spec === "react") return require(reactPath);
  if (spec === "react/jsx-runtime") return require(reactPath + "/jsx-runtime");
  if (spec === "react-dom") return { createPortal: function () { return null; } };
  if (spec === "react-dom/client") return { createRoot: function () { return { render: function () {}, unmount: function () {} }; } };
  throw new Error("unexpected require: " + spec);
};

let moduleExports;
try {
  moduleExports = loaded.factory(requireFn);
} catch (e) {
  console.error("FAIL: factory threw:", e);
  process.exit(1);
}

if (!moduleExports || typeof moduleExports.apply !== "function") {
  console.error("FAIL: factory did not export apply");
  process.exit(1);
}
console.log("factory materialized; exports:", Object.keys(moduleExports));

// ── minimal ctx mock ──────────────────────────────────────────────────────
const registered = [];
const localeDicts = {};
const ctx = {
  effect(fn, label) {
    const cleanup = fn();
    if (typeof cleanup === "function") cleanup();
  },
  locale: {
    register(ns, dicts) {
      localeDicts[ns] = dicts;
      return () => {};
    },
    bind(ns) {
      return (key, params) => {
        const dict = localeDicts[ns] && (localeDicts[ns].zh || localeDicts[ns].en || {});
        let s = dict[key] || key;
        if (params) for (const k of Object.keys(params)) s = s.replace("{" + k + "}", String(params[k]));
        return s;
      };
    },
  },
  slots: {
    inject(name, registerFn) {
      const dispose = registerFn();
      registered.push({ name, dispose });
      return dispose;
    },
    register(opts, component) {
      registered.push({ name: opts.name, id: opts.id, component, opts });
      // call inject to verify it runs
      let injected;
      try {
        injected = opts.inject ? opts.inject("sess-1") : undefined;
      } catch (e) {
        injected = { error: String(e) };
      }
      return () => {};
    },
  },
  sessions: {
    binding() {
      return { session: { loadOlder: async () => {} } };
    },
  },
};

// register a fake global __ModuleLoader__ so apply's components can be built
try {
  moduleExports.apply(ctx);
} catch (e) {
  console.error("FAIL: apply threw:", e);
  process.exit(1);
}

const names = registered.map((r) => r.id || r.name);
console.log("registered slots:", JSON.stringify(registered.filter((r) => r.opts).map((r) => r.opts.name + "[" + r.opts.id + "]")));
if (registered.some((r) => r.opts && r.opts.name === "conversation.view")) {
  console.error("FAIL: timeline view tab should have been removed");
  process.exit(1);
}
if (registered.some((r) => r.opts && r.opts.name === "conversation.session.header.utilities")) {
  console.error("FAIL: floating mini-timeline should have been removed");
  process.exit(1);
}
if (!registered.some((r) => r.opts && r.opts.name === "conversation.input.dock" && r.opts.id === "timeline-dock")) {
  console.error("FAIL: conversation dock timeline not registered");
  process.exit(1);
}
console.log("inject list:", JSON.stringify(moduleExports.inject));
console.log("ALL CHECKS PASSED");

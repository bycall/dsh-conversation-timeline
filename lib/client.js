// dsh-conversation-timeline — client bundle.
//
// Registers one conversation surface:
//   1. Dock bar embedded in the conversation flow (slot: conversation.input.dock)
//      A horizontal timeline above the composer, aligned to the chat text
//      width; turn chips with user-prompt hover tooltips (portal to body),
//      click-to-jump to that turn's first message.
//
// Bundle format: window.__ModuleLoader__.load({ id, factory }) — the lazy-CJS
// table contract consumed by dsh-web-app. The factory requires only "react" /
// "react-dom", so this module stays self-contained over the shared client
// module table. Data source: the conversation snapshot (chat.nodes /
// chat.order / turnTimings) exposed to session-scope slot components.

window.__ModuleLoader__.load({
  id: "dsh-conversation-timeline",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    // ── react (defensive default interop) ────────────────────────────────
    var reactModule = require("react");
    var react = reactModule && reactModule.default ? reactModule.default : reactModule;
    var useState = react.useState;
    var useEffect = react.useEffect;
    var useMemo = react.useMemo;
    var createElement = react.createElement;
    var reactDomModule = require("react-dom");
    var reactDom = reactDomModule && reactDomModule.default ? reactDomModule.default : reactDomModule;
    var createPortal = reactDom.createPortal || (reactDom.default && reactDom.default.createPortal);

    var NS = "conversation-timeline";
    var STYLE_ID = "dsh-conversation-timeline-style";

    // ── i18n ─────────────────────────────────────────────────────────────
    var zh = {
      "panel.title": "对话时间线",
      "noText": "(无文本)",
      "turn": "第 {n} 轮"
    };
    var en = {
      "panel.title": "Conversation timeline",
      "noText": "(no text)",
      "turn": "Turn {n}"
    };

    // ── styles (light flat theme, matches the app's flat-ui skin) ────────
    var cssText = [
      "@keyframes dctl-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}",
      ".dctl-dock{box-sizing:border-box;display:flex;align-items:center;gap:12px;min-height:42px;padding:6px 14px;background:#fff;border:1px solid rgba(23,32,51,.08);border-radius:12px;max-width:var(--dsh-chat-content-width,748px);margin:0 auto}",
      ".dctl-dockTitle{flex:none;display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:#5d6b80;white-space:nowrap}",
      ".dctl-dockTitle::before{content:'';width:3px;height:13px;border-radius:2px;background:#4f6ef7}",
      ".dctl-dockChips{flex:1;min-width:0;display:flex;align-items:center;gap:8px;overflow-x:auto;padding:4px 2px;scrollbar-width:thin}",
      ".dctl-dockLink{flex:none;width:10px;height:1.5px;border-radius:1px;background:rgba(23,32,51,.15)}",
      ".dctl-dockChip{position:relative;flex:none;display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(23,32,51,.1);background:#f8f9fc;border-radius:14px;padding:4px 11px;cursor:pointer;font-family:inherit;color:#1b2434;transition:border-color .15s ease,background .15s ease,transform .12s ease}",
      ".dctl-dockChip:hover{background:#fff;border-color:rgba(79,110,247,.45);transform:translateY(-1px)}",
      ".dctl-dockTipFixed{position:fixed;transform:translate(-50%,calc(-100% - 10px));max-width:340px;width:max-content;min-width:120px;background:#1b2434;color:#f4f6f9;font-size:12px;line-height:1.55;border-radius:9px;padding:7px 11px;z-index:2147483000;box-shadow:0 6px 22px rgba(23,32,51,.2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-align:left;pointer-events:none}",
      ".dctl-dockTipFixed::after{content:'';position:absolute;top:100%;left:50%;transform:translateX(-50%);border:5px solid transparent;border-top-color:#1b2434}",
      ".dctl-dockChipActive{border-color:#4f6ef7;background:rgba(79,110,247,.08);box-shadow:0 0 0 1px #4f6ef7 inset}",
      ".dctl-dockDot{flex:none;width:8px;height:8px;border-radius:50%;background:#b4b2a9}",
      ".dctl-dockChipRunning .dctl-dockDot{background:#19b39b;animation:dctl-pulse 1.2s ease-in-out infinite}",
      ".dctl-dockChipError .dctl-dockDot{background:#d6405f}",
      ".dctl-dockTurn{font-size:12px;font-weight:600}",
      ".dctl-dockTime{font-size:11px;color:#8a94a3;font-variant-numeric:tabular-nums}"
    ].join("\n");

    function ensureStyle() {
      if (typeof document === "undefined") return;
      if (document.getElementById(STYLE_ID)) return;
      var style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = cssText;
      document.head.appendChild(style);
    }

    // ── time helpers ─────────────────────────────────────────────────────
    function pad(n) {
      return n < 10 ? "0" + n : String(n);
    }
    function fmtTime(ms) {
      if (typeof ms !== "number") return "";
      var d = new Date(ms);
      return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    }
    function oneLine(text) {
      if (typeof text !== "string") return "";
      var s = text.replace(/\s+/g, " ").trim();
      return s.length > 140 ? s.slice(0, 140) + "…" : s;
    }

    // ── node data extraction (defensive against shape variance) ──────────
    function nodeTurn(node) {
      try {
        var loc = node && node.location;
        if (!loc) return undefined;
        if (loc.kind === "turn") return loc.turn ? loc.turn.turn : undefined;
        if (loc.kind === "step") return loc.turn ? loc.turn.turn : undefined;
        return undefined;
      } catch (e) { return undefined; }
    }

    function entryStatus(node) {
      try {
        var d = node.data;
        if (d && d.status) return d.status;
        return undefined;
      } catch (e) { return undefined; }
    }

    function extractPreview(node, t) {
      try {
        var data = node.data;
        var kind = node.kind;
        if (!data) return t("noText");
        if (kind === "assistant") {
          var blocks = data.blocks || [];
          for (var i = 0; i < blocks.length; i++) {
            var b = blocks[i];
            if (b.kind === "text" && b.text) return oneLine(b.text);
            if (b.kind === "reasoning" && b.text) return "… " + oneLine(b.text);
            if (b.kind === "tool-call") return "🔧 " + b.name + (b.argsRaw ? " " + oneLine(String(b.argsRaw)) : "");
            if (b.kind === "image") return "[图片]";
          }
          return data.status === "running" ? t("running") : t("noText");
        }
        if (kind === "user" || kind === "steering" || kind === "context") {
          var content = data.content || [];
          for (var j = 0; j < content.length; j++) {
            var c = content[j];
            if (c && c.type === "text" && c.text) return oneLine(c.text);
          }
          return t("noText");
        }
        if (kind === "tool-result") {
          var root = data.root;
          if (root && root.call && root.call.name) return "🔧 " + root.call.name + (root.isError ? " ✕" : " ✓");
          if (root && root.name) return "🔧 " + root.name;
          return t("noText");
        }
        if (kind === "command") {
          var n = data.node || data.command || data;
          if (n && n.name) return "/" + n.name + (n.args ? " " + oneLine(String(n.args)) : "");
          return t("noText");
        }
        if (kind === "compaction") {
          if (data.compaction && data.compaction.summary) return oneLine(data.compaction.summary);
          return t("noText");
        }
        if (kind === "model-retry") {
          var cur = data.current;
          if (cur && cur.error && cur.error.message) return oneLine(cur.error.message);
          if (cur && cur.reason) return oneLine(cur.reason);
          return t("noText");
        }
        if (kind === "turn-error" || kind === "turn-max-tokens") {
          var en = data.node || data;
          if (en && en.message) return oneLine(en.message);
          return t("noText");
        }
        return t("noText");
      } catch (e) { return t("noText"); }
    }

    // ── timeline model ───────────────────────────────────────────────────
    // Turn-level chips for the dock bar embedded in the conversation flow.
    // Each chip carries the first visible node key of its turn as the jump
    // target, start time, a running/error hint, and the turn's user prompt
    // text (surfaced as a hover tooltip).
    //
    // Robustness notes:
    //  - user/steering nodes may not carry a turn location; their prompt is
    //    recorded and attached to the nearest/next turn instead of skipping.
    //  - if no user node is found, the first text-bearing node of the turn
    //    (e.g. a context injection) is used as a best-effort preview.
    function buildTurnChips(snapshot, t) {
      var out = [];
      var chat = snapshot && snapshot.chat;
      if (!chat || !chat.order || !chat.nodes) return out;
      var turnTimes = snapshot.turnTimings;
      var byTurn = {};
      var order = [];
      var lastTurn = undefined;
      var pendingUser = undefined;
      var keys = chat.order;
      for (var i = 0; i < keys.length; i++) {
        var node;
        try { node = chat.nodes.get(keys[i]); } catch (e) { node = undefined; }
        if (!node) continue;
        if (node.kind === "turn-tail") continue;
        if (node.visibility === "hidden") continue;

        var turn = nodeTurn(node);
        if (turn === undefined) {
          if (node.kind === "user" || node.kind === "steering") {
            var up = extractPreview(node, t);
            if (up && up !== t("noText")) {
              if (lastTurn !== undefined) {
                if (byTurn[lastTurn].userPreview === undefined) byTurn[lastTurn].userPreview = up;
              } else {
                pendingUser = up;
              }
            }
          }
          continue;
        }

        if (!byTurn[turn]) {
          byTurn[turn] = {
            firstKey: node.key,
            running: false,
            error: false,
            userPreview: pendingUser !== undefined ? pendingUser : undefined
          };
          if (pendingUser !== undefined) pendingUser = undefined;
          order.push(turn);
        }
        lastTurn = turn;

        if (entryStatus(node) === "running") byTurn[turn].running = true;
        if (node.kind === "turn-error") byTurn[turn].error = true;

        if (byTurn[turn].userPreview === undefined) {
          var preview;
          if (node.kind === "user" || node.kind === "steering") {
            preview = extractPreview(node, t);
          } else if (node.kind !== "assistant") {
            var probe = extractPreview(node, t);
            preview = probe && probe !== t("noText") ? probe : undefined;
          }
          if (preview && preview !== t("noText")) byTurn[turn].userPreview = preview;
        }
      }
      for (var j = 0; j < order.length; j++) {
        var turnId = order[j];
        var info = byTurn[turnId];
        if (info.userPreview === undefined) {
          var firstNode;
          try { firstNode = chat.nodes.get(info.firstKey); } catch (e) { firstNode = undefined; }
          if (firstNode) {
            var fp = extractPreview(firstNode, t);
            if (fp && fp !== t("noText")) info.userPreview = fp;
          }
        }
        var tt = turnTimes && turnTimes.get ? turnTimes.get(turnId) : undefined;
        out.push({
          turn: turnId,
          firstKey: info.firstKey,
          start: tt ? tt.startTime : undefined,
          end: tt ? tt.endTime : undefined,
          running: info.running,
          error: info.error,
          userPreview: info.userPreview
        });
      }
      return out;
    }

    // ── DOM jump helpers ─────────────────────────────────────────────────
    function findRow(key) {
      try {
        var rows = document.querySelectorAll("[data-chat-anchor-key]");
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].dataset && rows[i].dataset.chatAnchorKey === key) return rows[i];
        }
      } catch (e) {}
      return null;
    }

    function flashRow(row) {
      try {
        row.style.transition = "box-shadow .2s ease";
        row.style.boxShadow = "0 0 0 2px #4f6ef7, 0 0 0 6px rgba(79,110,247,.18)";
        setTimeout(function () { row.style.boxShadow = ""; }, 1800);
      } catch (e) {}
    }

    // Switch to the chat view tab, then wait for the target row and scroll.
    // Uses the community-established pattern of clicking the header tab
    // (label match, with a first-tab fallback since chat is the first view).
    function switchToChatAndJump(key, snapshot, loadOlder) {
      try {
        var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
        var chatTab = null;
        for (var i = 0; i < tabs.length; i++) {
          var text = (tabs[i].textContent || "").trim();
          if (text === "对话" || text === "Chat") { chatTab = tabs[i]; break; }
        }
        if (!chatTab && tabs.length > 0) chatTab = tabs[0];
        if (chatTab) chatTab.click();
      } catch (e) {}
      var attempts = 0;
      var olderCalls = 0;
      var timer = setInterval(function () {
        attempts++;
        var row = findRow(key);
        if (row) {
          clearInterval(timer);
          row.scrollIntoView({ behavior: "smooth", block: "start" });
          flashRow(row);
          return;
        }
        if (attempts > 120) { clearInterval(timer); return; }
        if (olderCalls < 3 && attempts % 12 === 0 && snapshot && snapshot.hasMore && loadOlder) {
          olderCalls++;
          try { loadOlder(); } catch (e) {}
        }
      }, 50);
    }

    // ── 2) dock bar embedded in the conversation flow ────────────────────
    // Rendered in the 'conversation.input.dock' slot (the full-width row
    // above the composer card): a compact horizontal timeline of turn chips.
    // Clicking a chip jumps to that turn's first message in the chat view.
    // Hovering shows the turn's user prompt in a tooltip PORTALED to
    // document.body — the chips scroller (overflow-x:auto) would clip any
    // child-positioned tooltip, so the bubble lives outside it.
    function DockTimeline(props) {
      var session = props.session;
      var t = props.t;
      var loadOlder = props.loadOlder;
      var chips = useMemo(function () { return buildTurnChips(session, t); }, [session, t]);
      useEffect(function () {
        try {
          if (typeof console !== "undefined" && console.debug) {
            console.debug("[dsh-conversation-timeline] dock chips:", chips.map(function (c) {
              return { turn: c.turn, hasPreview: !!c.userPreview, firstKey: c.firstKey };
            }));
          }
        } catch (e) {}
      }, [chips]);
      var tipState = useState(null);
      var tip = tipState[0];
      var setTip = tipState[1];
      if (!chips.length) return null;
      var currentTurn = null;
      for (var i = 0; i < chips.length; i++) {
        if (chips[i].running) { currentTurn = chips[i].turn; break; }
      }
      var tipChip = null;
      if (tip !== null) {
        for (var k = 0; k < chips.length; k++) {
          if (chips[k].turn === tip.turn) { tipChip = chips[k]; break; }
        }
      }
      return createElement(
        "div",
        { className: "dctl-dock" },
        createElement("span", { className: "dctl-dockTitle" }, t("panel.title")),
        createElement(
          "div",
          { className: "dctl-dockChips" },
          chips.map(function (chip, index) {
            var cls = "dctl-dockChip"
              + (chip.turn === currentTurn ? " dctl-dockChipActive" : "")
              + (chip.running ? " dctl-dockChipRunning" : "")
              + (chip.error ? " dctl-dockChipError" : "");
            var chipEl = createElement(
              "button",
              {
                key: "chip-" + chip.turn,
                type: "button",
                className: cls,
                onMouseEnter: function (e) {
                  try {
                    var rect = e.currentTarget.getBoundingClientRect();
                    setTip({ turn: chip.turn, x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top) });
                  } catch (err) {}
                },
                onMouseLeave: function () { setTip(null); },
                onClick: function () { switchToChatAndJump(chip.firstKey, session, loadOlder); }
              },
              createElement("span", { className: "dctl-dockDot" }),
              createElement("span", { className: "dctl-dockTurn" }, t("turn", { n: chip.turn })),
              createElement("span", { className: "dctl-dockTime" }, typeof chip.start === "number" ? fmtTime(chip.start) : "")
            );
            if (index === 0) return chipEl;
            return [
              createElement("span", { key: "link-" + chip.turn, className: "dctl-dockLink" }),
              chipEl
            ];
          })
        ),
        tip !== null && tipChip !== null
          ? createPortal(
              createElement(
                "div",
                { className: "dctl-dockTipFixed", style: { left: tip.x + "px", top: tip.y + "px" } },
                tipChip.userPreview ? tipChip.userPreview : t("noText")
              ),
              document.body
            )
          : null
      );
    }

    // ── plugin entry ─────────────────────────────────────────────────────
    var inject = ["slots", "sessions", "locale"];

    function apply(rawContext) {
      var ctx = rawContext;
      ensureStyle();
      ctx.effect(
        function () { return ctx.locale.register(NS, { zh: zh, en: en }); },
        "dsh-conversation-timeline: dictionaries"
      );
      var t = ctx.locale.bind(NS);

      // 1) dock bar embedded in the conversation flow (above the composer)
      ctx.slots.inject("conversation.input.dock", function () {
        return ctx.slots.register({
          name: "conversation.input.dock",
          id: "timeline-dock",
          order: 10,
          locale: NS,
          inject: function (sessionId) {
            return {
              ...(typeof sessionId === "string" && sessionId ? { sessionId: sessionId } : {}),
              loadOlder: async function () {
                try {
                  var session = ctx.sessions.binding(sessionId) && ctx.sessions.binding(sessionId).session;
                  if (session && typeof session.loadOlder === "function") await session.loadOlder();
                } catch (e) {}
              },
              t: t
            };
          }
        }, DockTimeline);
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});

// dsh-conversation-timeline — server-side mount.
//
// This is a UI-only plugin: every feature lives in the client bundle
// (lib/client.js, declared under dsh.client), which registers the timeline
// view tab and the floating mini-timeline into the conversation slots.
// The server entry exists so the cordis loader can mount the bundle entry
// declared in cordis.patch.yml.

export const name = "conversation-timeline";

export function apply() {
  // UI-only: no server-side services are provided.
}

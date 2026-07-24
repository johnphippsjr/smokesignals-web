# smokesignals-web

The web client for **SmokeSignals**, the family Matrix/comms platform. This is a
lightly-patched fork of [Cinny](https://github.com/ajbura/cinny) (a Matrix web client),
following a **minimize-fork** principle: the code stays as close to upstream as possible,
with only branding and homeserver configuration changed. See the `smokesignals` repo's
`docs/DECISIONS.md` for the fork rationale and version pinning.

- **Branch:** `smokesignals` (pinned a few commits past an upstream release tag).
- **Homeserver:** `sig.ensuritysystems.com` (`config.json`; custom homeservers disabled).
- **Build + deploy:** built into a container image on Harbor and deployed to the
  `smokesignals` k8s namespace. The deploy pipeline lives in the `smokesignals` repo,
  not here.

## Relationship to upstream Cinny

This is a private deployment fork, not a community project. For the upstream client, its
docs, the desktop app, and the self-hosting guide, see the original project:
<https://github.com/ajbura/cinny>. Upstream issue trackers and support channels do not
apply to this fork.

## Local dev

Standard Vite flow inherited from upstream Cinny: `npm install`, then `npm run dev`.

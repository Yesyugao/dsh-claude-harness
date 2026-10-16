# dsh-claude-harness

One package for the whole "make DeepSeek Harness look like Claude" job on macOS.

![Claude Harness app icon](assets/icon-1024.png)

| Piece | Delivered by |
| --- | --- |
| Claude Code style UI | `dsh-claude-style` (declared dependency; installed together) |
| Claude app icon | this package — `assets/Claude.icns` → `Contents/Resources/icon.icns` |
| App name "Claude Harness" | this package — `CFBundleName` / `CFBundleDisplayName` + the `.app` filename |

Loading the plugin never changes the app by itself. Branding is opt-in (`apply`),
because a half-applied code signature is what makes macOS kill the app on launch.

## Install

Into a DSH profile — from GitHub:

```bash
cd ~/.dsh/profiles/desktop          # or your profile dir
npm install "github:Yesyugao/dsh-claude-harness" dsh-claude-style
```

or from a local checkout:

```bash
npm install "link:/path/to/dsh-claude-harness" dsh-claude-style
```

Then add both ids to `dsh.profile.bundles` in the profile's `package.json`:

```json
{ "dsh": { "profile": { "bundles": ["...", "dsh-claude-style", "dsh-claude-harness"] } } }
```

Restart the app afterwards — plugin rows are read at startup.

## Use

```bash
dsh-claude-harness status            # what the bundle looks like right now
dsh-claude-harness apply             # icon + name, re-sign, rename (idempotent)
dsh-claude-harness restore           # put the original icon/name back
dsh-claude-harness apply --app /Applications/DeepSeek\ Harness.app --json
```

The same three operations are on the local web server, so the app can call them:

```
GET  /dsh-claude-harness/status
POST /dsh-claude-harness/apply
POST /dsh-claude-harness/restore
```

Run `dsh-claude-harness apply` again after every app update: an update replaces the
bundle, so the icon and the name come back as DeepSeek.

## What `apply` does, in order

1. refuses anything whose `CFBundleIdentifier` is not `com.deepseek.dsh`;
2. backs up `Info.plist` + `icon.icns` to `~/.dsh/dsh-claude-harness/backup/`;
3. installs `assets/Claude.icns`;
4. sets `CFBundleName` / `CFBundleDisplayName` to `Claude Harness`;
5. re-signs ad-hoc, **top level only** (`codesign --force --sign -`;
   `--deep` fails on the running helper subcomponents with "Operation not permitted");
6. renames the bundle to `Claude Harness.app` **last**, then refreshes LaunchServices
   and verifies `codesign --verify` passes.

Steps 3–5 are skipped when the values already match, so re-running is cheap.

## Notes

- macOS only (`os: ["darwin"]`), Node ≥ 22.6.
- Ad-hoc re-signing resets TCC grants; macOS may ask again for folder access.
- `restore` puts back the plist/icon/name from the backup, not a different app version.
- The icon: 1024×1024 squircle, `#D97757`, with the Claude mark centred by pixel
  centroid. Source `assets/icon.html` → `assets/Claude.icns`.
- Check: `npm test` — `test/branding.test.mjs` builds a throwaway fake bundle and
  exercises apply → no-op → restore against the real `codesign`;
  `test/routes.test.mjs` drives the HTTP handler with a mock request/response.

## License

MIT — see [LICENSE](LICENSE). The icon artwork follows the Claude brand assets; the
Claude Code style UI comes from [dsh-claude-style](https://github.com/Nwflower/dsh-claude-style).

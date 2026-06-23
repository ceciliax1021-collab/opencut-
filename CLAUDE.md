# OpenCut Project

## Current Version
- **Version**: 0.1.0
- When updating the app, update `src-tauri/Cargo.toml` version field AND `release/update.json` to match.

## Build & Release
- macOS DMG: `npm run build` → `src-tauri/target/release/bundle/dmg/*.dmg`
- Windows NSIS: built via GitHub Actions CI
- Update signing key: `~/.tauri/opencut.key` (password: `opencut-sign-key`)
- Public key is in `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`

## Release Process
1. Bump version in `src-tauri/Cargo.toml` and `release/update.json`
2. Build locally for macOS: `npm run build`
3. Generate signature: `npx tauri signer sign -k ~/.tauri/opencut.key -p opencut-sign-key <DMG_PATH>`
4. Update `release/update.json` with new version, signature, pub_date, and download URL
5. Tag and push to GitHub for Windows release
6. After Windows CI completes, update `release/update.json` with Windows signature and URL

## Key Files
- `src/App.tsx` - Main application component
- `src-tauri/src/commands.rs` - Rust backend commands
- `src-tauri/src/storage.rs` - Data persistence
- `release/update.json` - Update manifest for auto-updater

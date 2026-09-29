#!/usr/bin/env bash
# Manual deploy: build the VitePress static site and push it to the live
# cPanel host, at stardust.konstelasi.co.id/docs.
#
# Deliberately not run from CI — this script assumes an `stardustwebsite`
# entry already exists in the operator's ~/.ssh/config (host/port/user/key),
# so no credential of any kind lives in this repo. The entry is shared with
# StarDustWebsite's own deploy.sh: both sites live under the same cPanel
# account.
set -euo pipefail

REMOTE_HOST="stardustwebsite"
# Relative to the remote $HOME (an SSH command session's default cwd) — never
# an absolute /home/<user>/... path, so the account username stays out of
# this public repo entirely. "stardust" is StarDustWebsite's own docroot;
# "docs" is the subdirectory this site owns inside it, matching the
# `base: '/docs/'` set in docs/.vitepress/config.mts.
REMOTE_DIR="stardust/docs"
ARCHIVE_NAME="stardustdocs-deploy-$(date +%Y%m%d%H%M%S).tar.gz"

cleanup() {
  rm -f "$ARCHIVE_NAME"
}
trap cleanup EXIT

echo "==> Building the docs site..."
npm ci
npm run docs:build

if [ ! -d docs/.vitepress/dist ]; then
  echo "Error: docs/.vitepress/dist not found after build." >&2
  exit 1
fi

echo "==> Packaging docs/.vitepress/dist ..."
tar -czf "$ARCHIVE_NAME" -C docs/.vitepress/dist .

echo "==> Uploading to ${REMOTE_HOST}:~/${ARCHIVE_NAME} ..."
scp "$ARCHIVE_NAME" "${REMOTE_HOST}:${ARCHIVE_NAME}"

echo "==> Extracting on server ..."
# The whole directory is wiped first, unlike StarDustWebsite's deploy.sh
# (which wipes only _next/): nothing account-level (cgi-bin, .well-known,
# .user.ini, php.ini) lives inside stardust/docs/ — those sit one level up,
# in stardust/ itself — and VitePress emits plain, uncontent-hashed HTML
# per page (only assets/ is hashed), so a renamed or removed page would
# otherwise leave a stale file behind forever.
ssh "$REMOTE_HOST" bash -s <<EOF
set -euo pipefail
rm -rf "${REMOTE_DIR}"
mkdir -p "${REMOTE_DIR}"
tar -xzf "${ARCHIVE_NAME}" -C "${REMOTE_DIR}"
rm -f "${ARCHIVE_NAME}"
EOF

echo "==> Deployed to https://stardust.konstelasi.co.id/docs"

#!/usr/bin/env bash

set -Eeuo pipefail

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required remote variable: ${name}" >&2
    exit 1
  fi
}

require_var "DEPLOY_BASE_DIR"
require_var "RELEASE_ID"
require_var "ARCHIVE_PATH"

KEEP_RELEASES="${KEEP_RELEASES:-5}"
BACKEND_ENV_PATH="${BACKEND_ENV_PATH:-${DEPLOY_BASE_DIR}/shared/backend.env}"
DEPLOY_RESTART_COMMAND="${DEPLOY_RESTART_COMMAND:-}"
DEPLOY_POST_DEPLOY_COMMAND="${DEPLOY_POST_DEPLOY_COMMAND:-}"
RELEASES_DIR="${DEPLOY_BASE_DIR}/releases"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"
CURRENT_LINK="${DEPLOY_BASE_DIR}/current"
PREVIOUS_RELEASE=""

if [[ ! -f "${ARCHIVE_PATH}" ]]; then
  echo "Archive not found on server: ${ARCHIVE_PATH}" >&2
  exit 1
fi

if [[ -L "${CURRENT_LINK}" ]]; then
  PREVIOUS_RELEASE="$(readlink "${CURRENT_LINK}")"
fi

mkdir -p "${RELEASE_DIR}"
tar -xzf "${ARCHIVE_PATH}" -C "${RELEASE_DIR}"
rm -f "${ARCHIVE_PATH}"

if [[ -f "${BACKEND_ENV_PATH}" ]]; then
  ln -sfn "${BACKEND_ENV_PATH}" "${RELEASE_DIR}/backend/.env"
else
  echo "Warning: backend env file not found at ${BACKEND_ENV_PATH}" >&2
fi

pushd "${RELEASE_DIR}/backend" >/dev/null
if [[ -f package-lock.json ]]; then
  npm ci --omit=dev
else
  npm install --omit=dev --no-fund --no-audit
fi
popd >/dev/null

ln -sfn "${RELEASE_DIR}" "${CURRENT_LINK}"

rollback() {
  local exit_code="$1"
  if [[ -n "${PREVIOUS_RELEASE}" ]]; then
    ln -sfn "${PREVIOUS_RELEASE}" "${CURRENT_LINK}"
    if [[ -n "${DEPLOY_RESTART_COMMAND}" ]]; then
      eval "${DEPLOY_RESTART_COMMAND}" || true
    fi
  fi
  exit "${exit_code}"
}

if [[ -n "${DEPLOY_RESTART_COMMAND}" ]]; then
  if ! eval "${DEPLOY_RESTART_COMMAND}"; then
    echo "Restart command failed. Rolling back current symlink." >&2
    rollback 1
  fi
fi

if [[ -n "${DEPLOY_POST_DEPLOY_COMMAND}" ]]; then
  eval "${DEPLOY_POST_DEPLOY_COMMAND}"
fi

mapfile -t release_dirs < <(find "${RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d | sort -r)
if (( ${#release_dirs[@]} > KEEP_RELEASES )); then
  for old_release in "${release_dirs[@]:KEEP_RELEASES}"; do
    rm -rf "${old_release}"
  done
fi

echo "Server release ready: ${RELEASE_DIR}"

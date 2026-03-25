#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_CONFIG="${ROOT_DIR}/deploy/deploy.env"
CONFIG_FILE="${1:-${DEPLOY_CONFIG:-$DEFAULT_CONFIG}}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required config: ${name}" >&2
    exit 1
  fi
}

write_remote_env() {
  local key="$1"
  local value="$2"
  printf "%s=%q\n" "$key" "$value" >> "${REMOTE_ENV_FILE}"
}

if [[ ! -f "${CONFIG_FILE}" ]]; then
  echo "Deploy config not found: ${CONFIG_FILE}" >&2
  echo "Copy deploy/deploy.env.example to deploy/deploy.env and fill in your ECS settings first." >&2
  exit 1
fi

# shellcheck source=/dev/null
source "${CONFIG_FILE}"

require_var "DEPLOY_HOST"
require_var "DEPLOY_USER"
require_var "DEPLOY_BASE_DIR"

DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-}"
if [[ "${DEPLOY_SSH_KEY}" == ~* ]]; then
  DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY/#\~/${HOME}}"
fi
BACKEND_ENV_PATH="${BACKEND_ENV_PATH:-${DEPLOY_BASE_DIR}/shared/backend.env}"
DEPLOY_RESTART_COMMAND="${DEPLOY_RESTART_COMMAND:-}"
DEPLOY_POST_DEPLOY_COMMAND="${DEPLOY_POST_DEPLOY_COMMAND:-}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

for cmd in npm ssh scp tar mktemp; do
  require_command "${cmd}"
done

if [[ ! -d "${ROOT_DIR}/node_modules" ]]; then
  echo "Installing workspace dependencies locally..."
  (cd "${ROOT_DIR}" && npm install)
fi

echo "Building local release artifacts..."
(cd "${ROOT_DIR}" && npm run build:all)

RELEASE_ID="$(date +"%Y%m%d%H%M%S")"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/tax-con-question.${RELEASE_ID}.XXXXXX")"
ARCHIVE_NAME="tax-con-question-${RELEASE_ID}.tar.gz"
ARCHIVE_PATH="${TMP_DIR}/${ARCHIVE_NAME}"
REMOTE_ENV_NAME="deploy-${RELEASE_ID}.env"
REMOTE_ENV_FILE="${TMP_DIR}/${REMOTE_ENV_NAME}"
REMOTE_INCOMING_DIR="${DEPLOY_BASE_DIR}/incoming"
REMOTE_ARCHIVE_PATH="${REMOTE_INCOMING_DIR}/${ARCHIVE_NAME}"
REMOTE_ENV_PATH="${REMOTE_INCOMING_DIR}/${REMOTE_ENV_NAME}"
BUNDLE_DIR="${TMP_DIR}/bundle"
REMOTE_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

cleanup() {
  rm -rf "${TMP_DIR}"
}

trap cleanup EXIT

mkdir -p "${BUNDLE_DIR}/backend/dist" "${BUNDLE_DIR}/web" "${BUNDLE_DIR}/h5"

cp "${ROOT_DIR}/apps/backend/package.json" "${BUNDLE_DIR}/backend/package.json"
if [[ -f "${ROOT_DIR}/apps/backend/package-lock.json" ]]; then
  cp "${ROOT_DIR}/apps/backend/package-lock.json" "${BUNDLE_DIR}/backend/package-lock.json"
fi

cp -R "${ROOT_DIR}/apps/backend/dist/." "${BUNDLE_DIR}/backend/dist/"
cp -R "${ROOT_DIR}/apps/web/dist/." "${BUNDLE_DIR}/web/"
cp -R "${ROOT_DIR}/apps/h5/dist/." "${BUNDLE_DIR}/h5/"

tar -C "${BUNDLE_DIR}" -czf "${ARCHIVE_PATH}" .

: > "${REMOTE_ENV_FILE}"
write_remote_env "DEPLOY_BASE_DIR" "${DEPLOY_BASE_DIR}"
write_remote_env "RELEASE_ID" "${RELEASE_ID}"
write_remote_env "ARCHIVE_PATH" "${REMOTE_ARCHIVE_PATH}"
write_remote_env "BACKEND_ENV_PATH" "${BACKEND_ENV_PATH}"
write_remote_env "DEPLOY_RESTART_COMMAND" "${DEPLOY_RESTART_COMMAND}"
write_remote_env "DEPLOY_POST_DEPLOY_COMMAND" "${DEPLOY_POST_DEPLOY_COMMAND}"
write_remote_env "KEEP_RELEASES" "${KEEP_RELEASES}"

SSH_OPTIONS=(-p "${DEPLOY_PORT}" -o StrictHostKeyChecking=accept-new)
SCP_OPTIONS=(-P "${DEPLOY_PORT}" -o StrictHostKeyChecking=accept-new)

if [[ -n "${DEPLOY_SSH_KEY}" ]]; then
  SSH_OPTIONS+=(-i "${DEPLOY_SSH_KEY}")
  SCP_OPTIONS+=(-i "${DEPLOY_SSH_KEY}")
fi

echo "Uploading release ${RELEASE_ID} to ${REMOTE_TARGET}..."
ssh "${SSH_OPTIONS[@]}" "${REMOTE_TARGET}" "mkdir -p '${REMOTE_INCOMING_DIR}' '${DEPLOY_BASE_DIR}/releases' '${DEPLOY_BASE_DIR}/shared'"
scp "${SCP_OPTIONS[@]}" "${ARCHIVE_PATH}" "${REMOTE_ENV_FILE}" "${REMOTE_TARGET}:${REMOTE_INCOMING_DIR}/"

echo "Activating release on ECS..."
ssh "${SSH_OPTIONS[@]}" "${REMOTE_TARGET}" "set -Eeuo pipefail; set -a; source '${REMOTE_ENV_PATH}'; set +a; rm -f '${REMOTE_ENV_PATH}'; bash -s" < "${ROOT_DIR}/scripts/remote-release.sh"

echo "Deployment finished."
echo "Release ID: ${RELEASE_ID}"

mkdir -p scripts
cat > scripts/fix_clauder_security.sh <<'BASH'
#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

PROJECT_DIR="${1:-$(pwd)}"
cd "$PROJECT_DIR"

timestamp="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="${HOME}/.project_secrets_backups/sustender_${timestamp}"
mkdir -p "${BACKUP_DIR}"

CLAUDE_DIR=".claude"
EXCL_FILE="${CLAUDE_DIR}/.exclude_security_checks"
mkdir -p "${CLAUDE_DIR}"

log(){ printf "• %s\n" "$*"; }
warn(){ printf "‼ %s\n" "$*" >&2; }

ensure_line(){
  local line="$1" file="$2"
  touch "$file"
  grep -Fxq "$line" "$file" || echo "$line" >> "$file"
}

looks_secret(){
  # conservative heuristics for secrets
  local f="$1"
  LC_ALL=C grep -Eqi '(password|passwd|secret|token|apikey|api_key|bearer|private[_-]?key|aws_|gcp_|google_|supabase_|postgres|stripe|slack|discord|twilio|sentry|firebase|OPENAI|ANTHROPIC|CLAUDE)' "$f" && return 0
  LC_ALL=C grep -Eoq '([A-Za-z0-9+/]{40,}={0,2})' "$f" && return 0
  LC_ALL=C grep -Eoq '([A-Fa-f0-9]{64,})' "$f" && return 0
  return 1
}

sanitize_example(){
  local path="$1"
  [ -f "$path" ] || return 0
  if looks_secret "$path"; then
    warn "Sanitizing example env: $path"
    awk '
      /^[[:space:]]*#/ { print; next }
      /^[[:space:]]*$/ { print; next }
      /^[A-Za-z_][A-Za-z0-9_]*=/ {
        split($0, kv, "="); key=kv[1];
        print key"=CHANGEME"; next
      }
      { print }
    ' "$path" > "${path}.sanitized"
    mkdir -p "${BACKUP_DIR}/$(dirname "$path")"
    mv "$path" "${BACKUP_DIR}/${path}.bak"
    mv "${path}.sanitized" "$path"
  fi
}

redact_k8s_secret(){
  local path="$1"
  [ -f "$path" ] || return 0
  if looks_secret "$path"; then
    log "Redacting Kubernetes secret values in $path"
    mkdir -p "${BACKUP_DIR}/$(dirname "$path")"
    cp "$path" "${BACKUP_DIR}/${path}.orig"
    awk '
      BEGIN{inblock=0}
      /^[[:space:]]*(data|stringData)[[:space:]]*:[[:space:]]*$/ { print; inblock=1; next }
      /^[^[:space:]]/ { inblock=0; print; next }
      {
        if(inblock==1){ sub(/:[[:space:]].*$/,": REDACTED"); print }
        else{ print }
      }
    ' "$path" > "${path}.redacted"
    mv "${path}.redacted" "$path"
  fi
}

# 1) Handle .env (move outside repo)
if [ -f ".env" ]; then
  log "Backing up & removing .env from repo"
  mkdir -p "${BACKUP_DIR}/repo_root"
  mv ".env" "${BACKUP_DIR}/repo_root/.env"
  mkdir -p "${HOME}/.config/sustender/env"
  cp "${BACKUP_DIR}/repo_root/.env" "${HOME}/.config/sustender/env/.env"
  log "Copied real secrets to ~/.config/sustender/env/.env"
fi

# 2) Sanitize example envs (if any)
sanitize_example ".env.example"
sanitize_example "apps/web/.env.local.example"

# 3) Redact K8s secret manifest (if any)
redact_k8s_secret "k8s/staging/secret.yaml"

# 4) Write Clauder excludes for safe false-positives/redacted files
log "Updating ${EXCL_FILE}"
[ -f ".env.example" ] && ensure_line ".env.example" "${EXCL_FILE}"
[ -f "apps/web/.env.local.example" ] && ensure_line "apps/web/.env.local.example" "${EXCL_FILE}"
[ -f "k8s/staging/secret.yaml" ] && ensure_line "k8s/staging/secret.yaml" "${EXCL_FILE}"

# 5) Harden gitignore
grep -qE '(^|/)\.env($|[^A-Za-z0-9_])' .gitignore 2>/dev/null || echo ".env" >> .gitignore

log "Done. Try your Clauder indexing again."
BASH


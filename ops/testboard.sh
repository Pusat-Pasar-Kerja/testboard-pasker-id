#!/usr/bin/env bash
# TestBoard PASKER ID - server operations WITHOUT sudo (ADR 0010, docs/deploy/vps-deploy.md).
#
#   bash ops/testboard.sh check                 read-only report of the server (send it to the developer)
#   bash ops/testboard.sh setup                 first-time setup: data folder, Node.js, settings, cron
#   bash ops/testboard.sh deploy [ref]          backup -> update code -> build -> migrate -> restart -> smoke
#   bash ops/testboard.sh rollback [ref]        back to the previous release (code only)
#   bash ops/testboard.sh start|stop|restart|status
#   bash ops/testboard.sh backup [label]        database + evidence files, kept BACKUP_KEEP_DAYS days
#   bash ops/testboard.sh restore <dir> [--production]   default: test restore into a scratch database
#   bash ops/testboard.sh smoke [url]           public URL checks (TB-OPS-001/002)
#   bash ops/testboard.sh create-admin --email a@b --name "Nama"
#   bash ops/testboard.sh maintenance [--dry-run]   retention clean-up now (the API also runs it daily)
#   bash ops/testboard.sh cron                  (re)install the cron jobs: watchdog, nightly backup, start at boot
#   bash ops/testboard.sh watchdog              used by cron: restart the API if it stopped
#
# Run it as root or as the TestBoard user: as root it switches to the user "testboard" itself.
# Data lives in $TESTBOARD_HOME (default ~/testboard-data of that user, e.g.
# /home/testboard/testboard-data), OUTSIDE the public web folder:
#   config/api.env (secrets, 600)  storage/ (evidence)  backups/  logs/  run/  node/  deploy.conf
# Secrets are never printed, never passed on a command line, never written into this folder.

set -Eeuo pipefail
umask 022

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_USER="${TESTBOARD_USER:-testboard}"

# Root logins: the owner may keep working as root, but TestBoard itself never runs as root.
# The script creates a locked Linux account (no password, no outside login) on `setup`,
# hands the application folder to it, and re-runs itself as that account. Nobody has to
# switch users by hand. (TESTBOARD_ALLOW_ROOT=1 skips this; not recommended.)
if [ "$(id -u)" = "0" ] && [ "${TESTBOARD_ALLOW_ROOT:-0}" != "1" ]; then
  case "${1:-help}" in
    help | -h | --help) ;;
    *)
      if ! id "$SERVICE_USER" >/dev/null 2>&1; then
        case "${1:-}" in
          setup)
            printf '[testboard] Membuat user Linux "%s" untuk menjalankan TestBoard (tanpa password, tidak bisa login dari luar)\n' "$SERVICE_USER"
            useradd --create-home --shell /bin/bash "$SERVICE_USER"
            ;;
          check) ;; # read-only; runs as root until setup has created the account
          *)
            printf '[testboard] User "%s" belum ada. Jalankan dulu: bash ops/testboard.sh setup\n' "$SERVICE_USER" >&2
            exit 1
            ;;
        esac
      fi
      if id "$SERVICE_USER" >/dev/null 2>&1; then
        # Files pulled or created as root would block updates and builds.
        if [ -n "$(find "$APP_DIR" ! -user "$SERVICE_USER" -print -quit 2>/dev/null)" ]; then
          chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
        fi
        SERVICE_HOME="$(getent passwd "$SERVICE_USER" | cut -d: -f6)"
        if command -v runuser >/dev/null 2>&1; then
          exec runuser -u "$SERVICE_USER" -- env HOME="$SERVICE_HOME" USER="$SERVICE_USER" \
            bash "$APP_DIR/ops/testboard.sh" "$@"
        fi
        exec su -s /bin/bash "$SERVICE_USER" -c "$(printf '%q ' env HOME="$SERVICE_HOME" bash "$APP_DIR/ops/testboard.sh" "$@")"
      fi
      ;;
  esac
fi

TESTBOARD_HOME="${TESTBOARD_HOME:-$HOME/testboard-data}"
DEPLOY_CONF="$TESTBOARD_HOME/deploy.conf"
ENV_FILE="$TESTBOARD_HOME/config/api.env"
NODE_HOME="$TESTBOARD_HOME/node"
LOG_DIR="$TESTBOARD_HOME/logs"
RUN_DIR="$TESTBOARD_HOME/run"
BACKUP_DIR="$TESTBOARD_HOME/backups"
PID_FILE="$RUN_DIR/api.pid"
LOCK_DIR="$RUN_DIR/deploy.lock"
VIEW_NAME="v_run_case_latest_status"
NODE_MAJOR=24
SELF="$APP_DIR/ops/testboard.sh"
LOCKED=0

# Temporary MySQL client files (cnf) of this process and the deploy lock are always removed.
cleanup() {
  rm -f "$RUN_DIR"/*."$$".cnf 2>/dev/null || true
  if [ "$LOCKED" = "1" ]; then rmdir "$LOCK_DIR" 2>/dev/null || true; fi
}
trap cleanup EXIT

[ -x "$NODE_HOME/bin/node" ] && PATH="$NODE_HOME/bin:$PATH"
export PATH

# ------------------------------------------------------------------------------ output

if [ -t 1 ]; then C_B=$'\033[1;34m' C_G=$'\033[32m' C_Y=$'\033[33m' C_R=$'\033[31m' C_0=$'\033[0m'; else C_B='' C_G='' C_Y='' C_R='' C_0=''; fi
say() { printf '\n%s[testboard]%s %s\n' "$C_B" "$C_0" "$*"; }
ok() { printf '  %sOK%s     %s\n' "$C_G" "$C_0" "$*"; }
warn() { printf '  %sPERLU%s  %s\n' "$C_Y" "$C_0" "$*"; }
bad() { printf '  %sGAGAL%s  %s\n' "$C_R" "$C_0" "$*"; }
info() { printf '         %s\n' "$*"; }
die() { printf '\n%s[testboard] %s%s\n' "$C_R" "$*" "$C_0" >&2; exit 1; }

# ------------------------------------------------------------------------------ settings

# KEY=VALUE reader (never `source`: the files may contain characters bash would execute).
kv_get() { # kv_get FILE KEY
  local file="$1" key="$2" line=""
  [ -f "$file" ] || return 0
  line="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%$'\r'}"
  if [[ "$line" =~ ^\"(.*)\"$ ]] || [[ "$line" =~ ^\'(.*)\'$ ]]; then line="${BASH_REMATCH[1]}"; fi
  printf '%s' "$line"
}
env_get() { kv_get "$ENV_FILE" "$1"; }
conf() { # conf KEY DEFAULT
  local value
  value="$(kv_get "$DEPLOY_CONF" "$1")"
  printf '%s' "${value:-$2}"
}

PUBLIC_URL="${PUBLIC_URL:-$(conf PUBLIC_URL '')}"
BASE_PATH="${BASE_PATH:-$(conf BASE_PATH /testboard/)}"
GIT_REMOTE="${GIT_REMOTE:-$(conf GIT_REMOTE origin)}"
GIT_BRANCH="${GIT_BRANCH:-$(conf GIT_BRANCH main)}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-$(conf BACKUP_KEEP_DAYS 30)}"
MYSQL_BIN_DIR="${MYSQL_BIN_DIR:-$(conf MYSQL_BIN_DIR '')}"
API_PORT="$(env_get API_PORT)"
API_PORT="${API_PORT:-8787}"
HEALTH_URL="http://127.0.0.1:${API_PORT}/api/v1/health"

ensure_dirs() {
  mkdir -p "$TESTBOARD_HOME" "$TESTBOARD_HOME/config" "$LOG_DIR" "$RUN_DIR" "$BACKUP_DIR"
  chmod 700 "$TESTBOARD_HOME" "$TESTBOARD_HOME/config" "$BACKUP_DIR" 2>/dev/null || true
}

mysql_tool() { # mysql_tool mysqldump -> path
  local name="$1" dir
  for dir in "$MYSQL_BIN_DIR" /opt/lampp/bin /usr/bin /usr/local/bin /usr/local/mysql/bin; do
    [ -n "$dir" ] || continue
    if [ -x "$dir/$name" ]; then printf '%s' "$dir/$name"; return 0; fi
    if [ -x "$dir/$name.exe" ]; then printf '%s' "$dir/$name.exe"; return 0; fi
  done
  command -v "$name" 2>/dev/null || return 1
}

cnf_escape() { local s="$1"; s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; printf '%s' "$s"; }

# Client option file (600) so passwords never appear in `ps` or shell history.
write_cnf() { # write_cnf FILE USER PASSWORD HOST PORT
  (umask 077 && : >"$1")
  {
    printf '[client]\n'
    printf 'user="%s"\n' "$(cnf_escape "$2")"
    printf 'password="%s"\n' "$(cnf_escape "$3")"
    printf 'host=%s\nport=%s\n' "${4:-127.0.0.1}" "${5:-3306}"
    printf 'default-character-set=utf8mb4\n'
  } >>"$1"
}

app_cnf() { # app_cnf FILE -> client file for the API's own database account
  [ -f "$ENV_FILE" ] || die "Belum ada $ENV_FILE. Jalankan dulu: bash ops/testboard.sh setup"
  write_cnf "$1" "$(env_get DB_USER)" "$(env_get DB_PASSWORD)" "$(env_get DB_HOST)" "$(env_get DB_PORT)"
}

admin_cnf() { # admin_cnf FILE -> client file for a MySQL admin account (asked, never stored)
  if [ -n "${TESTBOARD_ADMIN_CNF:-}" ]; then cp "$TESTBOARD_ADMIN_CNF" "$1"; chmod 600 "$1"; return; fi
  [ -t 0 ] || die "Butuh akun admin MySQL; jalankan perintah ini langsung di terminal."
  local user pass
  read -r -p "  User admin MySQL (mis. root): " user
  read -r -s -p "  Password admin MySQL (tidak ditampilkan): " pass
  printf '\n'
  write_cnf "$1" "$user" "$pass" "$(env_get DB_HOST)" "$(env_get DB_PORT)"
}

node_ok() {
  command -v node >/dev/null 2>&1 &&
    node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)' 2>/dev/null
}

app_version() { grep -m 1 -o '"version": *"[^"]*"' "$APP_DIR/package.json" | cut -d '"' -f 4; }

# ------------------------------------------------------------------------------ check

cmd_check() {
  say "Pemeriksaan server (hanya membaca, tidak mengubah apa pun)"
  local user; user="$(id -un)"
  if [ "$(id -u)" = "0" ]; then
    ok "Login sebagai root. 'setup' akan membuat user Linux '$SERVICE_USER' dan skrip ini otomatis menjalankan TestBoard sebagai user itu; Anda tetap login sebagai root."
  else
    ok "User: $user"
    if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then info "sudo tanpa password: tersedia (opsional, tidak wajib)"; else info "sudo: tidak tersedia/terkunci (tidak masalah, semua langkah tanpa sudo)"; fi
  fi
  [ -r /etc/os-release ] && info "OS: $(. /etc/os-release && echo "${PRETTY_NAME:-?}") $(uname -m)"
  info "glibc: $(ldd --version 2>/dev/null | head -n 1 || echo '?')"
  info "Memori: $(free -m 2>/dev/null | awk '/^Mem:/ {print $2 " MB total, " $7 " MB tersedia"}' || echo '?')"
  info "Disk home: $(df -h "$HOME" 2>/dev/null | awk 'NR==2 {print $4 " kosong dari " $2}')"
  info "Disk aplikasi: $(df -h "$APP_DIR" 2>/dev/null | awk 'NR==2 {print $4 " kosong dari " $2}')"

  say "Repo"
  ok "Folder: $APP_DIR"
  if [ -w "$APP_DIR" ]; then ok "Bisa ditulis oleh $user"; else bad "Folder repo tidak bisa ditulis oleh $user"; fi
  if git -C "$APP_DIR" rev-parse --git-dir >/dev/null 2>&1; then
    ok "Git: $(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD) @ $(git -C "$APP_DIR" rev-parse --short HEAD) (versi $(app_version))"
    local changed; changed="$(git -C "$APP_DIR" status --porcelain --untracked-files=no | wc -l | tr -d ' ')"
    [ "$changed" = "0" ] && ok "Tidak ada perubahan lokal pada file Git" || warn "$changed file Git diubah langsung di server"
  else bad "Bukan checkout Git"; fi

  say "Program"
  for tool in git curl tar gzip sha256sum crontab; do
    if command -v "$tool" >/dev/null 2>&1; then ok "$tool"; else bad "$tool tidak ada"; fi
  done
  if node_ok; then ok "Node.js $(node -v) ($(command -v node))"; else warn "Node.js >= 22.12 belum ada (setup akan memasang Node $NODE_MAJOR di $NODE_HOME tanpa sudo)"; fi
  local tool
  for tool in mysql mysqldump; do
    if mysql_tool "$tool" >/dev/null; then ok "$tool: $(mysql_tool "$tool")"; else warn "$tool tidak ditemukan (isi MYSQL_BIN_DIR di $DEPLOY_CONF)"; fi
  done

  say "Apache"
  local httpd conf
  httpd="$(ls /opt/lampp/bin/httpd 2>/dev/null || command -v httpd || command -v apache2 || true)"
  conf="$(ls /opt/lampp/etc/httpd.conf 2>/dev/null || true)"
  [ -n "$httpd" ] && info "Program: $httpd ($("$httpd" -v 2>/dev/null | head -n 1 | sed 's/^Server version: //'))"
  if [ -n "$conf" ] && [ -r "$conf" ]; then
    for module in rewrite proxy proxy_http headers; do
      if grep -Eq "^[[:space:]]*LoadModule[[:space:]]+${module}_module" "$conf"; then ok "mod_$module aktif"; else bad "mod_$module tidak aktif di $conf"; fi
    done
    info "AllowOverride: yang menentukan adalah uji 'smoke' (.htaccess harus terbaca di folder testboard)"
  else
    warn "Konfigurasi Apache tidak terbaca (bukan masalah; uji lewat 'smoke' setelah deploy)"
  fi

  say "Port dan data TestBoard"
  if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then ok "API sudah berjalan di 127.0.0.1:$API_PORT"; else info "API belum berjalan di 127.0.0.1:$API_PORT"; fi
  if [ -d "$TESTBOARD_HOME" ]; then ok "Folder data: $TESTBOARD_HOME"; else info "Folder data belum dibuat: $TESTBOARD_HOME (dibuat oleh setup)"; fi
  if [ -f "$ENV_FILE" ]; then
    local mode; mode="$(stat -c %a "$ENV_FILE" 2>/dev/null || echo '?')"
    [ "$mode" = "600" ] && ok "Pengaturan rahasia ada, izin 600" || warn "Izin $ENV_FILE adalah $mode (harus 600)"
    grep -q '__DB_' "$ENV_FILE" && warn "Akun database di api.env belum diisi" || ok "Akun database sudah diisi (isinya tidak ditampilkan)"
  fi
  case "$TESTBOARD_HOME" in "$APP_DIR"*) bad "Folder data ada di dalam folder publik! Pindahkan.";; esac
  if crontab -l >/dev/null 2>&1; then
    crontab -l 2>/dev/null | grep -q 'testboard.sh' && ok "Cron TestBoard terpasang" || info "Cron TestBoard belum terpasang"
  else info "Crontab user masih kosong atau tidak diizinkan"; fi

  if [ -n "$PUBLIC_URL" ]; then cmd_smoke "$PUBLIC_URL" || true; else info "PUBLIC_URL belum diatur; lewati uji alamat publik."; fi
  say "Selesai. Kirimkan seluruh teks di atas ke pengembang (tidak berisi password)."
}

# ------------------------------------------------------------------------------ setup

install_node() {
  local arch tmp base file
  case "$(uname -m)" in x86_64) arch=x64 ;; aarch64 | arm64) arch=arm64 ;; *) die "Arsitektur $(uname -m) tidak didukung" ;; esac
  base="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
  tmp="$(mktemp -d "$RUN_DIR/node.XXXXXX")"
  say "Memasang Node.js $NODE_MAJOR (resmi dari nodejs.org) ke $NODE_HOME"
  curl -fsSL "$base/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
  file="$(grep -oE "node-v${NODE_MAJOR}\.[0-9]+\.[0-9]+-linux-${arch}\.tar\.gz" "$tmp/SHASUMS256.txt" | head -n 1)"
  [ -n "$file" ] || die "Tidak menemukan paket Node untuk linux-$arch"
  curl -fSL --progress-bar "$base/$file" -o "$tmp/$file"
  (cd "$tmp" && grep " ${file}\$" SHASUMS256.txt | sha256sum -c - >/dev/null) || die "Checksum Node.js tidak cocok; unduhan dibatalkan"
  rm -rf "$NODE_HOME.new" && mkdir -p "$NODE_HOME.new"
  tar -xzf "$tmp/$file" -C "$NODE_HOME.new" --strip-components=1
  rm -rf "$NODE_HOME" && mv "$NODE_HOME.new" "$NODE_HOME" && rm -rf "$tmp"
  PATH="$NODE_HOME/bin:$PATH"
  ok "Node.js $(node -v) terpasang"
}

cmd_setup() {
  ensure_dirs
  say "Folder data: $TESTBOARD_HOME (di luar folder publik)"
  case "$TESTBOARD_HOME" in "$APP_DIR"*) die "TESTBOARD_HOME tidak boleh di dalam folder aplikasi" ;; esac
  mkdir -p "$TESTBOARD_HOME/storage" && chmod 700 "$TESTBOARD_HOME/storage"

  if [ ! -f "$DEPLOY_CONF" ]; then
    local url=""
    if [ -t 0 ]; then read -r -p "  Alamat publik TestBoard (mis. https://domain-anda/testboard/): " url; fi
    {
      printf '# TestBoard deploy settings (no secrets). Edit with: nano %s\n' "$DEPLOY_CONF"
      printf 'PUBLIC_URL=%s\n' "$url"
      printf 'BASE_PATH=%s\n' "$BASE_PATH"
      printf 'GIT_REMOTE=origin\nGIT_BRANCH=main\nBACKUP_KEEP_DAYS=30\nMYSQL_BIN_DIR=\n'
    } >"$DEPLOY_CONF"
    PUBLIC_URL="$url"
    ok "Dibuat: $DEPLOY_CONF"
  else ok "Sudah ada: $DEPLOY_CONF"; fi

  if node_ok; then ok "Node.js $(node -v)"; else install_node; fi

  if [ ! -f "$ENV_FILE" ]; then
    local origin="${PUBLIC_URL%%://*}://$(printf '%s' "${PUBLIC_URL#*://}" | cut -d/ -f1)"
    [ -n "$PUBLIC_URL" ] || origin="__PUBLIC_ORIGIN__"
    (umask 077 && sed -e "s#__PUBLIC_ORIGIN__#${origin}#" -e "s#__STORAGE_DIR__#${TESTBOARD_HOME}/storage#" \
      "$APP_DIR/ops/env/api.env.example" >"$ENV_FILE")
    chmod 600 "$ENV_FILE"
    ok "Dibuat: $ENV_FILE (izin 600)"
    warn "Isi akun database: nano $ENV_FILE   (ganti __DB_USER__ dan __DB_PASSWORD__)"
  else ok "Sudah ada: $ENV_FILE"; fi

  cmd_cron
  say "Setup selesai. Langkah berikutnya:"
  info "1. nano $ENV_FILE   -> isi DB_USER dan DB_PASSWORD (akun aplikasi, bukan root)"
  info "2. bash ops/testboard.sh deploy"
}

# ------------------------------------------------------------------------------ process

api_pid() {
  local pid
  [ -f "$PID_FILE" ] || return 1
  pid="$(cat "$PID_FILE")"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null || return 1
  if [ -r "/proc/$pid/cmdline" ] && ! tr '\0' ' ' <"/proc/$pid/cmdline" | grep -q 'dist/index.js'; then return 1; fi
  printf '%s' "$pid"
}

healthy() { curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null | grep -q '"status":"ok"'; }

wait_healthy() {
  local i
  for i in $(seq 1 30); do
    healthy && return 0
    sleep 1
  done
  return 1
}

cmd_start() {
  ensure_dirs
  [ -f "$ENV_FILE" ] || die "Belum ada $ENV_FILE. Jalankan: bash ops/testboard.sh setup"
  if api_pid >/dev/null; then ok "API sudah berjalan (pid $(api_pid))"; return 0; fi
  node_ok || die "Node.js belum terpasang. Jalankan: bash ops/testboard.sh setup"
  [ -f "$APP_DIR/apps/api/dist/index.js" ] || die "API belum di-build. Jalankan: bash ops/testboard.sh deploy"
  (
    cd "$APP_DIR/apps/api"
    TESTBOARD_ENV_FILE="$ENV_FILE" nohup node dist/index.js </dev/null >>"$LOG_DIR/api.log" 2>&1 &
    echo $! >"$PID_FILE"
  )
  if wait_healthy; then ok "API berjalan (pid $(cat "$PID_FILE")), sehat"; else
    bad "API tidak sehat dalam 30 detik. 20 baris log terakhir:"
    tail -n 20 "$LOG_DIR/api.log" | sed 's/^/         /'
    return 1
  fi
}

cmd_stop() {
  local pid i
  if ! pid="$(api_pid)"; then info "API tidak berjalan"; rm -f "$PID_FILE"; return 0; fi
  kill -TERM "$pid" 2>/dev/null || true
  for i in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
  kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
  ok "API dihentikan"
}

cmd_restart() { cmd_stop && cmd_start; }

cmd_status() {
  if pid="$(api_pid)"; then ok "API berjalan (pid $pid)"; else warn "API tidak berjalan"; fi
  curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null && printf '\n' || warn "Health check tidak menjawab"
  [ -f "$LOG_DIR/releases.log" ] && info "Rilis terakhir: $(tail -n 1 "$LOG_DIR/releases.log")"
}

cmd_watchdog() {
  [ -d "$LOCK_DIR" ] && exit 0 # a deploy is running
  [ -f "$ENV_FILE" ] && [ -f "$APP_DIR/apps/api/dist/index.js" ] || exit 0
  local log="$LOG_DIR/api.log" n
  # Log rotation without signals: copy, then truncate (the API appends).
  if [ -f "$log" ] && [ "$(wc -c <"$log")" -gt 20000000 ]; then
    for n in 4 3 2 1; do [ -f "$log.$n" ] && mv -f "$log.$n" "$log.$((n + 1))"; done
    cp "$log" "$log.1" && : >"$log"
  fi
  healthy && exit 0
  sleep 5
  healthy && exit 0
  printf '%s watchdog: API tidak sehat, restart\n' "$(date -u +%FT%TZ)" >>"$LOG_DIR/watchdog.log"
  cmd_restart >>"$LOG_DIR/watchdog.log" 2>&1 || true
}

# ------------------------------------------------------------------------------ backup / restore

cmd_backup() {
  ensure_dirs
  local label="${1:-manual}" stamp dir cnf db storage dump tables
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  dir="$BACKUP_DIR/${stamp}-${label//[^A-Za-z0-9_-]/}"
  dump="$(mysql_tool mysqldump)" || die "mysqldump tidak ditemukan (isi MYSQL_BIN_DIR di $DEPLOY_CONF)"
  db="$(env_get DB_NAME)"
  storage="$(env_get STORAGE_DIR)"
  [ -n "$db" ] || die "DB_NAME kosong di $ENV_FILE"
  mkdir -p "$dir" && chmod 700 "$dir"
  cnf="$RUN_DIR/backup.$$.cnf"
  app_cnf "$cnf"
  say "Backup ke $dir"

  # The view is recreated from the baseline on restore (dumping it needs SHOW VIEW,
  # which the limited application account does not have).
  if ! "$dump" --defaults-extra-file="$cnf" --single-transaction --quick --skip-lock-tables \
    --no-tablespaces --skip-triggers --hex-blob --default-character-set=utf8mb4 \
    --ignore-table="$db.$VIEW_NAME" "$db" | gzip -6 >"$dir/db.sql.gz"; then
    rm -rf "$dir"
    die "mysqldump gagal (cek akun database di api.env)"
  fi
  ok "Database: $(du -h "$dir/db.sql.gz" | cut -f1)"

  if [ -n "$storage" ] && [ -d "$storage" ]; then
    tar --force-local -czf "$dir/storage.tar.gz" -C "$storage" --exclude=./tmp .
    ok "File bukti: $(du -h "$dir/storage.tar.gz" | cut -f1)"
  else warn "STORAGE_DIR tidak ditemukan; file bukti tidak ikut"; fi

  tables="$("$(mysql_tool mysql)" --defaults-extra-file="$cnf" -N -B -e \
    "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name" "$db")"
  {
    printf 'created_utc=%s\nlabel=%s\napp_version=%s\ngit_commit=%s\ndatabase=%s\n' \
      "$stamp" "$label" "$(app_version)" "$(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || echo '?')" "$db"
    local t
    for t in $tables; do
      t="${t%$'\r'}"
      printf 'rows.%s=%s\n' "$t" "$("$(mysql_tool mysql)" --defaults-extra-file="$cnf" -N -B -e "SELECT COUNT(*) FROM \`$t\`" "$db" | tr -d '\r')"
    done
    [ -f "$dir/storage.tar.gz" ] && printf 'storage_files=%s\n' "$(tar --force-local -tzf "$dir/storage.tar.gz" | grep -vc '/$')"
  } >"$dir/manifest.txt"
  (cd "$dir" && sha256sum db.sql.gz manifest.txt $( [ -f storage.tar.gz ] && echo storage.tar.gz) >SHA256SUMS)
  chmod 600 "$dir"/*
  rm -f "$cnf"
  ok "Manifest dan checksum ditulis"

  # Retention: older than BACKUP_KEEP_DAYS, but always keep the 3 newest.
  local old
  old="$(ls -1d "$BACKUP_DIR"/20*/ 2>/dev/null | sort | head -n -3 || true)"
  for d in $old; do
    if [ -n "$(find "$d" -maxdepth 0 -mtime +"$BACKUP_KEEP_DAYS" 2>/dev/null)" ]; then rm -rf "$d" && info "Backup lama dihapus: $(basename "$d")"; fi
  done
  printf '%s\n' "$dir"
}

view_sql() { # CREATE OR REPLACE VIEW statement from the baseline schema
  sed -n "/^CREATE OR REPLACE VIEW ${VIEW_NAME}/,/;/p" "$APP_DIR/database/baseline/schema_baseline_reference.sql"
}

cmd_restore() {
  local dir="${1:-}" mode="${2:---check}" cnf db target mysql_bin
  [ -n "$dir" ] && [ -f "$dir/db.sql.gz" ] || die "Pakai: bash ops/testboard.sh restore <folder-backup> [--production]"
  dir="$(cd "$dir" && pwd)"
  say "Memeriksa checksum $dir"
  (cd "$dir" && sha256sum -c SHA256SUMS) || die "Checksum tidak cocok; backup rusak"
  mysql_bin="$(mysql_tool mysql)" || die "mysql tidak ditemukan"
  db="$(env_get DB_NAME)"
  cnf="$RUN_DIR/restore.$$.cnf"
  admin_cnf "$cnf"

  if [ "$mode" = "--production" ]; then
    [ -t 0 ] || die "Restore produksi harus dijalankan langsung di terminal"
    local answer
    printf '\n  %sPERHATIAN%s: database "%s" dan file bukti akan DIGANTI dengan isi backup ini.\n' "$C_R" "$C_0" "$db"
    read -r -p "  Ketik nama database ($db) untuk melanjutkan: " answer
    [ "$answer" = "$db" ] || die "Dibatalkan"
    cmd_backup "before-restore" >/dev/null
    cmd_stop
    target="$db"
  else
    target="${db}_restore_check"
    say "Uji restore ke database sementara $target (data produksi tidak disentuh)"
    "$mysql_bin" --defaults-extra-file="$cnf" -e "DROP DATABASE IF EXISTS \`$target\`; CREATE DATABASE \`$target\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci"
  fi

  gzip -dc "$dir/db.sql.gz" | "$mysql_bin" --defaults-extra-file="$cnf" "$target"
  view_sql | "$mysql_bin" --defaults-extra-file="$cnf" "$target"
  ok "Database dipulihkan ke $target"

  local key expected actual mismatch=0
  while IFS='=' read -r key expected; do
    case "$key" in rows.*) ;; *) continue ;; esac
    actual="$("$mysql_bin" --defaults-extra-file="$cnf" -N -B -e "SELECT COUNT(*) FROM \`${key#rows.}\`" "$target" | tr -d '\r')"
    if [ "$actual" != "${expected%$'\r'}" ]; then bad "${key#rows.}: $actual baris, manifest ${expected%$'\r'}"; mismatch=1; fi
  done <"$dir/manifest.txt"
  [ "$mismatch" = "0" ] && ok "Jumlah baris semua tabel sama dengan manifest"
  "$mysql_bin" --defaults-extra-file="$cnf" -N -B -e "SELECT COUNT(*) FROM $VIEW_NAME" "$target" >/dev/null && ok "View $VIEW_NAME berfungsi"

  if [ -f "$dir/storage.tar.gz" ]; then
    local out
    if [ "$mode" = "--production" ]; then
      out="$(env_get STORAGE_DIR)"
      [ -d "$out" ] && mv "$out" "$out.before-restore-$(date -u +%Y%m%d-%H%M%S)"
    else
      out="$TESTBOARD_HOME/restore-check/storage"
      rm -rf "$out"
    fi
    mkdir -p "$out" && chmod 700 "$out"
    tar --force-local -xzf "$dir/storage.tar.gz" -C "$out"
    ok "File bukti dipulihkan ke $out ($(find "$out" -type f | wc -l | tr -d ' ') file)"
  fi

  if [ "$mode" = "--production" ]; then
    cmd_start
  else
    "$mysql_bin" --defaults-extra-file="$cnf" -e "DROP DATABASE \`$target\`"
    rm -rf "$TESTBOARD_HOME/restore-check"
    [ "$mismatch" = "0" ] || die "Uji restore menemukan perbedaan"
    ok "Uji restore BERHASIL; database dan folder sementara sudah dihapus lagi"
  fi
}

# ------------------------------------------------------------------------------ deploy

build_all() {
  say "npm ci (memasang paket persis sesuai package-lock)"
  (cd "$APP_DIR" && npm ci --no-audit --no-fund --loglevel=error)
  say "Build shared + API"
  (cd "$APP_DIR" && npm run build -w @testboard/shared >/dev/null && npm run build -w @testboard/api >/dev/null)
  say "Build web untuk ${BASE_PATH}"
  local web="$APP_DIR/apps/web"
  rm -rf "$web/dist.next"
  (cd "$APP_DIR" && VITE_BASE_PATH="$BASE_PATH" VITE_API_BASE_URL="${BASE_PATH}api/v1" VITE_DEMO_MODE=false \
    npm run build -w @testboard/web -- --outDir dist.next --emptyOutDir >/dev/null)
  [ -f "$web/dist.next/index.html" ] && [ -f "$web/dist.next/.htaccess" ] || die "Hasil build web tidak lengkap"
  # Switch the files Apache serves in one rename (the old build stays as dist.prev).
  rm -rf "$web/dist.prev"
  [ -d "$web/dist" ] && mv "$web/dist" "$web/dist.prev"
  mv "$web/dist.next" "$web/dist"
  ok "Build selesai"
}

migrate() { # migrate --status | --apply
  local cnf user pass
  if [ "$1" = "--status" ]; then
    (cd "$APP_DIR" && MIGRATION_DB_HOST="$(env_get DB_HOST)" MIGRATION_DB_PORT="$(env_get DB_PORT)" \
      MIGRATION_DB_USER="$(env_get DB_USER)" MIGRATION_DB_PASSWORD="$(env_get DB_PASSWORD)" \
      MIGRATION_DB_NAME="$(env_get DB_NAME)" node scripts/migrate.mjs --status --yes)
    return
  fi
  [ -t 0 ] || die "Ada migrasi database; jalankan deploy langsung di terminal (butuh akun admin MySQL)."
  read -r -p "  User admin MySQL untuk migrasi (mis. root): " user
  read -r -s -p "  Password (tidak ditampilkan, tidak disimpan): " pass
  printf '\n'
  (cd "$APP_DIR" && MIGRATION_DB_HOST="$(env_get DB_HOST)" MIGRATION_DB_PORT="$(env_get DB_PORT)" \
    MIGRATION_DB_USER="$user" MIGRATION_DB_PASSWORD="$pass" MIGRATION_DB_NAME="$(env_get DB_NAME)" \
    node scripts/migrate.mjs --yes)
}

release_log() { printf '%s %s -> %s v%s %s\n' "$(date -u +%FT%TZ)" "$1" "$2" "$(app_version)" "$3" >>"$LOG_DIR/releases.log"; }

switch_code() { # switch_code REF [branch]
  if [ -n "${2:-}" ]; then
    git -C "$APP_DIR" checkout -q "$2" 2>/dev/null || git -C "$APP_DIR" checkout -q -b "$2" "$1"
    git -C "$APP_DIR" merge -q --ff-only "$1" || die "Branch $2 di server menyimpang dari $1; hubungi pengembang"
  else
    git -C "$APP_DIR" checkout -q --detach "$1"
  fi
}

acquire_lock() {
  mkdir "$LOCK_DIR" 2>/dev/null || die "Deploy lain sedang berjalan (hapus $LOCK_DIR bila yakin tidak)"
  LOCKED=1
}

# Steps that must stop at their first error run as a separate process: bash ignores
# `set -e` inside functions called from `if`/`||`, which would hide a failed build.
step() { bash "$SELF" "$@"; }

cmd_deploy() {
  ensure_dirs
  acquire_lock
  local log="$LOG_DIR/deploy-$(date -u +%Y%m%d-%H%M%S).log"
  exec > >(tee -a "$log") 2>&1
  say "Deploy TestBoard (log: $log)"
  [ -f "$ENV_FILE" ] || die "Belum ada $ENV_FILE. Jalankan: bash ops/testboard.sh setup"
  [ "$(stat -c %a "$ENV_FILE" 2>/dev/null || echo 600)" = "600" ] || chmod 600 "$ENV_FILE"
  grep -q '__DB_' "$ENV_FILE" && die "Akun database di $ENV_FILE belum diisi"
  node_ok || die "Node.js belum terpasang. Jalankan: bash ops/testboard.sh setup"
  [ -z "$(git -C "$APP_DIR" status --porcelain --untracked-files=no)" ] || die "Ada file Git yang diubah langsung di server; deploy dihentikan"

  local prev target new branch=""
  prev="$(git -C "$APP_DIR" rev-parse HEAD)"
  git -C "$APP_DIR" fetch -q --prune --tags "$GIT_REMOTE"
  if [ -n "${1:-}" ]; then target="$1"; else target="$GIT_REMOTE/$GIT_BRANCH"; branch="$GIT_BRANCH"; fi
  new="$(git -C "$APP_DIR" rev-parse --verify -q "${target}^{commit}")" || die "Versi '$target' tidak ditemukan"
  ok "Sekarang: $(git -C "$APP_DIR" log -1 --format='%h %s' "$prev")"
  ok "Target:   $(git -C "$APP_DIR" log -1 --format='%h %s' "$new")"

  if [ "${SKIP_BACKUP:-0}" != "1" ]; then
    step backup pre-deploy >/dev/null || die "Backup sebelum deploy gagal; deploy dihentikan"
    ok "Backup sebelum deploy dibuat"
  fi

  switch_code "$target" "$branch"
  if ! step __build; then
    bad "Build gagal; kembali ke versi sebelumnya"
    switch_code "$prev" "" && step __build && cmd_restart
    die "Deploy dibatalkan (versi lama tetap berjalan)"
  fi

  say "Migrasi database"
  local status pending
  status="$(migrate --status)" || die "Tidak bisa membaca status migrasi (cek akun database di api.env)"
  printf '%s\n' "$status" | sed 's/^/         /'
  pending="$(printf '%s\n' "$status" | sed -n 's/.*pending: \([0-9][0-9]*\).*/\1/p')"
  if [ "${pending:-0}" != "0" ]; then
    local answer=""
    [ -t 0 ] && read -r -p "  Terapkan $pending migrasi di atas sekarang? Backup sudah dibuat. (ketik YA): " answer
    if [ "$answer" != "YA" ]; then
      switch_code "$prev" "" && step __build && cmd_restart
      die "Migrasi tidak disetujui; kembali ke versi sebelumnya"
    fi
    migrate --apply || die "Migrasi gagal. Lihat log; pulihkan dari backup pre-deploy bila perlu."
  fi

  say "Restart API"
  if ! cmd_restart; then
    bad "Versi baru tidak sehat; kembali ke versi sebelumnya"
    switch_code "$prev" "" && step __build && cmd_restart
    release_log "$new" "$prev" "auto-rollback"
    die "Deploy gagal, versi sebelumnya dipulihkan (database tidak dikembalikan otomatis)"
  fi
  release_log "$prev" "$new" "deploy"
  ok "Versi $(app_version) aktif"

  if [ -n "$PUBLIC_URL" ]; then cmd_smoke "$PUBLIC_URL" || warn "Uji alamat publik gagal. JANGAN go-live sebelum diperbaiki."; fi
}

cmd_rollback() {
  ensure_dirs
  acquire_lock
  local target="${1:-}" current
  current="$(git -C "$APP_DIR" rev-parse HEAD)"
  if [ -z "$target" ]; then
    target="$(grep ' deploy$' "$LOG_DIR/releases.log" 2>/dev/null | tail -n 1 | awk '{print $2}')"
    [ -n "$target" ] || die "Tidak ada riwayat rilis; sebutkan versi, mis.: rollback v0.7.2"
  fi
  say "Rollback kode ke $target (database tidak diubah)"
  switch_code "$target" ""
  step __build || die "Build versi rollback gagal"
  cmd_restart || die "Versi rollback juga tidak sehat; lihat $LOG_DIR/api.log"
  release_log "$current" "$(git -C "$APP_DIR" rev-parse HEAD)" "rollback"
  ok "Rollback selesai"
}

cmd_maintenance() {
  [ -f "$ENV_FILE" ] || die "Belum ada $ENV_FILE. Jalankan: bash ops/testboard.sh setup"
  (cd "$APP_DIR" && TESTBOARD_ENV_FILE="$ENV_FILE" npm run -s maintenance -w @testboard/api -- "$@")
}

cmd_create_admin() {
  [ -f "$ENV_FILE" ] || die "Belum ada $ENV_FILE. Jalankan: bash ops/testboard.sh setup"
  (cd "$APP_DIR" && TESTBOARD_ENV_FILE="$ENV_FILE" npm run -s admin:create-super -w @testboard/api -- "$@")
}

# ------------------------------------------------------------------------------ smoke

cmd_smoke() {
  local url="${1:-$PUBLIC_URL}" fails=0 code body path
  [ -n "$url" ] || die "Sebutkan alamat, mis.: bash ops/testboard.sh smoke https://domain-anda/testboard/"
  url="${url%/}/"
  say "Uji alamat publik $url"
  http_code() { curl -s --path-as-is -o /dev/null -w '%{http_code}' --max-time 15 "$1" || echo 000; }

  body="$(curl -s --max-time 15 "$url" || true)"
  if printf '%s' "$body" | grep -q 'id="root"'; then ok "Halaman utama tampil"; else bad "Halaman utama tidak tampil"; fails=$((fails + 1)); fi
  code="$(http_code "${url}projects/CONTOH/runs/1")"
  if [ "$code" = "200" ]; then ok "Deep link dimuat ulang tanpa 404 (TB-OPS-001)"; else bad "Deep link -> $code"; fails=$((fails + 1)); fi
  body="$(curl -s --max-time 15 "${url}api/v1/health" || true)"
  if printf '%s' "$body" | grep -q '"status":"ok"'; then ok "API sehat lewat Apache ($(printf '%s' "$body" | grep -o '"version":"[^"]*"'))"; else bad "API lewat Apache tidak menjawab"; fails=$((fails + 1)); fi
  if curl -s --max-time 15 "${url}assets/" | grep -qi 'Index of'; then
    bad "Daftar isi folder assets/ terbuka"
    fails=$((fails + 1))
  else ok "Daftar isi folder tidak bisa dilihat"; fi

  # TB-OPS-002: none of these may ever be downloadable. Only a 2xx answer means "open":
  # a firewall in front of the site may answer blocked paths with its own 403/500 page.
  local secrets=(.git/HEAD .git/config .env .htaccess apps/api/.env apps/api/src/index.ts
    apps/api/dist/index.js apps/web/src/main.tsx package.json package-lock.json
    database/baseline/schema_baseline_reference.sql database/migrations/0001_schema_migrations.sql
    ops/testboard.sh ops/env/api.env.example update.sh node_modules/hono/package.json
    docs/adr/0010-production-deploy.md .private-storage/ %2egit/HEAD .%67it/HEAD
    apps/web/dist/../../../.git/HEAD)
  probe_secrets() { # probe_secrets LABEL BASE_URL [extra curl args...]
    local label="$1" base="$2" code path
    shift 2
    for path in "${secrets[@]}"; do
      code="$(curl -s --path-as-is -o /dev/null -w '%{http_code}' --max-time 15 "$@" "${base}${path}" || echo 000)"
      case "$code" in
        2??) bad "TERBUKA ($code, $label): $path"; fails=$((fails + 1)) ;;
        000) bad "Tidak terjawab ($label): $path"; fails=$((fails + 1)) ;;
        *) ok "Tertutup ($code, $label): $path" ;;
      esac
    done
  }
  probe_secrets "publik" "$url"

  # The same paths straight to this server's Apache, bypassing any firewall in front, so
  # the result proves the .htaccess rules themselves (not only the firewall). Tries the
  # site's own scheme/port first, then plain HTTP (a firewall may terminate HTTPS); a
  # listener that only redirects proves nothing and is skipped.
  local rest="${url#*://}" scheme="${url%%://*}" hostport host port path_part candidate
  local s p base code answered=""
  hostport="${rest%%/*}"
  path_part="/${rest#*/}"
  host="${hostport%:*}"
  port="${hostport##*:}"
  [ "$port" = "$hostport" ] && { [ "$scheme" = "https" ] && port=443 || port=80; }
  for candidate in "$scheme:$port" "http:80"; do
    s="${candidate%%:*}"
    p="${candidate##*:}"
    base="$s://$host:$p$path_part"
    code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$host:$p:127.0.0.1" "$base" || echo 000)"
    case "$code" in 000 | 3??) continue ;; esac
    probe_secrets "Apache server ini" "$base" -k --resolve "$host:$p:127.0.0.1"
    answered=1
    break
  done
  [ -n "$answered" ] || info "Apache di server ini tidak terjangkau langsung (127.0.0.1); uji langsung dilewati."

  if [ "$fails" = "0" ]; then say "Semua uji alamat publik LULUS"; return 0; fi
  printf '\n%s[testboard] %s uji gagal%s\n' "$C_R" "$fails" "$C_0"
  return 1
}

# ------------------------------------------------------------------------------ cron

cmd_cron() {
  command -v crontab >/dev/null 2>&1 || { warn "crontab tidak tersedia; watchdog dan backup malam harus dijalankan manual"; return 0; }
  local self="$APP_DIR/ops/testboard.sh" env="TESTBOARD_HOME=$TESTBOARD_HOME" current block
  current="$(crontab -l 2>/dev/null | sed '/# >>> testboard/,/# <<< testboard/d' || true)"
  block="# >>> testboard (managed by ops/testboard.sh cron) >>>
@reboot $env /bin/bash $self start >>$LOG_DIR/cron.log 2>&1
*/5 * * * * $env /bin/bash $self watchdog >>$LOG_DIR/cron.log 2>&1
30 2 * * * $env /bin/bash $self backup nightly >>$LOG_DIR/backup.log 2>&1
# <<< testboard <<<"
  printf '%s\n%s\n' "$current" "$block" | sed '/./,$!d' | crontab -
  ok "Cron terpasang: start saat boot, watchdog tiap 5 menit, backup tiap malam 02:30"
}

# ------------------------------------------------------------------------------ main

command="${1:-help}"
shift || true
case "$command" in
  check) cmd_check ;;
  setup) cmd_setup ;;
  deploy) cmd_deploy "$@" ;;
  rollback) cmd_rollback "$@" ;;
  start) cmd_start ;;
  stop) cmd_stop ;;
  restart) cmd_restart ;;
  status) cmd_status ;;
  watchdog) cmd_watchdog ;;
  backup) cmd_backup "$@" ;;
  restore) cmd_restore "$@" ;;
  smoke) cmd_smoke "$@" || exit 1 ;;
  __build) build_all ;;
  cron) cmd_cron ;;
  create-admin) cmd_create_admin "$@" ;;
  maintenance) cmd_maintenance "$@" ;;
  *) sed -n '2,/^# Secrets/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' ;;
esac

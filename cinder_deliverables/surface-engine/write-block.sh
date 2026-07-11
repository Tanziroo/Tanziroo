#!/usr/bin/env bash
# write-block.sh — best-effort SOFTWARE write blocker + chain-of-custody record.
#
# You do not have a hardware write blocker. This is the strongest defensible
# stand-in on Linux: it sets the kernel read-only flag on the device, verifies
# it, records a pre-access hash + full device metadata, and (optionally) images
# the device to a file so you work on a COPY and never touch the original again.
#
# HONEST LIMIT: software write-blocking is best-effort. The OS could still touch
# the device (automount, udev, journal replay). For court-critical work a
# hardware write blocker (Tableau/WiebeTech/CRU) is still the gold standard.
# This procedure documents exactly what protection WAS applied so the record is
# defensible about its own limits.
#
# USAGE
#   sudo ./write-block.sh /dev/sdX                 # arm RO + record custody
#   sudo ./write-block.sh /dev/sdX --image /mnt/4tb/case.img   # + image to file
#   sudo ./write-block.sh /dev/sdX --release       # clear the RO flag when done
#
# It NEVER writes to the source device. It only makes it MORE read-only.
set -uo pipefail

DEV="${1:-}"
MODE="arm"; IMG=""
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --release) MODE="release" ;;
    --image)   MODE="image"; IMG="${2:-}"; shift ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac; shift
done

die(){ echo "write-block: $*" >&2; exit 1; }
[[ -n "$DEV" ]] || die "usage: sudo ./write-block.sh /dev/sdX [--image FILE | --release]"
[[ -b "$DEV" ]] || die "'$DEV' is not a block device"
[[ "$(id -u)" -eq 0 ]] || die "must run as root (blockdev/mount need it)"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REC="custody_${DEV//\//_}_${STAMP}.txt"

if [[ "$MODE" == "release" ]]; then
  blockdev --setrw "$DEV" && echo "released RO flag on $DEV" || die "could not clear RO"
  exit 0
fi

# 1) Refuse if any partition of the device is mounted read-write.
if lsblk -nro NAME,MOUNTPOINT "$DEV" | awk 'NF==2{print $2}' | grep -q .; then
  mounts=$(lsblk -nro NAME,MOUNTPOINT,RW "$DEV" 2>/dev/null | awk '$2!="" ')
  if lsblk -nro RW "$DEV" | grep -q '1'; then
    echo "WARNING: $DEV has mounted partitions:"; echo "$mounts"
    echo "Unmount them first (umount) so the OS can't write. Aborting."; exit 1
  fi
fi

# 2) Arm the kernel read-only flag.
blockdev --setro "$DEV" || die "blockdev --setro failed"
RO="$(blockdev --getro "$DEV")"
[[ "$RO" == "1" ]] || die "RO flag did not stick (got '$RO')"

# 3) Record custody metadata (this is the defensible part).
{
  echo "CHAIN OF CUSTODY — software write-block record"
  echo "timestamp_utc : $STAMP"
  echo "device        : $DEV"
  echo "operator      : ${SUDO_USER:-$(whoami)}"
  echo "host          : $(hostname)"
  echo "protection    : SOFTWARE (blockdev --setro) — best-effort, not a hardware write blocker"
  echo "ro_flag       : $(blockdev --getro "$DEV")  (1 = read-only)"
  echo "size_bytes    : $(blockdev --getsize64 "$DEV")"
  echo "phys_sector   : $(blockdev --getpbsz "$DEV")"
  echo "model/serial  :"
  udevadm info --query=property --name="$DEV" 2>/dev/null | grep -E "ID_MODEL=|ID_SERIAL=|ID_FS_TYPE=" | sed 's/^/  /'
  echo "lsblk         :"
  lsblk -o NAME,SIZE,TYPE,FSTYPE,RO,MOUNTPOINT "$DEV" | sed 's/^/  /'
} | tee "$REC"

# 4) Pre-access hash. On a 4TB drive this is slow but it is the anchor the whole
#    chain hangs on — a hash taken while RO is armed. Backgroundable.
echo
echo "computing pre-access SHA-256 of $DEV (large drives take a while)..."
PRE="$(dd if="$DEV" bs=64M status=progress 2>/dev/null | sha256sum | cut -d' ' -f1)"
echo "sha256_pre    : $PRE" | tee -a "$REC"

# 5) Optional imaging to a file so you work on a copy forever after.
if [[ "$MODE" == "image" ]]; then
  [[ -n "$IMG" ]] || die "--image needs a destination path"
  dest_free=$(df -PB1 "$(dirname "$IMG")" | awk 'NR==2{print $4}')
  src_size=$(blockdev --getsize64 "$DEV")
  if [[ "$dest_free" -lt "$src_size" ]]; then
    die "destination free ($dest_free B) < source ($src_size B). Need a bigger drive (this is the 4TB problem)."
  fi
  echo "imaging $DEV -> $IMG (ddrescue if available, else dd)..."
  if command -v ddrescue >/dev/null; then
    ddrescue -d -r3 "$DEV" "$IMG" "${IMG}.mapfile"
  else
    dd if="$DEV" of="$IMG" bs=64M conv=noerror,sync status=progress
  fi
  POST="$(sha256sum "$IMG" | cut -d' ' -f1)"
  echo "sha256_image  : $POST" | tee -a "$REC"
  if [[ "$PRE" == "$POST" ]]; then
    echo "VERIFY: image hash == source hash — image is faithful. Work on $IMG from here." | tee -a "$REC"
  else
    echo "VERIFY: MISMATCH (bad sectors or device changed). Image NOT certified faithful." | tee -a "$REC"
  fi
fi

echo
echo "DONE. $DEV is read-only (software). Custody record: $REC"
echo "Next: surface-engine --image ${IMG:-$DEV}   (reads read-only)"
echo "Release the RO flag later with: sudo ./write-block.sh $DEV --release"

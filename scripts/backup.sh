#!/usr/bin/env bash
# Nightly backup of local ChromaDB to timestamped tarball.
# Add to crontab: 0 2 * * * /path/to/scripts/backup.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$ROOT/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TARBALL="$BACKUP_DIR/chroma_db_${TIMESTAMP}.tar.gz"

tar -czf "$TARBALL" -C "$ROOT" chroma_db/
echo "Backup saved: $TARBALL ($(du -sh "$TARBALL" | cut -f1))"

# Keep last 7 days — each backup is ~7 KB × chunk_count compressed,
# so 7 snapshots of a 10 K-chunk corpus ≈ <1 GB total.
find "$BACKUP_DIR" -name "chroma_db_*.tar.gz" -mtime +7 -delete
echo "Pruned backups older than 7 days."

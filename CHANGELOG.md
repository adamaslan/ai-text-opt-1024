# Changelog

## [Unreleased]

### Added
- File-type-aware chunking in `ingest.py`: prose files (480/96 tokens), Q&A files (300/40 tokens)
- `MIN_CHUNK_TOKENS=80` filter to drop stub chunks before embedding
- All chunk thresholds env-overrideable (`PROSE_CHUNK_SIZE`, `QA_CHUNK_SIZE`, `MIN_CHUNK_TOKENS`)
- `docs/chunking-explainer.md`: free-tier byte budget tables, troubleshooting section, e5-large-v2 512-token cap correction

### Changed
- Removed `text_preview` from ChromaDB metadata (~200 B/row savings; backend falls back to `doc.slice(0,200)`)
- Bumped `CHROMA_COLLECTION_VERSION` default to 2 (chunk boundary change invalidates v1 hashes)
- `backend/lib/chroma.ts`: removed stale `TEXT_PREVIEW` from `FIELDS` constant
- `config/pipeline.yaml` and `.env.example` updated to reflect file-aware chunk settings

### Impact
- ~17% fewer ChromaDB writes and storage bytes on the trader-qa corpus
- Improved prose recall via larger 96-token overlap
- No recall regression on Q&A files

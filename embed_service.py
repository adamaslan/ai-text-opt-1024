#!/usr/bin/env python3
"""
Embed service — FastAPI on 127.0.0.1:8001.

Loads intfloat/e5-large-v2 once at startup and exposes POST /embed.
The Next.js backend calls this for query-time embedding so the 1.47 GB
model is never loaded in Node.

Start: uvicorn embed_service:app --host 127.0.0.1 --port 8001
"""

from __future__ import annotations

import logging
import os
from typing import List

import numpy as np
import torch
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger("embed_service")

MODEL_NAME = os.getenv("EMBEDDING_MODEL", "intfloat/e5-large-v2")
EXPECTED_DIM = 1024

app = FastAPI(title="Embed Service", description="1024D embedding via e5-large-v2")

_model: SentenceTransformer | None = None


def get_model() -> SentenceTransformer:
    # Lazy singleton: the 1.47 GB model loads once on first request (or at
    # startup via the on_event hook below) and stays resident for the process
    # lifetime. Re-loading per request would cost ~3s each time.
    global _model
    if _model is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info("Loading %s on %s", MODEL_NAME, device)
        _model = SentenceTransformer(MODEL_NAME, device=device)
        test = _model.encode("test", convert_to_numpy=True)
        if len(test) != EXPECTED_DIM:
            raise RuntimeError(f"Model returned {len(test)}D; expected {EXPECTED_DIM}D")
        logger.info("Model ready: %dD verified", EXPECTED_DIM)
    return _model


@app.on_event("startup")
async def startup() -> None:
    get_model()


class EmbedRequest(BaseModel):
    texts: List[str]
    is_query: bool = True  # True = add "Query: " prefix for e5 models


class EmbedResponse(BaseModel):
    embeddings: List[List[float]]
    dimension: int
    model: str


@app.post("/embed", response_model=EmbedResponse)
async def embed(req: EmbedRequest) -> EmbedResponse:
    if not req.texts:
        raise HTTPException(status_code=400, detail="texts must be non-empty")

    model = get_model()
    # e5 asymmetric prefix: queries get "Query: ", indexed passages get "Passage: "
    # (applied in ingest.py). Mismatching the prefix at query time degrades recall.
    prefix = "Query: " if req.is_query and "e5" in MODEL_NAME.lower() else ""
    processed = [f"{prefix}{t.strip()}" if t.strip() else "" for t in req.texts]

    try:
        vecs: np.ndarray = model.encode(processed, convert_to_numpy=True, show_progress_bar=False)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Embedding failed: {exc}") from exc

    return EmbedResponse(
        embeddings=vecs.tolist(),
        dimension=int(vecs.shape[1]),
        model=MODEL_NAME,
    )


@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL_NAME, "dimension": EXPECTED_DIM}

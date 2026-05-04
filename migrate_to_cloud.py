#!/usr/bin/env python3
"""
One-shot migration: read all chunks from local ChromaDB and upsert to Chroma Cloud.
No re-embedding — vectors are copied as-is from the local persistent store.
"""

import os
import chromadb
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv()

LOCAL_COLLECTION = "ideas_1024d_v2_staging"
LOCAL_PATH = "chroma_db"
CLOUD_COLLECTION = os.getenv("CHROMA_COLLECTION", "t1-t2a")
BATCH_SIZE = 100

def main():
    print(f"Source : local '{LOCAL_COLLECTION}' at {LOCAL_PATH}/")
    print(f"Target : cloud '{CLOUD_COLLECTION}' (tenant={os.getenv('CHROMA_TENANT')[:8]}...)")
    print()

    # Connect to local
    local = chromadb.PersistentClient(path=LOCAL_PATH)
    src = local.get_collection(LOCAL_COLLECTION, embedding_function=None)
    total = src.count()
    print(f"Local collection: {total} chunks")

    # Connect to cloud
    cloud = chromadb.CloudClient(
        api_key=os.getenv("CHROMA_API_KEY"),
        tenant=os.getenv("CHROMA_TENANT"),
        database=os.getenv("CHROMA_DATABASE"),
    )
    dst = cloud.get_or_create_collection(
        CLOUD_COLLECTION,
        metadata={"hnsw:space": "cosine", "embedding_dimension": "1024"},
    )
    print(f"Cloud  collection: {dst.count()} chunks (before)")
    print()

    # Page through local and upsert to cloud in batches
    offset = 0
    upserted = 0
    with tqdm(total=total, unit="chunk") as bar:
        while offset < total:
            batch = src.get(
                limit=BATCH_SIZE,
                offset=offset,
                include=["embeddings", "documents", "metadatas"],
            )
            if not batch["ids"]:
                break

            dst.upsert(
                ids=batch["ids"],
                embeddings=batch["embeddings"],
                documents=batch["documents"],
                metadatas=batch["metadatas"],
            )
            upserted += len(batch["ids"])
            offset += BATCH_SIZE
            bar.update(len(batch["ids"]))

    print()
    print(f"Done. Upserted {upserted} chunks.")
    print(f"Cloud collection count: {dst.count()}")

if __name__ == "__main__":
    main()

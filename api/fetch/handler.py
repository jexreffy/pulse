"""
Fetch Lambda — pulls top 30 HackerNews stories and saves raw JSON to S3.
Triggered by EventBridge Scheduler (hourly) or manually.
"""
import json
import os
import uuid
from datetime import datetime, timezone

import boto3
import urllib.request

import sys
sys.path.insert(0, '/opt/python')  # Lambda Layer path

try:
    from shared import logger
except ImportError:
    import logger  # type: ignore

RAW_BUCKET = os.environ["RAW_BUCKET"]
ENRICH_QUEUE_URL = os.environ.get("ENRICH_QUEUE_URL", "")

s3 = boto3.client("s3")
sqs = boto3.client("sqs")

HN_BASE = "https://hacker-news.firebaseio.com/v0"
TOP_STORIES_LIMIT = 30


def fetch_json(url: str) -> dict | list:
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.loads(resp.read().decode())


def handler(event: dict, context) -> dict:
    run_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y-%m-%d")
    hour_str = now.strftime("%H")

    logger.info("Fetch started", run_id=run_id, date=date_str, hour=hour_str)

    try:
        top_ids: list[int] = fetch_json(f"{HN_BASE}/topstories.json")[:TOP_STORIES_LIMIT]
    except Exception as e:
        logger.error("Failed to fetch top stories", error=str(e))
        raise

    articles = []
    for story_id in top_ids:
        try:
            item = fetch_json(f"{HN_BASE}/item/{story_id}.json")
            if item and item.get("type") == "story" and item.get("title"):
                articles.append({
                    "id": str(story_id),
                    "title": item.get("title", ""),
                    "url": item.get("url", ""),
                    "score": item.get("score", 0),
                    "by": item.get("by", ""),
                    "time": item.get("time", 0),
                })
        except Exception as e:
            logger.warn("Skipping story", story_id=story_id, error=str(e))

    logger.info("Fetched articles", count=len(articles), run_id=run_id)

    # Save raw payload to S3
    s3_key = f"raw/{date_str}/{hour_str}/{run_id}.json"
    payload = {
        "run_id": run_id,
        "date": date_str,
        "hour": hour_str,
        "fetched_at": now.isoformat(),
        "articles": articles,
    }
    s3.put_object(
        Bucket=RAW_BUCKET,
        Key=s3_key,
        Body=json.dumps(payload),
        ContentType="application/json",
    )

    logger.info("Saved raw data to S3", key=s3_key, run_id=run_id)

    return {
        "run_id": run_id,
        "s3_key": s3_key,
        "date": date_str,
        "hour": hour_str,
        "article_count": len(articles),
    }

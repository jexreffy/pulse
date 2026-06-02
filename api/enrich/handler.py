"""
Enrich Lambda — triggered by SQS event source mapping.
Calls Amazon Comprehend for sentiment + entities, writes result to DynamoDB.
"""

import json
import os
import time
from datetime import datetime, timezone

import boto3

import sys

sys.path.insert(0, "/opt/python")

try:
    from shared import logger
except ImportError:
    import logger  # type: ignore

ARTICLES_TABLE = os.environ["ARTICLES_TABLE"]
SEVEN_DAYS = 7 * 24 * 60 * 60

comprehend = boto3.client("comprehend", region_name="us-east-1")
dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
table = dynamodb.Table(ARTICLES_TABLE)


def enrich_article(run_id: str, article: dict, date: str, hour: str) -> None:
    title = article.get("title", "")
    article_id = article["id"]

    # Call Comprehend — sentiment
    sentiment_resp = comprehend.detect_sentiment(Text=title, LanguageCode="en")
    sentiment = sentiment_resp["Sentiment"]
    scores = sentiment_resp["SentimentScore"]

    # Call Comprehend — entities
    entities_resp = comprehend.detect_entities(Text=title, LanguageCode="en")
    entities = [
        {"text": e["Text"], "type": e["Type"], "score": round(e["Score"], 3)}
        for e in entities_resp["Entities"]
        if e["Score"] > 0.8
    ]

    ttl = int(time.time()) + SEVEN_DAYS

    table.put_item(
        Item={
            "run_id": run_id,
            "article_id": article_id,
            "title": title,
            "url": article.get("url", ""),
            "sentiment": sentiment,
            "sentiment_scores": {
                "positive": round(scores["Positive"], 4),
                "negative": round(scores["Negative"], 4),
                "neutral": round(scores["Neutral"], 4),
                "mixed": round(scores["Mixed"], 4),
            },
            "entities": entities,
            "date": date,
            "hour": hour,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "ttl": ttl,
        }
    )


def handler(event: dict, context) -> dict:
    processed = 0
    failed = 0

    for record in event.get("Records", []):
        try:
            body = json.loads(record["body"])
            run_id = body["run_id"]
            article = body["article"]
            date = body["date"]
            hour = body["hour"]

            enrich_article(run_id, article, date, hour)
            processed += 1
            logger.info("Enriched article", article_id=article["id"], run_id=run_id)

        except Exception as e:
            failed += 1
            logger.error(
                "Failed to enrich article",
                error=str(e),
                record=record.get("body", "")[:200],
            )
            raise  # Re-raise so SQS retries / sends to DLQ

    logger.info("Enrich batch complete", processed=processed, failed=failed)
    return {"processed": processed, "failed": failed}

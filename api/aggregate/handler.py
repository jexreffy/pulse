"""
Aggregate Lambda — queries enriched articles from DynamoDB, computes hourly
sentiment stats and top entities, writes summary to pulse-results table.
Called by Step Functions after the SQS drain wait.
"""
import os
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

import sys
sys.path.insert(0, '/opt/python')

try:
    from shared import logger
except ImportError:
    import logger  # type: ignore

RESULTS_TABLE = os.environ["RESULTS_TABLE"]
ARTICLES_TABLE = os.environ["ARTICLES_TABLE"]

dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
results_table = dynamodb.Table(RESULTS_TABLE)
articles_table = dynamodb.Table(ARTICLES_TABLE)


def handler(event: dict, context) -> dict:
    run_id = event["run_id"]
    date = event["date"]
    hour = event["hour"]

    logger.info("Aggregate started", run_id=run_id, date=date, hour=hour)

    # Query all articles for this run
    resp = articles_table.query(
        KeyConditionExpression=Key("run_id").eq(run_id)
    )
    articles = resp.get("Items", [])

    if not articles:
        logger.warn("No articles found for aggregation", run_id=run_id)
        return {"run_id": run_id, "article_count": 0}

    # Compute sentiment distribution
    sentiment_counts: Counter = Counter()
    entity_counts: Counter = Counter()

    for article in articles:
        sentiment_counts[article.get("sentiment", "NEUTRAL")] += 1
        for entity in article.get("entities", []):
            entity_counts[entity["text"]] += 1

    total = len(articles)

    def pct(count: int) -> Decimal:
        return Decimal(str(round(count / total * 100, 1)))

    top_entities = [
        {"text": text, "count": count}
        for text, count in entity_counts.most_common(20)
    ]

    # Write hourly summary to results table
    results_table.put_item(Item={
        "date": date,
        "sk": f"hour#{hour}",
        "run_id": run_id,
        "article_count": total,
        "positive_pct": pct(sentiment_counts["POSITIVE"]),
        "negative_pct": pct(sentiment_counts["NEGATIVE"]),
        "neutral_pct": pct(sentiment_counts["NEUTRAL"]),
        "mixed_pct": pct(sentiment_counts["MIXED"]),
        "top_entities": top_entities,
        "aggregated_at": datetime.now(timezone.utc).isoformat(),
    })

    # Also write a run log entry
    results_table.put_item(Item={
        "date": date,
        "sk": f"run#{run_id}",
        "run_id": run_id,
        "hour": hour,
        "article_count": total,
        "status": "COMPLETED",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    })

    logger.info("Aggregation complete", run_id=run_id, total=total,
                positive=int(sentiment_counts["POSITIVE"]),
                negative=int(sentiment_counts["NEGATIVE"]))

    return {
        "run_id": run_id,
        "date": date,
        "hour": hour,
        "article_count": total,
        "status": "COMPLETED",
    }

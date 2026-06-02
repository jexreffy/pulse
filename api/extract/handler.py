"""
Extract Lambda — reads raw S3 JSON, publishes one SQS message per article.
Called by Step Functions after Fetch completes.
"""
import json
import os

import boto3

import sys
sys.path.insert(0, '/opt/python')

try:
    from shared import logger
except ImportError:
    import logger  # type: ignore

RAW_BUCKET = os.environ["RAW_BUCKET"]
ENRICH_QUEUE_URL = os.environ["ENRICH_QUEUE_URL"]
ARTICLES_TABLE = os.environ["ARTICLES_TABLE"]

s3 = boto3.client("s3")
sqs = boto3.client("sqs")


def handler(event: dict, context) -> dict:
    run_id = event["run_id"]
    s3_key = event["s3_key"]
    date = event["date"]
    hour = event["hour"]

    logger.info("Extract started", run_id=run_id, s3_key=s3_key)

    # Read raw data from S3
    resp = s3.get_object(Bucket=RAW_BUCKET, Key=s3_key)
    raw = json.loads(resp["Body"].read().decode())
    articles = raw.get("articles", [])

    # Publish one SQS message per article
    published = 0
    for article in articles:
        message = {
            "run_id": run_id,
            "date": date,
            "hour": hour,
            "article": article,
        }
        sqs.send_message(
            QueueUrl=ENRICH_QUEUE_URL,
            MessageBody=json.dumps(message),
        )
        published += 1

    logger.info("Published articles to SQS", count=published, run_id=run_id)

    return {
        "run_id": run_id,
        "date": date,
        "hour": hour,
        "article_count": published,
    }

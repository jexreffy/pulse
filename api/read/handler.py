"""
Read Lambda — serves dashboard data from DynamoDB.
Routes:
  GET /results          → last 7 days of hourly sentiment summaries
  GET /results/{date}   → all hours for a specific date
  GET /articles/{run_id} → enriched articles for a run
  GET /runs             → recent pipeline run log entries
"""

import json
import os
from datetime import datetime, timezone, timedelta
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

from shared import logger

RESULTS_TABLE = os.environ["RESULTS_TABLE"]
ARTICLES_TABLE = os.environ["ARTICLES_TABLE"]

dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
results_table = dynamodb.Table(RESULTS_TABLE)
articles_table = dynamodb.Table(ARTICLES_TABLE)


def decimal_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError


def respond(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body, default=decimal_default),
    }


def handler(event: dict, context) -> dict:
    path = event.get("rawPath", "")
    params = event.get("pathParameters") or {}

    logger.info("Read request", path=path)

    try:
        if path == "/results":
            # Last 7 days of hourly summaries
            items = []
            for i in range(7):
                date = (datetime.now(timezone.utc) - timedelta(days=i)).strftime(
                    "%Y-%m-%d"
                )
                resp = results_table.query(
                    KeyConditionExpression=Key("date").eq(date)
                    & Key("sk").begins_with("hour#")
                )
                items.extend(resp.get("Items", []))
            return respond(200, {"results": items})

        elif path.startswith("/results/"):
            date = params.get("date") or path.split("/results/")[1]
            resp = results_table.query(
                KeyConditionExpression=Key("date").eq(date)
                & Key("sk").begins_with("hour#")
            )
            return respond(200, {"date": date, "hours": resp.get("Items", [])})

        elif path.startswith("/articles/"):
            run_id = params.get("run_id") or path.split("/articles/")[1]
            resp = articles_table.query(KeyConditionExpression=Key("run_id").eq(run_id))
            return respond(200, {"run_id": run_id, "articles": resp.get("Items", [])})

        elif path == "/runs":
            # Last 3 days of run entries
            items = []
            for i in range(3):
                date = (datetime.now(timezone.utc) - timedelta(days=i)).strftime(
                    "%Y-%m-%d"
                )
                resp = results_table.query(
                    KeyConditionExpression=Key("date").eq(date)
                    & Key("sk").begins_with("run#")
                )
                items.extend(resp.get("Items", []))
            items.sort(key=lambda x: x.get("completed_at", ""), reverse=True)
            return respond(200, {"runs": items[:20]})

        else:
            return respond(404, {"error": "Not found"})

    except Exception as e:
        logger.error("Read failed", error=str(e), path=path)
        return respond(500, {"error": "Internal server error"})

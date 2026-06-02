"""Tests for the Read Lambda handler."""

import json
import sys
import os
from decimal import Decimal
from moto import mock_aws
import boto3

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))


def _create_tables(ddb):
    results = ddb.create_table(
        TableName="pulse-results-test",
        KeySchema=[
            {"AttributeName": "date", "KeyType": "HASH"},
            {"AttributeName": "sk", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "date", "AttributeType": "S"},
            {"AttributeName": "sk", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    articles = ddb.create_table(
        TableName="pulse-articles-test",
        KeySchema=[
            {"AttributeName": "run_id", "KeyType": "HASH"},
            {"AttributeName": "article_id", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "run_id", "AttributeType": "S"},
            {"AttributeName": "article_id", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    return results, articles


@mock_aws
def test_get_runs_returns_run_entries():
    """GET /runs should return run log entries."""
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    results_table, _ = _create_tables(ddb)

    from datetime import datetime, timezone

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    results_table.put_item(
        Item={
            "date": today,
            "sk": "run#abc123",
            "run_id": "abc123",
            "hour": "10",
            "article_count": 25,
            "status": "COMPLETED",
            "completed_at": "2024-01-01T10:30:00+00:00",
        }
    )

    import importlib
    import read.handler as read_mod

    importlib.reload(read_mod)

    resp = read_mod.handler({"rawPath": "/runs", "pathParameters": {}}, None)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert len(body["runs"]) == 1
    assert body["runs"][0]["run_id"] == "abc123"


@mock_aws
def test_get_results_returns_hourly_data():
    """GET /results should return hourly sentiment summaries."""
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    results_table, _ = _create_tables(ddb)

    from datetime import datetime, timezone

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    results_table.put_item(
        Item={
            "date": today,
            "sk": "hour#12",
            "run_id": "xyz",
            "article_count": 20,
            "positive_pct": Decimal("60.0"),
            "negative_pct": Decimal("20.0"),
            "neutral_pct": Decimal("20.0"),
            "mixed_pct": Decimal("0.0"),
            "top_entities": [],
            "aggregated_at": "2024-01-01T12:30:00+00:00",
        }
    )

    import importlib
    import read.handler as read_mod

    importlib.reload(read_mod)

    resp = read_mod.handler({"rawPath": "/results", "pathParameters": {}}, None)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert len(body["results"]) == 1
    assert body["results"][0]["positive_pct"] == 60.0


@mock_aws
def test_unknown_path_returns_404():
    """Unknown paths should return 404."""
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    _create_tables(ddb)

    import importlib
    import read.handler as read_mod

    importlib.reload(read_mod)

    resp = read_mod.handler({"rawPath": "/unknown", "pathParameters": {}}, None)
    assert resp["statusCode"] == 404

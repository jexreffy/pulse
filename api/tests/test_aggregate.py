"""Tests for the Aggregate Lambda handler."""

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
def test_aggregate_computes_sentiment_percentages():
    """Aggregate handler should compute correct sentiment % and write to results table."""
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    results_table, articles_table = _create_tables(ddb)

    # Seed articles
    run_id = "run-agg-test"
    articles_data = [
        {
            "run_id": run_id,
            "article_id": "1",
            "sentiment": "POSITIVE",
            "entities": [{"text": "AWS", "type": "ORG", "score": Decimal("0.99")}],
        },
        {"run_id": run_id, "article_id": "2", "sentiment": "POSITIVE", "entities": []},
        {
            "run_id": run_id,
            "article_id": "3",
            "sentiment": "NEGATIVE",
            "entities": [{"text": "AWS", "type": "ORG", "score": Decimal("0.95")}],
        },
        {"run_id": run_id, "article_id": "4", "sentiment": "NEUTRAL", "entities": []},
    ]
    for a in articles_data:
        articles_table.put_item(Item=a)

    import importlib
    import aggregate.handler as agg_mod

    importlib.reload(agg_mod)

    result = agg_mod.handler(
        {"run_id": run_id, "date": "2024-01-01", "hour": "08"}, None
    )

    assert result["article_count"] == 4
    assert result["status"] == "COMPLETED"

    # Check DynamoDB
    item = results_table.get_item(Key={"date": "2024-01-01", "sk": "hour#08"})["Item"]
    assert item["positive_pct"] == Decimal("50.0")
    assert item["negative_pct"] == Decimal("25.0")
    assert item["neutral_pct"] == Decimal("25.0")
    assert any(e["text"] == "AWS" for e in item["top_entities"])


@mock_aws
def test_aggregate_handles_empty_run():
    """Aggregate handler should handle a run with no articles gracefully."""
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    _create_tables(ddb)

    import importlib
    import aggregate.handler as agg_mod

    importlib.reload(agg_mod)

    result = agg_mod.handler(
        {"run_id": "empty-run", "date": "2024-01-01", "hour": "09"}, None
    )
    assert result["article_count"] == 0

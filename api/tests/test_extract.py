"""Tests for the Extract Lambda handler."""
import json
import sys
import os
import pytest
from moto import mock_aws
import boto3

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'shared'))


@mock_aws
def test_extract_publishes_sqs_messages():
    """Extract handler should publish one SQS message per article."""
    # Setup S3
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.create_bucket(Bucket="pulse-raw-test")

    raw_payload = {
        "run_id": "test-run-1",
        "date": "2024-01-01",
        "hour": "12",
        "articles": [
            {"id": "1", "title": "Headline A", "url": "", "score": 10, "by": "u", "time": 1},
            {"id": "2", "title": "Headline B", "url": "", "score": 5, "by": "u", "time": 2},
        ],
    }
    s3.put_object(Bucket="pulse-raw-test", Key="raw/2024-01-01/12/test-run-1.json",
                  Body=json.dumps(raw_payload))

    # Setup SQS
    sqs = boto3.client("sqs", region_name="us-east-1")
    queue = sqs.create_queue(QueueName="pulse-enrich-test")
    queue_url = queue["QueueUrl"]

    import importlib
    import extract.handler as extract_mod
    importlib.reload(extract_mod)

    event = {
        "run_id": "test-run-1",
        "s3_key": "raw/2024-01-01/12/test-run-1.json",
        "date": "2024-01-01",
        "hour": "12",
    }
    result = extract_mod.handler(event, None)

    assert result["article_count"] == 2

    # Check SQS messages
    msgs = sqs.receive_message(QueueUrl=queue_url, MaxNumberOfMessages=10)
    assert len(msgs.get("Messages", [])) == 2
    bodies = [json.loads(m["Body"]) for m in msgs["Messages"]]
    titles = {b["article"]["title"] for b in bodies}
    assert titles == {"Headline A", "Headline B"}

"""Tests for the Fetch Lambda handler."""
import json
import sys
import os
from unittest.mock import patch, MagicMock
import pytest
from moto import mock_aws
import boto3

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'shared'))


@mock_aws
def test_fetch_saves_raw_json_to_s3():
    """Fetch handler should save raw article JSON to S3."""
    import boto3
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.create_bucket(Bucket="pulse-raw-test")

    mock_top_stories = [1, 2, 3]
    mock_item = {"id": 1, "type": "story", "title": "Test headline", "url": "https://example.com", "score": 100, "by": "user", "time": 1000000}

    def mock_fetch_json(url):
        if "topstories" in url:
            return mock_top_stories
        return mock_item

    with patch("fetch.handler.fetch_json", side_effect=mock_fetch_json):
        from fetch.handler import handler
        result = handler({}, None)

    assert result["article_count"] == 3
    assert "s3_key" in result
    assert "run_id" in result

    # Verify S3 object was written
    obj = s3.get_object(Bucket="pulse-raw-test", Key=result["s3_key"])
    body = json.loads(obj["Body"].read())
    assert body["run_id"] == result["run_id"]
    assert len(body["articles"]) == 3


@mock_aws
def test_fetch_skips_non_story_items():
    """Fetch handler should skip items without title or not of type story."""
    import boto3
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.create_bucket(Bucket="pulse-raw-test")

    mock_top_stories = [1, 2]
    items = {
        1: {"id": 1, "type": "story", "title": "Valid story", "score": 10, "by": "u", "time": 1},
        2: {"id": 2, "type": "comment", "text": "No title"},  # should be skipped
    }

    def mock_fetch_json(url):
        if "topstories" in url:
            return mock_top_stories
        story_id = int(url.split("/item/")[1].split(".json")[0])
        return items[story_id]

    with patch("fetch.handler.fetch_json", side_effect=mock_fetch_json):
        from fetch.handler import handler
        result = handler({}, None)

    assert result["article_count"] == 1

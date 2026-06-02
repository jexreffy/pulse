"""pytest fixtures shared across all tests."""
import os
import boto3
import pytest
from moto import mock_aws

# Set env vars before any handler imports
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "test")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "test")
os.environ.setdefault("RAW_BUCKET", "pulse-raw-test")
os.environ.setdefault("ENRICH_QUEUE_URL", "https://sqs.us-east-1.amazonaws.com/123/pulse-enrich-test")
os.environ.setdefault("RESULTS_TABLE", "pulse-results-test")
os.environ.setdefault("ARTICLES_TABLE", "pulse-articles-test")


@pytest.fixture
def aws_credentials(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")


@pytest.fixture
def s3_bucket(aws_credentials):
    with mock_aws():
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="pulse-raw-test")
        yield s3


@pytest.fixture
def sqs_queue(aws_credentials):
    with mock_aws():
        sqs = boto3.client("sqs", region_name="us-east-1")
        resp = sqs.create_queue(QueueName="pulse-enrich-test")
        yield sqs, resp["QueueUrl"]


@pytest.fixture
def dynamodb_tables(aws_credentials):
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
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
        yield results, articles

"""DynamoDB helpers using boto3 resource API."""
import os
import boto3
from boto3.dynamodb.conditions import Key
from typing import Any

_dynamodb = boto3.resource("dynamodb", region_name="us-east-1")


def get_table(name: str):
    return _dynamodb.Table(name)


def put_item(table_name: str, item: dict[str, Any]) -> None:
    table = get_table(table_name)
    table.put_item(Item=item)


def query_items(table_name: str, pk_name: str, pk_value: str,
                sk_prefix: str | None = None) -> list[dict[str, Any]]:
    table = get_table(table_name)
    condition = Key(pk_name).eq(pk_value)
    if sk_prefix:
        from boto3.dynamodb.conditions import Key as K
        condition = condition & K("sk").begins_with(sk_prefix)
    resp = table.query(KeyConditionExpression=condition)
    return resp.get("Items", [])

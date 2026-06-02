import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

interface StorageStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class StorageStack extends cdk.Stack {
  public readonly rawBucket: s3.Bucket;
  public readonly resultsTable: dynamodb.Table;
  public readonly articlesTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    // S3 bucket for raw HackerNews JSON (auto-delete after 30 days)
    this.rawBucket = new s3.Bucket(this, 'RawBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(30),
          id: 'DeleteOldRawData',
        },
      ],
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // DynamoDB: hourly aggregated sentiment results
    // PK: date (YYYY-MM-DD), SK: hour (HH) or "run#<uuid>"
    this.resultsTable = new dynamodb.Table(this, 'ResultsTable', {
      tableName: 'pulse-results',
      partitionKey: { name: 'date', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // DynamoDB: individual article enrichment results (TTL: 7 days)
    // PK: run_id, SK: article_id
    this.articlesTable = new dynamodb.Table(this, 'ArticlesTable', {
      tableName: 'pulse-articles',
      partitionKey: { name: 'run_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'article_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });
  }
}

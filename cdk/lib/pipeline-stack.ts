import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';

interface PipelineStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  lambdaSg: ec2.SecurityGroup;
  rawBucket: s3.Bucket;
  resultsTable: dynamodb.Table;
  articlesTable: dynamodb.Table;
}

export class PipelineStack extends cdk.Stack {
  public readonly stateMachine: sfn.StateMachine;
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const { vpc, lambdaSg, rawBucket, resultsTable, articlesTable } = props;

    // Shared Lambda config
    const RUNTIME = lambda.Runtime.PYTHON_3_12;
    const sharedEnv = {
      RAW_BUCKET: rawBucket.bucketName,
      RESULTS_TABLE: resultsTable.tableName,
      ARTICLES_TABLE: articlesTable.tableName,
      POWERTOOLS_SERVICE_NAME: 'pulse',
    };

    // SQS queue for article fan-out + DLQ
    const dlq = new sqs.Queue(this, 'EnrichDlq', {
      retentionPeriod: cdk.Duration.days(7),
    });

    const enrichQueue = new sqs.Queue(this, 'EnrichQueue', {
      visibilityTimeout: cdk.Duration.seconds(60),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
    });

    // Lambda log groups
    const fetchLogGroup = new logs.LogGroup(this, 'FetchLogGroup', {
      logGroupName: '/aws/lambda/pulse-fetch',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const extractLogGroup = new logs.LogGroup(this, 'ExtractLogGroup', {
      logGroupName: '/aws/lambda/pulse-extract',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const enrichLogGroup = new logs.LogGroup(this, 'EnrichLogGroup', {
      logGroupName: '/aws/lambda/pulse-enrich',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const aggregateLogGroup = new logs.LogGroup(this, 'AggregateLogGroup', {
      logGroupName: '/aws/lambda/pulse-aggregate',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const sharedProps = {
      runtime: RUNTIME,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [lambdaSg],
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      handler: 'handler.handler', // overridden per-function below
    };

    // All Lambdas share the same asset (whole api/ dir) so shared/ is always present
    const apiCode = lambda.Code.fromAsset('../api');

    // Fetch Lambda - no VPC, needs public internet to reach HackerNews API
    // S3 and SQS are reachable via their public endpoints without VPC
    const fetchFunction = new lambda.Function(this, 'FetchFunction', {
      runtime: RUNTIME,
      memorySize: 256,
      timeout: cdk.Duration.seconds(60),
      functionName: 'pulse-fetch',
      code: apiCode,
      handler: 'fetch/handler.handler',
      logGroup: fetchLogGroup,
      environment: {
        ...sharedEnv,
        ENRICH_QUEUE_URL: enrichQueue.queueUrl,
      },
    });
    rawBucket.grantWrite(fetchFunction);
    enrichQueue.grantSendMessages(fetchFunction);

    // Extract Lambda - parses raw S3 JSON, publishes article messages to SQS
    const extractFunction = new lambda.Function(this, 'ExtractFunction', {
      ...sharedProps,
      functionName: 'pulse-extract',
      code: apiCode,
      handler: 'extract/handler.handler',
      logGroup: extractLogGroup,
      environment: {
        ...sharedEnv,
        ENRICH_QUEUE_URL: enrichQueue.queueUrl,
      },
    });
    rawBucket.grantRead(extractFunction);
    enrichQueue.grantSendMessages(extractFunction);

    // Enrich Lambda - reads SQS messages, calls Comprehend, writes to DynamoDB
    const enrichFunction = new lambda.Function(this, 'EnrichFunction', {
      ...sharedProps,
      functionName: 'pulse-enrich',
      code: apiCode,
      handler: 'enrich/handler.handler',
      timeout: cdk.Duration.seconds(60),
      logGroup: enrichLogGroup,
      environment: sharedEnv,
    });
    articlesTable.grantWriteData(enrichFunction);
    enrichFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['comprehend:DetectSentiment', 'comprehend:DetectEntities'],
      resources: ['*'],
    }));
    enrichFunction.addEventSource(new SqsEventSource(enrichQueue, {
      batchSize: 5,
      maxConcurrency: 5,
    }));

    // Aggregate Lambda - rolls up enriched articles into hourly stats
    const aggregateFunction = new lambda.Function(this, 'AggregateFunction', {
      ...sharedProps,
      functionName: 'pulse-aggregate',
      code: apiCode,
      handler: 'aggregate/handler.handler',
      logGroup: aggregateLogGroup,
      environment: sharedEnv,
    });
    articlesTable.grantReadData(aggregateFunction);
    resultsTable.grantWriteData(aggregateFunction);

    // Step Functions state machine
    const fetchTask = new tasks.LambdaInvoke(this, 'FetchTask', {
      lambdaFunction: fetchFunction,
      outputPath: '$.Payload',
    });

    const extractTask = new tasks.LambdaInvoke(this, 'ExtractTask', {
      lambdaFunction: extractFunction,
      outputPath: '$.Payload',
    });

    const waitForEnrich = new sfn.Wait(this, 'WaitForEnrich', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(90)),
    });

    const aggregateTask = new tasks.LambdaInvoke(this, 'AggregateTask', {
      lambdaFunction: aggregateFunction,
      outputPath: '$.Payload',
    });

    const definition = fetchTask
      .next(extractTask)
      .next(waitForEnrich)
      .next(aggregateTask);

    this.stateMachine = new sfn.StateMachine(this, 'PipelineStateMachine', {
      stateMachineName: 'pulse-pipeline',
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      stateMachineType: sfn.StateMachineType.STANDARD,
    });

    this.apiUrl = '';

    // Outputs
    new cdk.CfnOutput(this, 'StateMachineArn', {
      value: this.stateMachine.stateMachineArn,
      exportName: 'PulseStateMachineArn',
    });
    new cdk.CfnOutput(this, 'EnrichQueueUrl', {
      value: enrichQueue.queueUrl,
      exportName: 'PulseEnrichQueueUrl',
    });
  }
}

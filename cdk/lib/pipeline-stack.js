"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const sqs = __importStar(require("aws-cdk-lib/aws-sqs"));
const sfn = __importStar(require("aws-cdk-lib/aws-stepfunctions"));
const tasks = __importStar(require("aws-cdk-lib/aws-stepfunctions-tasks"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const aws_lambda_event_sources_1 = require("aws-cdk-lib/aws-lambda-event-sources");
class PipelineStack extends cdk.Stack {
    fetchFunction;
    stateMachine;
    apiUrl;
    constructor(scope, id, props) {
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
            handler: 'handler.handler',
        };
        // Fetch Lambda - pulls top HackerNews stories and saves to S3
        this.fetchFunction = new lambda.Function(this, 'FetchFunction', {
            ...sharedProps,
            functionName: 'pulse-fetch',
            code: lambda.Code.fromAsset('../api/fetch'),
            timeout: cdk.Duration.seconds(60),
            logGroup: fetchLogGroup,
            environment: {
                ...sharedEnv,
                ENRICH_QUEUE_URL: enrichQueue.queueUrl,
            },
        });
        rawBucket.grantWrite(this.fetchFunction);
        enrichQueue.grantSendMessages(this.fetchFunction);
        // Extract Lambda - parses raw S3 JSON, publishes article messages to SQS
        const extractFunction = new lambda.Function(this, 'ExtractFunction', {
            ...sharedProps,
            functionName: 'pulse-extract',
            code: lambda.Code.fromAsset('../api/extract'),
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
            code: lambda.Code.fromAsset('../api/enrich'),
            timeout: cdk.Duration.seconds(60),
            logGroup: enrichLogGroup,
            environment: sharedEnv,
        });
        articlesTable.grantWriteData(enrichFunction);
        enrichFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['comprehend:DetectSentiment', 'comprehend:DetectEntities'],
            resources: ['*'],
        }));
        enrichFunction.addEventSource(new aws_lambda_event_sources_1.SqsEventSource(enrichQueue, {
            batchSize: 5,
            maxConcurrency: 5,
        }));
        // Aggregate Lambda - rolls up enriched articles into hourly stats
        const aggregateFunction = new lambda.Function(this, 'AggregateFunction', {
            ...sharedProps,
            functionName: 'pulse-aggregate',
            code: lambda.Code.fromAsset('../api/aggregate'),
            logGroup: aggregateLogGroup,
            environment: sharedEnv,
        });
        articlesTable.grantReadData(aggregateFunction);
        resultsTable.grantWriteData(aggregateFunction);
        // Step Functions state machine
        const fetchTask = new tasks.LambdaInvoke(this, 'FetchTask', {
            lambdaFunction: this.fetchFunction,
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
        // Allow fetch to start executions (set from EventBridge directly)
        this.stateMachine.grantStartExecution(this.fetchFunction);
        // Expose for SchedulerStack
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
exports.PipelineStack = PipelineStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGlwZWxpbmUtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJwaXBlbGluZS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsK0RBQWlEO0FBQ2pELHlEQUEyQztBQUMzQyxtRUFBcUQ7QUFDckQsMkVBQTZEO0FBQzdELHlEQUEyQztBQUMzQyx5REFBMkM7QUFHM0MsMkRBQTZDO0FBQzdDLG1GQUFzRTtBQVd0RSxNQUFhLGFBQWMsU0FBUSxHQUFHLENBQUMsS0FBSztJQUMxQixhQUFhLENBQWtCO0lBQy9CLFlBQVksQ0FBbUI7SUFDL0IsTUFBTSxDQUFTO0lBRS9CLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBeUI7UUFDakUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLEdBQUcsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLFlBQVksRUFBRSxhQUFhLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFeEUsdUJBQXVCO1FBQ3ZCLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDO1FBQzNDLE1BQU0sU0FBUyxHQUFHO1lBQ2hCLFVBQVUsRUFBRSxTQUFTLENBQUMsVUFBVTtZQUNoQyxhQUFhLEVBQUUsWUFBWSxDQUFDLFNBQVM7WUFDckMsY0FBYyxFQUFFLGFBQWEsQ0FBQyxTQUFTO1lBQ3ZDLHVCQUF1QixFQUFFLE9BQU87U0FDakMsQ0FBQztRQUVGLHNDQUFzQztRQUN0QyxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRTtZQUMzQyxlQUFlLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1NBQ3RDLENBQUMsQ0FBQztRQUVILE1BQU0sV0FBVyxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQ3JELGlCQUFpQixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUMzQyxlQUFlLEVBQUUsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLGVBQWUsRUFBRSxDQUFDLEVBQUU7U0FDcEQsQ0FBQyxDQUFDO1FBRUgsb0JBQW9CO1FBQ3BCLE1BQU0sYUFBYSxHQUFHLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQzdELFlBQVksRUFBRSx5QkFBeUI7WUFDdkMsU0FBUyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUztZQUN2QyxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1NBQ3pDLENBQUMsQ0FBQztRQUNILE1BQU0sZUFBZSxHQUFHLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDakUsWUFBWSxFQUFFLDJCQUEyQjtZQUN6QyxTQUFTLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTO1lBQ3ZDLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87U0FDekMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxjQUFjLEdBQUcsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUMvRCxZQUFZLEVBQUUsMEJBQTBCO1lBQ3hDLFNBQVMsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVM7WUFDdkMsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztTQUN6QyxDQUFDLENBQUM7UUFDSCxNQUFNLGlCQUFpQixHQUFHLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDckUsWUFBWSxFQUFFLDZCQUE2QjtZQUMzQyxTQUFTLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTO1lBQ3ZDLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87U0FDekMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxXQUFXLEdBQUc7WUFDbEIsT0FBTyxFQUFFLE9BQU87WUFDaEIsR0FBRztZQUNILFVBQVUsRUFBRSxFQUFFLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLGdCQUFnQixFQUFFO1lBQzNELGNBQWMsRUFBRSxDQUFDLFFBQVEsQ0FBQztZQUMxQixVQUFVLEVBQUUsR0FBRztZQUNmLE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDakMsT0FBTyxFQUFFLGlCQUFpQjtTQUMzQixDQUFDO1FBRUYsOERBQThEO1FBQzlELElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDOUQsR0FBRyxXQUFXO1lBQ2QsWUFBWSxFQUFFLGFBQWE7WUFDM0IsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQztZQUMzQyxPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ2pDLFFBQVEsRUFBRSxhQUFhO1lBQ3ZCLFdBQVcsRUFBRTtnQkFDWCxHQUFHLFNBQVM7Z0JBQ1osZ0JBQWdCLEVBQUUsV0FBVyxDQUFDLFFBQVE7YUFDdkM7U0FDRixDQUFDLENBQUM7UUFDSCxTQUFTLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUN6QyxXQUFXLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBRWxELHlFQUF5RTtRQUN6RSxNQUFNLGVBQWUsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQ25FLEdBQUcsV0FBVztZQUNkLFlBQVksRUFBRSxlQUFlO1lBQzdCLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxnQkFBZ0IsQ0FBQztZQUM3QyxRQUFRLEVBQUUsZUFBZTtZQUN6QixXQUFXLEVBQUU7Z0JBQ1gsR0FBRyxTQUFTO2dCQUNaLGdCQUFnQixFQUFFLFdBQVcsQ0FBQyxRQUFRO2FBQ3ZDO1NBQ0YsQ0FBQyxDQUFDO1FBQ0gsU0FBUyxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNyQyxXQUFXLENBQUMsaUJBQWlCLENBQUMsZUFBZSxDQUFDLENBQUM7UUFFL0MsMkVBQTJFO1FBQzNFLE1BQU0sY0FBYyxHQUFHLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDakUsR0FBRyxXQUFXO1lBQ2QsWUFBWSxFQUFFLGNBQWM7WUFDNUIsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLGVBQWUsQ0FBQztZQUM1QyxPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ2pDLFFBQVEsRUFBRSxjQUFjO1lBQ3hCLFdBQVcsRUFBRSxTQUFTO1NBQ3ZCLENBQUMsQ0FBQztRQUNILGFBQWEsQ0FBQyxjQUFjLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDN0MsY0FBYyxDQUFDLGVBQWUsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7WUFDckQsT0FBTyxFQUFFLENBQUMsNEJBQTRCLEVBQUUsMkJBQTJCLENBQUM7WUFDcEUsU0FBUyxFQUFFLENBQUMsR0FBRyxDQUFDO1NBQ2pCLENBQUMsQ0FBQyxDQUFDO1FBQ0osY0FBYyxDQUFDLGNBQWMsQ0FBQyxJQUFJLHlDQUFjLENBQUMsV0FBVyxFQUFFO1lBQzVELFNBQVMsRUFBRSxDQUFDO1lBQ1osY0FBYyxFQUFFLENBQUM7U0FDbEIsQ0FBQyxDQUFDLENBQUM7UUFFSixrRUFBa0U7UUFDbEUsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQ3ZFLEdBQUcsV0FBVztZQUNkLFlBQVksRUFBRSxpQkFBaUI7WUFDL0IsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLGtCQUFrQixDQUFDO1lBQy9DLFFBQVEsRUFBRSxpQkFBaUI7WUFDM0IsV0FBVyxFQUFFLFNBQVM7U0FDdkIsQ0FBQyxDQUFDO1FBQ0gsYUFBYSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQy9DLFlBQVksQ0FBQyxjQUFjLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUUvQywrQkFBK0I7UUFDL0IsTUFBTSxTQUFTLEdBQUcsSUFBSSxLQUFLLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUU7WUFDMUQsY0FBYyxFQUFFLElBQUksQ0FBQyxhQUFhO1lBQ2xDLFVBQVUsRUFBRSxXQUFXO1NBQ3hCLENBQUMsQ0FBQztRQUVILE1BQU0sV0FBVyxHQUFHLElBQUksS0FBSyxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQzlELGNBQWMsRUFBRSxlQUFlO1lBQy9CLFVBQVUsRUFBRSxXQUFXO1NBQ3hCLENBQUMsQ0FBQztRQUVILE1BQU0sYUFBYSxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ3hELElBQUksRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztTQUN0RCxDQUFDLENBQUM7UUFFSCxNQUFNLGFBQWEsR0FBRyxJQUFJLEtBQUssQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUNsRSxjQUFjLEVBQUUsaUJBQWlCO1lBQ2pDLFVBQVUsRUFBRSxXQUFXO1NBQ3hCLENBQUMsQ0FBQztRQUVILE1BQU0sVUFBVSxHQUFHLFNBQVM7YUFDekIsSUFBSSxDQUFDLFdBQVcsQ0FBQzthQUNqQixJQUFJLENBQUMsYUFBYSxDQUFDO2FBQ25CLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUV2QixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksR0FBRyxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsc0JBQXNCLEVBQUU7WUFDckUsZ0JBQWdCLEVBQUUsZ0JBQWdCO1lBQ2xDLGNBQWMsRUFBRSxHQUFHLENBQUMsY0FBYyxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUM7WUFDNUQsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDLGdCQUFnQixDQUFDLFFBQVE7U0FDaEQsQ0FBQyxDQUFDO1FBRUgsa0VBQWtFO1FBQ2xFLElBQUksQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBRTFELDRCQUE0QjtRQUM1QixJQUFJLENBQUMsTUFBTSxHQUFHLEVBQUUsQ0FBQztRQUVqQixVQUFVO1FBQ1YsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUN6QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxlQUFlO1lBQ3hDLFVBQVUsRUFBRSxzQkFBc0I7U0FDbkMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUN4QyxLQUFLLEVBQUUsV0FBVyxDQUFDLFFBQVE7WUFDM0IsVUFBVSxFQUFFLHFCQUFxQjtTQUNsQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF2S0Qsc0NBdUtDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIHNxcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcbmltcG9ydCAqIGFzIHNmbiBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3RlcGZ1bmN0aW9ucyc7XG5pbXBvcnQgKiBhcyB0YXNrcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3RlcGZ1bmN0aW9ucy10YXNrcyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0IHsgU3FzRXZlbnRTb3VyY2UgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLWV2ZW50LXNvdXJjZXMnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmludGVyZmFjZSBQaXBlbGluZVN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIHZwYzogZWMyLlZwYztcbiAgbGFtYmRhU2c6IGVjMi5TZWN1cml0eUdyb3VwO1xuICByYXdCdWNrZXQ6IHMzLkJ1Y2tldDtcbiAgcmVzdWx0c1RhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgYXJ0aWNsZXNUYWJsZTogZHluYW1vZGIuVGFibGU7XG59XG5cbmV4cG9ydCBjbGFzcyBQaXBlbGluZVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IGZldGNoRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IHN0YXRlTWFjaGluZTogc2ZuLlN0YXRlTWFjaGluZTtcbiAgcHVibGljIHJlYWRvbmx5IGFwaVVybDogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBQaXBlbGluZVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsgdnBjLCBsYW1iZGFTZywgcmF3QnVja2V0LCByZXN1bHRzVGFibGUsIGFydGljbGVzVGFibGUgfSA9IHByb3BzO1xuXG4gICAgLy8gU2hhcmVkIExhbWJkYSBjb25maWdcbiAgICBjb25zdCBSVU5USU1FID0gbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTI7XG4gICAgY29uc3Qgc2hhcmVkRW52ID0ge1xuICAgICAgUkFXX0JVQ0tFVDogcmF3QnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBSRVNVTFRTX1RBQkxFOiByZXN1bHRzVGFibGUudGFibGVOYW1lLFxuICAgICAgQVJUSUNMRVNfVEFCTEU6IGFydGljbGVzVGFibGUudGFibGVOYW1lLFxuICAgICAgUE9XRVJUT09MU19TRVJWSUNFX05BTUU6ICdwdWxzZScsXG4gICAgfTtcblxuICAgIC8vIFNRUyBxdWV1ZSBmb3IgYXJ0aWNsZSBmYW4tb3V0ICsgRExRXG4gICAgY29uc3QgZGxxID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnRW5yaWNoRGxxJywge1xuICAgICAgcmV0ZW50aW9uUGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cyg3KSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGVucmljaFF1ZXVlID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnRW5yaWNoUXVldWUnLCB7XG4gICAgICB2aXNpYmlsaXR5VGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLFxuICAgICAgZGVhZExldHRlclF1ZXVlOiB7IHF1ZXVlOiBkbHEsIG1heFJlY2VpdmVDb3VudDogMyB9LFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIGxvZyBncm91cHNcbiAgICBjb25zdCBmZXRjaExvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0ZldGNoTG9nR3JvdXAnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6ICcvYXdzL2xhbWJkYS9wdWxzZS1mZXRjaCcsXG4gICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuICAgIGNvbnN0IGV4dHJhY3RMb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdFeHRyYWN0TG9nR3JvdXAnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6ICcvYXdzL2xhbWJkYS9wdWxzZS1leHRyYWN0JyxcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG4gICAgY29uc3QgZW5yaWNoTG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnRW5yaWNoTG9nR3JvdXAnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6ICcvYXdzL2xhbWJkYS9wdWxzZS1lbnJpY2gnLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcbiAgICBjb25zdCBhZ2dyZWdhdGVMb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdBZ2dyZWdhdGVMb2dHcm91cCcsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogJy9hd3MvbGFtYmRhL3B1bHNlLWFnZ3JlZ2F0ZScsXG4gICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgc2hhcmVkUHJvcHMgPSB7XG4gICAgICBydW50aW1lOiBSVU5USU1FLFxuICAgICAgdnBjLFxuICAgICAgdnBjU3VibmV0czogeyBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX0lTT0xBVEVEIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW2xhbWJkYVNnXSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyLmhhbmRsZXInLFxuICAgIH07XG5cbiAgICAvLyBGZXRjaCBMYW1iZGEgLSBwdWxscyB0b3AgSGFja2VyTmV3cyBzdG9yaWVzIGFuZCBzYXZlcyB0byBTM1xuICAgIHRoaXMuZmV0Y2hGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0ZldGNoRnVuY3Rpb24nLCB7XG4gICAgICAuLi5zaGFyZWRQcm9wcyxcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ3B1bHNlLWZldGNoJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnLi4vYXBpL2ZldGNoJyksXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg2MCksXG4gICAgICBsb2dHcm91cDogZmV0Y2hMb2dHcm91cCxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIC4uLnNoYXJlZEVudixcbiAgICAgICAgRU5SSUNIX1FVRVVFX1VSTDogZW5yaWNoUXVldWUucXVldWVVcmwsXG4gICAgICB9LFxuICAgIH0pO1xuICAgIHJhd0J1Y2tldC5ncmFudFdyaXRlKHRoaXMuZmV0Y2hGdW5jdGlvbik7XG4gICAgZW5yaWNoUXVldWUuZ3JhbnRTZW5kTWVzc2FnZXModGhpcy5mZXRjaEZ1bmN0aW9uKTtcblxuICAgIC8vIEV4dHJhY3QgTGFtYmRhIC0gcGFyc2VzIHJhdyBTMyBKU09OLCBwdWJsaXNoZXMgYXJ0aWNsZSBtZXNzYWdlcyB0byBTUVNcbiAgICBjb25zdCBleHRyYWN0RnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdFeHRyYWN0RnVuY3Rpb24nLCB7XG4gICAgICAuLi5zaGFyZWRQcm9wcyxcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ3B1bHNlLWV4dHJhY3QnLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9hcGkvZXh0cmFjdCcpLFxuICAgICAgbG9nR3JvdXA6IGV4dHJhY3RMb2dHcm91cCxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIC4uLnNoYXJlZEVudixcbiAgICAgICAgRU5SSUNIX1FVRVVFX1VSTDogZW5yaWNoUXVldWUucXVldWVVcmwsXG4gICAgICB9LFxuICAgIH0pO1xuICAgIHJhd0J1Y2tldC5ncmFudFJlYWQoZXh0cmFjdEZ1bmN0aW9uKTtcbiAgICBlbnJpY2hRdWV1ZS5ncmFudFNlbmRNZXNzYWdlcyhleHRyYWN0RnVuY3Rpb24pO1xuXG4gICAgLy8gRW5yaWNoIExhbWJkYSAtIHJlYWRzIFNRUyBtZXNzYWdlcywgY2FsbHMgQ29tcHJlaGVuZCwgd3JpdGVzIHRvIER5bmFtb0RCXG4gICAgY29uc3QgZW5yaWNoRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdFbnJpY2hGdW5jdGlvbicsIHtcbiAgICAgIC4uLnNoYXJlZFByb3BzLFxuICAgICAgZnVuY3Rpb25OYW1lOiAncHVsc2UtZW5yaWNoJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnLi4vYXBpL2VucmljaCcpLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLFxuICAgICAgbG9nR3JvdXA6IGVucmljaExvZ0dyb3VwLFxuICAgICAgZW52aXJvbm1lbnQ6IHNoYXJlZEVudixcbiAgICB9KTtcbiAgICBhcnRpY2xlc1RhYmxlLmdyYW50V3JpdGVEYXRhKGVucmljaEZ1bmN0aW9uKTtcbiAgICBlbnJpY2hGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogWydjb21wcmVoZW5kOkRldGVjdFNlbnRpbWVudCcsICdjb21wcmVoZW5kOkRldGVjdEVudGl0aWVzJ10sXG4gICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgIH0pKTtcbiAgICBlbnJpY2hGdW5jdGlvbi5hZGRFdmVudFNvdXJjZShuZXcgU3FzRXZlbnRTb3VyY2UoZW5yaWNoUXVldWUsIHtcbiAgICAgIGJhdGNoU2l6ZTogNSxcbiAgICAgIG1heENvbmN1cnJlbmN5OiA1LFxuICAgIH0pKTtcblxuICAgIC8vIEFnZ3JlZ2F0ZSBMYW1iZGEgLSByb2xscyB1cCBlbnJpY2hlZCBhcnRpY2xlcyBpbnRvIGhvdXJseSBzdGF0c1xuICAgIGNvbnN0IGFnZ3JlZ2F0ZUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQWdncmVnYXRlRnVuY3Rpb24nLCB7XG4gICAgICAuLi5zaGFyZWRQcm9wcyxcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ3B1bHNlLWFnZ3JlZ2F0ZScsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4uL2FwaS9hZ2dyZWdhdGUnKSxcbiAgICAgIGxvZ0dyb3VwOiBhZ2dyZWdhdGVMb2dHcm91cCxcbiAgICAgIGVudmlyb25tZW50OiBzaGFyZWRFbnYsXG4gICAgfSk7XG4gICAgYXJ0aWNsZXNUYWJsZS5ncmFudFJlYWREYXRhKGFnZ3JlZ2F0ZUZ1bmN0aW9uKTtcbiAgICByZXN1bHRzVGFibGUuZ3JhbnRXcml0ZURhdGEoYWdncmVnYXRlRnVuY3Rpb24pO1xuXG4gICAgLy8gU3RlcCBGdW5jdGlvbnMgc3RhdGUgbWFjaGluZVxuICAgIGNvbnN0IGZldGNoVGFzayA9IG5ldyB0YXNrcy5MYW1iZGFJbnZva2UodGhpcywgJ0ZldGNoVGFzaycsIHtcbiAgICAgIGxhbWJkYUZ1bmN0aW9uOiB0aGlzLmZldGNoRnVuY3Rpb24sXG4gICAgICBvdXRwdXRQYXRoOiAnJC5QYXlsb2FkJyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGV4dHJhY3RUYXNrID0gbmV3IHRhc2tzLkxhbWJkYUludm9rZSh0aGlzLCAnRXh0cmFjdFRhc2snLCB7XG4gICAgICBsYW1iZGFGdW5jdGlvbjogZXh0cmFjdEZ1bmN0aW9uLFxuICAgICAgb3V0cHV0UGF0aDogJyQuUGF5bG9hZCcsXG4gICAgfSk7XG5cbiAgICBjb25zdCB3YWl0Rm9yRW5yaWNoID0gbmV3IHNmbi5XYWl0KHRoaXMsICdXYWl0Rm9yRW5yaWNoJywge1xuICAgICAgdGltZTogc2ZuLldhaXRUaW1lLmR1cmF0aW9uKGNkay5EdXJhdGlvbi5zZWNvbmRzKDkwKSksXG4gICAgfSk7XG5cbiAgICBjb25zdCBhZ2dyZWdhdGVUYXNrID0gbmV3IHRhc2tzLkxhbWJkYUludm9rZSh0aGlzLCAnQWdncmVnYXRlVGFzaycsIHtcbiAgICAgIGxhbWJkYUZ1bmN0aW9uOiBhZ2dyZWdhdGVGdW5jdGlvbixcbiAgICAgIG91dHB1dFBhdGg6ICckLlBheWxvYWQnLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZGVmaW5pdGlvbiA9IGZldGNoVGFza1xuICAgICAgLm5leHQoZXh0cmFjdFRhc2spXG4gICAgICAubmV4dCh3YWl0Rm9yRW5yaWNoKVxuICAgICAgLm5leHQoYWdncmVnYXRlVGFzayk7XG5cbiAgICB0aGlzLnN0YXRlTWFjaGluZSA9IG5ldyBzZm4uU3RhdGVNYWNoaW5lKHRoaXMsICdQaXBlbGluZVN0YXRlTWFjaGluZScsIHtcbiAgICAgIHN0YXRlTWFjaGluZU5hbWU6ICdwdWxzZS1waXBlbGluZScsXG4gICAgICBkZWZpbml0aW9uQm9keTogc2ZuLkRlZmluaXRpb25Cb2R5LmZyb21DaGFpbmFibGUoZGVmaW5pdGlvbiksXG4gICAgICBzdGF0ZU1hY2hpbmVUeXBlOiBzZm4uU3RhdGVNYWNoaW5lVHlwZS5TVEFOREFSRCxcbiAgICB9KTtcblxuICAgIC8vIEFsbG93IGZldGNoIHRvIHN0YXJ0IGV4ZWN1dGlvbnMgKHNldCBmcm9tIEV2ZW50QnJpZGdlIGRpcmVjdGx5KVxuICAgIHRoaXMuc3RhdGVNYWNoaW5lLmdyYW50U3RhcnRFeGVjdXRpb24odGhpcy5mZXRjaEZ1bmN0aW9uKTtcblxuICAgIC8vIEV4cG9zZSBmb3IgU2NoZWR1bGVyU3RhY2tcbiAgICB0aGlzLmFwaVVybCA9ICcnO1xuXG4gICAgLy8gT3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTdGF0ZU1hY2hpbmVBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5zdGF0ZU1hY2hpbmUuc3RhdGVNYWNoaW5lQXJuLFxuICAgICAgZXhwb3J0TmFtZTogJ1B1bHNlU3RhdGVNYWNoaW5lQXJuJyxcbiAgICB9KTtcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRW5yaWNoUXVldWVVcmwnLCB7XG4gICAgICB2YWx1ZTogZW5yaWNoUXVldWUucXVldWVVcmwsXG4gICAgICBleHBvcnROYW1lOiAnUHVsc2VFbnJpY2hRdWV1ZVVybCcsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==
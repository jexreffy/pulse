import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
interface PipelineStackProps extends cdk.StackProps {
    vpc: ec2.Vpc;
    lambdaSg: ec2.SecurityGroup;
    rawBucket: s3.Bucket;
    resultsTable: dynamodb.Table;
    articlesTable: dynamodb.Table;
}
export declare class PipelineStack extends cdk.Stack {
    readonly fetchFunction: lambda.Function;
    readonly stateMachine: sfn.StateMachine;
    readonly apiUrl: string;
    constructor(scope: Construct, id: string, props: PipelineStackProps);
}
export {};

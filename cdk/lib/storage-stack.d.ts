import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
interface StorageStackProps extends cdk.StackProps {
    vpc: ec2.Vpc;
}
export declare class StorageStack extends cdk.Stack {
    readonly rawBucket: s3.Bucket;
    readonly resultsTable: dynamodb.Table;
    readonly articlesTable: dynamodb.Table;
    constructor(scope: Construct, id: string, props: StorageStackProps);
}
export {};

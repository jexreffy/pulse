import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
interface CdnStackProps extends cdk.StackProps {
    apiUrl: string;
}
export declare class CdnStack extends cdk.Stack {
    readonly frontendBucket: s3.Bucket;
    constructor(scope: Construct, id: string, props: CdnStackProps);
}
export {};

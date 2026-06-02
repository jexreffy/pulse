import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
interface SchedulerStackProps extends cdk.StackProps {
    fetchFunction: lambda.Function;
}
export declare class SchedulerStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: SchedulerStackProps);
}
export {};

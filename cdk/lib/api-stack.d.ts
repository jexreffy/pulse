import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
interface ApiStackProps extends cdk.StackProps {
    vpc: ec2.Vpc;
    lambdaSg: ec2.SecurityGroup;
    resultsTable: dynamodb.Table;
    articlesTable: dynamodb.Table;
}
export declare class ApiStack extends cdk.Stack {
    readonly apiUrl: string;
    constructor(scope: Construct, id: string, props: ApiStackProps);
}
export {};

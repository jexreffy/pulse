import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

interface ApiStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  lambdaSg: ec2.SecurityGroup;
  resultsTable: dynamodb.Table;
  articlesTable: dynamodb.Table;
}

export class ApiStack extends cdk.Stack {
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { vpc, lambdaSg, resultsTable, articlesTable } = props;

    const readLogGroup = new logs.LogGroup(this, 'ReadLogGroup', {
      logGroupName: '/aws/lambda/pulse-read',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const readFunction = new lambda.Function(this, 'ReadFunction', {
      functionName: 'pulse-read',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset('../api/read'),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [lambdaSg],
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      logGroup: readLogGroup,
      environment: {
        RESULTS_TABLE: resultsTable.tableName,
        ARTICLES_TABLE: articlesTable.tableName,
      },
    });

    resultsTable.grantReadData(readFunction);
    articlesTable.grantReadData(readFunction);

    const api = new apigw.HttpApi(this, 'HttpApi', {
      apiName: 'pulse-api',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigw.CorsHttpMethod.GET],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const readIntegration = new integrations.HttpLambdaIntegration('ReadIntegration', readFunction);

    api.addRoutes({ path: '/results', methods: [apigw.HttpMethod.GET], integration: readIntegration });
    api.addRoutes({ path: '/results/{date}', methods: [apigw.HttpMethod.GET], integration: readIntegration });
    api.addRoutes({ path: '/articles/{run_id}', methods: [apigw.HttpMethod.GET], integration: readIntegration });
    api.addRoutes({ path: '/runs', methods: [apigw.HttpMethod.GET], integration: readIntegration });

    this.apiUrl = api.apiEndpoint;

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.apiEndpoint,
      exportName: 'PulseApiUrl',
    });
  }
}

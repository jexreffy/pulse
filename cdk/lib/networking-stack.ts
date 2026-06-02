import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class NetworkingStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly lambdaSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // DynamoDB Gateway VPC Endpoint (free - no NAT gateway needed)
    this.vpc.addGatewayEndpoint('DynamoDbEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
    });

    // S3 Gateway VPC Endpoint (free - needed for Lambda to reach S3 in VPC)
    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    // Comprehend Interface Endpoint (Lambda needs to call Comprehend)
    this.vpc.addInterfaceEndpoint('ComprehendEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.COMPREHEND,
      privateDnsEnabled: true,
    });

    // SQS Interface Endpoint
    this.vpc.addInterfaceEndpoint('SqsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SQS,
      privateDnsEnabled: true,
    });

    // Step Functions Interface Endpoint
    this.vpc.addInterfaceEndpoint('StatesEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.STEP_FUNCTIONS,
      privateDnsEnabled: true,
    });

    this.lambdaSg = new ec2.SecurityGroup(this, 'LambdaSg', {
      vpc: this.vpc,
      description: 'Lambda functions - Pulse pipeline',
      allowAllOutbound: false,
    });

    // HTTPS egress for VPC endpoints
    this.lambdaSg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS to VPC endpoints');
  }
}

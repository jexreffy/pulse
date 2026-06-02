import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';

interface SchedulerStackProps extends cdk.StackProps {
  fetchFunction: lambda.Function;
}

export class SchedulerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SchedulerStackProps) {
    super(scope, id, props);

    // EventBridge rule: trigger Fetch Lambda every hour
    const rule = new events.Rule(this, 'HourlyRule', {
      ruleName: 'pulse-hourly-pipeline',
      description: 'Trigger Pulse pipeline every hour',
      schedule: events.Schedule.rate(cdk.Duration.hours(1)),
    });

    rule.addTarget(new targets.LambdaFunction(props.fetchFunction, {
      event: events.RuleTargetInput.fromObject({
        source: 'eventbridge',
        trigger: 'hourly',
      }),
    }));
  }
}

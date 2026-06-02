#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkingStack } from '../lib/networking-stack';
import { StorageStack } from '../lib/storage-stack';
import { PipelineStack } from '../lib/pipeline-stack';
import { SchedulerStack } from '../lib/scheduler-stack';
import { ApiStack } from '../lib/api-stack';
import { CdnStack } from '../lib/cdn-stack';

const app = new cdk.App();

const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' };

const networking = new NetworkingStack(app, 'PulseNetworking', { env });

const storage = new StorageStack(app, 'PulseStorage', {
  env,
  vpc: networking.vpc,
});

const pipeline = new PipelineStack(app, 'PulsePipeline', {
  env,
  vpc: networking.vpc,
  lambdaSg: networking.lambdaSg,
  rawBucket: storage.rawBucket,
  resultsTable: storage.resultsTable,
  articlesTable: storage.articlesTable,
});

new SchedulerStack(app, 'PulseScheduler', {
  env,
  stateMachine: pipeline.stateMachine,
});

const api = new ApiStack(app, 'PulseApi', {
  env,
  vpc: networking.vpc,
  lambdaSg: networking.lambdaSg,
  resultsTable: storage.resultsTable,
  articlesTable: storage.articlesTable,
});

new CdnStack(app, 'PulseCdn', {
  env,
  apiUrl: api.apiUrl,
});

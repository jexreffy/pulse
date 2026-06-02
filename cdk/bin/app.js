#!/usr/bin/env node
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
require("source-map-support/register");
const cdk = __importStar(require("aws-cdk-lib"));
const networking_stack_1 = require("../lib/networking-stack");
const storage_stack_1 = require("../lib/storage-stack");
const pipeline_stack_1 = require("../lib/pipeline-stack");
const scheduler_stack_1 = require("../lib/scheduler-stack");
const api_stack_1 = require("../lib/api-stack");
const cdn_stack_1 = require("../lib/cdn-stack");
const app = new cdk.App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' };
const networking = new networking_stack_1.NetworkingStack(app, 'PulseNetworking', { env });
const storage = new storage_stack_1.StorageStack(app, 'PulseStorage', {
    env,
    vpc: networking.vpc,
});
const pipeline = new pipeline_stack_1.PipelineStack(app, 'PulsePipeline', {
    env,
    vpc: networking.vpc,
    lambdaSg: networking.lambdaSg,
    rawBucket: storage.rawBucket,
    resultsTable: storage.resultsTable,
    articlesTable: storage.articlesTable,
});
new scheduler_stack_1.SchedulerStack(app, 'PulseScheduler', {
    env,
    fetchFunction: pipeline.fetchFunction,
});
new api_stack_1.ApiStack(app, 'PulseApi', {
    env,
    vpc: networking.vpc,
    lambdaSg: networking.lambdaSg,
    resultsTable: storage.resultsTable,
    articlesTable: storage.articlesTable,
});
new cdn_stack_1.CdnStack(app, 'PulseCdn', {
    env,
    apiUrl: pipeline.apiUrl,
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXBwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLHVDQUFxQztBQUNyQyxpREFBbUM7QUFDbkMsOERBQTBEO0FBQzFELHdEQUFvRDtBQUNwRCwwREFBc0Q7QUFDdEQsNERBQXdEO0FBQ3hELGdEQUE0QztBQUM1QyxnREFBNEM7QUFFNUMsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFFMUIsTUFBTSxHQUFHLEdBQUcsRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLENBQUM7QUFFOUUsTUFBTSxVQUFVLEdBQUcsSUFBSSxrQ0FBZSxDQUFDLEdBQUcsRUFBRSxpQkFBaUIsRUFBRSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7QUFFeEUsTUFBTSxPQUFPLEdBQUcsSUFBSSw0QkFBWSxDQUFDLEdBQUcsRUFBRSxjQUFjLEVBQUU7SUFDcEQsR0FBRztJQUNILEdBQUcsRUFBRSxVQUFVLENBQUMsR0FBRztDQUNwQixDQUFDLENBQUM7QUFFSCxNQUFNLFFBQVEsR0FBRyxJQUFJLDhCQUFhLENBQUMsR0FBRyxFQUFFLGVBQWUsRUFBRTtJQUN2RCxHQUFHO0lBQ0gsR0FBRyxFQUFFLFVBQVUsQ0FBQyxHQUFHO0lBQ25CLFFBQVEsRUFBRSxVQUFVLENBQUMsUUFBUTtJQUM3QixTQUFTLEVBQUUsT0FBTyxDQUFDLFNBQVM7SUFDNUIsWUFBWSxFQUFFLE9BQU8sQ0FBQyxZQUFZO0lBQ2xDLGFBQWEsRUFBRSxPQUFPLENBQUMsYUFBYTtDQUNyQyxDQUFDLENBQUM7QUFFSCxJQUFJLGdDQUFjLENBQUMsR0FBRyxFQUFFLGdCQUFnQixFQUFFO0lBQ3hDLEdBQUc7SUFDSCxhQUFhLEVBQUUsUUFBUSxDQUFDLGFBQWE7Q0FDdEMsQ0FBQyxDQUFDO0FBRUgsSUFBSSxvQkFBUSxDQUFDLEdBQUcsRUFBRSxVQUFVLEVBQUU7SUFDNUIsR0FBRztJQUNILEdBQUcsRUFBRSxVQUFVLENBQUMsR0FBRztJQUNuQixRQUFRLEVBQUUsVUFBVSxDQUFDLFFBQVE7SUFDN0IsWUFBWSxFQUFFLE9BQU8sQ0FBQyxZQUFZO0lBQ2xDLGFBQWEsRUFBRSxPQUFPLENBQUMsYUFBYTtDQUNyQyxDQUFDLENBQUM7QUFFSCxJQUFJLG9CQUFRLENBQUMsR0FBRyxFQUFFLFVBQVUsRUFBRTtJQUM1QixHQUFHO0lBQ0gsTUFBTSxFQUFFLFFBQVEsQ0FBQyxNQUFNO0NBQ3hCLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAnc291cmNlLW1hcC1zdXBwb3J0L3JlZ2lzdGVyJztcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBOZXR3b3JraW5nU3RhY2sgfSBmcm9tICcuLi9saWIvbmV0d29ya2luZy1zdGFjayc7XG5pbXBvcnQgeyBTdG9yYWdlU3RhY2sgfSBmcm9tICcuLi9saWIvc3RvcmFnZS1zdGFjayc7XG5pbXBvcnQgeyBQaXBlbGluZVN0YWNrIH0gZnJvbSAnLi4vbGliL3BpcGVsaW5lLXN0YWNrJztcbmltcG9ydCB7IFNjaGVkdWxlclN0YWNrIH0gZnJvbSAnLi4vbGliL3NjaGVkdWxlci1zdGFjayc7XG5pbXBvcnQgeyBBcGlTdGFjayB9IGZyb20gJy4uL2xpYi9hcGktc3RhY2snO1xuaW1wb3J0IHsgQ2RuU3RhY2sgfSBmcm9tICcuLi9saWIvY2RuLXN0YWNrJztcblxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcblxuY29uc3QgZW52ID0geyBhY2NvdW50OiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5ULCByZWdpb246ICd1cy1lYXN0LTEnIH07XG5cbmNvbnN0IG5ldHdvcmtpbmcgPSBuZXcgTmV0d29ya2luZ1N0YWNrKGFwcCwgJ1B1bHNlTmV0d29ya2luZycsIHsgZW52IH0pO1xuXG5jb25zdCBzdG9yYWdlID0gbmV3IFN0b3JhZ2VTdGFjayhhcHAsICdQdWxzZVN0b3JhZ2UnLCB7XG4gIGVudixcbiAgdnBjOiBuZXR3b3JraW5nLnZwYyxcbn0pO1xuXG5jb25zdCBwaXBlbGluZSA9IG5ldyBQaXBlbGluZVN0YWNrKGFwcCwgJ1B1bHNlUGlwZWxpbmUnLCB7XG4gIGVudixcbiAgdnBjOiBuZXR3b3JraW5nLnZwYyxcbiAgbGFtYmRhU2c6IG5ldHdvcmtpbmcubGFtYmRhU2csXG4gIHJhd0J1Y2tldDogc3RvcmFnZS5yYXdCdWNrZXQsXG4gIHJlc3VsdHNUYWJsZTogc3RvcmFnZS5yZXN1bHRzVGFibGUsXG4gIGFydGljbGVzVGFibGU6IHN0b3JhZ2UuYXJ0aWNsZXNUYWJsZSxcbn0pO1xuXG5uZXcgU2NoZWR1bGVyU3RhY2soYXBwLCAnUHVsc2VTY2hlZHVsZXInLCB7XG4gIGVudixcbiAgZmV0Y2hGdW5jdGlvbjogcGlwZWxpbmUuZmV0Y2hGdW5jdGlvbixcbn0pO1xuXG5uZXcgQXBpU3RhY2soYXBwLCAnUHVsc2VBcGknLCB7XG4gIGVudixcbiAgdnBjOiBuZXR3b3JraW5nLnZwYyxcbiAgbGFtYmRhU2c6IG5ldHdvcmtpbmcubGFtYmRhU2csXG4gIHJlc3VsdHNUYWJsZTogc3RvcmFnZS5yZXN1bHRzVGFibGUsXG4gIGFydGljbGVzVGFibGU6IHN0b3JhZ2UuYXJ0aWNsZXNUYWJsZSxcbn0pO1xuXG5uZXcgQ2RuU3RhY2soYXBwLCAnUHVsc2VDZG4nLCB7XG4gIGVudixcbiAgYXBpVXJsOiBwaXBlbGluZS5hcGlVcmwsXG59KTtcbiJdfQ==
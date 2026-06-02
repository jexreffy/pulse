# Pulse

An automated AWS data pipeline that collects HackerNews headlines every hour, enriches each article with Amazon Comprehend (sentiment analysis + entity extraction), and serves a live analytics dashboard showing trends over time.

Demonstrates Python on AWS Lambda, Step Functions orchestration, SQS fan-out, and managed ML inference — all within the free tier.

## Architecture

```
EventBridge Scheduler (hourly)
  └─> Fetch Lambda (Python)         # Pulls top 30 HN stories
        └─> S3 raw/                 # Stores raw JSON (30-day lifecycle)
              └─> Step Functions    # Orchestrates pipeline
                    ├─> Extract Lambda    # Publishes articles to SQS
                    ├─> SQS queue         # Fan-out (1 msg per article)
                    │     └─> Enrich Lambda   # Comprehend sentiment + entities
                    └─> Aggregate Lambda  # Rolls up stats → DynamoDB

API Gateway + Read Lambda           # Dashboard read API
CloudFront + S3                     # React frontend
```

## AWS Services

| Service | Role |
|---|---|
| Lambda (Python 3.12) | 5 functions across the pipeline |
| Step Functions | Pipeline orchestration with wait + retry |
| SQS + DLQ | Article fan-out, failure isolation |
| Amazon Comprehend | Sentiment & entity detection |
| DynamoDB | Results store (PAY_PER_REQUEST) |
| S3 | Raw data staging + frontend hosting |
| CloudFront | CDN + HTTPS |
| API Gateway (HTTP) | Dashboard read API |
| EventBridge Scheduler | Hourly cron trigger |
| CDK (TypeScript) | All infrastructure as code |

## Local Development

```bash
# Install Python test deps
cd api && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

# Run tests
pytest

# Frontend dev server (proxies to live API)
cd frontend && npm install
echo "VITE_API_URL=https://<api-id>.execute-api.us-east-1.amazonaws.com" > .env.local
npm run dev
```

## Deploy

```bash
# Bootstrap AWS CDK (first time only)
cd cdk && npm install && npx cdk bootstrap

# Deploy all stacks
npx cdk deploy --all
```

CI/CD via GitHub Actions — push to `main` triggers full deploy using GitHub OIDC (no stored AWS keys).

## Project Structure

```
pulse/
  api/
    fetch/       # Pulls HackerNews top stories → S3
    extract/     # Reads S3, publishes SQS messages
    enrich/      # Calls Comprehend, writes to DynamoDB
    aggregate/   # Computes hourly stats
    read/        # Dashboard read API
    shared/      # Structured logging, DynamoDB helpers
    tests/       # pytest + moto (mocked AWS)
  cdk/
    lib/
      networking-stack.ts   # VPC, Lambda SG, VPC endpoints
      storage-stack.ts      # S3 + DynamoDB tables
      pipeline-stack.ts     # Step Functions, SQS, 4 Lambda fns
      scheduler-stack.ts    # EventBridge hourly rule
      api-stack.ts          # API Gateway + Read Lambda
      cdn-stack.ts          # CloudFront + frontend bucket
  frontend/
    src/
      components/
        SentimentChart.tsx  # recharts line chart
        EntityCloud.tsx     # top entities bar chart
        PipelineRuns.tsx    # run history table
```

#!/usr/bin/env node
/**
 * CI/CD Pipeline App for AI Marketplace Assistant
 * Deploys the self-mutating CDK pipeline
 */

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AIMarketplacePipelineStack } from '../lib/pipeline-stack';

const app = new cdk.App();

// Get configuration from context or environment
const githubOwner = app.node.tryGetContext('github-owner') || process.env.GITHUB_OWNER || 'luiscoy';
const githubRepo = app.node.tryGetContext('github-repo') || process.env.GITHUB_REPO || 'ai-marketplace-assistant';
const githubBranch = app.node.tryGetContext('github-branch') || process.env.GITHUB_BRANCH || 'main';
const githubConnectionArn = app.node.tryGetContext('github-connection-arn') || process.env.GITHUB_CONNECTION_ARN;

new AIMarketplacePipelineStack(app, 'AIMarketplacePipelineStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'CI/CD Pipeline for AI Marketplace Assistant',
  githubOwner,
  githubRepo,
  githubBranch,
  githubConnectionArn,
});

app.synth();
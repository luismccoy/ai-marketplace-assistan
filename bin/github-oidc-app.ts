#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { GitHubOIDCStack } from '../lib/github-oidc-stack';

const app = new cdk.App();

new GitHubOIDCStack(app, 'GitHubOIDCStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'GitHub OIDC Identity Provider and IAM Role for CI/CD'
});
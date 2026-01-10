#!/usr/bin/env node
/**
 * Admin Dashboard CDK App
 * Deploys secure admin dashboard with private S3 + CloudFront
 */

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AdminDashboardStack } from '../lib/admin-dashboard-stack';

const app = new cdk.App();

// Get environment from context or default to production
const environment = app.node.tryGetContext('environment') || 'production';

new AdminDashboardStack(app, `AIMarketplaceAdminDashboard-${environment}`, {
  environment,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: `AI Marketplace Admin Dashboard - Secure S3 + CloudFront (${environment})`,
  tags: {
    Project: 'AI-Marketplace-Assistant',
    Component: 'Admin-Dashboard',
    Environment: environment,
    Security: 'Private-S3-CloudFront-OAI',
  },
});
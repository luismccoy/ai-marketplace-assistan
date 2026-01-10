
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface GitHubOIDCStackProps extends cdk.StackProps {
  // Add any custom props here if needed
}

export class GitHubOIDCStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: GitHubOIDCStackProps) {
    super(scope, id, props);

    // Create GitHub OIDC Provider
    const githubProvider = new iam.OpenIdConnectProvider(this, 'GitHubProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    // Create IAM Role for GitHub Actions
    const githubRole = new iam.Role(this, 'GitHubDeployRole', {
      assumedBy: new iam.WebIdentityPrincipal(githubProvider.openIdConnectProviderArn, {
        StringLike: {
          'token.actions.githubusercontent.com:sub': 'repo:luiscoy/ai-marketplace-assistant:*', // Adjust repo as needed based on context
        },
      }),
      description: 'Role for GitHub Actions to deploy CDK stacks',
    });

    // Grant administrative permissions for deployment
    // Note: In production, you would want to scope this down
    githubRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));

    new cdk.CfnOutput(this, 'GitHubRoleArn', {
      value: githubRole.roleArn,
      description: 'ARN of the IAM role for GitHub Actions',
    });
  }
}

#!/bin/bash

# Setup GitHub OIDC Identity Provider and IAM Role
# Run this script with your AWS credentials configured

echo "Setting up GitHub OIDC Identity Provider and IAM Role..."

# Get AWS Account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "AWS Account ID: $ACCOUNT_ID"

# Create OIDC Identity Provider
echo "Creating GitHub OIDC Identity Provider..."
OIDC_ARN=$(aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 1c58a3a8518e8759bf075b76b750d4f2df264fcd \
  --query 'OpenIDConnectProviderArn' --output text 2>/dev/null)

if [ $? -ne 0 ]; then
  echo "OIDC Provider might already exist, getting existing ARN..."
  OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
fi

echo "OIDC Provider ARN: $OIDC_ARN"

# Create trust policy for the role
cat > /tmp/github-trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "$OIDC_ARN"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": [
            "repo:luismccoy/ai-marketplace-assistan:ref:refs/heads/main",
            "repo:luismccoy/ai-marketplace-assistan:ref:refs/heads/develop"
          ]
        }
      }
    }
  ]
}
EOF

# Create IAM Role
echo "Creating GitHub Actions IAM Role..."
ROLE_ARN=$(aws iam create-role \
  --role-name GitHubActionsDeploymentRole \
  --assume-role-policy-document file:///tmp/github-trust-policy.json \
  --description "Role for GitHub Actions to deploy AI Marketplace Assistant" \
  --max-session-duration 7200 \
  --query 'Role.Arn' --output text 2>/dev/null)

if [ $? -ne 0 ]; then
  echo "Role might already exist, getting existing ARN..."
  ROLE_ARN=$(aws iam get-role --role-name GitHubActionsDeploymentRole --query 'Role.Arn' --output text)
  
  # Update trust policy
  aws iam update-assume-role-policy \
    --role-name GitHubActionsDeploymentRole \
    --policy-document file:///tmp/github-trust-policy.json
fi

echo "Role ARN: $ROLE_ARN"

# Attach PowerUserAccess policy
echo "Attaching PowerUserAccess policy..."
aws iam attach-role-policy \
  --role-name GitHubActionsDeploymentRole \
  --policy-arn arn:aws:iam::aws:policy/PowerUserAccess

# Create and attach additional IAM permissions policy
cat > /tmp/github-iam-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:UpdateRole",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRolePolicy",
        "iam:ListRolePolicies",
        "iam:ListAttachedRolePolicies",
        "iam:CreatePolicy",
        "iam:DeletePolicy",
        "iam:GetPolicy",
        "iam:GetPolicyVersion",
        "iam:ListPolicyVersions",
        "iam:CreatePolicyVersion",
        "iam:DeletePolicyVersion",
        "iam:PassRole",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:ListRoleTags",
        "cloudformation:*"
      ],
      "Resource": "*"
    }
  ]
}
EOF

echo "Creating additional IAM permissions policy..."
aws iam put-role-policy \
  --role-name GitHubActionsDeploymentRole \
  --policy-name GitHubActionsAdditionalPermissions \
  --policy-document file:///tmp/github-iam-policy.json

# Clean up temp files
rm -f /tmp/github-trust-policy.json /tmp/github-iam-policy.json

echo ""
echo "✅ GitHub OIDC setup complete!"
echo ""
echo "📋 Configuration for GitHub Actions:"
echo "Role ARN: $ROLE_ARN"
echo "AWS Region: us-east-1"
echo ""
echo "🔧 Next steps:"
echo "1. Update your GitHub workflow to use OIDC authentication"
echo "2. Remove the AWS credential secrets from GitHub"
echo "3. Test the deployment"
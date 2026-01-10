#!/bin/bash

# Fix the OIDC trust policy with the correct repository name
echo "Fixing OIDC trust policy with correct repository name..."

# Get AWS Account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "AWS Account ID: $ACCOUNT_ID"

OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"

# Create corrected trust policy for the role
cat > /tmp/github-trust-policy-fixed.json << EOF
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

# Update trust policy
echo "Updating IAM role trust policy..."
aws iam update-assume-role-policy \
  --role-name GitHubActionsDeploymentRole \
  --policy-document file:///tmp/github-trust-policy-fixed.json

if [ $? -eq 0 ]; then
  echo "✅ Trust policy updated successfully!"
else
  echo "❌ Failed to update trust policy"
fi

# Clean up temp file
rm -f /tmp/github-trust-policy-fixed.json

echo ""
echo "🔧 Trust policy now allows:"
echo "  - repo:luismccoy/ai-marketplace-assistan:ref:refs/heads/main"
echo "  - repo:luismccoy/ai-marketplace-assistan:ref:refs/heads/develop"
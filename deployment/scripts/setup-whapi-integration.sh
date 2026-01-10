#!/bin/bash

# Complete Whapi.cloud Integration Setup
# This script configures your AI Marketplace Assistant for Whapi.cloud

echo "🚀 Setting up AI Marketplace Assistant for Whapi.cloud..."
echo ""

# Your Whapi.cloud configuration
CHANNEL_ID="HAWKEY-CZRHZ"
PHONE_NUMBER="+573147684545"
API_URL="https://gate.whapi.cloud"
TOKEN="zxie3qHCVGns5Bp8EthOCziMoIz6TAYP"

echo "📋 Configuration:"
echo "   - Channel ID: $CHANNEL_ID"
echo "   - Phone Number: $PHONE_NUMBER"
echo "   - API URL: $API_URL"
echo "   - Token: ${TOKEN:0:10}..."
echo ""

# Step 1: Update tenant configuration
echo "1️⃣ Updating tenant configuration..."
aws dynamodb update-item \
  --table-name ai-marketplace-tenants-platform \
  --key '{"tenantId":{"S":"demo-tenant-001"}}' \
  --update-expression "SET whatsappNumber = :channel, businessName = :name, #status = :status, configuration = :config" \
  --expression-attribute-names '{"#status":"status"}' \
  --expression-attribute-values '{
    ":channel":{"S":"'$CHANNEL_ID'"},
    ":name":{"S":"Luis McCoy Test Business"},
    ":status":{"S":"active"},
    ":config":{
      "M":{
        "language":{"S":"es"},
        "timezone":{"S":"America/Bogota"},
        "businessHours":{"S":"09:00-18:00"},
        "autoHandoffEnabled":{"BOOL":true},
        "ragEnabled":{"BOOL":false}
      }
    }
  }' \
  --region us-east-1

if [ $? -eq 0 ]; then
    echo "✅ Tenant configuration updated successfully!"
else
    echo "❌ Failed to update tenant configuration"
    exit 1
fi

echo ""

# Step 2: Verify configuration
echo "2️⃣ Verifying tenant configuration..."
aws dynamodb get-item \
  --table-name ai-marketplace-tenants-platform \
  --key '{"tenantId":{"S":"demo-tenant-001"}}' \
  --projection-expression "tenantId, businessName, whatsappNumber, #status" \
  --expression-attribute-names '{"#status":"status"}' \
  --region us-east-1 \
  --output table

echo ""

# Step 3: Test webhook endpoint
echo "3️⃣ Testing webhook endpoint..."
WEBHOOK_URL="https://zq3oc7n5e8.execute-api.us-east-1.amazonaws.com/prod/webhook"

echo "Your webhook URL: $WEBHOOK_URL"
echo ""

# Step 4: Instructions for Whapi.cloud setup
echo "4️⃣ Whapi.cloud Configuration Instructions:"
echo ""
echo "🔗 Go to: https://panel.whapi.cloud/channels/$CHANNEL_ID"
echo ""
echo "📝 Configure webhook:"
echo "   1. Go to Settings > Webhooks"
echo "   2. Set Webhook URL: $WEBHOOK_URL"
echo "   3. Enable these events:"
echo "      - messages (for direct messages)"
echo "      - chats_updates (for chat updates)"
echo "   4. Save configuration"
echo ""

# Step 5: Environment variables for Lambda
echo "5️⃣ Environment Variables (for Lambda deployment):"
echo ""
echo "Add these to your Lambda environment:"
echo "WHAPI_API_URL=$API_URL"
echo "WHAPI_TOKEN=$TOKEN"
echo "WHAPI_CHANNEL_ID=$CHANNEL_ID"
echo ""

# Step 6: Test message
echo "6️⃣ Test Instructions:"
echo ""
echo "📱 Send a test message:"
echo "   - Send 'Hola tienen productos?' to $PHONE_NUMBER"
echo "   - Check CloudWatch logs for processing"
echo "   - Expect AI response within 5-10 seconds"
echo ""

echo "🎯 Next Steps:"
echo "   1. Configure Whapi.cloud webhook (step 4)"
echo "   2. Update Lambda environment variables (step 5)"
echo "   3. Deploy updated webhook handler"
echo "   4. Send test message (step 6)"
echo ""

echo "✅ Setup complete! Your AI Marketplace Assistant is ready for Whapi.cloud integration."
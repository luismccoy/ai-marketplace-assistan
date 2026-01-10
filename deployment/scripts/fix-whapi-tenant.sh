#!/bin/bash

# Fix tenant configuration for Whapi.cloud setup
# Your details:
# - Channel: HAWKEY-CZRHZ  
# - Phone: +573147684545
# - API: https://gate.whapi.cloud/
# - Token: zxie3qHCVGns5Bp8EthOCziMoIz6TAYP

echo "🔧 Configuring AI Marketplace Assistant for Whapi.cloud..."

# Update tenant with your Whapi.cloud channel ID
CHANNEL_ID="HAWKEY-CZRHZ"
PHONE_NUMBER="+573147684545"

echo "Updating demo-tenant-001 with Whapi.cloud channel: $CHANNEL_ID"

aws dynamodb update-item \
  --table-name ai-marketplace-tenants-platform \
  --key '{"tenantId":{"S":"demo-tenant-001"}}' \
  --update-expression "SET whatsappNumber = :channel, businessName = :name, #status = :status" \
  --expression-attribute-names '{"#status":"status"}' \
  --expression-attribute-values '{
    ":channel":{"S":"'$CHANNEL_ID'"},
    ":name":{"S":"Luis McCoy Test Business"},
    ":status":{"S":"active"}
  }' \
  --region us-east-1

if [ $? -eq 0 ]; then
    echo "✅ Successfully updated tenant configuration!"
    echo ""
    echo "📋 Your configuration:"
    echo "   - Tenant ID: demo-tenant-001"
    echo "   - Business: Luis McCoy Test Business"
    echo "   - Channel: $CHANNEL_ID"
    echo "   - Phone: $PHONE_NUMBER"
    echo ""
    echo "🔗 Next steps:"
    echo "   1. Configure Whapi.cloud webhook URL to point to your Lambda"
    echo "   2. Test by sending: 'Hola tienen productos?' to $PHONE_NUMBER"
else
    echo "❌ Failed to update tenant configuration"
    exit 1
fi

echo ""
echo "📋 Verification - Current tenant configuration:"
aws dynamodb get-item \
  --table-name ai-marketplace-tenants-platform \
  --key '{"tenantId":{"S":"demo-tenant-001"}}' \
  --region us-east-1 \
  --output table
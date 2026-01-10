#!/bin/bash

# Fix WhatsApp tenant configuration
# Replace YOUR_ACTUAL_PHONE_NUMBER_ID with your real WhatsApp Business phone number ID

echo "🔧 Fixing AI Marketplace Assistant tenant configuration..."

# Option 1: If you know your WhatsApp phone number ID, replace it here
WHATSAPP_PHONE_ID="YOUR_ACTUAL_PHONE_NUMBER_ID"

# Option 2: Common WhatsApp phone number ID patterns (uncomment the correct one)
# WHATSAPP_PHONE_ID="120363405211031080"  # Based on chat_id from logs
# WHATSAPP_PHONE_ID="50376442653"         # Based on from field in logs
# WHATSAPP_PHONE_ID="HAWKEY-CZRHZ"        # Based on channel_id from logs

echo "Updating demo-tenant-001 with WhatsApp number: $WHATSAPP_PHONE_ID"

aws dynamodb update-item \
  --table-name ai-marketplace-tenants-platform \
  --key '{"tenantId":{"S":"demo-tenant-001"}}' \
  --update-expression "SET whatsappNumber = :phone" \
  --expression-attribute-values "{\":phone\":{\"S\":\"$WHATSAPP_PHONE_ID\"}}" \
  --region us-east-1

if [ $? -eq 0 ]; then
    echo "✅ Successfully updated tenant configuration!"
    echo "🧪 Test by sending a message to your WhatsApp Business number"
else
    echo "❌ Failed to update tenant configuration"
    exit 1
fi

echo ""
echo "📋 Verification - Current tenant configuration:"
aws dynamodb get-item \
  --table-name ai-marketplace-tenants-platform \
  --key '{"tenantId":{"S":"demo-tenant-001"}}' \
  --projection-expression "tenantId, businessName, whatsappNumber" \
  --region us-east-1 \
  --output table
import { TenantResolver } from '../../services/tenant-resolver';
import { tenantResolver } from '../../services/tenant-resolver';
import { aiOrchestrator } from '../../services/ai-orchestrator';
import { tenantDataAccess } from '../../services/tenant-data-access';
import { usageTracker } from '../../services/usage-tracker';
import axios from 'axios';

// Note: Ensure services prioritize process.env for table names as updated in previous steps.

export const handler = async (event: any) => {
    console.log('Message Handler processing event:', JSON.stringify(event, null, 2));

    try {
        // 1. Extract Messages from WhatsApp Event
        // Support both Meta (entry[0]...) and Whapi (messages[...]) structures
        let messages = [];
        let businessId = '';

        if (event.messages) {
            // Whapi structure
            messages = event.messages;
            businessId = event.channel_id; // Whapi sends channel_id (e.g. HAWKEY-CZRHZ)
        } else if (event.entry?.[0]?.changes?.[0]?.value?.messages) {
            // Meta structure
            const value = event.entry[0].changes[0].value;
            messages = value.messages;
            businessId = value.metadata?.display_phone_number;
        }

        if (!messages || messages.length === 0) {
            console.log('No messages in event', JSON.stringify(event));
            return;
        }

        for (const message of messages) {
            const customerPhoneNumber = message.from; // Whapi: '13135555657', Meta: '13135555657'

            // Handle Text or Interactive Reply
            let messageText = message.text?.body || '';
            if (message.type === 'interactive' && message.interactive?.button_reply) {
                messageText = message.interactive.button_reply.title; // Use the button title as the message (e.g., "Ver más fotos")
                console.log(`Received button click: ${message.interactive.button_reply.id} ("${messageText}")`);
            }

            // Whapi might put the sender in 'from' but business needs to be identified.
            // If businessId is channel_id (e.g. HAWKEY-CZRHZ), we need to map that or pass it.
            // Our tenant resolver expects a phone number, but for Whapi demo we mapped HAWKEY-CZRHZ to number in DB?
            // Wait, we mapped 'whatsappNumber' in DB to 'HAWKEY-CZRHZ' (or valid phone).
            // Let's ensure businessPhoneNumber acts as the identifier.

            const businessPhoneNumber = businessId || '';

            console.log(`Processing message from ${customerPhoneNumber} to business ${businessPhoneNumber}`);

            // 2. Resolve Tenant
            // We might need to format the number (e.g., adding + prefix) depending on how it's stored in DynamoDB
            // Assuming stored with '+' in DB, let's try with and without or standardize. 
            // The DB has "+57300..." format in examples.
            const formattedBusinessNumber = '+' + businessPhoneNumber;

            const tenantResolution = await tenantResolver.resolveTenantFromWhatsApp(formattedBusinessNumber);

            if (!tenantResolution.isValid || !tenantResolution.tenantConfig) {
                console.warn(`Could not resolve tenant for number: ${formattedBusinessNumber}`);
                // Optional: Send a generic error or ignore
                continue;
            }

            const tenantId = tenantResolution.tenantId;
            const tenantConfig = tenantResolution.tenantConfig;
            const conversationId = `conv_${customerPhoneNumber}`;

            // 2.5 Check Usage Limits (Phase 6.2)
            const plan = tenantConfig.plan || 'basic'; // Default to basic (was starter)
            const limitCheck = await usageTracker.checkLimit(tenantId, plan);

            if (!limitCheck.allowed) {
                console.warn(`Tenant ${tenantId} exceeded limit for plan ${plan}`);
                if (process.env.WHAPI_TOKEN) {
                    await sendWhapiResponse(customerPhoneNumber, `⚠️ ${limitCheck.reason}\n\nUpgrade your plan here: https://d2q8qoxb8y8m8n.cloudfront.net/dashboard.html`);
                }
                continue; // Stop processing for this message
            }

            // 3. Load conversation context & products
            let conversationContext = await tenantDataAccess.getConversation(tenantId, conversationId);

            if (!conversationContext) {
                // Initialize new context
                // ... (abbrev)
                conversationContext = {
                    tenantId,
                    conversationId,
                    customerId: customerPhoneNumber,
                    status: 'active',
                    lastIntent: 'new_conversation',
                    productInquiries: [],
                    messages: [],
                    createdAt: new Date().toISOString(),
                    lastUpdate: new Date().toISOString()
                };
            }

            const productsData = await tenantDataAccess.getTenantProducts(tenantId, 'available');

            console.log(`Loaded ${productsData.length} available products for tenant ${tenantId}`);

            // 4. Process with AI Orchestrator
            const aiResult = await aiOrchestrator.processMessage({
                message: messageText,
                availableProducts: productsData,
                conversationContext: conversationContext as any,
                businessConfig: {
                    ...tenantConfig.businessConfig,
                    businessName: tenantConfig.businessName,
                    ownerName: tenantConfig.ownerName
                },
                customerProfile: {
                    phoneNumber: customerPhoneNumber,
                } as any
            });

            // Increment Usage (Success)
            await usageTracker.incrementUsage(tenantId, 'message', 1);

            const responseText = aiResult.response.response;
            const mentionedProducts = aiResult.response.metadata?.products || [];

            // 4.5 Send product images if products were mentioned
            // 4.5 Send product with Interactive Message (Image + Buttons)
            if (mentionedProducts.length > 0 && process.env.WHAPI_TOKEN) {
                // Only send the first product as interactive to avoid spam
                const productId = mentionedProducts[0];
                const product = productsData.find(p => p.productId === productId);

                if (product) {
                    const productAny = product as any;
                    const imageUrl = productAny.images?.[0] || productAny.imageUrl;

                    if (imageUrl) {
                        await sendWhapiInteractive(
                            customerPhoneNumber,
                            imageUrl,
                            `*${product.name}*\n\n💰 Precio: $${formatPrice(product.price)}\n✨ Estado: ${product.condition}\n\n${product.description.substring(0, 100)}${product.description.length > 100 ? '...' : ''}`,
                            [
                                { id: `photos_${product.productId}`, title: "📸 Ver más fotos" },
                                { id: `buy_${product.productId}`, title: "💳 Comprar" }
                            ]
                        );
                        console.log(`Sent interactive message for product ${product.name}`);
                    }
                }
            }



            // 5. Check for Location Metadata
            if (aiResult.response.metadata?.location && process.env.WHAPI_TOKEN) {
                const loc = aiResult.response.metadata.location;
                await sendWhapiLocation(
                    customerPhoneNumber,
                    loc.latitude,
                    loc.longitude,
                    loc.name,
                    loc.address
                );
            }

            // 6. Check for Negotiation/QuickReply Metadata
            if (aiResult.response.metadata?.negotiation && process.env.WHAPI_TOKEN) {
                const neg = aiResult.response.metadata.negotiation;
                if (!neg.accepted && neg.counterOffer) {
                    await sendQuickReplies(
                        customerPhoneNumber,
                        `¿Aceptas la contraoferta de $${neg.counterOffer}?`,
                        ['Sí, acepto', 'No, gracias', 'Ver otros']
                    );
                }
            }

            // 7. Check for Interactive List Message
            if (aiResult.response.metadata?.listMessage && process.env.WHAPI_TOKEN) {
                const listData = aiResult.response.metadata.listMessage;
                await sendWhapiList(
                    customerPhoneNumber,
                    listData.body,
                    listData.buttonText || 'Ver opciones',
                    listData.sections
                );
            }

            // 6. Update user state (last message timestamp, etc)
            // For this MVP/Demo, we might rely on a passed-through token or environment variable if single tenant,
            // but this is multi-tenant. The Tenant Config should hopefully have credentials.
            // Looking at `src/services/tenant-resolver.ts`, `TenantConfig` has `integrations.whatsappBusinessAPI`?
            // The `TenantConfig` interface in `types/tenant.ts` likely defines where creds are.
            // IF missing, we can't send.

            // For WHAPI.cloud integration (alternative mentioned in README), keys in env vars:
            // WHAPI_TOKEN, WHAPI_API_URL

            // Let's assume standard Meta API for now or check usage.
            // The README mentions:
            // "WHAPI_API_URL=https://gate.whapi.cloud"
            // "WHAPI_TOKEN=your-whapi-token"
            // If using WHAPI:

            if (process.env.WHAPI_TOKEN) {
                await sendWhapiResponse(customerPhoneNumber, responseText);
            } else {
                console.log(`[Simulation] Would send to ${customerPhoneNumber}: "${responseText}"`);
            }

            // 5. Save Conversation
            const customerMsgObj = {
                id: message.id,
                tenantId: tenantId,
                conversationId: conversationId,
                from: 'customer' as const,
                content: messageText,
                timestamp: new Date().toISOString(),
                type: 'text' as const
            };
            await tenantDataAccess.saveMessage(customerMsgObj);

            const botMsgObj = {
                id: `resp_${Date.now()}`,
                tenantId: tenantId,
                conversationId: conversationId,
                from: 'bot' as const,
                content: responseText,
                timestamp: new Date().toISOString(),
                type: 'text' as const
            };
            await tenantDataAccess.saveMessage(botMsgObj);

            // 6. Update and Save Conversation Context
            const updatedContext = aiResult.response.updatedContext;

            // Exclude messages from updatedContext to avoid type mismatch
            // (AI context messages lack tenantId/conversationId)
            const { messages: _ignoreMessages, ...otherContextUpdates } = updatedContext as any;

            // Merge updates and append new messages
            conversationContext = {
                ...conversationContext,
                ...otherContextUpdates,
                messages: [...(conversationContext.messages || []), customerMsgObj, botMsgObj],
                lastUpdate: new Date().toISOString()
            };

            await tenantDataAccess.saveConversation(conversationContext!);

        } // End for loop
    } catch (error) {
        console.error('Error in message handler:', error);
        throw error; // Cause retry if needed, or handle gracefully
    }
};

async function sendWhapiResponse(to: string, body: string) {
    const url = `${process.env.WHAPI_API_URL}/messages/text`;
    const payload = {
        to: to,
        body: body
    };

    console.log('Sending to Whapi:', JSON.stringify({ url, to, bodyLength: body.length }));

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Authorization': `Bearer ${process.env.WHAPI_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log('Whapi response:', JSON.stringify({ status: response.status, data: response.data }));
        console.log('Response sent via WHAPI');
    } catch (e: any) {
        console.error('Failed to send WHAPI response:', JSON.stringify({
            error: e.message,
            status: e.response?.status,
            data: e.response?.data,
            to,
            url
        }));
    }
}

async function sendWhapiImage(to: string, imageUrl: string, caption: string = '') {
    const url = `${process.env.WHAPI_API_URL}/messages/image`;
    const payload = {
        to: to,
        media: imageUrl,
        caption: caption
    };

    console.log('Sending image to Whapi:', JSON.stringify({ url, to, imageUrl, caption }));

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Authorization': `Bearer ${process.env.WHAPI_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log('Whapi image response:', JSON.stringify({ status: response.status, data: response.data }));
    } catch (e: any) {
        console.error('Failed to send WHAPI image:', JSON.stringify({
            error: e.message,
            status: e.response?.status,
            data: e.response?.data,
            to,
            imageUrl
        }));
    }
}

async function sendWhapiInteractive(to: string, imageUrl: string, bodyText: string, buttons: { id: string, title: string }[]) {
    const url = `${process.env.WHAPI_API_URL}/messages/interactive`;

    // Construct Interactive Message Payload
    const payload = {
        to: to,
        interactive: {
            type: "button",
            header: {
                type: "image",
                image: {
                    link: imageUrl
                }
            },
            body: {
                text: bodyText
            },
            footer: {
                text: "AI Marketplace Assistant"
            },
            action: {
                buttons: buttons.map(btn => ({
                    type: "reply",
                    reply: {
                        id: btn.id,
                        title: btn.title
                    }
                }))
            }
        }
    };

    console.log('Sending Interactive Message to Whapi:', JSON.stringify({ url, to, buttonCount: buttons.length }));

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Authorization': `Bearer ${process.env.WHAPI_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log('Whapi interactive response:', JSON.stringify({ status: response.status, data: response.data }));
    } catch (e: any) {
        console.error('Failed to send WHAPI interactive:', JSON.stringify({
            error: e.message,
            status: e.response?.status,
            data: e.response?.data,
            to
        }));
    }
}

async function sendWhapiLocation(to: string, latitude: number, longitude: number, name: string, address: string) {
    const url = `${process.env.WHAPI_API_URL}/messages/location`;
    const payload = {
        to: to,
        location: {
            latitude: latitude,
            longitude: longitude,
            name: name,
            address: address
        }
    };

    console.log('Sending Location to Whapi:', JSON.stringify({ url, to, name }));

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Authorization': `Bearer ${process.env.WHAPI_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log('Whapi location response:', JSON.stringify({ status: response.status, data: response.data }));
    } catch (e: any) {
        console.error('Failed to send WHAPI location:', JSON.stringify({
            error: e.message,
            status: e.response?.status,
            data: e.response?.data,
            to
        }));
    }
}


function formatPrice(price: number): string {
    return price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

async function sendQuickReplies(to: string, bodyText: string, options: string[]) {
    const url = `${process.env.WHAPI_API_URL}/messages/interactive`;

    const buttons = options.map((opt, index) => ({
        type: "reply",
        reply: {
            id: `reply_${index}_${opt.replace(/\s+/g, '_').toLowerCase()}`,
            title: opt
        }
    }));

    const payload = {
        to: to,
        interactive: {
            type: "button",
            body: {
                text: bodyText
            },
            action: {
                buttons: buttons
            }
        }
    };

    console.log('Sending Quick Replies to Whapi:', JSON.stringify({ url, to, options }));

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Authorization': `Bearer ${process.env.WHAPI_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log('Whapi quick reply response:', JSON.stringify({ status: response.status, data: response.data }));

    } catch (e: any) {
        console.error('Failed to send WHAPI quick replies:', JSON.stringify({
            error: e.message,
            status: e.response?.status,
            data: e.response?.data,
            to
        }));
    }
}

async function sendWhapiList(to: string, bodyText: string, buttonText: string, sections: { title: string, rows: { id: string, title: string, description?: string }[] }[]) {
    const url = `${process.env.WHAPI_API_URL}/messages/interactive`;

    const payload = {
        to: to,
        type: "list",
        header: {
            type: "text",
            text: "Nuestro Catálogo"
        },
        body: {
            text: bodyText
        },
        footer: {
            text: "AI Marketplace Assistant"
        },
        action: {
            button: buttonText,
            sections: sections
        }
    };

    console.log('Sending List Message to Whapi:', JSON.stringify({ url, to, sectionCount: sections.length, payload }));

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Authorization': `Bearer ${process.env.WHAPI_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log('Whapi list response:', JSON.stringify({ status: response.status, data: response.data }));
    } catch (e: any) {
        console.error('Failed to send WHAPI list:', JSON.stringify({
            error: e.message,
            status: e.response?.status,
            data: e.response?.data,
            payload: payload,
            to
        }));
    }
}


import { stripeClient } from '../../services/stripe-client';
import { tenantDataAccess } from '../../services/tenant-data-access';
import Stripe from 'stripe';

export const handler = async (event: any) => {
    console.log('Stripe Webhook received:', JSON.stringify({ headers: event.headers, bodyLength: event.body?.length }));

    try {
        const signature = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!signature || !webhookSecret) {
            console.error('Missing signature or webhook secret');
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing signature or webhook secret' })
            };
        }

        // Verify webhook signature
        let stripeEvent: Stripe.Event;
        try {
            stripeEvent = stripeClient.verifyWebhookSignature(
                event.body,
                signature,
                webhookSecret
            );
        } catch (err: any) {
            console.error('Webhook signature verification failed:', err.message);
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid signature' })
            };
        }

        console.log('Verified Stripe event:', stripeEvent.type);

        // Handle different event types
        switch (stripeEvent.type) {
            case 'customer.subscription.created':
                await handleSubscriptionCreated(stripeEvent.data.object as Stripe.Subscription);
                break;

            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(stripeEvent.data.object as Stripe.Subscription);
                break;

            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(stripeEvent.data.object as Stripe.Subscription);
                break;

            case 'invoice.payment_succeeded':
                await handlePaymentSucceeded(stripeEvent.data.object as Stripe.Invoice);
                break;

            case 'invoice.payment_failed':
                await handlePaymentFailed(stripeEvent.data.object as Stripe.Invoice);
                break;

            default:
                console.log(`Unhandled event type: ${stripeEvent.type}`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ received: true })
        };

    } catch (error: any) {
        console.error('Error processing webhook:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
    console.log('Subscription created:', subscription.id, 'Status:', subscription.status);
    // TODO: Update tenant record with subscription info when updateTenant method is added
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    console.log('Subscription updated:', subscription.id, 'Status:', subscription.status);
    // TODO: Update tenant record with new subscription status
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    console.log('Subscription deleted:', subscription.id);
    // TODO: Mark tenant subscription as canceled
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
    console.log('Payment succeeded for invoice:', invoice.id);
    // TODO: Reactivate tenant if was past_due
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
    console.log('Payment failed for invoice:', invoice.id);
    // TODO: Mark tenant subscription as past_due
}

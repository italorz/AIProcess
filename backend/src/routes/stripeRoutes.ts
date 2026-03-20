import { Request, Response, Router } from 'express';
import Stripe from 'stripe';

import { STRIPE_WEBHOOK_SECRET } from '../config/env';
import { getStripeClient } from '../lib/stripe';
import { syncStripeSubscriptionState } from '../service/billingService';

export const stripeWebhookHandler = async (req: Request, res: Response) => {
    if (!STRIPE_WEBHOOK_SECRET) {
        return res.status(500).json({ message: 'Webhook Stripe não configurado.' });
    }

    const signature = req.headers['stripe-signature'];
    if (!signature || Array.isArray(signature)) {
        return res.status(400).json({ message: 'Assinatura do webhook não informada.' });
    }

    try {
        const stripe = getStripeClient();
        const event = stripe.webhooks.constructEvent(
            req.body as Buffer,
            signature,
            STRIPE_WEBHOOK_SECRET
        );

        if (
            event.type === 'customer.subscription.created' ||
            event.type === 'customer.subscription.updated' ||
            event.type === 'customer.subscription.deleted'
        ) {
            await syncStripeSubscriptionState(event.data.object as Stripe.Subscription);
        }

        return res.json({ received: true });
    } catch (error) {
        console.error('[STRIPE:WEBHOOK]', error);
        return res.status(400).json({
            message:
                error instanceof Error ? error.message : 'Falha ao processar webhook do Stripe.',
        });
    }
};

const router = Router();

router.get('/health', (_req, res) => {
    return res.json({ status: 'ok' });
});

export default router;

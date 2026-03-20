import Stripe from 'stripe';

import { STRIPE_SECRET_KEY } from '../config/env';

let stripeClient: Stripe | null = null;

if (STRIPE_SECRET_KEY) {
    stripeClient = new Stripe(STRIPE_SECRET_KEY);
}

export const getStripeClient = () => {
    if (!stripeClient) {
        throw new Error('STRIPE_SECRET_KEY não configurada.');
    }

    return stripeClient;
};

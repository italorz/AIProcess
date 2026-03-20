import cors from 'cors';
import express from 'express';

import authRoutes from './routes/authRoutes';
import aiRoutes from './routes/aiRoutes';
import clientRoutes from './routes/clientRoutes';
import leadRoutes from './routes/leadRoutes';
import lawyerRoutes from './routes/lawyerRoutes';
import scrapingRoutes from './routes/scrapingRoutes';
import stripeRoutes, { stripeWebhookHandler } from './routes/stripeRoutes';
import { getActiveSessionsCount } from './service/scrapingService';

export const createApp = () => {
    const app = express();
    app.use(cors());
    app.post('/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);
    app.use(express.json({ limit: '2mb' }));

    app.use('/auth', authRoutes);
    app.use('/client', clientRoutes);
    app.use('/lawyer', lawyerRoutes);
    app.use('/leads', leadRoutes);
    app.use('/ai', aiRoutes);
    app.use('/scraping', scrapingRoutes);
    app.use('/stripe', stripeRoutes);

    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', activeSessions: getActiveSessionsCount() });
    });

    return app;
};


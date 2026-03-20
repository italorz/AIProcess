import 'dotenv/config';

import { createApp } from './app';
import { PORT } from './config/env';
import { connectDatabase } from './database/connection';
import { cleanupAllSessions } from './service/scrapingService';

const startServer = async () => {
    try {
        await connectDatabase();
        const app = createApp();

        const server = app.listen(PORT, () => {
            console.log(`API rodando em http://localhost:${PORT}`);
        });

        const gracefulShutdown = async () => {
            console.log('Encerrando serviço...');
            server.close();
            await cleanupAllSessions();
            process.exit(0);
        };

        process.on('SIGINT', gracefulShutdown);
        process.on('SIGTERM', gracefulShutdown);
    } catch (error) {
        console.error('[SERVER] Falha ao iniciar aplicação', error);
        process.exit(1);
    }
};

void startServer();
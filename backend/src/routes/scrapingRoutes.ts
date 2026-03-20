import { Router } from 'express';

import {
    cleanupSession,
    selectProcessInstance,
    startScrapingSession,
    submitCaptcha,
} from '../service/scrapingService';

const router = Router();

router.post('/start', async (req, res) => {
    const { numeroProcesso } = req.body as { numeroProcesso?: string };

    if (!numeroProcesso || typeof numeroProcesso !== 'string') {
        return res.status(400).json({ message: 'numeroProcesso é obrigatório' });
    }

    try {
        const payload = await startScrapingSession(numeroProcesso);
        return res.json(payload);
    } catch (error) {
        console.error('[SCRAPING:START]', error);
        return res.status(500).json({
            message:
                (error instanceof Error && error.message) ||
                'Não foi possível iniciar o scraping. Tente novamente.',
        });
    }
});

router.post('/select', async (req, res) => {
    const { sessionId, optionId } = req.body as { sessionId?: string; optionId?: string };

    if (!sessionId || !optionId) {
        return res.status(400).json({ message: 'sessionId e optionId são obrigatórios' });
    }

    try {
        const result = await selectProcessInstance(sessionId, optionId);
        return res.json(result);
    } catch (error) {
        console.error('[SCRAPING:SELECT]', error);
        if (sessionId) {
            await cleanupSession(sessionId);
        }
        return res.status(500).json({
            message:
                (error instanceof Error && error.message) ||
                'Não foi possível selecionar a instância do processo. Inicie uma nova consulta.',
        });
    }
});

router.post('/captcha', async (req, res) => {
    const { sessionId, respostaCaptcha } = req.body as {
        sessionId?: string;
        respostaCaptcha?: string;
    };

    if (!sessionId || !respostaCaptcha) {
        return res
            .status(400)
            .json({ message: 'sessionId e respostaCaptcha são obrigatórios' });
    }

    try {
        const result = await submitCaptcha(sessionId, respostaCaptcha);
        if (result.status === 'needsCaptcha') {
            return res.status(400).json(result);
        }
        return res.json({
            contextId: result.contextId,
            insights: result.insights ?? null,
        });
    } catch (error) {
        console.error('[SCRAPING:CAPTCHA]', error);
        if (sessionId) {
            await cleanupSession(sessionId);
        }
        return res
            .status(500)
            .json({ message: 'Erro ao validar o captcha. Inicie uma nova consulta.' });
    }
});

export default router;


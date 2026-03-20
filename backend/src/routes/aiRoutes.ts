import { Router } from 'express';

import { buildContextBlock, runGemini } from '../service/geminiService';
import { getContextSnapshot } from '../service/scrapingService';

const router = Router();

router.post('/chat', async (req, res) => {
    const { mensagem, processo, dados, contextId } = req.body as {
        mensagem?: string;
        processo?: unknown;
        dados?: string[];
        contextId?: string;
    };

    if (!mensagem) {
        return res.status(400).json({ message: 'mensagem é obrigatória' });
    }

    let contextSource = null;
    if (contextId) {
        contextSource = getContextSnapshot(contextId);
        if (!contextSource) {
            console.warn('[AI] contextId inválido ou expirado:', contextId);
        }
    }

    const contextBlock = contextSource
        ? buildContextBlock(contextSource.dados, contextSource.processo)
        : buildContextBlock(Array.isArray(dados) ? dados : [], processo ?? null);
    const answer =
        (await runGemini(contextBlock, mensagem)) ??
        'Não consegui gerar informações adicionais no momento. Consulte um advogado para maiores esclarecimentos.';

    return res.json({ answer });
});

export default router;


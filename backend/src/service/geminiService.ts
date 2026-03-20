import { GoogleGenAI } from '@google/genai';

import { GEMINI_API_KEY, GEMINI_MODEL, GEMINI_SYSTEM_PROMPT } from '../config/env';

const geminiClient = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

if (!GEMINI_API_KEY) {
    console.warn('[GEMINI] GEMINI_API_KEY não configurada. Insights automáticos serão desabilitados.');
}

const geminiConfig = {
    temperature: 0.1,
};

const buildSystemInstruction = (context: string) =>
    `${GEMINI_SYSTEM_PROMPT}

Somente responda questões referentes ao contexto apresentado abaixo:

${context}

Ao final, sempre inclua a frase: "Resposta sem validade juridica, solicito para que confirme com o advogado de sua preferencia, MODELO DE IA TREINADA PELA JUS NEXT.".`;

export const buildContextBlock = (dados: string[], processo: unknown) =>
    [
        `Itens HTML coletados:\n${JSON.stringify(dados, null, 2)}`,
        `JSON oficial: ${JSON.stringify(processo ?? null, null, 2)}`,
    ].join('\n\n');

export const runGemini = async (context: string, question?: string): Promise<string | null> => {
    if (!geminiClient) {
        console.warn('[GEMINI] Cliente não configurado. Pulando geração de conteúdo.');
        return null;
    }

    try {
        const response = await geminiClient.models.generateContentStream({
            model: GEMINI_MODEL,
            config: {
                ...geminiConfig,
                systemInstruction: [{ text: buildSystemInstruction(context) }],
            },
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            text: [
                                'Contexto raspado do processo:',
                                context,
                                '',
                                'Pergunta do usuário:',
                                question ??
                                'Resuma o contexto acima listando fatos, movimentações e dúvidas que precisam de análise especializada.',
                            ].join('\n'),
                        },
                    ],
                },
            ],
        });

        let text = '';
        for await (const chunk of response) {
            if (chunk.text) {
                text += chunk.text;
            }
        }

        text = text.trim();

        if (!text) {
            console.warn('[GEMINI] Resposta vazia recebida. Contexto enviado:', context.slice(0, 500));
        }
        return text;
    } catch (error) {
        console.error('[GEMINI] Falha ao gerar conteúdo', error);
        console.error('[GEMINI] Contexto utilizado:', context.slice(0, 500));
        if (question) {
            console.error('[GEMINI] Pergunta do usuário:', question);
        }
        return null;
    }
};


const CNJ_REGEX = /^(\d{7})-(\d{2})\.(\d{4})\.(\d)\.(\d{2})\.(\d{4})$/;

export type CnjParts = {
    sequencial: string;
    digito: string;
    ano: string;
    justica: string;
    tribunal: string;
    origem: string;
    raw: string;
};

export const parseCnj = (numeroProcesso: string): CnjParts => {
    const normalized = numeroProcesso.replace(/\s+/g, '').trim();
    const match = CNJ_REGEX.exec(`${normalized}`);

    if (!match) {
        throw new Error(
            'Número do processo inválido. Utilize o formato NNNNNNN-DD.AAAA.J.TR.OOOO.'
        );
    }

    const [, sequencial = '', digito = '', ano = '', justica = '', tribunal = '', origem = ''] =
        match;

    return {
        sequencial,
        digito,
        ano,
        justica,
        tribunal,
        origem,
        raw: normalized,
    };
};

export const buildTribunalKey = (parts: CnjParts) => `${parts.justica}-${parts.tribunal}`;


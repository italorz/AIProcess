import { SELECTORS } from './env';
import { buildTribunalKey, parseCnj } from '../utils/cnj';

export type TribunalJustica =
    | 'ESTADUAL'
    | 'FEDERAL'
    | 'TRABALHO'
    | 'ELEITORAL'
    | 'MILITAR';

export type TribunalDefinition = {
    codigo: string;
    nome: string;
    justica: TribunalJustica;
    scraping?: {
        tipo: 'PJE';
        baseUrl: string;
        selectors: typeof SELECTORS;
    };
};

export type ScrapingSource = {
    tribunal: TribunalDefinition;
    baseUrl: string;
    selectors: typeof SELECTORS;
    processo: ReturnType<typeof parseCnj>;
};

const tribunais = new Map<string, TribunalDefinition>();

const registerMultipleJusticaCodes = (
    justicaCodes: string[],
    tr: string,
    definition: Omit<TribunalDefinition, 'codigo'> & { codigo: string }
) => {
    justicaCodes.forEach((justicaCode) => {
        tribunais.set(`${justicaCode}-${tr}`, definition);
    });
};

const registerPjeTrabalho = (tr: string, nome: string) => {
    const numeric = String(Number(tr));
    const definition: TribunalDefinition = {
        codigo: `TRT-${numeric}`,
        nome,
        justica: 'TRABALHO',
        scraping: {
            tipo: 'PJE',
            baseUrl: `https://pje.trt${numeric}.jus.br/consultaprocessual/`,
            selectors: SELECTORS,
        },
    };

    // Alguns sistemas utilizam '5' para Justiça do Trabalho (ex.: PJe), enquanto
    // documentações antigas mencionam '3'. Registramos ambos para garantir compatibilidade.
    registerMultipleJusticaCodes(['3', '5'], tr, definition);
};
const trabalhoTribunais: Record<string, string> = {
    '01': 'Tribunal Regional do Trabalho da 1ª Região',
    '02': 'Tribunal Regional do Trabalho da 2ª Região',
    '03': 'Tribunal Regional do Trabalho da 3ª Região',
    '04': 'Tribunal Regional do Trabalho da 4ª Região',
    '05': 'Tribunal Regional do Trabalho da 5ª Região',
    '06': 'Tribunal Regional do Trabalho da 6ª Região',
    '07': 'Tribunal Regional do Trabalho da 7ª Região',
    '08': 'Tribunal Regional do Trabalho da 8ª Região',
    '09': 'Tribunal Regional do Trabalho da 9ª Região',
    '10': 'Tribunal Regional do Trabalho da 10ª Região',
    '11': 'Tribunal Regional do Trabalho da 11ª Região',
    '12': 'Tribunal Regional do Trabalho da 12ª Região',
    '13': 'Tribunal Regional do Trabalho da 13ª Região',
    '14': 'Tribunal Regional do Trabalho da 14ª Região',
    '15': 'Tribunal Regional do Trabalho da 15ª Região',
    '16': 'Tribunal Regional do Trabalho da 16ª Região',
    '17': 'Tribunal Regional do Trabalho da 17ª Região',
    '18': 'Tribunal Regional do Trabalho da 18ª Região',
    '19': 'Tribunal Regional do Trabalho da 19ª Região',
    '20': 'Tribunal Regional do Trabalho da 20ª Região',
    '21': 'Tribunal Regional do Trabalho da 21ª Região',
    '22': 'Tribunal Regional do Trabalho da 22ª Região',
    '23': 'Tribunal Regional do Trabalho da 23ª Região',
    '24': 'Tribunal Regional do Trabalho da 24ª Região',
};

Object.entries(trabalhoTribunais).forEach(([tr, nome]) => registerPjeTrabalho(tr, nome));

const justicaCodigos: Record<TribunalJustica, string[]> = {
    ESTADUAL: ['1'],
    FEDERAL: ['2'],
    TRABALHO: ['3', '5'],
    ELEITORAL: ['4'],
    MILITAR: ['6'],
};

const registerPlaceholder = (
    justica: TribunalJustica,
    tr: string,
    codigo: string,
    nome: string
) => {
    registerMultipleJusticaCodes(justicaCodigos[justica], tr, {
        codigo,
        nome,
        justica,
    });
};

// Exemplos para outras justiças (sem scraping implementado)
registerPlaceholder('FEDERAL', '01', 'TRF-1', 'Tribunal Regional Federal da 1ª Região');
registerPlaceholder('FEDERAL', '02', 'TRF-2', 'Tribunal Regional Federal da 2ª Região');
registerPlaceholder('FEDERAL', '03', 'TRF-3', 'Tribunal Regional Federal da 3ª Região');
registerPlaceholder('FEDERAL', '04', 'TRF-4', 'Tribunal Regional Federal da 4ª Região');
registerPlaceholder('FEDERAL', '05', 'TRF-5', 'Tribunal Regional Federal da 5ª Região');
registerPlaceholder('FEDERAL', '06', 'TRF-6', 'Tribunal Regional Federal da 6ª Região');

export const resolveTribunalByProcess = (numeroProcesso: string) => {
    const parts = parseCnj(numeroProcesso);
    const key = buildTribunalKey(parts);
    const tribunal = tribunais.get(key);

    if (!tribunal) {
        throw new Error(
            `Tribunal não mapeado para o código ${parts.justica}/${parts.tribunal}.`
        );
    }

    return { tribunal, parts };
};

export const resolveScrapingSource = (numeroProcesso: string): ScrapingSource => {
    const { tribunal, parts } = resolveTribunalByProcess(numeroProcesso);

    if (!tribunal.scraping) {
        throw new Error(
            `Ainda não há integração automatizada para ${tribunal.codigo}.`
        );
    }

    return {
        tribunal,
        baseUrl: tribunal.scraping.baseUrl,
        selectors: tribunal.scraping.selectors,
        processo: parts,
    };
};


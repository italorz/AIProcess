import { randomUUID } from 'crypto';

import puppeteer, { Browser, HTTPResponse, LaunchOptions, Page } from 'puppeteer';

import { ACCEPT_LANGUAGE, USER_AGENT } from '../config/env';
import { resolveScrapingSource, ScrapingSource } from '../config/tribunais';
import { buildContextBlock, runGemini } from './geminiService';

type SessionData = {
    browser: Browser;
    page: Page;
    source: ScrapingSource;
};

export type StartScrapingNeedsCaptcha = {
    status: 'needsCaptcha';
    sessionId: string;
    captchaBase64: string;
    tribunal: ScrapingSource['tribunal'];
};

export type StartScrapingNeedsSelection = {
    status: 'needsSelection';
    sessionId: string;
    tribunal: ScrapingSource['tribunal'];
    options: Array<{ id: string; label: string }>;
};

export type StartScrapingResponse = StartScrapingNeedsCaptcha | StartScrapingNeedsSelection;

export type CaptchaSuccessPayload = {
    status: 'success';
    contextId: string;
    insights?: string | null;
};

export type CaptchaNeedsPayload = {
    status: 'needsCaptcha';
    captchaBase64: string;
    message: string;
};

export type CaptchaResponse = CaptchaSuccessPayload | CaptchaNeedsPayload;

export type ContextSnapshot = {
    dados: string[];
    processo: unknown | null;
    tribunalId: string;
    createdAt: number;
};

const sessions = new Map<string, SessionData>();
const contexts = new Map<string, ContextSnapshot>();

const GEMINI_FALLBACK =
    'Resposta sem validade juridica, solicito para que confirme com o advogado de sua preferencia, MODELO DE IA TREINADA PELA JUS NEXT.';

const buildLaunchOptions = (): LaunchOptions => {
    const commonArgs = [
        '--disable-setuid-sandbox',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1366,768',
    ];

    const executablePath =
        process.env.CHROME_EXECUTABLE_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;

    const launchOptions: LaunchOptions = {
        headless: 'shell',
        args: commonArgs,
    };

    if (executablePath && executablePath.length > 0) {
        launchOptions.executablePath = executablePath;
    }

    return launchOptions;
};

const configurePage = async (page: Page) => {
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 1366, height: 768 });
    await page.setExtraHTTPHeaders({
        'accept-language': ACCEPT_LANGUAGE,
    });

    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        // @ts-expect-error - injetando objeto para parecer um Chrome real
        window.chrome = { runtime: {} };

        if (navigator.permissions && navigator.permissions.query) {
            const originalQuery = navigator.permissions.query.bind(navigator.permissions);

            navigator.permissions.query = (parameters) =>
                parameters.name === 'notifications'
                    ? Promise.resolve({ state: 'denied' } as PermissionStatus)
                    : originalQuery(parameters);
        }
    });
};

const isProcessDetailUrl = (url: string) => {
    if (!url.includes('/pje-consulta-api/api/processos/')) {
        return false;
    }

    try {
        const parsed = new URL(url);
        return /\/pje-consulta-api\/api\/processos\/\d+$/.test(parsed.pathname);
    } catch {
        return false;
    }
};

const waitForCaptchaBase64 = async (page: Page, source: ScrapingSource) => {
    await page.waitForSelector(source.selectors.captchaImage, { timeout: 20000 });
    await page.waitForFunction(
        (selector) => {
            const img = document.querySelector<HTMLImageElement>(selector);
            return Boolean(img && img.src && img.src.startsWith('data:image'));
        },
        { timeout: 20000 },
        source.selectors.captchaImage
    );

    const captchaBase64 = await page.$eval(source.selectors.captchaImage, (img) => img.getAttribute('src') || '');

    if (!captchaBase64 || !captchaBase64.includes('base64')) {
        console.error('[SCRAPING] Captcha src inválido:', captchaBase64);
        throw new Error('Captcha não encontrado ou inválido');
    }

    return captchaBase64;
};

const getProcessSelectionOptions = async (page: Page) => {
    return await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>('#painel-escolha-processo');
        if (!panel) {
            return null;
        }

        const style = window.getComputedStyle(panel);
        if (style.display === 'none' || style.visibility === 'hidden') {
            return null;
        }

        const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>('button.selecao-processo'));
        if (buttons.length === 0) {
            return null;
        }

        return buttons.map((button, index) => {
            const label =
                (button.textContent || '')
                    .replace(/\s+/g, ' ')
                    .trim() || `Opção ${index + 1}`;
            return { id: String(index + 1), label };
        });
    });
};

const waitForPreCaptchaState = async (page: Page, source: ScrapingSource) => {
    const selectionButtonSelector = '#painel-escolha-processo button.selecao-processo';

    // O PJe pode renderizar primeiro a tela de seleção (1º/2º grau) OU ir direto ao captcha.
    // Se verificarmos cedo demais, ainda não existe nenhum dos dois e acabamos dando timeout no captcha.
    await Promise.race([
        page.waitForSelector(selectionButtonSelector, { timeout: 20000 }).catch(() => null),
        page.waitForSelector(source.selectors.captchaImage, { timeout: 20000 }).catch(() => null),
    ]);

    const selectionOptions = await getProcessSelectionOptions(page);
    if (selectionOptions && selectionOptions.length > 0) {
        return { kind: 'selection' as const, options: selectionOptions };
    }

    const captchaBase64 = await waitForCaptchaBase64(page, source);
    return { kind: 'captcha' as const, captchaBase64 };
};

const buildPreferSecondInstanceUrl = (source: ScrapingSource, numeroProcesso: string) => {
    // Ex.: 0010756-48.2018.5.15.0114 -> 00107564820185150114
    const digitsOnly = numeroProcesso.replace(/\D/g, '');
    if (!digitsOnly) {
        return null;
    }
    // Ex.: https://pje.trt15.jus.br/consultaprocessual/detalhe-processo/<digits>/2
    return new URL(`detalhe-processo/${digitsOnly}/2`, source.baseUrl).toString();
};

export const cleanupSession = async (sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session) {
        return;
    }

    sessions.delete(sessionId);
    await session.browser.close().catch(() => undefined);
};

export const cleanupAllSessions = async () => {
    await Promise.all(Array.from(sessions.keys()).map(async (sessionId) => cleanupSession(sessionId)));
};

export const startScrapingSession = async (numeroProcesso: string): Promise<StartScrapingResponse> => {
    const source = resolveScrapingSource(numeroProcesso);
    const browser = await puppeteer.launch(buildLaunchOptions());

    try {
        const page = await browser.newPage();
        await configurePage(page);
        page.setDefaultTimeout(45000);

        await page.goto(source.baseUrl, { waitUntil: 'networkidle2' });
        await page.waitForSelector(source.selectors.numeroProcesso);
        await page.click(source.selectors.numeroProcesso, { clickCount: 3 });
        await page.type(source.selectors.numeroProcesso, numeroProcesso, { delay: 40 });

        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            page.click(source.selectors.pesquisar),
        ]);

        const sessionId = randomUUID();

        sessions.set(sessionId, { browser, page, source });

        const preCaptcha = await waitForPreCaptchaState(page, source);
        if (preCaptcha.kind === 'selection') {
            // Padrão: tentar 2º grau (/2). Se não existir, o PJe geralmente redireciona para /1.
            const preferUrl = buildPreferSecondInstanceUrl(source, numeroProcesso);
            if (preferUrl) {
                try {
                    await page.goto(preferUrl, { waitUntil: 'networkidle2' });
                    const captchaBase64 = await waitForCaptchaBase64(page, source);
                    console.log(
                        '[SCRAPING] Sessão iniciada (prefer /2, captcha) com ID:',
                        sessionId,
                        'para',
                        source.tribunal.codigo
                    );
                    return {
                        status: 'needsCaptcha',
                        sessionId,
                        captchaBase64,
                        tribunal: source.tribunal,
                    };
                } catch (error) {
                    console.warn('[SCRAPING] Falha ao abrir instância /2 automaticamente.', error);
                    // segue para fallback de seleção manual
                }
            }

            console.log(
                '[SCRAPING] Sessão iniciada (precisa seleção) com ID:',
                sessionId,
                'para',
                source.tribunal.codigo
            );
            return {
                status: 'needsSelection',
                sessionId,
                tribunal: source.tribunal,
                options: preCaptcha.options,
            };
        }

        console.log(
            '[SCRAPING] Sessão iniciada (captcha) com ID:',
            sessionId,
            'para',
            source.tribunal.codigo
        );
        return {
            status: 'needsCaptcha',
            sessionId,
            captchaBase64: preCaptcha.captchaBase64,
            tribunal: source.tribunal,
        };
    } catch (error) {
        await browser.close().catch(() => undefined);
        throw error;
    }
};

export const selectProcessInstance = async (
    sessionId: string,
    optionId: string
): Promise<StartScrapingNeedsCaptcha> => {
    const session = sessions.get(sessionId);
    if (!session) {
        throw new Error('Sessão não encontrada ou expirada');
    }

    const optionIndex = Number(optionId);
    if (!Number.isFinite(optionIndex) || optionIndex < 1) {
        throw new Error('Opção inválida. Informe um número a partir de 1.');
    }

    const { page, source } = session;
    const buttons = await page.$$('button.selecao-processo');
    if (buttons.length === 0) {
        throw new Error('Tela de seleção não encontrada. Inicie uma nova consulta.');
    }

    if (optionIndex > buttons.length) {
        throw new Error(`Opção inválida. Selecione entre 1 e ${buttons.length}.`);
    }

    const button = buttons[optionIndex - 1];
    if (!button) {
        throw new Error(`Opção inválida. Selecione entre 1 e ${buttons.length}.`);
    }

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null),
        button.click(),
    ]);

    const captchaBase64 = await waitForCaptchaBase64(page, source);
    return { status: 'needsCaptcha', sessionId, captchaBase64, tribunal: source.tribunal };
};

export const submitCaptcha = async (
    sessionId: string,
    respostaCaptcha: string
): Promise<CaptchaResponse> => {
    const session = sessions.get(sessionId);

    if (!session) {
        throw new Error('Sessão não encontrada ou expirada');
    }

    const { page, source } = session;

    await page.waitForSelector(source.selectors.captchaInput, { timeout: 15000 });

    await page.evaluate((selector) => {
        const input = document.querySelector(selector) as HTMLInputElement | null;
        if (input) {
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }, source.selectors.captchaInput);

    await page.type(source.selectors.captchaInput, respostaCaptcha, { delay: 35 });

    const processDetailPromise = page
        .waitForResponse((response) => isProcessDetailUrl(response.url()), {
            timeout: 30000,
        })
        .catch(() => null);

    const processListPromise = page
        .waitForResponse((response) => {
            const url = response.url();
            return url.includes('/pje-consulta-api/api/processos?') && !isProcessDetailUrl(url);
        }, { timeout: 25000 })
        .catch(() => null);

    const navigation = page
        .waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
        .catch(() => null);

    await Promise.all([navigation, page.click(source.selectors.captchaButton)]);

    const currentUrl = page.url();

    if (currentUrl.includes('/captcha/')) {
        await page.waitForSelector(source.selectors.captchaImage, { timeout: 15000 });
        const novoCaptcha = await page.$eval(
            source.selectors.captchaImage,
            (img) => img.getAttribute('src') || ''
        );

        if (!novoCaptcha) {
            throw new Error('Falha ao obter novo captcha');
        }

        return {
            status: 'needsCaptcha',
            captchaBase64: novoCaptcha,
            message: 'Captcha inválido. Tente novamente.',
        };
    }

    const detailResponse = await processDetailPromise;
    const listResponse = detailResponse ? null : await processListPromise;

    const parseJsonSafe = async (response: HTTPResponse | null) => {
        if (!response) {
            return null;
        }
        try {
            return await response.json();
        } catch (error) {
            console.warn('[SCRAPING] Falha ao interpretar resposta da API do processo', error);
            return null;
        }
    };

    const processoJson: unknown =
        (await parseJsonSafe(detailResponse)) ?? (await parseJsonSafe(listResponse));

    const dados = await page.$$eval('li', (elements) =>
        elements
            .map((element) => element.textContent?.trim())
            .filter((value): value is string => Boolean(value))
    );

    const contextBlock = buildContextBlock(dados, processoJson);
    console.log('[GEMINI] Enviando prompt com', {
        quantidadeItens: dados.length,
        temProcesso: Boolean(processoJson),
        tribunal: session.source.tribunal.codigo,
    });
    const insights = (await runGemini(contextBlock)) ?? GEMINI_FALLBACK;
    if (!insights) {
        console.warn('[GEMINI] Utilizando fallback de insights (retorno nulo/vazio).');
    }

    await cleanupSession(sessionId);

    const contextId = randomUUID();
    contexts.set(contextId, {
        dados,
        processo: processoJson ?? null,
        tribunalId: session.source.tribunal.codigo,
        createdAt: Date.now(),
    });

    return {
        status: 'success',
        contextId,
        insights,
    };
};

export const getContextSnapshot = (contextId: string) => contexts.get(contextId) ?? null;

export const getActiveSessionsCount = () => sessions.size;


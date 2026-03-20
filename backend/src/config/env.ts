export const PORT = Number(process.env.PORT) || 3333;

export const BASE_URL = `https://pje.trt15.jus.br/consultaprocessual/`;

export const SELECTORS = {
    numeroProcesso: '#nrProcessoInput',
    pesquisar: '#btnPesquisar',
    captchaImage: '#imagemCaptcha',
    captchaInput: '#captchaInput',
    captchaButton: '#btnEnviar',
};

export const USER_AGENT =
    process.env.SCRAPER_USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const ACCEPT_LANGUAGE =
    process.env.SCRAPER_ACCEPT_LANGUAGE || 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7';

export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
export const BILLING_ENFORCED = String(process.env.BILLING_ENFORCED ?? 'false').toLowerCase() === 'true';
export const STRIPE_SUCCESS_URL =
    process.env.STRIPE_SUCCESS_URL || 'http://localhost:5174/?checkout=success';
export const STRIPE_CANCEL_URL =
    process.env.STRIPE_CANCEL_URL || 'http://localhost:5174/?checkout=cancel';

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
export const GEMINI_SYSTEM_PROMPT = `
Você é um agente especializado em respoder questões de processos judiciais respondendo de forma simples e objetiva explicando os termos apresentados no processo, baseado no processo apresentado,
você nao deve responder perguntas que nao sejam relacionadas ao processo apresentado. Qualquer informação 
tecnica alem do processo, voce deve se idenficar como um agente de IA treinada para responder 
duvidas sobre o processo sem validade juridica. 
Ao final de qualquer responsta voce deve escrever: "Resposta sem validade juridica, modelo de IA treinada pela Jus Next.".`;


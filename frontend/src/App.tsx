import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import './App.css';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  captchaImage?: string;
};

type CaptchaSuccess = {
  contextId: string;
  insights?: string | null;
};

type CaptchaError = {
  message?: string;
  captchaBase64?: string;
  status?: string;
};

type SelectionOption = {
  id: string;
  label: string;
};

type ClientStartResponse =
  | {
    status: 'needsCaptcha';
    sessionId: string;
    captchaBase64: string;
    numeroProcesso: string;
  }
  | {
    status: 'needsSelection';
    sessionId: string;
    options: SelectionOption[];
    numeroProcesso: string;
  };

type SelectionResponse = {
  status: 'needsCaptcha';
  sessionId: string;
  captchaBase64: string;
};

type Stage = 'locked' | 'selection' | 'captcha' | 'ai';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

const createMessageId = () => Math.random().toString(36).slice(2, 11);
const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);

  if (digits.length === 0) {
    return '';
  }

  if (digits.length <= 2) {
    return `(${digits}`;
  }

  if (digits.length <= 7) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const initialMessages: ChatMessage[] = [
  {
    id: createMessageId(),
    role: 'assistant',
    text: 'Informe o seu telefone para localizar o processo vinculado e iniciar a consulta.',
  },
];

function App() {
  const [stage, setStage] = useState<Stage>('locked');
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [phone, setPhone] = useState('');
  const [showPhoneModal, setShowPhoneModal] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [contextId, setContextId] = useState<string | null>(null);
  const [processNumber, setProcessNumber] = useState<string | null>(null);
  const [selectionOptions, setSelectionOptions] = useState<SelectionOption[]>([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectionOptions]);

  const appendMessage = (message: Omit<ChatMessage, 'id'>) => {
    setMessages((prev) => [...prev, { ...message, id: createMessageId() }]);
  };

  const resetFlow = () => {
    setStage('locked');
    setMessages(initialMessages);
    setPhone('');
    setShowPhoneModal(true);
    setInputValue('');
    setSessionId(null);
    setContextId(null);
    setProcessNumber(null);
    setSelectionOptions([]);
    setLoading(false);
  };

  const handlePhoneSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!phone.trim()) {
      appendMessage({
        role: 'assistant',
        text: 'Informe um telefone para localizar o processo vinculado.',
      });
      return;
    }

    setLoading(true);
    setSessionId(null);
    setContextId(null);
    setSelectionOptions([]);

    try {
      const response = await fetch(`${API_URL}/client/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone: phone.trim() }),
      });

      const payload = (await response.json()) as ClientStartResponse & { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? 'Não foi possível localizar o processo deste telefone.');
      }

      setProcessNumber(payload.numeroProcesso);
      setSessionId(payload.sessionId);

      if (payload.status === 'needsSelection') {
        setStage('selection');
        setShowPhoneModal(false);
        setSelectionOptions(payload.options);
        appendMessage({
          role: 'assistant',
          text: 'Encontrei o processo. Escolha abaixo a instância para continuar a consulta.',
        });
        return;
      }

      setStage('captcha');
      setShowPhoneModal(false);
      appendMessage({
        role: 'assistant',
        text: 'Processo localizado. Resolva o captcha exibido abaixo para prosseguir.',
        captchaImage: payload.captchaBase64,
      });
    } catch (error) {
      appendMessage({
        role: 'assistant',
        text:
          error instanceof Error
            ? error.message
            : 'Erro inesperado ao localizar o processo.',
      });
      setStage('locked');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = async (optionId: string) => {
    if (!sessionId) {
      appendMessage({
        role: 'assistant',
        text: 'A sessão expirou. Informe seu telefone novamente.',
      });
      resetFlow();
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/scraping/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, optionId }),
      });

      const payload = (await response.json()) as SelectionResponse & { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? 'Não foi possível selecionar esta instância.');
      }

      setStage('captcha');
      setSelectionOptions([]);
      appendMessage({
        role: 'assistant',
        text: 'Instância selecionada. Resolva o captcha para consultar o processo.',
        captchaImage: payload.captchaBase64,
      });
    } catch (error) {
      appendMessage({
        role: 'assistant',
        text:
          error instanceof Error
            ? error.message
            : 'Erro inesperado ao selecionar a instância.',
      });
      resetFlow();
    } finally {
      setLoading(false);
    }
  };

  const submitCaptcha = async (captchaAnswer: string) => {
    if (!sessionId) {
      appendMessage({
        role: 'assistant',
        text: 'A sessão expirou. Informe seu telefone novamente.',
      });
      resetFlow();
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/scraping/captcha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, respostaCaptcha: captchaAnswer }),
      });

      const payload = (await response.json()) as CaptchaSuccess | CaptchaError;

      if (!response.ok) {
        if (response.status === 400 && (payload as CaptchaError).status === 'needsCaptcha') {
          appendMessage({
            role: 'assistant',
            text: (payload as CaptchaError).message ?? 'Captcha inválido. Tente novamente.',
            captchaImage: (payload as CaptchaError).captchaBase64,
          });
          return;
        }

        throw new Error(
          (payload as CaptchaError).message ?? 'Não foi possível validar o captcha.'
        );
      }

      const successPayload = payload as CaptchaSuccess;
      setStage('ai');
      setContextId(successPayload.contextId);
      setSessionId(null);

      appendMessage({
        role: 'assistant',
        text:
          successPayload.insights ??
          'Consulta concluída. Agora você pode fazer perguntas sobre o processo.',
      });
    } catch (error) {
      appendMessage({
        role: 'assistant',
        text:
          error instanceof Error
            ? error.message
            : 'Erro inesperado ao validar o captcha.',
      });
      resetFlow();
    } finally {
      setLoading(false);
    }
  };

  const submitQuestion = async (question: string) => {
    if (!contextId) {
      appendMessage({
        role: 'assistant',
        text: 'O contexto da consulta não está mais disponível. Reinicie pelo telefone.',
      });
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensagem: question,
          contextId,
        }),
      });

      const payload = (await response.json()) as { answer?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? 'Não foi possível consultar a IA agora.');
      }

      appendMessage({
        role: 'assistant',
        text:
          payload.answer ??
          'Não consegui gerar uma resposta agora. Tente reformular a pergunta.',
      });
    } catch (error) {
      appendMessage({
        role: 'assistant',
        text:
          error instanceof Error
            ? error.message
            : 'Erro inesperado ao consultar a IA.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChatSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inputValue.trim() || stage === 'locked' || stage === 'selection') {
      return;
    }

    const content = inputValue.trim();
    appendMessage({ role: 'user', text: content });
    setInputValue('');

    if (stage === 'captcha') {
      await submitCaptcha(content);
      return;
    }

    await submitQuestion(content);
  };

  const placeholder =
    stage === 'captcha'
      ? 'Digite exatamente o texto do captcha'
      : stage === 'ai'
        ? 'Faça uma pergunta sobre o processo'
        : 'A consulta começa pelo telefone';

  return (
    <div className="chat-page">
      <header className="hero">
        <h1>Jus Next</h1>
        <small>(beta)</small>
        {/* <a className="lawyer-link" href={LAWYER_APP_URL}>
          Sou advogado
        </a> */}
      </header>

      {showPhoneModal && (
        <div className="modal-overlay">
          <section className="lookup-card lookup-modal">
            <div>
              <h2>Entrar com telefone</h2>
              <p>Digite somente o número de telefone cadastrado pelo advogado.</p>
            </div>
            <form className="lookup-form" onSubmit={handlePhoneSubmit}>
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(formatPhone(event.target.value))}
                placeholder="(14) 99999-9999"
                disabled={loading}
                autoFocus
              />
              <button type="submit" disabled={loading || !phone.trim()}>
                {loading && stage === 'locked' ? 'Localizando...' : 'Consultar processo'}
              </button>
            </form>
          </section>
        </div>
      )}

      <section className="chat-window">
        <div className="chat-toolbar">
          <div>
            <strong>Status:</strong>{' '}
            {stage === 'locked'
              ? 'aguardando telefone'
              : stage === 'selection'
                ? 'aguardando seleção de instância'
                : stage === 'captcha'
                  ? 'aguardando captcha'
                  : 'chat com IA liberado'}
          </div>
          <button type="button" className="ghost-button" onClick={resetFlow}>
            Reiniciar
          </button>
        </div>

        {processNumber && (
          <div className="process-banner">
            Processo vinculado: <strong>{processNumber}</strong>
          </div>
        )}

        <div className="message-list">
          {messages.map((message) => (
            <div className={`message ${message.role}`} key={message.id}>
              <div className="bubble">
                <div className="markdown">
                  <ReactMarkdown>{message.text}</ReactMarkdown>
                </div>
                {message.captchaImage && (
                  <img
                    src={message.captchaImage}
                    alt="Captcha do processo"
                    className="captcha-image"
                  />
                )}
              </div>
            </div>
          ))}

          {stage === 'selection' && selectionOptions.length > 0 && (
            <div className="selection-panel">
              <p>Escolha uma opção para seguir:</p>
              <div className="selection-grid">
                {selectionOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="selection-button"
                    onClick={() => void handleSelectOption(option.id)}
                    disabled={loading}
                  >
                    <span>Opção {option.id}</span>
                    <strong>{option.label}</strong>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <form className="chat-input" onSubmit={handleChatSubmit}>
          <input
            type="text"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            disabled={loading || stage === 'locked' || stage === 'selection'}
          />
          <button
            type="submit"
            disabled={
              loading ||
              !inputValue.trim() ||
              stage === 'locked' ||
              stage === 'selection'
            }
          >
            {loading && stage !== 'locked' ? 'Enviando...' : 'Enviar'}
          </button>
        </form>
      </section>
    </div>
  );
}

export default App;

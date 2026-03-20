import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import './App.css'
import { supabase } from './lib/supabase'

type BillingPlan = {
  code: string
  name: string
  clientLimit: number
  monthlyPriceCents: number
  stripePriceId: string | null
}

type LawyerProfile = {
  id: string
  email: string
  fullName: string | null
  stripeCustomerId: string | null
  currentPlanCode: string
  planStatus: string
  activeClientLimit: number
}

type LawyerSubscription = {
  id: string
  lawyerId: string
  stripeSubscriptionId: string
  stripeCustomerId: string | null
  stripePriceId: string | null
  planCode: string
  status: string
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

type LawyerClient = {
  id: string
  lawyerId: string
  phone: string
  phoneNormalized: string
  processNumber: string
  createdAt: string
  updatedAt: string
}

type DashboardResponse = {
  profile: LawyerProfile
  clientsCount: number
  subscription: LawyerSubscription | null
  plans: BillingPlan[]
  clients: LawyerClient[]
  billingEnabled?: boolean
}

type ClientFormState = {
  id: string | null
  telefone: string
  numeroProcesso: string
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333'

const initialClientForm: ClientFormState = {
  id: null,
  telefone: '',
  numeroProcesso: '',
}

const authModeLabel = {
  signIn: 'Entrar',
  signUp: 'Criar conta',
} as const

async function getAccessToken(session: Session | null) {
  return session?.access_token ?? null
}

async function requestJson<T>(
  path: string,
  session: Session,
  init?: RequestInit,
): Promise<T> {
  const accessToken = await getAccessToken(session)
  if (!accessToken) {
    throw new Error('Sessão do Supabase indisponível.')
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  })

  if (response.status === 204) {
    return undefined as T
  }

  const payload = (await response.json()) as T & { message?: string; checkoutUrl?: string }
  if (!response.ok) {
    throw new Error(payload.message ?? 'A requisição falhou.')
  }

  return payload
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authMode, setAuthMode] = useState<'signIn' | 'signUp'>('signIn')
  const [authLoading, setAuthLoading] = useState(false)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [clientSaving, setClientSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null)
  const [authForm, setAuthForm] = useState({
    fullName: '',
    email: '',
    password: '',
  })
  const [clientForm, setClientForm] = useState<ClientFormState>(initialClientForm)

  useEffect(() => {
    const applyCheckoutFeedback = () => {
      const params = new URLSearchParams(window.location.search)
      const checkout = params.get('checkout')
      if (checkout === 'success') {
        setSuccessMessage('Assinatura concluída com sucesso. Atualizando o painel...')
      }
      if (checkout === 'cancel') {
        setErrorMessage('O checkout foi cancelado antes da conclusão do pagamento.')
      }
      if (checkout) {
        window.history.replaceState({}, document.title, window.location.pathname)
      }
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      applyCheckoutFeedback()
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const currentPlan = useMemo(() => {
    if (!dashboard) {
      return null
    }
    return (
      dashboard.plans.find((plan) => plan.code === dashboard.profile.currentPlanCode) ?? null
    )
  }, [dashboard])

  const loadDashboard = async (activeSession: Session) => {
    setDashboardLoading(true)
    setErrorMessage(null)

    try {
      const payload = await requestJson<DashboardResponse>('/lawyer/dashboard', activeSession)
      setDashboard(payload)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Não foi possível carregar o dashboard.',
      )
    } finally {
      setDashboardLoading(false)
    }
  }

  useEffect(() => {
    if (!session) {
      setDashboard(null)
      return
    }

    void loadDashboard(session)
  }, [session])

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthLoading(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      if (authMode === 'signIn') {
        const { error } = await supabase.auth.signInWithPassword({
          email: authForm.email,
          password: authForm.password,
        })

        if (error) {
          throw error
        }

        setSuccessMessage('Login realizado com sucesso.')
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: authForm.email,
          password: authForm.password,
          options: {
            data: {
              full_name: authForm.fullName,
            },
          },
        })

        if (error) {
          throw error
        }

        if (data.session) {
          setSuccessMessage('Conta criada com sucesso.')
        } else {
          setSuccessMessage(
            'Conta criada. Se a confirmação por e-mail estiver habilitada, valide seu cadastro antes de entrar.',
          )
          setAuthMode('signIn')
        }
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Não foi possível autenticar agora.',
      )
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setDashboard(null)
    setClientForm(initialClientForm)
    setSuccessMessage('Sessão encerrada.')
  }

  const handleClientSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!session) {
      return
    }

    setClientSaving(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      if (clientForm.id) {
        await requestJson<{ client: LawyerClient }>(`/lawyer/clients/${clientForm.id}`, session, {
          method: 'PATCH',
          body: JSON.stringify({
            telefone: clientForm.telefone,
            numeroProcesso: clientForm.numeroProcesso,
          }),
        })

        setSuccessMessage('Cliente atualizado com sucesso.')
      } else {
        const response = await fetch(`${API_URL}/lawyer/clients`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            telefone: clientForm.telefone,
            numeroProcesso: clientForm.numeroProcesso,
          }),
        })

        const payload = (await response.json()) as {
          client?: LawyerClient
          message?: string
          checkoutUrl?: string
          requiresCheckout?: boolean
        }

        if (response.status === 402 && payload.requiresCheckout && payload.checkoutUrl) {
          window.location.href = payload.checkoutUrl
          return
        }

        if (!response.ok) {
          throw new Error(payload.message ?? 'Não foi possível salvar o cliente.')
        }

        setSuccessMessage('Cliente cadastrado com sucesso.')
      }

      setClientForm(initialClientForm)
      await loadDashboard(session)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Não foi possível salvar o cliente.',
      )
    } finally {
      setClientSaving(false)
    }
  }

  const handleEditClient = (client: LawyerClient) => {
    setClientForm({
      id: client.id,
      telefone: client.phone,
      numeroProcesso: client.processNumber,
    })
    setSuccessMessage(null)
    setErrorMessage(null)
  }

  const handleDeleteClient = async (clientId: string) => {
    if (!session) {
      return
    }

    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      await requestJson<void>(`/lawyer/clients/${clientId}`, session, {
        method: 'DELETE',
      })
      setSuccessMessage('Cliente removido com sucesso.')
      await loadDashboard(session)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Não foi possível excluir o cliente.',
      )
    }
  }

  return (
    <div className="lawyer-page">
      <header className="hero-card">
        <div>
          <span className="badge">Area do advogado</span>
          <h1>Jus Next Advogado</h1>
          <p>Cadastre clientes por telefone, vincule processos e valide o fluxo principal.</p>
        </div>
        {session && (
          <button type="button" className="ghost-button" onClick={() => void handleLogout()}>
            Sair
          </button>
        )}
      </header>

      {!session ? (
        <section className="auth-card">
          <div className="auth-toggle">
            {(['signIn', 'signUp'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={authMode === mode ? 'tab-button active' : 'tab-button'}
                onClick={() => setAuthMode(mode)}
              >
                {authModeLabel[mode]}
              </button>
            ))}
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === 'signUp' && (
              <label>
                Nome completo
                <input
                  type="text"
                  value={authForm.fullName}
                  onChange={(event) =>
                    setAuthForm((prev) => ({ ...prev, fullName: event.target.value }))
                  }
                  required
                />
              </label>
            )}

            <label>
              E-mail
              <input
                type="email"
                value={authForm.email}
                onChange={(event) =>
                  setAuthForm((prev) => ({ ...prev, email: event.target.value }))
                }
                required
              />
            </label>

            <label>
              Senha
              <input
                type="password"
                value={authForm.password}
                onChange={(event) =>
                  setAuthForm((prev) => ({ ...prev, password: event.target.value }))
                }
                required
                minLength={6}
              />
            </label>

            <button type="submit" disabled={authLoading}>
              {authLoading ? 'Processando...' : authModeLabel[authMode]}
            </button>
          </form>
        </section>
      ) : (
        <>
          {errorMessage && <div className="feedback error">{errorMessage}</div>}
          {successMessage && <div className="feedback success">{successMessage}</div>}

          <section className="dashboard-grid">
            <article className="info-card">
              <span className="info-label">Modo atual</span>
              <strong>
                {dashboard?.billingEnabled ? currentPlan?.name ?? 'Sem plano ativo' : 'Validacao funcional'}
              </strong>
              <p>
                Status: {dashboard?.profile.planStatus ?? 'indisponível'} | limite ativo:{' '}
                {dashboard?.profile.activeClientLimit ?? 0} cliente(s)
              </p>
            </article>

            <article className="info-card">
              <span className="info-label">Clientes cadastrados</span>
              <strong>{dashboard?.clientsCount ?? 0}</strong>
              <p>
                {dashboard?.billingEnabled
                  ? 'Ao exceder a faixa atual, o backend faz o upgrade automático.'
                  : 'A cobranca esta pausada temporariamente para priorizar a validacao do fluxo.'}
              </p>
            </article>

            <article className="info-card">
              <span className="info-label">Conta</span>
              <strong>{dashboard?.profile.fullName || session.user.email}</strong>
              <p>{dashboard?.profile.email ?? session.user.email ?? 'Sem e-mail'}</p>
            </article>
          </section>

          <section className="content-grid">
            <article className="panel">
              <div className="panel-header">
                <h2>Clientes</h2>
                <p>Cadastre o telefone do cliente e o número do processo associado.</p>
              </div>

              <form className="client-form" onSubmit={handleClientSubmit}>
                <label>
                  Telefone
                  <input
                    type="tel"
                    value={clientForm.telefone}
                    onChange={(event) =>
                      setClientForm((prev) => ({ ...prev, telefone: event.target.value }))
                    }
                    required
                  />
                </label>

                <label>
                  Número do processo
                  <input
                    type="text"
                    value={clientForm.numeroProcesso}
                    onChange={(event) =>
                      setClientForm((prev) => ({
                        ...prev,
                        numeroProcesso: event.target.value,
                      }))
                    }
                    required
                  />
                </label>

                <div className="form-actions">
                  {clientForm.id && (
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setClientForm(initialClientForm)}
                    >
                      Cancelar edição
                    </button>
                  )}
                  <button type="submit" disabled={clientSaving}>
                    {clientSaving
                      ? 'Salvando...'
                      : clientForm.id
                        ? 'Atualizar cliente'
                        : 'Cadastrar cliente'}
                  </button>
                </div>
              </form>

              <div className="client-list">
                {(dashboard?.clients ?? []).length === 0 && !dashboardLoading && (
                  <p className="empty-state">Nenhum cliente cadastrado ainda.</p>
                )}

                {(dashboard?.clients ?? []).map((client) => (
                  <div className="client-item" key={client.id}>
                    <div>
                      <strong>{client.phone}</strong>
                      <p>{client.processNumber}</p>
                    </div>
                    <div className="client-actions">
                      <button type="button" className="ghost-button" onClick={() => handleEditClient(client)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => void handleDeleteClient(client.id)}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <h2>Cobranca</h2>
                <p>A implementacao de valores foi pausada por enquanto para focar em funcionalidade e validacao.</p>
              </div>

              <div className="validation-note">
                <strong>Modo validacao</strong>
                <p>O advogado pode se cadastrar, entrar, cadastrar clientes, editar e excluir vinculos normalmente.</p>
                <p>Os valores e o checkout do Stripe permanecem preparados no backend, mas sem exigir pagamento neste momento.</p>
                {(dashboard?.plans ?? [])
                  .filter((plan) => plan.code !== 'free')
                  .map((plan) => (
                    <p key={plan.code}>
                      {plan.name}: até {plan.clientLimit} cliente(s)
                    </p>
                  ))}
              </div>
            </article>
          </section>
        </>
      )}
    </div>
  )
}

export default App


import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Bot,
  MessageCircle,
  RotateCw,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import axios from 'axios'
import { api } from '../services/api'
import './CyberFusionChatbot.css'

type Message = {
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
}

type RetryRequest = {
  message: string
  history: Message[]
}

type ChatResponse = {
  reply: string
}

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  content:
    "Hello! I'm CyberFusion AI Assistant. Ask me anything about cybersecurity, digital forensics, phishing, malware, or using CyberFusion.",
}

const SUGGESTIONS = [
  'What is phishing?',
  'How can I detect malware?',
  'Explain SHA-256 hashing.',
]

function getChatError(error: unknown): {
  message: string
  retryable: boolean
} {
  if (!axios.isAxiosError<{ detail?: unknown }>(error)) {
    if (error instanceof Error && error.message.startsWith('Unable to connect')) {
      return {
        message:
          'Cannot reach the CyberFusion server. Check your connection and retry.',
        retryable: true,
      }
    }

    return {
      message: 'The chatbot encountered an unexpected error. Please try again.',
      retryable: true,
    }
  }

  const status = error.response?.status
  const responseDetail = error.response?.data?.detail
  const detail =
    typeof responseDetail === 'string' ? responseDetail : undefined

  if (!error.response) {
    return {
      message:
        'Cannot reach the CyberFusion server. Check your connection and retry.',
      retryable: true,
    }
  }

  if (status === 401 || status === 403) {
    return {
      message:
        'Your session may have expired or lacks access. Please log in again.',
      retryable: false,
    }
  }

  if (status === 429) {
    const isQuotaError = detail?.toLowerCase().includes('quota') ?? false

    return {
      message:
        detail ??
        'The AI assistant is rate-limited. Please wait a moment and retry.',
      retryable: !isQuotaError,
    }
  }

  if (status === 502) {
    const normalizedDetail = detail?.toLowerCase() ?? ''
    const isConfigurationError =
      normalizedDetail.includes('configured gemini model') ||
      normalizedDetail.includes('request configuration')

    return {
      message:
        detail ??
        'The AI service could not process the request. Please try again.',
      retryable: !isConfigurationError,
    }
  }

  if (status === 503) {
    const normalizedDetail = detail?.toLowerCase() ?? ''
    const isConfigurationError =
      normalizedDetail.includes('not configured') ||
      normalizedDetail.includes('credential') ||
      normalizedDetail.includes('gemini_api_key')

    return {
      message: isConfigurationError
        ? 'The chatbot service needs configuration or credential attention. Please contact the administrator.'
        : detail ??
          'Gemini is temporarily unavailable. Please wait a moment and retry.',
      retryable: !isConfigurationError,
    }
  }

  if (status !== undefined && status >= 500) {
    return {
      message: 'The AI service is temporarily unavailable. Please retry.',
      retryable: true,
    }
  }

  return {
    message: detail ?? 'The chatbot could not process that request.',
    retryable: false,
  }
}

export default function CyberFusionChatbot() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [retryRequest, setRetryRequest] = useState<RetryRequest | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading, isOpen])

  async function sendMessage(
    message: string,
    history: Message[],
    addUserMessage: boolean,
  ) {
    if (addUserMessage) {
      setMessages((previous) => [
        ...previous,
        { role: 'user', content: message },
      ])
    }
    setRetryRequest(null)
    setIsLoading(true)

    try {
      const response = await api.post<ChatResponse>('/api/chat', {
        message,
        history,
      })

      setMessages((previous) => [
        ...previous,
        { role: 'assistant', content: response.data.reply },
      ])
    } catch (error: unknown) {
      const chatError = getChatError(error)
      setMessages((previous) => [
        ...previous,
        { role: 'assistant', content: chatError.message, isError: true },
      ])
      if (chatError.retryable) {
        setRetryRequest({ message, history })
      }
    } finally {
      setIsLoading(false)
    }
  }

  function handleSend(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()

    const message = input.trim()

    if (!message || isLoading) return

    const history = messages.filter((item) => !item.isError).slice(-10)
    setInput('')
    void sendMessage(message, history, true)
  }

  function handleRetry() {
    if (!retryRequest || isLoading) return

    setMessages((previous) =>
      previous.at(-1)?.isError ? previous.slice(0, -1) : previous,
    )
    void sendMessage(retryRequest.message, retryRequest.history, false)
  }

  function clearConversation() {
    setMessages([INITIAL_MESSAGE])
    setRetryRequest(null)
  }

  return (
    <div className="cyber-chatbot">
      {isOpen && (
        <section
          className="cyber-chat-panel"
          aria-label="CyberFusion AI Assistant"
        >
          <header className="cyber-chat-header">
            <div className="cyber-chat-brand">
              <div className="cyber-chat-avatar">
                <Bot size={22} />
              </div>

              <div>
                <h2>CyberFusion AI</h2>
                <p>
                  <span className="cyber-online-dot" />
                  Cybersecurity Assistant
                </p>
              </div>
            </div>

            <div className="cyber-chat-actions">
              <button
                type="button"
                onClick={clearConversation}
                title="Clear conversation"
                aria-label="Clear conversation"
              >
                <Trash2 size={17} />
              </button>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close chatbot"
                aria-label="Close chatbot"
              >
                <X size={20} />
              </button>
            </div>
          </header>

          <div className="cyber-chat-messages">
            {messages.map((message, index) => (
              <div
                key={`${index}-${message.role}`}
                className={`cyber-message-row ${
                  message.role === 'user' ? 'user-message-row' : ''
                }`}
              >
                {message.role === 'assistant' && (
                  <div className="cyber-message-avatar">
                    <Bot size={16} />
                  </div>
                )}

                <div
                  className={`cyber-message ${
                    message.role === 'user'
                      ? 'cyber-user-message'
                      : 'cyber-ai-message'
                  }`}
                >
                  {message.content}
                  {message.isError &&
                    index === messages.length - 1 &&
                    retryRequest && (
                      <button
                        type="button"
                        onClick={handleRetry}
                        disabled={isLoading}
                        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-300 transition hover:text-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RotateCw size={14} aria-hidden="true" />
                        Retry
                      </button>
                    )}
                </div>
              </div>
            ))}

            {messages.length === 1 && (
              <div className="cyber-suggestions">
                <p>Try asking:</p>

                {SUGGESTIONS.map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion)
                    }}
                  >
                    <Sparkles size={13} />
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {isLoading && (
              <div className="cyber-message-row">
                <div className="cyber-message-avatar">
                  <Bot size={16} />
                </div>

                <div className="cyber-message cyber-ai-message cyber-typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form className="cyber-chat-input-area" onSubmit={handleSend}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask a cybersecurity question..."
              rows={1}
              maxLength={2000}
              disabled={isLoading}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void handleSend()
                }
              }}
            />

            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              aria-label="Send message"
            >
              <Send size={18} />
            </button>
          </form>

          <p className="cyber-chat-footer">
            AI-generated responses may contain inaccuracies.
          </p>
        </section>
      )}

      <button
        type="button"
        className="cyber-chat-launcher"
        onClick={() => setIsOpen((previous) => !previous)}
        aria-label={isOpen ? 'Close AI assistant' : 'Open AI assistant'}
        title="Chat with CyberFusion AI"
      >
        {isOpen ? <X size={25} /> : <MessageCircle size={25} />}
        {!isOpen && <span className="cyber-chat-launcher-label">AI Assistant</span>}
      </button>
    </div>
  )
}

import React, { useCallback, useState, useEffect, useRef } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { ExternalLink, Loader2, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PageHero from '../components/ui/PageHero';
import { Field, Notice, Segmented } from '../components/ui/Controls';
import { Modal, useConfirm } from '../components/ui/Modal';
import { SPRING, stagger } from '../lib/motion';

const SUGGESTED_QUESTIONS = [
  'How is my spending this month?',
  'Can I afford a RM 450 purchase right now?',
  'Am I on track for my life goals?',
  'Where can I cut expenses to save 20%?',
  'Should I take the loan I checked?',
  'How much should I keep as an emergency fund?',
];

const PROVIDERS = {
  gemini: { label: 'Google Gemini' },
  openai: { label: 'OpenAI GPT-4o mini' },
  local: { label: 'Offline fallback (keyword rules, no LLM)' },
};

const ENGINE_OPTIONS = [
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'local', label: 'Offline' },
];

const ENGINE_NOTES = {
  gemini: 'Free API.',
  openai: 'GPT-4o mini.',
  local: 'Keyword rules, no LLM.',
};

const SETTINGS_TONES = { saving: 'working', success: 'ok', error: 'danger' };

// Each block of a new reply fades in; stagger() spaces them so the whole reply lands within 600ms
const BLOCK_FADE = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.22 } },
};

const rm0 = (n) => `RM ${Math.round(Number(n || 0)).toLocaleString('en-MY')}`;

/** Inline **bold** only; single *asterisks* used for emphasis are dropped. */
function renderInline(text) {
  return text.split(/(\*\*.+?\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-bold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part.replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|$|[.,;:!?])/g, '$1$2')
    )
  );
}

/** Small markdown subset the LLMs produce: headings, -, * and • bullets, numbered lists, bold. */
function formatAssistantContent(text) {
  if (!text) return null;
  return text.split('\n').map((raw, idx) => {
    const line = raw.trimEnd();
    if (!line.trim()) return <div key={idx} className="h-2" />;
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) return <hr key={idx} className="my-4 border-line" />;

    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) {
      return (
        <h3 key={idx} className="font-display font-semibold text-lg mt-4 mb-1">
          {renderInline(heading[1])}
        </h3>
      );
    }

    const bullet = line.match(/^(\s*)[-*•]\s+(.*)$/);
    if (bullet) {
      return (
        <div key={idx} className="flex items-start gap-2.5 my-1" style={{ paddingLeft: bullet[1].length >= 2 ? 16 : 0 }}>
          <span className="w-1.5 h-1.5 mt-[0.6em] rounded-[2px] bg-jade shrink-0" aria-hidden="true" />
          <span className="min-w-0">{renderInline(bullet[2])}</span>
        </div>
      );
    }

    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      return (
        <div key={idx} className="flex items-start gap-2 my-1">
          <span className="text-jade font-semibold num min-w-[1.25rem]">{numbered[1]}.</span>
          <span className="min-w-0">{renderInline(numbered[2])}</span>
        </div>
      );
    }

    return (
      <p key={idx} className="my-1.5">
        {renderInline(line)}
      </p>
    );
  });
}

/** "What the advisor can see": the same context that goes into the LLM prompt, as one sentence. */
function contextSentence(ctx) {
  if (!ctx) return 'General guidance based on your own spending, goals and latest checks.';
  const items = [];
  if (ctx.period.hasTransactions) {
    items.push(`${ctx.period.label}, spent ${rm0(ctx.totalSpend)} of ${rm0(ctx.income)}`);
  } else {
    items.push('no statements uploaded yet');
  }
  if (ctx.goals?.count) items.push(`${ctx.goals.count} goal${ctx.goals.count === 1 ? '' : 's'} at ${rm0(ctx.goals.monthly)}/month (${ctx.goals.overall})`);
  if (ctx.latestLoan) items.push(`loan check: ${ctx.latestLoan.verdict}`);
  if (ctx.latestInsurance) items.push(`insurance: ${ctx.latestInsurance.risk_tier} risk`);
  return <span className="num">What the advisor sees with every question: {items.join('; ')}.</span>;
}

/** Well-set prose on the paper. A new reply fades in block by block, a loaded one is simply there. */
function AssistantProse({ content, reveal }) {
  const blocks = formatAssistantContent(content);
  if (!reveal || !blocks) return <div>{blocks}</div>;
  const gap = blocks.length > 1 ? Math.min(0.06, 0.38 / (blocks.length - 1)) : 0;
  return (
    <m.div variants={stagger(gap)} initial="hidden" animate="show">
      {blocks.map((block, i) => (
        <m.div key={i} variants={BLOCK_FADE}>
          {block}
        </m.div>
      ))}
    </m.div>
  );
}

/** `live` is read once: history that loads with the page stays still, new messages slide up. */
function Message({ msg, live }) {
  const [isNew] = useState(live);
  const isUser = msg.role === 'user';
  const time = new Date(msg.sent_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <m.div
      className={isUser ? 'flex flex-col items-end' : ''}
      initial={isNew ? { opacity: 0, y: 16 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
    >
      <span className="sr-only">{isUser ? 'You said:' : 'The advisor said:'}</span>
      {isUser ? (
        <p className="max-w-[85%] rounded-control bg-jade-wash px-3.5 py-2.5 whitespace-pre-wrap break-words">{msg.content}</p>
      ) : (
        <AssistantProse content={msg.content} reveal={isNew} />
      )}
      <p className="t-note num mt-1.5 flex flex-wrap gap-x-3">
        <span>{time}</span>
        {!isUser && msg.provider && <span>via {(PROVIDERS[msg.provider] || PROVIDERS.local).label}</span>}
      </p>
    </m.div>
  );
}

/** Runs only while waiting for a reply. */
function WaitingDots() {
  const still = useReducedMotion();
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) =>
        still ? (
          <span key={i} className="w-1.5 h-1.5 rounded-full bg-jade" />
        ) : (
          <m.span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-jade"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
            transition={{ duration: 0.9, ease: 'easeInOut', repeat: Infinity, delay: i * 0.15 }}
          />
        )
      )}
    </span>
  );
}

const EnvName = ({ children }) => <code className="font-sans font-semibold text-ink">{children}</code>;

export default function AdvisorPage() {
  const { user, authFetch } = useAuth();
  const confirm = useConfirm();
  const reduceMotion = useReducedMotion();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [advisorContext, setAdvisorContext] = useState(null);
  const messagesEndRef = useRef(null);

  // AI Configuration Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState({
    activeProvider: 'local',
    canEdit: false,
    hasGeminiKey: false,
    hasOpenAIKey: false,
    geminiKeyMasked: '',
    openaiKeyMasked: '',
  });
  const [selectedProvider, setSelectedProvider] = useState('gemini'); // 'gemini' | 'openai' | 'local'
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [settingsStatus, setSettingsStatus] = useState({ state: 'idle', message: '' });
  // Stable, because Modal resets focus whenever onClose changes
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

  // Auto-scroll to bottom of conversation
  // The page scrolls now, not an inner panel: 'nearest' keeps the hero in view when everything fits
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Load chat history & financial context
  const loadChatHistory = async () => {
    try {
      setInitialLoading(true);
      const res = await authFetch('/api/advisor/history');
      const data = await res.json();

      if (data.success && data.messages && data.messages.length > 0) {
        setMessages(data.messages);
      } else {
        // Initial welcome message from FinSight AI
        setMessages([
          {
            id: 'welcome',
            role: 'assistant',
            content: `Hello ${user?.full_name || 'there'}! I'm your **FinSight AI Financial Advisor**.\n\nI can see your latest bank statement spending, your life goals, and your most recent loan and insurance checks (listed above this chat).\n\nAsk me about your spending, whether you can afford something, or how your goals are going. I give general guidance, not licensed financial advice.`,
            sent_at: new Date().toISOString(),
          },
        ]);
      }

      await loadContext();
    } catch (err) {
      console.error('Failed to load chat history:', err);
    } finally {
      setInitialLoading(false);
    }
  };

  // What the advisor can see (same context as the LLM prompt)
  const loadContext = async () => {
    try {
      const res = await authFetch('/api/advisor/context');
      const data = await res.json();
      if (data.success) setAdvisorContext(data.data);
    } catch (err) {
      console.error('Failed to load advisor context:', err);
    }
  };

  // Load AI Settings status
  const loadAiSettings = async () => {
    try {
      const res = await authFetch('/api/advisor/settings');
      const data = await res.json();
      if (data.success) {
        setAiSettings(data);
        if (data.activeProvider) setSelectedProvider(data.activeProvider);
      }
    } catch (err) {
      console.error('Failed to load AI settings:', err);
    }
  };

  useEffect(() => {
    loadChatHistory();
    loadAiSettings();
  }, []);

  // Save AI Settings / API Key
  const handleSaveAiSettings = async (e) => {
    e.preventDefault();
    setSettingsStatus({ state: 'saving', message: 'Testing connection to AI service...' });

    try {
      const res = await authFetch('/api/advisor/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          apiKey: apiKeyInput.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Verification failed.');
      }

      setSettingsStatus({
        state: 'success',
        message: data.message || 'AI service connected successfully!',
      });
      setApiKeyInput('');
      await loadAiSettings();

      setTimeout(() => {
        setIsSettingsOpen(false);
        setSettingsStatus({ state: 'idle', message: '' });
      }, 1500);
    } catch (err) {
      setSettingsStatus({ state: 'error', message: err.message });
    }
  };

  // Clear conversation history
  const handleClearHistory = async () => {
    if (!(await confirm({ title: 'Clear all conversation history?', body: 'This cannot be undone.', action: 'Clear history' }))) return;
    try {
      const res = await authFetch('/api/advisor/history', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setMessages([
          {
            id: 'welcome-reset',
            role: 'assistant',
            content: `Conversation refreshed! How can I assist you with your finances today?`,
            sent_at: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      console.error('Failed to clear history:', err);
    }
  };

  // Send message
  const handleSendMessage = async (msgToSend) => {
    const text = msgToSend || inputMessage;
    if (!text || !text.trim() || loading) return;

    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: text.trim(),
      sent_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setLoading(true);

    try {
      const res = await authFetch('/api/advisor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Advisor unavailable.');
      }

      const assistantMsg = {
        id: data.messageId || Date.now() + 1,
        role: 'assistant',
        content: data.reply,
        provider: data.provider,
        sent_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      loadContext();
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: `Sorry, I couldn't get an answer: ${err.message}`,
          sent_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const activeProvider = PROVIDERS[aiSettings.activeProvider] || PROVIDERS.local;

  return (
    <div>
      <PageHero module="AI Financial Advisor" title="Ask anything about your money" lead={contextSentence(advisorContext)} energy={0.3}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          {/* Active provider: says plainly when no LLM is answering */}
          <p className="text-ink-2">
            Answering now: <strong className="font-semibold text-ink">{activeProvider.label}</strong>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSettingsStatus({ state: 'idle', message: '' });
                setIsSettingsOpen(true);
              }}
              className="btn btn-quiet"
            >
              AI engine
            </button>
            <button type="button" onClick={handleClearHistory} className="btn btn-danger-quiet">
              Clear chat
            </button>
          </div>
        </div>
      </PageHero>

      <div className="page">
        <div className="rule pt-8 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
          <section aria-label="Conversation with the advisor" className="lg:col-span-7 min-w-0 max-w-[72ch] text-[0.9375rem] md:text-base leading-relaxed">
            <div role="log" aria-live="polite" className="space-y-7">
              {initialLoading && messages.length === 0 && (
                <p role="status" className="flex items-center gap-2 text-ink-2">
                  <Loader2 className="w-4 h-4 animate-spin text-jade" aria-hidden="true" />
                  Loading your conversation...
                </p>
              )}

              {messages.map((msg) => (
                <Message key={msg.id} msg={msg} live={!initialLoading} />
              ))}

              {loading && (
                <m.p
                  className="flex items-center gap-2.5 text-ink-2"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={SPRING}
                >
                  <WaitingDots />
                  Reading your numbers...
                </m.p>
              )}
            </div>

            {/* The margin keeps the latest message clear of the sticky composer and the phone dock */}
            <div ref={messagesEndRef} className="scroll-mb-56 md:scroll-mb-36" />

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="sheet-lift sticky z-20 bottom-[calc(60px+env(safe-area-inset-bottom)+0.75rem)] md:bottom-4 mt-8 p-3"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  aria-label="Your question"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Ask FinSight AI about spending, affordability, or budgeting..."
                  disabled={loading}
                  className="field min-w-0 flex-1"
                />
                <button type="submit" disabled={!inputMessage.trim() || loading} className="btn btn-primary shrink-0">
                  Send
                </button>
              </div>
              <p className="t-note mt-2 px-1">General guidance, not licensed financial advice.</p>
            </form>
          </section>

          <aside aria-labelledby="suggestions-title" className="lg:col-span-5 min-w-0 lg:sticky lg:top-24 lg:self-start">
            <h2 id="suggestions-title" className="t-section">
              Try asking
            </h2>
            <ul className="mt-2 divide-y divide-line">
              {SUGGESTED_QUESTIONS.map((q) => (
                <li key={q}>
                  <button
                    type="button"
                    onClick={() => handleSendMessage(q)}
                    disabled={loading}
                    className="w-full min-h-11 py-2.5 text-left text-ink-2 hover:text-jade disabled:opacity-55 transition-colors"
                  >
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>

      {isSettingsOpen && (
        <Modal
          title="AI engine setup"
          description="Connect a real LLM (Google Gemini or OpenAI)."
          width="max-w-lg"
          onClose={closeSettings}
        >
          {/* How to get a free API key */}
          <div className="rounded-control bg-paper-2 p-4">
            <p className="font-semibold">How to set up free Google Gemini AI (recommended)</p>
            <ol className="list-decimal list-inside mt-2 space-y-1 text-sm text-ink-2">
              <li>
                Open{' '}
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
                  Google AI Studio
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>{' '}
                (100% free, no credit card required).
              </li>
              <li>
                Sign in with your Google account and click <strong className="font-semibold text-ink">"Create API Key"</strong>.
              </li>
              <li>
                Copy the key, paste it into the field below, and click <strong className="font-semibold text-ink">"Save and verify key"</strong>.
              </li>
            </ol>
          </div>

          <Notice tone={SETTINGS_TONES[settingsStatus.state]} show={settingsStatus.state !== 'idle'} className="mt-4">
            {settingsStatus.message}
          </Notice>

          {!aiSettings.canEdit ? (
            <div className="mt-5 rule pt-4 space-y-2 text-sm text-ink-2">
              <p className="font-semibold text-ink flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-jade" aria-hidden="true" />
                Settings are locked
              </p>
              <p>
                The AI key is shared by every user of this server, so it can only be changed in <EnvName>server/.env</EnvName> (
                <EnvName>GEMINI_API_KEY</EnvName> or <EnvName>OPENAI_API_KEY</EnvName>). For local development, set{' '}
                <EnvName>ALLOW_AI_SETTINGS=true</EnvName> there to edit it here.
              </p>
              <p>
                Currently answering: <span className="font-semibold text-ink">{activeProvider.label}</span>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSaveAiSettings} className="mt-5 space-y-4">
              <div>
                <p className="t-label mb-1.5">Choose the AI engine</p>
                <Segmented options={ENGINE_OPTIONS} value={selectedProvider} onChange={setSelectedProvider} label="Choose the AI engine" />
                <p className="t-note mt-1">{ENGINE_NOTES[selectedProvider]}</p>
              </div>

              {selectedProvider !== 'local' && (
                <Field
                  label={selectedProvider === 'gemini' ? 'Google Gemini API key' : 'OpenAI API key'}
                  hint={
                    selectedProvider === 'gemini' && aiSettings.hasGeminiKey
                      ? `Current: ${aiSettings.geminiKeyMasked}`
                      : selectedProvider === 'openai' && aiSettings.hasOpenAIKey
                      ? `Current: ${aiSettings.openaiKeyMasked}`
                      : undefined
                  }
                >
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={selectedProvider === 'gemini' ? 'AIzaSy...' : 'sk-...'}
                    required={selectedProvider !== 'local'}
                  />
                </Field>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button type="button" onClick={closeSettings} className="btn btn-quiet">
                  Cancel
                </button>
                <button type="submit" disabled={settingsStatus.state === 'saving'} className="btn btn-primary">
                  {settingsStatus.state === 'saving' ? 'Verifying...' : 'Save and verify key'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}

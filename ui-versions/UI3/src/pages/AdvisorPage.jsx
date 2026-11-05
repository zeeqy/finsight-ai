import React, { useCallback, useState, useEffect, useRef } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { AlertTriangle, Cpu, ExternalLink, Eye, Lightbulb, Loader2, Lock, MessagesSquare, Send, Settings2, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useGoTo } from '../context/NavContext';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import { Field, Notice, Segmented } from '../components/ui/Controls';
import { Modal, useConfirm } from '../components/ui/Modal';
import { moduleById } from '../lib/modules';
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
          <span className="w-1.5 h-1.5 mt-[0.6em] rounded-[2px] bg-accent shrink-0" aria-hidden="true" />
          <span className="min-w-0">{renderInline(bullet[2])}</span>
        </div>
      );
    }

    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      return (
        <div key={idx} className="flex items-start gap-2 my-1">
          <span className="text-accent font-semibold num min-w-[1.25rem]">{numbered[1]}.</span>
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

/** "What the advisor can see": the same context that goes into the LLM prompt, one row per source. */
function contextRows(ctx) {
  return [
    {
      module: 'dashboard',
      label: 'Spending',
      value: ctx.period.hasTransactions ? `${ctx.period.label}, spent ${rm0(ctx.totalSpend)} of ${rm0(ctx.income)}` : 'No statements uploaded yet',
    },
    {
      module: 'goals',
      label: 'Goals',
      value: ctx.goals?.count
        ? `${ctx.goals.count} goal${ctx.goals.count === 1 ? '' : 's'} at ${rm0(ctx.goals.monthly)}/month (${ctx.goals.overall})`
        : 'No active goals',
    },
    { module: 'loan', label: 'Loan check', value: ctx.latestLoan ? ctx.latestLoan.verdict : 'No check yet' },
    { module: 'insurance', label: 'Insurance check', value: ctx.latestInsurance ? `${ctx.latestInsurance.risk_tier} risk` : 'No check yet' },
  ];
}

/** Each row's chip uses the colour and icon of the module the figure comes from. */
function ContextList({ ctx }) {
  if (!ctx) return <p className="text-ink-2">General guidance based on your own spending, goals and latest checks.</p>;
  return (
    <ul className="space-y-3">
      {contextRows(ctx).map((row) => {
        const { icon: Icon, tone } = moduleById(row.module);
        return (
          <li key={row.label} className="flex items-center gap-3 min-w-0">
            <span className={`chip tone-${tone}`}>
              <Icon className="w-[1.125rem] h-[1.125rem]" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="t-label">{row.label}</p>
              <p className="num text-sm break-words">{row.value}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Shown while there is no statement for the advisor to read. */
function NoDataNotice({ goTo, className }) {
  return (
    <Notice className={className}>
      The advisor has no spending to read yet, so its answers stay general.{' '}
      <button type="button" onClick={() => goTo('dashboard')} className="link">
        Upload a statement
      </button>
    </Notice>
  );
}

function SuggestedList({ questions, onAsk, disabled, className = '' }) {
  return (
    <ul className={`grid gap-2 ${className}`}>
      {questions.map((q) => (
        <li key={q} className="min-w-0">
          <button
            type="button"
            onClick={() => onAsk(q)}
            disabled={disabled}
            className="btn btn-soft w-full h-full justify-start text-left whitespace-normal"
          >
            {q}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A new reply fades in block by block, a loaded one is simply there. */
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
      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
      initial={isNew ? { opacity: 0, y: 16 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
    >
      <span className="sr-only">{isUser ? 'You said:' : 'The advisor said:'}</span>
      {isUser ? (
        <p className="max-w-[85%] min-w-0 rounded-panel rounded-br-md bg-accent text-on-accent px-4 py-2.5 whitespace-pre-wrap break-words">
          {msg.content}
        </p>
      ) : (
        <div className="max-w-[92%] min-w-0 rounded-panel rounded-bl-md bg-paper px-4 py-2 break-words">
          <AssistantProse content={msg.content} reveal={isNew} />
        </div>
      )}
      <p className="t-note num mt-1 px-1 flex flex-wrap gap-x-3">
        <span>{time}</span>
        {!isUser && msg.provider && <span>via {(PROVIDERS[msg.provider] || PROVIDERS.local).label}</span>}
        {!isUser && msg.validation?.checked > 0 && (
          <span className={`inline-flex items-center gap-1 ${msg.validation.unsupported.length ? 'text-warn' : 'text-ok'}`}>
            {msg.validation.unsupported.length ? (
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            {msg.validation.unsupported.length
              ? `${msg.validation.unsupported.length} of ${msg.validation.checked} figures not found in your data`
              : `${msg.validation.checked} figure${msg.validation.checked === 1 ? '' : 's'} checked against your data`}
          </span>
        )}
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
          <span key={i} className="w-1.5 h-1.5 rounded-full bg-accent" />
        ) : (
          <m.span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-accent"
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
  const goTo = useGoTo();
  const reduceMotion = useReducedMotion();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [advisorContext, setAdvisorContext] = useState(null);
  const scrollerRef = useRef(null);

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
  // Messages scroll inside the chat card, so the page itself must not move
  const scrollToBottom = () => {
    const box = scrollerRef.current;
    box?.scrollTo({ top: box.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  // initialLoading too: the suggestions of an empty chat appear only after it ends
  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, initialLoading]);

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
            content: `Hello ${user?.full_name || 'there'}! I'm your **FinSight AI Financial Advisor**.\n\nI can see your latest bank statement spending, your life goals, and your most recent loan and insurance checks (listed on this page).\n\nAsk me about your spending, whether you can afford something, or how your goals are going. I give general guidance, not licensed financial advice.`,
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
        validation: data.validation,
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

  const isEmptyChat = !initialLoading && messages.every((msg) => String(msg.id).startsWith('welcome'));
  const noStatements = advisorContext && !advisorContext.period.hasTransactions;

  return (
    <div>
      <PageHeader module="advisor">
        <button
          type="button"
          onClick={() => {
            setSettingsStatus({ state: 'idle', message: '' });
            setIsSettingsOpen(true);
          }}
          className="btn btn-quiet"
        >
          <Settings2 className="w-4 h-4" aria-hidden="true" />
          AI engine
        </button>
        <button type="button" onClick={handleClearHistory} className="btn btn-danger-quiet">
          <Trash2 className="w-4 h-4" aria-hidden="true" />
          Clear chat
        </button>
      </PageHeader>

      <div className="page">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Height keeps the composer above the phone's bottom bar; sticky keeps it in view beside the taller side column */}
          <section
            aria-labelledby="chat-title"
            className="card xl:col-span-8 min-w-0 flex flex-col overflow-hidden h-[calc(100dvh-20rem)] min-h-[24rem] md:h-[calc(100dvh-13rem)] md:min-h-[28rem] xl:sticky xl:top-4"
          >
            <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-line">
              <span className="chip tone-accent">
                <MessagesSquare className="w-[1.125rem] h-[1.125rem]" aria-hidden="true" />
              </span>
              <h2 id="chat-title" className="t-section">
                Conversation
              </h2>
            </div>

            <div ref={scrollerRef} role="group" aria-label="Messages" tabIndex={0} className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-5 py-4">
              <div role="log" aria-live="polite" className="space-y-4">
                {initialLoading && messages.length === 0 && (
                  <p role="status" className="flex items-center gap-2 text-ink-2">
                    <Loader2 className="w-4 h-4 animate-spin text-accent" aria-hidden="true" />
                    Loading your conversation...
                  </p>
                )}

                {messages.map((msg) => (
                  <Message key={msg.id} msg={msg} live={!initialLoading} />
                ))}

                {loading && (
                  <m.p
                    className="w-fit flex items-center gap-2.5 rounded-panel rounded-bl-md bg-paper px-4 py-2.5 text-ink-2"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={SPRING}
                  >
                    <WaitingDots />
                    Reading your numbers...
                  </m.p>
                )}
              </div>

              {isEmptyChat && (
                <div className="mt-5">
                  {noStatements && <NoDataNotice goTo={goTo} className="mb-4 xl:hidden" />}
                  <h3 className="t-section">Try asking</h3>
                  <p className="t-note mb-2.5">Press a question to send it, or type your own below.</p>
                  <SuggestedList questions={SUGGESTED_QUESTIONS.slice(0, 4)} onAsk={handleSendMessage} disabled={loading} className="grid-cols-1 sm:grid-cols-2" />
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="rule px-4 sm:px-5 py-3"
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
                  <Send className="w-4 h-4" aria-hidden="true" />
                  Send
                </button>
              </div>
              <p className="t-note mt-1.5">
                General guidance, not licensed financial advice.
                {aiSettings.activeProvider !== 'local' && ` Your question and the figures listed under "What the advisor can see" go to ${activeProvider.label} to write the reply.`}
              </p>
            </form>
          </section>

          <div className="xl:col-span-4 min-w-0 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4 content-start">
            <Card icon={Eye} tone="gold" title="What the advisor can see" note="Included with every question">
              <ContextList ctx={advisorContext} />
              {noStatements && <NoDataNotice goTo={goTo} className="mt-3" />}
            </Card>

            <Card icon={Lightbulb} tone="accent" title="Try asking" note="Press a question to send it">
              <SuggestedList questions={SUGGESTED_QUESTIONS} onAsk={handleSendMessage} disabled={loading} />
            </Card>

            <Card icon={Cpu} tone="blue" title="AI engine" className="md:col-span-2 xl:col-span-1">
              {/* Active provider: says plainly when no LLM is answering */}
              <p className="text-ink-2">
                Answering now: <strong className="font-semibold text-ink">{activeProvider.label}</strong>
              </p>
              <p className="t-note mt-1">
                New replies show which engine answered.
                {aiSettings.activeProvider !== 'local' && ` If the LLM cannot answer, the ${PROVIDERS.local.label} replies instead.`}
              </p>
            </Card>
          </div>
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
          <div className="rounded-xl bg-paper-2 p-4">
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
                <Lock className="w-4 h-4 text-accent" aria-hidden="true" />
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
                <button type="submit" disabled={settingsStatus.state === 'saving'} className="btn btn-accent">
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

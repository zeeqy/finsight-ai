import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Send,
  Bot,
  User,
  Sparkles,
  RefreshCw,
  Wallet,
  TrendingDown,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  Settings,
  Trash2,
  ExternalLink,
  Key,
  Cpu,
  Zap,
  X,
  Loader2,
  Lock,
  Target,
  Landmark,
  ShieldAlert,
  Eye,
} from 'lucide-react';

const SUGGESTED_QUESTIONS = [
  'How is my spending this month?',
  'Can I afford a RM 450 purchase right now?',
  'Am I on track for my life goals?',
  'Where can I cut expenses to save 20%?',
  'Should I take the loan I checked?',
  'How much should I keep as an emergency fund?',
];

const PROVIDERS = {
  gemini: { label: 'Google Gemini', badge: 'bg-[#FFC80A]/15 text-[#FFC80A] border-[#FFC80A]/30', icon: Zap },
  openai: { label: 'OpenAI GPT-4o mini', badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30', icon: Sparkles },
  local: {
    label: 'Offline fallback (keyword rules, no LLM)',
    badge: 'bg-[#64748B]/15 text-[#CBD5E1] border-[#64748B]/40',
    icon: Cpu,
  },
};

const rm0 = (n) => `RM ${Math.round(Number(n || 0)).toLocaleString('en-MY')}`;

/** Inline **bold** only; single *asterisks* used for emphasis are dropped. */
function renderInline(text) {
  return text.split(/(\*\*.+?\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-extrabold text-white">
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
    if (!line.trim()) return <div key={idx} className="h-1.5" />;
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) return <hr key={idx} className="my-2.5 border-[#232A3B]" />;

    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) {
      return (
        <h4 key={idx} className="font-extrabold text-sm text-[#FFC80A] mt-2.5 mb-1">
          {renderInline(heading[1])}
        </h4>
      );
    }

    const bullet = line.match(/^(\s*)[-*•]\s+(.*)$/);
    if (bullet) {
      return (
        <div key={idx} className="flex items-start gap-2 my-0.5" style={{ paddingLeft: bullet[1].length >= 2 ? 16 : 0 }}>
          <span className="text-[#FFC80A] font-bold">•</span>
          <span className="text-[#CBD5E1] leading-relaxed">{renderInline(bullet[2])}</span>
        </div>
      );
    }

    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      return (
        <div key={idx} className="flex items-start gap-2 my-0.5">
          <span className="text-[#FFC80A] font-bold font-mono min-w-[14px]">{numbered[1]}.</span>
          <span className="text-[#CBD5E1] leading-relaxed">{renderInline(numbered[2])}</span>
        </div>
      );
    }

    return (
      <p key={idx} className="my-1 text-[#CBD5E1] leading-relaxed">
        {renderInline(line)}
      </p>
    );
  });
}

/** "What the advisor can see": the same context that goes into the LLM prompt. */
function ContextChips({ ctx }) {
  if (!ctx) return null;
  const chips = [];
  if (ctx.period.hasTransactions) {
    chips.push({ icon: Wallet, text: `${ctx.period.label}: spent ${rm0(ctx.totalSpend)} of ${rm0(ctx.income)}` });
  } else {
    chips.push({ icon: Wallet, text: 'No statements uploaded yet' });
  }
  if (ctx.goals?.count) chips.push({ icon: Target, text: `${ctx.goals.count} goal${ctx.goals.count === 1 ? '' : 's'}, ${rm0(ctx.goals.monthly)}/month (${ctx.goals.overall})` });
  if (ctx.latestLoan) chips.push({ icon: Landmark, text: `Loan check: ${ctx.latestLoan.verdict}` });
  if (ctx.latestInsurance) chips.push({ icon: ShieldAlert, text: `Insurance: ${ctx.latestInsurance.risk_tier} risk` });

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      <span className="text-[10px] text-[#64748B] flex items-center gap-1" title="This is the data sent to the AI with every question">
        <Eye className="w-3 h-3" /> Advisor sees:
      </span>
      {chips.map(({ icon: Icon, text }) => (
        <span
          key={text}
          className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-[#0E1118] border border-[#232A3B] text-[#CBD5E1] flex items-center gap-1"
        >
          <Icon className="w-3 h-3 text-[#FFC80A]" />
          {text}
        </span>
      ))}
    </div>
  );
}

export default function AdvisorPage() {
  const { user, authFetch } = useAuth();
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

  // Auto-scroll to bottom of conversation
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    if (!window.confirm('Clear all conversation history?')) return;
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

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto flex flex-col h-[calc(100vh-5rem)]">
      {/* Top Banner: Context Pill + AI Setup Trigger */}
      <div className="bg-[#141824]/90 border border-[#232A3B] rounded-2xl p-4 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FFC80A] via-[#FFD43B] to-[#E6A800] text-black font-black flex items-center justify-center shadow-md shadow-[#FFC80A]/20 shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold text-white tracking-tight">
                FinSight AI Advisor
              </h2>
              {/* Active provider: says plainly when no LLM is answering */}
              {(() => {
                const prov = PROVIDERS[aiSettings.activeProvider] || PROVIDERS.local;
                const Icon = prov.icon;
                return (
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${prov.badge}`}>
                    <Icon className="w-3 h-3" />
                    {prov.label}
                  </span>
                );
              })()}
            </div>
            <ContextChips ctx={advisorContext} />
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* AI Settings Button */}
          <button
            onClick={() => {
              setSettingsStatus({ state: 'idle', message: '' });
              setIsSettingsOpen(true);
            }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1C2230] hover:bg-[#252C3D] border border-[#2D364A] text-xs font-semibold text-[#FFC80A] transition"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>AI engine</span>
          </button>

          {/* Clear Chat Button */}
          <button
            onClick={handleClearHistory}
            className="p-2 rounded-xl bg-[#1C2230] hover:bg-rose-500/15 border border-[#2D364A] hover:border-rose-500/30 text-[#94A3B8] hover:text-rose-400 transition"
            title="Clear Chat History"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Chat Messages Log */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold shadow-md ${
                  isUser
                    ? 'bg-[#1C2230] border border-[#2D364A] text-[#FFC80A]'
                    : 'bg-gradient-to-br from-[#FFC80A] via-[#FFD43B] to-[#E6A800] text-black shadow-[#FFC80A]/20'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Message Bubble */}
              <div
                className={`max-w-[82%] rounded-2xl p-4 text-xs shadow-xl ${
                  isUser
                    ? 'bg-[#FFC80A] text-black font-semibold rounded-tr-none'
                    : 'bg-[#141824] border border-[#232A3B] text-[#CBD5E1] rounded-tl-none'
                }`}
              >
                {isUser ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div>{formatAssistantContent(msg.content)}</div>
                )}

                <div
                  className={`mt-2 text-[10px] flex items-center justify-between ${
                    isUser ? 'text-black/60' : 'text-[#64748B]'
                  }`}
                >
                  <span>
                    {new Date(msg.sent_at || Date.now()).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {!isUser && msg.provider && (
                    <span className="font-mono text-[#FFC80A] font-semibold">
                      via {(PROVIDERS[msg.provider] || PROVIDERS.local).label}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {loading && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FFC80A] via-[#FFD43B] to-[#E6A800] text-black font-bold flex items-center justify-center shadow-md shadow-[#FFC80A]/20">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-[#141824] border border-[#232A3B] rounded-2xl rounded-tl-none p-3.5 text-xs text-[#CBD5E1] flex items-center gap-2 shadow-xl">
              <span className="w-2 h-2 rounded-full bg-[#FFC80A] animate-ping"></span>
              <span className="font-semibold text-[#FFC80A]">
                Thinking about your finances...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Questions Chips */}
      <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1 shrink-0">
        <span className="text-[10px] font-bold text-[#64748B] uppercase shrink-0">
          Try asking:
        </span>
        {SUGGESTED_QUESTIONS.map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(q)}
            disabled={loading}
            className="whitespace-nowrap px-3 py-1 rounded-full bg-[#141824] hover:bg-[#1C2230] border border-[#232A3B] hover:border-[#FFC80A]/40 text-[11px] text-[#CBD5E1] hover:text-[#FFC80A] transition shrink-0"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="shrink-0">
        <div className="relative flex items-center">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Ask FinSight AI about spending, affordability, or budgeting..."
            disabled={loading}
            className="w-full pl-4 pr-14 py-3 bg-[#141824] border border-[#232A3B] rounded-2xl text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-[#FFC80A] transition shadow-xl"
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || loading}
            className="absolute right-2 p-2 rounded-xl bg-[#FFC80A] hover:bg-[#FFD43B] text-black font-bold disabled:opacity-40 transition shadow-md shadow-[#FFC80A]/20"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* AI Setup & Guided Configuration Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#141824] border border-[#232A3B] rounded-2xl w-full max-w-lg p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="absolute top-4 right-4 text-[#94A3B8] hover:text-white p-1 rounded-lg hover:bg-[#1E2536] transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#FFC80A]/15 border border-[#FFC80A]/30 flex items-center justify-center text-[#FFC80A]">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">AI Engine Setup</h3>
                <p className="text-xs text-[#94A3B8]">
                  Connect real LLM intelligence (Google Gemini or OpenAI)
                </p>
              </div>
            </div>

            {/* How to get free API key guide */}
            <div className="p-4 rounded-xl bg-[#0E1118] border border-[#232A3B] mb-5 text-xs text-[#CBD5E1] space-y-2">
              <p className="font-extrabold text-[#FFC80A] flex items-center gap-1.5">
                <Zap className="w-4 h-4" />
                <span>How to set up Free Google Gemini AI (Recommended):</span>
              </p>
              <ol className="list-decimal list-inside space-y-1 text-[#94A3B8] text-[11px] leading-relaxed">
                <li>
                  Open{' '}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#FFC80A] underline inline-flex items-center gap-0.5 font-bold"
                  >
                    <span>Google AI Studio</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>{' '}
                  (100% free, no credit card required).
                </li>
                <li>Sign in with your Google account and click <strong>"Create API Key"</strong>.</li>
                <li>Copy the key, paste it into the field below, and click <strong>"Save & Verify Key"</strong>.</li>
              </ol>
            </div>

            {settingsStatus.state !== 'idle' && (
              <div
                className={`mb-4 p-3 rounded-xl text-xs flex items-center gap-2 ${
                  settingsStatus.state === 'saving'
                    ? 'bg-blue-500/10 border border-blue-500/20 text-blue-300'
                    : settingsStatus.state === 'success'
                    ? 'bg-[#10B981]/15 border border-[#10B981]/30 text-[#10B981]'
                    : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                }`}
              >
                {settingsStatus.state === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-[#10B981]" />}
                {settingsStatus.state === 'saving' && <Loader2 className="w-4 h-4 shrink-0 animate-spin" />}
                <span className="font-medium">{settingsStatus.message}</span>
              </div>
            )}

            {!aiSettings.canEdit ? (
              <div className="p-4 rounded-xl bg-[#0E1118] border border-[#232A3B] text-xs text-[#CBD5E1] space-y-2">
                <p className="font-bold text-white flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#FFC80A]" /> Settings are locked
                </p>
                <p className="text-[#94A3B8] leading-relaxed">
                  The AI key is shared by every user of this server, so it can only be changed in{' '}
                  <code className="text-[#FFC80A]">server/.env</code> (<code>GEMINI_API_KEY</code> or <code>OPENAI_API_KEY</code>). For local
                  development, set <code>ALLOW_AI_SETTINGS=true</code> there to edit it here.
                </p>
                <p className="text-[#94A3B8]">
                  Currently answering:{' '}
                  <span className="text-white font-semibold">{(PROVIDERS[aiSettings.activeProvider] || PROVIDERS.local).label}</span>
                </p>
              </div>
            ) : (
            <form onSubmit={handleSaveAiSettings} className="space-y-4">
              {/* Select Provider */}
              <div>
                <label className="block text-xs font-bold text-[#CBD5E1] mb-2">
                  Select Intelligence Engine
                </label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedProvider('gemini')}
                    className={`p-3 rounded-xl border text-center transition ${
                      selectedProvider === 'gemini'
                        ? 'border-[#FFC80A] bg-[#FFC80A]/10 text-[#FFC80A] font-extrabold'
                        : 'border-[#232A3B] bg-[#0E1118] text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    <div className="font-bold">Google Gemini</div>
                    <div className="text-[10px] opacity-75 font-normal">Free API</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedProvider('openai')}
                    className={`p-3 rounded-xl border text-center transition ${
                      selectedProvider === 'openai'
                        ? 'border-blue-500 bg-blue-500/10 text-blue-400 font-extrabold'
                        : 'border-[#232A3B] bg-[#0E1118] text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    <div className="font-bold">OpenAI</div>
                    <div className="text-[10px] opacity-75 font-normal">GPT-4o mini</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedProvider('local')}
                    className={`p-3 rounded-xl border text-center transition ${
                      selectedProvider === 'local'
                        ? 'border-[#10B981] bg-[#10B981]/10 text-[#10B981] font-extrabold'
                        : 'border-[#232A3B] bg-[#0E1118] text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    <div className="font-bold">Offline</div>
                    <div className="text-[10px] opacity-75 font-normal">Keyword rules, no LLM</div>
                  </button>
                </div>
              </div>

              {/* Key Input */}
              {selectedProvider !== 'local' && (
                <div>
                  <label className="block text-xs font-bold text-[#CBD5E1] mb-1.5 flex items-center justify-between">
                    <span>
                      {selectedProvider === 'gemini' ? 'Google Gemini API Key' : 'OpenAI API Key'}
                    </span>
                    {selectedProvider === 'gemini' && aiSettings.hasGeminiKey && (
                      <span className="text-[10px] font-mono text-[#FFC80A]">
                        Current: {aiSettings.geminiKeyMasked}
                      </span>
                    )}
                    {selectedProvider === 'openai' && aiSettings.hasOpenAIKey && (
                      <span className="text-[10px] font-mono text-blue-400">
                        Current: {aiSettings.openaiKeyMasked}
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <Key className="w-3.5 h-3.5 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={selectedProvider === 'gemini' ? 'AIzaSy...' : 'sk-...'}
                      className="w-full pl-9 pr-3 py-2.5 bg-[#0E1118] border border-[#232A3B] rounded-xl text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-[#FFC80A]"
                      required={selectedProvider !== 'local'}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#1F2533]">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#1C2230] text-[#CBD5E1] hover:bg-[#252C3D] text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settingsStatus.state === 'saving'}
                  className="px-4 py-2 rounded-xl bg-[#FFC80A] hover:bg-[#FFD43B] text-black font-extrabold text-xs shadow-md shadow-[#FFC80A]/20 transition disabled:opacity-60"
                >
                  {settingsStatus.state === 'saving' ? 'Verifying...' : 'Save & Verify Key'}
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

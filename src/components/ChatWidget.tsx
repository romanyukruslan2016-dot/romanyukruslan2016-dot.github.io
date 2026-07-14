import { useState, type FormEvent } from 'react';
import { createInitialState, handleUserMessage, type ConversationState } from '../lib/agent/conversation';

export function ChatWidget() {
  const [state, setState] = useState<ConversationState>(() => createInitialState());
  const [draftText, setDraftText] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = draftText.trim();
    if (!text || state.closed) return;
    // handleUserMessage has side effects (createOrder writes to the audit
    // trail), so it must run exactly once per submit — not as a setState
    // updater function, which StrictMode double-invokes to check purity.
    setState(handleUserMessage(state, text));
    setDraftText('');
  }

  return (
    <aside className="flex h-full w-full flex-col gap-3 overflow-hidden border-l border-white/[0.08] bg-[#1a1a1a] p-4">
      <header className="shrink-0">
        <h2
          className="text-xs font-bold uppercase tracking-widest text-white/40"
          style={{ fontFamily: 'Syne, sans-serif' }}
        >
          Order Chat
        </h2>
        <p className="mt-1 text-[11px] text-white/30">Розмовний прийом замовлень (демо-агент)</p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg border border-white/[0.08] bg-[#0d0d0d] p-3">
        {state.messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[90%] whitespace-pre-line rounded-lg px-3 py-2 text-xs ${
              m.role === 'agent'
                ? 'self-start border border-white/10 bg-white/[0.04] text-white/80'
                : 'self-end border border-[#C8FF00]/30 bg-[#C8FF00]/10 text-[#C8FF00]'
            }`}
          >
            {m.text}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex shrink-0 gap-2">
        <input
          type="text"
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          disabled={state.closed}
          placeholder={state.closed ? 'Замовлення оформлено' : 'Напишіть повідомлення…'}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-[#C8FF00]/50 focus:outline-none disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={state.closed || !draftText.trim()}
          className="shrink-0 rounded-lg border border-[#C8FF00]/40 px-3 py-2 text-xs font-medium text-[#C8FF00] transition-colors hover:bg-[#C8FF00]/10 disabled:opacity-30"
        >
          Надіслати
        </button>
      </form>
    </aside>
  );
}

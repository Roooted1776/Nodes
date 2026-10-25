import type React from 'react';
import { colorOf } from '../data/colors';
import { AGENT, TEAM_EDGES, type AgentId } from '../data/team';
import { PROV, type ProviderId } from '../lib/providers';
import { useStore } from '../store';

const DOCTRINE: Record<AgentId, { stage: string; action: string }> = {
  gemini: { stage: 'First Check · Target Recon', action: 'Inspects requirements, context, and documents' },
  muse: { stage: 'Second Check · Threat Audit', action: 'Audits for gaps, hidden risks, and missing evidence' },
  chatgpt: {
    stage: 'Collective Check · Tactical Plan',
    action: 'Deploys structured step of attack and ordered deliverables',
  },
  claude: { stage: 'Builder · Surgical Strike', action: 'Crafts precise reasoning, architecture, writing, and code' },
  cursor: {
    stage: 'Integration Review · Repo Fit',
    action: 'Validates repository integration and verifies minimal diffs',
  },
  perplexity: { stage: 'Source Check · Citations', action: 'Verifies citations and flags ungrounded assertions' },
  grok: { stage: 'Strategy Review · Challenges', action: 'Probes assumptions and spots counter-perspectives' },
  xcode: { stage: 'Platform Check · iOS & Devices', action: 'Validates device requirements and build configurations' },
  grokbot: {
    stage: 'Team Lead · Battle Verdict',
    action: 'Reviews complete handoff chain and delivers final PASS/FAIL call',
  },
};

export default function AgentInspector({ id, onClose }: { id?: AgentId; onClose?: () => void } = {}) {
  const inspectedBot = useStore(s => s.inspectedBot);
  const inspectBot = useStore(s => s.inspectBot);
  const botId = id ?? inspectedBot;
  const handleClose = onClose ?? (() => inspectBot(null));

  const keys = useStore(s => s.keys);
  const live = useStore(s => s.live);
  const inactiveBots = useStore(s => s.inactiveBots);
  const toggleBotActive = useStore(s => s.toggleBotActive);
  const setPromptDraft = useStore(s => s.setPromptDraft);

  if (!botId) return null;
  const a = AGENT[botId];
  if (!a) return null;

  const color = colorOf(botId);
  const isInactive = inactiveBots.includes(botId);
  const incoming = TEAM_EDGES.filter(([, to]) => to === botId).map(([from]) => from);
  const outgoing = TEAM_EDGES.filter(([from]) => from === botId).map(([, to]) => to);

  const prov = a.provider as ProviderId | undefined;
  const directKey = prov && keys[prov];
  const activeFallback = keys[live.provider];

  const handleDirectTask = () => {
    setPromptDraft(`Task for ${a.name}: `);
    handleClose();
  };

  return (
    <aside
      className="agent-inspector card2"
      style={{ '--c': color } as React.CSSProperties}
      role="dialog"
      aria-label={`Agent Inspector: ${a.name}`}
    >
      <header className="ai-header">
        <div className="ai-title">
          <b className="ai-avatar" style={{ background: color }}>
            {a.name.slice(0, 2).toUpperCase()}
          </b>
          <div>
            <h3>
              {a.name}
              {a.company && <small className="ai-company"> · {a.company}</small>}
            </h3>
            <span className="ai-role">{a.role}</span>
          </div>
        </div>
        <button type="button" className="ai-close" onClick={handleClose} aria-label="Close inspector">
          ✕
        </button>
      </header>

      <div className="ai-body">
        <div className="ai-grid">
          <div className="ai-tile">
            <span className="lbl">Doctrine & Stage</span>
            <b>{DOCTRINE[botId].stage}</b>
            <p className="desc">{DOCTRINE[botId].action}</p>
          </div>

          <div className="ai-tile">
            <span className="lbl">Status & Model</span>
            <div className="row">
              {isInactive ? (
                <span className="badge-nocredit">No Credits / Inactive</span>
              ) : (
                <span className="badge-active">● Active in Pipeline</span>
              )}
            </div>
            <small>
              {prov && directKey
                ? `Direct ${PROV[prov].label} Key Connected`
                : activeFallback
                  ? `Powered via ${PROV[live.provider].label} fallback`
                  : 'Needs API key in Admin'}
            </small>
          </div>
        </div>

        <div className="ai-section">
          <span className="lbl">Specialty</span>
          <p className="ai-specialty">{a.specialty}</p>
        </div>

        <div className="ai-section">
          <span className="lbl">Core Skills</span>
          <div className="ai-skills">
            {a.skills.map(s => (
              <span key={s} className="ai-skill">
                {s}
              </span>
            ))}
          </div>
        </div>

        <div className="ai-section ai-handoffs">
          <div className="handoff-col">
            <span className="lbl">Receives Work From</span>
            <div className="chips">
              {incoming.length > 0 ? (
                incoming.map(from => (
                  <button
                    key={from}
                    type="button"
                    className="chip-link"
                    style={{ '--c': colorOf(from) } as React.CSSProperties}
                    onClick={() => inspectBot(from)}
                  >
                    <b className="sw8" aria-hidden="true" />
                    {AGENT[from].name}
                  </button>
                ))
              ) : (
                <small className="muted">Direct from Owner</small>
              )}
            </div>
          </div>

          <div className="handoff-col">
            <span className="lbl">Hands Work To</span>
            <div className="chips">
              {outgoing.length > 0 ? (
                outgoing.map(to => (
                  <button
                    key={to}
                    type="button"
                    className="chip-link"
                    style={{ '--c': colorOf(to) } as React.CSSProperties}
                    onClick={() => inspectBot(to)}
                  >
                    <b className="sw8" aria-hidden="true" />
                    {AGENT[to].name}
                  </button>
                ))
              ) : (
                <small className="muted">Final Output to Owner</small>
              )}
            </div>
          </div>
        </div>

        <footer className="ai-footer">
          <button type="button" className="primary" onClick={handleDirectTask}>
            + Task for {a.name}
          </button>
          <button type="button" className={isInactive ? 'primary' : 'danger'} onClick={() => toggleBotActive(botId)}>
            {isInactive ? 'Enable Bot' : 'Mark No Credits'}
          </button>
        </footer>
      </div>
    </aside>
  );
}

export interface AssistantButtonProps {
  onClick: () => void;
  /** Short status hint, e.g. the detected context. */
  hint?: string;
}

/** The tiny in-page control. Styled inline because it lives in its own Shadow DOM. */
export function AssistantButton({ onClick, hint }: AssistantButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint ? `FC Assistant · ${hint}` : 'FC Assistant'}
      style={{
        all: 'initial',
        cursor: 'pointer',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        fontWeight: 600,
        color: '#10141c',
        background: '#f5c542',
        padding: '6px 12px',
        borderRadius: 999,
        boxShadow: '0 2px 8px rgba(0,0,0,.35)',
      }}
    >
      ⚡ Assistant
    </button>
  );
}

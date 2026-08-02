import { useState } from 'react';

export function CodeBlock({
  code,
  label,
  onCopy,
}: {
  code: string;
  label: string;
  onCopy?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    onCopy?.();
    window.setTimeout(() => setCopied(false), 1_800);
  };
  return (
    <div className="code-block">
      <div className="code-block-bar">
        <span>{label}</span>
        <button type="button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <pre tabIndex={0}><code>{code}</code></pre>
      <span className="sr-only" aria-live="polite">{copied ? `${label} copied` : ''}</span>
    </div>
  );
}

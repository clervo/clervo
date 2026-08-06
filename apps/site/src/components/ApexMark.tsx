import { geometry, palette } from '../brand';

/*
 * The Clervo mark, rendered inline rather than as an <img>.
 *
 * Inline is not a preference: the header mark must be present in the
 * server-rendered HTML with no second request, and the beam segments must be
 * addressable by CSS so a real operation state can drive them. An <img> can do
 * neither, and the previous header did not render the locked mark at all — it
 * rendered the letter "C".
 */

export type MarkState = 'idle' | 'request' | 'qualify' | 'verified';

export function ApexMark({
  size = 24,
  state = 'idle',
  beam = true,
  title,
}: {
  size?: number;
  state?: MarkState;
  beam?: boolean;
  title?: string;
}) {
  // Below 24px the three beam segments are not resolvable and read as one
  // muddy line, so the mark drops the beam rather than rendering it badly.
  const showBeam = beam && size >= 24;
  const decorative = title === undefined;
  return (
    <svg
      className={`apex-mark apex-mark--${state}`}
      viewBox={`0 0 ${geometry.view} ${geometry.view}`}
      width={size}
      height={size}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={title}
      focusable="false"
    >
      {showBeam ? (
        <g className="apex-mark__beam">
          <path
            className="apex-mark__segment apex-mark__segment--request"
            d={`M${geometry.left - 2} ${geometry.signalY}H${geometry.voidEntryX}`}
            stroke={palette.request}
            strokeWidth="3.1"
            strokeLinecap="round"
          />
          <path
            className="apex-mark__segment apex-mark__segment--qualify"
            d={`M${geometry.voidEntryX} ${geometry.signalY}H${geometry.voidExitX}`}
            stroke={palette.qualify}
            strokeWidth="3.1"
            strokeLinecap="round"
          />
          <path
            className="apex-mark__segment apex-mark__segment--verified"
            d={`M${geometry.voidExitX} ${geometry.signalY}H${geometry.right + 2}`}
            stroke={palette.verified}
            strokeWidth="3.1"
            strokeLinecap="round"
          />
        </g>
      ) : null}
      <path d={geometry.apexPath} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

/*
 * The horizontal lockup. The wordmark is set in live text rather than in
 * outlines so it inherits the page's own Space Grotesk, stays selectable, and
 * is read once by a screen reader instead of twice.
 */
export function Wordmark({ state = 'idle' }: { state?: MarkState }) {
  return (
    <span className="wordmark">
      <ApexMark size={26} state={state} />
      <span className="wordmark__text">Clervo</span>
    </span>
  );
}

/** A person seen from the front: head and shoulders, in two tones. */
function Person({ x, y, body, skin }: { x: number; y: number; body: string; skin: string }) {
  return (
    <g>
      <path d={`M${x - 26} ${y + 58} q26 -40 52 0 v6 h-52z`} className={body} />
      <circle cx={x} cy={y + 8} r="15" className={skin} />
    </g>
  )
}

/**
 * Participants around a table with one phone showing the table card QR (Mode Workshop).
 * Decorative only.
 */
export function TableGroupIllustration({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 220" className={className} aria-hidden="true" focusable="false">
      <circle cx="300" cy="44" r="30" className="fill-pastel-butter" />
      <circle cx="46" cy="60" r="20" className="fill-teal-100" />
      <Person x={92} y={58} body="fill-brand-300" skin="fill-pastel-peach" />
      <Person x={180} y={44} body="fill-teal-500" skin="fill-pastel-peach" />
      <Person x={268} y={58} body="fill-brand-600" skin="fill-pastel-peach" />
      <rect x="34" y="124" width="292" height="64" rx="18" className="fill-brand-100" />
      <rect x="34" y="124" width="292" height="12" rx="6" className="fill-brand-200" />
      <rect x="66" y="146" width="70" height="26" rx="6" className="fill-white" />
      <rect x="74" y="153" width="40" height="5" rx="2.5" className="fill-line-strong" />
      <rect x="74" y="162" width="28" height="4" rx="2" className="fill-line" />
      <g>
        <rect x="160" y="106" width="44" height="74" rx="9" className="fill-brand-800" />
        <rect x="165" y="113" width="34" height="58" rx="5" className="fill-white" />
        <rect x="170" y="120" width="10" height="10" rx="1.5" className="fill-brand-800" />
        <rect x="184" y="120" width="10" height="10" rx="1.5" className="fill-brand-800" />
        <rect x="170" y="134" width="10" height="10" rx="1.5" className="fill-brand-800" />
        <rect x="186" y="136" width="5" height="5" rx="1" className="fill-brand-800" />
        <rect x="170" y="152" width="24" height="9" rx="4.5" className="fill-teal-500" />
      </g>
      <g>
        <circle cx="262" cy="156" r="14" className="fill-teal-500" />
        <path
          d="M255 156 l5 5 9 -10"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-white"
        />
      </g>
    </svg>
  )
}

/** A small report: bars and a donut, for the results and reports parts of the guide. */
export function ReportIllustration({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 220" className={className} aria-hidden="true" focusable="false">
      <circle cx="320" cy="40" r="22" className="fill-pastel-mint" />
      <rect
        x="40"
        y="26"
        width="280"
        height="172"
        rx="18"
        className="fill-white stroke-brand-200"
        strokeWidth="2"
      />
      <rect x="64" y="46" width="110" height="9" rx="4.5" className="fill-brand-800" />
      <rect x="64" y="62" width="70" height="6" rx="3" className="fill-line-strong" />
      <rect x="70" y="150" width="20" height="28" rx="4" className="fill-chart-passed" />
      <rect x="98" y="122" width="20" height="56" rx="4" className="fill-chart-passed" />
      <rect x="126" y="134" width="20" height="44" rx="4" className="fill-chart-blocked" />
      <rect x="154" y="104" width="20" height="74" rx="4" className="fill-chart-progress" />
      <rect x="64" y="180" width="118" height="3" rx="1.5" className="fill-line-strong" />
      <circle cx="252" cy="130" r="38" className="fill-chart-track" />
      <path d="M252 92 a38 38 0 1 1 -33 57 l33 -19z" className="fill-chart-passed" />
      <path d="M219 149 a38 38 0 0 1 4 -43 l29 24z" className="fill-chart-failed" />
      <circle cx="252" cy="130" r="20" className="fill-white" />
    </svg>
  )
}

/** One row of the checklist board: a tick (done) or an empty ring (still to try). */
function ChecklistRow({ y, done }: { y: number; done: boolean }) {
  return (
    <g>
      {done ? (
        <>
          <circle cx="102" cy={y} r="13" className="fill-teal-500" />
          <path
            d={`M96 ${y} l4.5 4.5 8 -9`}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-white"
          />
        </>
      ) : (
        <circle
          cx="102"
          cy={y}
          r="12"
          strokeWidth="2.5"
          strokeDasharray="4 4"
          className="fill-white stroke-brand-300"
        />
      )}
      <rect x="126" y={y - 9} width="80" height="7" rx="3.5" className="fill-line-strong" />
      <rect x="126" y={y + 3} width="52" height="6" rx="3" className="fill-line" />
    </g>
  )
}

/** A small QR code on the phone (three finder squares and a few modules). */
function QrModules() {
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width="14" height="14" rx="2" className="fill-brand-800" />
      <rect x={x + 2} y={y + 2} width="10" height="10" rx="1.5" className="fill-white" />
      <rect x={x + 4} y={y + 4} width="6" height="6" rx="1" className="fill-brand-800" />
    </g>
  )
  const modules = [
    [255, 131],
    [261, 137],
    [255, 143],
    [270, 150],
    [276, 156],
    [255, 156],
    [263, 163],
    [271, 169],
    [279, 170],
    [257, 170],
    [279, 148],
    [264, 150],
  ]
  return (
    <g>
      {finder(237, 130)}
      {finder(269, 130)}
      {finder(237, 162)}
      {modules.map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="5"
          height="5"
          rx="1"
          className="fill-brand-800"
        />
      ))}
    </g>
  )
}

/**
 * Welcome picture for the sign-in page: a checklist board (testing together) next to a
 * phone showing the table card QR. Decorative only, in the "Biru Pasker" palette.
 */
export function WelcomeIllustration({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 260" className={className} aria-hidden="true" focusable="false">
      <circle cx="68" cy="58" r="44" className="fill-pastel-butter" />
      <circle cx="304" cy="214" r="54" className="fill-teal-100" />
      <circle cx="320" cy="58" r="16" className="fill-pastel-peach" />
      <rect x="22" y="192" width="40" height="40" rx="12" className="fill-brand-100" />

      <rect
        x="70"
        y="40"
        width="170"
        height="196"
        rx="18"
        strokeWidth="2"
        className="fill-white stroke-brand-200"
      />
      <rect x="124" y="28" width="62" height="24" rx="12" className="fill-brand-600" />
      <circle cx="155" cy="40" r="5" className="fill-white" />
      <ChecklistRow y={88} done />
      <ChecklistRow y={134} done />
      <ChecklistRow y={180} done={false} />

      <rect x="214" y="96" width="92" height="152" rx="16" className="fill-brand-800" />
      <rect x="222" y="108" width="76" height="122" rx="9" className="fill-white" />
      <QrModules />
      <rect x="240" y="192" width="40" height="5" rx="2.5" className="fill-brand-200" />
      <rect x="234" y="205" width="52" height="14" rx="7" className="fill-teal-500" />
      <rect x="246" y="237" width="28" height="4" rx="2" className="fill-white/50" />

      <path
        d="M326 118 l3.5 8.5 8.5 3.5 -8.5 3.5 -3.5 8.5 -3.5 -8.5 -8.5 -3.5 8.5 -3.5z"
        className="fill-brand-500"
      />
      <path
        d="M44 128 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z"
        className="fill-teal-500"
      />
    </svg>
  )
}

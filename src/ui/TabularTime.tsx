const DIGIT = /[0-9]/

// Wraps each digit in a fixed-width span (spec §5.3) so the layout never
// jitters per second, regardless of whether the loaded Fraunces cut
// actually exposes the tnum OpenType feature. Shared by the live Timer
// readout and History's fast card (feature request #6, ISSUES.md), which
// reuses the same HH:MM:SS notation instead of prose duration.
export function TabularTime({ value }: { value: string }) {
  return (
    <>
      {[...value].map((char, i) => (
        <span key={i} className={DIGIT.test(char) ? 'tnum-digit' : undefined}>
          {char}
        </span>
      ))}
    </>
  )
}

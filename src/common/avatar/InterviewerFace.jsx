// The drawing of an interviewer: a flat illustrated bust in a 120x120 box. Shared by the animated
// Avatar on the interview screen and the static picker on the setup screen.
//   person     one entry of INTERVIEWERS (colors and hair style)
//   mouthRef   optional ref to the mouth, so Avatar can open and close it without re-rendering
//   children   extra SVG drawn on top (Avatar adds the "thinking" dots here)
//
// The class names (av-eyes, av-eye, av-brows) are hooks for Avatar.css. On their own they do nothing,
// so the picker simply shows a still face.
export default function InterviewerFace({ person, mouthRef, children }) {
  const { skin, neck, hair, hairStyle, blazer, shirt, bg } = person

  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <rect width="120" height="120" fill={bg} />

      {/* Hair that falls behind the head */}
      {hairStyle === "long" && <path d="M33 54 Q29 20 60 20 Q91 20 87 54 L90 90 Q60 98 30 90Z" fill={hair} />}
      {hairStyle === "bob" && <path d="M33 56 Q30 21 60 21 Q90 21 87 56 L86 72 Q60 78 34 72Z" fill={hair} />}

      {/* Shoulders, collar and neck */}
      <path d="M14 120 Q14 88 60 84 Q106 88 106 120Z" fill={blazer} />
      <path d="M50 84 L60 102 L70 84Z" fill={shirt} />
      <rect x="52" y="68" width="16" height="18" rx="6" fill={neck} />

      {/* Ears and head */}
      <ellipse cx="38.5" cy="55" rx="3.5" ry="5.5" fill={skin} />
      <ellipse cx="81.5" cy="55" rx="3.5" ry="5.5" fill={skin} />
      <ellipse cx="60" cy="52" rx="22" ry="26" fill={skin} />

      {/* Front hair */}
      {hairStyle === "short" ? (
        <path d="M37 50 Q35 24 60 24 Q85 24 83 50 Q78 36 60 36 Q42 36 37 50Z" fill={hair} />
      ) : (
        <path d="M37 52 Q36 25 60 25 Q84 25 83 52 Q80 38 66 34 Q50 40 37 52Z" fill={hair} />
      )}

      {/* Face */}
      <path
        d="M60 57 Q57.5 62 60.5 63"
        fill="none"
        stroke={neck}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <g className="av-brows" fill="none" stroke={hair} strokeWidth="2" strokeLinecap="round">
        <path d="M45 47 Q50 44 55 47" />
        <path d="M65 47 Q70 44 75 47" />
      </g>
      <g className="av-eyes">
        <ellipse className="av-eye" cx="50" cy="54" rx="2.8" ry="3" fill="#2b2438" />
        <ellipse className="av-eye" cx="70" cy="54" rx="2.8" ry="3" fill="#2b2438" />
      </g>
      <ellipse ref={mouthRef} cx="60" cy="69" rx="6" ry="1.8" fill="#8a3b3b" />

      {children}
    </svg>
  )
}
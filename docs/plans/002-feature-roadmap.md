# Feature Roadmap: GLP-1 Weight Loss Tracker

## Current Features

- Weight logging/tracking
- Injection logging
- Stats/analytics
- User auth
- Basic inventory management (track meds, units remaining, expiration)

## Planned Features

### Dosage & Scheduling

- Multi-med support (Ozempic, Mounjaro, Wegovy, Zepbound, compounded)
- Titration schedule per med (each has different ramp-up)
- Injection day reminders
- Dose history timeline (especially useful for med switchers)
- "Time on current dose" tracking

### Inventory Management (Enhancements)

- ~~Track multiple meds simultaneously~~ ✓
- ~~Units/mg remaining per pen~~ ✓
- Auto-calculate doses left based on current dose
- Refill alerts (X days until empty)
- ~~Expiration tracking~~ ✓
- Prescription refill date reminders

### Enhanced Analytics

- Weight loss rate segmented by med + dose
- Compare effectiveness across meds (for switchers)
- Plateau detection
- Projected goal date
- Loss per week/month averages
- "Best performing dose" insights

### Compliance & Patterns

- Injection site rotation (thigh L/R, abdomen L/R, arm L/R)
- Streak/consistency tracking
- Missed dose logging with reschedule logic
- Weekly adherence percentage

### Side Effects & Tolerability

- Simple side effect check-in (nausea, fatigue, constipation - common GLP-1
  stuff)
- Correlate side effects with dose level
- Track side effect severity over time (tolerance building)

### Progress & Goals

- Goal weight + checkpoints
- Starting weight per med (useful context for switchers)

### Progress Pictures

- Photo upload with date/weight association
- Before/after comparison view
- Photo timeline/gallery
- Optional notes per photo
- Privacy-first (local-only option or encrypted storage)

### Michelle's idea: Compare trendline between drugs + Dosage

- Which drug did best for me
- Which dosage did best for me, etc

## Design Constraints

- Weight loss focus only (no diabetic features)
- Multi-medication support required
- Web primary
- No food tracking (too much scope)

## Priority Recommendations

High value, low scope:

1. Inventory management + titration schedules (biggest gap in existing apps)
2. Side effect tracking (lightweight but valuable)
3. Progress pictures (high user motivation value)

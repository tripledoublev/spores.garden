# Special Spore Mechanics

Special spores are a client-validated, decentralized capture-the-flag mechanic.

## Current Guardrails

- **Deterministic rarity**: A spore is only considered valid if `isValidSpore(originDid)` returns true.
- **Timestamp validity window**: Capture records with `createdAt` more than 5 minutes in the future are ignored.
- **Steal cooldown**: A spore cannot be stolen again until 1 minute after the last valid capture timestamp.
- **Current-holder resolution**: Holder is derived from backlinks by sorting valid capture records by `createdAt`.

## Trust Model

This system intentionally does **not** provide hard, consensus-level game integrity. It is a best-effort client policy for a social game.

- Anyone can write records in their own repo.
- Clocks can be wrong or intentionally manipulated.
- Different clients could enforce different policy.

The spores.garden client enforces the above guardrails for consistent behavior inside this app, while keeping data and writes fully decentralized.

## Operational Notes

- Future records outside the allowed skew are treated as invalid for holder calculation.
- If no valid capture records exist for an origin, the spore is treated as unavailable.
- Cooldown checks run at steal time to reduce rapid re-capture spam.

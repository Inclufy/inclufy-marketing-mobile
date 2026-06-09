# Data Protection Impact Assessment (DPIA) Template — Inclufy

**Standard:** GDPR Art. 35
**Owner:** DPO (privacy@inclufy.com)
**Template version:** 2026-06-09

Use this template whenever a new processing activity is "likely to
result in a high risk to the rights and freedoms of natural persons"
(Art. 35(1)). The Dutch DPA (AP) lists 9 criteria — if your activity
meets two or more, a DPIA is mandatory. See § 1 below.

Fill out one DPIA per processing activity. Store completed DPIAs at
`docs/dpia/<YYYY-MM-DD>-<activity-slug>.md`. Link the completed DPIA
from `docs/ROPA.md` § F.

---

## 1. When is a DPIA mandatory? (screening test)

Check each criterion that applies to the new processing:

| # | Criterion | Yes/No |
|---|---|---|
| 1 | Evaluation or scoring (incl. profiling, predictive scoring) | ⬜ |
| 2 | Automated decision-making with legal or significant effect | ⬜ |
| 3 | Systematic monitoring (incl. of publicly accessible areas) | ⬜ |
| 4 | Sensitive data or data of highly personal nature (special-cat, Art. 9–10) | ⬜ |
| 5 | Data processed on a large scale | ⬜ |
| 6 | Matching or combining datasets from different sources | ⬜ |
| 7 | Data concerning vulnerable data subjects (children, employees, patients) | ⬜ |
| 8 | Innovative use of new technology (e.g. novel AI applications) | ⬜ |
| 9 | Processing that prevents data subjects from exercising a right or using a service | ⬜ |

**If ≥ 2 checked → DPIA is mandatory.**
**If 1 checked → strongly recommended.**
**If 0 → not required.**

Record the screening outcome here:
- Date: `YYYY-MM-DD`
- Screened by: `<name>`
- Outcome: `MANDATORY / RECOMMENDED / NOT REQUIRED`

---

## 2. Describe the processing

### 2.1 What
- Activity name: `<short noun phrase>`
- Brief description (1-3 sentences):

### 2.2 Why
- Purpose: `<primary purpose>`
- Lawful basis: `Art. 6(1)(_) — <name>`
- If Art. 9 special-cat: lawful basis under Art. 9(2)(_):
- Intended business outcome:

### 2.3 How
- Data flow diagram or numbered steps:
- New tables / columns / edge fns:
- Sub-processors involved (new or existing):
- Data retention period and basis:

### 2.4 Who
- Data subjects: `<users / contacts / employees / minors / ...>`
- Estimated number affected:
- Vulnerable groups present? Y/N — if Y, describe protections.

---

## 3. Consultation

GDPR Art. 35(9) requires consulting data subjects (or their
representatives) "where appropriate". For internal-facing activities a
consultation may not be appropriate; document the rationale either way.

- Was consultation performed? Y/N
- Method (survey / interview / public posting):
- Summary of feedback:
- How feedback was addressed:

---

## 4. Necessity & proportionality

Art. 35(7)(b) — show the processing is necessary and proportional:

- **Necessity:** can the purpose be achieved without this data? If yes, why are you doing it anyway?
- **Proportionality:** is the volume of data and the depth of processing the minimum required?
- **Less-intrusive alternatives considered:** list 2-3 alternatives and reasons rejected.

---

## 5. Risk assessment

For each risk, score Likelihood (1–5) × Impact (1–5).

| # | Risk to data subject | Likelihood | Impact | Score | Treatment |
|---|---|---|---|---|---|
| 1 | Unauthorized access leaks the data | | | | |
| 2 | Inaccurate data causes wrong decision | | | | |
| 3 | Sub-processor over-retention | | | | |
| 4 | International transfer to high-risk jurisdiction | | | | |
| 5 | Re-identification of anonymized data | | | | |
| 6 | Discrimination via algorithmic profiling | | | | |
| 7 | Loss of control by data subject | | | | |
| 8 | <other> | | | | |

Treatment options: **avoid** (don't do the processing) / **mitigate** (technical or organizational control) / **transfer** (insurance / contract) / **accept** (residual risk, with documented sign-off).

---

## 6. Mitigation measures

For each risk above scored ≥ 9 (Likelihood × Impact), list the specific
control implemented and reference its evidence (RLS policy file, edge fn,
ISMS section).

| Risk # | Mitigation | Evidence |
|---|---|---|
| | | |

---

## 7. Residual risk & sign-off

- Highest residual risk score after mitigation: `__ / 25`
- Is this acceptable? Y/N
- If N, the processing must be modified before launch.
- If Y, controller (CISO) signs off below:

```
Signed: ___________________________
Name:   Sami Loukile
Role:   CISO / DPO delegate
Date:   YYYY-MM-DD
```

---

## 8. Review & re-assessment

- Review cadence (default annual):
- Triggers for re-assessment: new sub-processor / new jurisdiction /
  scope expansion / breach / regulatory change.
- Re-assessment history:

| Date | Reviewer | Outcome |
|---|---|---|
| | | |

---

## 9. Prior consultation with supervisory authority (Art. 36)

If after all mitigations the residual risk is still high, controller
MUST consult AP before processing starts. Record:

- Consulted AP? Y/N
- Reference number:
- AP response date:
- AP response summary:
- Changes made in response:

---

*This template implements GDPR Art. 35 and the AP's January 2025
guidance. Completed DPIAs are confidential and stored only in this repo
under `docs/dpia/`.*

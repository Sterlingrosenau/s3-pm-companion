# S3 PMP Study Companion — Version 2

A mobile-first, installable study companion aligned to PMI's July 2026 PMP Examination Content Outline.

## What is included

- A date-driven study plan that recalculates for the selected August exam date
- 100 original, difficult scenario questions with answer explanations and exam-decision lenses
- Exact blueprint weighting: People 33%, Process 41%, and Business Environment 26%
- Approach weighting: 40% predictive and 60% split between adaptive/agile and hybrid
- Filters for unanswered, missed, and flagged questions
- Domain and approach accuracy tracking
- Study-session logging, streaks, question coverage, and an explained readiness estimate
- Offline use after the first hosted visit and home-screen installation as a progressive web app
- Local browser storage and JSON progress export

## Fastest way to use it

Double-click `index.html`. The study plan, questions, explanations, and tracker work directly in a modern browser.

For home-screen installation and offline caching, publish the folder to any HTTPS static host such as GitHub Pages. No build step, package installation, framework, or database is required.

## Publish with GitHub Pages

1. Add every file and folder in this package to the root of the repository.
2. In the repository, open **Settings → Pages**.
3. Select the repository's main branch and root folder as the Pages source.
4. Open the published URL on a phone and choose **Add to Home Screen** or **Install app**.

## Validate the question bank

If Node.js is available, run:

```sh
node tests/validate-questions.js
```

The check verifies the total count, domain and approach distribution, answer-key balance, unique IDs, and required explanation fields.

## Progress and privacy

Progress is stored in the current browser using local storage. Clearing browser site data clears progress. Use **Export progress** from the tracker to create a JSON backup.

The readiness estimate is a transparent study indicator:

- 60% recent practice accuracy
- 25% question-bank coverage
- 15% scheduled-session completion

It is not a PMI passing score or exam-result prediction.

## Sources and disclaimer

- [PMI PMP Examination Content Outline — July 2026](https://www.pmi.org/-/media/pmi/documents/public/pdf/certifications/new-pmp-examination-content-outline-2026.pdf)
- [PMI: What's new in the updated PMP exam](https://www.pmi.org/certifications/project-management-pmp/new-exam)
- [PMI PMP certification information](https://www.pmi.org/certifications/project-management-pmp)

All practice questions are original study items, not actual PMI examination questions. This independent tool is not affiliated with or endorsed by Project Management Institute, Inc. PMI, PMP, and PMBOK are marks of Project Management Institute, Inc.

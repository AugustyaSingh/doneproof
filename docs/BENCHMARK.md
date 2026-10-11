# DoneProof benchmark protocol

## Two different experiments

`python -m doneproof.benchmark` runs offline reference controls. These four
handcrafted plans check that the calibration engine identifies expected seeded
faults in `login-auth-v1`. They test evaluator plumbing; they say nothing about
Gemma's plan-generation quality.

`python -m doneproof.benchmark --live` calls the real hosted Gemma model for
every requested repeat and scores the generated scenario selections. A missing
API key, provider failure, malformed response, invalid plan, or evaluation
failure is recorded as a failed attempt; there is no mock, cache, retry-by
handcrafted-plan, or silent model fallback.

The checked-in corpus `benchmarks/login-auth-v1.json` has corpus version
`doneproof-benchmark-corpus.v1`. It contains one task description and project
context, expected scenario outcomes, and the expected fault set. The runner
fails closed if scenario or mutant labels drift from the fixture in
`doneproof/login_fixture.py`. The trusted implementation and each seeded mutant
are ordinary Python functions. No generated code is executed.

The task is deliberately narrow: selecting tests for a toy authentication
contract. The login oracle, scenarios, and seeded fault labels were authored
against that stated behavior and are inspectable in the corpus and fixture.
This is not a broad or blinded software defect dataset; an independent judge
should review the oracle and mutations before interpreting quality. We do not
claim general-purpose bug detection from this benchmark.

## Live command and artifact

```powershell
python -m pip install -r requirements-gemma.txt
$env:GEMINI_API_KEY = "YOUR_KEY_HERE"
python -m doneproof.benchmark --live --repeats 3 --output artifacts/gemma-live-2026-10-11.json
```

Repeats are 1–20. Each is a fresh request; hosted-model variation is part of
the experiment. `DONEPROOF_GEMMA_MODEL` or `--model` may choose either
documented Gemma 4 model. The output path is opened exclusively so prior
evidence is never overwritten. Without `--output`, the artifact JSON prints to
stdout. The artifact includes the model, repository revision, timestamp,
benchmark/corpus, prompt, and plan schema versions, configuration, each generated plan or failure,
calibration report, latency, and provider-reported token usage if available.
It does not contain the API key or an estimated price.

Reproduction can still vary with hosted model/version drift, sampling behavior,
rate limits, API availability, and provider-side retries. The artifact records
the returned model version and reported usage when supplied. A saved artifact
is a record of that run, not a cached substitute for a new live call.

## Metrics and denominators

| Metric | Calculation |
| --- | --- |
| Plan schema validity | Valid plans / all requested generations |
| Actionable scenario rate | Unique allowlisted behavioral scenario selectors / all check objects in parseable generated plan JSON. This measures supported-action validity, not semantic plan quality; unparseable outputs are covered by schema validity. |
| Scenario coverage | Unique selected scenarios / (5 fixture scenarios × valid plans) |
| Defect detection | Killed seeded mutants / (4 seeded mutants × valid plans) |
| False positives | Failed expected scenarios on the known-correct implementation / selected expected scenarios |
| Execution failure rate | Generation, validation, or evaluation failures / all requested generations. No generated command or code runs. |
| Latency | Mean elapsed time for each requested generation, including failures |
| Token usage | Sum of provider-reported prompt/candidate/total tokens. Missing values remain missing/partial; no price estimate is inferred. |

If a denominator is zero, the corresponding percentage is `null`. Keep all
failed attempts when reporting a run. Mutation score is defined only against
these four seeded faults. A perfect score is not evidence of general
correctness.

## Offline verification

The unit suite requires no key and no network. Provider mocks test parsing,
validation, and errors only; they are never labeled as Gemma benchmark output.

```powershell
python -m unittest discover -s tests -v
python -m doneproof.benchmark
```

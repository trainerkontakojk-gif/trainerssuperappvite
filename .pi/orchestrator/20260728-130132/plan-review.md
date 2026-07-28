Status: Reviewed and refined.
Files: plan/markdown/telefun-hard-sad-consumer.md
Tests: `bash -lc 'test -s plan/markdown/telefun-hard-sad-consumer.md; echo exit:$?'` → exit:0
Typecheck/Lint: not run
Build: not run
Notes: Explicitly made legacy `pasrah` normalization merge-only (`difficulty: Hard` only), preserved custom `name`/`gender`/`description`, kept runtime prompt ID-based, removed unnecessary save-path test scope, and added final gates for focused tests, web typecheck/build, root lint/build/test:core, `graphify update .`, thermo-nuclear review, docs sync, and diff checks.

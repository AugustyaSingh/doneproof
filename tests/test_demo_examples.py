"""Keep the judge-facing example contracts tied to real verifier behavior."""
from __future__ import annotations

import json
import unittest
from pathlib import Path

from doneproof.verifier import verify_task


ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ROOT / "examples"


class DemoExampleTests(unittest.TestCase):
    def load_and_verify(self, filename: str) -> dict:
        task = json.loads((EXAMPLES / filename).read_text(encoding="utf-8"))
        return verify_task(task, ROOT)

    def test_artifact_review_shows_observed_and_unsupported_evidence(self):
        report = self.load_and_verify("artifact-review.json")
        statuses = {item["check"]: item["status"] for item in report["checks"]}
        self.assertEqual(statuses, {
            "sample-contract-is-valid-json": "passed",
            "demo-guide-is-present": "passed",
            "security-claim-review": "unsupported",
        })
        self.assertEqual(report["status"], "PARTIAL")

    def test_workspace_boundary_example_rejects_outside_path(self):
        report = self.load_and_verify("workspace-boundary.json")
        statuses = {item["check"]: item["status"] for item in report["checks"]}
        self.assertEqual(statuses, {
            "readme-inside-workspace": "passed",
            "outside-path-is-rejected": "failed",
        })
        rejected = next(item for item in report["checks"] if item["check"] == "outside-path-is-rejected")
        self.assertEqual(rejected["evidence"], "Rejected path outside task directory")
        self.assertEqual(report["status"], "PARTIAL")


if __name__ == "__main__":
    unittest.main()

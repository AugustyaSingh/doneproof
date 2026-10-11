import hashlib
import tempfile
import unittest
from pathlib import Path
from doneproof.verifier import verify_task


class VerifyTaskTests(unittest.TestCase):
    def test_all_checks_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "result.txt").write_text("ok", encoding="utf-8")
            report = verify_task({"task_id": "pass", "required_files": ["result.txt"],
                                  "command_results": [{"label": "tests", "exit_code": 0}]}, tmp)
            self.assertEqual(report["status"], "PARTIAL")
            self.assertEqual(report["checks_passed"], 1)
            self.assertEqual(report["checks_unverified"], 1)

    def test_failed_command_is_not_verified(self):
        report = verify_task({"task_id": "fail",
                              "command_results": [{"label": "tests", "exit_code": 1}]})
        self.assertEqual(report["status"], "PARTIAL")
        self.assertEqual(report["checks_unverified"], 1)
        self.assertEqual(report["checks_failed"], 0)

    def test_mixed_results_are_partial(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "present.txt").write_text("ok", encoding="utf-8")
            report = verify_task({"task_id": "partial",
                                  "required_files": ["present.txt", "missing.txt"]}, tmp)
            self.assertEqual(report["status"], "PARTIAL")

    def test_empty_checks_are_partial(self):
        self.assertEqual(verify_task({"task_id": "empty"})["status"], "PARTIAL")

    def test_rejects_missing_task_id(self):
        with self.assertRaises(ValueError):
            verify_task({})

    def test_rejects_invalid_required_files_type(self):
        with self.assertRaises(ValueError):
            verify_task({"task_id": "bad", "required_files": "README.md"})

    def test_rejects_invalid_command_result(self):
        with self.assertRaises(ValueError):
            verify_task({"task_id": "bad", "command_results": [{"exit_code": "0"}]})

    def test_rejects_path_traversal(self):
        report = verify_task({"task_id": "traversal", "required_files": ["../outside.txt"]}, ".")
        self.assertEqual(report["status"], "FAILED")
        self.assertIn("Rejected path", report["checks"][0]["evidence"])

    def test_generic_checks_distinguish_observations_from_claims(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "report.json").write_text("{}", encoding="utf-8")
            report = verify_task({
                "task_id": "generic-pass",
                "checks": [
                    {"id": "report", "kind": "required_file", "path": "report.json"},
                    {
                        "id": "unit-tests",
                        "kind": "test_result",
                        "exit_code": 0,
                        "summary": "35 tests passed",
                    },
                ],
            }, tmp)

        self.assertEqual(report["status"], "PARTIAL")
        self.assertEqual(report["checks_passed"], 1)
        self.assertEqual(report["checks_failed"], 0)
        self.assertEqual(report["checks_unverified"], 1)
        self.assertEqual(report["checks_unsupported"], 0)
        self.assertEqual(
            [check["check"] for check in report["checks"]],
            ["report", "unit-tests"],
        )

    def test_unknown_check_kind_stays_unsupported(self):
        report = verify_task({
            "task_id": "future-check",
            "checks": [{"id": "git-clean", "kind": "repository_state"}],
        })

        self.assertEqual(report["status"], "PARTIAL")
        self.assertEqual(report["checks_unsupported"], 1)
        self.assertEqual(report["checks_failed"], 0)
        self.assertEqual(report["checks"][0]["status"], "unsupported")

    def test_integration_can_supply_a_trusted_evaluator(self):
        report = verify_task(
            {
                "task_id": "custom-check",
                "checks": [{
                    "id": "branch-policy",
                    "kind": "branch_policy",
                    "expected_branch": "main",
                }],
            },
            check_evaluators={
                "branch_policy": lambda check, _root: {
                    "passed": check["expected_branch"] == "main",
                    "evidence": "Branch policy matched",
                },
            },
        )

        self.assertEqual(report["status"], "VERIFIED")
        self.assertEqual(report["checks"][0]["evidence"], "Branch policy matched")
        self.assertEqual(report["checks"][0]["evidence_source"], "trusted_evaluator")

    def test_evaluator_exception_is_unresolved_and_does_not_abort_report(self):
        def unavailable(_check, _root):
            raise RuntimeError("private provider details")

        report = verify_task(
            {
                "task_id": "provider-error",
                "checks": [
                    {"id": "remote-state", "kind": "remote_state"},
                    {
                        "id": "other",
                        "kind": "required_file",
                        "path": "missing.txt",
                    },
                ],
            },
            check_evaluators={"remote_state": unavailable},
        )

        self.assertEqual(report["status"], "PARTIAL")
        self.assertEqual(report["checks_errored"], 1)
        self.assertEqual(report["checks_failed"], 1)
        self.assertEqual(report["checks"][0]["status"], "error")
        self.assertEqual(
            report["checks"][0]["evidence"],
            "Evaluator raised RuntimeError",
        )

    def test_invalid_evaluator_result_is_an_error_not_a_pass(self):
        report = verify_task(
            {
                "task_id": "invalid-evaluator-result",
                "checks": [{"id": "custom", "kind": "custom"}],
            },
            check_evaluators={"custom": lambda _check, _root: {"passed": "yes"}},
        )

        self.assertEqual(report["status"], "PARTIAL")
        self.assertEqual(report["checks_errored"], 1)
        self.assertIsNone(report["checks"][0]["passed"])

    def test_custom_evaluator_cannot_return_non_json_evidence(self):
        report = verify_task(
            {"task_id": "bad-evidence", "checks": [{"kind": "custom"}]},
            check_evaluators={"custom": lambda _check, _root: {"passed": True, "evidence": object()}},
        )
        self.assertEqual(report["status"], "PARTIAL")
        self.assertEqual(report["checks_errored"], 1)

    def test_path_exists_can_require_a_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "reports").mkdir()
            report = verify_task({
                "task_id": "directory",
                "checks": [{"kind": "path_exists", "path": "reports", "entry_type": "directory"}],
            }, tmp)
        self.assertEqual(report["status"], "VERIFIED")
        self.assertEqual(report["checks"][0]["evidence_source"], "local_observation")

    def test_path_exists_rejects_entry_type_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "artifact.txt").write_text("ok", encoding="utf-8")
            report = verify_task({
                "task_id": "entry-type",
                "checks": [{"kind": "path_exists", "path": "artifact.txt", "entry_type": "directory"}],
            }, tmp)
        self.assertEqual(report["status"], "FAILED")

    def test_file_sha256_matches_observed_file_content(self):
        content = b"reproducible output"
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "artifact.bin").write_bytes(content)
            report = verify_task({
                "task_id": "artifact-digest",
                "checks": [{
                    "id": "artifact", "kind": "file_sha256", "path": "artifact.bin",
                    "sha256": hashlib.sha256(content).hexdigest(),
                }],
            }, tmp)
        self.assertEqual(report["status"], "VERIFIED")
        self.assertEqual(report["checks"][0]["evidence"]["algorithm"], "sha256")

    def test_file_sha256_mismatch_fails_with_actual_digest(self):
        content = b"actual content"
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "artifact.bin").write_bytes(content)
            report = verify_task({
                "task_id": "artifact-digest",
                "checks": [{
                    "kind": "file_sha256", "path": "artifact.bin", "sha256": "0" * 64,
                }],
            }, tmp)
        self.assertEqual(report["status"], "FAILED")
        self.assertEqual(report["checks"][0]["evidence"]["actual"], hashlib.sha256(content).hexdigest())

    def test_file_sha256_rejects_invalid_expected_digest(self):
        report = verify_task({
            "task_id": "invalid-digest",
            "checks": [{"kind": "file_sha256", "path": "artifact.bin", "sha256": "bad"}],
        })
        self.assertEqual(report["status"], "PARTIAL")
        self.assertEqual(report["checks_errored"], 1)
        self.assertEqual(report["checks"][0]["status"], "error")

    def test_json_valid_checks_syntax_and_rejects_invalid_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "valid.json").write_text('{"ok": true}', encoding="utf-8")
            Path(tmp, "invalid.json").write_text('{not-json}', encoding="utf-8")
            Path(tmp, "nonstandard.json").write_text('{"value": NaN}', encoding="utf-8")
            report = verify_task({
                "task_id": "json-artifacts",
                "checks": [
                    {"kind": "json_valid", "path": "valid.json"},
                    {"kind": "json_valid", "path": "invalid.json"},
                    {"kind": "json_valid", "path": "nonstandard.json"},
                ],
            }, tmp)
        self.assertEqual(report["status"], "PARTIAL")
        self.assertEqual(report["checks_passed"], 1)
        self.assertEqual(report["checks_failed"], 2)
        self.assertEqual(report["checks"][1]["evidence"]["error"], "JSONDecodeError")
        self.assertEqual(report["checks"][2]["evidence"]["error"], "JSONDecodeError")

    def test_rejects_duplicate_generic_check_ids(self):
        with self.assertRaisesRegex(ValueError, "duplicate check id"):
            verify_task({
                "task_id": "duplicate",
                "checks": [
                    {"id": "same", "kind": "required_file", "path": "a"},
                    {"id": "same", "kind": "required_file", "path": "b"},
                ],
            })

    def test_generic_file_checks_reject_path_traversal(self):
        report = verify_task({
            "task_id": "generic-traversal",
            "checks": [{
                "id": "outside",
                "kind": "required_file",
                "path": "../outside.txt",
            }],
        })

        self.assertEqual(report["status"], "FAILED")
        self.assertIn("Rejected path", report["checks"][0]["evidence"])


if __name__ == "__main__":
    unittest.main()

import tempfile
import unittest
from pathlib import Path

from doneproof.verifier import verify_task


class VerifyTaskTests(unittest.TestCase):
    def test_all_checks_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "result.txt").write_text("ok", encoding="utf-8")
            report = verify_task({
                "task_id": "pass-case",
                "required_files": ["result.txt"],
                "command_results": [{"label": "tests", "exit_code": 0}]
            }, tmp)
            self.assertEqual(report["status"], "VERIFIED")
            self.assertEqual(report["checks_failed"], 0)

    def test_failed_command_is_not_verified(self):
        report = verify_task({
            "task_id": "fail-case",
            "command_results": [{"label": "tests", "exit_code": 1}]
        })
        self.assertEqual(report["status"], "FAILED")

    def test_mixed_results_are_partial(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "present.txt").write_text("ok", encoding="utf-8")
            report = verify_task({
                "task_id": "partial-case",
                "required_files": ["present.txt", "missing.txt"]
            }, tmp)
            self.assertEqual(report["status"], "PARTIAL")

    def test_empty_checks_are_partial(self):
        report = verify_task({"task_id": "empty-case"})
        self.assertEqual(report["status"], "PARTIAL")

    def test_rejects_missing_task_id(self):
        with self.assertRaises(ValueError):
            verify_task({})


if __name__ == "__main__":
    unittest.main()

import json
import unittest
from unittest.mock import Mock

from doneproof.gemma_planner import suggest_verification_plan, validate_plan


VALID_PLAN = {
    "task_summary": "Fix the login bug",
    "checks": [
        {
            "kind": "test_result",
            "description": "Run the regression test",
            "expected_evidence": "The regression test exits with code 0"
        },
        {
            "kind": "required_file",
            "description": "Check the changed module exists",
            "expected_evidence": "The target file exists in the repository"
        }
    ]
}


class GemmaPlannerTests(unittest.TestCase):
    def test_parses_and_validates_model_response(self):
        client = Mock()
        client.models.generate_content.return_value.text = json.dumps(VALID_PLAN)
        result = suggest_verification_plan("Fix the login bug", client=client)
        self.assertEqual(result["task_summary"], "Fix the login bug")
        self.assertEqual(len(result["checks"]), 2)
        self.assertTrue(result["checks"][0]["requires_human_approval"])

    def test_rejects_empty_task(self):
        with self.assertRaises(ValueError):
            suggest_verification_plan("  ", client=Mock())

    def test_rejects_invalid_check_kind(self):
        bad = dict(VALID_PLAN)
        bad["checks"] = [{"kind": "execute_shell", "description": "run it",
                          "expected_evidence": "command output"}]
        with self.assertRaises(ValueError):
            validate_plan(bad)

    def test_rejects_non_json_response(self):
        client = Mock()
        client.models.generate_content.return_value.text = "I think everything is fine."
        with self.assertRaises(ValueError):
            suggest_verification_plan("Check task", client=client)

    def test_rejects_more_than_eight_checks(self):
        bad = {"task_summary": "x", "checks": [
            {"kind": "manual_review", "description": "check", "expected_evidence": "evidence"}
            for _ in range(9)
        ]}
        with self.assertRaises(ValueError):
            validate_plan(bad)

    def test_model_claim_does_not_get_a_passed_field(self):
        client = Mock()
        plan = dict(VALID_PLAN)
        plan["checks"] = [dict(VALID_PLAN["checks"][0], passed=True)]
        client.models.generate_content.return_value.text = json.dumps(plan)
        result = suggest_verification_plan("Fix login", client=client)
        self.assertNotIn("passed", result["checks"][0])


if __name__ == "__main__":
    unittest.main()

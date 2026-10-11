import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from doneproof.gemma_planner import PLAN_SCHEMA_VERSION, _safe_api_error, suggest_verification_plan, validate_plan


VALID_PLAN = {
    "schema_version": PLAN_SCHEMA_VERSION,
    "task_summary": "Fix the login bug",
    "checks": [
        {
            "id": "regression-test",
            "kind": "manual_review",
            "target": "Confirm the regression test is run in trusted CI",
            "inputs": {},
            "description": "Run the regression test",
            "expected_outcome": "A trusted CI run reports success"
        },
        {
            "id": "changed-module",
            "kind": "required_file",
            "target": "src/login.py",
            "inputs": {},
            "description": "Check the changed module exists",
            "expected_outcome": "The target file exists in the repository"
        }
    ]
}


class GemmaPlannerTests(unittest.TestCase):
    def test_parses_and_validates_model_response(self):
        client = Mock()
        client.models.generate_content.return_value.text = json.dumps(VALID_PLAN)
        result = suggest_verification_plan("Fix the login bug", client=client)
        self.assertEqual(result["plan"]["task_summary"], "Fix the login bug")
        self.assertEqual(len(result["plan"]["checks"]), 2)
        self.assertTrue(result["plan"]["checks"][0]["requires_human_approval"])
        self.assertIn("generation", result)

    def test_rejects_empty_task(self):
        with self.assertRaises(ValueError):
            suggest_verification_plan("  ", client=Mock())

    def test_rejects_invalid_check_kind(self):
        bad = dict(VALID_PLAN)
        bad["checks"] = [{"id": "unsafe", "kind": "execute_shell", "target": "run it",
                          "inputs": {}, "expected_outcome": "command output"}]
        with self.assertRaises(ValueError):
            validate_plan(bad)

    def test_rejects_non_json_response(self):
        client = Mock()
        client.models.generate_content.return_value.text = "I think everything is fine."
        with self.assertRaises(ValueError):
            suggest_verification_plan("Check task", client=client)

    def test_rejects_more_than_eight_checks(self):
        bad = {"task_summary": "x", "checks": [
            {"id": f"manual-{i}", "kind": "manual_review", "target": "check", "inputs": {}, "expected_outcome": "evidence"}
            for i in range(9)
        ]}
        with self.assertRaises(ValueError):
            validate_plan(bad)

    def test_model_claim_does_not_get_a_passed_field(self):
        client = Mock()
        plan = dict(VALID_PLAN)
        plan["checks"] = [dict(VALID_PLAN["checks"][0], passed=True)]
        client.models.generate_content.return_value.text = json.dumps(plan)
        result = suggest_verification_plan("Fix login", client=client)
        self.assertNotIn("passed", result["plan"]["checks"][0])

    def test_planner_kinds_follow_verifier_capabilities(self):
        client = Mock()
        plan = {
            "schema_version": PLAN_SCHEMA_VERSION,
            "task_summary": "Validate an artifact",
            "checks": [{
                "id": "artifact-hash",
                "kind": "file_sha256",
                "target": "dist/output.bin",
                "inputs": {"sha256": "a" * 64},
                "description": "Compare the output digest",
                "expected_outcome": "The observed sha256 equals the requested digest",
            }],
        }
        client.models.generate_content.return_value.text = json.dumps(plan)
        result = suggest_verification_plan("Check output", client=client)
        self.assertEqual(result["plan"]["checks"][0]["kind"], "file_sha256")
        prompt = client.models.generate_content.call_args.kwargs["contents"]
        self.assertIn("file_sha256", prompt)

    def test_trusted_integration_can_add_a_planning_kind(self):
        plan = {
            "schema_version": PLAN_SCHEMA_VERSION,
            "task_summary": "Review branch policy",
            "checks": [{
                "id": "branch-policy",
                "kind": "branch_policy",
                "target": "main",
                "inputs": {},
                "description": "Check required branch policy",
                "expected_outcome": "Trusted source reports a compliant branch",
            }],
        }
        self.assertEqual(validate_plan(plan, check_kinds=("branch_policy",))["checks"][0]["kind"], "branch_policy")

    def test_rejects_malformed_check_kind_catalog(self):
        with self.assertRaises(ValueError):
            validate_plan(VALID_PLAN, check_kinds="test_result")

    def test_context_is_passed_to_real_generation_and_usage_metadata_is_reported(self):
        client = Mock()
        client.models.generate_content.return_value.text = json.dumps(VALID_PLAN)
        client.models.generate_content.return_value.usage_metadata = SimpleNamespace(
            prompt_token_count=90, candidates_token_count=21, total_token_count=111,
        )
        client.models.generate_content.return_value.model_version = "gemma-4-26b-a4b-it-2026-10"
        result = suggest_verification_plan("Fix auth", project_context="src/auth.py validates a user", client=client)
        prompt = client.models.generate_content.call_args.kwargs["contents"]
        self.assertIn("src/auth.py validates a user", prompt)
        self.assertEqual(result["generation"]["usage"]["total_tokens"], 111)
        self.assertEqual(result["generation"]["returned_model_version"], "gemma-4-26b-a4b-it-2026-10")

    def test_rejects_unsafe_workspace_targets_and_malformed_digest(self):
        escaped = json.loads(json.dumps(VALID_PLAN))
        escaped["checks"] = [dict(VALID_PLAN["checks"][1], target="../outside.py")]
        with self.assertRaisesRegex(ValueError, "workspace"):
            validate_plan(escaped)
        invalid_hash = {"schema_version": PLAN_SCHEMA_VERSION, "task_summary": "hash", "checks": [{
            "id": "hash", "kind": "file_sha256", "target": "out.bin", "inputs": {"sha256": "not-a-digest"},
            "expected_outcome": "Digest matches",
        }]}
        with self.assertRaisesRegex(ValueError, "sha256"):
            validate_plan(invalid_hash)

    def test_missing_credentials_and_invalid_model_are_explicit(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "GEMINI_API_KEY"):
                suggest_verification_plan("Review task")
        with self.assertRaisesRegex(ValueError, "supported Gemma 4"):
            suggest_verification_plan("Review task", model="some-other-model", client=Mock())

    def test_provider_errors_are_classified_without_echoing_exception_text(self):
        limited = Exception("do not surface this raw body")
        limited.code = 429
        self.assertIn("rate limited", str(_safe_api_error(limited)))
        self.assertNotIn("raw body", str(_safe_api_error(limited)))
        self.assertIn("timed out", str(_safe_api_error(TimeoutError("slow"))))

    def test_empty_output_and_provider_error_are_failure_states(self):
        client = Mock()
        client.models.generate_content.return_value.text = "  "
        with self.assertRaisesRegex(RuntimeError, "empty response"):
            suggest_verification_plan("Review task", client=client)
        client.models.generate_content.side_effect = Exception("provider failure")
        with self.assertRaisesRegex(RuntimeError, "Gemma API request failed"):
            suggest_verification_plan("Review task", client=client)


if __name__ == "__main__":
    unittest.main()

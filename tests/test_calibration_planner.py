import json
import unittest
from unittest.mock import Mock

from doneproof.gemma_planner import suggest_calibration_plan
from doneproof.login_fixture import FIXTURE_ID, SCENARIOS


VALID_PLAN = {
    "task_summary": "Verify login behavior",
    "checks": [
        {
            "kind": "behavioral_scenario",
            "scenario_id": "valid_credentials",
            "description": "Allow valid credentials for an active account.",
            "expected_evidence": "The login attempt succeeds.",
        },
        {
            "kind": "behavioral_scenario",
            "scenario_id": "wrong_password",
            "description": "Reject an incorrect password.",
            "expected_evidence": "The login attempt is rejected.",
        },
        {
            "kind": "behavioral_scenario",
            "scenario_id": "empty_password",
            "description": "Reject an empty password.",
            "expected_evidence": "The login attempt is rejected.",
        },
    ],
}


def mock_client(response):
    client = Mock()
    client.models.generate_content.return_value.text = response
    return client


class CalibrationPlannerTests(unittest.TestCase):
    def test_accepts_and_validates_supported_scenarios(self):
        client = mock_client(json.dumps(VALID_PLAN))

        result = suggest_calibration_plan(
            "Verify login behavior",
            client=client,
        )

        self.assertEqual(result["task_summary"], "Verify login behavior")
        self.assertEqual(len(result["checks"]), 3)
        self.assertEqual(result["checks"][0]["scenario_id"], "valid_credentials")
        self.assertEqual(FIXTURE_ID, "login-auth-v1")

    def test_rejects_unsupported_scenario_id(self):
        plan = json.loads(json.dumps(VALID_PLAN))
        plan["checks"][0]["scenario_id"] = "execute_arbitrary_command"

        with self.assertRaisesRegex(ValueError, "scenario_id"):
            suggest_calibration_plan(
                "Verify login behavior",
                client=mock_client(json.dumps(plan)),
            )

    def test_rejects_duplicate_scenarios(self):
        plan = json.loads(json.dumps(VALID_PLAN))
        plan["checks"][1]["scenario_id"] = plan["checks"][0]["scenario_id"]

        with self.assertRaisesRegex(ValueError, "duplicate"):
            suggest_calibration_plan(
                "Verify login behavior",
                client=mock_client(json.dumps(plan)),
            )

    def test_rejects_plan_with_too_few_checks(self):
        plan = json.loads(json.dumps(VALID_PLAN))
        plan["checks"] = plan["checks"][:1]

        with self.assertRaisesRegex(ValueError, "between 2 and 5"):
            suggest_calibration_plan(
                "Verify login behavior",
                client=mock_client(json.dumps(plan)),
            )

    def test_rejects_empty_task_description(self):
        client = Mock()

        with self.assertRaises(ValueError):
            suggest_calibration_plan("  ", client=client)

        client.models.generate_content.assert_not_called()

    def test_rejects_non_json_response(self):
        with self.assertRaisesRegex(ValueError, "invalid calibration plan"):
            suggest_calibration_plan(
                "Verify login behavior",
                client=mock_client("Everything looks good."),
            )

    def test_model_cannot_mark_a_check_as_passed(self):
        plan = json.loads(json.dumps(VALID_PLAN))
        plan["checks"][0]["passed"] = True

        result = suggest_calibration_plan(
            "Verify login behavior",
            client=mock_client(json.dumps(plan)),
        )

        self.assertNotIn("passed", result["checks"][0])

    def test_prompt_includes_only_the_supported_fixture_catalog(self):
        client = mock_client(json.dumps(VALID_PLAN))

        suggest_calibration_plan("Verify login behavior", client=client)

        prompt = client.models.generate_content.call_args.kwargs["contents"]
        for scenario_id in SCENARIOS:
            self.assertIn(scenario_id, prompt)
        self.assertIn(FIXTURE_ID, prompt)


if __name__ == "__main__":
    unittest.main()

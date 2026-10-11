import unittest

from doneproof.calibration import calibrate_plan, validate_calibration_plan
from doneproof.login_fixture import FIXTURE_ID, SCENARIOS


def make_plan(scenario_ids):
    return {
        "task_summary": "Verify login behavior",
        "checks": [
            {
                "kind": "behavioral_scenario",
                "scenario_id": scenario_id,
                "description": SCENARIOS[scenario_id].description,
                "expected_evidence": (
                    "Observed login outcome matches the expected result."
                ),
            }
            for scenario_id in scenario_ids
        ],
    }


class CalibrationTests(unittest.TestCase):
    def test_full_plan_detects_all_seeded_faults(self):
        report = calibrate_plan(make_plan(list(SCENARIOS)))

        self.assertEqual(report["fixture_id"], FIXTURE_ID)
        self.assertEqual(report["status"], "CALIBRATED")
        self.assertTrue(report["baseline"]["passed"])
        self.assertEqual(report["mutation_testing"]["total_mutants"], 4)
        self.assertEqual(report["mutation_testing"]["killed"], 4)
        self.assertEqual(report["mutation_testing"]["escaped"], 0)
        self.assertEqual(
            report["mutation_testing"]["mutation_score_percent"], 100.0
        )

    def test_incomplete_plan_reports_blind_spots(self):
        report = calibrate_plan(
            make_plan(["valid_credentials", "wrong_password"])
        )

        self.assertEqual(report["status"], "BLIND_SPOTS_FOUND")
        self.assertEqual(report["mutation_testing"]["killed"], 2)
        self.assertEqual(report["mutation_testing"]["escaped"], 2)
        self.assertEqual(
            report["mutation_testing"]["mutation_score_percent"], 50.0
        )

    def test_uses_trusted_fixture_semantics_not_model_prose(self):
        plan = make_plan(["valid_credentials", "wrong_password"])
        plan["checks"][0]["description"] = "Reject every login."
        plan["checks"][0]["expected_evidence"] = "Login must fail."

        validated = validate_calibration_plan(plan)

        valid_check = validated["checks"][0]
        self.assertEqual(
            valid_check["description"],
            SCENARIOS["valid_credentials"].description,
        )
        self.assertEqual(
            valid_check["expected_evidence"],
            "The login attempt succeeds.",
        )

    def test_rejects_plan_without_positive_control(self):
        with self.assertRaisesRegex(ValueError, "positive control"):
            validate_calibration_plan(make_plan(["wrong_password"]))

    def test_rejects_empty_checks(self):
        with self.assertRaises(ValueError):
            validate_calibration_plan(make_plan([]))

    def test_rejects_unsupported_scenario(self):
        plan = make_plan(["wrong_password"])
        plan["checks"][0]["scenario_id"] = "run_arbitrary_command"

        with self.assertRaises(ValueError):
            validate_calibration_plan(plan)

    def test_rejects_duplicate_scenario(self):
        with self.assertRaisesRegex(ValueError, "duplicate"):
            validate_calibration_plan(
                make_plan(["wrong_password", "wrong_password"])
            )

    def test_rejects_wrong_check_kind(self):
        plan = make_plan(["wrong_password"])
        plan["checks"][0]["kind"] = "execute_shell"

        with self.assertRaises(ValueError):
            validate_calibration_plan(plan)

    def test_rejects_unknown_fixture(self):
        with self.assertRaises(ValueError):
            calibrate_plan(
                make_plan(["wrong_password"]),
                fixture_id="untrusted-fixture",
            )

    def test_rejects_missing_task_summary(self):
        plan = make_plan(["wrong_password"])
        plan["task_summary"] = "  "

        with self.assertRaises(ValueError):
            validate_calibration_plan(plan)


if __name__ == "__main__":
    unittest.main()

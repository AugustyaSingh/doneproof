"""HTTP boundary tests for DoneProof's local API."""
from __future__ import annotations

import json
import io
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from doneproof import api


class DoneProofAPITests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name).resolve()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_health_reports_service_ready(self):
        health = api.health()
        self.assertEqual(health["status"], "ok")
        self.assertEqual(health["service"], "doneproof")
        self.assertIsInstance(health["gemma_configured"], bool)
        self.assertTrue(health["gemma_model"])

    def test_controlled_demo_session_tokens_expire_and_require_signature(self):
        with patch.dict(os.environ, {"DONEPROOF_DEMO_PASSWORD": "test-presenter-password"}, clear=True):
            token = api._demo_token()
            self.assertTrue(api._valid_demo_token(token))
            self.assertFalse(api._valid_demo_token(token + "bad"))
            with patch.object(api.time, "time", return_value=10**12):
                self.assertFalse(api._valid_demo_token(token))


    def test_cors_middleware_is_local_only_and_disables_credentials(self):
        cors = next(item for item in api.app.user_middleware if item.cls.__name__ == "CORSMiddleware")
        self.assertIn("http://127.0.0.1:8000", cors.kwargs["allow_origins"])
        self.assertIn("http://localhost:5173", cors.kwargs["allow_origins"])
        self.assertFalse(cors.kwargs["allow_credentials"])

    def test_cors_origins_can_be_configured(self):
        with patch.dict(os.environ, {"DONEPROOF_ALLOWED_ORIGINS": "http://app.local:3000, http://test.local:5000"}):
            self.assertEqual(api.get_allowed_origins(), ["http://app.local:3000", "http://test.local:5000"])

    def test_legacy_workspace_helpers_preserve_the_boundary(self):
        with patch.object(api, "workspace_root", return_value=self.root):
            self.assertEqual(api.get_workspace_root(), self.root)
            self.assertEqual(api.validate_workspace_dir(".", workspace_root=self.root), self.root)
            with self.assertRaisesRegex(ValueError, "outside the approved workspace"):
                api.validate_workspace_dir("..", workspace_root=self.root)

    def test_parse_contract_body_accepts_wrapper_and_direct_forms(self):
        task = {"task_id": "api-contract", "checks": []}
        wrapped, error = api._parse_contract_body(json.dumps({"task": task, "base_dir": "."}).encode())
        direct, direct_error = api._parse_contract_body(json.dumps(task).encode())
        self.assertIsNone(error)
        self.assertIsNone(direct_error)
        self.assertEqual(wrapped, {"task": task, "base_dir": "."})
        self.assertEqual(direct, {"task": task, "base_dir": "."})

    def test_parse_contract_body_rejects_invalid_json_and_non_objects(self):
        invalid_json, invalid_error = api._parse_contract_body(b"{broken")
        non_object, object_error = api._parse_contract_body(b'["not", "a", "contract"]')
        non_object_task, task_error = api._parse_contract_body(b'{"task":[] }')
        self.assertIsNone(invalid_json)
        self.assertEqual(invalid_error.status_code, 400)
        self.assertIsNone(non_object)
        self.assertEqual(object_error.status_code, 400)
        self.assertIsNone(non_object_task)
        self.assertEqual(task_error.status_code, 400)

    def test_parse_plan_request_requires_task_and_string_context(self):
        valid, error = api._parse_plan_request(json.dumps({
            "task_description": "Verify an artifact", "project_context": "It is a JSON file.",
        }).encode())
        missing, missing_error = api._parse_plan_request(b'{"project_context":"context"}')
        invalid_context, context_error = api._parse_plan_request(b'{"task_description":"task","project_context":[]}')
        self.assertEqual(valid, {"task_description": "Verify an artifact", "project_context": "It is a JSON file.", "base_dir": "."})
        self.assertIsNone(error)
        self.assertIsNone(missing)
        self.assertEqual(missing_error.status_code, 400)
        self.assertIsNone(invalid_context)
        self.assertEqual(context_error.status_code, 400)

    def test_plan_request_has_a_separate_small_body_limit(self):
        oversized = api._request_size_error(str(api.MAX_PLAN_REQUEST_BYTES + 1), limit=api.MAX_PLAN_REQUEST_BYTES)
        self.assertEqual(oversized.status_code, 413)

    def test_request_size_limit_handles_content_length(self):
        no_length = api._request_size_error(None)
        bad_length = api._request_size_error("many")
        oversized = api._request_size_error(str(api.MAX_CONTRACT_BYTES + 1))
        oversized_stream = api._request_size_error(body_size=api.MAX_CONTRACT_BYTES + 1)
        self.assertIsNone(no_length)
        self.assertEqual(bad_length.status_code, 400)
        self.assertEqual(oversized.status_code, 413)
        self.assertEqual(oversized_stream.status_code, 413)

    def test_resolve_workspace_rejects_paths_outside_approved_root(self):
        outside = self.root.parent / "outside-doneproof-workspace"
        with patch.object(api, "workspace_root", return_value=self.root):
            with self.assertRaisesRegex(ValueError, "approved workspace"):
                api.resolve_workspace(outside)

    def test_samples_returns_only_valid_example_contracts(self):
        samples = api.samples()
        self.assertTrue(samples)
        self.assertTrue(all(isinstance(item.get("task_id"), str) for item in samples.values()))

    def test_approved_checks_follow_the_selected_workspace(self):
        project = self.root / "nested-project"
        (project / "tests").mkdir(parents=True)
        with patch.object(api, "workspace_root", return_value=self.root):
            available = api.approved_checks("nested-project")
        self.assertEqual([item["id"] for item in available["checks"]], ["python-unittest"])
        with patch.object(api, "workspace_root", return_value=self.root):
            absent = api.approved_checks(".")
        self.assertEqual(absent["checks"], [])

    def test_approved_check_runs_only_registered_fixed_command(self):
        (self.root / "tests").mkdir()
        process = Mock()
        process.stdout = io.BytesIO(b"2 tests passed")
        process.wait.return_value = 0
        with patch.object(api.subprocess, "Popen", return_value=process) as run:
            response = api._execute_approved_check("python-unittest", self.root)
        payload = json.loads(response.body)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["status"], "passed")
        self.assertEqual(payload["exit_code"], 0)
        self.assertIn("local_process_observation", payload["evidence_source"])
        self.assertFalse(run.call_args.kwargs["shell"])
        self.assertIs(run.call_args.kwargs["stdout"], subprocess.PIPE)
        self.assertIs(run.call_args.kwargs["stderr"], subprocess.STDOUT)
        self.assertEqual(run.call_args.args[0], api.APPROVED_CHECKS["python-unittest"]["argv"])

    def test_approved_check_rejects_unknown_command_without_execution(self):
        with patch.object(api.subprocess, "Popen") as run:
            response = api._execute_approved_check("model-supplied-command", self.root)
        self.assertEqual(response.status_code, 400)
        run.assert_not_called()

    def test_approved_check_timeout_is_not_reported_as_pass(self):
        (self.root / "tests").mkdir()
        process = Mock()
        process.stdout = io.BytesIO(b"partial output")
        process.wait.side_effect = [subprocess.TimeoutExpired("test", 60), -9]
        with patch.object(api.subprocess, "Popen", return_value=process):
            response = api._execute_approved_check("python-unittest", self.root)
        payload = json.loads(response.body)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["status"], "errored")
        self.assertTrue(payload["timed_out"])
        self.assertIsNone(payload["exit_code"])
        process.kill.assert_called_once()

    def test_approved_check_keeps_only_a_bounded_output_tail(self):
        (self.root / "tests").mkdir()
        process = Mock()
        process.stdout = io.BytesIO(b"x" * (api.MAX_APPROVED_CHECK_OUTPUT + 32) + b"TAIL")
        process.wait.return_value = 0
        with patch.object(api.subprocess, "Popen", return_value=process):
            response = api._execute_approved_check("python-unittest", self.root)
        payload = json.loads(response.body)
        self.assertLessEqual(len(payload["output"].encode()), api.MAX_APPROVED_CHECK_OUTPUT)
        self.assertTrue(payload["output"].endswith("TAIL"))

if __name__ == "__main__":
    unittest.main()

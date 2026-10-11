import os
from pathlib import Path
import tempfile
import unittest

try:
    from fastapi.testclient import TestClient
    from doneproof.api import app, get_workspace_root, validate_workspace_dir, get_allowed_origins
    FASTAPI_AVAILABLE = True
except (ImportError, RuntimeError):
    FASTAPI_AVAILABLE = False
    TestClient = None
    app = None
    get_workspace_root = None
    validate_workspace_dir = None
    get_allowed_origins = None


@unittest.skipUnless(FASTAPI_AVAILABLE, "fastapi or httpx is not installed")
class DoneProofApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_check(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "service": "doneproof"})

    def test_samples_endpoint(self):
        response = self.client.get("/api/samples")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("pass", data)
        self.assertIn("partial", data)
        self.assertIn("fail", data)

    def test_index_dashboard_served(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/html", response.headers.get("content-type", ""))
        self.assertIn("DoneProof", response.text)

    def test_verify_direct_passing_payload(self):
        payload = {
            "task_id": "direct-pass",
            "agent_claim": "README exists and tests pass",
            "required_files": ["README.md"],
            "command_results": [{"label": "test", "exit_code": 0}],
        }
        response = self.client.post("/verify", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["task_id"], "direct-pass")
        self.assertEqual(data["status"], "VERIFIED")
        self.assertEqual(data["checks_passed"], 2)
        self.assertEqual(data["checks_failed"], 0)

    def test_verify_wrapped_task_payload(self):
        payload = {
            "task": {
                "task_id": "wrapped-pass",
                "agent_claim": "README exists",
                "required_files": ["README.md"],
                "command_results": [],
            },
            "base_dir": ".",
        }
        response = self.client.post("/verify", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["task_id"], "wrapped-pass")
        self.assertEqual(data["status"], "VERIFIED")

    def test_verify_partial_payload(self):
        payload = {
            "task_id": "partial-task",
            "required_files": ["README.md", "non_existent_file_xyz.txt"],
        }
        response = self.client.post("/verify", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "PARTIAL")
        self.assertEqual(data["checks_passed"], 1)
        self.assertEqual(data["checks_failed"], 1)

    def test_verify_failed_payload(self):
        payload = {
            "task_id": "fail-task",
            "command_results": [{"label": "test", "exit_code": 1}],
        }
        response = self.client.post("/verify", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "FAILED")
        self.assertEqual(data["checks_passed"], 0)
        self.assertEqual(data["checks_failed"], 1)

    def test_verify_missing_task_id_returns_400(self):
        response = self.client.post("/verify", json={})
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("task must be an object with a non-empty task_id", data["detail"])

    def test_verify_invalid_required_files_returns_400(self):
        payload = {"task_id": "test", "required_files": "not-a-list"}
        response = self.client.post("/verify", json=payload)
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("required_files must be a list of strings", data["detail"])

    def test_verify_invalid_command_results_returns_400(self):
        payload = {"task_id": "test", "command_results": [{"exit_code": "non-int"}]}
        response = self.client.post("/verify", json=payload)
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("command_results", data["detail"])

    def test_verify_non_dict_body_returns_400(self):
        response = self.client.post("/verify", json="plain-string")
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("error", data)

    def test_verify_outside_workspace_parent_traversal_returns_400(self):
        payload = {
            "task": {"task_id": "traversal-test", "required_files": ["README.md"]},
            "base_dir": "..",
        }
        response = self.client.post("/verify", json=payload)
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("outside the approved workspace root", data["detail"])

    def test_verify_outside_workspace_nested_traversal_returns_400(self):
        payload = {
            "task": {"task_id": "traversal-test", "required_files": ["README.md"]},
            "base_dir": "docs/../../..",
        }
        response = self.client.post("/verify", json=payload)
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("outside the approved workspace root", data["detail"])

    def test_verify_outside_workspace_absolute_path_returns_400(self):
        ext_dir = "/etc" if os.path.exists("/etc") else "/var"
        payload = {
            "task": {"task_id": "external-probe", "required_files": ["passwd"]},
            "base_dir": ext_dir,
        }
        response = self.client.post("/verify", json=payload)
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("outside the approved workspace root", data["detail"])

    def test_verify_direct_payload_with_forbidden_base_dir_returns_400(self):
        payload = {
            "task_id": "direct-forbidden",
            "required_files": ["passwd"],
            "base_dir": "..",
        }
        response = self.client.post("/verify", json=payload)
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("outside the approved workspace root", data["detail"])

    def test_verify_permitted_relative_subdirectory(self):
        payload = {
            "task": {
                "task_id": "subdir-pass",
                "required_files": ["api.py"],
            },
            "base_dir": "doneproof",
        }
        response = self.client.post("/verify", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "VERIFIED")
        self.assertEqual(data["checks"][0]["passed"], True)

    def test_verify_permitted_absolute_path_inside_workspace(self):
        abs_sub = str(Path.cwd().resolve() / "doneproof")
        payload = {
            "task": {
                "task_id": "abs-pass",
                "required_files": ["api.py"],
            },
            "base_dir": abs_sub,
        }
        response = self.client.post("/verify", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "VERIFIED")

    def test_verify_base_dir_pointing_to_file_returns_400(self):
        payload = {
            "task": {"task_id": "file-base-dir", "required_files": []},
            "base_dir": "README.md",
        }
        response = self.client.post("/verify", json=payload)
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("file, not a directory", data["detail"])

    def test_verify_invalid_base_dir_type_returns_400(self):
        payload = {
            "task": {"task_id": "bad-type", "required_files": []},
            "base_dir": 12345,
        }
        response = self.client.post("/verify", json=payload)
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("base_dir must be a string path", data["detail"])

    def test_custom_workspace_root_via_env_var(self):
        with tempfile.TemporaryDirectory() as custom_root:
            Path(custom_root, "evidence.txt").write_text("ok", encoding="utf-8")
            orig_env = os.environ.get("DONEPROOF_WORKSPACE_ROOT")
            os.environ["DONEPROOF_WORKSPACE_ROOT"] = custom_root
            try:
                # Inside custom root is permitted
                payload_valid = {
                    "task": {"task_id": "custom-ok", "required_files": ["evidence.txt"]},
                    "base_dir": ".",
                }
                res_valid = self.client.post("/verify", json=payload_valid)
                self.assertEqual(res_valid.status_code, 200)
                self.assertEqual(res_valid.json()["status"], "VERIFIED")

                # Outside custom root is rejected
                res_outside = self.client.post(
                    "/verify",
                    json={"task": {"task_id": "custom-fail"}, "base_dir": ".."},
                )
                self.assertEqual(res_outside.status_code, 400)
            finally:
                if orig_env is None:
                    os.environ.pop("DONEPROOF_WORKSPACE_ROOT", None)
                else:
                    os.environ["DONEPROOF_WORKSPACE_ROOT"] = orig_env

    def test_validate_workspace_dir_helper_unit_tests(self):
        with tempfile.TemporaryDirectory() as root_str:
            root = Path(root_str).resolve()
            sub = root / "sub"
            sub.mkdir()

            # Root itself is valid
            self.assertEqual(validate_workspace_dir(".", workspace_root=root), root)
            self.assertEqual(validate_workspace_dir(root_str, workspace_root=root), root)

            # Subdirectory is valid
            self.assertEqual(validate_workspace_dir("sub", workspace_root=root), sub)
            self.assertEqual(validate_workspace_dir(str(sub), workspace_root=root), sub)

            # Traversal is rejected
            with self.assertRaises(ValueError) as ctx:
                validate_workspace_dir("..", workspace_root=root)
            self.assertIn("outside the approved workspace root", str(ctx.exception))

            with self.assertRaises(ValueError) as ctx:
                validate_workspace_dir(root.parent, workspace_root=root)
            self.assertIn("outside the approved workspace root", str(ctx.exception))

    def test_cors_allowed_local_origin(self):
        response = self.client.get("/api/health", headers={"Origin": "http://127.0.0.1:8000"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:8000")
        self.assertNotEqual(response.headers.get("access-control-allow-credentials"), "true")

    def test_cors_disallowed_external_origin(self):
        response = self.client.get("/api/health", headers={"Origin": "https://malicious-external-site.com"})
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.headers.get("access-control-allow-origin"))

    def test_cors_preflight_allowed(self):
        headers = {
            "Origin": "http://localhost:8000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        }
        response = self.client.options("/verify", headers=headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://localhost:8000")
        self.assertNotEqual(response.headers.get("access-control-allow-credentials"), "true")

    def test_cors_preflight_disallowed(self):
        headers = {
            "Origin": "https://evil.example.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        }
        response = self.client.options("/verify", headers=headers)
        self.assertNotEqual(response.headers.get("access-control-allow-origin"), "https://evil.example.com")

    def test_get_allowed_origins_env_override(self):
        orig_env = os.environ.get("DONEPROOF_ALLOWED_ORIGINS")
        try:
            os.environ["DONEPROOF_ALLOWED_ORIGINS"] = "http://app.local:3000, http://test.local:5000 "
            origins = get_allowed_origins()
            self.assertEqual(origins, ["http://app.local:3000", "http://test.local:5000"])
        finally:
            if orig_env is None:
                os.environ.pop("DONEPROOF_ALLOWED_ORIGINS", None)
            else:
                os.environ["DONEPROOF_ALLOWED_ORIGINS"] = orig_env


if __name__ == "__main__":
    unittest.main()

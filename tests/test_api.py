import unittest
from fastapi.testclient import TestClient

from doneproof.api import app


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


if __name__ == "__main__":
    unittest.main()

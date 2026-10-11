import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from doneproof.__main__ import _workspace_for_task


class WorkspaceForTaskTests(unittest.TestCase):
    def test_uses_nearest_git_root_for_nested_task_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / ".git").mkdir()
            examples = root / "examples"
            examples.mkdir()
            task_file = examples / "task.json"
            task_file.write_text("{}", encoding="utf-8")

            self.assertEqual(_workspace_for_task(task_file), root)

    def test_uses_task_directory_when_no_git_root_exists(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            task_dir = root / "tasks"
            task_dir.mkdir()
            task_file = task_dir / "task.json"
            task_file.write_text("{}", encoding="utf-8")

            with patch.object(Path, "exists", return_value=False):
                self.assertEqual(_workspace_for_task(task_file), task_dir.resolve())


if __name__ == "__main__":
    unittest.main()

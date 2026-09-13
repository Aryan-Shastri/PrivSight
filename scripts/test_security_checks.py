"""Security regression tests for release tooling."""
import io
import tempfile
import unittest
import zipfile
from pathlib import Path

from security_checks import archive_member_error, scan_secrets


class SecurityChecksTests(unittest.TestCase):
    def test_archive_rejects_relative_absolute_and_backslash_traversal(self):
        bad = ["../secret", "a/../../secret", "/etc/passwd", "C:/secret", r"a\..\secret"]
        for name in bad:
            with self.subTest(name=name):
                self.assertIsNotNone(archive_member_error(name))
        self.assertIsNone(archive_member_error("apps/extension/index.js"))

    def test_secret_scanner_detects_credentials_but_allows_examples(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "bad.env").write_text("API_KEY=sk-test-12345678901234567890\n")
            findings = scan_secrets(root, [root / "bad.env"])
            self.assertTrue(any("bad.env" in finding for finding in findings))
            (root / "bad.env").write_text("API_KEY=${API_KEY}\n")
            self.assertEqual(scan_secrets(root, [root / "bad.env"]), [])


if __name__ == "__main__":
    unittest.main()

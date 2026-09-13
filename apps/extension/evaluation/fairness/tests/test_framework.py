import json
import tempfile
import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from evaluation_framework import check_leakage, evaluate, import_dataset, validate_manifest

FIXTURE = ROOT / "fixtures" / "manifest.json"

class FrameworkTests(unittest.TestCase):
    def load(self):
        return json.loads(FIXTURE.read_text())

    def test_fixture_is_valid_and_explicitly_cc0_or_self_generated(self):
        manifest = self.load()
        self.assertEqual([], validate_manifest(manifest, ROOT / "fixtures"))
        self.assertTrue(all(x["license"]["spdx_id"] in {"CC0-1.0", "LicenseRef-SelfGenerated"} for x in manifest["items"]))

    def test_required_provenance_and_context_are_enforced(self):
        manifest = self.load()
        del manifest["items"][0]["provenance"]
        errors = validate_manifest(manifest, ROOT / "fixtures")
        self.assertTrue(any("provenance" in e for e in errors))

    def test_split_leakage_is_deterministic_and_checks_content_site_session(self):
        manifest = self.load()
        manifest["items"].append({**manifest["items"][0], "id": "duplicate", "split": "test"})
        first = check_leakage(manifest, ROOT / "fixtures")
        second = check_leakage(manifest, ROOT / "fixtures")
        self.assertEqual(first, second)
        self.assertEqual("FAIL", first["status"])
        self.assertIn("content_sha256", {x["kind"] for x in first["leaks"]})
        self.assertIn("site_id", {x["kind"] for x in first["leaks"]})
        self.assertIn("session_id", {x["kind"] for x in first["leaks"]})

    def test_metrics_include_per_class_and_subgroup_precision_recall(self):
        manifest = self.load()
        predictions = json.loads((ROOT / "fixtures" / "predictions.json").read_text())
        report = evaluate(manifest, predictions, {"minimum_samples": 1, "required_subgroups": ["direction:ltr", "direction:rtl"], "privacy_classes": ["face", "text"], "privacy_min_recall": 1.0})
        self.assertEqual("PASS", report["status"])
        self.assertIn("face", report["per_class"])
        self.assertIn("direction:rtl", report["per_subgroup"])
        self.assertEqual(1.0, report["per_class"]["face"]["recall"])

    def test_privacy_threshold_fails_closed(self):
        manifest = self.load()
        predictions = {"schema_version": "1.0.0", "items": [{"item_id": x["id"], "regions": []} for x in manifest["items"]]}
        report = evaluate(manifest, predictions, {"minimum_samples": 1, "required_subgroups": [], "privacy_classes": ["face", "text"], "privacy_min_recall": .99})
        self.assertEqual("FAIL", report["status"])
        self.assertTrue(report["privacy_fail_closed"])

    def test_missing_sample_or_subgroup_is_machine_readable_blocked(self):
        report = evaluate(self.load(), json.loads((ROOT / "fixtures" / "predictions.json").read_text()), {"minimum_samples": 99, "required_subgroups": ["contrast:high", "language:zz"], "privacy_classes": ["face"], "privacy_min_recall": .9})
        self.assertEqual("BLOCKED", report["status"])
        self.assertEqual("INSUFFICIENT_EVIDENCE", report["blocked"]["code"])
        self.assertIn("language:zz", report["blocked"]["missing_subgroups"])
        undersized = evaluate(self.load(), {"items": []}, {"minimum_samples": 2, "minimum_samples_per_subgroup": 2, "required_subgroups": ["direction:rtl"]})
        self.assertEqual("BLOCKED", undersized["status"])
        self.assertEqual({"direction:rtl": 1}, undersized["blocked"]["undersized_subgroups"])

    def test_import_requires_explicit_license_and_copies_only_declared_files(self):
        with tempfile.TemporaryDirectory() as td:
            src, out = Path(td)/"src", Path(td)/"out"; src.mkdir()
            (src/"page.txt").write_text("licensed sample")
            result = import_dataset(src, out, license_id="CC-BY-4.0", license_url="https://creativecommons.org/licenses/by/4.0/", source_url="https://example.test/dataset", attribution="Example author")
            imported = json.loads((out/"manifest.json").read_text())
            self.assertEqual(1, result["imported"])
            self.assertEqual("CC-BY-4.0", imported["items"][0]["license"]["spdx_id"])
            with self.assertRaises(ValueError):
                import_dataset(src, Path(td)/"bad", license_id="", license_url="", source_url="", attribution="")

if __name__ == "__main__": unittest.main()

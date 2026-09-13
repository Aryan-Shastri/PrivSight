import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from validator import extract_json, validate_action, validate_downstream_policy  # noqa: E402


class ValidatorTests(unittest.TestCase):
    def test_all_action_shapes(self):
        actions = [
            {"type": "CLICK", "elementId": "E001"},
            {"type": "TYPE_TEXT", "elementId": "E001", "text": "hello"},
            {"type": "TYPE_TOKEN", "elementId": "E001", "token": "[EMAIL_1]"},
            {"type": "SELECT", "elementId": "E001", "option": "one"},
            {"type": "CHECK", "elementId": "E001"},
            {"type": "UNCHECK", "elementId": "E001"},
            {"type": "SCROLL", "direction": "DOWN", "amountPx": 800},
            {"type": "WAIT", "milliseconds": 5000},
            {"type": "ASK_USER", "message": "Which account?"},
            {"type": "DONE", "summary": "Complete"},
        ]
        for action in actions:
            self.assertEqual(action, validate_action(action, {"E001"}))

    def test_rejects_extra_fields_and_unknown_element(self):
        with self.assertRaisesRegex(ValueError, "fields"):
            validate_action({"type": "CLICK", "elementId": "E001", "x": 1})
        with self.assertRaisesRegex(ValueError, "current observation"):
            validate_action({"type": "CLICK", "elementId": "E999"}, {"E001"})

    def test_downstream_rejects_adversarial_invalid_id_and_plaintext_secret(self):
        with self.assertRaisesRegex(ValueError, "current observation"):
            validate_action({"type": "CLICK", "elementId": "E999"}, {"E001"})
        schema_valid_secret = validate_action(
            {"type": "TYPE_TEXT", "elementId": "E101", "text": "plaintext-secret"}, {"E101"}
        )
        with self.assertRaisesRegex(ValueError, "plaintext"):
            validate_downstream_policy(schema_valid_secret, {"E101"})

    def test_rejects_invalid_bounds_bool_and_token(self):
        bad = [
            {"type": "SCROLL", "direction": "DOWN", "amountPx": True},
            {"type": "WAIT", "milliseconds": 5001},
            {"type": "TYPE_TOKEN", "elementId": "E001", "token": "person@example.com"},
        ]
        for action in bad:
            with self.assertRaises(ValueError):
                validate_action(action, {"E001"})

    def test_extract_requires_bare_single_object(self):
        self.assertEqual({"type": "DONE", "summary": "ok"}, extract_json('{"type":"DONE","summary":"ok"}'))
        for response in ["```json\n{}\n```", '{}\n{"type":"WAIT","milliseconds":1}', "explanation {}"]:
            with self.assertRaises((ValueError, json.JSONDecodeError)):
                extract_json(response)

    def test_cases_are_sanitized_and_fixed(self):
        cases = json.loads((ROOT / "observations.json").read_text())
        self.assertEqual(20, len(cases))
        self.assertEqual(len(cases), len({case["case_id"] for case in cases}))
        serialized = json.dumps(cases)
        self.assertNotIn("@", serialized)
        self.assertNotIn("https://", serialized)


if __name__ == "__main__":
    unittest.main()

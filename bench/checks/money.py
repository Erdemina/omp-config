import pathlib
import unittest


class Check(unittest.TestCase):
    def test_moved(self):
        from inventory.money import fmt_price
        self.assertEqual(fmt_price(2), "$2.00")
        report = pathlib.Path("inventory/report.py").read_text()
        self.assertNotIn("def fmt_price", report)
        self.assertIn("money", report)

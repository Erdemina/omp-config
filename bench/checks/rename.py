import pathlib
import unittest


class Check(unittest.TestCase):
    def test_renamed_everywhere(self):
        source = "".join(p.read_text() for p in pathlib.Path("inventory").glob("*.py"))
        self.assertNotIn("fmt_price", source)
        from inventory.report import format_price
        self.assertEqual(format_price(1234.5), "$1,234.50")

import unittest

from inventory.models import Item
from inventory.report import format_report
from inventory.store import Store


class Check(unittest.TestCase):
    def test_default_is_zero(self):
        self.assertEqual(Item("a", 1.0).discount, 0)

    def test_total_applies_discount(self):
        store = Store()
        store.add(Item("a", 10.0, 2, discount=25))
        store.add(Item("b", 1.0, 1))
        self.assertAlmostEqual(store.total_value(), 16.0)

    def test_report_shows_discount(self):
        store = Store()
        store.add(Item("a", 10.0, 1, discount=25))
        self.assertIn("25%", format_report(store))

import unittest

from inventory.models import Item
from inventory.store import Store


class Check(unittest.TestCase):
    def test_fractional_prices(self):
        store = Store()
        store.add(Item("washer", 0.25, 3))
        store.add(Item("bolt", 2.5, 2))
        self.assertAlmostEqual(store.total_value(), 5.75)

import unittest

from inventory.models import Item
from inventory.store import Store


class Check(unittest.TestCase):
    def test_total_after_remove(self):
        store = Store()
        store.add(Item("a", 3, 2))
        store.add(Item("b", 5, 1))
        self.assertEqual(store.total_value(), 11)
        store.remove("a")
        self.assertEqual(store.total_value(), 8)
        store.remove("b")
        self.assertEqual(store.total_value(), 3)

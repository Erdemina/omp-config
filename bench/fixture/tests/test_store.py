import unittest

from inventory.models import Item
from inventory.report import format_report
from inventory.store import Store


class StoreTest(unittest.TestCase):
    def test_add_merges_quantities(self):
        store = Store()
        store.add(Item("bolt", 2, 3))
        store.add(Item("bolt", 2, 2))
        self.assertEqual(store.find("bolt").qty, 5)

    def test_report_lists_items_and_total(self):
        store = Store()
        store.add(Item("nut", 1, 4))
        self.assertEqual(format_report(store), "nut: 4 x $1.00\nTotal: $4.00")


if __name__ == "__main__":
    unittest.main()

import unittest

from inventory.parse import parse_line


class Check(unittest.TestCase):
    def test_more_quoting(self):
        item = parse_line('"a ""big"" bolt",1,2')
        self.assertEqual(item.name, 'a "big" bolt')

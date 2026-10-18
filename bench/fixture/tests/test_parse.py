import unittest

from inventory.parse import parse_line


class ParseTest(unittest.TestCase):
    def test_plain(self):
        item = parse_line("bolt,2.5,3")
        self.assertEqual((item.name, item.price, item.qty), ("bolt", 2.5, 3))

    def test_whitespace_and_quoted_name(self):
        item = parse_line(' "hex, nut" , 0.75 , 10 ')
        self.assertEqual((item.name, item.price, item.qty), ("hex, nut", 0.75, 10))


if __name__ == "__main__":
    unittest.main()

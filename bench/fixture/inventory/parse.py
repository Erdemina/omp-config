from .models import Item


def parse_line(line: str) -> Item:
    name, price, qty = line.split(",")
    return Item(name, float(price), int(qty))

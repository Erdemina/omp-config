from .models import Item


class Store:
    def __init__(self):
        self._items = {}
        self._total = None

    def add(self, item: Item) -> None:
        if item.name in self._items:
            self._items[item.name].qty += item.qty
        else:
            self._items[item.name] = item
        self._total = None

    def remove(self, name: str, qty: int = 1) -> None:
        item = self._items[name]
        item.qty -= qty
        if item.qty <= 0:
            del self._items[name]

    def find(self, name: str):
        return self._items.get(name)

    def items(self):
        return sorted(self._items.values(), key=lambda i: i.name)

    def total_value(self) -> float:
        if self._total is None:
            self._total = sum(int(i.price) * i.qty for i in self._items.values())
        return self._total

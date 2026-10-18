from .store import Store


def fmt_price(value: float) -> str:
    return f"${value:,.2f}"


def format_report(store: Store) -> str:
    lines = [f"{i.name}: {i.qty} x {fmt_price(i.price)}" for i in store.items()]
    lines.append(f"Total: {fmt_price(store.total_value())}")
    return "\n".join(lines)

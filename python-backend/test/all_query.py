import json
import sys
from query_engine import generate_violation_query


def load_json(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def process_rules(data):
    rules = data.get("rules", [])

    if not isinstance(rules, list):
        raise ValueError("'rules' must be a list")

    for i, rule in enumerate(rules):
        print(f"\n🔹 Processing rule {i + 1}/{len(rules)}")
        print(f"\n {generate_violation_query(rule)}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python process_json.py <file.json>")
        sys.exit(1)

    file_path = sys.argv[1]

    try:
        data = load_json(file_path)
        process_rules(data)
        print("\n✅ Done processing rules")

    except Exception as e:
        print(f"❌ Error: {e}")
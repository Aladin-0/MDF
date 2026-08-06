import ast
import os
import glob
import json

def get_tests(directory, is_python=True):
    tests = []
    if is_python:
        for root, _, files in os.walk(directory):
            for file in files:
                if file.startswith("test_") and file.endswith(".py"):
                    filepath = os.path.join(root, file)
                    with open(filepath, "r", encoding="utf-8") as f:
                        try:
                            tree = ast.parse(f.read())
                            for node in ast.walk(tree):
                                if isinstance(node, ast.FunctionDef) and node.name.startswith("test_"):
                                    tests.append({
                                        "name": node.name,
                                        "file": filepath
                                    })
                        except Exception:
                            pass
    else:
        for root, _, files in os.walk(directory):
            for file in files:
                if file.endswith(".spec.ts") or file.endswith(".test.ts"):
                    filepath = os.path.join(root, file)
                    with open(filepath, "r", encoding="utf-8") as f:
                        lines = f.readlines()
                        for line in lines:
                            if "test(" in line or "test.only(" in line:
                                name_start = line.find("'")
                                if name_start == -1: name_start = line.find('"')
                                if name_start != -1:
                                    name_end = line.find(line[name_start], name_start+1)
                                    name = line[name_start+1:name_end]
                                    tests.append({"name": name, "file": filepath})
    return tests

all_tests = get_tests("apps/backend/apps") + get_tests("apps/frontend/tests", False)
print(json.dumps(all_tests, indent=2))

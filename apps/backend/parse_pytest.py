import re
import json

def parse_pytest_output(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Split by failures and errors
    sections = re.split(r'={10,} (?:FAILURES|ERRORS) ={10,}', content)
    if len(sections) < 2:
        print("No failures found or wrong format.")
        return
    
    failures_text = sections[1]
    
    # Split individual failures
    # Usually they start with `_ _ _ _ _ _ _` or `__ <TestName> __`
    failure_blocks = re.split(r'_{3,} .*? _{3,}', failures_text)
    
    # A better regex to find each failure header
    # e.g., ___ TestName ___ or ___ ERROR at setup of TestName ___
    failures = re.finditer(r'_{3,} (.*?) _{3,}\n(.*?)(?=(?:_{3,} .*? _{3,}|\Z))', failures_text, re.DOTALL)
    
    results = []
    for match in failures:
        test_name = match.group(1).strip()
        traceback = match.group(2).strip()
        
        # Extract file path and line number from the bottom of the traceback if possible
        # e.g., file.py:line: AssertionError
        
        results.append({
            "test_name": test_name,
            "traceback": traceback[-1500:] # Get last 1500 chars to avoid huge JSON
        })
        
    with open('failures.json', 'w') as f:
        json.dump(results, f, indent=2)

parse_pytest_output('pytest_output.txt')

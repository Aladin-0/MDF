import re

def main():
    with open('pytest_output.txt') as f:
        content = f.read()
    
    sections = re.split(r'_{3,} .*? _{3,}', content)
    # The first section is preamble, the rest are individual test failures
    
    results = []
    
    for section in sections[1:]:
        # Find the line starting with E
        e_lines = [line.strip() for line in section.split('\n') if line.startswith('E ')]
        
        # Test name is usually in the preceding section?
        # Let's extract the test name using regex instead
        pass

    # A better approach: find all occurrences of '____ test_name ____'
    matches = re.finditer(r'_{3,} (.*?) _{3,}\n(.*?)((?:_{3,} .*? _{3,})|(?:===))', content, re.DOTALL)
    
    for match in matches:
        test_name = match.group(1).strip()
        trace = match.group(2)
        e_lines = [line.strip() for line in trace.split('\n') if line.strip().startswith('E ')]
        e_msg = e_lines[-1] if e_lines else 'Unknown Error'
        
        results.append(f"{test_name}: {e_msg}")
        
    with open('errors_summary.txt', 'w') as f:
        f.write("\n".join(results))

if __name__ == '__main__':
    main()

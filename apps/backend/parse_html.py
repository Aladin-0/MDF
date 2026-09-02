from bs4 import BeautifulSoup
import sys
with open('error.html', 'r') as f:
    soup = BeautifulSoup(f.read(), 'html.parser')
print(soup.find('pre', class_='exception_value').text)

import os
import zipfile
import xml.etree.ElementTree as ET
from io import BytesIO

# Register namespaces to preserve OOXML structure without ugly prefixes
NAMESPACES = {
    '': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
    'x14ac': 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac',
    'xr': 'http://schemas.microsoft.com/office/spreadsheetml/2014/revision',
    'xr2': 'http://schemas.microsoft.com/office/spreadsheetml/2015/revision2',
    'xr3': 'http://schemas.microsoft.com/office/spreadsheetml/2016/revision3',
    'x14': 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/main',
    'xm': 'http://schemas.microsoft.com/office/excel/2006/main'
}
for prefix, uri in NAMESPACES.items():
    ET.register_namespace(prefix, uri)

NS_MAIN = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

def get_col_letter(col_idx):
    """Convert 1-indexed column number to Excel letter (1 -> A, 27 -> AA)."""
    string = ""
    while col_idx > 0:
        col_idx, remainder = divmod(col_idx - 1, 26)
        string = chr(65 + remainder) + string
    return string

class OOXMLInjector:
    """
    Surgically injects data into an OOXML (.xlsx) template without corrupting
    macros, vba, drawings, data validations, or external links.
    """
    def __init__(self, template_path):
        self.template_path = template_path
        self._load_sheet_mapping()

    def _load_sheet_mapping(self):
        """Map visible sheet names to their underlying xml part names."""
        self.sheet_map = {}
        with zipfile.ZipFile(self.template_path, 'r') as z:
            # Parse workbook.xml
            wb_xml = z.read('xl/workbook.xml')
            wb_tree = ET.fromstring(wb_xml)
            
            rels_map = {}
            for sheet in wb_tree.findall(f'.//{NS_MAIN}sheet'):
                name = sheet.attrib.get('name')
                r_id = sheet.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
                if name and r_id:
                    rels_map[r_id] = name
                    
            # Parse workbook.xml.rels
            rels_xml = z.read('xl/_rels/workbook.xml.rels')
            rels_tree = ET.fromstring(rels_xml)
            for rel in rels_tree.findall('.//{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
                r_id = rel.attrib.get('Id')
                target = rel.attrib.get('Target') # e.g. "worksheets/sheet1.xml"
                if r_id in rels_map:
                    sheet_name = rels_map[r_id]
                    # Target is relative to 'xl/' directory
                    if target.startswith('/xl/'):
                        part_name = target[1:]
                    else:
                        part_name = f'xl/{target}'
                    self.sheet_map[sheet_name] = part_name

    def inject(self, data_map, output_stream):
        """
        Injects data_map {sheet_name: [{"start_row": 5, "data": [{col_idx: val}]}]}
        and writes the unmodified ZIP with modified sheet XMLs to output_stream.
        """
        modified_parts = {}
        
        with zipfile.ZipFile(self.template_path, 'r') as z_in:
            for sheet_name, instructions in data_map.items():
                if sheet_name not in self.sheet_map:
                    raise ValueError(f"Sheet '{sheet_name}' not found in template.")
                    
                part_name = self.sheet_map[sheet_name]
                sheet_xml = z_in.read(part_name)
                modified_parts[part_name] = self._inject_sheet(sheet_xml, instructions)
                
            with zipfile.ZipFile(output_stream, 'w', compression=zipfile.ZIP_DEFLATED) as z_out:
                for item in z_in.infolist():
                    if item.filename in modified_parts:
                        # Write our modified XML
                        xml_bytes = modified_parts[item.filename]
                        z_out.writestr(item, xml_bytes)
                    else:
                        # Copy perfectly byte-for-byte
                        z_out.writestr(item, z_in.read(item.filename))

    def _inject_sheet(self, xml_bytes, instructions):
        for prefix, uri in NAMESPACES.items():
            ET.register_namespace(prefix, uri)
            
        tree = ET.parse(BytesIO(xml_bytes))
        root = tree.getroot()
        sheet_data = root.find(f'{NS_MAIN}sheetData')
        
        if sheet_data is None:
            raise ValueError("No sheetData found in worksheet XML")
            
        # Build index of existing rows
        row_map = {}
        for r_elem in sheet_data.findall(f'{NS_MAIN}row'):
            r_idx = int(r_elem.attrib['r'])
            row_map[r_idx] = r_elem
            
        for instruction in instructions:
            start_row = instruction['start_row']
            rows_data = instruction['rows']
            
            for i, row_data in enumerate(rows_data):
                current_row_idx = start_row + i
                
                # Retrieve or create row element
                if current_row_idx in row_map:
                    row_elem = row_map[current_row_idx]
                else:
                    # Creating missing row is not supported right now as we rely on pre-allocated rows
                    raise ValueError(f"Template row {current_row_idx} is not pre-allocated!")
                
                # Build index of existing cells in this row
                cell_map = {}
                for c_elem in row_elem.findall(f'{NS_MAIN}c'):
                    ref = c_elem.attrib['r']
                    cell_map[ref] = c_elem
                    
                for col_idx, val in row_data.items():
                    if val is None or val == "":
                        continue
                        
                    col_letter = get_col_letter(col_idx)
                    cell_ref = f"{col_letter}{current_row_idx}"
                    
                    if cell_ref in cell_map:
                        c_elem = cell_map[cell_ref]
                    else:
                        # Missing cell in the pre-allocated row! We must insert it in correct order.
                        c_elem = ET.Element(f'{NS_MAIN}c', {'r': cell_ref})
                        # Need to insert in alphabetical order based on column length then letter
                        self._insert_cell_in_order(row_elem, c_elem, col_letter)
                        cell_map[cell_ref] = c_elem
                    
                    # Skip if the cell contains a formula and we are trying to inject into it
                    if c_elem.find(f'{NS_MAIN}f') is not None:
                        continue
                        
                    if val is not None and val != '':
                        # Clear existing value/type/formula
                        for child in list(c_elem):
                            if child.tag in [f'{NS_MAIN}v', f'{NS_MAIN}f', f'{NS_MAIN}is']:
                                c_elem.remove(child)

                        # Inject new value
                        if isinstance(val, (int, float)):
                            c_elem.attrib['t'] = 'n'
                            v_elem = ET.SubElement(c_elem, f'{NS_MAIN}v')
                            v_elem.text = str(val)
                        elif type(val).__name__ == 'Decimal':
                            c_elem.attrib['t'] = 'n'
                            v_elem = ET.SubElement(c_elem, f'{NS_MAIN}v')
                            v_elem.text = str(val)
                        else:
                            c_elem.attrib['t'] = 'inlineStr'
                            is_elem = ET.SubElement(c_elem, f'{NS_MAIN}is')
                            t_elem = ET.SubElement(is_elem, f'{NS_MAIN}t')
                            val_str = str(val)
                            t_elem.text = val_str
                            if val_str.startswith(' ') or val_str.endswith(' ') or '\n' in val_str:
                                t_elem.attrib['{http://www.w3.org/XML/1998/namespace}space'] = 'preserve'
                    else:
                        # Value is empty, clear the cell entirely
                        for child in list(c_elem):
                            if child.tag in [f'{NS_MAIN}v', f'{NS_MAIN}f', f'{NS_MAIN}is']:
                                c_elem.remove(child)
                        if 't' in c_elem.attrib:
                            del c_elem.attrib['t']
                        
        # Extract original header to perfectly preserve xml declaration and root tag namespaces
        # which ElementTree often strips or modifies (breaking Excel strict validation).
        xml_str = xml_bytes.decode('utf-8')
        orig_decl_end = xml_str.find('<worksheet')
        orig_root_end = xml_str.find('>', orig_decl_end)
        orig_header_str = xml_str[:orig_root_end+1]
        
        # Ensure we write out without the XML declaration because we append it ourselves
        out = BytesIO()
        tree.write(out, encoding='utf-8', xml_declaration=False)
        gen_bytes = out.getvalue()
        
        # Find and replace the generated root tag with the original
        gen_root_start = gen_bytes.find(b'<worksheet')
        gen_root_end = gen_bytes.find(b'>', gen_root_start)
        gen_root_str = gen_bytes[gen_root_start:gen_root_end+1].decode('utf-8')
        
        # ElementTree strips inline namespaces (e.g. on <ext>) and hoists them to the root.
        # But orig_header won't have them! We must inject them into orig_header_str.
        import re
        gen_xmlns = re.findall(r'xmlns:[^=]+="[^"]+"', gen_root_str)
        for xmlns in gen_xmlns:
            if xmlns not in orig_header_str:
                orig_header_str = orig_header_str[:-1] + ' ' + xmlns + '>'
                
        orig_header = orig_header_str.encode('utf-8')
        
        return orig_header + gen_bytes[gen_root_end+1:]
        
    def _insert_cell_in_order(self, row_elem, new_c_elem, col_letter):
        # Very simple insertion at the end since the XML string is re-ordered by Excel usually,
        # but technically OOXML requires correct alphabetical order!
        # Let's insert in correct order.
        new_ref = new_c_elem.attrib['r']
        
        def col_key(ref):
            import re
            m = re.match(r'([A-Z]+)', ref)
            letters = m.group(1)
            return (len(letters), letters)
            
        target_key = col_key(new_ref)
        
        children = list(row_elem)
        insert_idx = 0
        for i, child in enumerate(children):
            if child.tag == f'{NS_MAIN}c':
                curr_ref = child.attrib['r']
                if col_key(curr_ref) > target_key:
                    break
            insert_idx = i + 1
            
        row_elem.insert(insert_idx, new_c_elem)

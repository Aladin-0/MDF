def snake_to_camel(snake_str):
    components = snake_str.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])

def convert_dict_to_camel_case(data):
    if isinstance(data, list):
        return [convert_dict_to_camel_case(i) for i in data]
    elif isinstance(data, dict):
        new_dict = {}
        for k, v in data.items():
            new_key = snake_to_camel(k)
            new_dict[new_key] = convert_dict_to_camel_case(v)
        return new_dict
    else:
        return data

import google.generativeai as genai
print('version', genai.__version__)
print('has responses', hasattr(genai, 'responses'))
print('has GenerativeModel', hasattr(genai, 'GenerativeModel'))
print('has TextModel', hasattr(genai, 'TextModel'))
print('has configure', hasattr(genai, 'configure'))
print('attrs', [n for n in dir(genai) if n in ('responses', 'GenerativeModel', 'TextModel', 'configure', 'list_models', 'generate')])
print('Gen methods', [n for n in dir(genai.GenerativeModel) if not n.startswith('_')])

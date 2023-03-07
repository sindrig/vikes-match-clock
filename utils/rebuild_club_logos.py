import glob
import os
import re

replacer = re.compile(r'[ -\.]')
# replacer = re.compile(r'[^A-Za-z0-9]')

BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src', 'images')
def sanitize(s):
    f, _ = os.path.splitext(s)
    # return f.replace(' ', '')
    return replacer.sub('', f).lower()

def main(outfile='clubLogos.js', image_locs='club-logos' ):
    importnames = []
    image_folder = os.path.join(BASE, image_locs)
    with open(os.path.join(BASE, outfile), 'w') as f:
        for fn in glob.glob(os.path.join(image_folder, '*')):
            relfn = os.path.relpath(fn, BASE)
            importname = sanitize(os.path.basename(fn))
            f.write(f'import {{ default as {importname} }} from "./{relfn}";\n')
            importnames.append(importname)
        f.write(f'\nexport default {{\n')
        for n in sorted(importnames):
            f.write(f'  {n},\n')
        f.write('}\n')
if __name__ == '__main__':
    main()